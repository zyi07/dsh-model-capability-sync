/**
 * Matching one configured gateway model id against the models.dev catalog.
 *
 * A gateway aggregates arbitrary upstreams and invents its own ids, so the
 * match walks from strict to loose and reports which rule fired — the UI shows
 * it, and an explicit alias always wins.
 * @module dsh-model-capability-sync/match
 */
import type { Catalog, CatalogEntry } from './catalog.ts'
import type { MatchInfo, MatchVia } from './types.ts'

/**
 * Variant suffixes a gateway appends to one upstream model. Stripping them
 * turns `gemini-3.8-flash-high` back into the catalog's `gemini-3.8-flash`.
 */
const VARIANT_SUFFIX = /-(high|low|medium|minimal|max|xhigh|thinking|preview|latest|chat)$/

/**
 * How a display name is reduced to the thing worth looking up.
 *
 * The name-redirect section appends `【qoder】` to a label, and people annotate
 * by hand in other ways (`Qwen3.8-Flash (qoder)`, `[cn] Qwen3.8-Flash`). Those
 * annotations are provenance, not model identity: `qoder` is a gateway, and if
 * the annotation were left in, this plugin's own renaming would change what it
 * resolves. Bracketed segments go; the rest is trimmed to one line.
 */
const SOURCE_ANNOTATION = /【[^】]*】|\([^)]*\)|\[[^\]]*\]/g

/**
 * Reduce a display name to its model part.
 * @param name - the configured label.
 * @returns the label without source annotations or stray whitespace.
 */
