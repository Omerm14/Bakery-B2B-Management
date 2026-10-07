import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../context/LanguageContext'
import { weekdayLabel, formatShortDate } from '../../constants/days'
import { timeAgo } from '../../lib/time'
import { AuditQuantity } from './auditFormat'
import { auditReasonLabel } from '../../lib/auditLabels'

// Every event for one order line — one customer × item × delivery day — from
// creation until now, oldest first. Keyed by those three fields rather than
// order_line_id: delete events store order_line_id = NULL (migration 059) and
// a line deleted then re-created gets a new id, so the id alone would split
// one line's story. Falls back to the name snapshots when the customer or
// item row itself was deleted (ids set null by the audit table's FKs).
export default function LineHistoryModal({ row, onClose }) {
  const { t, lang } = useTranslation()
  const [events, setEvents] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let q = supabase.from('order_line_audit')
      .select('id, created_at, action, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via, no_carry_forward')
      .eq('delivery_date', row.delivery_date)
      .order('created_at', { ascending: true })
      .limit(200)
      .abortSignal(controller.signal)
    q = row.customer_id ? q.eq('customer_id', row.customer_id) : q.eq('customer_name', row.customer_name)
    q = row.menu_item_id ? q.eq('menu_item_id', row.menu_item_id) : q.eq('item_name_he', row.item_name_he)
    q.then(({ data, error }) => {
      if (error) { if (!controller.signal.aborted) { console.error('[LineHistoryModal]', error); setEvents([]) } return }
      setEvents(data || [])
    })
    return () => controller.abort()
  }, [row])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const itemName = row.menu_items
    ? (lang === 'en' ? (row.menu_items.name_en || row.menu_items.name_he) : row.menu_items.name_he)
    : row.item_name_he

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>{t('settings.auditLineHistory')}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {row.customer_name || '—'} · {itemName || '—'} · <span dir="ltr">{weekdayLabel(row.delivery_date, lang)} {formatShortDate(row.delivery_date)}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{t('settings.auditLineHistoryHint')}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('settings.auditClose')}><X size={16} /></button>
        </div>

        <div style={{ marginTop: 16 }}>
          {events === null && <div className="shimmer" style={{ height: 120, borderRadius: 8 }} />}
          {events?.length === 0 && <div className="empty"><div className="empty-text">{t('settings.auditLineHistoryEmpty')}</div></div>}
          {events?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {events.map((ev, i) => (
                <div key={ev.id} style={{
                  display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, padding: '10px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--bdr)',
                }}>
                  <div dir="ltr" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {new Date(ev.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    <div style={{ fontWeight: 400, color: 'var(--t3)' }}>{timeAgo(ev.created_at, lang)}</div>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <AuditQuantity row={ev} />
                      <span style={{ color: 'var(--t2)' }}>{auditReasonLabel(ev, t)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                      {ev.changed_by || '—'}{ev.changed_via ? ` · ${t('settings.auditVia')} ${ev.changed_via}` : ''}{ev.change_note ? ` · ${ev.change_note}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
