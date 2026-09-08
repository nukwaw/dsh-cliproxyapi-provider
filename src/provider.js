// The pi-ai provider behind the CLIProxyAPI route. Dispatch stays with pi-ai's
// own openai-responses implementation; this module only materializes catalog
// models into pi-ai's vocabulary and installs the request-payload preferences
// (Fast mode, server-side web search) that a settings document cannot express.

import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { SPEED_MODE_FAST } from './settings-contract.js'

export const CLI_PROXY_API = 'openai-responses'

const NO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const FAST_SERVICE_TIER = 'priority'
const WEB_SEARCH_TOOL = Object.freeze({ type: 'web_search' })

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * Materialize one catalog profile into a pi-ai model. Reasoning follows
 * llm-pi-ai's contract: declared levels carry their wire spelling, undeclared
 * levels are pinned to null so pi-ai never assumes support the catalog did
 * not advertise, and a valueless `off` stays absent ("supported, send nothing").
 */
export function toPiModel(profile, baseURL, providerId) {
  const model = {
    id: profile.id,
    name: profile.name ?? profile.id,
    api: CLI_PROXY_API,
    provider: providerId,
    baseUrl: baseURL,
    reasoning: false,
    input: [...(profile.input ?? ['text'])],
    cost: { ...NO_COST },
    contextWindow: profile.contextWindow,
    maxTokens: profile.maxTokens,
  }
  const efforts = profile.reasoningEfforts
  if (efforts && Object.keys(efforts).length > 0) {
    const map = {}
    for (const level of THINKING_LEVELS) {
      const wire = efforts[level]
      if (wire === undefined) map[level] = null
      else if (wire !== null) map[level] = wire
    }
    model.reasoning = true
    model.thinkingLevelMap = map
  }
  return model
}

function withFastTier(payload) {
  return { ...payload, service_tier: FAST_SERVICE_TIER }
}

function withWebSearchTool(payload) {
  const tools = Array.isArray(payload.tools) ? payload.tools : []
  const declared = tools.some((tool) => typeof tool?.type === 'string' && tool.type.startsWith('web_search'))
  return { ...payload, tools: [...tools, ...(declared ? [] : [WEB_SEARCH_TOOL])] }
}

/**
 * pi-ai's native request interception: Fast mode and server-side web search are
 * payload concerns decided per dispatch, so they ride `onPayload` rather than
 * model declarations. Ours are applied before the caller's hook and re-asserted
 * after it, so a later extension keeps final control of everything else while
 * an explicit user preference cannot be silently dropped.
 *
 * Exported for tests and for composition by other plugins.
 */
export function withPreferences(model, options, resolvePreferences) {
  const prefs = resolvePreferences()
  const fast = prefs.speedMode === SPEED_MODE_FAST && prefs.fastModelIds.has(model?.id)
  const search = prefs.webSearch === true && prefs.searchModelIds.has(model?.id)
  if (!fast && !search) return options
  const onPayload = options?.onPayload
  return {
    ...options,
    ...(fast ? { serviceTier: FAST_SERVICE_TIER } : {}),
    async onPayload(payload, requestModel) {
      let preferred = payload
      if (search) preferred = withWebSearchTool(preferred)
      if (fast) preferred = withFastTier(preferred)
      const caller = await onPayload?.(preferred, requestModel)
      let next = caller === undefined ? preferred : caller
      if (search) next = withWebSearchTool(next)
      if (fast) next = withFastTier(next)
      return next
    },
  }
}

/**
 * Build the pi-ai provider for the CLIProxyAPI route. Auth mirrors llm-pi-ai's
 * harness-managed api-key method: the request-level credential the adapter
 * resolves wins, and a keyless deployment is still "configured" — the route's
 * placeholder Authorization header is what the upstream actually sees.
 */
export function createCliProxyApiProvider({ id, name, baseURL, models, resolvePreferences }) {
  const streams = openAIResponsesApi()
  const wrap = (dispatch) => (model, context, options) =>
    dispatch(model, context, withPreferences(model, options, resolvePreferences))
  return Object.freeze({
    id,
    name,
    baseUrl: baseURL,
    auth: Object.freeze({
      apiKey: Object.freeze({
        name: 'DSH-managed CLIProxyAPI request key',
        resolve: ({ credential }) => Promise.resolve({
          auth: credential?.type === 'api_key' && credential.key ? { apiKey: credential.key } : {},
          source: 'DSH-managed CLIProxyAPI request',
        }),
      }),
    }),
    getModels: () => models,
    stream: wrap(streams.stream),
    streamSimple: wrap(streams.streamSimple),
  })
}
