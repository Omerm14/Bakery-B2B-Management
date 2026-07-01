import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--cyan)', fontWeight: 600 }}>{p.name}: {p.value?.toLocaleString('he-IL')}</div>
      ))}
    </div>
  )
}

export default function History() {
  const [viewMode, setViewMode] = useState('customer') // 'customer' | 'item'
  const [customers, setCustomers] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [trendData, setTrendData] = useState([])

  useEffect(() => { loadMaster() }, [])

  useEffect(() => {
    if (viewMode === 'customer' && selectedCustomer) loadCustomerHistory()
    else if (viewMode === 'item' && selectedItem) loadItemHistory()
    else { setHistoryData([]); setTrendData([]) }
  }, [viewMode, selectedCustomer, selectedItem])

  async function loadMaster() {
    const [{ data: custs }, { data: items }] = await Promise.all([
      supabase.from('customers').select('id, name').eq('active', true).order('name'),
      supabase.from('menu_items').select('id, name_he, unit, category').eq('active', true).order('name_he'),
    ])
    setCustomers(custs || [])
    setMenuItems(items || [])
    if (custs?.length) setSelectedCustomer(custs[0])
  }

  async function loadCustomerHistory() {
    if (!selectedCustomer) return
    setLoading(true)
    try {
      const { data: lines } = await supabase
        .from('order_lines')
        .select('week_id, menu_item_id, quantity, weeks(start_date), menu_items(name_he, unit, category)')
        .eq('customer_id', selectedCustomer.id)
        .gt('quantity', 0)
        .order('week_id')

      if (!lines?.length) { setHistoryData([]); setTrendData([]); return }

      // Group by week
      const weekMap = {}
      for (const l of lines) {
        const iso = l.weeks?.start_date
        if (!iso) continue
        if (!weekMap[iso]) weekMap[iso] = { weekIso: iso, label: formatWeekShort(iso), items: {}, total: 0 }
        const key = l.menu_item_id
        weekMap[iso].items[key] = (weekMap[iso].items[key] || 0) + parseFloat(l.quantity)
        weekMap[iso].total += parseFloat(l.quantity)
      }

      const sorted = Object.values(weekMap).sort((a, b) => a.weekIso.localeCompare(b.weekIso))

      // Top items across all history
      const itemTotals = {}
      for (const l of lines) {
        const id = l.menu_item_id
        if (!itemTotals[id]) itemTotals[id] = { id, name: l.menu_items?.name_he, qty: 0 }
        itemTotals[id].qty += parseFloat(l.quantity)
      }
      const topItems = Object.values(itemTotals).sort((a, b) => b.qty - a.qty).slice(0, 8)

      // Build table rows: weeks × top items
      const rows = sorted.map(w => ({
        label: w.label,
        weekIso: w.weekIso,
        total: Math.round(w.total * 10) / 10,
        ...Object.fromEntries(topItems.map(it => [it.id, Math.round((w.items[it.id] || 0) * 10) / 10])),
      }))

      setHistoryData({ rows, topItems })
      setTrendData(sorted.map(w => ({ label: w.label, כמות: Math.round(w.total * 10) / 10 })))
    } finally {
      setLoading(false)
    }
  }

  async function loadItemHistory() {
    if (!selectedItem) return
    setLoading(true)
    try {
      const { data: lines } = await supabase
        .from('order_lines')
        .select('week_id, customer_id, quantity, weeks(start_date), customers(name)')
        .eq('menu_item_id', selectedItem.id)
        .gt('quantity', 0)
        .order('week_id')

      if (!lines?.length) { setHistoryData([]); setTrendData([]); return }

      // Group by week
      const weekMap = {}
      for (const l of lines) {
        const iso = l.weeks?.start_date
        if (!iso) continue
        if (!weekMap[iso]) weekMap[iso] = { weekIso: iso, label: formatWeekShort(iso), customers: {}, total: 0 }
        const cid = l.customer_id
        weekMap[iso].customers[cid] = (weekMap[iso].customers[cid] || { name: l.customers?.name, qty: 0 })
        weekMap[iso].customers[cid].qty += parseFloat(l.quantity)
        weekMap[iso].total += parseFloat(l.quantity)
      }

      const sorted = Object.values(weekMap).sort((a, b) => a.weekIso.localeCompare(b.weekIso))

      // Top customers for this item
      const custTotals = {}
      for (const l of lines) {
        const cid = l.customer_id
        if (!custTotals[cid]) custTotals[cid] = { id: cid, name: l.customers?.name, qty: 0 }
        custTotals[cid].qty += parseFloat(l.quantity)
      }
      const topCusts = Object.values(custTotals).sort((a, b) => b.qty - a.qty).slice(0, 8)

      const rows = sorted.map(w => ({
        label: w.label,
        weekIso: w.weekIso,
        total: Math.round(w.total * 10) / 10,
        ...Object.fromEntries(topCusts.map(c => [c.id, Math.round((w.customers[c.id]?.qty || 0) * 10) / 10])),
      }))

      setHistoryData({ rows, topItems: topCusts.map(c => ({ id: c.id, name: c.name })) })
      setTrendData(sorted.map(w => ({ label: w.label, כמות: Math.round(w.total * 10) / 10 })))
    } finally {
      setLoading(false)
    }
  }

  function formatWeekShort(iso) {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  function detectStanding(rows, itemId) {
    // 3+ consecutive weeks with same quantity > 0
    let streak = 0
    let lastQty = null
    for (const r of rows) {
      const q = r[itemId] || 0
      if (q > 0 && q === lastQty) streak++
      else { streak = q > 0 ? 1 : 0; lastQty = q > 0 ? q : null }
      if (streak >= 3) return true
    }
    return false
  }

  const COLORS = ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">היסטוריה</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'btn btn-sm ' + (viewMode === 'customer' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('customer')}>לפי לקוח</button>
          <button className={'btn btn-sm ' + (viewMode === 'item' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('item')}>לפי פריט</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        {/* Selector sidebar */}
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>
            {viewMode === 'customer' ? 'לקוח' : 'פריט'}
          </div>
          <div className="customer-list" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
            {(viewMode === 'customer' ? customers : menuItems).map(item => {
              const isSelected = viewMode === 'customer' ? selectedCustomer?.id === item.id : selectedItem?.id === item.id
              return (
                <div
                  key={item.id}
                  className={'customer-pill' + (isSelected ? ' active' : '')}
                  onClick={() => viewMode === 'customer' ? setSelectedCustomer(item) : setSelectedItem(item)}
                >
                  {viewMode === 'customer' ? item.name : item.name_he}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(5)].map((_, i) => <div key={i} className="shimmer" style={{ height: 44 }} />)}
            </div>
          ) : !historyData?.rows?.length ? (
            <div className="empty">
              <div className="empty-icon">📊</div>
              <div className="empty-text">אין היסטוריה זמינה</div>
            </div>
          ) : (
            <>
              {/* Trend chart */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                  מגמת כמות — {viewMode === 'customer' ? selectedCustomer?.name : selectedItem?.name_he}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="כמות" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Cross-tab table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="itbl" style={{ minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 70 }}>שבוע</th>
                        {historyData.topItems.map((it, i) => (
                          <th key={it.id} style={{ textAlign: 'center', minWidth: 80, color: COLORS[i % COLORS.length], fontSize: 11 }}>
                            {it.name}
                            {detectStanding(historyData.rows, it.id) && <span title="הזמנה קבועה" style={{ marginRight: 4 }}>🔄</span>}
                          </th>
                        ))}
                        <th style={{ textAlign: 'center', fontWeight: 700 }}>סה״כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.rows.map((row, ri) => (
                        <tr key={row.weekIso}>
                          <td style={{ fontSize: 12, color: 'var(--t2)' }}>{row.label}</td>
                          {historyData.topItems.map((it, i) => {
                            const qty = row[it.id] || 0
                            return (
                              <td key={it.id} style={{ textAlign: 'center', color: qty ? COLORS[i % COLORS.length] : 'var(--bdr2)', fontWeight: qty ? 600 : 400, fontSize: 13 }}>
                                {qty || '—'}
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--t1)' }}>{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
