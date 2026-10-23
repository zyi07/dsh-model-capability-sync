/**
 * Ordering for one provider's model list.
 *
 * A gateway id carries its vendor as a path prefix (`qoder-gj/Qwen3.8-Flash`),
 * so sorting on the whole id would group by nothing useful: the model family
 * is the part after the slash, and the vendor is what a reader scans for.
 *
 * Two orders are offered, because two different questions get asked of the
 * same list. `prefix` groups by vendor -- the right shape when the list is
 * arranged around who serves what. `redirected` sorts on the name a picker
 * shows once the source prefix has been moved to the end
 * (`Qwen3.8-Flash【qoder】`, literally with full-width brackets),
 * which reads as one alphabetical model list instead of one silo per vendor.
 *
 * Comparison is case-insensitive, with the raw id as the final tie-break, so
 * two runs on the same configuration always produce the same array.
 * @module dsh-model-capability-sync/sort
 */

/** How a model list is ordered. */
export type SortMode = 'prefix' | 'redirected'


/** The two ordering keys of one id: the vendor group, then the model name. */
export interface ModelSortKey {
  /** The prefix before the last slash, or the whole id when there is none. */
  group: string
  /** The part after the last slash, or the whole id when there is none. */
  name: string
}

/**
 * Split one id into its ordering keys.
 * @param id - the gateway model id exactly as configured.
 * @returns folded keys; the caller compares them, never displays them.
 */
export function modelSortKey(id: string): ModelSortKey {
  const slash = id.lastIndexOf('/')
  if (slash === -1) {
    const folded = id.toLowerCase()
    return { group: folded, name: folded }
  }
  return { group: id.slice(0, slash).toLowerCase(), name: id.slice(slash + 1).toLowerCase() }
}

/**
 * The prefix a redirect would append, i.e. the vendor segment of the id.
 * @param id - the gateway model id exactly as configured.
 * @returns the first path segment, or `''` when the id has none.
 */
export function sourcePrefix(id: string): string {
  const slash = id.indexOf('/')
  return slash <= 0 ? '' : id.slice(0, slash)
}

/**
 * The label a picker shows once the name-redirect rule has run.
 *
 * Kept in step with `redirectName` by construction rather than by import: the
 * ordering code stays a pure comparator over strings, and the rule itself
 * lives in the client. The bracketed prefix is always the last thing on the
 * label, so stripping all trailing bracket annotations gives the name the sort
 * should read.
 *
 * Annotations are `【prefix】` (ours), `(anything)` (upstream or user), or
 * `[anything]` (user); stripping all of them ensures a consistent sort key
 * regardless of how many times the list has been touched.
 * @param id - the gateway model id exactly as configured.
 * @param name - the configured display name; `''` when unset.
 * @returns the label without any trailing bracket annotation, lower-cased.
 */
export function redirectedLabel(id: string, name: string): string {
  const prefix = sourcePrefix(id)
  let base = name !== '' ? name : id
  // Strip any trailing bracket pairs. Order matters: strip 【】 first (ours), then () and [] (user/upstream).
  const annotations = /\s*【[^】]*】\s*|\s*\([^)]*\)\s*|\s*\[[^\]]*\]\s*$/
  while (annotations.test(base)) {
    base = base.replace(annotations, '')
  }
  const trimmed = base.trim()
  return (trimmed !== '' ? trimmed : id).toLowerCase()
}

/**
 * Compare two ids in display order.
 * @param left - first id.
 * @param right - second id.
 * @returns negative when `left` sorts first, positive when `right` does.
 */
export function compareModelIds(left: string, right: string): number {
  const a = modelSortKey(left)
  const b = modelSortKey(right)
  if (a.group !== b.group) return a.group < b.group ? -1 : 1
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  // Same folded pair: keep the raw spelling as the tie-break so the result is
  // deterministic instead of depending on the input order.
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Compare two ids as `redirected` order would list them: on the label the
 * picker shows, with the raw id breaking ties.
 * @param left - first id.
 * @param right - second id.
 * @param nameOf - reads one id's display name.
 * @returns negative when `left` sorts first, positive when `right` does.
 */
export function compareRedirected(
  left: string,
  right: string,
  nameOf: (id: string) => string,
): number {
  const a = redirectedLabel(left, nameOf(left))
  const b = redirectedLabel(right, nameOf(right))
  if (a !== b) return a < b ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Return a sorted copy of a model list.
 * @param items - entries in any order; the input array is never mutated.
 * @param idOf - reads the model id out of one entry.
 * @param nameOf - reads the display name out of one entry.
 * @param mode - `prefix` (vendor groups) or `redirected` (shown label).
 * @returns the entries in the requested order.
 */
export function sortByModelId<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  nameOf: (item: T) => string = () => '',
  mode: SortMode = 'prefix',
): T[] {
  const copy = [...items]
  if (mode === 'redirected') {
    const names = new Map(copy.map(item => [idOf(item), nameOf(item)] as const))
    return copy.sort((left, right) => compareRedirected(idOf(left), idOf(right), id => names.get(id) ?? ''))
  }
  return copy.sort((left, right) => compareModelIds(idOf(left), idOf(right)))
}
