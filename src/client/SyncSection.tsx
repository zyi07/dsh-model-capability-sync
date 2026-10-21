/**
 * The capability-sync settings section: pick the provider entry, analyze its
 * models against models.dev, review what would change, then apply.
 *
 * Pure props — no context access, no subscriptions. Everything arrives through
 * the inject face `apply` builds, including the bound translate function.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CapabilityFields, LiveResponse, LiveRow, PreviewResponse, PreviewRow, RpcEnvelope } from '../types.ts'
import { sortByModelId } from '../sort.ts'

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

/**
 * How a writable settings namespace reads to a person.
 *
 * A namespace id is an internal identity, so the page names the thing it
 * configures instead. Provenance is a table, not a guess: the client cannot
 * see which package owns a namespace (`settings.describe` reports only
 * `ns/revision/value/base/user`), and inferring "official" from an `llm-`
 * prefix would eventually mislabel a third-party plugin. A namespace this
 * table does not know is shown as a plugin, with its id.
 */
const TARGET_DIRECTORY: Record<string, { native: boolean; nameKey: string }> = {
  'llm-pi-ai': { native: true, nameKey: 'nameLlmPiAi' },
  'llm-deepseek': { native: true, nameKey: 'nameLlmDeepseek' },
  'llm-deepseek-account': { native: true, nameKey: 'nameLlmDeepseekAccount' },
  'llm-newapi': { native: false, nameKey: 'nameLlmNewapi' },
}

/**
 * Render one namespace as provenance plus a name.
 * @param ns - the settings namespace id.
 * @param t - the bound translate function.
 * @returns copy such as `原生配置 · pi-ai`, never a bare namespace id.
 */
function targetLabelOf(ns: string, t: SyncSectionProps['t']): string {
  const known = TARGET_DIRECTORY[ns]
  if (known === undefined) return `${t('sourcePlugin')} · ${ns}`
  return `${known.native ? t('sourceNative') : t('sourcePlugin')} · ${t(known.nameKey)}`
}

/** One capability field that applying a row would rewrite. */
interface FieldChange {
  key: keyof CapabilityFields
  before: unknown
  after: unknown
}

/** One preview row joined with the stored entry it would rewrite. */
interface PlanRow {
  row: PreviewRow
  model: ModelDraft
  changes: FieldChange[]
}

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

/** The models of one provider profile, in display order. */
function sortedModelsOf(provider: Record<string, unknown> | undefined): ModelDraft[] {
  return sortByModelId(modelsOf(provider), model => textOf(model, 'id'))
}

/** Human token count: 128000 → `128K`, 1000000 → `1M`. */
function tokens(value: unknown): string {
  if (typeof value !== 'number') return '—'
  if (value >= 1_000_000) return `${String(Number((value / 1_000_000).toFixed(1)))}M`
  if (value >= 1000) return `${String(Number((value / 1000).toFixed(0)))}K`
  return String(value)
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
 *
 * `name` is never written: a label is the user's or the gateway's choice, and
 * renaming models is not this page's job. The host no longer returns one, and
 * the explicit skip keeps that true even against an older host build.
 * @param model - the entry as stored.
 * @param fields - catalog capabilities.
 * @param overwrite - replace values the user already set.
 * @returns a new entry; the input is never mutated.
 */
function mergeModel(model: ModelDraft, fields: CapabilityFields, overwrite: boolean): ModelDraft {
  const next: ModelDraft = { ...model }
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'name' || value === undefined) continue
    if (!overwrite && !isBlank(next[key])) continue
    next[key] = value
  }
  return next
}

/**
 * The fields applying one row would actually rewrite.
 * @param model - the entry as stored.
 * @param fields - catalog capabilities.
 * @param overwrite - replace values the user already set.
 * @returns one entry per changed field, in field order; empty when nothing moves.
 */
