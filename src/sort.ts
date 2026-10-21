/**
 * Ordering for one provider's model list.
 *
 * A gateway id carries its vendor as a path prefix (`qoder-gj/Qwen3.8-Flash`),
 * so sorting on the whole id would group by nothing useful: the model family
 * is the part after the slash, and the vendor is what a reader scans for. The
 * order is therefore: vendor prefix first, then the model name inside it. An
 * id without a prefix has only its name to sort on.
 *
 * Comparison is case-insensitive, with the raw id as the final tie-break, so
 * two runs on the same configuration always produce the same array.
 * @module dsh-model-capability-sync/sort
 */

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
 * Return a sorted copy of a model list.
 * @param items - entries in any order; the input array is never mutated.
 * @param idOf - reads the model id out of one entry.
 * @returns the entries in vendor-then-name order.
 */
export function sortByModelId<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  return [...items].sort((left, right) => compareModelIds(idOf(left), idOf(right)))
}
