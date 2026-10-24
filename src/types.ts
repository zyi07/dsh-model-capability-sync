/**
 * Shared vocabulary between the host half (catalog + matching) and the browser
 * half (preview + write). Types only — nothing here runs.
 * @module dsh-model-capability-sync/types
 */

/** Input modalities the DeepSeek Harness LLM seam understands. */
export type Modality = 'text' | 'image'

/**
 * The capability fields this plugin can fill into one provider model entry.
 * The names are the provider's own field names (pi-ai uses these exact ones),
 * so a filled entry is written verbatim into the provider configuration.
 *
 * `name` is deliberately absent: this plugin fills facts, it never renames a
 * model. A label is the user's (or the gateway's) choice, and rewriting it
 * would be a surprise no capability edit justifies.
 */
export interface CapabilityFields {
  /** Total request+response context capacity in tokens. */
  contextWindow?: number
  /** Per-request output cap in tokens. */
  maxTokens?: number
  /** Accepted input modalities, always including `text`. */
  input?: Modality[]
  /**
   * Reasoning-effort map for providers that take a dict (`{ low: 'low' }`),
   * or `false` when the catalog states the model cannot reason at all.
   */
  reasoningEfforts?: Record<string, string> | false
}

/** How a gateway id was matched against the catalog. */
export type MatchVia = 'alias' | 'exact' | 'folded' | 'basename' | 'suffix' | 'prefix' | 'name' | 'nameSuffix'

/** Where the key a `name` match used came from: the stored display name, or its id as a last resort. */
export type NameSource = 'name' | 'id'

/** The catalog entry a gateway id resolved to. */
export interface MatchInfo {
  /** models.dev provider id the entry lives under (e.g. `openai`). */
  provider: string
  /** models.dev model id inside that provider. */
  modelId: string
  /** Which rule produced this match. */
  via: MatchVia
  /** For a `name`/`nameSuffix` match: the label the id was resolved through. */
  matchedName?: string
  /** For a `name`/`nameSuffix` match: whether that label was the display name or the id. */
  nameSource?: NameSource
  /** True when the entry belongs to the model's first-party vendor, not a reseller. */
  firstParty?: boolean
  /** Human name from the catalog, when present. */
  name?: string
}

/** One preview row: a configured model and what the catalog says about it. */
export interface PreviewRow {
  /** The gateway model id exactly as configured. */
  id: string
  /** The configured display name, when the request carried one. */
  name?: string
  match?: MatchInfo
  fields?: CapabilityFields
  /** Why no capability could be resolved, when `fields` is absent. */
  reason?: string
}

/** Request payload of the `preview` RPC endpoint. */
export interface PreviewRequest {
  /** Gateway model ids to resolve, in display order. */
  ids: string[]
  /** Explicit gateway id → models.dev model id overrides, applied first. */
  aliases?: Record<string, string>
  /**
   * Display names by gateway id. A display name often carries facts the id
   * does not — a gateway may expose `qoder/qfmodel` labelled `Qwen3.8-Flash`,
   * or the label may keep the upstream id in front. When the id itself
   * resolves to nothing, these are tried before giving up.
   */
  names?: Record<string, string>
  /** Forward-proxy URL for the catalog download. */
  proxyUrl?: string
  /** Bypass the in-memory catalog cache. */
  refresh?: boolean
}

/** Response payload of the `preview` RPC endpoint. */
export interface PreviewResponse {
  /** Epoch milliseconds of the catalog fetch backing this answer. */
  fetchedAt: number
  /** Number of models in the downloaded catalog. */
  catalogModels: number
  /** True when the catalog came from the local copy because the download failed. */
  stale?: boolean
  /** One row per requested id, in request order. */
  rows: PreviewRow[]
}

/** Envelope every RPC endpoint answers with. */
export type RpcEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }

/**
 * What the harness resolves for one model id right now, read from the adapter
 * that actually owns the route. This is the truth a chat request sees, which
 * is not necessarily the configuration this plugin writes: two plugins may
 * claim the same provider route, and only one of them serves it.
 */
export interface LiveRow {
  /** The model id as configured. */
  id: string
  /** Input modalities the owning adapter reports, when it reports any. */
  input?: string[]
  /** Context window the owning adapter reports. */
  contextWindow?: number
  /** Default output cap the owning adapter reports. */
  maxTokens?: number
  /** Why the live lookup failed, when it did. */
  error?: string
}

/** Request payload of the `live` RPC endpoint. */
export interface LiveRequest {
  /** Provider route to inspect (the key inside `providers`). */
  provider: string
  /** Model ids to resolve through the owning adapter. */
  ids: string[]
}

/** Response payload of the `live` RPC endpoint. */
export interface LiveResponse {
  /** One row per requested id, in request order. */
  rows: LiveRow[]
}
