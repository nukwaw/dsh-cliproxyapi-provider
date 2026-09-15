const CANONICAL_REASONING_LEVELS = new Set([
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
])

function positiveInteger(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  }
}

function nonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
}

function normalizeReasoningLevel(value) {
  const wire = nonEmptyString(value)?.toLowerCase()
  if (!wire) return undefined
  if (wire === 'none' || wire === 'off') return { canonical: 'off', wire: 'none' }
  if (wire === 'ultra') return { canonical: 'max', wire }
  if (!CANONICAL_REASONING_LEVELS.has(wire)) return undefined
  return { canonical: wire, wire }
}

export function reasoningEffortsOf(entry) {
  if (!Array.isArray(entry?.supported_reasoning_levels)) return undefined
  const efforts = {}
  for (const raw of entry.supported_reasoning_levels) {
    const normalized = normalizeReasoningLevel(typeof raw === 'string' ? raw : raw?.effort)
    if (normalized && !(normalized.canonical in efforts)) efforts[normalized.canonical] = normalized.wire
  }
  // llm-pi-ai rejects a capability map that offers only "off". Omitting the
  // field correctly describes a non-reasoning model for a hand-declared route.
  if (Object.keys(efforts).every((level) => level === 'off')) return undefined
  return Object.keys(efforts).length ? efforts : undefined
}

function inputModalitiesOf(entry, fallback) {
  if (!Array.isArray(entry?.input_modalities)) return [...fallback]
  const modalities = []
  const seen = new Set()
  for (const raw of entry.input_modalities) {
    const value = nonEmptyString(raw)?.toLowerCase()
    if ((value === 'text' || value === 'image') && !seen.has(value)) {
      seen.add(value)
      modalities.push(value)
    }
  }
  return modalities.length ? modalities : [...fallback]
}

// CLIProxyAPI's Codex translators forward `service_tier` only when it is
// exactly "priority"; a catalog entry advertising any service tier accepts the
// fast dispatch.
//
// Native web search has two catalog signals. Since 7.3.1 the proxy resolves an
// explicit per-model verdict across every route that can serve the model and
// exposes it — for the `cpa` client identity only — as
// `cpa_capabilities.web_search`: true, false, or absent ("the proxy has no
// verified answer"). Older proxies, and models the proxy has no metadata for,
// carry the legacy `supports_search_tool` Codex flag instead: true only for a
// codex client template served exclusively by the codex provider.
//
// `browsing` marks the OpenAI/Codex hosted search family, the only one whose
// tool action set includes open_page/find_in_page, so page retrieval may be
// routed upstream for it. xAI's web_search browses pages inside the search call
// but has no such actions, and Anthropic's is query-only.
export function capabilitiesOf(entry) {
  const declared = entry?.cpa_capabilities?.web_search
  const explicit = typeof declared === 'boolean' ? declared : undefined
  const legacy = entry?.supports_search_tool === true
  const search = explicit === undefined ? legacy : explicit
  return {
    fast: Array.isArray(entry?.service_tiers) && entry.service_tiers.length > 0,
    search,
    browsing: search && legacy,
    // undefined = the proxy published no verdict; a boolean is authoritative.
    declaredSearch: explicit,
  }
}

export function modelProfileOf(entry, options = {}) {
  const id = nonEmptyString(entry?.slug, entry?.id, entry?.model)
  if (!id || (!options.includeHiddenModels && entry?.visibility === 'hide')) return undefined
  const reasoningEfforts = reasoningEffortsOf(entry)
  return {
    id,
    name: nonEmptyString(entry?.display_name, entry?.name, entry?.description, id),
    contextWindow: positiveInteger(entry?.max_context_window, entry?.context_window, options.defaultContextWindow),
    maxTokens: positiveInteger(entry?.max_output_tokens, entry?.max_completion_tokens, entry?.max_tokens, options.defaultMaxTokens),
    input: inputModalitiesOf(entry, options.defaultInput ?? ['text']),
    ...(reasoningEfforts ? { reasoningEfforts } : {}),
  }
}

// CLIProxyAPI answers /models?client_version=cpa with the Codex catalog
// envelope ({ models: [...] }) when its Home integration is enabled, and with
// the standard OpenAI list ({ data: [...] }) otherwise; some builds answer a
// bare array. All three carry at least an id per entry, so the reader accepts
// every envelope; modelProfileOf degrades non-codex entries to plain text
// models without reasoning/fast/search capabilities.
function catalogEntriesOf(body) {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    if (Array.isArray(body.models)) return body.models
    if (Array.isArray(body.data)) return body.data
  }
  throw new TypeError('CLIProxyAPI model catalog has no usable model list')
}

export function readCodexCatalog(body, options = {}) {
  const entries = catalogEntriesOf(body)
  const models = []
  const seen = new Set()
  const capabilities = new Map()
  for (const entry of entries) {
    const model = modelProfileOf(entry, options)
    if (!model || seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
    capabilities.set(model.id, capabilitiesOf(entry))
  }
  if (!models.length) throw new TypeError('CLIProxyAPI model catalog contains no usable models')
  return { models, capabilities }
}

export function catalogURL(baseURL) {
  const base = String(baseURL ?? '').trim().replace(/\/+$/, '')
  if (!base) throw new TypeError('CLIProxyAPI baseURL must not be empty')
  // The `cpa` identity is what makes the proxy publish `cpa_capabilities.web_search`
  // (CLIProxyAPI >= 7.3.1); any other value yields the legacy Codex catalog, which
  // is also what pre-7.3.1 builds answer. Every other field is identical.
  const query = new URLSearchParams({ client_version: 'cpa' })
  return base + '/models?' + query
}
