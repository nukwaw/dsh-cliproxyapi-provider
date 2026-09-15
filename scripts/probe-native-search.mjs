// Manual live probe: check the catalog's native web search verdicts against what
// the upstream actually accepts. Never executes returned tool calls.
//
//   CPA_TEST_BASE_URL=http://127.0.0.1:8317/v1 \
//   DSH_CLIPROXY_API_KEY=... node scripts/probe-native-search.mjs [--dispatch] [--browse]
//
// Without flags it only reads the catalog and prints one row per model, so it is
// free and safe. `--dispatch` sends one tiny request per probed model that
// declares the native web_search tool; `--browse` additionally asks the model to
// open a specific URL, which is how the open_page action is exercised. Both cost
// model requests and are never run by `npm test`.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { capabilitiesOf, catalogURL, readCodexCatalog } from '../src/catalog.js'
import { createCliProxyApiProvider, toPiModel } from '../src/provider.js'

const baseURL = (process.env.CPA_TEST_BASE_URL ?? 'http://127.0.0.1:8317/v1').replace(/\/+$/, '')
const wantedModel = process.env.CPA_TEST_MODEL
const flags = new Set(process.argv.slice(2))
const dispatch = flags.has('--dispatch')
const browse = flags.has('--browse')
const BROWSE_URL = process.env.CPA_TEST_URL ?? 'https://example.com/'

async function resolveKey() {
  const environmentKey = process.env.DSH_CLIPROXY_API_KEY || process.env.OPENAI_API_KEY
  if (environmentKey) return { apiKey: environmentKey, dispose: async () => {} }
  if (!process.env.DSH_PACKAGE_JSON) throw new Error('Set an API key or DSH_PACKAGE_JSON to reuse the installed credential service')
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

async function readCatalog(clientVersion, apiKey) {
  const url = catalogURL(baseURL).replace('client_version=cpa', `client_version=${clientVersion}`)
  const response = await fetch(url, {
    headers: { accept: 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
  })
  if (!response.ok) throw new Error(`catalog request failed (HTTP ${response.status})`)
  return { body: await response.json(), envelope: response.headers.get('content-type') ?? '' }
}

const { apiKey, dispose } = await resolveKey()
try {
  const cpa = await readCatalog('cpa', apiKey)
  const legacy = await readCatalog('pi', apiKey)
  const options = { defaultContextWindow: 262144, defaultMaxTokens: 32768 }
  const catalog = readCodexCatalog(cpa.body, options)
  const rawOf = (body) => (Array.isArray(body) ? body : body?.models ?? body?.data ?? [])
  const indexOf = (body) => new Map(rawOf(body).map((entry) => [entry?.slug ?? entry?.id, entry]))
  const cpaById = indexOf(cpa.body)
  const legacyById = indexOf(legacy.body)
  const verdictOf = (id) => {
    const declared = cpaById.get(id)?.cpa_capabilities?.web_search
    return typeof declared === 'boolean' ? String(declared) : 'unknown'
  }

  console.log(`# catalog: ${baseURL} (client_version=cpa, ${catalog.models.length} models)`)
  console.log(['model', 'verdict', 'legacyFlag', 'search', 'browsing', 'reasoning'].join('\t'))
  const rows = []
  for (const model of catalog.models) {
    const capabilities = capabilitiesOf(cpaById.get(model.id) ?? {})
    const row = {
      id: model.id,
      verdict: verdictOf(model.id),
      legacyFlag: legacyById.get(model.id)?.supports_search_tool === true,
      search: capabilities.search,
      browsing: capabilities.browsing,
      // Catalog profiles carry effort maps; pi-ai marks reasoning models from them.
      reasoning: model.reasoningEfforts !== undefined,
    }
    rows.push(row)
    console.log([row.id, row.verdict, row.legacyFlag, row.search, row.browsing, row.reasoning].join('\t'))
  }

  const summary = {
    models: rows.length,
    declaredTrue: rows.filter((row) => row.verdict === 'true').length,
    declaredFalse: rows.filter((row) => row.verdict === 'false').length,
    declaredUnknown: rows.filter((row) => row.verdict === 'unknown').length,
    // Models the plugin still treats as search-capable without a verdict.
    legacyFallback: rows.filter((row) => row.verdict === 'unknown' && row.search).map((row) => row.id),
    // A model the proxy resolved as unsupported whose legacy Codex flag still
    // claims support: exactly the case an older plugin version got wrong.
    verdictOverturnsLegacy: rows
      .filter((row) => row.verdict === 'false' && legacyById.get(row.id)?.supports_search_tool === true)
      .map((row) => row.id),
  }
  console.log(JSON.stringify({ summary }))
  if (summary.declaredTrue + summary.declaredFalse === 0) {
    console.log('# no cpa_capabilities anywhere: this proxy predates 7.3.1 or Home integration is off')
  }

  if (!dispatch && !browse) process.exit(0)

  const target = wantedModel ?? rows.find((row) => row.search)?.id
  if (!target) throw new Error('No search-capable model to probe; set CPA_TEST_MODEL')
  const row = rows.find((entry) => entry.id === target)
  if (!row) throw new Error(`Model ${target} is not in the catalog`)

  const profile = catalog.models.find((model) => model.id === target)
  const model = toPiModel(profile, baseURL, 'CLIProxyAPI')
  const provider = createCliProxyApiProvider({
    id: 'CLIProxyAPI',
    name: 'CLIProxyAPI',
    baseURL,
    models: [model],
    resolvePreferences: () => ({
      speedMode: 'standard',
      fastModelIds: new Set(),
      searchModelIds: row.search ? new Set([target]) : new Set(),
      browsingModelIds: row.browsing ? new Set([target]) : new Set(),
    }),
  })
  const prompt = browse
    ? `Open ${BROWSE_URL} and answer with its page title only.`
    : 'Reply with exactly OK. Do not search.'
  const context = {
    systemPrompt: 'Answer in one short line. Do not call any tool other than the native web search tool.',
    messages: [{ role: 'user', content: prompt, timestamp: 0 }],
  }
  let request
  let result
  let failure
  const stream = provider.streamSimple(model, context, {
    apiKey: apiKey ?? undefined,
    maxTokens: 256,
    transport: 'sse',
    cacheRetention: 'short',
    signal: AbortSignal.timeout(180000),
    onPayload(payload) {
      request = structuredClone(payload)
    },
  })
  try {
    for await (const event of stream) {
      if (event.type === 'error') failure = event.error?.errorMessage ?? 'unknown stream error'
      if (event.type === 'done') result = event.message
    }
  } catch (error) {
    failure = error?.message ?? String(error)
  }
  const text = result?.content?.filter((block) => block.type === 'text').map((block) => block.text).join('') ?? ''
  console.log(JSON.stringify({
    probe: { model: target, catalogVerdict: row.verdict, search: row.search, browsing: row.browsing, mode: browse ? 'browse' : 'dispatch' },
    declaredTools: (request?.tools ?? []).map((tool) => tool.type),
    accepted: failure === undefined,
    failure,
    reply: text.slice(0, 400),
    citedUrls: text.match(/https?:\/\/\S+/g)?.slice(0, 5) ?? [],
  }))
} finally {
  await dispose()
}
