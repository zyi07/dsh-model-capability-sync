/**
 * Unit tests for the two model-list orders.
 *
 * Run with `node --experimental-strip-types --test scripts/test-sort.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { redirectedLabel, sortByModelId } from '../src/sort.ts'

/** Three models where the two orders disagree on purpose. */
const models = [
  { id: 'qoder-cn/GLM-5.3', name: 'GLM-5.3【qoder-cn】' },
  { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash【qoder】' },
  { id: 'antigravity/gemini-3.8-flash', name: 'Gemini 3.8 Flash【antigravity】' },
]

const idsOf = (list) => list.map(model => model.id)

test('redirectedLabel reads the name the picker shows', () => {
  assert.equal(redirectedLabel('qoder/qfmodel', 'Qwen3.8-Flash【qoder】'), 'qwen3.8-flash')
  assert.equal(redirectedLabel('qoder/qfmodel', 'Qwen3.8-Flash'), 'qwen3.8-flash')
  assert.equal(redirectedLabel('qoder-cn/GLM-5.3', 'qoder-cn/GLM-5.3'), 'glm-5.3')
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

test('redirected order is one alphabetical run of names', () => {
  const sorted = sortByModelId(models, model => model.id, model => model.name, 'redirected')
  assert.deepEqual(idsOf(sorted), [
    'antigravity/gemini-3.8-flash',
    'qoder-cn/GLM-5.3',
    'qoder/qfmodel',
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

test('redirected order ignores whether the rename has been applied yet', () => {
  const plain = [
    { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash' },
    { id: 'qoder-cn/Qwen3.8-Flash', name: 'Qwen3.8-Flash' },
  ]
  const renamed = [
    { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash【qoder】' },
    { id: 'qoder-cn/Qwen3.8-Flash', name: 'Qwen3.8-Flash【qoder-cn】' },
  ]
  const order = list => idsOf(sortByModelId(list, model => model.id, model => model.name, 'redirected'))
  assert.deepEqual(order(plain), order(renamed))
})
