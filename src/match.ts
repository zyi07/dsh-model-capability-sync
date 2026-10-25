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
 * Variant suffixes a gateway appends to one upstream model.
 *
 * A gateway re-labels the same upstream with its own selling point: `-high`,
 * `-max` (a bigger window), `-tiered`, `-trial` (a trial tier), `-official`
 * (the vendor's own route rather than an aggregator's), `-free`, `-it` (an
 * instruction-tuned build), `-reasoning`, `-disabled` (a model the vendor
 * publishes but will not serve). None of these changes what the model *is*, so
 * stripping them turns `gemini-3.8-flash-tiered` back into the catalog's
 * `gemini-3.8-flash` — which is what its capability facts describe.
 */
const VARIANT_SUFFIX = /[-_](high|low|medium|minimal|max|xhigh|thinking|preview|latest|chat|tiered|disabled|trial|official|free|stable|experimental|reasoning|it|instruct|base|pro|flash|mini|nano|small|large)$/i

/**
 * A reseller's route tag: `:free`, `:beta`, `:nitro`. It rides on the end of an
 * id and says how the model is sold, never what it is.
 */
const ROUTE_TAG = /:[a-z0-9][a-z0-9_-]*$/i

/**
 * A trailing build number: `kimi-k3-1`, `deepseek-v4-2`.
 *
 * Gateways stamp a revision onto an id without changing the model, and the
 * catalog usually holds only the unnumbered one. Only a bare integer tail is
 * stripped, so `claude-sonnet-4-5` (where `5` is part of the version) is left
 * for the dotted/named rules to handle first.
 */
const BUILD_NUMBER = /-\d{1,2}$/

/**
 * A reseller's own namespace wrapped around an upstream id: `sn-glm-5-3`.
 *
 * Aggregators (raccoon and friends) put a two-to-four letter tag in front of the
 * upstream id to mark which of their pools it comes from. `sn` is not a provider
 * id in the catalog — it is the reseller's abbreviation — so the tag carries no
 * information about the model. Only a tag that, once removed, leaves the exact
 * upstream id is accepted (see {@link resolveVendorPrefix}), which is what keeps
 * a genuinely namespaced id like `kimi-k3` from being mistaken for a prefixed
 * one.
 */
const VENDOR_PREFIX = /^([a-z]{2,4})-(.+)$/i

/**
 * Strip every variant marker from one key, repeatedly.
 *
 * Gateways stack markers (`gemma-4-26b-a4b-it:free` carries both `-it` and
 * `:free`, `nemotron-3-nano-omni-30b-a3b-reasoning:free` both again), so one
 * pass is not enough. The loop is bounded: each pass must shorten the key, and
 * a key stripped to nothing is abandoned rather than searched as `''`.
 * @param key - one candidate id.
 * @returns the shortest key the markers allow, or undefined when none came off.
 */
function stripMarkers(key: string): string | undefined {
  let current = key
  for (let pass = 0; pass < 6; pass += 1) {
    const next = current.replace(ROUTE_TAG, '').replace(VARIANT_SUFFIX, '').replace(BUILD_NUMBER, '')
    if (next === current || next.length === 0) break
    current = next
  }
  return current === key ? undefined : current
}

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

/**
 * Index the catalog's ids by their leading text, so a truncated key can find
 * the full ids that begin with it.
 *
 * A gateway trims the tail of an upstream id: `nemotron-3.5-lightning` for the
 * catalog's `nemotron-3.5-lightning-30b-a3b`, `north-mini-code` for
 * `north-mini-code-1-0`. That tail is a parameter count or a build stamp, which
 * does not change the capability facts, so a prefix hit is a real match.
 * @param catalog - the indexed catalog.
 * @returns prefix → the entries whose id starts with it.
 */
function buildPrefixIndex(catalog: Catalog): Map<string, CatalogEntry[]> {
  const index = new Map<string, CatalogEntry[]>()
  for (const [id, entries] of catalog.byFolded) {
    for (let length = 4; length <= id.length; length += 1) {
      const key = id.slice(0, length)
      const bucket = index.get(key)
      if (bucket === undefined) index.set(key, [...entries])
      else bucket.push(...entries)
    }
  }
  return index
}

/** The prefix index of the last catalog it was built for. */
let prefixCache: { catalog: Catalog; index: Map<string, CatalogEntry[]> } | undefined

/**
 * The prefix index for one catalog, built on first use and reused afterwards.
 * @param catalog - the indexed catalog.
 * @returns the prefix → entries map.
 */
function prefixesOf(catalog: Catalog): Map<string, CatalogEntry[]> {
  if (prefixCache !== undefined && prefixCache.catalog === catalog) return prefixCache.index
  const index = buildPrefixIndex(catalog)
  prefixCache = { catalog, index }
  return index
}

/**
 * Every spelling of a version inside one key: dash form and dot form.
 *
 * Vendors publish either spelling for the same model and the catalog holds only
 * one of them: `claude-sonnet-4.5` sits beside `claude-sonnet-4-5`, and a
 * reseller may use the opposite one from the entry it wraps
 * (`sn-sensenova-6-8-flash-lite` against the catalog's
 * `sensenova-6.8-flash-lite`). Only a separator between two digits is rewritten,
 * so `gpt-4.1-mini` folds while a word boundary like `gpt-4-mini` is untouched.
 * @param key - one candidate id.
 * @returns the key first, then its folded spellings.
 */
