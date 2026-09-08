import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { catalogURL, readCodexCatalog } from './catalog.js'
import { createCliProxyApiProvider, toPiModel } from './provider.js'
import {
  BASE_URL_FIELD,
  DEFAULT_SPEED_MODE,
  DEFAULT_WEB_SEARCH,
  MODELS_FIELD,
  SETTINGS_NAMESPACE,
  SPEED_MODE_FAST,
  SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD,
  WEB_SEARCH_FIELD,
  normalizeBaseURL,
  normalizeModelFilter,
  normalizeSpeedMode,
  normalizeWebSearch,
} from './settings-contract.js'

const MAX_CATALOG_BYTES = 4 * 1024 * 1024
const LEGACY_PI_NS = 'llm-pi-ai'
const API_KEY_REF = credentialRef('DSH_CLIPROXY_API_KEY')
const PROVIDER = 'CLIProxyAPI'
const NO_MODELS = new Set()

export const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'

export const name = 'llm-cliproxyapi'
export const inject = ['settings', 'credentials', 'llm', 'timer']

export const Config = z.object({
  defaultContextWindow: z.number().step(1).min(1).default(262144),
  defaultMaxTokens: z.number().step(1).min(1).default(32768),
  defaultInput: z.array(z.union(['text', 'image'])).default(['text']),
  headers: z.dict(z.string()).default({}),
  fetchTimeoutMs: z.number().step(1).min(1).default(15000),
  retryInitialMs: z.number().step(1).min(1).default(3000),
  retryMaxMs: z.number().step(1).min(1).default(60000),
  refreshIntervalMs: z.number().step(1).min(0).default(300000),
  includeHiddenModels: z.boolean().default(false),
})

// Route defaults mirrored from llm-pi-ai's resolved profile; custom PiAiAdapter
// profiles bypass its settings-backed resolver, so every value it would
// default for a declared route must be complete here.
const STREAM_IDLE_TIMEOUT_MS = 300000
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

function headerKey(headers, expected) {
  const normalized = expected.toLowerCase()
  return Object.keys(headers ?? {}).find((key) => key.toLowerCase() === normalized)
}

function profileHeadersOf(configuredHeaders, hasApiKey) {
  const headers = { ...configuredHeaders }
  const authorization = headerKey(headers, 'authorization')
  if (hasApiKey) {
    if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
      delete headers[authorization]
    }
  } else if (authorization === undefined) {
    headers.authorization = PLACEHOLDER_AUTHORIZATION
  }
  return headers
}

/** Headers for catalog fetches: a stored key authenticates, the placeholder never leaves. */
function catalogHeadersOf(configuredHeaders, apiKey) {
  const headers = { ...configuredHeaders }
  const authorization = headerKey(headers, 'authorization')
  if (apiKey !== undefined) {
    if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
      delete headers[authorization]
    }
    headers.authorization = `Bearer ${apiKey}`
  } else if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
    delete headers[authorization]
  }
  return headers
}

async function optionalApiKey(ctx, supplied) {
  const raw = supplied === undefined
    ? (await ctx.credentials.resolve(API_KEY_REF))?.value
    : supplied
  const key = typeof raw === 'string' ? raw.trim() : ''
  if (!key) return undefined
  return assertUsableApiKey(key, name, API_KEY_REF)
}

async function fetchCatalog(request, config, signal) {
  const baseURL = normalizeBaseURL(request.baseURL)
  if (!baseURL) throw new TypeError('CLIProxyAPI baseURL must not be empty')
  const apiKey = await request.resolveApiKey()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('CLIProxyAPI catalog request timed out')), config.fetchTimeoutMs)
  const fetchSignal = signal === undefined ? controller.signal : AbortSignal.any([controller.signal, signal])
  let response
  try {
    response = await fetch(catalogURL(baseURL), {
      headers: { accept: 'application/json', ...catalogHeadersOf(config.headers, apiKey) },
      signal: fetchSignal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`CLIProxyAPI catalog request failed (HTTP ${response.status})`)
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES) {
    throw new Error('CLIProxyAPI model catalog exceeds the 4 MiB limit')
  }
  const text = await response.text()
  if (text.length > MAX_CATALOG_BYTES) throw new Error('CLIProxyAPI model catalog exceeds the 4 MiB limit')
  let body
  try {
    body = JSON.parse(text)
  } catch (error) {
    throw new Error('CLIProxyAPI model catalog is not valid JSON', { cause: error })
  }
  return readCodexCatalog(body, {
    defaultContextWindow: config.defaultContextWindow,
    defaultMaxTokens: config.defaultMaxTokens,
    defaultInput: config.defaultInput,
    includeHiddenModels: config.includeHiddenModels,
  })
}

