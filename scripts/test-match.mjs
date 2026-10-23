/**
 * Unit tests for id → catalog matching, with the display-name fallback.
 *
 * Run with `node --experimental-strip-types --test scripts/test-match.mjs`.
 * A tiny hand-built catalog stands in for models.dev, so this stays offline.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanDisplayName, matchModel } from '../src/match.ts'

/** Index a few entries the way `loadCatalog` does. */
function catalogOf(entries) {
  const byId = new Map()
  const byFolded = new Map()
  for (const [provider, id] of entries) {
    const entry = { provider, id, model: { id, limit: { context: 128000 } } }
    for (const [map, key] of [[byId, id], [byFolded, id.toLowerCase()]]) {
      const list = map.get(key)
      if (list === undefined) map.set(key, [entry])
      else list.push(entry)
    }
  }
  return { fetchedAt: 0, modelCount: entries.length, byId, byFolded }
}

const catalog = catalogOf([
  ['alibaba', 'qwen3.8-flash'],
  ['deepseek', 'deepseek-flash'],
  ['openai', 'gpt-6-astra'],
])

test('cleanDisplayName drops source annotations', () => {
  assert.equal(cleanDisplayName('Qwen3.8-Flash【qoder】'), 'Qwen3.8-Flash')
  assert.equal(cleanDisplayName('Qwen3.8-Flash (qoder)'), 'Qwen3.8-Flash')
  assert.equal(cleanDisplayName('[cn] Qwen3.8-Flash'), 'Qwen3.8-Flash')
  assert.equal(cleanDisplayName('  GLM-5.3-Flash  '), 'GLM-5.3-Flash')
})

test('an exact id still wins, and reports how it matched', () => {
  const match = matchModel(catalog, 'qwen3.8-flash', {}, 'something else')
  assert.equal(match?.modelId, 'qwen3.8-flash')
  assert.equal(match?.via, 'exact')
})

test('an opaque id falls back to the display name', () => {
  const match = matchModel(catalog, 'qoder/qfmodel', {}, 'Qwen3.8-Flash')
  assert.equal(match?.modelId, 'qwen3.8-flash')
  assert.equal(match?.via, 'name')
  assert.equal(match?.nameSource, 'name')
  assert.equal(match?.matchedName, 'Qwen3.8-Flash')
})

test('a renamed label resolves exactly like the original', () => {
  const plain = matchModel(catalog, 'qoder/qfmodel', {}, 'Qwen3.8-Flash')
  const renamed = matchModel(catalog, 'qoder/qfmodel', {}, 'Qwen3.8-Flash【qoder】')
  const halfWidth = matchModel(catalog, 'qoder/qfmodel', {}, 'Qwen3.8-Flash (qoder)')
  assert.deepEqual(renamed, plain)
  assert.deepEqual(halfWidth, plain)
})

test('a name that still carries the prefix keeps its last segment', () => {
  // The id only resolves after the vendor segment is dropped (`basename`), so
  // the name never has to speak. Both routes agree on the entry.
  const match = matchModel(catalog, 'qoder-cn/Qwen3.8-Flash', {}, 'qoder-cn/Qwen3.8-Flash')
  assert.equal(match?.modelId, 'qwen3.8-flash')
  assert.equal(match?.via, 'basename')
})

test('a renamed label spoken for by the name alone reaches its last segment', () => {
  // `vendor-a/` is invented, so the id matches nothing: only the label can.
  const match = matchModel(catalog, 'vendor-a/Qwen3.8-Flash【vendor-a】', {}, 'vendor-a/Qwen3.8-Flash【vendor-a】')
  assert.equal(match?.modelId, 'qwen3.8-flash')
  assert.equal(match?.via, 'name')
  assert.equal(match?.matchedName, 'Qwen3.8-Flash')
})

test('the name is tried for its variant-free form too', () => {
  const match = matchModel(catalog, 'qoder/x', {}, 'DeepSeek-Flash-high')
  assert.equal(match?.modelId, 'deepseek-flash')
  assert.equal(match?.via, 'nameSuffix')
})

test('nothing matches without an id or a name', () => {
  assert.equal(matchModel(catalog, 'qoder/qfmodel', {}, ''), undefined)
  assert.equal(matchModel(catalog, 'qoder/qfmodel', {}, 'Unknown-Model'), undefined)
})

test('an alias remains an explicit override', () => {
  const match = matchModel(catalog, 'mystery', { mystery: 'gpt-6-astra' }, '')
  assert.equal(match?.modelId, 'gpt-6-astra')
  assert.equal(match?.via, 'alias')
})
