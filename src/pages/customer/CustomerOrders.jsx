import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronLeft, LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCustomerWeek } from '../../hooks/useCustomerWeek'
import { useCustomerMenuItems } from '../../hooks/useCustomerMenuItems'
import { WEEK_DAYS } from '../../constants/days'
import CutoffBlockedNotice from './CutoffBlockedNotice'

export default function CustomerOrders() {
  const week = useCustomerWeek()
  const { menuItems, loading: itemsLoading } = useCustomerMenuItems()
  const [customer, setCustomer] = useState(null)
  const [weekId, setWeekId] = useState(null)
  const [orderLines, setOrderLines] = useState({}) // `${menuItemId}_${date}` -> line
  const [canEdit, setCanEdit] = useState({}) // date -> boolean
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const customerId = data.session?.user?.app_metadata?.customer_id
      if (!customerId) return
      supabase.from('customers').select('id, name, phone').eq('id', customerId).maybeSingle()
        .then(({ data: c }) => setCustomer(c))
    })
  }, [])

  const loadWeek = useCallback(async () => {
    if (!customer) return
    setLoading(true)
    try {
      const wid = await week.getWeekId()
      setWeekId(wid)

      const editability = {}
      await Promise.all(WEEK_DAYS.map(async d => {
        const date = week.dayDate(d.key)
        const { data } = await supabase.rpc('can_edit_delivery_date', { p_delivery_date: date })
        editability[date] = !!data
      }))
      setCanEdit(editability)

      if (!wid) { setOrderLines({}); return }

      const { data: lines } = await supabase
        .from('order_lines')
        .select('id, menu_item_id, delivery_date, quantity')
        .eq('week_id', wid)
        .eq('customer_id', customer.id)

      const map = {}
      for (const l of lines || []) map[`${l.menu_item_id}_${l.delivery_date}`] = l
      setOrderLines(map)
    } finally {
      setLoading(false)
    }
  }, [customer, week.weekStartISO])

  useEffect(() => { loadWeek() }, [loadWeek])

  async function handleQtyChange(menuItemId, date, value) {
    if (!canEdit[date] || !customer) return
    const qty = parseFloat(value) || 0
    const key = `${menuItemId}_${date}`
    const prevLine = orderLines[key]

    setOrderLines(prev => ({ ...prev, [key]: { ...prev[key], quantity: qty } }))
    setSaving(true)
    try {
      let wid = weekId
      if (!wid) return // no week row yet -> nothing to save into (staff/cron creates weeks)
      const { data, error } = await supabase
        .from('order_lines')
        .upsert({
          week_id: wid,
          customer_id: customer.id,
          menu_item_id: menuItemId,
          delivery_date: date,
          quantity: qty,
          source: 'manual',
          status: 'ok',
          change_reason: 'customer_request',
          changed_by: customer.phone || customer.name,
          changed_via: 'customer_portal',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
        .select('id')
        .single()
      if (error) throw error
      if (data) setOrderLines(prev => ({ ...prev, [key]: { ...prev[key], id: data.id } }))
    } catch (err) {
      console.error('[CustomerOrders.handleQtyChange]', err)
      setOrderLines(prev => ({ ...prev, [key]: prevLine }))
    } finally {
      setSaving(false)
    }
  }

  function signOut() {
    supabase.auth.signOut()
  }

  const grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const anyDayLocked = WEEK_DAYS.some(d => canEdit[week.dayDate(d.key)] === false)
  const allDaysLocked = WEEK_DAYS.every(d => canEdit[week.dayDate(d.key)] === false)

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">{customer ? `הזמנות — ${customer.name}` : 'הזמנות'}</h1>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>
          <LogOut size={14} /> יציאה
        </button>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}><ChevronRight size={16} /></button>
        <span className="week-label">{week.weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={week.goToToday} style={{ fontSize: 12 }}>השבוע</button>
        {saving && <span style={{ fontSize: 12, color: 'var(--t3)' }}>שומר...</span>}
      </div>

      {allDaysLocked && <CutoffBlockedNotice />}

      {loading || itemsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 40 }} />)}
        </div>
      ) : !weekId ? (
        <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">ההזמנות לשבוע זה עדיין לא נפתחו</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div className="order-grid-wrap">
            <table className="order-grid">
              <thead>
                <tr>
                  <th className="item-col sticky-col">פריט</th>
                  {WEEK_DAYS.map(d => (
                    <th key={d.key}>
                      <div>{d.short}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                        {week.dayDate(d.key).slice(5).replace('-', '/')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([cat, items]) => (
                  <>
                    <tr key={`cat-${cat}`}>
                      <td colSpan={8} style={{ padding: '8px 16px', background: 'var(--surf2)', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        {cat}
                      </td>
                    </tr>
                    {items.map(item => (
                      <tr key={item.id}>
                        <td className="item-name sticky-col">
                          {item.name_he}
                          {item.price != null && <span style={{ marginInlineStart: 6, fontSize: 11, color: 'var(--t3)' }}>{item.price}₪</span>}
                        </td>
                        {WEEK_DAYS.map(d => {
                          const date = week.dayDate(d.key)
                          const key = `${item.id}_${date}`
                          const line = orderLines[key]
                          const editable = canEdit[date]
                          return (
                            <td key={d.key} style={{ textAlign: 'center' }}>
                              {editable ? (
                                <input
                                  type="number"
                                  className="qty-cell"
                                  min="0"
                                  step="0.5"
                                  value={line?.quantity || ''}
                                  placeholder="—"
                                  onChange={e => handleQtyChange(item.id, date, e.target.value)}
                                />
                              ) : (
                                <span style={{ color: 'var(--t3)', fontSize: 13 }}>
                                  {line?.quantity || '—'} <CutoffBlockedNotice compact />
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!allDaysLocked && anyDayLocked && (
        <div style={{ marginTop: 12 }}><CutoffBlockedNotice /></div>
      )}
    </div>
  )
}
