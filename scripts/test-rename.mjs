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

test('redirectName appends the prefix in parentheses', () => {
  const row = redirectName('qoder/qfmodel', 'Qwen3.8-Flash')
  assert.deepEqual(row, { prefix: 'qoder', before: 'Qwen3.8-Flash', after: 'Qwen3.8-Flash (qoder)', changed: true })
})

test('redirectName is idempotent', () => {
  const row = redirectName('qoder/qfmodel', 'Qwen3.8-Flash (qoder)')
  assert.equal(row.after, 'Qwen3.8-Flash (qoder)')
  assert.equal(row.changed, false)
})

test('redirectName leaves ids without a prefix alone', () => {
  const row = redirectName('standalone', 'Bare')
  assert.equal(row.changed, false)
  assert.equal(row.after, 'Bare')
})

test('redirectName falls back to the bare id when the name is blank', () => {
  const row = redirectName('qoder/unnamed', '')
  assert.equal(row.before, 'qoder/unnamed')
  assert.equal(row.after, 'unnamed (qoder)')
})

test('same-name models from different sources become distinguishable', () => {
  const rows = planNames([
    { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash' },
    { id: 'qoder-cn/qfmodel', name: 'Qwen3.8-Flash' },
  ])
  assert.deepEqual(rows.map(row => row.after), ['Qwen3.8-Flash (qoder)', 'Qwen3.8-Flash (qoder-cn)'])
})

test('renameModels only touches selected ids that actually change', () => {
  const models = [
    { id: 'qoder/qfmodel', name: 'Qwen3.8-Flash', contextWindow: 128000 },
    { id: 'unknown/m1', name: 'already (unknown)' },
  ]
  const { next, written } = renameModels(models, new Set(['qoder/qfmodel', 'unknown/m1']))
  assert.equal(written, 1)
  assert.equal(next[0].name, 'Qwen3.8-Flash (qoder)')
  assert.equal(next[0].contextWindow, 128000, 'untouched fields survive')
  assert.equal(next[1].name, 'already (unknown)')
  assert.equal(models[0].name, 'Qwen3.8-Flash', 'input is not mutated')
})
