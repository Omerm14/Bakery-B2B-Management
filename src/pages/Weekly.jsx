import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, Download, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useWeek } from '../hooks/useWeek'
import { WEEK_DAYS, toLocalISODate, formatShortDate } from '../constants/days'
import { CATEGORY_ORDER } from '../constants/categories'
import { buildWeeklyProductionHtml, openAndPrint } from '../lib/printHtml'
import { useToast } from '../context/ToastContext'
import { useTranslation } from '../context/LanguageContext'

const CATEGORY_EN = {
  'מאפים': 'Pastries',
  'לחם ולחמניות': 'Bread & Rolls',
  'עוגות ועוגיות': 'Cakes & Cookies',
  'קפואים ושונות - קונדי': 'Frozen & Misc',
}

const TREND_KEY = {
  'חדש השבוע': 'weekly.trend.new',
  'עלייה חדה': 'weekly.trend.up',
  'ירידה חדה': 'weekly.trend.down',
  'יציב': 'weekly.trend.stable',
}

export default function Weekly() {
  const toast = useToast()
  const { t, lang } = useTranslation()
  const locale = lang === 'en' ? 'en-US' : 'he-IL'
  const week = useWeek()
  const [rows, setRows] = useState([])
  const [prevRows, setPrevRows] = useState([]) // previous week for comparison
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('category')

  // Category/trend labels have real translations; supplier names are
  // free-text business data with no English equivalent, so pass through.
  function groupLabel(group) {
    if (lang !== 'en') return group
    if (viewMode === 'category') return CATEGORY_EN[group] || group
    if (viewMode === 'trend') return t(TREND_KEY[group] || group)
    return group
  }

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
          ? supabase.rpc('week_item_day_totals', { p_week_id: weekRow.id })
          : Promise.resolve({ data: [] }),
        prevWeekRow
          ? supabase.rpc('week_item_day_totals', { p_week_id: prevWeekRow.id })
          : Promise.resolve({ data: [] }),
      ])

      setRows(aggregate(current.data || []))

      // Prev week totals by item
      const prevMap = {}
      for (const r of previous.data || []) {
        prevMap[r.menu_item_id] = (prevMap[r.menu_item_id] || 0) + parseFloat(r.qty)
      }
      setPrevRows(prevMap)
    } finally {
      setLoading(false)
    }
  }

  function prevWeekIso() {
    const d = new Date(week.weekStartISO)
    d.setDate(d.getDate() - 7)
    return toLocalISODate(d)
  }

  function aggregate(data) {
    const map = {}
    for (const row of data) {
      const id = row.menu_item_id
      if (!map[id]) {
        map[id] = {
          menu_item_id: id,
          name_he: row.name_he,
          name_en: row.name_en,
          unit: row.unit,
          category: row.category || 'כללי',
          supplier: row.supplier_name || 'לא ידוע',
          days: {},
          total: 0,
        }
      }
      const qty = parseFloat(row.qty)
      map[id].days[row.delivery_date] = (map[id].days[row.delivery_date] || 0) + qty
      map[id].total += qty
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
    const dayLabel = (d) => (lang === 'en' ? d.short_en : d.label)

    for (const [group, items] of Object.entries(grouped)) {
      const header = [t('common.item'), t('common.unit'), ...WEEK_DAYS.map(dayLabel), t('common.total'), t('weekly.prevWeekCol'), `${t('weekly.change')} %`]
      const sheetData = [header]
      for (const row of items) {
        sheetData.push([
          lang === 'en' ? (row.name_en || row.name_he) : row.name_he,
          row.unit,
          ...WEEK_DAYS.map(d => row.days[week.dayDate(d.key)] || 0),
          row.total,
          prevRows[row.menu_item_id] || 0,
          changePercent(row.total, prevRows[row.menu_item_id]),
        ])
      }
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      XLSX.utils.book_append_sheet(wb, ws, groupLabel(group).slice(0, 31))
    }

    const fileName = lang === 'en'
      ? `Weekly_Production_Table_${week.weekStartISO}.xlsx`
      : `טבלת_ייצור_שבועית_${week.weekStartISO}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  function printWeekly() {
    const grouped = groupRows(rows) // honors CATEGORY_ORDER
    const dir = lang === 'en' ? 'ltr' : 'rtl'
    const sections = Object.entries(grouped).map(([group, items]) => ({
      heading: groupLabel(group),
      items: items.map(row => ({
        name: lang === 'en' ? (row.name_en || row.name_he) : row.name_he,
        unit: row.unit,
        category: groupLabel(row.category),
        days: WEEK_DAYS.reduce((acc, d) => { acc[d.key] = row.days[week.dayDate(d.key)]; return acc }, {}),
        total: row.total,
      })),
    }))
    const html = buildWeeklyProductionHtml({
      htmlTitle: t('weekly.printHtmlTitle'),
      h1: t('weekly.printHtmlTitle'),
      subheading: week.weekLabel,
      dayLabels: WEEK_DAYS.map(d => ({ key: d.key, short_en: lang === 'en' ? d.short_en : d.short })),
      sections,
      dir,
      labels: { item: t('common.item'), category: t('common.category'), unit: t('common.unit'), total: t('common.total') },
    })
    if (!openAndPrint(html)) toast.error(t('weekly.popupBlocked'))
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
    // category (the only remaining view mode besides trend)
    const buckets = {}
    for (const row of rowList) {
      const k = row.category
      if (!buckets[k]) buckets[k] = []
      buckets[k].push(row)
    }
    const result = {}
    for (const k of CATEGORY_ORDER) if (buckets[k]?.length) result[k] = buckets[k]
    const rest = Object.keys(buckets).filter(k => !CATEGORY_ORDER.includes(k)).sort((a, b) => a.localeCompare(b, 'he'))
    for (const k of rest) result[k] = buckets[k]
    return result
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
        <h1 className="page-title">{t('weekly.title')}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'btn btn-sm ' + (viewMode === 'category' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('category')}>{t('weekly.byCategory')}</button>
          <button className={'btn btn-sm ' + (viewMode === 'trend' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('trend')}>{t('weekly.byTrend')}</button>
          {rows.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={exportExcel} title={t('weekly.exportExcel')}>
              <Download size={14} /> Excel
            </button>
          )}
          {rows.length > 0 && (
            <button className="btn btn-ghost btn-sm no-print" onClick={printWeekly} title={t('weekly.printEnglish')}>
              <Printer size={14} /> {t('common.print')}
            </button>
          )}
        </div>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}><ChevronRight size={16} /></button>
        <span className="week-label">{week.weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={week.goToToday} style={{ fontSize: 12 }}>{t('weekly.thisWeek')}</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">{t('weekly.uniqueItems')}</div>
          <div className="stat-val">{loading ? '—' : totalItems}</div>
        </div>
        <div className="card stat-card stat-green">
          <div className="stat-lbl">{t('weekly.weeklyQty')}</div>
          <div className="stat-val">{loading ? '—' : grandTotal.toLocaleString(locale)}</div>
        </div>
        <div className="card stat-card" style={{ borderBottom: `3px solid ${weekChange === null ? 'var(--bdr2)' : weekChange >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
          <div className="stat-lbl">{t('weekly.vsPrevWeek')}</div>
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
          <div className="empty-text">{t('weekly.emptyText')}</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="itbl" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th className="sticky-col" style={{ minWidth: 180 }}>{t('common.item')}</th>
                  <th>{t('common.category')}</th>
                  {WEEK_DAYS.map(d => (
                    <th key={d.key} style={{ textAlign: 'center', minWidth: 64 }}>
                      <div>{lang === 'en' ? d.short_en : d.short}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{formatShortDate(week.dayDate(d.key))}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>{t('common.total')}</th>
                  <th style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)' }}>{t('weekly.change')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="sticky-col" style={{ fontWeight: 700, background: 'var(--accent-tint)' }}>{t('weekly.grandTotal')}</td>
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
                              {viewMode === 'trend' ? TREND_ICONS[group] : '📦'} {groupLabel(group)}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>
                              {groupTotal.toLocaleString(locale)}
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
                            <td className="sticky-col" style={{ fontWeight: 500 }}>{lang === 'en' ? (row.name_en || row.name_he) : row.name_he}</td>
                            <td style={{ color: 'var(--t3)', fontSize: 12 }}>{groupLabel(row.category)}</td>
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
