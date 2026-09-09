// One controlled live A/B: send identical Responses requests differing ONLY in
// tool.strict. Returned bash calls are inspected as data, NEVER executed.
// Run manually; this script is not part of npm test and incurs two model calls.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const endpoint = process.env.CPA_TEST_BASE_URL ?? 'http://127.0.0.1:8317/v1'
const model = process.env.CPA_TEST_MODEL ?? 'gpt-6-astra'

async function resolveKey() {
  const environmentKey = process.env.DSH_CLIPROXY_API_KEY ?? process.env.OPENAI_API_KEY
  if (environmentKey) return { apiKey: environmentKey, dispose: async () => {} }
  if (!process.env.DSH_PACKAGE_JSON) {
    throw new Error('Set OPENAI_API_KEY, DSH_CLIPROXY_API_KEY, or DSH_PACKAGE_JSON for the existing DSH credential service')
  }
  // Reuse the installed service rather than reading or printing credential data.
  // DSH's service can migrate legacy credential files on initialization; use the
  // same current installation already serving the GUI and a write-limited shell.
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

const baseTool = {
  type: 'function',
  name: 'bash',
  description: 'Execute a bash command. Only request sandbox escalation after a real denial and only to a strictly wider mode; otherwise omit sandbox_permissions and justification.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute.' },
      description: { type: 'string', description: 'Short active-voice description of the command.' },
      timeoutMs: { type: 'number', description: 'Optional command timeout in milliseconds.' },
      workdir: { type: 'string', description: 'Optional working directory; defaults to the current directory.' },
      run_in_background: { type: 'boolean', description: 'Optional background execution; defaults to false.' },
      sandbox_permissions: {
        type: 'string', enum: ['workspace-write', 'danger-full-access'],
        description: 'Only include after a real sandbox denial and only for a strictly wider mode. Omit on ordinary calls.',
      },
      justification: { type: 'string', description: 'Only required together with sandbox_permissions.' },
    },
    required: ['command', 'description'],
  },
}
const baseRequest = {
  model,
  stream: true,
  store: false,
  reasoning: { effort: 'high', summary: 'auto' },
  max_output_tokens: 512,
  input: [
    { role: 'developer', content: 'You are a coding assistant. Current sandbox mode: danger-full-access. All ordinary commands already have full access. Never specify sandbox_permissions or justification for ordinary commands; escalation to the current mode is invalid. Use only the required arguments when optional arguments are unnecessary.' },
    { role: 'user', content: 'Use bash to print the current working directory. Do not change directories or create files.' },
  ],
  tools: [baseTool],
  tool_choice: { type: 'function', name: 'bash' },
  parallel_tool_calls: false,
}

const { apiKey, dispose } = await resolveKey()
try {
  for (const explicitFalse of [false, true]) {
    const variant = explicitFalse ? 'strict-false' : 'strict-omitted'
    const request = structuredClone(baseRequest)
    if (explicitFalse) request.tools[0].strict = false
    const response = await fetch(endpoint.replace(/\/+$/, '') + '/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000),
    })
    if (!response.ok) throw new Error(`${variant}: HTTP ${response.status}`)
    const events = (await response.text()).split(/\r?\n/)
      .filter((line) => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]')
      .map((line) => JSON.parse(line.slice(5)))
    const completed = events.findLast((event) => event.type === 'response.completed')
    if (!completed) throw new Error(`${variant}: no completed response; types=${[...new Set(events.map((event) => event.type))].join(',')}`)
    const calls = completed.response.output.filter((item) => item.type === 'function_call')
    if (!calls.length) throw new Error(`${variant}: model returned no tool call`)
    console.log(JSON.stringify({
      variant, model,
      calls: calls.map((item) => {
        const args = JSON.parse(item.arguments)
        return { name: item.name, arguments: args, argumentKeys: Object.keys(args), requestedEscalation: Object.hasOwn(args, 'sandbox_permissions') }
      }),
    }))
  }
} finally {
  await dispose()
}
