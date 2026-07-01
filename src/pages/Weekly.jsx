import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWeek } from '../hooks/useWeek'
import { WEEK_DAYS } from '../constants/days'

export default function Weekly() {
  const week = useWeek()
  const [rows, setRows] = useState([]) // [{name_he, unit, supplier, days: {date: qty}, total}]
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('supplier') // 'supplier' | 'category'

  useEffect(() => { loadWeekly() }, [week.weekStartISO])

  async function loadWeekly() {
    setLoading(true)
    try {
      // Get all order lines for this week
      const { data: weekRow } = await supabase
        .from('weeks')
        .select('id')
        .eq('start_date', week.weekStartISO)
        .single()

      if (!weekRow) { setRows([]); return }

      const { data } = await supabase
        .from('order_lines')
        .select(`
          menu_item_id,
          delivery_date,
          quantity,
          menu_items(name_he, unit, category, suppliers(name))
        `)
        .eq('week_id', weekRow.id)
        .gt('quantity', 0)

      if (!data) { setRows([]); return }

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
            days: {},
            total: 0,
          }
        }
        map[id].days[line.delivery_date] = (map[id].days[line.delivery_date] || 0) + parseFloat(line.quantity)
        map[id].total += parseFloat(line.quantity)
      }

      const sorted = Object.values(map).sort((a, b) => {
        const groupA = viewMode === 'supplier' ? a.supplier : a.category
        const groupB = viewMode === 'supplier' ? b.supplier : b.category
        if (groupA !== groupB) return groupA.localeCompare(groupB, 'he')
        return a.name_he.localeCompare(b.name_he, 'he')
      })
      setRows(sorted)
    } finally {
      setLoading(false)
    }
  }

  const groupKey = viewMode === 'supplier' ? 'supplier' : 'category'
  const grouped = rows.reduce((acc, row) => {
    const k = row[groupKey]
    if (!acc[k]) acc[k] = []
    acc[k].push(row)
    return acc
  }, {})

  const totalItems = rows.length
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">תוכנית שבועית</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'btn btn-sm ' + (viewMode === 'supplier' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('supplier')}>לפי ספק</button>
          <button className={'btn btn-sm ' + (viewMode === 'category' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('category')}>לפי קטגוריה</button>
        </div>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}><ChevronRight size={16} /></button>
        <span className="week-label">{week.weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={week.goToToday} style={{ fontSize: 12 }}>השבוע</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 24 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">פריטים שונים</div>
          <div className="stat-val">{loading ? '—' : totalItems}</div>
        </div>
        <div className="card stat-card stat-green">
          <div className="stat-lbl">כמות שבועית כוללת</div>
          <div className="stat-val">{loading ? '—' : grandTotal.toLocaleString('he-IL')}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(5)].map((_, i) => <div key={i} className="shimmer" style={{ height: 44 }} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="empty-text">אין הזמנות לשבוע זה</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="itbl" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>פריט</th>
                  <th>{viewMode === 'supplier' ? 'ספק' : 'קטגוריה'}</th>
                  <th>יח׳</th>
                  {WEEK_DAYS.map(d => (
                    <th key={d.key} style={{ textAlign: 'center', minWidth: 70 }}>
                      <div>{d.short}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{week.dayDate(d.key).slice(5).replace('-', '/')}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([group, items]) => (
                  <>
                    <tr key={`g-${group}`}>
                      <td colSpan={9} style={{ background: 'rgba(6,182,212,.06)', padding: '8px 14px' }}>
                        <span className="supplier-tag" style={{ marginBottom: 0 }}>
                          {viewMode === 'supplier' ? '🏭' : '📦'} {group}
                        </span>
                      </td>
                    </tr>
                    {items.map(row => (
                      <tr key={row.menu_item_id}>
                        <td style={{ fontWeight: 500 }}>{row.name_he}</td>
                        <td style={{ color: 'var(--t3)', fontSize: 12 }}>{row[groupKey]}</td>
                        <td style={{ color: 'var(--t3)', fontSize: 12 }}>{row.unit}</td>
                        {WEEK_DAYS.map(d => {
                          const date = week.dayDate(d.key)
                          const qty = row.days[date]
                          return (
                            <td key={d.key} style={{ textAlign: 'center', fontWeight: qty ? 600 : 400, color: qty ? 'var(--t1)' : 'var(--bdr2)' }}>
                              {qty ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : '—'}
                            </td>
                          )
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--cyan)' }}>
                          {row.total % 1 === 0 ? row.total : row.total.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
