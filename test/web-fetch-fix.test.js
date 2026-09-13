import test from 'node:test'
import assert from 'node:assert/strict'
import { createFakeIpTolerantResolver, installWebFetchFix, isFakeIpV4 } from '../src/web-fetch-fix.js'

test('isFakeIpV4 recognizes only the 198.18.0.0/15 benchmark range', () => {
  assert.equal(isFakeIpV4('198.18.0.1'), true)
  assert.equal(isFakeIpV4('198.18.0.205'), true)
  assert.equal(isFakeIpV4('198.19.255.254'), true)
  assert.equal(isFakeIpV4('198.17.255.255'), false)
  assert.equal(isFakeIpV4('198.20.0.1'), false)
  assert.equal(isFakeIpV4('192.168.1.1'), false)
  assert.equal(isFakeIpV4('10.0.0.1'), false)
  assert.equal(isFakeIpV4('127.0.0.1'), false)
  assert.equal(isFakeIpV4('::ffff:198.18.0.1'), false)
  assert.equal(isFakeIpV4('not-an-ip'), false)
})

const blocked = (message = 'URL hostname "example.com" resolves to a non-public IP address') =>
  Object.assign(new Error(message), { code: 'WEB_BLOCKED_URL' })

const publicEntry = { address: '93.184.216.34', family: 4 }
const fakeEntry = { address: '198.18.0.205', family: 4 }
const lookupOf = (entries) => async () => entries

test('a passing stock resolution is returned untouched', async () => {
  const entries = [publicEntry]
  const resolve = createFakeIpTolerantResolver(async () => entries, lookupOf([fakeEntry]))
  assert.equal(await resolve('example.com'), entries)
})

test('non-blocking stock failures propagate without a second lookup', async () => {
  const failure = Object.assign(new Error('hostname "example.com" resolved to no addresses'), { code: 'WEB_PROVIDER_ERROR' })
  let lookedUp = false
  const resolve = createFakeIpTolerantResolver(async () => { throw failure }, async () => {
    lookedUp = true
    return [fakeEntry]
  })
  await assert.rejects(resolve('example.com'), (error) => error === failure)
  assert.equal(lookedUp, false)
})

test('an all-fake-ip answer set is released after a non-public rejection', async () => {
  const failure = blocked()
  const resolve = createFakeIpTolerantResolver(async () => { throw failure }, lookupOf([fakeEntry, { address: '198.19.1.2', family: 4 }]))
  assert.deepEqual(await resolve('hub.docker.com'), [fakeEntry, { address: '198.19.1.2', family: 4 }])
})

test('IP literals keep the stock policy even inside the fake-ip range', async () => {
  const failure = blocked('URL hostname "198.18.0.205" resolves to a non-public IP address')
  const resolve = createFakeIpTolerantResolver(async () => { throw failure }, lookupOf([fakeEntry]))
  await assert.rejects(resolve('198.18.0.205'), (error) => error === failure)
  await assert.rejects(resolve('[::1]'), (error) => error === failure)
})

test('any non-fake-ip answer keeps the original rejection', async () => {
  const failure = blocked()
  const resolve = createFakeIpTolerantResolver(async () => { throw failure }, lookupOf([fakeEntry, { address: '192.168.1.1', family: 4 }]))
  await assert.rejects(resolve('example.com'), (error) => error === failure)
  const empty = createFakeIpTolerantResolver(async () => { throw failure }, lookupOf([]))
  await assert.rejects(empty('example.com'), (error) => error === failure)
  const ipv6 = createFakeIpTolerantResolver(async () => { throw failure }, lookupOf([{ address: '64:ff9b::c0a8:101', family: 6 }]))
  await assert.rejects(ipv6('example.com'), (error) => error === failure)
})

function fakeContext(provider) {
  const effects = []
  const warnings = []
  return {
    effects,
    warnings,
    ctx: {
      web: provider === null ? undefined : { fetchProviders: new Map(provider === undefined ? [] : [['http', provider]]) },
      timeout: (fn) => { fn(); return () => {} },
      logger: { warn: (text) => warnings.push(text), info: () => {} },
      effect: (fn) => { effects.push(fn) },
    },
  }
}

test('installation patches the registered provider resolver and restores it on dispose', () => {
  const original = async () => [publicEntry]
  const provider = { resolveAddresses: original }
  const { ctx, effects } = fakeContext(provider)
  installWebFetchFix(ctx)
  for (const fn of effects.splice(0, 1)) fn() // run the install effect body
  assert.notEqual(provider.resolveAddresses, original)
  assert.equal(typeof provider.resolveAddresses, 'function')
  // Disposing every registered effect restores the stock resolver.
  for (const fn of effects) {
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanup()
  }
  assert.equal(provider.resolveAddresses, original)
})

test('installation tolerates a missing provider and warns instead of throwing', () => {
  for (const provider of [undefined, null, { noResolver: true }]) {
    const { ctx, effects, warnings } = fakeContext(provider)
    installWebFetchFix(ctx)
    for (const fn of effects) fn()
    assert.equal(warnings.length, 1)
  }
})
