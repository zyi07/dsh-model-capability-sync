/**
 * Browser half: one settings section plus the host RPC call it needs.
 *
 * The section is a `settings.section` slot of its own, so no shell edit is
 * required. Configuration reads and writes go through the official settings
 * remote (`remote.settings`), which is the same surface the shell's own Models
 * page uses; the only custom channel is the catalog lookup, which must run
 * host-side to avoid a cross-origin download.
 * @module dsh-model-capability-sync/client
 */
import type { RpcEnvelope } from '../types.ts'
import type { PreviewRequest, PreviewResponse } from '../types.ts'
import { SyncSection } from './SyncSection.tsx'
import type { SettingsDescriptor, SettingsPathOp, SyncSectionInjected } from './SyncSection.tsx'
import { en, zh } from './locale.ts'

/** Copy namespace owned by this plugin. */
const NS = 'settings.capability-sync'
/** Own host RPC channel. */
const CHANNEL = '/model-capability-sync'

/** The slice of the browser context this plugin uses. */
interface ClientContext {
  effect(callback: () => (() => void) | void, label?: string): void
  get(service: string): unknown
  locale: {
    register(ns: string, dictionaries: { zh: unknown; en: unknown }): () => void
    bind(ns: string): (key: string, params?: Record<string, unknown>) => string
  }
  slots: {
    inject(name: string, callback: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
}

/** The connection face carrying `rpc.call`. */
interface ConnectionFace {
  rpc: { call(channel: string, endpoint: string, payload: unknown): Promise<unknown> }
}

/** The remote face carrying the settings namespace. */
interface RemoteFace {
  settings: {
    describe(): Promise<unknown>
    mutate(ns: string, ops: SettingsPathOp[], expectedRevision?: number): Promise<unknown>
  }
}

/** The document `settings.describe` answers with, once its envelope is opened. */
interface SettingsDocument {
  writable?: boolean
  namespaces?: SettingsDescriptor[]
}

/**
 * Read the failure message out of a Remote answer envelope.
 * @param answer - whatever the Remote namespace resolved with.
 * @returns the message when the answer is a refusal, otherwise undefined.
 */
function refusalOf(answer: unknown): string | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined
  const envelope = answer as { ok?: unknown; error?: { message?: unknown } }
  if (envelope.ok !== false) return undefined
  return typeof envelope.error?.message === 'string' ? envelope.error.message : 'settings request refused'
}

/**
 * Open a Remote answer envelope.
 *
 * Every `remote.settings` method answers `{ok: true, value}` or
 * `{ok: false, error}`; a few surfaces hand back the bare value instead, so
 * both shapes are accepted rather than guessed at one.
 * @param answer - whatever the Remote namespace resolved with.
 * @returns the value the answer carries.
 * @throws the refusal message, or a shape complaint when neither form matches.
 */
function unwrap(answer: unknown): unknown {
  const refusal = refusalOf(answer)
  if (refusal !== undefined) throw new Error(refusal)
  if (typeof answer === 'object' && answer !== null && 'ok' in answer && 'value' in answer) {
    return (answer as { value: unknown }).value
  }
  return answer
}

/**
 * The namespace views a describe answer carries.
 * @param answer - the `settings.describe` answer, enveloped or bare.
 * @returns every served namespace view.
 * @throws when the answer holds no namespace list.
 */
function namespacesOf(answer: unknown): SettingsDescriptor[] {
  const document = unwrap(answer) as SettingsDocument | SettingsDescriptor[] | undefined
  if (Array.isArray(document)) return document
  const namespaces = document?.namespaces
  if (!Array.isArray(namespaces)) throw new Error('settings.describe returned no namespace list')
  return namespaces
}

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.settings']

/** Section styles, riding the shell's `--dsw-alias-*` tokens for both themes. */
const SECTION_CSS = `
.cs-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.cs-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cs-select {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.cs-button {
  padding: 6px 12px; border-radius: 6px; font: inherit; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.cs-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.cs-button:disabled { opacity: 0.4; cursor: default; }
.cs-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.cs-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.cs-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 18px; }
.cs-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.cs-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
.cs-table th {
  text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary);
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); white-space: nowrap;
}
.cs-table td {
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); vertical-align: top;
}
.cs-id { font-variant-numeric: tabular-nums; word-break: break-all; }
.cs-dim { color: var(--dsw-alias-label-tertiary); }
.cs-badge {
  display: inline-block; padding: 0 6px; border-radius: 9px; font-size: 11px; line-height: 18px;
  border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary);
}
.cs-badge--image { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.cs-unmatched { margin: 8px 0 0; padding-left: 18px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
`

/**
 * Register the copy dictionary, the section styles, and the section itself.
 * @param ctx - browser root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-capability-sync: copy dictionaries')

  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const element = document.createElement('style')
      element.textContent = SECTION_CSS
      document.head.append(element)
      return () => { element.remove() }
    }, 'model-capability-sync: section styles')
  }

  const connection = ctx.get('connection') as ConnectionFace
  const remote = ctx.get('remote') as RemoteFace
  const t = ctx.locale.bind(NS)

  const injected = (): SyncSectionInjected => ({
    preview: request =>
      connection.rpc.call(CHANNEL, 'preview', request) as Promise<RpcEnvelope<PreviewResponse>>,
    describeSettings: async () => namespacesOf(await remote.settings.describe()),
    mutateSettings: async (ns, ops, expectedRevision) => {
      const view = unwrap(await remote.settings.mutate(ns, ops, expectedRevision)) as SettingsDescriptor | undefined
      if (view === undefined) throw new Error('settings.mutate returned no namespace view')
      return view
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-capability-sync',
    order: 16,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SyncSection))
}
