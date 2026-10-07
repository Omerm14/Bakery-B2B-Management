import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ChevronRight, ChevronLeft, History, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import SearchInput from '../components/SearchInput'
import { useTranslation } from '../context/LanguageContext'
import { weekdayLabel, formatShortDate, toLocalISODate } from '../constants/days'
import { timeAgo } from '../lib/time'
import { useAutoSyncPref } from '../hooks/useAutoSyncPref'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import { customerDisplayName } from '../lib/displayName'
import LineHistoryModal from '../components/audit/LineHistoryModal'
import { AuditQuantity } from '../components/audit/auditFormat'
import { auditReasonLabel } from '../lib/auditLabels'

const PAGE_SIZE = 100
// Past this many pages the offset scan gets wasteful — nudge toward
// narrower filters instead of paging further.
const DEEP_PAGE = 50
const DEFAULT_WINDOW_DAYS = 30
// Supabase's default max-rows: an 'estimated' count above it is a planner
// estimate rather than an exact count, so it's shown with a "~".
const EXACT_COUNT_LIMIT = 1000

const COLUMNS = 'id, created_at, action, customer_id, menu_item_id, customer_name, item_name_he, delivery_date, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via, no_carry_forward, menu_items(name_he, name_en)'

function windowStartISO(toIso) {
  const d = toIso ? new Date(`${toIso}T00:00:00`) : new Date()
  d.setDate(d.getDate() - DEFAULT_WINDOW_DAYS)
  return toLocalISODate(d)
}

// Local-midnight of a YYYY-MM-DD date as a UTC timestamp, so "changed on
// 16/10" means 16/10 Israel time, not UTC.
function localDayStartISO(iso, plusDays = 0) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + plusDays).toISOString()
}

// Every filter is applied server-side and index-backed (migration 060), so
// each request reads one page, never the whole log. Without a customer, item
// or delivery-date filter the change-date window always applies (default:
// last 30 days) so the default view can't turn into a full-table scan.
function applyFilters(q, f) {
  if (f.customer) q = q.eq('customer_id', f.customer)
  if (f.item) q = q.eq('menu_item_id', f.item)
  if (f.changedFrom) q = q.gte('created_at', localDayStartISO(f.changedFrom))
  if (f.changedTo) q = q.lt('created_at', localDayStartISO(f.changedTo, 1))
  if (f.deliveryFrom) q = q.gte('delivery_date', f.deliveryFrom)
  if (f.deliveryTo) q = q.lte('delivery_date', f.deliveryTo)
  // Commas/parens/wildcards would break or widen PostgREST's or() filter.
  const text = f.text.replace(/[,()%*\\]/g, ' ').trim()
  if (text) q = q.or(`customer_name.ilike.*${text}*,item_name_he.ilike.*${text}*`)
  return q
}