export function cleanDisplayName(name: string): string {
  return name.replace(SOURCE_ANNOTATION, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * First-party vendor provider ids in the models.dev catalog. The same model
 * appears under dozens of aggregators whose capacity numbers disagree, so a
 * vendor entry outranks every reseller when both exist.
 */
const FIRST_PARTY = new Set([
  'openai', 'anthropic', 'google', 'deepseek', 'xai', 'meta', 'mistral', 'cohere',
  'moonshotai', 'moonshotai-cn', 'zai', 'zhipuai', 'alibaba', 'alibaba-cn', 'qwen',
  'sensenova', 'minimax', 'stepfun', 'bytedance', 'baidu', 'nvidia', 'microsoft',
  'amazon', 'ai21', 'perplexity', 'upstage', '01-ai', 'inclusionai', 'tencent', 'kuaishou',
])

/** How complete an entry's facts are; the most complete wins a tie. */
function score(entry: CatalogEntry): number {
  const model = entry.model
  let value = 0
  if (FIRST_PARTY.has(entry.provider)) value += 5
  if (model.limit?.context !== undefined || model.limit?.output !== undefined) value += 2
  if (model.modalities?.input !== undefined) value += 2
  if (model.reasoning_options !== undefined) value += 1
  if (model.name !== undefined) value += 1
  return value
}

/**
 * Pick the best of several provider entries for the same id: the one carrying
 * the most facts, then the alphabetically first provider so repeated runs are
 * stable.
 */
function pickBest(entries: readonly CatalogEntry[]): CatalogEntry | undefined {
  let best: CatalogEntry | undefined
  let bestScore = -1
  for (const entry of entries) {
    const value = score(entry)
    if (value > bestScore || value === bestScore && best !== undefined && entry.provider < best.provider) {
      best = entry
      bestScore = value
    }
  }
  return best
}

/** The id without its vendor path prefix (`qoder-gj/DeepSeek-Flash` → `DeepSeek-Flash`). */
function basename(id: string): string {
  const slash = id.lastIndexOf('/')
  return slash === -1 ? id : id.slice(slash + 1)
}

/** Look one key up exactly, then case-insensitively. */
function lookup(catalog: Catalog, key: string): { entries: readonly CatalogEntry[]; via: MatchVia } | undefined {
  const exact = catalog.byId.get(key)
  if (exact !== undefined) return { entries: exact, via: 'exact' }
  const folded = catalog.byFolded.get(key.toLowerCase())
  if (folded !== undefined) return { entries: folded, via: 'folded' }
  return undefined
}

/** Build the public match record for one chosen entry. */
function describe(entry: CatalogEntry, via: MatchVia): MatchInfo {
  return {
    provider: entry.provider,
    modelId: entry.id,
    via,
    firstParty: FIRST_PARTY.has(entry.provider),
    ...entry.model.name === undefined ? {} : { name: entry.model.name },
  }
}

/** Try one key exactly, folded, then without a variant suffix. */
function resolve(catalog: Catalog, key: string): { entry: CatalogEntry; via: MatchVia } | undefined {
  const hit = lookup(catalog, key)
  if (hit !== undefined) {
    const entry = pickBest(hit.entries)
    if (entry !== undefined) return { entry, via: hit.via }
  }
  const stripped = key.replace(VARIANT_SUFFIX, '')
  if (stripped !== key && stripped.length > 0) {
    const again = lookup(catalog, stripped)
    if (again !== undefined) {
      const entry = pickBest(again.entries)
      if (entry !== undefined) return { entry, via: 'suffix' }
    }
  }
  return undefined
}

/**
 * Resolve one gateway model id.
 *
 * The walk is strict to loose: the id first, then the id without its vendor
 * prefix and variant suffix, then the configured display name, and an explicit
 * alias last. The id outranks the name because an exact id is the user's own
 * fact; the name comes second because a gateway may expose `qoder/qfmodel`
 * labelled `Qwen3.8-Flash`, and the label names the model the id hides. The
 * alias is last on purpose: it is a hand-made fallback, and an alias already
 * applied to a name would be inherited by every row the name resolves — the
 * opposite of an override.
 * @param catalog - the indexed catalog.
 * @param id - the gateway model id exactly as configured.
 * @param aliases - explicit gateway id → catalog id overrides.
 * @param name - the configured display name, when there is one.
 * @returns the match, or `undefined` when nothing fits.
 */
export function matchModel(
  catalog: Catalog,
  id: string,
  aliases: Readonly<Record<string, string>> = {},
  name = '',
): MatchInfo | undefined {
  const exact = lookup(catalog, id)
  if (exact !== undefined) {
    const entry = pickBest(exact.entries)
    if (entry !== undefined) return describe(entry, exact.via)
  }

  const base = basename(id)
  if (base !== id) {
    const hit = lookup(catalog, base)
    if (hit !== undefined) {
      const entry = pickBest(hit.entries)
      if (entry !== undefined) return describe(entry, 'basename')
    }
  }

  const stripped = base.replace(VARIANT_SUFFIX, '')
  if (stripped !== base && stripped.length > 0) {
    const hit = lookup(catalog, stripped)
    if (hit !== undefined) {
      const entry = pickBest(hit.entries)
      if (entry !== undefined) return describe(entry, 'suffix')
    }
  }

  // From here the name speaks for the id: try it as-is, then its last segment
  // (`qoder/DeepSeek-Flash【qoder】` → `DeepSeek-Flash`). The trailing bracketed
  // annotation is dropped first, so whether the name-redirect section ran
  // never changes the answer.
  const label = cleanDisplayName(name)
  if (label.length > 0) {
    const hit = resolve(catalog, label)
    if (hit !== undefined) {
      return { ...describe(hit.entry, hit.via === 'suffix' ? 'nameSuffix' : 'name'), matchedName: label, nameSource: 'name' }
    }
    const tail = basename(label)
    if (tail !== label && tail.length > 0) {
      const loose = resolve(catalog, tail)
      if (loose !== undefined) {
        return { ...describe(loose.entry, loose.via === 'suffix' ? 'nameSuffix' : 'name'), matchedName: tail, nameSource: 'name' }
      }
    }
  }

  const alias = aliases[id]
  if (alias !== undefined && alias.length > 0) {
    const hit = lookup(catalog, alias)
    const entry = hit === undefined ? undefined : pickBest(hit.entries)
    if (entry !== undefined) return describe(entry, 'alias')
  }

  return undefined
}
