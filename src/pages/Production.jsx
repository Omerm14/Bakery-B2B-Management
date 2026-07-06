import { useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronLeft, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isoToday } from '../constants/days'

const STATUS_CYCLE = { pending: 'in_progress', in_progress: 'done', done: 'pending' }
const STATUS_LABEL = { pending: 'ממתין', in_progress: 'בייצור', done: 'הושלם' }
const STATUS_COLOR = { pending: 'var(--t3)', in_progress: 'var(--amber)', done: 'var(--green)' }
const STATUS_BG = { pending: 'transparent', in_progress: 'var(--amber-tint)', done: 'var(--green-tint)' }

function AnimatedNumber({ value, loading }) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (loading) return
    const start = prev.current
    const end = value
    const diff = end - start
    if (diff === 0) return
    const steps = 24
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplay(Math.round(start + diff * (i / steps)))
      if (i >= steps) { clearInterval(timer); prev.current = end }
    }, 16)
    return () => clearInterval(timer)
  }, [value, loading])
  return loading ? '—' : display.toLocaleString('he-IL')
}

export default function Production() {
  const [selectedDate, setSelectedDate] = useState(isoToday())
  const [items, setItems] = useState([])
  const [prodStatus, setProdStatus] = useState({}) // menu_item_id → status
  const [loading, setLoading] = useState(false)
  const [filterSupplier, setFilterSupplier] = useState('all')

  useEffect(() => { loadProduction() }, [selectedDate])

  async function loadProduction() {
    setLoading(true)
    try {
      const [{ data }, { data: checks }] = await Promise.all([
        supabase
          .from('order_lines')
          .select('quantity, menu_item_id, menu_items(id, name_he, unit, category, suppliers(name)), customers(name)')
          .eq('delivery_date', selectedDate)
          .eq('status', 'ok')
          .gt('quantity', 0),
        supabase
          .from('production_checks')
          .select('menu_item_id, status')
          .eq('delivery_date', selectedDate),
      ])

      // Build status map
      const statusMap = {}
      for (const c of checks || []) statusMap[c.menu_item_id] = c.status
      setProdStatus(statusMap)

      if (!data) { setItems([]); return }

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

  async function cycleStatus(menuItemId) {
    const current = prodStatus[menuItemId] || 'pending'
    const next = STATUS_CYCLE[current]
    setProdStatus(prev => ({ ...prev, [menuItemId]: next }))
    if (next === 'pending') {
      await supabase.from('production_checks').delete()
        .eq('menu_item_id', menuItemId).eq('delivery_date', selectedDate)
    } else {
      await supabase.from('production_checks').upsert(
        { menu_item_id: menuItemId, delivery_date: selectedDate, status: next, updated_at: new Date().toISOString() },
        { onConflict: 'menu_item_id,delivery_date' }
      )
    }
  }

  function changeDate(delta) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  function printView() {
    window.print()
  }

  const suppliers = ['all', ...new Set(items.map(i => i.supplier))]
  const filtered = filterSupplier === 'all' ? items : items.filter(i => i.supplier === filterSupplier)

  const bySupplier = filtered.reduce((acc, item) => {
    if (!acc[item.supplier]) acc[item.supplier] = []
    acc[item.supplier].push(item)
    return acc
  }, {})

  const totalItems = filtered.length
  const totalQty = filtered.reduce((s, i) => s + i.total_qty, 0)
  const uniqueCustomers = new Set(filtered.flatMap(i => i.customers.map(c => c.name))).size
  const doneCount = filtered.filter(i => (prodStatus[i.menu_item_id] || 'pending') === 'done').length

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="page production-page">
      <div className="page-header">
        <h1 className="page-title">ייצור היום</h1>
        <button className="btn btn-ghost btn-sm no-print" onClick={printView}>
          <Printer size={15} /> הדפסה
        </button>
      </div>

      {/* Date Navigation */}
      <div className="week-nav no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(-1)}><ChevronRight size={16} /></button>
        <span className="week-label">{dateLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(1)}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(isoToday())} style={{ fontSize: 12 }}>היום</button>
      </div>

      {/* 4-stat summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">פריטים</div>
          <div className="stat-val"><AnimatedNumber value={totalItems} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-blue">
          <div className="stat-lbl">כמות כוללת</div>
          <div className="stat-val"><AnimatedNumber value={totalQty} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-amber">
          <div className="stat-lbl">לקוחות</div>
          <div className="stat-val"><AnimatedNumber value={uniqueCustomers} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-green">
          <div className="stat-lbl">הושלמו</div>
          <div className="stat-val" style={{ color: doneCount === totalItems && totalItems > 0 ? 'var(--green)' : undefined }}>
            {loading ? '—' : `${doneCount}/${totalItems}`}
          </div>
        </div>
      </div>

      {/* Supplier filter */}
      {suppliers.length > 2 && (
        <div className="no-print" style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {suppliers.map(s => (
            <button
              key={s}
              className={'btn btn-sm ' + (filterSupplier === s ? 'btn-primary' : 'btn-ghost')}
              onClick={() => setFilterSupplier(s)}
            >
              {s === 'all' ? 'הכל' : s}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 64 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">✅</div>
          <div className="empty-text">אין הזמנות לתאריך זה</div>
        </div>
      ) : (
        Object.entries(bySupplier).map(([supplier, supplierItems]) => (
          <div key={supplier} className="supplier-group">
            <div className="supplier-tag">🏭 {supplier}</div>
            {supplierItems.map(item => {
              const st = prodStatus[item.menu_item_id] || 'pending'
              const isDone = st === 'done'
              return (
                <div
                  key={item.menu_item_id}
                  className="produce-item"
                  style={{
                    opacity: isDone ? 0.55 : 1,
                    transition: 'opacity .3s',
                    background: STATUS_BG[st],
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div className="produce-item-name" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
                      {item.name_he}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                      {item.customers.map(c => `${c.name} (${c.qty})`).join(' · ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="produce-qty-wrap">
                      <span className="produce-qty">{item.total_qty % 1 === 0 ? item.total_qty : item.total_qty.toFixed(1)}</span>
                      <span className="produce-unit">{item.unit}</span>
                    </div>
                    <button
                      className="no-print status-chip"
                      onClick={() => cycleStatus(item.menu_item_id)}
                      style={{
                        border: `1px solid ${STATUS_COLOR[st]}`,
                        color: STATUS_COLOR[st],
                        background: STATUS_BG[st],
                        borderRadius: 20,
                        padding: '4px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all .2s',
                        minWidth: 72,
                      }}
                    >
                      {STATUS_LABEL[st]}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
