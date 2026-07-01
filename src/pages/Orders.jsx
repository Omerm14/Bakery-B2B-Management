import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronLeft, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWeek } from '../hooks/useWeek'
import { WEEK_DAYS } from '../constants/days'

export default function Orders() {
  const week = useWeek()
  const [customers, setCustomers] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [orderLines, setOrderLines] = useState({}) // key: `${menuItemId}_${date}` => line
  const [weekId, setWeekId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')

  useEffect(() => {
    loadMasterData()
  }, [])

  useEffect(() => {
    if (selectedCustomer) loadOrders()
    else setOrderLines({})
  }, [selectedCustomer, week.weekStartISO])

  async function loadMasterData() {
    const [{ data: custs }, { data: items }] = await Promise.all([
      supabase.from('customers').select('id, name, phone').eq('active', true).order('name'),
      supabase.from('menu_items').select('id, name_he, name_en, unit, category, supplier_id, suppliers(name)').eq('active', true).order('category').order('name_he'),
    ])
    setCustomers(custs || [])
    setMenuItems(items || [])
    if (custs?.length) setSelectedCustomer(custs[0])
  }

  async function loadOrders() {
    setLoading(true)
    try {
      const wid = await week.getOrCreateWeek()
      setWeekId(wid)

      const { data: lines } = await supabase
        .from('order_lines')
        .select('id, menu_item_id, delivery_date, quantity, source, status')
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

  async function handleQtyChange(menuItemId, date, value) {
    const qty = parseFloat(value) || 0
    const key = `${menuItemId}_${date}`

    // Optimistic update
    setOrderLines(prev => ({
      ...prev,
      [key]: { ...prev[key], quantity: qty, source: 'manual', status: 'ok' }
    }))

    setSaving(true)
    try {
      if (qty === 0) {
        // Delete the line if quantity is zero
        const existing = orderLines[key]
        if (existing?.id) {
          await supabase.from('order_lines').delete().eq('id', existing.id)
          setOrderLines(prev => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        }
      } else {
        const wid = weekId || await week.getOrCreateWeek()
        const { data } = await supabase
          .from('order_lines')
          .upsert({
            week_id: wid,
            customer_id: selectedCustomer.id,
            menu_item_id: menuItemId,
            delivery_date: date,
            quantity: qty,
            source: 'manual',
            status: 'ok',
          }, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
          .select('id')
          .single()

        if (data) {
          setOrderLines(prev => ({ ...prev, [key]: { ...prev[key], id: data.id } }))
        }
      }
    } finally {
      setSaving(false)
    }
  }

  async function addCustomer() {
    if (!newCustomerName.trim()) return
    const { data } = await supabase
      .from('customers')
      .insert({ name: newCustomerName.trim(), active: true })
      .select()
      .single()
    if (data) {
      setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'he')))
      setSelectedCustomer(data)
    }
    setNewCustomerName('')
    setShowAddCustomer(false)
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

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        {/* Customer Sidebar */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="section-title" style={{ marginBottom: 0 }}>לקוחות</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddCustomer(true)}>
              <Plus size={14} />
            </button>
          </div>
          <div className="customer-list">
            {customers.map(c => (
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
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{selectedCustomer.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="badge badge-noga">נוגה</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>= הוזן אוטומטית</span>
                </div>
              </div>
              <div className="order-grid-wrap">
                <table className="order-grid">
                  <thead>
                    <tr>
                      <th className="item-col">פריט</th>
                      <th style={{ fontSize: 10, color: 'var(--t3)' }}>ספק</th>
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
                          <td colSpan={8} style={{ padding: '8px 16px', background: 'rgba(255,255,255,.02)', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {cat}
                          </td>
                        </tr>
                        {items.map(item => (
                          <tr key={item.id}>
                            <td className="item-name">{item.name_he}</td>
                            <td className="item-supplier">{item.suppliers?.name || '—'}</td>
                            {WEEK_DAYS.map(d => {
                              const date = week.dayDate(d.key)
                              const key = `${item.id}_${date}`
                              const line = orderLines[key]
                              const cls = [
                                'qty-cell',
                                line?.source === 'noga' ? 'source-noga' : '',
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
                                    title={line?.source === 'noga' ? 'הוזן ע"י נוגה' : line?.status === 'needs_review' ? 'דורש בדיקה' : ''}
                                  />
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
              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)' }}>
                <span>⬜ ידני</span>
                <span style={{ color: 'var(--cyan)' }}>🟦 נוגה</span>
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
    </div>
  )
}
