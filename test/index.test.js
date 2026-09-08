import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, LlmRuntime } from '@deepseek-ai/dsh-llm'
import {
  Config as PiAiConfig,
  apply as applyPiAi,
  inject as piAiInject,
  name as piAiName,
} from '@deepseek-ai/dsh-llm-pi-ai'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { Config, PLACEHOLDER_AUTHORIZATION, apply } from '../src/index.js'

async function resolvedConfig(overrides = {}) {
  const result = await Config['~standard'].validate(overrides)
  assert.equal(result.issues, undefined)
  return result.value
}

function legacyProfile(overrides = {}) {
  return {
    displayName: 'CLIProxyAPI',
    api: 'openai-responses',
    baseURL: 'http://127.0.0.1:8317/v1',
    models: [{ id: 'old', name: 'old', contextWindow: 1000, maxTokens: 100, input: ['text'] }],
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
    defaultInput: ['text'],
    headers: {},
    ...overrides,
  }
}

const CATALOG_BODY = {
  models: [
    {
      slug: 'gpt-5.6-sol',
      display_name: 'GPT 5.6 Sol',
      supported_reasoning_levels: [{ effort: 'none' }, { effort: 'high' }],
      service_tiers: [{ id: 'priority', name: 'Fast' }],
      supports_search_tool: true,
    },
    { slug: 'kimi-for-coding', display_name: 'Kimi' },
  ],
}

