import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'

async function loadClientPlugin() {
  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  }
  try {
    await import(`../client.js?test-${Math.random().toString(36).slice(2)}`)
    return definition.factory((id) => {
      assert.equal(id, 'react')
      return {}
    })
  } finally {
    delete globalThis.window
  }
}

test('client bundle registers a lifecycle-owned settings section', async () => {
  const plugin = await loadClientPlugin()
  assert.deepEqual(plugin.inject, [
    'slots',
    'locale',
    'remote',
    'remote.credentials',
    'remote.llm',
    'remote.settings',
    'settingsScope',
  ])

  const registrations = []
  const injections = []
  const slots = {
    inject(name, callback) {
      injections.push(name)
      return callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const locale = {
    register(namespace, dictionaries) {
      assert.equal(namespace, 'settings.cliProxyApi')
      assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'zh'])
      return () => {}
    },
    bind(namespace) {
      assert.equal(namespace, 'settings.cliProxyApi')
      return (key) => key
    },
  }
  const scope = {
    getSnapshot() {
      return { status: 'loading', value: undefined, revision: undefined, writable: false }
    },
    subscribe() {
      return () => {}
    },
  }
  const settingsScope = {
    bind(spec) {
      assert.deepEqual(spec, { namespace: 'llm-pi-ai' })
      return scope
    },
  }
  let effect
  const ctx = {
    remote: { $on() { return () => {} } },
    slots,
    locale,
    settingsScope,
    effect(factory) {
      effect = factory
      return () => {}
    },
  }
  plugin.apply(ctx)
  assert.equal(typeof effect, 'function')
  assert.deepEqual(injections, ['settings.section'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.name, 'settings.section')
  assert.equal(registrations[0].options.id, 'cliproxyapi')
  assert.equal(registrations[0].options.order, 20)
  assert.equal(registrations[0].options.locale, 'settings.cliProxyApi')
  assert.equal(typeof registrations[0].options.label, 'function')
  assert.equal(typeof registrations[0].options.inject, 'function')
  assert.equal(typeof registrations[0].component, 'function')
})

test('client owns only its Settings section and keeps the configuration accessible', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setInterval\s*\(/)
  assert.doesNotMatch(source, /document\./)
  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /querySelector(All)?\s*\(/)
  assert.doesNotMatch(source, /modelsHeading|configuredRows|BOOTSTRAP_ATTRIBUTE|HIDDEN_ATTRIBUTE/)
  assert.match(source, /settings\.section/)
  assert.doesNotMatch(source, /settings\.plugins\.tab/)
  assert.match(source, /ctx\.settingsScope/)
  assert.match(source, /slots\.inject\(SETTINGS_SLOT/)
  assert.match(source, /expectedRevision/)
  assert.match(source, /scope\.subscribe\(/)
  assert.doesNotMatch(source, /remote\.\$on\('settings\/document-updated'/)
  assert.match(source, /remote\.\$on\('credentials\/reference-updated'/)
  assert.match(source, /role: 'status'/)
})

test('initial profile waits until the host writes complete model capabilities', async () => {
  const plugin = await loadClientPlugin()
  const scopeListeners = []
  let currentNamespace = {
    ns: 'llm-pi-ai', revision: 1, value: { providers: {} },
  }
  let scopeSnapshot = {
    status: 'ready', revision: 1, value: {
      providers: {
        CLIProxyAPI: {
          baseURL: 'http://127.0.0.1:8317/v1',
          headers: { authorization: 'Bearer dsh-cliproxyapi-no-key' },
        },
      },
    }, writable: true,
  }
  let bootstrap
  let discoveryNs
  let discoveryRequest
  let expectedRevision
  const ok = (value) => ({ ok: true, value })
  const remote = {
    settings: {
      async mutate(ns, ops, revision) {
        assert.equal(ns, 'llm-pi-ai')
        expectedRevision = revision
        bootstrap = ops[0].value
        currentNamespace = {
          ns: 'llm-pi-ai', revision: 2, value: { providers: { CLIProxyAPI: bootstrap } },
        }
        return ok(currentNamespace)
      },
    },
    credentials: {
      async describe(refs) {
        assert.deepEqual(refs, ['DSH_CLIPROXY_API_KEY'])
        return ok({ DSH_CLIPROXY_API_KEY: { configured: false } })
      },
      async set() {
        return ok(undefined)
      },
    },
    llm: {
      async discoverModels(settingsNs, request) {
        discoveryNs = settingsNs
        discoveryRequest = request
        return ok([{
          id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', contextWindow: 372000, maxTokens: 32768,
        }])
      },
    },
  }
  const operations = {
    describeCredential: (ref) => remote.credentials.describe([ref]).then((response) => {
      if (!response.ok) throw new Error(response.error.message)
      return response.value[ref]
    }),
    storeCredential: (ref, value) => remote.credentials.set(ref, value).then((response) => {
      if (!response.ok) throw new Error(response.error.message)
    }),
    discoverModels: (settingsNs, request) => remote.llm.discoverModels(settingsNs, request).then((response) => {
      if (!response.ok) throw new Error(response.error.message)
      return response.value
    }),
    mutateSettings: (ns, ops, revision) => remote.settings.mutate(ns, ops, revision).then((response) => {
      if (!response.ok) throw new Error(response.error.message)
      return response.value
    }),
  }
  const scope = {
    getSnapshot() {
      return scopeSnapshot
    },
    subscribe(listener) {
      scopeListeners.push(listener)
      return () => scopeListeners.splice(scopeListeners.indexOf(listener), 1)
    },
  }
  const messages = {
    noModels: 'no models',
    syncTimeout: 'sync timeout',
  }
  let settled = false
  const installing = plugin.installInitialProfile(
    operations, scope, 'http://127.0.0.1:8317/v1', '', messages,
  ).then((profile) => {
    settled = true
    return profile
  })

  for (let attempt = 0; !bootstrap && attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.ok(bootstrap)
  assert.equal(expectedRevision, 1)
  assert.equal(discoveryNs, 'llm-cliproxyapi')
  assert.equal(discoveryRequest.provider, 'CLIProxyAPI')
  assert.equal(discoveryRequest.baseURL, 'http://127.0.0.1:8317/v1')
  assert.equal(bootstrap.models[0].input, undefined)
  assert.equal(bootstrap.models[0].reasoningEfforts, undefined)
  assert.match(bootstrap.headers['x-dsh-provider-cpa-sync'], /^rich:/)
  const validated = await PiAiConfig['~standard'].validate({
    providers: { CLIProxyAPI: bootstrap },
  })
  assert.equal(validated.issues, undefined)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(settled, false)

  const synchronized = {
    ...bootstrap,
    headers: { authorization: 'Bearer dsh-cliproxyapi-no-key' },
    models: [{
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: { low: 'low', high: 'high' },
    }],
  }
  currentNamespace = {
    ns: 'llm-pi-ai', revision: 3, value: { providers: { CLIProxyAPI: synchronized } },
  }
  scopeSnapshot = {
    status: 'ready', revision: 3, value: currentNamespace.value, writable: true,
  }
  for (const listener of [...scopeListeners]) listener()

  const profile = await installing
  assert.deepEqual(profile.models[0].input, ['text', 'image'])
  assert.deepEqual(profile.models[0].reasoningEfforts, { low: 'low', high: 'high' })
  assert.equal(scopeListeners.length, 0)
})

test('removing the profile unsets the provider section', async () => {
  const plugin = await loadClientPlugin()
  const mutations = []
  const operations = {
    mutateSettings: async (ns, ops, revision) => {
      mutations.push({ ns, ops, revision })
      return { ns, revision: (revision ?? 0) + 1, value: { providers: {} } }
    },
  }
  const scope = {
    getSnapshot() {
      return { status: 'ready', revision: 7, value: { providers: {} }, writable: true }
    },
  }
  await plugin.removeProfile(operations, scope)
  assert.deepEqual(mutations, [{
    ns: 'llm-pi-ai',
    ops: [{ op: 'unset', path: ['providers', 'CLIProxyAPI'] }],
    revision: 7,
  }])
})
