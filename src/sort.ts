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
 * The redirected sort key for one model: the source prefix (in brackets) as the primary key.
 *
 * When models are redirected to have the source prefix at the beginning in full-width
 * brackets (`【workbuddy】 GLM-5.3-Flash`), a natural sort is to group by that
 * prefix first (so all `【workbuddy】` together), then sort within the group by
 * the model name. Models without a source prefix use `【other】` as their group.
 * This gives the appearance of a list organized by vendor, with a readable name
 * for each.
 *
 * The prefix is extracted from the displayed name if present; if absent,
 * the ID prefix is used (or 'other' if the ID has no prefix).
 *
 * @param id - the gateway model id exactly as configured.
 * @param name - the configured display name; `''` when unset.
 * @returns a tuple `[prefix, modelName]` for two-level sort: first by prefix,
 *          then by name, both lower-cased.
 */
export function redirectedSortKey(id: string, name: string): [string, string] {
  const idPrefix = sourcePrefix(id)
  const displayName = name !== '' ? name : id

  // Extract the bracketed prefix from the beginning or end of the display name.
  // Patterns: 【vendor】 (new, at start), (vendor) at start, or [vendor]
  let extracted = ''
  let cleaned = displayName

  // Try leading full-width 【vendor】 first (the new format)
  const leadingFullWidthMatch = displayName.match(/^【([^】]+)】\s*/)
  if (leadingFullWidthMatch) {
    extracted = leadingFullWidthMatch[1] ?? ''
    cleaned = displayName.slice(leadingFullWidthMatch[0].length).trim()
  } else {
    // Try trailing full-width 【vendor】 (old format, backward compatibility)
    const trailingFullWidthMatch = displayName.match(/【([^】]+)】\s*$/)
    if (trailingFullWidthMatch) {
      extracted = trailingFullWidthMatch[1] ?? ''
      cleaned = displayName.slice(0, -trailingFullWidthMatch[0].length).trim()
    } else {
      // Try half-width () or [] at any position
      const halfWidthMatch = displayName.match(/[([]\s*([^)\]]*)\s*[)\]]\s*/)
      if (halfWidthMatch) {
        extracted = halfWidthMatch[1] ?? ''
        // Remove the matched half-width from cleaned
        cleaned = displayName.replace(halfWidthMatch[0], '').trim()
      }
    }
  }

  // If no prefix was found in the name, use the ID prefix (or 'other' if none)
  const sortPrefix = extracted !== '' ? extracted : (idPrefix !== '' ? idPrefix : 'other')
  // If the cleaned name is empty, use the ID without its prefix as fallback
  const sortName = cleaned !== '' ? cleaned : (idPrefix !== '' ? id.slice(idPrefix.length + 1) : id)

  return [sortPrefix.toLowerCase(), sortName.toLowerCase()]
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
 * Compare two ids as `redirected` order would list them: group by source
 * prefix (from the bracketed annotation), then sort by model name within group.
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
  const [aPrefix, aName] = redirectedSortKey(left, nameOf(left))
  const [bPrefix, bName] = redirectedSortKey(right, nameOf(right))
  // Primary sort: by prefix (vendor)
  if (aPrefix !== bPrefix) return aPrefix < bPrefix ? -1 : 1
  // Secondary sort: by model name within the same prefix
  if (aName !== bName) return aName < bName ? -1 : 1
  // Tie-break: raw IDs for determinism
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
