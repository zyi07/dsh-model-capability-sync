/**
 * Unit tests for carrying a written model list back into the held descriptor.
 *
 * Run with `node --experimental-strip-types --test scripts/test-write-merge.mjs`.
 * The bug this guards against: rename a model, then reorder, and the reorder
 * rebuilds the list from the descriptor — which still held the old names —
 * putting them back. Keeping the descriptor in step is what prevents it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { withWrittenModels } from '../src/client/shared.ts'

/** One descriptor as the settings service reports it. */
function descriptorWith(models, extraProviders = {}) {
  return {
    ns: 'llm-pi-ai',
    revision: 7,
    value: {
      writable: true,
      providers: {
        newapi: { api: 'openai-completions', models },
        ...extraProviders,
      },
    },
  }
}

test('a written list replaces the one the descriptor held', () => {
  const descriptor = descriptorWith([{ id: 'a/b', name: '旧名称' }])
  const written = [{ id: 'a/b', name: '【a】 新名称' }]
  const next = withWrittenModels(descriptor, 'newapi', written, 8)

  assert.equal(next.value.providers.newapi.models[0].name, '【a】 新名称')
  assert.equal(next.revision, 8)
})

test('the descriptor the page held is not mutated', () => {
  const models = [{ id: 'a/b', name: '旧名称' }]
  const descriptor = descriptorWith(models)
  withWrittenModels(descriptor, 'newapi', [{ id: 'a/b', name: '新名称' }], 8)

  assert.equal(descriptor.value.providers.newapi.models[0].name, '旧名称')
  assert.equal(descriptor.revision, 7)
})

test('other providers survive a write untouched', () => {
  const other = { api: 'openai-completions', models: [{ id: 'x/y', name: '别的供应商' }] }
  const descriptor = descriptorWith([{ id: 'a/b', name: '旧' }], { free: other })
  const next = withWrittenModels(descriptor, 'newapi', [{ id: 'a/b', name: '新' }], 9)

  assert.deepEqual(next.value.providers.free, other)
})

test('other fields of the provider and of each model survive', () => {
  const descriptor = {
    ns: 'llm-pi-ai',
    revision: 1,
    value: {
      providers: {
        newapi: {
          api: 'openai-completions',
          baseURL: 'https://example.test/v1',
          models: [{ id: 'a/b', name: '旧', contextWindow: 128000, input: ['text'] }],
        },
      },
    },
  }
  const written = [{ id: 'a/b', name: '【a】 新', contextWindow: 128000, input: ['text'] }]
  const next = withWrittenModels(descriptor, 'newapi', written, 2)

  assert.equal(next.value.providers.newapi.api, 'openai-completions')
  assert.equal(next.value.providers.newapi.baseURL, 'https://example.test/v1')
  assert.equal(next.value.providers.newapi.models[0].contextWindow, 128000)
})

test('a revision the service did not give is not written', () => {
  const descriptor = descriptorWith([])
  const next = withWrittenModels(descriptor, 'newapi', [], undefined)
  assert.equal(next.revision, 7)
})

test('renaming then reordering keeps the new names', () => {
  // Simulates the report: write the redirect, then write the reorder. The
  // second pass must start from the renamed list, not the descriptor's old one.
  const original = [
    { id: 'z/x', name: 'x' },
    { id: 'a/y', name: 'y' },
  ]
  let descriptor = descriptorWith(original)

  const renamed = original.map(m => ({ ...m, name: `【${m.id.split('/')[0]}】 ${m.name}` }))
  descriptor = withWrittenModels(descriptor, 'newapi', renamed, 8)

  // The rebuild a sort-mode switch or a reorder does, from the descriptor.
  const rebuilt = descriptor.value.providers.newapi.models
  assert.deepEqual(rebuilt.map(m => m.name), ['【z】 x', '【a】 y'])

  const reordered = [...rebuilt].sort((l, r) => (l.id < r.id ? -1 : 1))
  descriptor = withWrittenModels(descriptor, 'newapi', reordered, 9)

  // Order changed, names did not.
  assert.deepEqual(descriptor.value.providers.newapi.models.map(m => m.id), ['a/y', 'z/x'])
  assert.deepEqual(descriptor.value.providers.newapi.models.map(m => m.name), ['【a】 y', '【z】 x'])
})
