import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const manifest = JSON.parse(await read('../package.json'))
const lock = JSON.parse(await read('../package-lock.json'))

test('package and lockfile agree on the unscoped name and release version', () => {
  assert.equal(manifest.name, 'dsh-cliproxyapi-provider')
  assert.equal(lock.name, manifest.name)
  assert.equal(lock.version, manifest.version)
  assert.equal(lock.packages[''].name, manifest.name)
  assert.equal(lock.packages[''].version, manifest.version)
})

test('Cordis patch resolves the current package name', async () => {
  const patch = await read('../cordis.patch.yml')
  const name = patch.match(/^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1]
  assert.equal(name, manifest.name)
})

test('browser module registers under the current package name', async () => {
  let definition
  runInNewContext(await read('../client.js'), {
    window: { __ModuleLoader__: { load(value) { definition = value } } },
  }, { filename: 'client.js' })
  assert.equal(definition.id, manifest.name)
  assert.equal(typeof definition.factory, 'function')
})
