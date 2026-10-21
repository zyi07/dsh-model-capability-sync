/**
 * The models.dev catalog: download, cache, and index for lookup.
 *
 * One shared `api.json` carries every provider's model facts. The download
 * happens host-side so the browser never makes a cross-origin request, and a
 * forward proxy stays a plain HTTP proxy the host can use.
 * @module dsh-model-capability-sync/catalog
 */

const CATALOG_URL = 'https://models.dev/api.json'
/** Reuse one download for this long; a `refresh` request bypasses it. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** One model entry as models.dev publishes it (only the fields we read). */
export interface ModelsDevModel {
  id?: string
  name?: string
  description?: string
  /** Whether the model accepts reasoning control at all. */
  reasoning?: boolean
  /** Accepted input/output media; `input` is the modality list we map. */
  modalities?: { input?: string[]; output?: string[] }
  /** Capacity facts: token counts. */
  limit?: { context?: number; input?: number; output?: number }
  /** Reasoning control shapes; the `effort` type carries the selectable levels. */
  reasoning_options?: Array<{ type?: string; values?: Array<string | null> }>
}

/** One catalog entry with its provider id attached. */
export interface CatalogEntry {
  provider: string
  id: string
  model: ModelsDevModel
}

/** A loaded catalog plus its lookup indexes. */
export interface Catalog {
  fetchedAt: number
  modelCount: number
  /** Exact id → entries (a bare id can appear under several providers). */
  byId: Map<string, CatalogEntry[]>
  /** Lower-cased id → entries, for case-insensitive vendor spellings. */
  byFolded: Map<string, CatalogEntry[]>
}

let cache: { catalog: Catalog; proxyUrl: string | undefined } | undefined

/** Push one entry into an index bucket. */
function push(index: Map<string, CatalogEntry[]>, key: string, entry: CatalogEntry): void {
  const bucket = index.get(key)
  if (bucket === undefined) index.set(key, [entry])
  else bucket.push(entry)
}

/** Build both indexes from the raw catalog body. */
function buildCatalog(body: unknown, fetchedAt: number): Catalog {
  const byId = new Map<string, CatalogEntry[]>()
  const byFolded = new Map<string, CatalogEntry[]>()
  let modelCount = 0
  if (typeof body === 'object' && body !== null) {
    for (const [provider, value] of Object.entries(body as Record<string, unknown>)) {
      const models = (value as { models?: Record<string, ModelsDevModel> } | undefined)?.models
      if (typeof models !== 'object' || models === null) continue
      for (const [id, model] of Object.entries(models)) {
        if (id.length === 0) continue
        modelCount += 1
        const entry: CatalogEntry = { provider, id, model }
        push(byId, id, entry)
        push(byFolded, id.toLowerCase(), entry)
      }
    }
  }
  if (modelCount === 0) throw new Error('models.dev returned a catalog with no models')
  return { fetchedAt, modelCount, byId, byFolded }
}

/** Download the catalog body, optionally through a forward proxy. */
async function download(proxyUrl: string | undefined, signal: AbortSignal | undefined): Promise<unknown> {
  if (proxyUrl === undefined || proxyUrl.length === 0) {
    const response = await fetch(CATALOG_URL, { signal })
    if (!response.ok) throw new Error(`models.dev download failed (HTTP ${String(response.status)})`)
    return await response.json()
  }
  // The proxy path needs undici's dispatcher. It ships with the harness
  // runtime; a missing copy is reported instead of silently going direct. The
  // specifier stays a runtime value so this package needs no undici types.
  interface UndiciFace {
    fetch(input: string, init?: Record<string, unknown>): Promise<Response>
    ProxyAgent: new (url: string) => unknown
  }
  const specifier: string = 'undici'
  let undici: UndiciFace
  try {
    undici = await import(specifier) as UndiciFace
  } catch {
    throw new Error('a proxy URL was set but the host cannot load "undici"; clear the proxy or install it')
  }
  const dispatcher = new undici.ProxyAgent(proxyUrl)
  const response = await undici.fetch(CATALOG_URL, { signal, dispatcher })
  if (!response.ok) throw new Error(`models.dev download through the proxy failed (HTTP ${String(response.status)})`)
  return await response.json()
}

/**
 * Load the catalog, reusing the cached copy unless it expired or the caller
 * asked for a refresh.
 * @param options - refresh flag and optional proxy URL.
 * @param signal - caller cancellation.
 * @returns the indexed catalog.
 */
export async function loadCatalog(
  options: { refresh?: boolean; proxyUrl?: string } = {},
  signal?: AbortSignal,
): Promise<Catalog> {
  const now = Date.now()
  const fresh = cache !== undefined
    && cache.proxyUrl === options.proxyUrl
    && now - cache.catalog.fetchedAt < CACHE_TTL_MS
  if (options.refresh !== true && fresh && cache !== undefined) return cache.catalog
  const body = await download(options.proxyUrl, signal)
  const catalog = buildCatalog(body, Date.now())
  cache = { catalog, proxyUrl: options.proxyUrl }
  return catalog
}
