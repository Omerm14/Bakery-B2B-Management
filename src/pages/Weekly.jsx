import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useWeek } from '../hooks/useWeek'
import { WEEK_DAYS } from '../constants/days'

export default function Weekly() {
  const week = useWeek()
  const [rows, setRows] = useState([])
  const [prevRows, setPrevRows] = useState([]) // previous week for comparison
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('category')

  useEffect(() => { loadWeekly() }, [week.weekStartISO])

  async function loadWeekly() {
    setLoading(true)
    try {
      const [{ data: weekRow }, { data: prevWeekRow }] = await Promise.all([
        supabase.from('weeks').select('id').eq('start_date', week.weekStartISO).single(),
        supabase.from('weeks').select('id').eq('start_date', prevWeekIso()).single(),
      ])

      const [current, previous] = await Promise.all([
        weekRow
          ? supabase.from('order_lines').select('menu_item_id, delivery_date, quantity, menu_items(name_he, unit, category, suppliers(name)), customers!inner(active)').eq('week_id', weekRow.id).eq('customers.active', true).gt('quantity', 0)
          : Promise.resolve({ data: [] }),
        prevWeekRow
          ? supabase.from('order_lines').select('menu_item_id, quantity, menu_items(name_he), customers!inner(active)').eq('week_id', prevWeekRow.id).eq('customers.active', true).gt('quantity', 0)
          : Promise.resolve({ data: [] }),
      ])

      setRows(aggregate(current.data || []))

      // Prev week totals by item — same corrupted-item exclusion as aggregate()
      const prevMap = {}
      for (const l of previous.data || []) {
        if (!l.menu_items || l.menu_items.name_he === 'תאריך') continue
        prevMap[l.menu_item_id] = (prevMap[l.menu_item_id] || 0) + parseFloat(l.quantity)
      }
      setPrevRows(prevMap)
    } finally {
      setLoading(false)
    }
  }

  function prevWeekIso() {
    const d = new Date(week.weekStartISO)
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  }

  function aggregate(data) {
    const map = {}
    for (const line of data) {
      const mi = line.menu_items
      if (!mi || mi.name_he === 'תאריך') continue
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
    return Object.values(map).sort((a, b) => {
      const gA = a.supplier, gB = b.supplier
      if (gA !== gB) return gA.localeCompare(gB, 'he')
      return a.name_he.localeCompare(b.name_he, 'he')
    })
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const grouped = groupRows(rows)

    for (const [group, items] of Object.entries(grouped)) {
      const header = ['פריט', 'יח׳', ...WEEK_DAYS.map(d => d.label), 'סה״כ', 'שבוע קודם', 'שינוי %']
      const sheetData = [header]
      for (const row of items) {
        sheetData.push([
          row.name_he,
          row.unit,
          ...WEEK_DAYS.map(d => row.days[week.dayDate(d.key)] || 0),
          row.total,
          prevRows[row.menu_item_id] || 0,
          changePercent(row.total, prevRows[row.menu_item_id]),
        ])
      }
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      XLSX.utils.book_append_sheet(wb, ws, group.slice(0, 31))
    }

    const fileName = `תוכנית_שבועית_${week.weekStartISO}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  function changePercent(curr, prev) {
    if (!prev) return curr > 0 ? '+100%' : '—'
    const pct = Math.round(((curr - prev) / prev) * 100)
    return `${pct > 0 ? '+' : ''}${pct}%`
  }

  const TREND_ORDER = ['חדש השבוע', 'עלייה חדה', 'ירידה חדה', 'יציב']
  const TREND_ICONS = { 'חדש השבוע': '🆕', 'עלייה חדה': '📈', 'ירידה חדה': '📉', 'יציב': '➖' }

  function trendBucket(row) {
    const prev = prevRows[row.menu_item_id]
    if (!(prev > 0)) return 'חדש השבוע'
    const chg = ((row.total - prev) / prev) * 100
    if (chg >= 15) return 'עלייה חדה'
    if (chg <= -15) return 'ירידה חדה'
    return 'יציב'
  }

  function groupRows(rowList) {
    if (viewMode === 'trend') {
      const buckets = { 'חדש השבוע': [], 'עלייה חדה': [], 'ירידה חדה': [], 'יציב': [] }
      for (const row of rowList) buckets[trendBucket(row)].push(row)
      const result = {}
      for (const k of TREND_ORDER) if (buckets[k].length) result[k] = buckets[k]
      return result
    }
    const key = viewMode === 'supplier' ? 'supplier' : 'category'
    return rowList.reduce((acc, row) => {
      const k = row[key]
      if (!acc[k]) acc[k] = []
      acc[k].push(row)
      return acc
    }, {})
  }

  const grouped = groupRows(rows)
  const totalItems = rows.length
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const prevTotal = Object.values(prevRows).reduce((s, v) => s + v, 0)
  const weekChange = prevTotal > 0 ? Math.round(((grandTotal - prevTotal) / prevTotal) * 100) : null
  const dayTotals = WEEK_DAYS.map(d => {
    const date = week.dayDate(d.key)
    return rows.reduce((s, r) => s + (r.days[date] || 0), 0)
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">תוכנית שבועית</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'btn btn-sm ' + (viewMode === 'category' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('category')}>לפי קטגוריה</button>
          <button className={'btn btn-sm ' + (viewMode === 'supplier' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('supplier')}>לפי ספק</button>
          <button className={'btn btn-sm ' + (viewMode === 'trend' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('trend')}>לפי מגמה</button>
          {rows.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={exportExcel} title="ייצוא Excel">
              <Download size={14} /> Excel
            </button>
          )}
        </div>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}><ChevronRight size={16} /></button>
        <span className="week-label">{week.weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={week.goToToday} style={{ fontSize: 12 }}>השבוע</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">פריטים שונים</div>
          <div className="stat-val">{loading ? '—' : totalItems}</div>
        </div>
        <div className="card stat-card stat-green">
          <div className="stat-lbl">כמות שבועית</div>
          <div className="stat-val">{loading ? '—' : grandTotal.toLocaleString('he-IL')}</div>
        </div>
        <div className="card stat-card" style={{ borderBottom: `3px solid ${weekChange === null ? 'var(--bdr2)' : weekChange >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
          <div className="stat-lbl">מול שבוע קודם</div>
          <div className="stat-val" style={{ color: weekChange === null ? 'var(--t3)' : weekChange >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 22 }}>
            {loading || weekChange === null ? '—' : `${weekChange > 0 ? '+' : ''}${weekChange}%`}
          </div>
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
            <table className="itbl" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th className="sticky-col" style={{ minWidth: 180 }}>פריט</th>
                  <th>{viewMode === 'supplier' ? 'ספק' : 'קטגוריה'}</th>
                  <th>יח׳</th>
                  {WEEK_DAYS.map(d => (
                    <th key={d.key} style={{ textAlign: 'center', minWidth: 64 }}>
                      <div>{d.short}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{week.dayDate(d.key).slice(5).replace('-', '/')}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>סה״כ</th>
                  <th style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)' }}>שינוי</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="sticky-col" style={{ fontWeight: 700, background: 'var(--accent-tint)' }}>סה״כ כללי</td>
                  <td style={{ background: 'var(--accent-tint)' }} />
                  <td style={{ background: 'var(--accent-tint)' }} />
                  {dayTotals.map((total, i) => (
                    <td key={WEEK_DAYS[i].key} style={{ textAlign: 'center', fontWeight: 700, background: 'var(--accent-tint)' }}>
                      {total ? (total % 1 === 0 ? total : total.toFixed(1)) : '—'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-tint)' }}>
                    {grandTotal % 1 === 0 ? grandTotal : grandTotal.toFixed(1)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12, background: 'var(--accent-tint)', color: weekChange === null ? 'var(--t3)' : weekChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {weekChange === null ? '—' : `${weekChange > 0 ? '+' : ''}${weekChange}%`}
                  </td>
                </tr>
                {Object.entries(grouped).map(([group, items]) => {
                  const groupTotal = items.reduce((s, r) => s + r.total, 0)
                  const groupPrev = items.reduce((s, r) => s + (prevRows[r.menu_item_id] || 0), 0)
                  const gChange = groupPrev > 0 ? Math.round(((groupTotal - groupPrev) / groupPrev) * 100) : null
                  return (
                    <>
                      <tr key={`g-${group}`}>
                        <td colSpan={12} style={{ background: 'var(--accent-tint)', padding: '8px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="supplier-tag" style={{ marginBottom: 0 }}>
                              {viewMode === 'trend' ? TREND_ICONS[group] : viewMode === 'supplier' ? '🏭' : '📦'} {group}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>
                              {groupTotal.toLocaleString('he-IL')}
                              {gChange !== null && (
                                <span style={{ marginInlineStart: 8, color: gChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {gChange > 0 ? '+' : ''}{gChange}%
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {items.map(row => {
                        const prev = prevRows[row.menu_item_id]
                        const chg = prev > 0 ? Math.round(((row.total - prev) / prev) * 100) : null
                        return (
                          <tr key={row.menu_item_id}>
                            <td className="sticky-col" style={{ fontWeight: 500 }}>{row.name_he}</td>
                            <td style={{ color: 'var(--t3)', fontSize: 12 }}>{row[viewMode === 'supplier' ? 'supplier' : 'category']}</td>
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
                            <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>
                              {row.total % 1 === 0 ? row.total : row.total.toFixed(1)}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: chg === null ? 'var(--t3)' : chg >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {chg === null ? '—' : `${chg > 0 ? '+' : ''}${chg}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
