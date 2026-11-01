import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Pencil, Lock, Download, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTranslation } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'
import { useMenuItems } from '../hooks/useMenuItems'
import SearchInput from '../components/SearchInput'
import { Link } from 'react-router-dom'
import { isoToday, toLocalISODate, weekdayLabel, formatShortDate } from '../constants/days'
import { unitFromMenuUnit, parseQty, stepQty, formatQty, formatTotals, groupByDate, matchesText } from '../lib/waste'
import { trackEvent } from '../lib/posthog'

// How many days back (before today) each period reaches.
const PERIOD_DAYS = { today: 0, week: 6, month: 29 }
const LAST_WORKER_KEY = 'floory_waste_worker'
const COLUMNS = 'id, waste_date, item_name, menu_item_id, quantity, unit, reason, worker_id, created_by, created_at'
const ROW_LIMIT = 2000

function readLastWorker() {
  try { return localStorage.getItem(LAST_WORKER_KEY) || '' } catch { return '' }
}
function writeLastWorker(id) {
  try { localStorage.setItem(LAST_WORKER_KEY, id) } catch { /* private mode */ }
}

function daysBefore(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(2000, 0, 1)
  dt.setFullYear(y, m - 1, d - n)
  return toLocalISODate(dt)
}

function useIsNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

function blankForm(date, workerId) {
  return { date, item: '', reason: '', workerId, qty: '1', unit: 'units' }
}

