/**
 * Unit tests for the two model-list orders.
 *
 * Run with `node --experimental-strip-types --test scripts/test-sort.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { redirectedSortKey, sortByModelId } from '../src/sort.ts'

/** Three models where the two orders disagree on purpose. */
const models = [
  { id: 'qoder-cn/GLM-5.3', name: 'GLM-5.3【qoder-cn】' },
  { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash【qoder】' },
  { id: 'antigravity/gemini-3.8-flash', name: 'Gemini 3.8 Flash【antigravity】' },
]

const idsOf = (list) => list.map(model => model.id)

test('redirectedSortKey extracts vendor and model name', () => {
  const key1 = redirectedSortKey('qoder/qfmodel', 'Qwen3.8-Flash【qoder】')
  assert.deepEqual(key1, ['qoder', 'qwen3.8-flash'])
  
  const key2 = redirectedSortKey('workbuddy-ai/model', 'GLM-5.3-Flash (Max) [workbuddy-ai]')
  assert.deepEqual(key2, ['workbuddy-ai', 'glm-5.3-flash (max)'])
  
  const key3 = redirectedSortKey('standalone', 'My Model')
  assert.deepEqual(key3, ['', 'my model'])
})

test('prefix order groups by vendor first', () => {
  const sorted = sortByModelId(models, model => model.id)
  // `qoder` sorts before `qoder-cn`: a shorter string precedes its own prefix.
  assert.deepEqual(idsOf(sorted), [
    'antigravity/gemini-3.8-flash',
    'qoder/qfmodel',
    'qoder-cn/GLM-5.3',
  ])
})

test('redirected order groups by prefix, then sorts by name', () => {
  // With redirected mode, we group by source prefix first (in brackets), then sort by name.
  // The test models have: antigravity, qoder, qoder-cn prefixes, so alphabetically: antigravity, qoder, qoder-cn
  const sorted = sortByModelId(models, model => model.id, model => model.name, 'redirected')
  assert.deepEqual(idsOf(sorted), [
    'antigravity/gemini-3.8-flash',
    'qoder/qfmodel',
    'qoder-cn/GLM-5.3',
  ])
})

test('the two orders really differ for a mixed list', () => {
  const list = [
    { id: 'zeta/kimi-k3', name: 'Kimi-K3【zeta】' },
    { id: 'alpha/glm-5.3', name: 'GLM-5.3【alpha】' },
  ]
  assert.deepEqual(idsOf(sortByModelId(list, model => model.id)), ['alpha/glm-5.3', 'zeta/kimi-k3'])
  assert.deepEqual(
    idsOf(sortByModelId(list, model => model.id, model => model.name, 'redirected')),
    ['alpha/glm-5.3', 'zeta/kimi-k3'],
  )
})

test('sorting never mutates the input', () => {
  const before = idsOf(models)
  sortByModelId(models, model => model.id, model => model.name, 'redirected')
  assert.deepEqual(idsOf(models), before)
})

test('redirected order is consistent whether names are already renamed', () => {
  const plain = [
    { id: 'qoder-cn/x', name: 'Name' },
    { id: 'qoder/x', name: 'Name' },
  ]
  const renamed = [
    { id: 'qoder-cn/x', name: 'Name【qoder-cn】' },
    { id: 'qoder/x', name: 'Name【qoder】' },
  ]
  // Both should sort with qoder before qoder-cn (vendor prefix order)
  const order = list => idsOf(sortByModelId(list, model => model.id, model => model.name, 'redirected'))
  assert.deepEqual(order(plain), ['qoder/x', 'qoder-cn/x'])
  assert.deepEqual(order(renamed), ['qoder/x', 'qoder-cn/x'])
})