function createHarness({ legacyProfile: legacy } = {}) {
  const document = {
    'llm-pi-ai': legacy === undefined ? { providers: {} } : { providers: { CLIProxyAPI: legacy } },
  }

  const requests = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    for (const [key, value] of new Headers(init?.headers)) headers.set(key, value)
    if (method === 'GET' && url.includes('/models?')) {
      requests.push({ url, authorization: headers.get('authorization') })
      return new Response(JSON.stringify(CATALOG_BODY), { status: 200 })
    }
    const body = JSON.parse(init?.body ?? '{}')
    requests.push({ url, body, authorization: headers.get('authorization') })
    return new Response(JSON.stringify({ error: { message: 'intentional test response' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  return {
    document,
    requests,
    restore: () => { globalThis.fetch = previousFetch },
  }
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

async function startStack({ document, credential, pluginConfig } = {}) {
  const harness = createHarness({ legacyProfile: document?.['llm-pi-ai']?.providers?.CLIProxyAPI, credential })
  if (document !== undefined) harness.document = document

  class MemorySettings extends SettingsProvider {
    writable = true
    async load() { return structuredClone(harness.document) }
    async persist(ns, section) { harness.document[ns] = structuredClone(section) }
  }

  class MemoryCredentials extends CredentialProvider {
    async resolve() { return credential === undefined ? undefined : { value: credential } }
    async describe() { return { configured: credential !== undefined, writable: true } }
    async set() {}
    async unset() {}
  }

  class TimerService extends Service {
    constructor(ctx) {
      super(ctx, 'timer')
      ctx.mixin('timer', ['timeout'])
    }
    timeout(callback, delay) {
      return this.ctx.effect(() => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      })
    }
  }

  const ctx = new Context()
  const fibers = [ctx.plugin(LlmRuntime), ctx.plugin(MemorySettings), ctx.plugin(MemoryCredentials), ctx.plugin(TimerService)]
  await Promise.all(fibers.map((fiber) => fiber.await()))
  fibers.push(ctx.plugin({
    name: 'llm-cliproxyapi',
    inject: ['settings', 'credentials', 'llm', 'timer'],
    Config,
    apply,
  }, await resolvedConfig({ retryInitialMs: 10, retryMaxMs: 20, ...pluginConfig })))
  await fibers.at(-1).await()
  return {
    ctx,
    harness,
    async dispose() {
      harness.restore()
      for (const fiber of fibers.reverse()) await fiber.dispose().catch(() => {})
    },
  }
}

test('stays dormant until a baseURL is configured, then owns the route', async () => {
  const stack = await startStack()
  try {
    const { ctx, harness } = stack
    assert.equal(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'), false)
    assert.equal(harness.requests.length, 0)

    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' }])
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))

    const models = await ctx.llm.listModels('CLIProxyAPI')
    assert.deepEqual(models.map((model) => model.id), ['gpt-5.6-sol', 'kimi-for-coding'])
    const resolved = await ctx.llm.resolveModelInfo('CLIProxyAPI', 'gpt-5.6-sol')
    assert.deepEqual(resolved.reasoning?.efforts.map((effort) => effort.id), ['off', 'high'])
    const catalogRequest = harness.requests.find((request) => request.url.includes('/models?'))
    assert.equal(catalogRequest.authorization, null)
  } finally {
    await stack.dispose()
  }
})

// The legacy namespace is only readable once llm-pi-ai registers it, so every
// migration scenario runs with that plugin in the stack — as in real harness
// installations, where llm-pi-ai is built in.
test('migrates a legacy llm-pi-ai profile and wins the route it held', async () => {
  const stack = await startStack({
    document: {
      'llm-pi-ai': { providers: { CLIProxyAPI: legacyProfile() } },
    },
  })
  const piFiber = stack.ctx.plugin({
    name: piAiName,
    inject: piAiInject,
    Config: PiAiConfig,
    apply: applyPiAi,
  }, { providers: {} })
  await piFiber.await()
  try {
    const { ctx } = stack
    // llm-pi-ai claims the route from the legacy profile; the migration then
    // removes it and this plugin must take over once the route is released.
    await waitFor(() => ctx.settings.get('llm-pi-ai')?.providers?.CLIProxyAPI === undefined)
    assert.equal(ctx.settings.get('llm-cliproxyapi')?.baseURL, 'http://127.0.0.1:8317/v1')
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))
    const models = await ctx.llm.listModels('CLIProxyAPI')
    assert.deepEqual(models.map((model) => model.id), ['gpt-5.6-sol', 'kimi-for-coding'])
  } finally {
    await piFiber.dispose().catch(() => {})
    await stack.dispose()
  }
})

test('the model whitelist narrows the served catalog without a refetch', async () => {
  const stack = await startStack()
  try {
    const { ctx, harness } = stack
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' }])
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))
    assert.deepEqual((await ctx.llm.listModels('CLIProxyAPI')).map((model) => model.id), ['gpt-5.6-sol', 'kimi-for-coding'])
    const catalogFetches = harness.requests.filter((request) => request.url.includes('/models?')).length

    // The whitelist applies on the next adapter operation — no catalog round-trip.
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['models'], value: ['kimi-for-coding'] }])
    assert.deepEqual((await ctx.llm.listModels('CLIProxyAPI')).map((model) => model.id), ['kimi-for-coding'])
    assert.equal(harness.requests.filter((request) => request.url.includes('/models?')).length, catalogFetches)

    // Stale ids simply match nothing; clearing restores the whole catalog.
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['models'], value: ['gone-model'] }])
    assert.deepEqual(await ctx.llm.listModels('CLIProxyAPI'), [])
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['models'], value: [] }])
    assert.deepEqual((await ctx.llm.listModels('CLIProxyAPI')).map((model) => model.id), ['gpt-5.6-sol', 'kimi-for-coding'])
  } finally {
    await stack.dispose()
  }
})

test('streams through the plugin adapter with the placeholder when keyless', async () => {
  const stack = await startStack()
  try {
    const { ctx, harness } = stack
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' }])
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))

    const chunks = []
    for await (const chunk of ctx.llm.stream({
      provider: 'CLIProxyAPI',
      model: 'gpt-5.6-sol',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } })],
    })) chunks.push(chunk)

    const inference = harness.requests.find((request) => !request.url.includes('/models?'))
    assert.equal(inference.authorization, PLACEHOLDER_AUTHORIZATION)
    // webSearch defaults on and gpt-5.6-sol advertises supports_search_tool.
    assert.deepEqual(inference.body.tools, [{ type: 'web_search' }])
    assert.equal(inference.body.service_tier, undefined)
    assert.equal(chunks.at(-1)?.type, 'finish')
  } finally {
    await stack.dispose()
  }
})