export default function Waste() {
  const { t, lang } = useTranslation()
  const toast = useToast()
  const locale = lang === 'en' ? 'en-US' : 'he-IL'
  const today = isoToday()
  const narrow = useIsNarrow()
  const { menuItems } = useMenuItems()

  const [workers, setWorkers] = useState([])
  const [workersLoaded, setWorkersLoaded] = useState(false)
  const [rows, setRows] = useState(null)
  const [period, setPeriod] = useState('week')
  const [workerFilter, setWorkerFilter] = useState('')
  const [text, setText] = useState('')

  const [form, setForm] = useState(() => blankForm(today, readLastWorker()))
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Row awaiting deletion: deleting needs the manager code (migration 069).
  const [deleteRow, setDeleteRow] = useState(null)
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const itemRef = useRef(null)
  const formRef = useRef(null)

  const fromIso = daysBefore(today, PERIOD_DAYS[period])

  useEffect(() => {
    supabase.from('waste_workers').select('id, name, active').order('name').then(({ data, error: err }) => {
      if (err) console.error('[Waste workers]', err)
      setWorkers(data || [])
      setWorkersLoaded(true)
    })
  }, [])

  // A remembered worker who was since hidden or removed shouldn't stay picked.
  useEffect(() => {
    if (!workersLoaded || !form.workerId || editingId) return
    if (!workers.some(w => w.id === form.workerId && w.active)) setForm(f => ({ ...f, workerId: '' }))
  }, [workersLoaded, workers, form.workerId, editingId])

  useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    supabase.from('waste_log').select(COLUMNS)
      .gte('waste_date', fromIso)
      .order('waste_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT)
      .abortSignal(controller.signal)
      .then(({ data, error: err }) => {
        if (controller.signal.aborted) return
        if (err) { console.error('[Waste]', err); toast.error(t('waste.loadFailed')) }
        setRows(data || [])
      })
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromIso])

  const workersById = useMemo(() => Object.fromEntries(workers.map(w => [w.id, w])), [workers])
  const activeWorkers = workers.filter(w => w.active || w.id === form.workerId)

  const menuByName = useMemo(() => {
    const map = new Map()
    for (const m of menuItems) {
      if (m.name_he) map.set(m.name_he.trim().toLowerCase(), m)
      if (m.name_en) map.set(m.name_en.trim().toLowerCase(), m)
    }
    return map
  }, [menuItems])

  const visible = useMemo(
    () => (rows || []).filter(r => (!workerFilter || r.worker_id === workerFilter) && matchesText(r, text)),
    [rows, workerFilter, text],
  )
  const groups = useMemo(() => groupByDate(visible), [visible])
  const todayRows = (rows || []).filter(r => r.waste_date === today)

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
    if (error) setError('')
  }

  function onItemChange(value) {
    const hit = menuByName.get(value.trim().toLowerCase())
    setForm(f => ({ ...f, item: value, ...(hit ? { unit: unitFromMenuUnit(hit.unit) } : {}) }))
    if (error) setError('')
  }

  function setUnit(unit) {
    setForm(f => ({ ...f, unit, qty: unit === 'units' ? String(Math.max(1, Math.round(parseFloat(f.qty) || 1))) : f.qty }))
  }

  function bump(dir) {
    setForm(f => ({ ...f, qty: String(stepQty(f.qty, f.unit, dir)) }))
  }

  function resetForm() {
    setForm(f => blankForm(f.date, f.workerId))
    setEditingId(null)
    setError('')
  }

  async function save() {
    if (saving) return
    const item = form.item.trim().replace(/\s+/g, ' ')
    const qty = parseQty(form.qty, form.unit)
    if (!item) { setError(t('waste.errItem')); return }
    if (!form.workerId) { setError(t('waste.errWorker')); return }
    if (qty === null) { setError(t('waste.errQty')); return }

    const payload = {
      waste_date: form.date || today,
      item_name: item,
      menu_item_id: menuByName.get(item.toLowerCase())?.id ?? null,
      quantity: qty,
      unit: form.unit,
      reason: form.reason.trim() || null,
      worker_id: form.workerId,
    }
    setSaving(true)
    const query = editingId
      ? supabase.from('waste_log').update(payload).eq('id', editingId)
      : supabase.from('waste_log').insert(payload)
    const { data, error: err } = await query.select(COLUMNS).single()
    setSaving(false)
    if (err) { console.error('[Waste save]', err); toast.error(t('waste.saveFailed')); return }

    writeLastWorker(form.workerId)
    const inRange = data.waste_date >= fromIso
    setRows(prev => {
      const rest = (prev || []).filter(r => r.id !== data.id)
      return inRange ? [data, ...rest] : rest
    })
    if (editingId) {
      toast.success(t('waste.updated'))
      trackEvent('waste_updated', { unit: data.unit })
      if (narrow) setSheetOpen(false)
    } else {
      toast.success(t('waste.added').replace('{item}', data.item_name).replace('{qty}', formatQty(data.quantity, data.unit, t, locale)))
      trackEvent('waste_added', { unit: data.unit, from_menu: Boolean(data.menu_item_id), has_reason: Boolean(data.reason) })
    }
    resetForm()
    itemRef.current?.focus()
  }

  function startEdit(row) {
    setEditingId(row.id)
    setConfirmId(null)
    setError('')
    setForm({
      date: row.waste_date, item: row.item_name, reason: row.reason || '',
      workerId: row.worker_id, qty: String(Number(row.quantity)), unit: row.unit,
    })
    if (narrow) setSheetOpen(true)
    else {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => itemRef.current?.focus(), 250)
    }
  }

  function askDelete(row) {
    setDeleteRow(row)
    setDeleteCode('')
    setDeleteError('')
  }

  function closeDelete() {
    if (deleting) return
    setDeleteRow(null)
    setDeleteCode('')
    setDeleteError('')
  }

  async function confirmDelete() {
    if (!deleteRow || deleting) return
    if (!deleteCode.trim()) { setDeleteError(t('waste.codeMissing')); return }
    setDeleting(true)
    const { data: status, error: err } = await supabase.rpc('delete_waste_entry', { p_id: deleteRow.id, p_code: deleteCode })
    setDeleting(false)
    if (err) { console.error('[Waste delete]', err); setDeleteError(t('waste.deleteFailed')); return }
    if (status === 'deleted' || status === 'not_found') {
      const id = deleteRow.id
      setRows(r => (r || []).filter(x => x.id !== id))
      if (editingId === id) resetForm()
      setDeleteRow(null)
      setDeleteCode('')
      toast.success(t('waste.deleted'))
      trackEvent('waste_deleted')
      return
    }
    const messages = { bad_code: 'waste.codeWrong', locked: 'waste.codeLocked', no_code: 'waste.codeNotSet' }
    setDeleteError(t(messages[status] || 'waste.deleteFailed'))
    if (status === 'bad_code') setDeleteCode('')
    trackEvent('waste_delete_refused', { status })
  }

  function exportXlsx() {
    const header = [t('waste.colDate'), t('waste.colItem'), t('waste.colQty'), t('waste.unit'), t('waste.colReason'), t('waste.colWorker'), t('waste.colCreatedBy')]
    const body = [...visible]
      .sort((a, b) => (a.waste_date === b.waste_date ? String(a.created_at).localeCompare(String(b.created_at)) : a.waste_date < b.waste_date ? -1 : 1))
      .map(r => [
        formatShortDate(r.waste_date) + '/' + r.waste_date.slice(0, 4),
        r.item_name,
        Number(r.quantity),
        r.unit === 'kg' ? t('waste.unitKg') : t('waste.unitUnits'),
        r.reason || '',
        workersById[r.worker_id]?.name || '',
        r.created_by || '',
      ])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 36 }, { wch: 16 }, { wch: 26 }]
    XLSX.utils.book_append_sheet(wb, ws, t('waste.exportFile'))
    XLSX.writeFile(wb, `${t('waste.exportFile')}_${fromIso}_${today}.xlsx`)
    trackEvent('waste_export', { rows: body.length, period })
  }

  function dayLabel(iso) {
    const prefix = iso === today ? `${t('waste.today')} · ` : iso === daysBefore(today, 1) ? `${t('waste.yesterday')} · ` : ''
    return `${prefix}${weekdayLabel(iso, lang)} ${formatShortDate(iso)}`
  }

  const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }

  const formBody = (
    <>
      <div className="waste-form">
        <div className="waste-field" style={{ flex: '0 0 160px' }}>
          <label htmlFor="waste-date">{t('waste.date')}</label>
          <input id="waste-date" className="input" type="date" dir="ltr" max={today}
            value={form.date} onChange={e => setField('date', e.target.value)} />
        </div>
        <div className="waste-field" style={{ flex: '2 1 200px' }}>
          <label htmlFor="waste-item">{t('waste.item')}</label>
          <input id="waste-item" ref={itemRef} className="input" type="text" list="waste-menu-items" autoComplete="off"
            maxLength={200} placeholder={t('waste.itemPlaceholder')}
            value={form.item} onChange={e => onItemChange(e.target.value)} onKeyDown={onEnter} />
          <datalist id="waste-menu-items">
            {menuItems.map(m => <option key={m.id} value={lang === 'en' ? (m.name_en || m.name_he) : m.name_he} />)}
          </datalist>
        </div>
        <div className="waste-field" style={{ flex: '3 1 240px' }}>
          <label htmlFor="waste-reason">{t('waste.reason')}</label>
          <input id="waste-reason" className="input" type="text" maxLength={500} placeholder={t('waste.reasonPlaceholder')}
            value={form.reason} onChange={e => setField('reason', e.target.value)} onKeyDown={onEnter} />
        </div>
        <div className="waste-field" style={{ flex: '1 1 160px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <label htmlFor="waste-worker">{t('waste.worker')}</label>
            <Link className="waste-link" to="/settings?tab=workers">{t('waste.manageWorkers')}</Link>
          </div>
          <select id="waste-worker" className="input" value={form.workerId} onChange={e => setField('workerId', e.target.value)}>
            <option value="">{t('waste.pickWorker')}</option>
            {activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="waste-field" style={{ flex: '0 0 auto' }}>
          <label htmlFor="waste-qty">{t('waste.quantity')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="waste-stepper">
              <button type="button" aria-label={t('waste.decrease')} onClick={() => bump(-1)}>−</button>
              <input id="waste-qty" type="number" inputMode="decimal" min="0" step={form.unit === 'kg' ? '0.1' : '1'} dir="ltr"
                value={form.qty} onChange={e => setField('qty', e.target.value)} onKeyDown={onEnter} />
              <button type="button" aria-label={t('waste.increase')} onClick={() => bump(1)}>+</button>
            </div>
            <div className="waste-seg" role="group" aria-label={t('waste.unit')}>
              <button type="button" aria-pressed={form.unit === 'units'} onClick={() => setUnit('units')}>{t('waste.unitUnits')}</button>
              <button type="button" aria-pressed={form.unit === 'kg'} onClick={() => setUnit('kg')}>{t('waste.unitKg')}</button>
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-primary waste-save" onClick={save} disabled={saving}>
          {!editingId && <Plus size={16} />}
          {saving ? t('waste.saving') : editingId ? t('waste.update') : t('waste.add')}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, minHeight: 18 }}>
        {!narrow && <span style={{ fontSize: 12.5, color: 'var(--t3)' }}>{t('waste.hint')}</span>}
        {error && <span role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>{error}</span>}
        {workersLoaded && workers.filter(w => w.active).length === 0 && (
          <Link className="waste-link" to="/settings?tab=workers">{t('waste.noWorkersHint')}</Link>
        )}
      </div>
    </>
  )

  function actions(row) {
    return (
      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <button className="waste-icon-btn" aria-label={t('waste.edit')} title={t('waste.edit')} onClick={() => startEdit(row)}><Pencil size={15} /></button>
        <button className="waste-icon-btn" aria-label={t('waste.delete')} title={t('waste.deleteManagerOnly')} onClick={() => askDelete(row)}><Lock size={15} /></button>
      </div>
    )
  }

  function workerCell(row) {
    const name = workersById[row.worker_id]?.name || '—'
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="waste-avatar" aria-hidden="true">{name.charAt(0)}</span>
        <span>{name}</span>
      </span>
    )
  }

  return (
    <div className="page">
      <div className="page-header" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">{t('waste.title')}</h1>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4 }}>{t('waste.subtitle')}</div>
        </div>
        <div className="waste-toolbar">
          <select className="input" aria-label={t('waste.period')} value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto' }}>
            <option value="today">{t('waste.periodToday')}</option>
            <option value="week">{t('waste.periodWeek')}</option>
            <option value="month">{t('waste.periodMonth')}</option>
          </select>
          <select className="input" aria-label={t('waste.filterWorker')} value={workerFilter} onChange={e => setWorkerFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">{t('waste.allWorkers')}</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <SearchInput value={text} onChange={setText} placeholder={t('waste.searchPlaceholder')} aria-label={t('waste.searchPlaceholder')} />
          </div>
          <button className="btn btn-ghost" onClick={exportXlsx} disabled={!visible.length}>
            <Download size={15} /> {t('waste.export')}
          </button>
        </div>
      </div>

      <div className="waste-stats">
        <div className="card waste-stat">
          <span>{t('waste.statToday')}</span>
          <strong>{rows === null ? '—' : formatTotals(todayRows, t, locale)}</strong>
        </div>
        <div className="card waste-stat">
          <span>{t('waste.statView')}</span>
          <strong>{rows === null ? '—' : formatTotals(visible, t, locale)}</strong>
        </div>
        <div className="card waste-stat">
          <span>{t('waste.statCount')}</span>
          <strong>{rows === null ? '—' : visible.length.toLocaleString(locale)}</strong>
        </div>
      </div>

      {!narrow && (
        <section ref={formRef} className="card waste-form-card" aria-label={editingId ? t('waste.editTitle') : t('waste.newTitle')}
          style={editingId ? { borderColor: 'var(--accent-bdr)' } : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{editingId ? t('waste.editTitle') : t('waste.newTitle')}</h2>
            {editingId && <button className="btn btn-ghost btn-sm" onClick={resetForm}>{t('waste.cancelEdit')}</button>}
          </div>
          {formBody}
        </section>
      )}

      {narrow ? (
        <div className="waste-cards">
          {rows === null && <div className="shimmer" style={{ height: 90 }} />}
          {rows !== null && groups.length === 0 && <div className="waste-empty">{t('waste.empty')}</div>}
          {groups.map(g => (
            <div key={g.date} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="waste-day-head">
                <span>{dayLabel(g.date)}</span>
                <span className="waste-mono">{formatTotals(g.rows, t, locale)}</span>
              </div>
              {g.rows.map(r => (
                <div key={r.id} className="card waste-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{r.item_name}</span>
                    <span className="waste-qty-pill">{formatQty(r.quantity, r.unit, t, locale)}</span>
                  </div>
                  {r.reason && <div style={{ fontSize: 14, color: 'var(--t2)' }}>{r.reason}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                    {workerCell(r)}
                    {actions(r)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="itbl-wrap">
            <table className="itbl waste-table">
              <thead>
                <tr>
                  <th>{t('waste.colItem')}</th>
                  <th>{t('waste.colQty')}</th>
                  <th>{t('waste.colReason')}</th>
                  <th>{t('waste.colWorker')}</th>
                  <th aria-label={t('waste.edit')} />
                </tr>
              </thead>
              <tbody>
                {rows === null && (
                  <tr><td colSpan={5}><div className="shimmer" style={{ height: 14, width: '60%', borderRadius: 4 }} /></td></tr>
                )}
                {rows !== null && groups.length === 0 && (
                  <tr><td colSpan={5} className="waste-empty">{t('waste.empty')}</td></tr>
                )}
                {groups.map(g => [
                  <tr key={g.date} className="waste-day-row">
                    <td colSpan={5}>
                      <div className="waste-day-head">
                        <span>{dayLabel(g.date)}</span>
                        <span className="waste-mono">{formatTotals(g.rows, t, locale)}</span>
                      </div>
                    </td>
                  </tr>,
                  ...g.rows.map(r => (
                    <tr key={r.id} style={editingId === r.id ? { background: 'var(--accent-tint)' } : undefined}>
                      <td style={{ fontWeight: 600 }}>{r.item_name}</td>
                      <td className="waste-mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatQty(r.quantity, r.unit, t, locale)}</td>
                      <td style={{ color: 'var(--t2)' }}>{r.reason || '—'}</td>
                      <td>{workerCell(r)}</td>
                      <td style={{ width: 100 }}>{actions(r)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {narrow && !sheetOpen && (
        <button className="waste-fab" onClick={() => { resetForm(); setSheetOpen(true) }}>
          <Plus size={20} strokeWidth={2.4} /> {t('waste.fab')}
        </button>
      )}

      {narrow && sheetOpen && (
        <div className="overlay waste-sheet-overlay" onClick={() => { setSheetOpen(false); resetForm() }}>
          <div className="waste-sheet" role="dialog" aria-modal="true" aria-labelledby="waste-sheet-title" onClick={e => e.stopPropagation()}>
            <div className="waste-sheet-grip" aria-hidden="true" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 id="waste-sheet-title" style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{editingId ? t('waste.editTitle') : t('waste.newTitle')}</h2>
              <button className="waste-icon-btn" aria-label={t('waste.close')} onClick={() => { setSheetOpen(false); resetForm() }}><X size={20} /></button>
            </div>
            {formBody}
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="overlay" onClick={closeDelete}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="waste-delete-title" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div id="waste-delete-title" className="modal-title" style={{ marginBottom: 8 }}>{t('waste.deleteTitle')}</div>
            <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 4 }}>
              <strong style={{ color: 'var(--t1)' }}>{deleteRow.item_name}</strong> · {formatQty(deleteRow.quantity, deleteRow.unit, t, locale)} · {formatShortDate(deleteRow.waste_date)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>{t('waste.deleteExplain')}</div>
            <label className="lbl" htmlFor="waste-delete-code">{t('waste.managerCode')}</label>
            <input
              id="waste-delete-code"
              className="input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              dir="ltr"
              value={deleteCode}
              onChange={e => { setDeleteCode(e.target.value); if (deleteError) setDeleteError('') }}
              onKeyDown={e => { if (e.key === 'Enter') confirmDelete(); if (e.key === 'Escape') closeDelete() }}
            />
            <div role="alert" style={{ minHeight: 20, marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>{deleteError}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={closeDelete} disabled={deleting}>{t('waste.no')}</button>
              <button className="btn waste-danger" onClick={confirmDelete} disabled={deleting}>{deleting ? t('waste.saving') : t('waste.confirmDelete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