function versionSpellings(key: string): string[] {
  const dashed = key.replace(/(\d)[-_.](\d)/g, '$1-$2')
  const dotted = key.replace(/(\d)[-_.](\d)/g, '$1.$2')
  return [...new Set([key, dashed, dotted])]
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

/**
 * Look a key up through every id-only rule, strictest first.
 *
 * The ladder is: exact → version spelled the other way → variant markers
 * stripped → a reseller's namespace peeled off, then the same rules again on
 * what is left. Each step only widens the net, and the step that fired is
 * reported so the table can say how sure the answer is.
 * @param catalog - the indexed catalog.
 * @param key - one candidate id.
 * @returns the chosen entry and the rule that found it, or undefined.
 */
function resolveId(catalog: Catalog, key: string): { entry: CatalogEntry; via: MatchVia } | undefined {
  const exact = lookupExact(catalog, key)
  if (exact !== undefined) return exact

  const withoutMarkers = stripMarkers(key)
  if (withoutMarkers !== undefined) {
    const hit = lookupExact(catalog, withoutMarkers)
    if (hit !== undefined) return { entry: hit.entry, via: 'suffix' }

    // A gateway that truncates the tail (`nemotron-3.5-lightning` for the
    // catalog's `nemotron-3.5-lightning-30b-a3b`) leaves a prefix of a longer
    // catalog id.
    const prefixed = prefixesOf(catalog).get(withoutMarkers.toLowerCase())
    if (prefixed !== undefined) {
      const entry = pickBest(prefixed)
      if (entry !== undefined) return { entry, via: 'prefix' }
    }
  }

  // A reseller wraps the upstream id in its own namespace (`sn-glm-5-3` for
  // `glm-5-3`). This runs last among the id rules because it removes real text:
  // the guard is that only a key which then resolves *exactly* is accepted, so
  // `raccoon-19b265` is not silently turned into `19b265`.
  const peeled = peelVendorNamespace(key)
  if (peeled !== undefined) {
    const hit = lookupExact(catalog, peeled)
    if (hit !== undefined) return { entry: hit.entry, via: 'vendor' }

    const peeledStripped = stripMarkers(peeled)
    if (peeledStripped !== undefined) {
      const again = lookupExact(catalog, peeledStripped)
      if (again !== undefined) return { entry: again.entry, via: 'vendor' }
    }
  }

  return undefined
}

/**
 * Exact, case-folded, and version-spelled-the-other-way lookup, in that order.
 * @param catalog - the indexed catalog.
 * @param key - one candidate id.
 * @returns the chosen entry and the rule, or undefined.
 */
function lookupExact(catalog: Catalog, key: string): { entry: CatalogEntry; via: MatchVia } | undefined {
  const spellings = versionSpellings(key)
  for (const [position, spelling] of spellings.entries()) {
    const hit = lookup(catalog, spelling)
    if (hit === undefined) continue
    const entry = pickBest(hit.entries)
    if (entry === undefined) continue
    // The key's own spelling keeps the rule that matched it; a folded spelling
    // is reported as `folded`.
    return { entry, via: position === 0 ? hit.via : 'folded' }
  }
  return undefined
}

/**
 * Remove a reseller's leading namespace from one id.
 *
 * Only the shape `xxx-rest` is considered, where `xxx` is two to four letters —
 * long enough to be an abbreviation, short enough to not be a model family.
 * The caller must verify the result resolves exactly; without that check this
 * would happily split `raccoon-chat-ml-5-5` into the meaningless `chat-ml-5-5`.
 * @param key - one candidate id.
 * @returns the id without its namespace, or undefined when there is none.
 */
function peelVendorNamespace(key: string): string | undefined {
  const match = VENDOR_PREFIX.exec(key)
  if (match === null) return undefined
  const rest: string | undefined = match[2]
  if (rest === undefined || rest.length < 3) return undefined
  return rest
}

/**
 * Resolve one gateway model id.
 *
 * The walk is strict to loose: the id itself, then the id without its vendor
 * prefix, then the configured display name — each of those through the full
 * ladder in {@link resolveId}. An explicit alias is tried last: it is a
 * hand-made fallback, and an alias applied to a name would be inherited by
 * every row that name resolves, which is the opposite of an override.
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
  const onId = resolveId(catalog, id)
  if (onId !== undefined) return describe(onId.entry, onId.via)

  // Peel the vendor prefix one segment at a time. A gateway nests its own
  // namespace in front of the upstream's path (`cline/dots-studio/dots-3-note
  // -preview:free` around the catalog's `dots-studio/dots-3-note-preview`), so
  // the useful key is not always the basename: sometimes it is everything after
  // the first segment, sometimes after the second.
  const segments = id.split('/')
  for (let drop = 1; drop < segments.length; drop += 1) {
    const rest = segments.slice(drop).join('/')
    if (rest.length === 0) continue
    const onRest = resolveId(catalog, rest)
    if (onRest !== undefined) return describe(onRest.entry, onRest.via === 'exact' ? 'basename' : onRest.via)
  }

  // From here the name speaks for the id: try it as-is, then its last segment
  // (`qoder/DeepSeek-Flash【qoder】` → `DeepSeek-Flash`). The bracketed
  // annotation is dropped first, so whether the name-redirect section ran never
  // changes the answer.
  const label = cleanDisplayName(name)
  if (label.length > 0) {
    const onName = resolveId(catalog, label)
    if (onName !== undefined) {
      return {
        ...describe(onName.entry, onName.via === 'exact' ? 'name' : onName.via === 'folded' ? 'name' : 'nameSuffix'),
        matchedName: label,
        nameSource: 'name',
      }
    }
    const tail = basename(label)
    if (tail !== label && tail.length > 0) {
      const onTail = resolveId(catalog, tail)
      if (onTail !== undefined) {
        return {
          ...describe(onTail.entry, onTail.via === 'exact' ? 'name' : onTail.via === 'folded' ? 'name' : 'nameSuffix'),
          matchedName: tail,
          nameSource: 'name',
        }
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
