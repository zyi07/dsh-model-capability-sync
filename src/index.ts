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
import type { PreviewRequest, PreviewResponse, PreviewRow, RpcEnvelope } from './types.ts'

/** Cordis plugin name; the profile entry id matches. */
export const name = 'model-capability-sync'

/** The channel is served over the web server, so both services are required. */
export const inject = ['connection', 'webServer']

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
function previewOne(catalog: Catalog, id: string, aliases: Readonly<Record<string, string>>): PreviewRow {
  const match = matchModel(catalog, id, aliases)
  if (match === undefined) return { id, reason: 'not in the models.dev catalog' }
  const entry = catalog.byId.get(match.modelId)?.find(candidate => candidate.provider === match.provider)
  if (entry === undefined) return { id, match, reason: 'catalog entry vanished between match and read' }
  const fields = capabilitiesOf(entry)
  if (Object.keys(fields).length === 0) return { id, match, reason: 'catalog entry states no capability facts' }
  return { id, match, fields }
}

/** Serve one `preview` request. */
async function preview(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResponse> {
  const ids = Array.isArray(request.ids) ? request.ids.filter(id => typeof id === 'string' && id.length > 0) : []
  const catalog = await loadCatalog({ refresh: request.refresh === true, proxyUrl: request.proxyUrl }, signal)
  const aliases = request.aliases ?? {}
  return {
    fetchedAt: catalog.fetchedAt,
    catalogModels: catalog.modelCount,
    rows: ids.map(id => previewOne(catalog, id, aliases)),
  }
}

/** One RPC envelope, never a thrown value: the transport would turn that into an opaque 500. */
function failure(message: string): RpcEnvelope<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

const handler: Handler = async (endpoint, payload, signal) => {
  try {
    if (endpoint === 'preview') {
      return { ok: true, value: await preview(payload as PreviewRequest, signal) }
    }
    return failure(`model-capability-sync: unknown endpoint ${JSON.stringify(endpoint)}`)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Register the channel. The registration rides the calling fiber, so a plugin
 * reload removes the route with it.
 * @param ctx - host context carrying `connection` and `webServer`.
 */
export function apply(ctx: HostContext): void {
  const connection = ctx.get('connection')
  if (connection === undefined) {
    ctx.logger.warn('model-capability-sync: no connection service; the capability channel is unavailable')
    return
  }
  const registrar = connection as Registrar
  ctx.effect(() => registrar.register(ctx, CHANNEL, handler), 'model-capability-sync: RPC channel')
}
