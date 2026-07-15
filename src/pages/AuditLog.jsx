import { useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import SearchInput from '../components/SearchInput'
import { useTranslation } from '../context/LanguageContext'
import { weekdayLabel, formatShortDate } from '../constants/days'
import { timeAgo } from '../lib/time'
import { useAutoSyncPref } from '../hooks/useAutoSyncPref'

export default function AuditLog() {
  const { t, lang } = useTranslation()
  const [rows, setRows] = useState([])
  const [autoSyncCount, setAutoSyncCount] = useState(0)
  const [filterText, setFilterText] = useState('')
  // Auto-sync entries (Wednesday rollover + portal view auto-fill, both
  // change_reason: 'auto_copy') dwarf real staff/customer edits in volume —
  // hidden by default so the log reads as an actual change history. Shared
  // with the notification bell (see useAutoSyncPref) so this one toggle
  // controls both surfaces.
  const [showAutoSync, setShowAutoSync] = useAutoSyncPref()

  const AUDIT_REASON_LABELS = {
    customer_request: t('settings.auditReason.customerRequest'),
    internal_decision: t('settings.auditReason.internalDecision'),
    correction: t('settings.auditReason.correction'),
    other: t('settings.auditReason.other'),
    import: t('settings.auditReason.import'),
    forecast: t('settings.auditReason.forecast'),
  }

  useEffect(() => {
    // Filtered server-side, not just client-side after a flat top-200 fetch —
    // a single bulk auto-copy run (the Wednesday rollover, or backfilling it
    // by hand) can insert far more than 200 rows at once, which would other-
    // wise fill the entire window with auto-sync entries and leave nothing
    // to show once they're hidden, even though older real entries exist.
    let query = supabase.from('order_line_audit')
      .select('created_at, customer_name, item_name_he, delivery_date, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via, menu_items(name_he, name_en)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!showAutoSync) query = query.neq('change_reason', 'auto_copy')
    query.then(({ data }) => setRows(data || []))
  }, [showAutoSync])

  useEffect(() => {
    supabase.from('order_line_audit')
      .select('id', { count: 'exact', head: true })
      .eq('change_reason', 'auto_copy')
      .then(({ count }) => setAutoSyncCount(count || 0))
  }, [])

  const filtered = rows.filter(r =>
    (r.customer_name || '').includes(filterText.trim())
    || (r.item_name_he || '').includes(filterText.trim())
    || (r.menu_items?.name_he || '').includes(filterText.trim())
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('nav.audit')}</h1>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 240px' }}>
          <SearchInput value={filterText} onChange={setFilterText} placeholder={t('settings.searchAuditPlaceholder')} />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAutoSync(v => !v)}
          title={showAutoSync ? t('settings.auditHideAutoSync') : t('settings.auditShowAutoSync')}
        >
          {showAutoSync ? <EyeOff size={14} /> : <Eye size={14} />}
          {showAutoSync ? t('settings.auditHideAutoSync') : t('settings.auditShowAutoSync')}
          {!showAutoSync && autoSyncCount > 0 && ` (${autoSyncCount})`}
        </button>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 12 }}>
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const isNew = row.old_quantity == null
              const increasing = !isNew && row.new_quantity > row.old_quantity
              const qtyColor = isNew || increasing ? 'var(--green)' : 'var(--red)'
              const QtyArrow = isNew || increasing ? ArrowUp : ArrowDown
              const itemName = row.menu_items
                ? (lang === 'en' ? (row.menu_items.name_en || row.menu_items.name_he) : row.menu_items.name_he)
                : row.item_name_he
              return (
                <tr key={i}>
                  <td dir="ltr" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>
                    {new Date(row.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    <div style={{ fontWeight: 400, color: 'var(--t3)' }}>{timeAgo(row.created_at, lang)}</div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.customer_name || '—'}</td>
                  <td>{itemName || '—'}</td>
                  <td dir="ltr" style={{ fontSize: 12, color: 'var(--t3)' }}>{weekdayLabel(row.delivery_date, lang)} {formatShortDate(row.delivery_date)}</td>
                  <td dir="ltr" style={{ textAlign: 'center', fontSize: 12 }}>
                    <span style={{ color: qtyColor, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <QtyArrow size={12} />
                      {isNew ? `${t('header.notificationsNewItem')}: ${row.new_quantity}` : `${row.old_quantity} → ${row.new_quantity}`}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.source}</td>
                  <td style={{ fontSize: 12 }}>{AUDIT_REASON_LABELS[row.change_reason] || row.change_reason || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.change_note || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.changed_by || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
