/**
 * Unit tests for the name-redirect rule.
 *
 * Run with `node --experimental-strip-types --test scripts/test-rename.mjs`
 * (Node 24 strips types by default). The rule is pure, so this needs no
 * profile, no settings service, and no network.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { planNames, redirectName, renameModels, sourcePrefixOf } from '../src/client/rename.ts'

test('sourcePrefixOf reads the first path segment', () => {
  assert.equal(sourcePrefixOf('qoder/qfmodel'), 'qoder')
  assert.equal(sourcePrefixOf('qoder-cn/qfmodel'), 'qoder-cn')
  assert.equal(sourcePrefixOf('qoder/gj/qwen3.8'), 'qoder')
  assert.equal(sourcePrefixOf('standalone'), '')
  assert.equal(sourcePrefixOf('/leading'), '')
})

test('redirectName prepends the prefix in full-width brackets', () => {
  const row = redirectName('qoder/qfmodel', 'Qwen3.8-Flash')
  assert.deepEqual(row, { prefix: 'qoder', before: 'Qwen3.8-Flash', after: '【qoder】 Qwen3.8-Flash', changed: true })
})

test('redirectName is idempotent', () => {
  const row = redirectName('qoder/qfmodel', '【qoder】 Qwen3.8-Flash')
  assert.equal(row.after, '【qoder】 Qwen3.8-Flash')
  assert.equal(row.changed, false)
})

test('redirectName normalizes the earlier half-width spelling', () => {
  const row = redirectName('qoder/qfmodel', 'Qwen3.8-Flash (qoder)')
  assert.equal(row.after, '【qoder】 Qwen3.8-Flash')
  assert.equal(row.changed, true)
})

test('redirectName moves a leading prefix to the front as a bracket', () => {
  const row = redirectName('beichen/gpt-6-astra', 'beichen/gpt-6-astra')
  assert.equal(row.before, 'beichen/gpt-6-astra')
  assert.equal(row.after, '【beichen】 gpt-6-astra')
  assert.equal(row.changed, true)
})

test('redirectName cleans a label that has the prefix in it', () => {
  const row = redirectName('qoder-cn/Qwen3.8-Flash', 'qoder-cn/Qwen3.8-Flash')
  assert.equal(row.after, '【qoder-cn】 Qwen3.8-Flash')
})

test('redirectName is idempotent after a leading-prefix cleanup', () => {
  const first = redirectName('beichen/gpt-6-astra', 'beichen/gpt-6-astra')
  const second = redirectName('beichen/gpt-6-astra', first.after)
  assert.equal(second.after, first.after)
  assert.equal(second.changed, false)
})

test('redirectName adds 【other】 prefix when id has no prefix', () => {
  const row = redirectName('standalone', 'Bare')
  assert.equal(row.prefix, 'other')
  assert.equal(row.after, '【other】 Bare')
  assert.equal(row.changed, true)
})

test('redirectName falls back to the bare id when the name is blank', () => {
  const row = redirectName('qoder/unnamed', '')
  assert.equal(row.before, 'qoder/unnamed')
  assert.equal(row.after, '【qoder】 unnamed')
})

test('same-name models from different sources become distinguishable', () => {
  const rows = planNames([
    { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash' },
    { id: 'qoder-cn/qfmodel', name: 'Qwen3.8-Flash' },
  ])
  assert.deepEqual(rows.map(row => row.after), ['【qoder】 Qwen3.8-Flash', '【qoder-cn】 Qwen3.8-Flash'])
})

test('renameModels only touches selected ids that actually change', () => {
  const models = [
    { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash', contextWindow: 128000 },
    { id: 'unknown/m1', name: '【unknown】 already' },
  ]
  const { next, written } = renameModels(models, new Set(['qoder/qfmodel', 'unknown/m1']))
  assert.equal(written, 1)
  assert.equal(next[0].name, '【qoder】 Qwen3.8-Flash')
  assert.equal(next[0].contextWindow, 128000, 'untouched fields survive')
  assert.equal(next[1].name, '【unknown】 already')
  assert.equal(models[0].name, 'Qwen3.8-Flash', 'input is not mutated')
})
