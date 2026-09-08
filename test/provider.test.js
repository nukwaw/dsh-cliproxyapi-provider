import test from 'node:test'
import assert from 'node:assert/strict'
import { createCliProxyApiProvider, toPiModel, withPreferences } from '../src/provider.js'

const PROFILE = {
  id: 'gpt-5.6-sol',
  name: 'GPT 5.6 Sol',
  contextWindow: 372000,
  maxTokens: 32768,
  input: ['text', 'image'],
  reasoningEfforts: { low: 'low', high: 'high' },
}

test('materializes a catalog profile into a pi-ai model', () => {
  assert.deepEqual(toPiModel(PROFILE, 'http://127.0.0.1:8317/v1', 'CLIProxyAPI'), {
    id: 'gpt-5.6-sol',
    name: 'GPT 5.6 Sol',
    api: 'openai-responses',
    provider: 'CLIProxyAPI',
    baseUrl: 'http://127.0.0.1:8317/v1',
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: null },
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 372000,
    maxTokens: 32768,
  })
})

test('keeps a valueless off effort out of the wire map', () => {
  const model = toPiModel({ ...PROFILE, reasoningEfforts: { off: null, medium: 'medium' } }, 'http://x/v1', 'CLIProxyAPI')
  assert.deepEqual(model.thinkingLevelMap, { minimal: null, low: null, medium: 'medium', high: null, xhigh: null, max: null })
  assert.equal('off' in model.thinkingLevelMap, false)
})

test('leaves reasoning unset when the catalog declares no efforts', () => {
  const model = toPiModel({ id: 'plain', name: 'plain', contextWindow: 1, maxTokens: 1, input: ['text'] }, 'http://x/v1', 'CLIProxyAPI')
  assert.equal(model.reasoning, false)
  assert.equal(model.thinkingLevelMap, undefined)
})

const prefs = ({ speedMode = 'standard', webSearch = true, fastModelIds = [], searchModelIds = [] } = {}) => () => ({
  speedMode,
  webSearch,
  fastModelIds: new Set(fastModelIds),
  searchModelIds: new Set(searchModelIds),
})

test('returns options untouched when no preference applies', () => {
  const options = { reasoningEffort: 'high' }
  assert.equal(withPreferences({ id: 'gpt-5.6-sol' }, options, prefs()), options)
  assert.equal(withPreferences({ id: 'kimi-for-coding' }, options, prefs({
    speedMode: 'fast', fastModelIds: ['gpt-5.6-sol'], searchModelIds: [],
  })), options)
})

test('fast mode sets the serviceTier option and asserts service_tier on the payload', async () => {
  const wrapped = withPreferences({ id: 'gpt-5.6-sol' }, { reasoningEffort: 'low' }, prefs({
    speedMode: 'fast', fastModelIds: ['gpt-5.6-sol'],
  }))
  assert.equal(wrapped.serviceTier, 'priority')
  assert.equal(wrapped.reasoningEffort, 'low')
  assert.deepEqual(await wrapped.onPayload({ model: 'gpt-5.6-sol', input: [] }), {
    model: 'gpt-5.6-sol',
    input: [],
    service_tier: 'priority',
  })
})

test('standard mode never touches service_tier', () => {
  const options = {}
  const wrapped = withPreferences({ id: 'gpt-5.6-sol' }, options, prefs({
    speedMode: 'standard', fastModelIds: ['gpt-5.6-sol'],
  }))
  assert.equal(wrapped, options)
})

test('web search appends the builtin tool and never duplicates it', async () => {
  const wrapped = withPreferences({ id: 'gpt-5.6-sol' }, {}, prefs({
    searchModelIds: ['gpt-5.6-sol'],
  }))
  assert.deepEqual(await wrapped.onPayload({ model: 'gpt-5.6-sol' }), {
    model: 'gpt-5.6-sol',
    tools: [{ type: 'web_search' }],
  })
  const withTools = await wrapped.onPayload({ tools: [{ type: 'function', name: 'exec' }] })
  assert.deepEqual(withTools.tools, [{ type: 'function', name: 'exec' }, { type: 'web_search' }])
  const already = await wrapped.onPayload({ tools: [{ type: 'web_search_preview' }] })
  assert.deepEqual(already.tools, [{ type: 'web_search_preview' }])
})

test('web search respects the opt-out and the per-model catalog signal', async () => {
  const off = withPreferences({ id: 'gpt-5.6-sol' }, {}, prefs({
    webSearch: false, searchModelIds: ['gpt-5.6-sol'],
  }))
  assert.equal(off.onPayload, undefined)
  const unlisted = withPreferences({ id: 'kimi-for-coding' }, {}, prefs({
    searchModelIds: ['gpt-5.6-sol'],
  }))
  assert.equal(unlisted.onPayload, undefined)
})

test('a caller onPayload keeps final say, but preferences are re-asserted after it', async () => {
  const calls = []
  const wrapped = withPreferences({ id: 'gpt-5.6-sol' }, {
    onPayload: (payload) => {
      calls.push(payload)
      return { ...payload, service_tier: 'default', store: false }
    },
  }, prefs({ speedMode: 'fast', fastModelIds: ['gpt-5.6-sol'], searchModelIds: ['gpt-5.6-sol'] }))
  const final = await wrapped.onPayload({ model: 'gpt-5.6-sol' })
  // The caller's hook saw the preferred payload first...
  assert.deepEqual(calls[0], {
    model: 'gpt-5.6-sol',
    tools: [{ type: 'web_search' }],
    service_tier: 'priority',
  })
  // ...and its own edits survive, except the preference fields it overrode.
  assert.deepEqual(final, {
    model: 'gpt-5.6-sol',
    tools: [{ type: 'web_search' }],
    service_tier: 'priority',
    store: false,
  })
})

test('a caller onPayload returning undefined keeps the preferred payload', async () => {
  const wrapped = withPreferences({ id: 'gpt-5.6-sol' }, { onPayload: () => undefined }, prefs({
    speedMode: 'fast', fastModelIds: ['gpt-5.6-sol'],
  }))
  assert.deepEqual(await wrapped.onPayload({ model: 'gpt-5.6-sol' }), {
    model: 'gpt-5.6-sol',
    service_tier: 'priority',
  })
})

test('provider auth resolves configured with and without a stored credential', async () => {
  const provider = createCliProxyApiProvider({
    id: 'CLIProxyAPI',
    name: 'CLIProxyAPI',
    baseURL: 'http://127.0.0.1:8317/v1',
    models: [],
    resolvePreferences: prefs(),
  })
  assert.equal(provider.baseUrl, 'http://127.0.0.1:8317/v1')
  assert.deepEqual(provider.getModels(), [])
  const keyless = await provider.auth.apiKey.resolve({ credential: undefined })
  assert.deepEqual(keyless.auth, {})
  const keyed = await provider.auth.apiKey.resolve({ credential: { type: 'api_key', key: 'sk-test' } })
  assert.deepEqual(keyed.auth, { apiKey: 'sk-test' })
})
