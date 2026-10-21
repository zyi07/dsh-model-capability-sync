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
 */
export interface CapabilityFields {
  /** Display name from the catalog; never overwrites a user-set name unless asked. */
  name?: string
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
export type MatchVia = 'alias' | 'exact' | 'folded' | 'basename' | 'suffix'

/** The catalog entry a gateway id resolved to. */
export interface MatchInfo {
  /** models.dev provider id the entry lives under (e.g. `openai`). */
  provider: string
  /** models.dev model id inside that provider. */
  modelId: string
  /** Which rule produced this match. */
  via: MatchVia
  /** True when the entry belongs to the model's first-party vendor, not a reseller. */
  firstParty?: boolean
  /** Human name from the catalog, when present. */
  name?: string
}

/** One preview row: a configured model and what the catalog says about it. */
export interface PreviewRow {
  /** The gateway model id exactly as configured. */
  id: string
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
  /** One row per requested id, in request order. */
  rows: PreviewRow[]
}

/** Envelope every RPC endpoint answers with. */
export type RpcEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
