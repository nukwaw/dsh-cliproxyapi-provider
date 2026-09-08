// Shared preference contract between the server plugin and the browser client.
// The namespace owns everything the CLIProxyAPI route needs; the provider route
// itself is served by this plugin's own adapter, not by an llm-pi-ai profile.

export const SETTINGS_NAMESPACE = 'llm-cliproxyapi'

export const BASE_URL_FIELD = 'baseURL'
export const SPEED_MODE_FIELD = 'speedMode'
export const WEB_SEARCH_FIELD = 'webSearch'

export const SPEED_MODE_STANDARD = 'standard'
export const SPEED_MODE_FAST = 'fast'
export const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD

export const DEFAULT_WEB_SEARCH = true

export const normalizeSpeedMode = (value) =>
  [SPEED_MODE_STANDARD, SPEED_MODE_FAST].includes(value) ? value : DEFAULT_SPEED_MODE

export const normalizeWebSearch = (value) =>
  typeof value === 'boolean' ? value : DEFAULT_WEB_SEARCH

export const normalizeBaseURL = (value) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed || undefined
}
