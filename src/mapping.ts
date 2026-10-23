/**
 * Turning one catalog entry into the capability fields a provider model entry
 * accepts.
 *
 * Everything here is a pure function of catalog data: no gateway call, no
 * guessing beyond the catalog's own facts. A field the catalog does not state
 * stays absent, so the writer never invents a value.
 * @module dsh-model-capability-sync/mapping
 */
import type { CatalogEntry } from './catalog.ts'
import type { CapabilityFields, Modality } from './types.ts'

/** Thinking levels the harness recognizes, strongest last. */
const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/** A positive integer or nothing. */
function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
}

/** Map the catalog's media list onto the harness's two modalities. */
function modalitiesOf(entry: CatalogEntry): Modality[] | undefined {
  const declared = entry.model.modalities?.input
  if (declared === undefined) return undefined
  const accepted: Modality[] = []
  for (const media of declared) {
    if (media === 'image' && !accepted.includes('image')) accepted.push('image')
  }
  // A model that lists only images still reads text in practice; the harness
  // always sends text, so `text` is never dropped.
  return ['text', ...accepted]
}

/**
 * Build the reasoning-effort map from the catalog's `effort` option.
 * @returns the dict, `false` when the catalog says the model cannot reason, or
 *   `undefined` when the catalog is silent.
 */
function reasoningOf(entry: CatalogEntry): Record<string, string> | false | undefined {
  const model = entry.model
  if (model.reasoning === false) return false
  const option = model.reasoning_options?.find(candidate => candidate.type === 'effort')
  const values = option?.values ?? []
  const efforts: Record<string, string> = {}
  for (const value of values) {
    if (typeof value !== 'string') continue
    if (!THINKING_LEVELS.has(value)) continue
    efforts[value] = value
  }
  return Object.keys(efforts).length > 0 ? efforts : undefined
}

/**
 * Read every capability the catalog states for one entry.
 *
 * The catalog's display name is deliberately not returned: this plugin fills
 * facts, it never renames a model entry. Renaming has its own section, and the
 * two must stay separable — a fill that also renamed would make the redirect
 * undoable.
 * @param entry - the matched catalog entry.
 * @returns only the fields the catalog actually declares.
 */
export function capabilitiesOf(entry: CatalogEntry): CapabilityFields {
  const model = entry.model
  const input = modalitiesOf(entry)
  const reasoningEfforts = reasoningOf(entry)
  return {
    ...positive(model.limit?.context) === undefined ? {} : { contextWindow: positive(model.limit?.context) as number },
    ...positive(model.limit?.output) === undefined ? {} : { maxTokens: positive(model.limit?.output) as number },
    ...input === undefined ? {} : { input },
    ...reasoningEfforts === undefined ? {} : { reasoningEfforts },
  }
}