/** pi-ai keeps nothing in this store: the route authenticates per request. */
const emptyCredentialStore = Object.freeze({
  read: () => Promise.resolve(undefined),
  list: () => Promise.resolve([]),
  modify: () => Promise.resolve(undefined),
  delete: () => Promise.resolve(),
})

const emptyAuthContext = Object.freeze({
  env: () => Promise.resolve(undefined),
  fileExists: () => Promise.resolve(false),
})

export function apply(ctx, config) {
  const settings = ctx.settings.register(SETTINGS_NAMESPACE, z.object({
    [BASE_URL_FIELD]: z.string(),
    [SPEED_MODE_FIELD]: z.union([SPEED_MODE_STANDARD, SPEED_MODE_FAST]).default(DEFAULT_SPEED_MODE),
    [WEB_SEARCH_FIELD]: z.boolean().default(DEFAULT_WEB_SEARCH),
    [MODELS_FIELD]: z.array(z.string()).default([]),
  }))

  let catalog
  let catalogRevision = 0
  let profileKey
  let profileSnapshot = new Map()
  let hasStoredKey = false
  let registration
  let registrationPending = false

  const configuredBaseURL = () => normalizeBaseURL(settings.get()?.[BASE_URL_FIELD])

  // Read lazily per dispatch: a preference change needs no profile rebuild.
  const preferences = () => ({
    speedMode: normalizeSpeedMode(settings.get()?.[SPEED_MODE_FIELD]),
    webSearch: normalizeWebSearch(settings.get()?.[WEB_SEARCH_FIELD]),
    fastModelIds: catalog?.fastModelIds ?? NO_MODELS,
    searchModelIds: catalog?.searchModelIds ?? NO_MODELS,
  })

  const adapter = new PiAiAdapter({
    profiles: () => profiles(),
    // Keyless deployments stay "configured": pi-ai falls back to the route's
    // placeholder Authorization header when no request credential resolves.
    resolveApiKey: () => optionalApiKey(ctx),
    auth: Object.freeze({ credentials: emptyCredentialStore, authContext: emptyAuthContext }),
    resolveAttachments: () => ctx.get?.('attachments'),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(`llm-cliproxyapi: unusable replay state on assistant history for route "${provider}/${model}"; sending that message as provider-neutral content (${reason})`)
    },
  })

  function profiles() {
    const baseURL = configuredBaseURL()
    if (baseURL === undefined || catalog === undefined) {
      profileKey = undefined
      if (profileSnapshot.size !== 0) profileSnapshot = new Map()
      return profileSnapshot
    }
    const headers = profileHeadersOf(config.headers, hasStoredKey)
    // The model whitelist needs no catalog refetch: it rides the profile key
    // so the next adapter operation rebuilds on the changed selection.
    const filter = normalizeModelFilter(settings.get()?.[MODELS_FIELD])
    const key = JSON.stringify([baseURL, catalogRevision, headers, filter])
    if (key === profileKey) return profileSnapshot
    const allowed = new Set(filter)
    const listed = allowed.size === 0
      ? catalog.models
      : catalog.models.filter((model) => allowed.has(model.id))
    const piModels = listed.map((model) => toPiModel(model, baseURL, PROVIDER))
    profileKey = key
    profileSnapshot = new Map([[PROVIDER, Object.freeze({
      provider: PROVIDER,
      displayName: PROVIDER,
      headers,
      piProvider: createCliProxyApiProvider({
        id: PROVIDER,
        name: PROVIDER,
        baseURL,
        models: piModels,
        resolvePreferences: preferences,
      }),
      configuredMaxTokens: new Map(),
      streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
      maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
      requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
      requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
      // pi-ai owns prompt_cache_key and encrypted reasoning replay; explicit
      // values keep the proxy cache contract auditable. SSE avoids pooled
      // WebSocket reuse across credential changes.
      cacheRetention: 'short',
      transport: 'sse',
    })]])
    return profileSnapshot
  }

  function ensureRegistration() {
    const routes = configuredBaseURL() === undefined || catalog === undefined ? [] : [PROVIDER]
    try {
      if (registration === undefined) {
        if (routes.length === 0) return
        registration = ctx.llm.registerAdapter(routes, adapter)
      } else {
        registration.replace(routes)
      }
      registrationPending = false
    } catch (error) {
      // The route can still be held by a legacy llm-pi-ai profile mid-removal;
      // the next adapters-updated event retries the takeover.
      if (error?.code !== 'DUPLICATE_ADAPTER') throw error
      registrationPending = true
    }
  }
  ctx.on('llm/adapters-updated', () => {
    // A legacy llm-pi-ai profile claims the route as soon as that plugin reads
    // it; topology changes are the signal that the namespace became readable
    // or that the route was released after migration.
    void migrateLegacyProfile()
    if (registrationPending) ensureRegistration()
  })

  ctx.llm.registerModelDiscovery(SETTINGS_NAMESPACE, (request, signal) => fetchCatalog({
    baseURL: request.baseURL,
    resolveApiKey: () => optionalApiKey(ctx, request.apiKey),
  }, config, signal).then((result) => result.models))

  let stopped = false
  let running = false
  let rerun = false
  let wakeDispose
  let activeController

  const cancelWake = () => {
    wakeDispose?.()
    wakeDispose = undefined
  }

  const schedule = ({ delay, authOnly = false } = {}) => {
    if (stopped) return
    cancelWake()
    if (delay !== undefined) {
      wakeDispose = ctx.timeout(() => {
        wakeDispose = undefined
        void drain()
      }, delay)
      return
    }
    if (authOnly && catalog !== undefined) {
      // A credential change only rewrites the Authorization story: rebuild the
      // profile from the cached catalog without hitting the network.
      void (async () => {
        hasStoredKey = (await optionalApiKey(ctx)) !== undefined
        profiles()
      })()
      return
    }
    void drain()
  }

  const drain = async () => {
    if (running) {
      rerun = true
      return
    }
    running = true
    let delay
    try {
      do {
        rerun = false
        if (stopped) return
        const baseURL = configuredBaseURL()
        if (baseURL === undefined) {
          catalog = undefined
          catalogRevision += 1
          profiles()
          ensureRegistration()
          delay = undefined
          continue
        }
        activeController = new AbortController()
        try {
          const result = await fetchCatalog({
            baseURL,
            resolveApiKey: () => optionalApiKey(ctx),
          }, config, activeController.signal)
          hasStoredKey = (await optionalApiKey(ctx)) !== undefined
          catalog = {
            models: result.models,
            fastModelIds: new Set([...result.capabilities].filter(([, c]) => c.fast).map(([id]) => id)),
            searchModelIds: new Set([...result.capabilities].filter(([, c]) => c.search).map(([id]) => id)),
          }
          catalogRevision += 1
          profiles()
          ensureRegistration()
          delay = config.refreshIntervalMs > 0 ? config.refreshIntervalMs : undefined
          ctx.logger.info(`llm-cliproxyapi: synchronized ${catalog.models.length} models from ${baseURL}`)
        } catch (error) {
          if (stopped) return
          ctx.logger.warn(`llm-cliproxyapi: catalog refresh failed: ${error?.message ?? error}`)
          delay = Math.min(config.retryMaxMs, Math.max(config.retryInitialMs, delay === undefined ? config.retryInitialMs : delay * 2))
        } finally {
          activeController = undefined
        }
      } while (rerun)
    } finally {
      running = false
      if (!stopped && delay !== undefined) schedule({ delay })
    }
  }

  // Migrate a profile written by versions that delegated the route to
  // llm-pi-ai: copy its baseURL into this namespace, then release the route.
  // The legacy namespace may not be registered yet at boot (plugin order is
  // not guaranteed), so migration is re-attempted on every topology or legacy
  // settings change; it is a no-op once no legacy profile remains.
  let migrating = false
  const migrateLegacyProfile = async () => {
    if (migrating) return
    const legacy = ctx.settings.get(LEGACY_PI_NS)?.providers?.[PROVIDER]
    if (legacy === undefined) return
    migrating = true
    try {
      if (configuredBaseURL() === undefined) {
        const baseURL = normalizeBaseURL(legacy.baseURL)
        if (baseURL !== undefined) await settings.update({ [BASE_URL_FIELD]: baseURL })
      }
      await ctx.settings.mutate(LEGACY_PI_NS, [{ op: 'unset', path: ['providers', PROVIDER] }])
      ctx.logger.info('llm-cliproxyapi: migrated the CLIProxyAPI route off the llm-pi-ai profile')
    } catch (error) {
      ctx.logger.warn(`llm-cliproxyapi: legacy profile migration failed: ${error?.message ?? error}`)
    } finally {
      migrating = false
    }
  }

  ctx.effect(() => settings.watch((next, prev) => {
    // Preferences are read per dispatch; only a connection change resyncs.
    if (normalizeBaseURL(next?.[BASE_URL_FIELD]) !== normalizeBaseURL(prev?.[BASE_URL_FIELD])) schedule()
  }), 'llm-cliproxyapi: settings watch')
  ctx.on('settings/updated', (ns) => {
    if (ns === LEGACY_PI_NS) void migrateLegacyProfile()
  })
  ctx.on('credentials/reference-updated', (ref) => {
    if (ref === API_KEY_REF) schedule({ authOnly: true })
  })
  ctx.effect(() => () => {
    stopped = true
    cancelWake()
    activeController?.abort(new Error('CLIProxyAPI provider plugin disposed'))
  })

  void migrateLegacyProfile().finally(() => schedule())
}