test('fast mode sends service_tier priority only to catalog-flagged models', async () => {
  const stack = await startStack()
  try {
    const { ctx, harness } = stack
    await ctx.settings.mutate('llm-cliproxyapi', [
      { op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' },
      { op: 'set', path: ['speedMode'], value: 'fast' },
    ])
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))

    const streamOnce = async (model) => {
      const chunks = []
      for await (const chunk of ctx.llm.stream({
        provider: 'CLIProxyAPI',
        model,
        messages: [createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } })],
      })) chunks.push(chunk)
      return chunks
    }

    await streamOnce('gpt-5.6-sol')
    await streamOnce('kimi-for-coding')
    const inferences = harness.requests.filter((request) => !request.url.includes('/models?'))
    assert.equal(inferences[0].body.model, 'gpt-5.6-sol')
    assert.equal(inferences[0].body.service_tier, 'priority')
    assert.deepEqual(inferences[0].body.tools, [{ type: 'web_search' }])
    assert.equal(inferences[1].body.model, 'kimi-for-coding')
    assert.equal(inferences[1].body.service_tier, undefined)
    assert.equal(inferences[1].body.tools, undefined)
  } finally {
    await stack.dispose()
  }
})

test('webSearch false leaves payloads without the builtin tool', async () => {
  const stack = await startStack()
  try {
    const { ctx, harness } = stack
    await ctx.settings.mutate('llm-cliproxyapi', [
      { op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' },
      { op: 'set', path: ['webSearch'], value: false },
    ])
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))
    const chunks = []
    for await (const chunk of ctx.llm.stream({
      provider: 'CLIProxyAPI',
      model: 'gpt-5.6-sol',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } })],
    })) chunks.push(chunk)
    const inference = harness.requests.find((request) => !request.url.includes('/models?'))
    assert.equal(inference.body.tools, undefined)
  } finally {
    await stack.dispose()
  }
})

test('a stored credential authenticates catalog and inference requests', async () => {
  const stack = await startStack({ credential: 'sk-live-test' })
  try {
    const { ctx, harness } = stack
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' }])
    await waitFor(() => ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'))
    const chunks = []
    for await (const chunk of ctx.llm.stream({
      provider: 'CLIProxyAPI',
      model: 'gpt-5.6-sol',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } })],
    })) chunks.push(chunk)
    const catalogRequest = harness.requests.find((request) => request.url.includes('/models?'))
    assert.equal(catalogRequest.authorization, 'Bearer sk-live-test')
    const inference = harness.requests.find((request) => !request.url.includes('/models?'))
    assert.equal(inference.authorization, 'Bearer sk-live-test')
  } finally {
    await stack.dispose()
  }
})

test('discovery serves draft validation from the catalog', async () => {
  const stack = await startStack()
  try {
    const { ctx } = stack
    const discovered = await ctx.llm.discoverModels('llm-cliproxyapi', {
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
    })
    assert.deepEqual(discovered.map((model) => model.id), ['gpt-5.6-sol', 'kimi-for-coding'])
    // The discovery RPC boundary keeps identity fields only; capability
    // metadata lives server-side in the synced catalog.
    assert.equal(discovered[0].reasoningEfforts, undefined)
    assert.equal(discovered[0].contextWindow, 262144)
  } finally {
    await stack.dispose()
  }
})

test('catalog failures retry with backoff and leave the route unserved', async () => {
  const stack = await startStack()
  try {
    const { ctx, harness } = stack
    harness.restore()
    let attempts = 0
    globalThis.fetch = async () => {
      attempts += 1
      return new Response('boom', { status: 500 })
    }
    await ctx.settings.mutate('llm-cliproxyapi', [{ op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' }])
    await waitFor(() => attempts >= 2)
    assert.equal(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'), false)
  } finally {
    await stack.dispose()
  }
})
