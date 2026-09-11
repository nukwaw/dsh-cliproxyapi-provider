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
    compat: { supportsStrictMode: true },
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

test('native search replaces only the DSH search function without mutating tools or history', async () => {
  const wrapped = withPreferences({ id: PROFILE.id }, {}, prefs({ searchModelIds: [PROFILE.id] }))
  const payload = {
    instructions: 'Preserve these provider instructions.',
    tools: [
      { type: 'function', name: 'web_search', parameters: { type: 'object' }, strict: false },
      { type: 'function', name: 'web_fetch', strict: false },
      { type: 'function', name: 'bash', strict: false },
      { type: 'function', name: 'other_web_search', strict: false },
    ],
    input: [
      { role: 'developer', content: 'Use the web_search tool with queries.' },
      { type: 'function_call', name: 'web_search', call_id: 'call_search', arguments: '{"queries":["test"]}' },
      { type: 'function_call_output', call_id: 'call_search', output: 'WEB_PROVIDER_CREDENTIAL_MISSING' },
    ],
  }
  const before = structuredClone(payload)
  const result = await wrapped.onPayload(payload)
  assert.deepEqual(result.tools, [...before.tools.slice(1), { type: 'web_search' }])
  assert.deepEqual(result.input[0], before.input[0])
  assert.deepEqual(result.input.slice(2), before.input.slice(1), 'old function calls and their outputs must remain paired')
  assert.equal(result.instructions, payload.instructions)
  assert.equal(result.input[1].role, 'developer')
  assert.match(result.input[1].content, /native web_search/)
  assert.match(result.input[1].content, /functions\.web_search/)
  assert.match(result.input[1].content, /queries/)
  assert.deepEqual(payload, before)
  assert.deepEqual(await wrapped.onPayload(result), result, 'routing must be idempotent')
})

test('reasoning models route page retrieval upstream as well as search', async () => {
  const wrapped = withPreferences({ id: PROFILE.id, reasoning: true }, {}, prefs({ searchModelIds: [PROFILE.id] }))
  for (const tools of [
    [{ type: 'function', name: 'web_fetch' }],
    [{ type: 'function', name: 'web_search' }, { type: 'function', name: 'web_fetch' }],
  ]) {
    const payload = {
      tools: [...tools, { type: 'function', name: 'bash' }, { type: 'function', name: 'other_web_fetch' }],
      input: [
        { role: 'developer', content: 'Use web_search and then web_fetch.' },
        { type: 'function_call', name: 'web_fetch', call_id: 'fetch', arguments: '{"url":"https://developers.binance.com"}' },
        { type: 'function_call_output', call_id: 'fetch', output: 'WEB_BLOCKED_URL: non-public IP address' },
      ],
      tool_choice: { type: 'function', name: 'web_fetch' },
    }
    const before = structuredClone(payload)
    const result = await wrapped.onPayload(payload)
    assert.deepEqual(result.tools, [...payload.tools.slice(tools.length), { type: 'web_search' }])
    assert.match(result.input[1].content, /native web_search/)
    assert.match(result.input[1].content, /functions\.web_fetch/)
    assert.match(result.input[1].content, /open_page/)
    assert.match(result.input[1].content, /untrusted/)
    assert.deepEqual(result.input.slice(2), payload.input.slice(1))
    assert.deepEqual(result.tool_choice, { type: 'web_search' })
    assert.deepEqual(payload, before)
    assert.deepEqual(await wrapped.onPayload(result), result)
  }
})

test('search routing preserves instruction prefixes and caller-supplied string input', async () => {
  const wrapped = withPreferences({ id: PROFILE.id }, {}, prefs({ searchModelIds: [PROFILE.id] }))
  const tools = [{ type: 'function', name: 'web_search' }]
  const prefix = [{ role: 'system', content: 'System policy.' }, { role: 'developer', content: 'Harness tools.' }]
  const user = { role: 'user', content: 'Search for this.' }
  const result = await wrapped.onPayload({ tools, input: [...prefix, user] })
  assert.deepEqual(result.input.slice(0, 2), prefix)
  assert.equal(result.input[2].role, 'developer')
  assert.deepEqual(result.input[3], user)
  assert.deepEqual((await wrapped.onPayload({ tools, input: 'Search for this.' })).input[1], user)
  const systemOnly = await wrapped.onPayload({ tools, input: [prefix[0], user] })
  assert.equal(systemOnly.input[1].role, 'system')
})

test('native search translates a forced local search choice and retains native tool options', async () => {
  const wrapped = withPreferences({ id: PROFILE.id }, {}, prefs({ searchModelIds: [PROFILE.id] }))
  for (const type of ['web_search', 'web_search_preview']) {
    const native = { type, search_context_size: 'low' }
    const result = await wrapped.onPayload({
      tools: [{ type: 'function', name: 'web_search' }, native],
      tool_choice: { type: 'function', name: 'web_search' },
    })
    assert.deepEqual(result.tools, [native])
    assert.deepEqual(result.tool_choice, { type })
  }
  for (const choice of ['auto', 'none', 'required', { type: 'function', name: 'bash' }]) {
    const result = await wrapped.onPayload({ tools: [{ type: 'function', name: 'web_search' }], tool_choice: choice })
    assert.deepEqual(result.tool_choice, choice, 'unrelated tool-choice constraints must survive')
  }
})

