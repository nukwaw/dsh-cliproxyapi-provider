// Manual live comparison: builtin OpenAI, this provider with search off, then on.
// Uses the same synthetic prompt/model/High effort and checks payload equality.
// Costs three model requests. It never executes returned function/tool calls.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { createCliProxyApiProvider, toPiModel } from '../src/provider.js'

const baseURL = process.env.CPA_TEST_BASE_URL ?? 'http://127.0.0.1:8317/v1'
const modelId = process.env.CPA_TEST_MODEL ?? 'gpt-6-astra'

async function resolveKey() {
  const environmentKey = process.env.DSH_CLIPROXY_API_KEY || process.env.OPENAI_API_KEY
  if (environmentKey) return { apiKey: environmentKey, dispose: async () => {} }
  if (!process.env.DSH_PACKAGE_JSON) throw new Error('Set an API key or DSH_PACKAGE_JSON to reuse the installed credential service')
  // The installed service may migrate old credential stores on initialization.
  // Use the current installation already serving the GUI and a write-limited shell.
  const require = createRequire(process.env.DSH_PACKAGE_JSON)
  const load = (specifier) => import(pathToFileURL(require.resolve(specifier)).href)
  const [{ Context }, { default: LocalCredentials }, { credentialRef }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-credentials-local'), load('@deepseek-ai/dsh-credentials'),
  ])
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentials, { watch: false })
  try {
    await fiber.await()
    const hit = await ctx.credentials.resolve(credentialRef('DSH_CLIPROXY_API_KEY'))
      ?? await ctx.credentials.resolve(credentialRef('OPENAI_API_KEY'))
    if (!hit) throw new Error('No saved CLIProxyAPI/OpenAI credential is configured')
    return { apiKey: hit.value, dispose: () => fiber.dispose() }
  } catch (error) {
    await fiber.dispose()
    throw error
  }
}

const builtin = openaiProvider()
const catalogModel = builtin.getModels().find((model) => model.id === modelId)
assert.ok(catalogModel, `No builtin OpenAI model ${modelId}`)
const builtinModel = { ...catalogModel, baseUrl: baseURL }
const customModel = toPiModel({
  id: modelId, name: catalogModel.name, input: catalogModel.input,
  contextWindow: catalogModel.contextWindow, maxTokens: catalogModel.maxTokens,
  reasoningEfforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
}, baseURL, 'CLIProxyAPI')
const context = {
  systemPrompt: 'You are a concise assistant. Do not search or call tools for this request.',
  messages: [{ role: 'user', content: 'Reply with exactly OK.', timestamp: 0 }],
}
let baseline
const measurements = []
const { apiKey, dispose } = await resolveKey()
try {
  for (const variant of ['builtin-openai', 'plugin-search-off', 'plugin-search-on']) {
    const webSearch = variant === 'plugin-search-on'
    const provider = variant === 'builtin-openai' ? builtin : createCliProxyApiProvider({
      id: 'CLIProxyAPI', name: 'CLIProxyAPI', baseURL, models: [customModel],
      resolvePreferences: () => ({ speedMode: 'standard', webSearch, fastModelIds: new Set(), searchModelIds: new Set([modelId]) }),
    })
    let request
    let result
    const stream = provider.streamSimple(variant === 'builtin-openai' ? builtinModel : customModel, context, {
      apiKey, reasoning: 'high', maxTokens: 64, transport: 'sse', cacheRetention: 'short',
      signal: AbortSignal.timeout(120000),
      onPayload(payload) {
        request = structuredClone(payload)
        if (baseline) {
          const expected = structuredClone(baseline)
          if (webSearch) expected.tools = [...(expected.tools ?? []), { type: 'web_search' }]
          assert.deepEqual(request, expected, 'Only the web_search declaration may differ')
        } else baseline = request
      },
    })
    for await (const event of stream) {
      if (event.type === 'error') throw new Error(`${variant}: ${event.error.errorMessage}`)
      if (event.type === 'done') result = event.message
    }
    assert.ok(result, `${variant}: no completed response`)
    const usage = result.usage
    const measurement = {
      variant, model: modelId, effort: request.reasoning?.effort,
      tools: request.tools ?? [],
      // pi-ai reports uncached input separately; compare total input, not cache misses.
      inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
      cachedInputTokens: usage.cacheRead, outputTokens: usage.output,
      reply: result.content.filter((block) => block.type === 'text').map((block) => block.text).join(''),
    }
    measurements.push(measurement)
    console.log(JSON.stringify(measurement))
  }
  console.log(JSON.stringify({
    pluginOverheadSearchOff: measurements[1].inputTokens - measurements[0].inputTokens,
    webSearchOverhead: measurements[2].inputTokens - measurements[1].inputTokens,
  }))
} finally {
  await dispose()
}
