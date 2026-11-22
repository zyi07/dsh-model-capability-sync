/**
 * Unit tests for hand-typed capability values.
 *
 * Run with `node --experimental-strip-types --test scripts/test-fields.mjs`.
 *
 * The table shows token counts in short form (`1M`) and those same cells are
 * typeable, so the short form has to parse back to the number it stands for.
 * The overlay rule matters too: a typed value wins over the catalog even when
 * "overwrite" is off, because that switch is about the catalog replacing what
 * is stored, not about a person deciding what the entry should say.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeFields, parseTokenCount } from '../src/client/shared.ts'

test('a short token count parses to its number', () => {
  assert.equal(parseTokenCount('128K'), 128_000)
  assert.equal(parseTokenCount('1M'), 1_000_000)
  assert.equal(parseTokenCount('1.5M'), 1_500_000)
  assert.equal(parseTokenCount('1.5m'), 1_500_000)
  assert.equal(parseTokenCount('262k'), 262_000)
})

test('a plain or punctuated count parses', () => {
  assert.equal(parseTokenCount('128000'), 128_000)
  assert.equal(parseTokenCount('1,000,000'), 1_000_000)
  assert.equal(parseTokenCount(' 1000000 '), 1_000_000)
})

test('anything that is not a count reads as no value', () => {
  // Empty means "drop the manual value", not zero.
  for (const text of ['', '   ', 'abc', '1M2', '-5', '0', 'K', '1 T']) {
    assert.equal(parseTokenCount(text), undefined, JSON.stringify(text))
  }
})

test('a typed value overlays the catalog value', () => {
  const merged = mergeFields(
    { contextWindow: 1_000_000, maxTokens: 128_000, input: ['text', 'image'] },
    { contextWindow: 200_000 },
  )
  assert.equal(merged.contextWindow, 200_000)
  assert.equal(merged.maxTokens, 128_000)
  assert.deepEqual(merged.input, ['text', 'image'])
})

test('a model the catalog never listed keeps only what was typed', () => {
  const merged = mergeFields(undefined, { contextWindow: 64_000, input: ['text'] })
  assert.deepEqual(merged, { contextWindow: 64_000, input: ['text'] })
})

test('no typed values leaves the catalog fields untouched', () => {
  const catalog = { contextWindow: 1_000_000 }
  assert.deepEqual(mergeFields(catalog, undefined), catalog)
  assert.equal(mergeFields(undefined, undefined), undefined)
})