test('native browsing remaps removed functions in allowed tool choices without widening the allowlist', async () => {
  const wrapped = withPreferences({ id: PROFILE.id, reasoning: true }, {}, prefs({ searchModelIds: [PROFILE.id] }))
  const bash = { type: 'function', name: 'bash' }
  const payload = {
    tools: [{ type: 'function', name: 'web_search' }, { type: 'function', name: 'web_fetch' }, bash],
    tool_choice: { type: 'allowed_tools', mode: 'required', tools: [
      { type: 'function', name: 'web_search' }, { type: 'function', name: 'web_fetch' }, bash,
    ] },
  }
  const before = structuredClone(payload)
  const result = await wrapped.onPayload(payload)
  assert.deepEqual(result.tool_choice, { type: 'allowed_tools', mode: 'required', tools: [{ type: 'web_search' }, bash] })
  assert.deepEqual(payload, before)
  const unrelated = { type: 'allowed_tools', mode: 'auto', tools: [bash] }
  assert.deepEqual((await wrapped.onPayload({ ...payload, tool_choice: unrelated })).tool_choice, unrelated)
})

test('caller hooks cannot restore the conflicting function or drop search routing guidance', async () => {
  const local = { type: 'function', name: 'web_search' }
  for (const originalTools of [[], [local]]) {
    for (const returnedTools of [[], [local]]) {
      let seen
      const wrapped = withPreferences({ id: PROFILE.id }, {
        onPayload: (payload) => {
          seen = structuredClone(payload)
          // A caller may rebuild both fields rather than mutate the input.
          return { ...payload, tools: returnedTools, input: [{ role: 'developer', content: 'Caller instructions.' }], store: false }
        },
      }, prefs({ searchModelIds: [PROFILE.id] }))
      const result = await wrapped.onPayload({ tools: originalTools })
      assert.deepEqual(seen.tools, [{ type: 'web_search' }])
      assert.deepEqual(result.tools, [{ type: 'web_search' }])
      assert.equal(result.store, false)
      assert.deepEqual(result.input[0], { role: 'developer', content: 'Caller instructions.' })
      if (originalTools.length || returnedTools.length) assert.match(result.input[1].content, /native web_search/)
      else assert.equal(result.input.length, 1, 'no extra routing context without a conflicting function')
    }
  }
})

test('caller changes to the native variant keep forced and allowed search choices valid', async () => {
  for (const tool_choice of [
    { type: 'function', name: 'web_search' },
    { type: 'allowed_tools', mode: 'required', tools: [{ type: 'function', name: 'web_fetch' }] },
  ]) {
    const wrapped = withPreferences({ id: PROFILE.id, reasoning: true }, {
      onPayload: (payload) => ({ ...payload, tools: [{ type: 'web_search_preview', search_context_size: 'low' }] }),
    }, prefs({ searchModelIds: [PROFILE.id] }))
    const result = await wrapped.onPayload({ tool_choice })
    assert.deepEqual(result.tool_choice, tool_choice.type === 'allowed_tools'
      ? { type: 'allowed_tools', mode: 'required', tools: [{ type: 'web_search_preview' }] }
      : { type: 'web_search_preview' })
  }
})

test('in-place hooks cannot restore local web tools or put stale guidance after the routing note', async () => {
  const original = { tools: [{ type: 'function', name: 'web_fetch' }], input: [{ role: 'system', content: 'Harness instructions.' }] }
  const before = structuredClone(original)
  const wrapped = withPreferences({ id: PROFILE.id, reasoning: true }, {
    onPayload: (payload) => {
      payload.tools.push({ type: 'function', name: 'web_fetch' })
      payload.input.push({ role: 'developer', content: 'Use web_fetch for every page.' })
      // Duplicate the plugin note, too: final normalization must keep one copy.
      payload.input.unshift(payload.input[1])
    },
  }, prefs({ searchModelIds: [PROFILE.id] }))
  const result = await wrapped.onPayload(original)
  assert.deepEqual(result.tools, [{ type: 'web_search' }])
  assert.equal(result.input.length, 3)
  assert.equal(result.input[0].content, 'Harness instructions.')
  assert.equal(result.input[1].content, 'Use web_fetch for every page.')
  assert.match(result.input[2].content, /native web_search/)
  assert.equal(result.input[2].role, 'developer')
  assert.deepEqual(original, before)
})

test('native browsing preserves qualified names and unrelated namespace tools', async () => {
  const wrapped = withPreferences({ id: PROFILE.id, reasoning: true }, {}, prefs({ searchModelIds: [PROFILE.id] }))
  const unrelated = [
    { type: 'function', name: 'functions.web_search' },
    { type: 'function', name: 'web_fetch', namespace: 'custom' },
    { type: 'namespace', name: 'custom', tools: [{ type: 'function', name: 'web_search' }] },
  ]
  const result = await wrapped.onPayload({ tools: [{ type: 'function', name: 'web_search' }, ...unrelated] })
  assert.deepEqual(result.tools, [...unrelated, { type: 'web_search' }])
})

test('disabled or unsupported search preserves the local search function, instructions, and choice', async () => {
  const payload = {
    tools: [{ type: 'function', name: 'web_search' }, { type: 'function', name: 'web_fetch' }],
    instructions: 'Use web_search.',
    tool_choice: { type: 'function', name: 'web_search' },
  }
  for (const settings of [
    { webSearch: false, searchModelIds: [PROFILE.id] },
    { webSearch: true, searchModelIds: [] },
  ]) {
    let called = false
    const onPayload = (input) => { called = true; return input }
    // Fast mode exercises the payload hook even though search is disabled.
    const wrapped = withPreferences({ id: PROFILE.id }, { onPayload }, prefs({
      ...settings, speedMode: 'fast', fastModelIds: [PROFILE.id],
    }))
    assert.deepEqual(await wrapped.onPayload(payload), { ...payload, service_tier: 'priority' })
    assert.equal(called, true)
  }
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
