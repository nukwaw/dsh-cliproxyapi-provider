import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
      assert.deepEqual(spec, { namespace: 'llm-cliproxyapi' })
      return scope
    },
  }
  const effects = []
  const ctx = {
    remote: { $on() { return () => {} } },
    slots,
    locale,
    settingsScope,
    // No sessions/modelDirectories services: the picker install must abstain.
    get() { return undefined },
    effect(factory) {
      effects.push(factory)
      return () => {}
    },
  }
  plugin.apply(ctx)
  // Dictionaries + picker style are lifecycle-owned; the factories are not
  // invoked by this mock (no DOM in Node).
  assert.equal(effects.length, 2)
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

test('client shadows the model picker when directory services are present', async () => {
  const plugin = await loadClientPlugin()
  const registrations = []
  const slots = {
    inject(name, callback) {
      return callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const scope = {
    getSnapshot() {
      return { status: 'ready', value: { speedMode: 'fast' }, revision: 3, writable: true }
    },
    subscribe() {
      return () => {}
    },
  }
  const directory = {
    store: { subscribe() { return () => {} }, getSnapshot() { return { groups: [], current: null, status: 'ready', error: null, failures: [] } } },
    load() { return Promise.resolve() },
    select() { return Promise.resolve() },
  }
  const ctx = {
    remote: { $on() { return () => {} } },
    slots,
    locale: {
      register() { return () => {} },
      bind() { return (key) => key },
    },
    settingsScope: { bind() { return scope } },
    get(name) {
      if (name === 'sessions') return { subagentAddress: () => undefined }
      if (name === 'modelDirectories') return { directoryFor: () => directory }
      return undefined
    },
    effect() {
      return () => {}
    },
  }
  plugin.apply(ctx)
  const picker = registrations.find((entry) => entry.options.name === 'conversation.input.model')
  assert.ok(picker)
  assert.equal(picker.options.priority, -10)
  assert.equal(picker.options.locale, 'settings.cliProxyApi')
  const injected = picker.options.inject('session-1')
  assert.equal(injected.available, true)
  assert.equal(injected.directory, directory.store)
  assert.equal(typeof injected.load, 'function')
  assert.equal(typeof injected.select, 'function')
  assert.equal(typeof injected.preference.set, 'function')
})

test('client owns only its Settings section and keeps the configuration accessible', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setInterval\s*\(/)
  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /querySelector(All)?\s*\(/)
  assert.match(source, /settings\.section/)
  assert.match(source, /conversation\.input\.model/)
  assert.match(source, /priority: -10/)
  assert.doesNotMatch(source, /settings\.plugins\.tab/)
  assert.match(source, /ctx\.settingsScope/)
  assert.match(source, /slots\.inject\(SETTINGS_SLOT/)
  assert.match(source, /expectedRevision/)
  assert.match(source, /scope\.subscribe\(/)
  assert.match(source, /remote\.\$on\('credentials\/reference-updated'/)
  assert.match(source, /role: 'status'/)
})

test('configuration validates the draft, stores the key, and writes the namespace', async () => {
  const plugin = await loadClientPlugin()
  let discoveryNs
  let discoveryRequest
  let stored
  let mutation
  const ok = (value) => ({ ok: true, value })
  const operations = {
    describeCredential: async (ref) => {
      assert.equal(ref, 'DSH_CLIPROXY_API_KEY')
      return { configured: false }
    },
    storeCredential: async (ref, value) => {
      stored = { ref, value }
    },
    discoverModels: async (ns, request) => {
      discoveryNs = ns
      discoveryRequest = request
      return [{ id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol' }]
    },
    mutateSettings: async (ns, ops) => {
      mutation = { ns, ops }
      return ok({ ns, revision: 2 })
    },
  }
  const messages = { noModels: 'no models' }
  const result = await plugin.installConfiguration(
    operations,
    'http://127.0.0.1:8317/v1',
    'sk-new',
    { speedMode: 'fast', webSearch: false },
    messages,
  )
  assert.equal(discoveryNs, 'llm-cliproxyapi')
  assert.equal(discoveryRequest.provider, 'CLIProxyAPI')
  assert.equal(discoveryRequest.baseURL, 'http://127.0.0.1:8317/v1')
  assert.equal(discoveryRequest.apiKey, 'sk-new')
  assert.deepEqual(stored, { ref: 'DSH_CLIPROXY_API_KEY', value: 'sk-new' })
  assert.deepEqual(mutation, {
    ns: 'llm-cliproxyapi',
    ops: [
      { op: 'set', path: ['baseURL'], value: 'http://127.0.0.1:8317/v1' },
      { op: 'set', path: ['speedMode'], value: 'fast' },
      { op: 'set', path: ['webSearch'], value: false },
    ],
  })
  assert.equal(result.discovered.length, 1)
  assert.equal(result.hasCredential, true)
})

test('configuration refuses a server without usable models', async () => {
  const plugin = await loadClientPlugin()
  let mutated = false
  await assert.rejects(
    plugin.installConfiguration({
      describeCredential: async () => ({ configured: false }),
      storeCredential: async () => {},
      discoverModels: async () => [],
      mutateSettings: async () => {
        mutated = true
      },
    }, 'http://127.0.0.1:8317/v1', '', { speedMode: 'standard', webSearch: true }, { noModels: 'no models' }),
    /no models/,
  )
  assert.equal(mutated, false)
})

test('removing the configuration unsets the base URL', async () => {
  const plugin = await loadClientPlugin()
  const mutations = []
  const operations = {
    mutateSettings: async (ns, ops) => {
      mutations.push({ ns, ops })
      return { ns, revision: 8 }
    },
  }
  await plugin.removeConfiguration(operations)
  assert.deepEqual(mutations, [{
    ns: 'llm-cliproxyapi',
    ops: [{ op: 'unset', path: ['baseURL'] }],
  }])
})

test('fast mode support follows the predefined gpt family rule', async () => {
  const plugin = await loadClientPlugin()
  assert.equal(plugin.supportsFastMode('gpt-5.6-sol'), true)
  assert.equal(plugin.supportsFastMode('gpt-6-astra'), true)
  assert.equal(plugin.supportsFastMode('kimi-for-coding'), false)
  assert.equal(plugin.supportsFastMode(undefined), false)
})

test('preference snapshots memoize until the section changes', async () => {
  const plugin = await loadClientPlugin()
  let snapshot = { status: 'ready', revision: 1, writable: true, value: { baseURL: 'http://x/v1', speedMode: 'fast' } }
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  }
  const sets = []
  const preference = plugin.createPreference(scope, {
    mutateSettings: async (ns, ops, revision) => {
      sets.push({ ns, ops, revision })
    },
  })
  const first = preference.getSnapshot()
  assert.equal(preference.getSnapshot(), first)
  assert.equal(first.speedMode, 'fast')
  assert.equal(first.webSearch, true)
  snapshot = { ...snapshot, revision: 2, value: { ...snapshot.value, speedMode: 'standard' } }
  const second = preference.getSnapshot()
  assert.notEqual(second, first)
  assert.equal(second.speedMode, 'standard')
  await preference.set({ speedMode: 'fast' })
  assert.deepEqual(sets, [{
    ns: 'llm-cliproxyapi',
    ops: [{ op: 'set', path: ['speedMode'], value: 'fast' }],
    revision: 2,
  }])
})
