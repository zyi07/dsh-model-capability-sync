/**
 * Name redirection: move a gateway id's source prefix to the end of the
 * display name.
 *
 * A gateway namespaces its upstream by a path prefix (`qoder/qfmodel`,
 * `qoder-cn/qfmodel`, `antigravity/gemini-3.8-flash`) and keeps the upstream's
 * own label as the name. Two sources that offer the same model therefore look
 * identical in the model picker — both read "Qwen3.8-Flash" — and the only
 * clue to which source serves the answer is buried in an id nobody sees while
 * chatting.
 *
 * The rule here is deliberately mechanical: take the first path segment of the
 * id, strip anything of that shape already on the name (a leading `prefix/`, a
 * trailing 【prefix】, or the earlier half-width ` (prefix)`), then append
 * 【prefix】. So the prefix ends up in exactly one place, at the end, in one
 * spelling. Re-running the rule is a no-op, so a second apply never stacks
 * suffixes on top of each other.
 *
 * This module is pure: no settings access, no React. The section renders the
 * plan and writes it through the official settings service.
 * @module dsh-model-capability-sync/rename
 */
import type { ModelDraft } from './shared.ts'
import { textOf } from './shared.ts'

/** One model and the name redirect that applies to it. */
export interface NameRow {
  /** The gateway model id exactly as configured. */
  id: string
  /** The source prefix (the first path segment), or `''` when the id has none. */
  prefix: string
  /** What the picker shows today: the stored name, or the id when it is blank. */
  before: string
  /** What the picker would show after the redirect. */
  after: string
  /** True when applying would actually rewrite the stored name. */
  changed: boolean
}

/**
 * The source prefix of one gateway id.
 *
 * Only the first path segment counts: a gateway may nest further
 * (`qoder/gj/qwen3.8`), but the thing that distinguishes sources is the
 * outermost one.
 * @param id - the gateway model id exactly as configured.
 * @returns the prefix, or `''` when the id has no usable prefix.
 */
export function sourcePrefixOf(id: string): string {
  const slash = id.indexOf('/')
  if (slash <= 0) return ''
  return id.slice(0, slash)
}

/**
 * The part of an id after its prefix — the fallback label when a model has no
 * name of its own.
 * @param id - the gateway model id exactly as configured.
 * @returns the remainder after the first slash, or the whole id without one.
 */
function bareIdOf(id: string): string {
  const slash = id.indexOf('/')
  if (slash === -1) return id
  const rest = id.slice(slash + 1)
  return rest === '' ? id : rest
}

/**
 * Compute the redirected name for one model.
 *
 * The suffix uses full-width brackets — `【qoder】` — because a model label is
 * already dense with ASCII (`Qwen3.8-Flash (0305)`), and another pair of ASCII
 * parentheses would read as part of the upstream's own name.
 * @param id - the gateway model id exactly as configured.
 * @param name - the stored display name; the empty string when it is unset.
 * @returns the prefix, both labels, and whether the write changes anything.
 */
export function redirectName(id: string, name: string): Omit<NameRow, 'id'> {
  const prefix = sourcePrefixOf(id)
  const before = name !== '' ? name : id
  if (prefix === '') return { prefix, before, after: before, changed: false }
  const suffix = `【${prefix}】`
  // Strip our own previous suffix first, so applying twice is a no-op. The
  // half-width `(prefix)` shape is stripped too: it was an earlier spelling of
  // this same rule, and normalizing it costs one more endsWith check.
  let base = name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
  const legacy = ` (${prefix})`
  if (base.endsWith(legacy)) base = base.slice(0, -legacy.length)
  // A name that still carries the prefix at the front — the usual case, since
  // a gateway hands back `beichen/gpt-6-astra` as the label — is cleaned too:
  // the prefix moves to the end, it must not stay at the front as well.
  const lead = `${prefix}/`
  if (base.startsWith(lead)) base = base.slice(lead.length)
  base = base.trimEnd()
  if (base === '') base = bareIdOf(id)
  const after = `${base}${suffix}`
  return { prefix, before, after, changed: after !== before }
}

/**
 * Build the redirect plan for one provider's models.
 * @param models - the stored entries, in display order.
 * @returns one row per entry, in the same order.
 */
export function planNames(models: readonly ModelDraft[]): NameRow[] {
  return models.map((model) => {
    const id = textOf(model, 'id')
    return { id, ...redirectName(id, textOf(model, 'name')) }
  })
}

/**
 * Apply a redirect plan to the stored entries.
 *
 * Only selected ids are touched, and only when the redirect actually changes
 * the name, so a stale plan cannot rewrite a label the user just edited.
 * @param models - the stored entries, in stored order.
 * @param selected - ids to rewrite.
 * @returns the new entries plus how many were rewritten.
 */
export function renameModels(models: readonly ModelDraft[], selected: ReadonlySet<string>): { next: ModelDraft[]; written: number } {
  let written = 0
  const next = models.map((model) => {
    const id = textOf(model, 'id')
    if (!selected.has(id)) return model
    const { after, changed } = redirectName(id, textOf(model, 'name'))
    if (!changed) return model
    written += 1
    return { ...model, name: after }
  })
  return { next, written }
}