export default function AuditLog() {
  const { t, lang } = useTranslation()
  const [params, setParams] = useSearchParams()
  // Auto-sync entries (Wednesday rollover + portal view auto-fill, both
  // change_reason: 'auto_copy') dwarf real staff/customer edits in volume —
  // hidden by default so the log reads as an actual change history. Shared
  // with the notification bell (see useAutoSyncPref) so this one toggle
  // controls both surfaces.
  const [showAutoSync, setShowAutoSync] = useAutoSyncPref()
  const { customers } = useCustomers({ activeOnly: false })
  const { menuItems } = useMenuItems({ activeOnly: false })

  const [rows, setRows] = useState(null)
  const [count, setCount] = useState(0)
  const [autoSyncCount, setAutoSyncCount] = useState(0)
  const [selected, setSelected] = useState(null)
  const [textInput, setTextInput] = useState(params.get('q') || '')

  const page = Math.max(0, parseInt(params.get('p') || '0', 10) || 0)
  const raw = {
    customer: params.get('c') || '',
    item: params.get('i') || '',
    changedFrom: params.get('from') || '',
    changedTo: params.get('to') || '',
    deliveryFrom: params.get('dfrom') || '',
    deliveryTo: params.get('dto') || '',
    text: params.get('q') || '',
  }
  const narrowed = Boolean(raw.customer || raw.item || raw.deliveryFrom || raw.deliveryTo)
  const windowForced = !raw.changedFrom && !narrowed
  const filters = useMemo(() => ({
    ...raw,
    // 30 days back from the "to" date when one is set, else from today.
    changedFrom: windowForced ? windowStartISO(raw.changedTo) : raw.changedFrom,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [params.toString()])
  const filterKey = JSON.stringify(filters)

  // Built from the live URL rather than react-router's `prev`, which is the
  // render-time snapshot — two quick updates (delivery from, then to) would
  // otherwise overwrite each other.
  function setFilter(key, value, { replace = false } = {}) {
    setParams(() => {
      const next = new URLSearchParams(window.location.search)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('p')
      return next
    }, { replace })
  }

  function setPage(n) {
    setParams(() => {
      const next = new URLSearchParams(window.location.search)
      if (n > 0) next.set('p', String(n)); else next.delete('p')
      return next
    })
  }

  function clearFilters() {
    setTextInput('')
    setParams(new URLSearchParams())
  }

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (textInput === raw.text) return
    const id = setTimeout(() => setFilter('q', textInput, { replace: true }), 300)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput])

  useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    let q = supabase.from('order_line_audit').select(COLUMNS, { count: 'estimated' })
    // With a delivery-date range, sort by delivery day first: it lets Postgres
    // walk idx_order_line_audit_delivery_created directly (~2ms on 1M rows)
    // instead of scanning the whole change-date index for matching days.
    if (filters.deliveryFrom || filters.deliveryTo) q = q.order('delivery_date', { ascending: false })
    q = q.order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .abortSignal(controller.signal)
    q = applyFilters(q, filters)
    if (!showAutoSync) q = q.neq('change_reason', 'auto_copy')
    q.then(({ data, count: c, error }) => {
      if (controller.signal.aborted) return
      if (error) console.error('[AuditLog]', error)
      setRows(data || [])
      setCount(c || 0)
    })
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, showAutoSync])

  // Badge on the "show auto-sync" button — only needed while they're hidden.
  useEffect(() => {
    if (showAutoSync) return
    const controller = new AbortController()
    applyFilters(
      supabase.from('order_line_audit').select('id', { count: 'estimated', head: true }).eq('change_reason', 'auto_copy'),
      filters,
    ).abortSignal(controller.signal)
      .then(({ count: c }) => { if (!controller.signal.aborted) setAutoSyncCount(c || 0) })
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, showAutoSync])

  const approx = count > EXACT_COUNT_LIMIT
  const fmtCount = (n) => `${approx ? '~' : ''}${n.toLocaleString(lang === 'en' ? 'en-US' : 'he-IL')}`
  const firstRow = count === 0 ? 0 : page * PAGE_SIZE + 1
  const lastRow = Math.min(count, (page + 1) * PAGE_SIZE)
  const hasNext = rows?.length === PAGE_SIZE
  const hasFilters = [...params.keys()].some(k => k !== 'p')

  const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--t3)' }
  const inputStyle = { minWidth: 0, padding: '6px 10px', fontSize: 13 }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('nav.audit')}</h1>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ ...labelStyle, flex: '1 1 180px' }}>
          {t('settings.auditFilterCustomer')}
          <select className="input" style={inputStyle} value={raw.customer} onChange={e => setFilter('c', e.target.value)}>
            <option value="">{t('settings.auditAllCustomers')}</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {customerDisplayName(c, lang)}{c.active ? '' : ` ${t('settings.auditInactive')}`}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: '1 1 180px' }}>
          {t('settings.auditFilterItem')}
          <select className="input" style={inputStyle} value={raw.item} onChange={e => setFilter('i', e.target.value)}>
            <option value="">{t('settings.auditAllItems')}</option>
            {menuItems.map(m => (
              <option key={m.id} value={m.id}>
                {lang === 'en' ? (m.name_en || m.name_he) : m.name_he}{m.active ? '' : ` ${t('settings.auditInactive')}`}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          {t('settings.auditChangedFrom')}
          <input type="date" className="input" style={inputStyle} value={filters.changedFrom} onChange={e => setFilter('from', e.target.value)} />
        </label>
        <label style={labelStyle}>
          {t('settings.auditChangedTo')}
          <input type="date" className="input" style={inputStyle} value={raw.changedTo} onChange={e => setFilter('to', e.target.value)} />
        </label>
        <label style={labelStyle}>
          {t('settings.auditDeliveryFrom')}
          <input type="date" className="input" style={inputStyle} value={raw.deliveryFrom} onChange={e => setFilter('dfrom', e.target.value)} />
        </label>
        <label style={labelStyle}>
          {t('settings.auditDeliveryTo')}
          <input type="date" className="input" style={inputStyle} value={raw.deliveryTo} onChange={e => setFilter('dto', e.target.value)} />
        </label>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}><X size={14} />{t('settings.auditClearFilters')}</button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 240px' }}>
          <SearchInput value={textInput} onChange={setTextInput} placeholder={t('settings.searchAuditPlaceholder')} />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAutoSync(v => !v)}
          title={showAutoSync ? t('settings.auditHideAutoSync') : t('settings.auditShowAutoSync')}
        >
          {showAutoSync ? <EyeOff size={14} /> : <Eye size={14} />}
          {showAutoSync ? t('settings.auditHideAutoSync') : t('settings.auditShowAutoSync')}
          {!showAutoSync && autoSyncCount > 0 && ` (${autoSyncCount > EXACT_COUNT_LIMIT ? '~' : ''}${autoSyncCount})`}
        </button>
      </div>

      {windowForced && (
        <div style={{ fontSize: 12, color: 'var(--amber)', margin: '2px 0 8px' }}>{t('settings.auditDefaultWindowHint')}</div>
      )}

      <div className="card" style={{ padding: 0, marginTop: 4 }}>
        <div className="itbl-wrap">
        <table className="itbl">
          <thead>
            <tr>
              <th>{t('settings.col.changeDate')}</th>
              <th>{t('common.customer')}</th>
              <th>{t('common.item')}</th>
              <th>{t('settings.col.deliveryDate')}</th>
              <th style={{ textAlign: 'center' }}>{t('common.quantity')}</th>
              <th>{t('settings.col.source')}</th>
              <th>{t('settings.col.reason')}</th>
              <th>{t('settings.col.note')}</th>
              <th>{t('settings.col.changedBy')}</th>
              <th aria-label={t('settings.auditLineHistory')} />
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={10}><div className="shimmer" style={{ height: 14, width: '60%', borderRadius: 4 }} /></td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>{t('settings.auditNoResults')}</td></tr>
            )}
            {rows?.map(row => {
              const itemName = row.menu_items
                ? (lang === 'en' ? (row.menu_items.name_en || row.menu_items.name_he) : row.menu_items.name_he)
                : row.item_name_he
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  onKeyDown={e => { if (e.key === 'Enter') setSelected(row) }}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  title={t('settings.auditLineHistory')}
                >
                  <td dir="ltr" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>
                    {new Date(row.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    <div style={{ fontWeight: 400, color: 'var(--t3)' }}>{timeAgo(row.created_at, lang)}</div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.customer_name || '—'}</td>
                  <td>{itemName || '—'}</td>
                  <td dir="ltr" style={{ fontSize: 12, color: 'var(--t3)' }}>{weekdayLabel(row.delivery_date, lang)} {formatShortDate(row.delivery_date)}</td>
                  <td style={{ textAlign: 'center' }}><AuditQuantity row={row} /></td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.source}</td>
                  <td style={{ fontSize: 12 }}>{auditReasonLabel(row, t)}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.change_note || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.changed_by || '—'}</td>
                  <td style={{ color: 'var(--t3)' }}><History size={14} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--bdr)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
            {rows !== null && count > 0 && <>{firstRow.toLocaleString()}–{lastRow.toLocaleString()} {t('settings.auditPagerOf')} {fmtCount(count)}</>}
            {page + 1 >= DEEP_PAGE && <span style={{ color: 'var(--amber)', marginInlineStart: 10 }}>{t('settings.auditNarrowHint')}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {lang === 'en' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}{t('settings.auditPrev')}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={!hasNext} onClick={() => setPage(page + 1)}>
              {t('settings.auditNext')}{lang === 'en' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>
      </div>

      {selected && <LineHistoryModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
