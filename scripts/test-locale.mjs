/**
 * Unit tests for copy-table completeness.
 *
 * Run with `node --experimental-strip-types --test scripts/test-locale.mjs`.
 *
 * This exists because a column header shipped as the raw key `colName`: the
 * dictionary was missing it, `t()` fell back to the key itself, and nothing
 * failed — the UI just read "colName" where a label belonged. A missing key is
 * silent at runtime, so it has to be loud here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { en, zh } from '../src/client/locale.ts'

const here = dirname(fileURLToPath(import.meta.url))
const clientDir = join(here, '..', 'src', 'client')

/** Every client module that calls `t('…')`. */
const CALLERS = ['SyncSection.tsx', 'apply.ts']

/** The copy keys the UI asks for, as written in the source. */
function keysUsed() {
  const found = new Set()
  for (const file of CALLERS) {
    const text = readFileSync(join(clientDir, file), 'utf8')
    for (const match of text.matchAll(/\bt\('([A-Za-z][A-Za-z0-9]*)'/g)) found.add(match[1])
  }
  return [...found].sort()
}

test('every key the UI asks for exists in both dictionaries', () => {
  const used = keysUsed()
  assert.ok(used.length > 20, `expected the UI to use many keys, found ${used.length}`)
  const missingZh = used.filter(key => !(key in zh))
  const missingEn = used.filter(key => !(key in en))
  assert.deepEqual(missingZh, [], `missing from zh: ${missingZh.join(', ')}`)
  assert.deepEqual(missingEn, [], `missing from en: ${missingEn.join(', ')}`)
})

test('the two dictionaries hold the same keys', () => {
  const zhOnly = Object.keys(zh).filter(key => !(key in en))
  const enOnly = Object.keys(en).filter(key => !(key in zh))
  assert.deepEqual(zhOnly, [], `only in zh: ${zhOnly.join(', ')}`)
  assert.deepEqual(enOnly, [], `only in en: ${enOnly.join(', ')}`)
})

test('the name column is present', () => {
  // The specific key that shipped as a raw identifier.
  assert.equal(zh.colName, '名称')
  assert.equal(en.colName, 'Name')
})
