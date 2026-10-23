/**
 * Host half: one RPC channel that answers "what does the catalog say about
 * these model ids?".
 *
 * The plugin registers no LLM provider route on purpose — it only supplies
 * facts. The browser half decides which provider entry to write and performs
 * the write through the official settings service, so this half never touches
 * configuration.
 * @module dsh-model-capability-sync
 */
import { loadCatalog } from './catalog.ts'
import type { Catalog } from './catalog.ts'
import { capabilitiesOf } from './mapping.ts'
import { matchModel } from './match.ts'
import type { LiveRequest, LiveResponse, LiveRow, PreviewRequest, PreviewResponse, PreviewRow, RpcEnvelope } from './types.ts'

/** Cordis plugin name; the profile entry id matches. */
export const name = 'model-capability-sync'

/** The channel is served over the web server, so both services are required. */
export const inject = ['connection', 'webServer', 'llm']

/** Own RPC channel; the browser half calls this exact path. */
const CHANNEL = '/model-capability-sync'

/** The slice of the host context this plugin uses. */
interface HostContext {
  get(service: string): unknown
  effect(callback: () => (() => void | Promise<void>) | void, label?: string): void
  logger: { warn(message: string): void; error(message: unknown): void }
}

type Handler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcEnvelope<unknown>>

/** The connection service's owner-taking registration (see DESIGN in llm-newapi). */
interface Registrar {
  register(owner: unknown, channel: string, handler: Handler): () => Promise<void>
}

/** Resolve one id against the catalog into a preview row. */
function previewOne(catalog: Catalog, id: string, aliases: Readonly<Record<string, string>>, name = ''): PreviewRow {
  const named = name === '' ? {} : { name }
  const match = matchModel(catalog, id, aliases, name)
  if (match === undefined) return { id, ...named, reason: 'not in the models.dev catalog' }
  const entry = catalog.byId.get(match.modelId)?.find(candidate => candidate.provider === match.provider)
  if (entry === undefined) return { id, ...named, match, reason: 'catalog entry vanished between match and read' }
  const fields = capabilitiesOf(entry)
  if (Object.keys(fields).length === 0) return { id, ...named, match, reason: 'catalog entry states no capability facts' }
  return { id, ...named, match, fields }
}

/** Serve one `preview` request. */
async function preview(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResponse> {
  const ids = Array.isArray(request.ids) ? request.ids.filter(id => typeof id === 'string' && id.length > 0) : []
  const catalog = await loadCatalog({ refresh: request.refresh === true, proxyUrl: request.proxyUrl }, signal)
  const aliases = request.aliases ?? {}
  const names = request.names ?? {}
  return {
    fetchedAt: catalog.fetchedAt,
    catalogModels: catalog.modelCount,
    ...catalog.stale === true ? { stale: true } : {},
    rows: ids.map(id => previewOne(catalog, id, aliases, typeof names[id] === 'string' ? names[id] : '')),
  }
}

/** One RPC envelope, never a thrown value: the transport would turn that into an opaque 500. */
function failure(message: string): RpcEnvelope<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/** The LLM registry face this half reads live model metadata through. */
interface LlmFace {
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{
    inputModalities?: readonly string[]
    context?: { contextWindow: number }
    defaultMaxTokens?: number
  }>
}

/**
 * Read what the adapter that owns `provider` reports right now.
 *
 * A configuration entry and the route a chat request takes can disagree: two
 * plugins may claim one provider route, and only the first registration serves
 * it. This answer is what a request would see, so a filled-in `input` that
 * never takes effect becomes visible instead of inferred.
 * @param llm - the LLM registry.
 * @param request - route and model ids to resolve.
 * @param signal - cancellation for adapter-owned lookups.
 * @returns one row per requested id, in request order.
 */
async function live(llm: LlmFace, request: LiveRequest, signal: AbortSignal): Promise<LiveResponse> {
  const provider = typeof request.provider === 'string' ? request.provider : ''
  const ids = Array.isArray(request.ids) ? request.ids.filter(id => typeof id === 'string' && id.length > 0) : []
  const rows: LiveRow[] = []
  for (const id of ids) {
    try {
      const info = await llm.resolveModelInfo(provider, id, signal)
      rows.push({
        id,
        ...info.inputModalities === undefined ? {} : { input: [...info.inputModalities] },
        ...info.context === undefined ? {} : { contextWindow: info.context.contextWindow },
        ...info.defaultMaxTokens === undefined ? {} : { maxTokens: info.defaultMaxTokens },
      })
    } catch (error) {
      rows.push({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { rows }
}

/**
 * Build the channel handler bound to one LLM registry.
 * @param llm - the LLM registry the `live` endpoint reads through, when present.
 * @returns the endpoint dispatcher.
 */
function createHandler(llm: LlmFace | undefined): Handler {
  return async (endpoint, payload, signal) => {
    try {
      if (endpoint === 'preview') {
        return { ok: true, value: await preview(payload as PreviewRequest, signal) }
      }
      if (endpoint === 'live') {
        if (llm === undefined) return failure('model-capability-sync: no llm service to resolve the live route')
        return { ok: true, value: await live(llm, payload as LiveRequest, signal) }
      }
      return failure(`model-capability-sync: unknown endpoint ${JSON.stringify(endpoint)}`)
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * Register the channel. The registration rides the calling fiber, so a plugin
 * reload removes the route with it.
 * @param ctx - host context carrying `connection`, `webServer` and `llm`.
 */
export function apply(ctx: HostContext): void {
  const connection = ctx.get('connection')
  const llm = ctx.get('llm') as LlmFace | undefined
  if (connection === undefined) {
    ctx.logger.warn('model-capability-sync: no connection service; the capability channel is unavailable')
    return
  }
  if (llm === undefined) ctx.logger.warn('model-capability-sync: no llm service; the live route check is unavailable')
  const registrar = connection as Registrar
  const handler = createHandler(llm)
  ctx.effect(() => registrar.register(ctx, CHANNEL, handler), 'model-capability-sync: RPC channel')
}
