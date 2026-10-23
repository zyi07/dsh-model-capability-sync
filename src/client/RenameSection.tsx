/**
 * The name-redirect settings section: pick a provider entry, preview how each
 * display name would change, then write the selected names.
 *
 * Pure props — no context access, no subscriptions. Everything arrives through
 * the inject face `apply` builds, including the bound translate function.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ModelDraft, SettingsDescriptor, SettingsInjected } from './shared.ts'
import { providersOf, sortedModelsOf, TARGET_DEFAULT, targetLabelOf } from './shared.ts'
import { planNames, renameModels } from './rename.ts'

/** What `apply` injects into this component (the capability channel is not used here). */
export type RenameSectionInjected = SettingsInjected

export interface RenameSectionProps extends RenameSectionInjected {
  t: (key: string, params?: Record<string, unknown>) => string
}

/**
 * Render the section.
 * @param props - injected settings face plus the bound translate function.
 * @returns the section body.
 */
export function RenameSection(props: RenameSectionProps): ReactNode {
  const { t, describeSettings, mutateSettings } = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState<string | undefined>(undefined)
  const [descriptors, setDescriptors] = useState<SettingsDescriptor[]>([])
  const [targetNs, setTargetNs] = useState(TARGET_DEFAULT)
  const [providerKey, setProviderKey] = useState('')
  const [models, setModels] = useState<ModelDraft[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  /**
   * Preselect every row the redirect would actually rewrite.
   * @param entries - the provider's models, in display order.
   * @returns the ids worth applying.
   */
  const preselected = (entries: readonly ModelDraft[]): ReadonlySet<string> =>
    new Set(planNames(entries).filter(row => row.changed).map(row => row.id))

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
      const entries = sortedModelsOf(providers[firstKey])
      setTargetNs(target.ns)
      setProviderKey(firstKey)
      setModels(entries)
      setSelected(preselected(entries))
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
    const entries = sortedModelsOf(providers[resolved])
    setTargetNs(ns)
    setProviderKey(resolved)
    setModels(entries)
    setSelected(preselected(entries))
    setNotice(undefined)
    setQuery('')
  }

  /** Write the selected names into the provider entry. */
  const applyNames = async (): Promise<void> => {
    const descriptor = descriptors.find(entry => entry.ns === targetNs)
    if (descriptor === undefined) return
    const targets = new Set(planNames(models).filter(row => row.changed && selected.has(row.id)).map(row => row.id))
    if (targets.size === 0) {
      setNotice(t('nothingSelected'))
      return
    }
    const { next, written } = renameModels(models, targets)
    setBusy(true)
    setErrorText(undefined)
    setNotice(undefined)
    try {
      const view = await mutateSettings(targetNs, [{
        op: 'set',
        path: ['providers', providerKey, 'models'],
        value: next,
      }], descriptor.revision)
      setModels(next)
      setSelected(new Set())
      // Keep the held revision current, so a second apply does not conflict.
      setDescriptors(previous => previous.map(entry =>
        entry.ns === targetNs && typeof view.revision === 'number'
          ? { ...entry, revision: view.revision }
          : entry))
      setNotice(t('redirectApplied', { count: written }))
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code
      if (code === 'settings/conflict') {
        // Someone else wrote this entry while the page was open. Reload the
        // baseline instead of retrying blindly: a silent retry would overwrite
        // whatever they just saved.
        try {
          const list = await describeSettings()
          setDescriptors(list)
          const descriptorNow = list.find(entry => entry.ns === targetNs)
          if (descriptorNow !== undefined) {
            const entries = sortedModelsOf(providersOf(descriptorNow)[providerKey])
            setModels(entries)
            setSelected(preselected(entries))
          }
        } catch {
          // Keep the conflict message; the reload is only a convenience.
        }
        setNotice(t('conflictReload'))
      } else {
        setErrorText(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setBusy(false)
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
  const plan = planNames(models)
  const changed = plan.filter(row => row.changed)
  const needle = query.trim().toLowerCase()
  const visible = plan.filter((row) => {
    if (onlyChanged && !row.changed) return false
    if (needle === '') return true
    return row.id.toLowerCase().includes(needle)
      || row.before.toLowerCase().includes(needle)
      || row.after.toLowerCase().includes(needle)
  })
  const selectable = visible.filter(row => row.changed)
  const toggle = (id: string): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div>
      <p className="cs-hint">{t('redirectIntro')}</p>
      <p className="cs-hint">{t('redirectRule')}</p>

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
      </div>

      {errorText !== undefined ? <p className="cs-error">{errorText}</p> : null}
      {notice !== undefined ? <p className="cs-hint">{notice}</p> : null}

      {models.length === 0
        ? <p className="cs-hint">{t('noModels')}</p>
        : (
          <>
            <div className="cs-row">
              <input
                className="cs-input"
                type="search"
                value={query}
                placeholder={t('redirectSearch')}
                onChange={(event) => { setQuery(event.target.value) }}
              />
              <label className="cs-hint">
                <input type="checkbox" checked={onlyChanged} onChange={(event) => { setOnlyChanged(event.target.checked) }} />
                {' '}{t('onlyChanged')}
              </label>
              <span className="cs-hint">
                {changed.length === 0
                  ? t('redirectNoChanges')
                  : t('redirectSummary', { count: changed.length })}
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
                            checked={selectable.length > 0 && selectable.every(row => selected.has(row.id))}
                            onChange={(event) => {
                              setSelected(event.target.checked ? new Set(selectable.map(row => row.id)) : new Set<string>())
                            }}
                          />
                        </th>
                        <th>{t('colModel')}</th>
                        <th>{t('colPrefix')}</th>
                        <th>{t('colNameBefore')}</th>
                        <th>{t('colNameAfter')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(row => (
                        <tr key={row.id} className={row.changed ? 'cs-row--changed' : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={row.id}
                              checked={selected.has(row.id)}
                              disabled={!row.changed}
                              onChange={() => { toggle(row.id) }}
                            />
                          </td>
                          <td className="cs-id">{row.id}</td>
                          <td className="cs-dim">{row.prefix === '' ? '—' : row.prefix}</td>
                          <td className={row.changed ? 'cs-from' : 'cs-dim'}>{row.before}</td>
                          <td>{row.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            {changed.length === 0
              ? null
              : <p className="cs-hint">{t('redirectFooter', { count: plan.length - changed.length })}</p>}

            <div className="cs-row">
              <button
                type="button"
                className="cs-button cs-button--primary"
                disabled={busy || !changed.some(row => selected.has(row.id))}
                onClick={() => { void applyNames() }}
              >
                {busy ? t('redirectApplying') : t('redirectApply')}
              </button>
            </div>
          </>
        )}
    </div>
  )
}
