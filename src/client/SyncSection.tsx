/**
 * The capability-sync settings section: pick the provider entry, analyze its
 * models against models.dev, review what would be written, then apply.
 *
 * Pure props — no context access, no subscriptions. Everything arrives through
 * the inject face `apply` builds, including the bound translate function.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CapabilityFields, LiveResponse, LiveRow, PreviewResponse, PreviewRow, RpcEnvelope } from '../types.ts'

/** One settings descriptor as the remote reports it (only the fields used here). */
export interface SettingsDescriptor {
  ns: string
  revision: number
  value: Record<string, unknown>
}

/** One ordered form edit understood by `settings.mutate`. */
export interface SettingsPathOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

/** What `apply` injects into this component. */
export interface SyncSectionInjected {
  preview(request: { ids: string[]; aliases?: Record<string, string>; refresh?: boolean }): Promise<RpcEnvelope<PreviewResponse>>
  live(request: { provider: string; ids: string[] }): Promise<RpcEnvelope<LiveResponse>>
  describeSettings(): Promise<SettingsDescriptor[]>
  mutateSettings(ns: string, ops: SettingsPathOp[], expectedRevision?: number): Promise<SettingsDescriptor>
}

export interface SyncSectionProps extends SyncSectionInjected {
  t: (key: string, params?: Record<string, unknown>) => string
}

/** A model entry as the provider stores it: structurally open, so unknown fields survive. */
type ModelDraft = Record<string, unknown>

/** The official adapter this plugin fills capabilities into. */
const TARGET_DEFAULT = 'llm-pi-ai'

/** Read a string field, or the empty string. */
function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}

/** The provider dict inside one descriptor's live value. */
function providersOf(descriptor: SettingsDescriptor | undefined): Record<string, Record<string, unknown>> {
  const providers = descriptor?.value?.providers
  return typeof providers === 'object' && providers !== null
    ? providers as Record<string, Record<string, unknown>>
    : {}
}

/** The models array of one provider profile. */
function modelsOf(provider: Record<string, unknown> | undefined): ModelDraft[] {
  const models = provider?.models
  return Array.isArray(models) ? models.filter((entry): entry is ModelDraft => typeof entry === 'object' && entry !== null) : []
}

/** Human token count: 128000 → `128K`, 1000000 → `1M`. */
function tokens(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1_000_000) return `${String(Number((value / 1_000_000).toFixed(1)))}M`
  if (value >= 1000) return `${String(Number((value / 1000).toFixed(0)))}K`
  return String(value)
}

/** The image verdict of one row's fields. */
function imageLabel(fields: CapabilityFields | undefined, t: SyncSectionProps['t']): string {
  if (fields?.input === undefined) return '—'
  return fields.input.includes('image') ? t('imageYes') : t('imageNo')
}

/** The reasoning verdict of one row's fields. */
function reasoningLabel(fields: CapabilityFields | undefined): string {
  const efforts = fields?.reasoningEfforts
  if (efforts === undefined) return '—'
  if (efforts === false) return 'off'
  const keys = Object.keys(efforts)
  return keys.length === 0 ? '—' : keys.join(' / ')
}

/** Which rule produced a match, as section copy. */
function viaLabel(row: PreviewRow, t: SyncSectionProps['t']): string {
  switch (row.match?.via) {
    case 'alias': return t('viaAlias')
    case 'exact': return t('viaExact')
    case 'folded': return t('viaFolded')
    case 'basename': return t('viaBasename')
    case 'suffix': return t('viaSuffix')
    default: return ''
  }
}

/**
 * Whether a stored value carries no decision of its own.
 *
 * The provider schema materializes defaults, so a field the user never set can
 * arrive as `[]` or `{}` rather than as `undefined`. Treating those as "already
 * set" is what made an empty `input: []` survive every fill — the field looked
 * answered while it said nothing. `false` and `0` are decisions, not blanks.
 * @param value - the stored value.
 * @returns true when filling the field loses no user intent.
 */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

/**
 * Merge one row's capability fields into an existing model entry.
 * @param model - the entry as stored.
 * @param fields - catalog capabilities.
 * @param overwrite - replace values the user already set.
 * @returns a new entry; the input is never mutated.
 */
function mergeModel(model: ModelDraft, fields: CapabilityFields, overwrite: boolean): ModelDraft {
  const next: ModelDraft = { ...model }
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (!overwrite && !isBlank(next[key])) continue
    next[key] = value
  }
  return next
}

/** The image verdict the owning adapter reports right now. */
function liveLabel(row: LiveRow | undefined, t: SyncSectionProps['t']): string {
  if (row === undefined) return '—'
  if (row.error !== undefined) return t('liveError')
  if (row.input === undefined) return '—'
  return row.input.includes('image') ? t('imageYes') : t('imageNo')
}

/**
 * Render the section.
 * @param props - injected wire face plus the bound translate function.
 * @returns the section body.
 */
