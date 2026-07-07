import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Plus, RefreshCw, Copy, Wand2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWeek } from '../hooks/useWeek'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useToast } from '../context/ToastContext'
import { WEEK_DAYS, toLocalISODate, formatShortDate } from '../constants/days'
import SearchInput from '../components/SearchInput'

const REASON_LABELS = {
  customer_request: '📞 לקוח / וואטסאפ',
  internal_decision: '🏭 החלטה פנימית',
  correction: '✏️ תיקון טעות',
  other: 'אחר',
  import: 'ייבוא',
  forecast: 'תחזית',
}

export default function Orders() {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const week = useWeek()
  const { customers, setCustomers } = useCustomers()
  const { menuItems } = useMenuItems()
  const userEmail = useCurrentUser()
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerFilter, setCustomerFilter] = useState('')
  const [orderLines, setOrderLines] = useState({}) // key: `${menuItemId}_${date}` => line
  const [weekId, setWeekId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [copying, setCopying] = useState(false)
  const [bulkFillItem, setBulkFillItem] = useState(null)
  const [bulkFillQty, setBulkFillQty] = useState('')
  const [bulkFilling, setBulkFilling] = useState(false)
  const [changeReason, setChangeReason] = useState(() => localStorage.getItem('floory_change_reason') || 'customer_request')
  const [changeNote, setChangeNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const gridRef = useRef(null)

  const filteredCustomers = customers.filter(c => c.name.includes(customerFilter.trim()))

  useEffect(() => {
    if (!customers.length) return
    const wantedId = location.state?.customerId
    if (wantedId) {
      const match = customers.find(c => c.id === wantedId)
      if (match) setSelectedCustomer(match)
      navigate(location.pathname, { replace: true, state: null })
      return
    }
    if (!selectedCustomer) setSelectedCustomer(customers[0])
  }, [customers, location.state])

  useEffect(() => {
    if (selectedCustomer) loadOrders()
    else setOrderLines({})
    setChangeNote('')
    setShowNoteInput(false)
  }, [selectedCustomer, week.weekStartISO])

  async function loadOrders() {
    setLoading(true)
    try {
      const wid = await week.getOrCreateWeek()
      setWeekId(wid)

      const { data: lines } = await supabase
        .from('order_lines')
        .select('id, menu_item_id, delivery_date, quantity, source, status, change_reason, change_note, changed_by')
        .eq('week_id', wid)
        .eq('customer_id', selectedCustomer.id)

      const map = {}
      for (const l of lines || []) {
        map[`${l.menu_item_id}_${l.delivery_date}`] = l
      }
      setOrderLines(map)
    } finally {
      setLoading(false)
    }
  }

  async function handleQtyChange(menuItemId, date, value, via = 'orders_grid') {
    const qty = parseFloat(value) || 0
    const key = `${menuItemId}_${date}`

    // Optimistic update
    setOrderLines(prev => ({
      ...prev,
      [key]: { ...prev[key], quantity: qty, source: 'manual', status: 'ok', change_reason: changeReason, change_note: changeNote || null, changed_by: userEmail }
    }))

    const prevLine = orderLines[key]
    setSaving(true)
    try {
      const wid = weekId || await week.getOrCreateWeek()
      const { data, error } = await supabase
        .from('order_lines')
        .upsert({
          week_id: wid,
          customer_id: selectedCustomer.id,
          menu_item_id: menuItemId,
          delivery_date: date,
          quantity: qty,
          source: 'manual',
          status: 'ok',
          change_reason: changeReason,
          change_note: changeNote || null,
          changed_by: userEmail,
          changed_via: via,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
        .select('id')
        .single()

      if (error) throw error
      if (data) {
        setOrderLines(prev => ({ ...prev, [key]: { ...prev[key], id: data.id } }))
      }
    } catch (err) {
      console.error('[handleQtyChange]', err)
      setOrderLines(prev => {
        const next = { ...prev }
        if (prevLine) next[key] = prevLine
        else delete next[key]
        return next
      })
      toast.error('שמירת הכמות נכשלה — נסה שוב')
    } finally {
      setSaving(false)
    }
  }

  async function addCustomer() {
    if (!newCustomerName.trim()) return
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomerName.trim(), active: true })
      .select()
      .single()
    if (error) {
      toast.error('הוספת הלקוח נכשלה')
      return
    }
    setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'he')))
    setSelectedCustomer(data)
    toast.success(`נוסף לקוח: ${data.name}`)
    setNewCustomerName('')
    setShowAddCustomer(false)
  }

  async function copyPrevWeek() {
    if (!selectedCustomer || !weekId) return
    setCopying(true)
    try {
      // Get previous week
      const prevStart = new Date(week.weekStartISO)
      prevStart.setDate(prevStart.getDate() - 7)
      const { data: prevWeekRow } = await supabase
        .from('weeks').select('id').eq('start_date', toLocalISODate(prevStart)).single()
      if (!prevWeekRow) { toast.info('אין הזמנה בשבוע הקודם להעתקה'); return }

      const { data: prevLines } = await supabase
        .from('order_lines')
        .select('menu_item_id, delivery_date, quantity')
        .eq('week_id', prevWeekRow.id)
        .eq('customer_id', selectedCustomer.id)
        .gt('quantity', 0)

      if (!prevLines?.length) { toast.info('אין הזמנה בשבוע הקודם להעתקה'); return }

      // Shift dates by 7 days
      const upserts = prevLines.map(l => {
        const d = new Date(l.delivery_date)
        d.setDate(d.getDate() + 7)
        return {
          week_id: weekId,
          customer_id: selectedCustomer.id,
          menu_item_id: l.menu_item_id,
          delivery_date: toLocalISODate(d),
          quantity: l.quantity,
          source: 'manual',
          status: 'ok',
          change_reason: 'internal_decision',
          change_note: 'הועתק אוטומטית משבוע קודם',
          changed_by: userEmail,
          changed_via: 'copy_prev_week',
          updated_at: new Date().toISOString(),
        }
      })

      const { error } = await supabase.from('order_lines').upsert(upserts, {
        onConflict: 'week_id,customer_id,menu_item_id,delivery_date',
        ignoreDuplicates: true,
      })
      if (error) throw error
      await loadOrders()
      toast.success(`הועתקו ${upserts.length} שורות מהשבוע הקודם`)
    } catch (err) {
      console.error('[copyPrevWeek]', err)
      toast.error('העתקת השבוע הקודם נכשלה')
    } finally {
      setCopying(false)
    }
  }

  async function confirmBulkFill() {
    if (!bulkFillItem) return
    const qty = parseFloat(bulkFillQty)
    if (!(qty >= 0)) { toast.error('כמות לא תקינה'); return }
    setBulkFilling(true)
    try {
      // Sequential, not concurrent — reuses the exact same save path as manual
      // entry (handleQtyChange), one day at a time, so there's no risk of a
      // duplicate-week-creation race if weekId weren't resolved yet.
      for (const d of WEEK_DAYS) {
        const date = week.dayDate(d.key)
        await handleQtyChange(bulkFillItem.id, date, bulkFillQty, 'bulk_fill')
      }
      toast.success(`מולא: ${qty} על כל השבוע — ${bulkFillItem.name_he}`)
      setBulkFillItem(null)
      setBulkFillQty('')
    } finally {
      setBulkFilling(false)
    }
  }

  function handleKeyDown(e, menuItemId, dayIdx, date) {
    const inputs = gridRef.current?.querySelectorAll('input[type="number"]')
    if (!inputs) return
    const idx = [...inputs].indexOf(e.target)
    if (idx === -1) return

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const next = inputs[idx + (e.shiftKey ? -1 : 1)]
      if (next) next.focus()
    }
    if (e.key === 'Escape') {
      e.target.value = ''
      handleQtyChange(menuItemId, date, 0)
    }
  }

  // Group menu items by category
  const grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">הזמנות שבועיות</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && <span style={{ fontSize: 12, color: 'var(--t3)' }}>שומר...</span>}
          <button className="btn btn-ghost btn-sm" onClick={loadOrders} title="רענן">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}>
          <ChevronRight size={16} />
        </button>
        <span className="week-label">{week.weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}>
          <ChevronLeft size={16} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={week.goToToday} style={{ fontSize: 12 }}>
          השבוע
        </button>
      </div>

      <div className="sidebar-layout">
        {/* Customer Sidebar */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="section-title" style={{ marginBottom: 0 }}>לקוחות</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddCustomer(true)}>
              <Plus size={14} />
            </button>
          </div>
          <SearchInput value={customerFilter} onChange={setCustomerFilter} placeholder="חיפוש לקוח..." />
          <div className="customer-list">
            {filteredCustomers.map(c => (
              <div
                key={c.id}
                className={'customer-pill' + (selectedCustomer?.id === c.id ? ' active' : '')}
                onClick={() => setSelectedCustomer(c)}
              >
                {c.name}
              </div>
            ))}
          </div>
        </div>

        {/* Order Grid */}
        <div>
          {!selectedCustomer ? (
            <div className="empty"><div className="empty-icon">👈</div><div className="empty-text">בחר לקוח</div></div>
          ) : loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(8)].map((_, i) => <div key={i} className="shimmer" style={{ height: 40 }} />)}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{selectedCustomer.name}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    value={changeReason}
                    onChange={e => { setChangeReason(e.target.value); localStorage.setItem('floory_change_reason', e.target.value) }}
                    title="סיבת השינוי — חלה על כל עריכה בגריד עד שתשונה"
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--t1)' }}
                  >
                    <option value="customer_request">{REASON_LABELS.customer_request}</option>
                    <option value="internal_decision">{REASON_LABELS.internal_decision}</option>
                    <option value="correction">{REASON_LABELS.correction}</option>
                    <option value="other">{REASON_LABELS.other}</option>
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowNoteInput(v => !v)} title="הערה לשינוי הנוכחי">📝</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={copyPrevWeek}
                    disabled={copying}
                    title="העתק הזמנה מהשבוע הקודם"
                  >
                    <Copy size={13} /> {copying ? '...' : 'העתק שבוע קודם'}
                  </button>
                </div>
                {showNoteInput && (
                  <input
                    className="input"
                    style={{ width: '100%', fontSize: 13 }}
                    placeholder="הערה אופציונלית לשינוי הנוכחי..."
                    value={changeNote}
                    onChange={e => setChangeNote(e.target.value)}
                  />
                )}
              </div>
              <div className="order-grid-wrap" ref={gridRef}>
                <table className="order-grid">
                  <thead>
                    <tr>
                      <th className="item-col sticky-col">פריט</th>
                      {WEEK_DAYS.map(d => (
                        <th key={d.key}>
                          <div>{d.short}</div>
                          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                            {formatShortDate(week.dayDate(d.key))}
                          </div>
                        </th>
                      ))}
                      <th style={{ width: 36 }} aria-label="מילוי שבועי" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(grouped).map(([cat, items]) => (
                      <>
                        <tr key={`cat-${cat}`}>
                          <td colSpan={9} style={{ padding: '8px 16px', background: 'var(--surf2)', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {cat}
                          </td>
                        </tr>
                        {items.map(item => (
                          <tr key={item.id}>
                            <td className="item-name sticky-col">{item.name_he}</td>
                            {WEEK_DAYS.map(d => {
                              const date = week.dayDate(d.key)
                              const key = `${item.id}_${date}`
                              const line = orderLines[key]
                              const cls = [
                                'qty-cell',
                                line?.status === 'needs_review' ? 'needs-review' : '',
                              ].filter(Boolean).join(' ')
                              return (
                                <td key={d.key} style={{ textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    className={cls}
                                    min="0"
                                    step="0.5"
                                    value={line?.quantity || ''}
                                    placeholder="—"
                                    onChange={e => handleQtyChange(item.id, date, e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, item.id, d.key, date)}
                                    title={[
                                      line?.status === 'needs_review' ? 'דורש בדיקה' : '',
                                      line?.change_reason ? `סיבה: ${REASON_LABELS[line.change_reason] || line.change_reason}` : '',
                                      line?.change_note ? `הערה: ${line.change_note}` : '',
                                      line?.changed_by ? `ע"י ${line.changed_by}` : '',
                                    ].filter(Boolean).join(' · ')}
                                  />
                                </td>
                              )
                            })}
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '4px 6px' }}
                                onClick={() => { setBulkFillItem(item); setBulkFillQty('') }}
                                title="מילוי כמות לכל השבוע"
                                aria-label={`מילוי כמות לכל השבוע — ${item.name_he}`}
                              >
                                <Wand2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)' }}>
                <span>⬜ ידני</span>
                <span style={{ color: 'var(--amber)' }}>🟨 דורש בדיקה</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="overlay" onClick={() => setShowAddCustomer(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">הוספת לקוח חדש</div>
            <div style={{ marginBottom: 16 }}>
              <label className="lbl">שם הלקוח</label>
              <input
                className="input"
                placeholder="שם הלקוח או העסק"
                value={newCustomerName}
                onChange={e => setNewCustomerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomer()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddCustomer(false)}>ביטול</button>
              <button className="btn btn-primary" onClick={addCustomer}>הוספה</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk-fill Modal */}
      {bulkFillItem && (
        <div className="overlay" onClick={() => !bulkFilling && setBulkFillItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">מילוי כמות לכל השבוע — {bulkFillItem.name_he}</div>
            <div style={{ marginBottom: 8 }}>
              <label className="lbl">כמות</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                value={bulkFillQty}
                onChange={e => setBulkFillQty(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmBulkFill()}
                autoFocus
              />
            </div>
            <div className="alert alert-warn" style={{ marginBottom: 0 }}>
              הפעולה תדרוס את כל 6 ימי השבוע עבור פריט זה, כולל תאים המסומנים כדורשים בדיקה.
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setBulkFillItem(null)} disabled={bulkFilling}>ביטול</button>
              <button className="btn btn-primary" onClick={confirmBulkFill} disabled={bulkFilling}>
                {bulkFilling ? 'ממלא...' : 'מלא'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
