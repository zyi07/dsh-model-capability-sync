/**
 * Settings shapes and provider-entry helpers shared by the plugin's two
 * settings sections: capability sync and name redirect.
 *
 * The browser half only sees `settings.describe` / `settings.mutate`, and that
 * document is structurally open — these helpers keep every unknown field alive
 * instead of narrowing the entry to the fields this plugin understands.
 * @module dsh-model-capability-sync/client/shared
 */
import type { SortMode } from '../sort.ts'
import { sortByModelId } from '../sort.ts'

/** One settings descriptor as the remote reports it (only the fields used here). */
export interface SettingsDescriptor {
  ns: string
  revision: number
  value: Record<string, unknown>
}

/** One ordered form edit understood by `settings.mutate`. */
export interface SettingsPathOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

/** The settings surface both sections read and write through. */
export interface SettingsInjected {
  describeSettings(): Promise<SettingsDescriptor[]>
  mutateSettings(ns: string, ops: SettingsPathOp[], expectedRevision?: number): Promise<SettingsDescriptor>
}

/** A model entry as the provider stores it: structurally open, so unknown fields survive. */
export type ModelDraft = Record<string, unknown>

/** The official adapter this plugin fills capabilities into. */
export const TARGET_DEFAULT = 'llm-pi-ai'

/**
 * How a writable settings namespace reads to a person.
 *
 * A namespace id is an internal identity, so the page names the thing it
 * configures instead. Provenance is a table, not a guess: the client cannot
 * see which package owns a namespace (`settings.describe` reports only
 * `ns/revision/value/base/user`), and inferring "official" from an `llm-`
 * prefix would eventually mislabel a third-party plugin. A namespace this
 * table does not know is shown as a plugin, with its id.
 */
export const TARGET_DIRECTORY: Record<string, { native: boolean; nameKey: string }> = {
  'llm-pi-ai': { native: true, nameKey: 'nameLlmPiAi' },
  'llm-deepseek': { native: true, nameKey: 'nameLlmDeepseek' },
  'llm-deepseek-account': { native: true, nameKey: 'nameLlmDeepseekAccount' },
  'llm-newapi': { native: false, nameKey: 'nameLlmNewapi' },
}

/** The bound translate function the shell hands to a section. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * Render one namespace as provenance plus a name.
 * @param ns - the settings namespace id.
 * @param t - the bound translate function.
 * @returns copy such as `原生配置 · pi-ai`, never a bare namespace id.
 */
export function targetLabelOf(ns: string, t: Translate): string {
  const known = TARGET_DIRECTORY[ns]
  if (known === undefined) return `${t('sourcePlugin')} · ${ns}`
  return `${known.native ? t('sourceNative') : t('sourcePlugin')} · ${t(known.nameKey)}`
}

/** The provider dict inside one descriptor's live value. */
export function providersOf(descriptor: SettingsDescriptor | undefined): Record<string, Record<string, unknown>> {
  const providers = descriptor?.value?.providers
  return typeof providers === 'object' && providers !== null
    ? providers as Record<string, Record<string, unknown>>
    : {}
}

/** The models array of one provider profile. */
export function modelsOf(provider: Record<string, unknown> | undefined): ModelDraft[] {
  const models = provider?.models
  return Array.isArray(models) ? models.filter((entry): entry is ModelDraft => typeof entry === 'object' && entry !== null) : []
}

/** The models of one provider profile, in display order. */
export function sortedModelsOf(provider: Record<string, unknown> | undefined, mode: SortMode = 'prefix'): ModelDraft[] {
  return sortByModelId(
    modelsOf(provider),
    model => textOf(model, 'id'),
    model => textOf(model, 'name'),
    mode,
  )
}

/** Read a string field, or the empty string. */
export function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Decide whether a stored field counts as "the user has not said anything".
 *
 * The configuration schema fills defaults for absent fields (`input` reads as
 * `[]`), and those defaults are not user intent, so they count as blank.
 * @param value - the stored value.
 * @returns true when filling the field loses no user intent.
 */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

/**
 * Replace one provider's model list inside a descriptor, keeping everything
 * else it carries.
 *
 * A write updates the configuration, so the descriptor the page holds must
 * follow: otherwise the next rebuild from that descriptor (a sort-mode switch,
 * a provider switch, a conflict reload) hands back the pre-write models and the
 * names that were just applied disappear. This is the pure half of that update,
 * separated so it can be tested without a running settings service.
 *
 * Only `providers[key].models` moves. Other providers, and other fields of this
 * provider and its models, are carried over untouched.
 * @param descriptor - the descriptor as the page held it.
 * @param providerKey - which provider was written.
 * @param models - the list that was written.
 * @param revision - the revision the service answered with, when it gave one.
 * @returns a new descriptor; the input is not mutated.
 */
export function withWrittenModels(
  descriptor: SettingsDescriptor,
  providerKey: string,
  models: readonly ModelDraft[],
  revision: number | undefined,
): SettingsDescriptor {
  const providers = providersOf(descriptor)
  const provider = providers[providerKey]
  const nextProviders = provider === undefined
    ? providers
    : { ...providers, [providerKey]: { ...provider, models: [...models] } }
  return {
    ...descriptor,
    ...revision === undefined ? {} : { revision },
    value: { ...descriptor.value, providers: nextProviders },
  }
}