function changesBetween(model: ModelDraft, fields: CapabilityFields, overwrite: boolean): FieldChange[] {
  const next = mergeModel(model, fields, overwrite)
  const changes: FieldChange[] = []
  for (const key of Object.keys(fields) as Array<keyof CapabilityFields>) {
    const before = model[key]
    const after = next[key]
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    changes.push({ key, before, after })
  }
  return changes
}

/** The image verdict of one modality list. */
function imageText(value: unknown, t: SyncSectionProps['t']): string {
  if (Array.isArray(value) && value.includes('image')) return t('imageYes')
  if (isBlank(value)) return t('fieldEmpty')
  return t('imageNo')
}

/** The reasoning verdict of one effort value. */
function reasoningText(value: unknown): string {
  if (value === false) return 'off'
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>)
    return keys.length === 0 ? '—' : keys.join(' / ')
  }
  return '—'
}

/** The image verdict the owning adapter reports right now. */
function liveLabel(row: LiveRow | undefined, t: SyncSectionProps['t']): string {
  if (row === undefined) return '—'
  if (row.error !== undefined) return t('liveError')
  if (row.input === undefined) return '—'
  return row.input.includes('image') ? t('imageYes') : t('imageNo')
}

/**
 * One value cell: the stored value alone, or `before → after` when it moves.
 * @param change - the change for this field, when there is one.
 * @param current - the stored value.
 * @param format - renders one value as section copy.
 * @returns the cell body.
 */
