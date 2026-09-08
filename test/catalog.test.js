import test from 'node:test'
import assert from 'node:assert/strict'
import { capabilitiesOf, catalogURL, modelProfileOf, readCodexCatalog, reasoningEffortsOf } from '../src/catalog.js'

const OPTIONS = { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] }

test('maps Codex reasoning levels to Harness canonical levels', () => {
  assert.deepEqual(reasoningEffortsOf({ supported_reasoning_levels: [
    { effort: 'none' }, { effort: 'minimal' }, { effort: 'high' }, { effort: 'ultra' },
  ] }), { off: 'none', minimal: 'minimal', high: 'high', max: 'ultra' })
})

test('omits an off-only reasoning capability rejected by llm-pi-ai', () => {
  assert.equal(reasoningEffortsOf({ supported_reasoning_levels: [
    { effort: 'none' }, { effort: 'off' },
  ] }), undefined)
})

test('maps model metadata and applies safe fallbacks', () => {
  assert.deepEqual(modelProfileOf({
    slug: 'gpt-test', display_name: 'GPT Test', max_context_window: 372000,
    input_modalities: ['text', 'image', 'audio'],
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'xhigh' }],
  }, OPTIONS), {
    id: 'gpt-test', name: 'GPT Test', contextWindow: 372000, maxTokens: 32768,
    input: ['text', 'image'], reasoningEfforts: { low: 'low', xhigh: 'xhigh' },
  })
})

test('extracts modalities and reasoning from the Codex catalog response', () => {
  const { models } = readCodexCatalog({ models: [
    {
      slug: 'gpt-5.6-sol',
      display_name: 'GPT 5.6 Sol',
      max_context_window: 372000,
      input_modalities: ['text', 'image'],
      supported_reasoning_levels: [
        { effort: 'low' },
        { effort: 'medium' },
        { effort: 'high' },
        { effort: 'xhigh' },
        { effort: 'max' },
        { effort: 'ultra' },
      ],
    },
    {
      slug: 'gpt-5.6-spark',
      display_name: 'GPT 5.6 Spark',
      max_context_window: 128000,
      input_modalities: ['text'],
    },
  ] }, OPTIONS)

  assert.deepEqual(models, [
    {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: {
        low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
      },
    },
    {
      id: 'gpt-5.6-spark',
      name: 'GPT 5.6 Spark',
      contextWindow: 128000,
      maxTokens: 32768,
      input: ['text'],
    },
  ])
})

test('uses configured fallbacks when catalog capability fields are absent', () => {
  assert.deepEqual(modelProfileOf({ slug: 'fallback-model' }, OPTIONS), {
    id: 'fallback-model',
    name: 'fallback-model',
    contextWindow: 262144,
    maxTokens: 32768,
    input: ['text'],
  })
})

test('filters hidden models by default and deduplicates slugs', () => {
  const { models } = readCodexCatalog({ models: [
    { slug: 'visible', context_window: 1000 },
    { slug: 'visible', context_window: 2000 },
    { slug: 'hidden', visibility: 'hide', context_window: 3000 },
  ] }, OPTIONS)
  assert.deepEqual(models.map((model) => model.id), ['visible'])
})

test('reports fast and search capabilities from the catalog signals', () => {
  assert.deepEqual(capabilitiesOf({
    service_tiers: [{ id: 'priority', name: 'Fast' }],
    supports_search_tool: true,
  }), { fast: true, search: true })
  assert.deepEqual(capabilitiesOf({ service_tiers: [] }), { fast: false, search: false })
  assert.deepEqual(capabilitiesOf({}), { fast: false, search: false })
  // kimi entries advertise additional_speed_tiers but an empty service_tiers
  // list — only the wire-forwarded service_tiers signal may enable Fast.
  assert.deepEqual(capabilitiesOf({ additional_speed_tiers: ['fast'], service_tiers: [] }), { fast: false, search: false })
})

test('collects per-model capabilities alongside the profiles', () => {
  const { models, capabilities } = readCodexCatalog({ models: [
    {
      slug: 'gpt-5.6-sol',
      service_tiers: [{ id: 'priority', name: 'Fast' }],
      supports_search_tool: true,
    },
    { slug: 'gpt-5.3-codex-spark', service_tiers: [] },
    { slug: 'plain-model' },
  ] }, OPTIONS)

  assert.deepEqual(models.map((model) => model.id), ['gpt-5.6-sol', 'gpt-5.3-codex-spark', 'plain-model'])
  assert.deepEqual(Object.fromEntries(capabilities), {
    'gpt-5.6-sol': { fast: true, search: true },
    'gpt-5.3-codex-spark': { fast: false, search: false },
    'plain-model': { fast: false, search: false },
  })
  assert.equal(models[0].samplingParams, undefined)
})

test('builds the Codex-compatible catalog URL', () => {
  assert.equal(
    catalogURL('http://127.0.0.1:8317/v1/'),
    'http://127.0.0.1:8317/v1/models?client_version=pi',
  )
})

test('reads the standard OpenAI list envelope as a fallback', () => {
  const { models, capabilities } = readCodexCatalog({
    data: [{ id: 'plain-model', object: 'model' }, { id: 'gpt-6-astra', object: 'model' }],
  }, { defaultContextWindow: 262144, defaultMaxTokens: 32768 })
  assert.deepEqual(models.map((model) => model.id), ['plain-model', 'gpt-6-astra'])
  // Non-codex entries degrade to plain text models with no capabilities.
  assert.equal(models[0].reasoningEfforts, undefined)
  assert.equal(models[0].contextWindow, 262144)
  assert.equal(models[0].maxTokens, 32768)
  assert.deepEqual(capabilities.get('plain-model'), { fast: false, search: false })
})

test('reads a bare array envelope', () => {
  const { models } = readCodexCatalog([{ id: 'plain-model' }])
  assert.deepEqual(models.map((model) => model.id), ['plain-model'])
})

test('rejects malformed and empty catalogs', () => {
  assert.throws(() => readCodexCatalog({ other: [] }), /no usable model list/)
  assert.throws(() => readCodexCatalog({ data: [] }), /no usable models/)
  assert.throws(() => readCodexCatalog({ models: [] }), /no usable models/)
})
