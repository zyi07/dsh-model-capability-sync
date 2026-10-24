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
  // `qoder-cn/` is a gateway namespace, so dropping it leaves the catalog id.
  const match = matchModel(catalog, 'qoder-cn/qwen3.8-flash', {}, 'qoder-cn/qwen3.8-flash')
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

// --- variant markers, prefixes, and build numbers ---

/** A catalog with the shapes gateways actually produce. */
const wide = catalogOf([
  ['google', 'gemini-3.8-flash'],
  ['google', 'gemini-4-argon'],
  ['cohere', 'north-mini-code-1-0'],
  ['nvidia', 'nemotron-3.5-lightning-30b-a3b'],
  ['nvidia', 'nemotron-3-nano-omni-30b-a3b-reasoning'],
  ['dots-studio', 'dots-3-note-preview'],
  ['anthropic', 'claude-sonnet-4-5'],
  ['moonshotai', 'kimi-k3'],
  ['moark', 'GLM-5.3'],
])

test('a route tag and a variant suffix come off together', () => {
  const hit = matchModel(wide, 'gemini-3.8-flash-tiered')
  assert.equal(hit?.modelId, 'gemini-3.8-flash')
  // Either rule may report the hit: both describe a loosened match.
  assert.ok(['suffix', 'prefix'].includes(hit?.via), `unexpected via ${hit?.via}`)
})

test('a disabled variant still names the model it disables', () => {
  const hit = matchModel(wide, 'antigravity/gemini-4-argon-disabled')
  assert.equal(hit?.modelId, 'gemini-4-argon')
})

test('a truncated tail matches by prefix', () => {
  const lightning = matchModel(wide, 'cline/nvidia/nemotron-3.5-lightning:free')
  assert.equal(lightning?.modelId, 'nemotron-3.5-lightning-30b-a3b')
  assert.equal(lightning?.via, 'prefix')

  const north = matchModel(wide, 'cline/cohere/north-mini-code:free')
  assert.equal(north?.modelId, 'north-mini-code-1-0')
  assert.equal(north?.via, 'prefix')
})

test('nested vendor segments are peeled one at a time', () => {
  const hit = matchModel(wide, 'cline/dots-studio/dots-3-note-preview:free')
  assert.equal(hit?.provider, 'dots-studio')
  assert.equal(hit?.modelId, 'dots-3-note-preview')
})

test('a version dot folds to a dash', () => {
  const hit = matchModel(wide, 'kiro/claude-sonnet-4.5')
  assert.equal(hit?.modelId, 'claude-sonnet-4-5')
  assert.equal(hit?.via, 'folded')
})

test('a trailing build number comes off', () => {
  const hit = matchModel(wide, 'work-cn/kimi-k3-1')
  assert.equal(hit?.modelId, 'kimi-k3')
  assert.equal(hit?.via, 'suffix')
})

test('a trial suffix resolves to the model it trials', () => {
  assert.equal(matchModel(wide, 'zcode/GLM-5.3-Trial')?.modelId, 'GLM-5.3')
  assert.equal(matchModel(wide, 'zcode/GLM-5.3-Flash-Trial')?.modelId, 'GLM-5.3')
})

test('an opaque id still resolves through its display name', () => {
  // The fixture holds GLM-5.3; the label adds a `-Flash` marker on top of it.
  const hit = matchModel(wide, 'qoder-cn/gfmodel', {}, 'GLM-5.3-Flash')
  assert.equal(hit?.modelId, 'GLM-5.3')
  assert.equal(hit?.via, 'nameSuffix')
  assert.equal(hit?.matchedName, 'GLM-5.3-Flash')
})

test('nothing matches when no rule reaches the catalog', () => {
  assert.equal(matchModel(wide, '1fmodel'), undefined)
})