function valueCell(change: FieldChange | undefined, current: unknown, format: (value: unknown) => string): ReactNode {
  if (change === undefined) return <span className="cs-dim">{format(current)}</span>
  return (
    <span className="cs-change">
      <span className="cs-from">{format(change.before)}</span>
      {' → '}{format(change.after)}
    </span>
  )
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
  const [query, setQuery] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [busy, setBusy] = useState<'idle' | 'analyzing' | 'applying'>('idle')
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [catalogInfo, setCatalogInfo] = useState<string | undefined>(undefined)
  const [staleInfo, setStaleInfo] = useState<string | undefined>(undefined)

  /** Everything a write would touch, joined with the stored entries. */
  const plan: PlanRow[] = (() => {
    if (rows === undefined) return []
    const stored = new Map(models.map(model => [textOf(model, 'id'), model]))
    return rows.map((row) => {
      const model = stored.get(row.id) ?? {}
      const fields = row.fields
      return {
        row,
        model,
        changes: fields === undefined ? [] : changesBetween(model, fields, overwrite),
      }
    })
  })()
  const matched = plan.filter(entry => entry.row.fields !== undefined)
  const unmatched = plan.filter(entry => entry.row.fields === undefined)
  const changing = matched.filter(entry => entry.changes.length > 0)
  const changeFields = changing.reduce((total, entry) => total + entry.changes.length, 0)
  const liveImage = matched.filter(entry => liveRows.get(entry.row.id)?.input?.includes('image') === true).length
  const liveText = matched.filter((entry) => {
    const answer = liveRows.get(entry.row.id)
    return answer?.input !== undefined && !answer.input.includes('image')
  }).length

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
      setModels(sortedModelsOf(providers[firstKey]))
      setRows(undefined)
      setLiveRows(new Map())
      setSelected(new Set())
      setQuery('')
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => { void load() }, [])

  /** Show one provider's models, in display order, with a clean slate. */
  const showProvider = (ns: string, key: string): void => {
    const providers = providersOf(descriptors.find(entry => entry.ns === ns))
    const resolved = key !== '' && providers[key] !== undefined ? key : Object.keys(providers)[0] ?? ''
    setTargetNs(ns)
    setProviderKey(resolved)
    setModels(sortedModelsOf(providers[resolved]))
    setRows(undefined)
    setLiveRows(new Map())
    setSelected(new Set())
    setNotice(undefined)
    setQuery('')
  }

  /** Ask the owning adapter what a request sees for these ids. */
  const refreshLive = async (provider: string, ids: string[]): Promise<void> => {
    try {
      const answer = await live({ provider, ids })
      setLiveRows(answer.ok ? new Map(answer.value.rows.map(row => [row.id, row])) : new Map())
    } catch {
      setLiveRows(new Map())
    }
  }

  /** Re-read the configuration without losing the analysis on screen. */
  const reloadConfig = async (): Promise<void> => {
    const list = await describeSettings()
    setDescriptors(list)
    const descriptor = list.find(entry => entry.ns === targetNs)
    if (descriptor !== undefined) setModels(sortedModelsOf(providersOf(descriptor)[providerKey]))
  }

  /** Preselect every row that would actually change. */
  const selectChanging = (source: readonly PreviewRow[], stored: readonly ModelDraft[], mode: boolean): void => {
    const byId = new Map(stored.map(model => [textOf(model, 'id'), model]))
    setSelected(new Set(source
      .filter(row => row.fields !== undefined && changesBetween(byId.get(row.id) ?? {}, row.fields, mode).length > 0)
      .map(row => row.id)))
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
      selectChanging(result.value.rows, models, overwrite)
      setCatalogInfo(t('catalogInfo', {
        models: result.value.catalogModels,
        time: new Date(result.value.fetchedAt).toLocaleString(),
      }))
      setStaleInfo(result.value.stale === true
        ? t('catalogStale', { time: new Date(result.value.fetchedAt).toLocaleString() })
        : undefined)
      // The entry we are about to write may not be the route a request takes,
      // so this is the only honest answer to "did the write take effect".
      await refreshLive(providerKey, ids)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('idle')
    }
  }

  /** Switch the overwrite mode and follow it with the selection. */
  const setOverwriteMode = (mode: boolean): void => {
    setOverwrite(mode)
    if (rows === undefined) return
    selectChanging(rows, models, mode)
  }

  /** Write the selected rows into the provider entry. */
  const applyRows = async (): Promise<void> => {
    const descriptor = descriptors.find(entry => entry.ns === targetNs)
    if (descriptor === undefined) return
    const targets = new Map(changing
      .filter(entry => selected.has(entry.row.id))
      .map(entry => [entry.row.id, entry]))
    if (targets.size === 0) {
      setNotice(t('nothingSelected'))
      return
    }
    let written = 0
    const next = models.map((model) => {
      const entry = targets.get(textOf(model, 'id'))
      if (entry?.row.fields === undefined) return model
      written += 1
      return mergeModel(model, entry.row.fields, overwrite)
    })
    setBusy('applying')
    setErrorText(undefined)
    setNotice(undefined)
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
      await refreshLive(providerKey, next.map(model => textOf(model, 'id')).filter(id => id.length > 0))
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code
      if (code === 'settings/conflict') {
        // Someone else wrote this entry while the page was open. Reload the
        // baseline instead of retrying blindly: a silent retry would overwrite
        // whatever they just saved.
        try {
          await reloadConfig()
        } catch {
          // Keep the conflict message; the reload is only a convenience.
        }
        setNotice(t('conflictReload'))
      } else {
        setErrorText(error instanceof Error ? error.message : String(error))
      }
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
  const candidates = descriptors.filter(entry => Object.keys(providersOf(entry)).length > 0)
  const providerKeys = Object.keys(providersOf(descriptor))
  const needle = query.trim().toLowerCase()
  const visible = matched.filter((entry) => {
    if (onlyChanged && entry.changes.length === 0) return false
    if (needle === '') return true
    return entry.row.id.toLowerCase().includes(needle)
      || entry.row.match?.modelId.toLowerCase().includes(needle) === true
  })
  const selectable = visible.filter(entry => entry.changes.length > 0)
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
        {candidates.length > 1
          ? (
            <label className="cs-field">
              <span className="cs-hint">{t('writeTarget')}</span>
              <select className="cs-select" value={targetNs} onChange={(event) => { showProvider(event.target.value, '') }}>
                {candidates.map(entry => (
                  <option key={entry.ns} value={entry.ns}>{targetLabelOf(entry.ns, t)}</option>
                ))}
              </select>
            </label>
          )
          : (
            <div className="cs-field" title={targetNs}>
              <span className="cs-hint">{t('writeTarget')}</span>
              <span className="cs-target">{targetLabelOf(targetNs, t)}</span>
            </div>
          )}
        <label className="cs-field">
          <span className="cs-hint">{t('provider')}</span>
          <select className="cs-select" value={providerKey} onChange={(event) => { showProvider(targetNs, event.target.value) }}>
            {providerKeys.map(key => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
        <span className="cs-hint">{t('modelCount', { count: models.length })}</span>
        <span className="cs-hint">{t('willSort')}</span>
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
              <input type="checkbox" checked={overwrite} onChange={(event) => { setOverwriteMode(event.target.checked) }} />
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
            <div className="cs-row">
              <input
                className="cs-input"
                type="search"
                value={query}
                placeholder={t('search')}
                onChange={(event) => { setQuery(event.target.value) }}
              />
              <label className="cs-hint">
                <input type="checkbox" checked={onlyChanged} onChange={(event) => { setOnlyChanged(event.target.checked) }} />
                {' '}{t('onlyChanged')}
              </label>
              <span className="cs-hint">
                {changing.length === 0
                  ? t('noChanges')
                  : t('changeSummary', { rows: changing.length, fields: changeFields })}
              </span>
            </div>

            {visible.length === 0
              ? <p className="cs-hint">{t('filteredEmpty')}</p>
              : (
                <div className="cs-table-wrap">
                  <table className="cs-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label={t('selectAll')}
                            checked={selectable.length > 0 && selectable.every(entry => selected.has(entry.row.id))}
                            onChange={(event) => {
                              const keep = event.target.checked ? new Set(selectable.map(entry => entry.row.id)) : new Set<string>()
                              setSelected(keep)
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
                      {visible.map(({ row, model, changes }) => {
                        const changeOf = (key: keyof CapabilityFields): FieldChange | undefined =>
                          changes.find(change => change.key === key)
                        return (
                          <tr key={row.id} className={changes.length > 0 ? 'cs-row--changed' : undefined}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={row.id}
                                checked={selected.has(row.id)}
                                disabled={changes.length === 0}
                                onChange={() => { toggle(row.id) }}
                              />
                            </td>
                            <td className="cs-id">{row.id}</td>
                            <td className="cs-dim">
                              {row.match === undefined ? '—' : `${row.match.provider}/${row.match.modelId}`}
                              {' '}<span className="cs-badge">{viaLabel(row, t)}</span>
                            </td>
                            <td>{valueCell(changeOf('contextWindow'), model.contextWindow, tokens)}</td>
                            <td>{valueCell(changeOf('maxTokens'), model.maxTokens, tokens)}</td>
                            <td>
                              {valueCell(changeOf('input'), model.input, value => imageText(value, t))}
                            </td>
                            <td>
                              <span className={liveRows.get(row.id)?.input?.includes('image') === true ? 'cs-badge cs-badge--image' : 'cs-dim'}>
                                {liveLabel(liveRows.get(row.id), t)}
                              </span>
                            </td>
                            <td className="cs-dim">
                              {valueCell(changeOf('reasoningEfforts'), model.reasoningEfforts, reasoningText)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            {liveRows.size > 0
              ? <p className="cs-hint">{t('liveSummary', { image: liveImage, text: liveText })}</p>
              : null}
            <div className="cs-row">
              <button
                type="button"
                className="cs-button cs-button--primary"
                disabled={busy !== 'idle' || !changing.some(entry => selected.has(entry.row.id))}
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
              {unmatched.map(entry => (
                <li key={entry.row.id}>
                  {entry.row.id}
                  {entry.row.reason === undefined ? null : <span className="cs-dim"> — {entry.row.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )
        : null}
    </div>
  )
}
