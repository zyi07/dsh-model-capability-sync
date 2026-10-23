/**
 * Name redirection: automatically prepend each gateway model's source prefix.
 *
 * A gateway namespaces its upstream by a path prefix (`qoder/qfmodel`,
 * `qoder-cn/qfmodel`, `antigravity/gemini-3.8-flash`) and keeps the upstream's
 * own label as the name. Two sources that offer the same model therefore look
 * identical in the model picker — both read "Qwen3.8-Flash" — and the only
 * clue to which source serves the answer is buried in an id nobody sees while
 * chatting.
 *
 * The rule here is applied to ALL models automatically:
 * - Models with a source prefix (e.g. `qoder/`) get 【vendor】 prepended
 * - Models without a prefix get 【other】 prepended
 *
 * The rule is deliberately mechanical: take the first path segment of the id
 * (or use 'other' if none), strip anything of that shape already on the name
 * (leading 【prefix】, a prefix/ at the front, or a trailing 【prefix】 from
 * before the redesign), then prepend 【prefix】 followed by a space. So the
 * prefix ends up in exactly one place, at the front, in one spelling.
 * Re-running the rule is a no-op, so reapplying never stacks prefixes.
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
 * All models get a prefix annotation: one extracted from the id (e.g. `qoder/` → `【qoder】`),
 * or `【other】` when the id has no path segment. The prefix uses full-width brackets
 * because a model label is already dense with ASCII, and parentheses would read as
 * part of the upstream's own name. Placing it at the front makes it immediately
 * visible as the source, improving clarity.
 * @param id - the gateway model id exactly as configured.
 * @param name - the stored display name; the empty string when it is unset.
 * @returns the prefix, both labels, and whether the write changes anything.
 */
export function redirectName(id: string, name: string): Omit<NameRow, 'id'> {
  let prefix = sourcePrefixOf(id)
  if (prefix === '') prefix = 'other' // No source prefix in id → use 【other】
  
  const before = name !== '' ? name : id
  const prefix_bracket = `【${prefix}】`
  const prefix_space = `${prefix_bracket} `

  // If already has the exact prefix at the beginning, no change needed (idempotent).
  if (before.startsWith(prefix_space)) {
    return { prefix, before, after: before, changed: false }
  }

  // Strip any existing bracket annotation (both leading and trailing).
  // This handles both our 【prefix】 (new prefix-at-start), the old rule's suffix
  // 【prefix】 (at the end), legacy ( ) and user-added [ ] gracefully.
  let stripped = before

  // Strip any leading bracket annotation (【】, (), [])
  const leadingAnnotations = /^【[^】]*】\s*|\s*\([^)]*\)\s*|\s*\[[^\]]*\]\s*/
  stripped = stripped.replace(leadingAnnotations, '')

  // Strip any trailing bracket annotation
  const trailingAnnotations = /\s*【[^】]*】\s*|\s*\([^)]*\)\s*|\s*\[[^\]]*\]\s*$/
  while (trailingAnnotations.test(stripped)) {
    stripped = stripped.replace(trailingAnnotations, '')
  }

  // Strip leading prefix if present (user might have put "qoder/ModelName")
  const originalPrefix = sourcePrefixOf(id)
  if (originalPrefix !== '') {
    const lead = `${originalPrefix}/`
    if (stripped.startsWith(lead)) {
      stripped = stripped.slice(lead.length)
    }
  }

  const base = stripped.trimEnd() !== '' ? stripped.trimEnd() : bareIdOf(id)
  const after = `${prefix_space}${base}`
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
