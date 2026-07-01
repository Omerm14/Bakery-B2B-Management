import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isoToday } from '../constants/days'

export default function Production() {
  const [selectedDate, setSelectedDate] = useState(isoToday())
  const [items, setItems] = useState([]) // [{supplier, menu_item_id, name_he, unit, total_qty, customers: [{name, qty}]}]
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadProduction()
  }, [selectedDate])

  async function loadProduction() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('order_lines')
        .select(`
          quantity,
          status,
          menu_item_id,
          menu_items(id, name_he, unit, category, suppliers(name)),
          customers(name)
        `)
        .eq('delivery_date', selectedDate)
        .eq('status', 'ok')
        .gt('quantity', 0)

      if (!data) { setItems([]); return }

      // Aggregate by menu item
      const map = {}
      for (const line of data) {
        const mi = line.menu_items
        if (!mi) continue
        const id = line.menu_item_id
        if (!map[id]) {
          map[id] = {
            menu_item_id: id,
            name_he: mi.name_he,
            unit: mi.unit,
            category: mi.category || 'כללי',
            supplier: mi.suppliers?.name || 'לא ידוע',
            total_qty: 0,
            customers: [],
          }
        }
        map[id].total_qty += parseFloat(line.quantity)
        map[id].customers.push({ name: line.customers?.name, qty: line.quantity })
      }

      // Sort by supplier then category then name
      const sorted = Object.values(map).sort((a, b) => {
        if (a.supplier !== b.supplier) return a.supplier.localeCompare(b.supplier, 'he')
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'he')
        return a.name_he.localeCompare(b.name_he, 'he')
      })
      setItems(sorted)
    } finally {
      setLoading(false)
    }
  }

  function changeDate(delta) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  const bySupplier = items.reduce((acc, item) => {
    if (!acc[item.supplier]) acc[item.supplier] = []
    acc[item.supplier].push(item)
    return acc
  }, {})

  const totalItems = items.length
  const totalQty = items.reduce((s, i) => s + i.total_qty, 0)

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">ייצור היום</h1>
      </div>

      {/* Date Navigation */}
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(-1)}>
          <ChevronRight size={16} />
        </button>
        <span className="week-label">{dateLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(1)}>
          <ChevronLeft size={16} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(isoToday())} style={{ fontSize: 12 }}>
          היום
        </button>
      </div>

      {/* Summary Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 24 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">פריטים לייצור</div>
          <div className="stat-val">{loading ? '—' : totalItems}</div>
        </div>
        <div className="card stat-card stat-green">
          <div className="stat-lbl">כמות כוללת</div>
          <div className="stat-val">{loading ? '—' : totalQty.toLocaleString('he-IL')}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 60 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">✅</div>
          <div className="empty-text">אין הזמנות לתאריך זה</div>
        </div>
      ) : (
        Object.entries(bySupplier).map(([supplier, supplierItems]) => (
          <div key={supplier} className="supplier-group">
            <div className="supplier-tag">🏭 {supplier}</div>
            {supplierItems.map(item => (
              <div key={item.menu_item_id} className="produce-item">
                <div>
                  <div className="produce-item-name">{item.name_he}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                    {item.customers.map(c => `${c.name} (${c.qty})`).join(' · ')}
                  </div>
                </div>
                <div className="produce-qty-wrap">
                  <span className="produce-qty">{item.total_qty % 1 === 0 ? item.total_qty : item.total_qty.toFixed(1)}</span>
                  <span className="produce-unit">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
