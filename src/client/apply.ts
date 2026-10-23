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
import type { LiveResponse, PreviewRequest, PreviewResponse } from '../types.ts'
import { RenameSection } from './RenameSection.tsx'
import { SyncSection } from './SyncSection.tsx'
import type { SyncSectionInjected } from './SyncSection.tsx'
import type { SettingsDescriptor, SettingsInjected, SettingsPathOp } from './shared.ts'
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

/** A refusal as the Remote namespace states it. */
interface Refusal {
  /** Machine-readable reason; `settings/conflict` is the one callers act on. */
  code?: string
  /** Human message for the page. */
  message: string
}

/**
 * Read the refusal out of a Remote answer envelope.
 * @param answer - whatever the Remote namespace resolved with.
 * @returns the refusal when the answer carries one, otherwise undefined.
 */
function refusalOf(answer: unknown): Refusal | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined
  const envelope = answer as { ok?: unknown; error?: { code?: unknown; message?: unknown } }
  if (envelope.ok !== false) return undefined
  return {
    ...typeof envelope.error?.code === 'string' ? { code: envelope.error.code } : {},
    message: typeof envelope.error?.message === 'string' ? envelope.error.message : 'settings request refused',
  }
}

/**
 * Open a Remote answer envelope.
 *
 * Every `remote.settings` method answers `{ok: true, value}` or
 * `{ok: false, error}`; a few surfaces hand back the bare value instead, so
 * both shapes are accepted rather than guessed at one. A refusal keeps its
 * `code`, so the section can tell a stale revision apart from a real failure.
 * @param answer - whatever the Remote namespace resolved with.
 * @returns the value the answer carries.
 * @throws the refusal, carrying `code` when the answer had one.
 */
function unwrap(answer: unknown): unknown {
  const refusal = refusalOf(answer)
  if (refusal !== undefined) {
    throw Object.assign(new Error(refusal.message), refusal.code === undefined ? {} : { code: refusal.code })
  }
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
.cs-warn { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); font-size: 12px; line-height: 18px; }
.cs-input {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px; min-width: 200px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.cs-target { font-size: 13px; color: var(--dsw-alias-label-primary); line-height: 30px; }
.cs-table-wrap {
  max-height: 460px; overflow: auto; margin-bottom: 12px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
}
.cs-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.cs-table th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); white-space: nowrap;
}
.cs-table td {
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); vertical-align: top;
}
.cs-table tr:last-child td { border-bottom: none; }
.cs-row--changed td { background: var(--dsw-alias-bg-layer-2, transparent); }
.cs-id { font-variant-numeric: tabular-nums; word-break: break-all; }
.cs-dim { color: var(--dsw-alias-label-tertiary); }
.cs-change { white-space: nowrap; }
.cs-from { color: var(--dsw-alias-label-tertiary); text-decoration: line-through; }
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

  const settingsInjected = (): SettingsInjected => ({
    describeSettings: async () => namespacesOf(await remote.settings.describe()),
    mutateSettings: async (ns, ops, expectedRevision) => {
      const view = unwrap(await remote.settings.mutate(ns, ops, expectedRevision)) as SettingsDescriptor | undefined
      if (view === undefined) throw new Error('settings.mutate returned no namespace view')
      return view
    },
  })

  const injected = (): SyncSectionInjected => ({
    ...settingsInjected(),
    preview: request =>
      connection.rpc.call(CHANNEL, 'preview', request) as Promise<RpcEnvelope<PreviewResponse>>,
    live: request =>
      connection.rpc.call(CHANNEL, 'live', request) as Promise<RpcEnvelope<LiveResponse>>,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-capability-sync',
    order: 16,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SyncSection))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-name-redirect',
    order: 17,
    label: () => t('navRedirect'),
    locale: NS,
    inject: settingsInjected,
  }, RenameSection))
}