export function SyncSection(props: SyncSectionProps): ReactNode {
  const { t, preview, live, describeSettings, mutateSettings } = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState<string | undefined>(undefined)
  const [descriptors, setDescriptors] = useState<SettingsDescriptor[]>([])
  const [targetNs, setTargetNs] = useState(TARGET_DEFAULT)
  const [providerKey, setProviderKey] = useState('')
  const [models, setModels] = useState<ModelDraft[]>([])
  const [rows, setRows] = useState<PreviewRow[] | undefined>(undefined)
  const [liveRows, setLiveRows] = useState<ReadonlyMap<string, LiveRow>>(new Map())
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState<'idle' | 'analyzing' | 'applying'>('idle')
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [catalogInfo, setCatalogInfo] = useState<string | undefined>(undefined)
  const [staleInfo, setStaleInfo] = useState<string | undefined>(undefined)

  /** Read every configurable entry and select the default target. */
  const load = async (): Promise<void> => {
    setStatus('loading')
    setErrorText(undefined)
    try {
      const list = await describeSettings()
      setDescriptors(list)
      const candidates = list.filter(entry => Object.keys(providersOf(entry)).length > 0)
      const target = candidates.find(entry => entry.ns === TARGET_DEFAULT) ?? candidates[0]
      if (target === undefined) {
        setStatus('error')
        setErrorText(t('noTarget'))
        return
      }
      const providers = providersOf(target)
      const firstKey = Object.keys(providers)[0] ?? ''
      setTargetNs(target.ns)
      setProviderKey(firstKey)
      setModels(modelsOf(providers[firstKey]))
      setRows(undefined)
      setLiveRows(new Map())
      setSelected(new Set())
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => { void load() }, [])

  /** Switch the provider key inside the selected entry. */
  const selectProvider = (key: string): void => {
    const descriptor = descriptors.find(entry => entry.ns === targetNs)
    setProviderKey(key)
    setModels(modelsOf(providersOf(descriptor)[key]))
    setRows(undefined)
    setLiveRows(new Map())
    setSelected(new Set())
    setNotice(undefined)
  }

  /** Resolve every configured id against the catalog. */
  const analyze = async (refresh: boolean): Promise<void> => {
    setBusy('analyzing')
    setErrorText(undefined)
    setNotice(undefined)
    setStaleInfo(undefined)
    try {
      const ids = models.map(model => textOf(model, 'id')).filter(id => id.length > 0)
      const result = await preview({ ids, ...refresh ? { refresh: true } : {} })
      if (!result.ok) throw new Error(result.error.message)
      setRows(result.value.rows)
      setSelected(new Set(result.value.rows.filter(row => row.fields !== undefined).map(row => row.id)))
      setCatalogInfo(t('catalogInfo', {
        models: result.value.catalogModels,
        time: new Date(result.value.fetchedAt).toLocaleString(),
      }))
      setStaleInfo(result.value.stale === true
        ? t('catalogStale', { time: new Date(result.value.fetchedAt).toLocaleString() })
        : undefined)
      // Ask the adapter that owns this route what a request sees right now.
      // The entry we are about to write may not be the one serving it, so this
      // is the only honest answer to "did the write take effect".
      try {
        const answer = await live({ provider: providerKey, ids })
        setLiveRows(answer.ok ? new Map(answer.value.rows.map(row => [row.id, row])) : new Map())
      } catch {
        setLiveRows(new Map())
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('idle')
    }
  }

  /** Write the selected rows into the provider entry. */
  const applyRows = async (): Promise<void> => {
    if (rows === undefined) return
    const descriptor = descriptors.find(entry => entry.ns === targetNs)
    if (descriptor === undefined) return
    const byId = new Map(rows.map(row => [row.id, row]))
    let written = 0
    const next = models.map((model) => {
      const id = textOf(model, 'id')
      const row = byId.get(id)
      if (row?.fields === undefined || !selected.has(id)) return model
      written += 1
      return mergeModel(model, row.fields, overwrite)
    })
    if (written === 0) {
      setNotice(t('nothingSelected'))
      return
    }
    setBusy('applying')
    setErrorText(undefined)
    try {
      const view = await mutateSettings(targetNs, [{
        op: 'set',
        path: ['providers', providerKey, 'models'],
        value: next,
      }], descriptor.revision)
      setModels(next)
      // Keep the held revision current, so a second apply does not conflict.
      setDescriptors(previous => previous.map(entry =>
        entry.ns === targetNs && typeof view.revision === 'number'
          ? { ...entry, revision: view.revision }
          : entry))
      setNotice(t('applied', { count: written }))
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('idle')
    }
  }

  if (status === 'loading') return <div className="cs-hint">{t('loading')}</div>

  if (status === 'error') {
    return (
      <div className="cs-field">
        <p className="cs-error">{t('loadFailed')}: {errorText}</p>
        <button type="button" className="cs-button" onClick={() => { void load() }}>{t('retry')}</button>
      </div>
    )
  }

  const descriptor = descriptors.find(entry => entry.ns === targetNs)
  const providerKeys = Object.keys(providersOf(descriptor))
  const unmatched = (rows ?? []).filter(row => row.fields === undefined)
  const matched = (rows ?? []).filter(row => row.fields !== undefined)
  const liveImage = matched.filter(row => liveRows.get(row.id)?.input?.includes('image') === true).length
  const liveText = matched.filter((row) => {
    const answer = liveRows.get(row.id)
    return answer?.input !== undefined && !answer.input.includes('image')
  }).length
  const toggle = (id: string): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div>
      <p className="cs-hint">{t('intro')}</p>

      <div className="cs-row">
        <label className="cs-field">
          <span className="cs-hint">{t('target')}</span>
          <select className="cs-select" value={targetNs} onChange={(event) => { setTargetNs(event.target.value); setRows(undefined) }}>
            {descriptors.filter(entry => Object.keys(providersOf(entry)).length > 0).map(entry => (
              <option key={entry.ns} value={entry.ns}>{entry.ns}</option>
            ))}
          </select>
        </label>
        <label className="cs-field">
          <span className="cs-hint">{t('provider')}</span>
          <select className="cs-select" value={providerKey} onChange={(event) => selectProvider(event.target.value)}>
            {providerKeys.map(key => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
        <span className="cs-hint">{t('modelCount', { count: models.length })}</span>
      </div>

      {models.length === 0
        ? <p className="cs-hint">{t('noModels')}</p>
        : (
          <div className="cs-row">
            <button type="button" className="cs-button cs-button--primary" disabled={busy !== 'idle'} onClick={() => { void analyze(false) }}>
              {busy === 'analyzing' ? t('analyzing') : t('analyze')}
            </button>
            <button type="button" className="cs-button" disabled={busy !== 'idle'} onClick={() => { void analyze(true) }}>
              {t('refreshCatalog')}
            </button>
            <label className="cs-hint" title={t('overwriteHint')}>
              <input type="checkbox" checked={overwrite} onChange={(event) => { setOverwrite(event.target.checked) }} />
              {' '}{t('overwrite')}
            </label>
          </div>
        )}

      {errorText !== undefined ? <p className="cs-error">{errorText}</p> : null}
      {notice !== undefined ? <p className="cs-hint">{notice}</p> : null}
      {catalogInfo !== undefined ? <p className="cs-hint">{catalogInfo}</p> : null}
      {staleInfo !== undefined ? <p className="cs-warn">{staleInfo}</p> : null}

      {rows !== undefined && matched.length > 0
        ? (
          <>
            <table className="cs-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t('selectAll')}
                      checked={matched.every(row => selected.has(row.id))}
                      onChange={(event) => {
                        setSelected(event.target.checked ? new Set(matched.map(row => row.id)) : new Set())
                      }}
                    />
                  </th>
                  <th>{t('colModel')}</th>
                  <th>{t('colMatch')}</th>
                  <th>{t('colContext')}</th>
                  <th>{t('colOutput')}</th>
                  <th>{t('colImage')}</th>
                  <th title={t('colLiveHint')}>{t('colLive')}</th>
                  <th>{t('colReasoning')}</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={row.id}
                        checked={selected.has(row.id)}
                        onChange={() => { toggle(row.id) }}
                      />
                    </td>
                    <td className="cs-id">{row.id}</td>
                    <td className="cs-dim">
                      {row.match === undefined ? '—' : `${row.match.provider}/${row.match.modelId}`}
                      {' '}<span className="cs-badge">{viaLabel(row, t)}</span>
                    </td>
                    <td>{tokens(row.fields?.contextWindow)}</td>
                    <td>{tokens(row.fields?.maxTokens)}</td>
                    <td>
                      <span className={row.fields?.input?.includes('image') === true ? 'cs-badge cs-badge--image' : 'cs-dim'}>
                        {imageLabel(row.fields, t)}
                      </span>
                    </td>
                    <td>
                      <span className={liveRows.get(row.id)?.input?.includes('image') === true ? 'cs-badge cs-badge--image' : 'cs-dim'}>
                        {liveLabel(liveRows.get(row.id), t)}
                      </span>
                    </td>
                    <td className="cs-dim">{reasoningLabel(row.fields)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {liveRows.size > 0
              ? <p className="cs-hint">{t('liveSummary', { image: liveImage, text: liveText })}</p>
              : null}
            <div className="cs-row">
              <button
                type="button"
                className="cs-button cs-button--primary"
                disabled={busy !== 'idle' || selected.size === 0}
                onClick={() => { void applyRows() }}
              >
                {busy === 'applying' ? t('applying') : t('apply')}
              </button>
            </div>
          </>
        )
        : null}

      {unmatched.length > 0
        ? (
          <div>
            <p className="cs-hint">{t('unmatchedHint')}</p>
            <ul className="cs-unmatched">
              {unmatched.map(row => <li key={row.id}>{row.id}</li>)}
            </ul>
          </div>
        )
        : null}
    </div>
  )
}
