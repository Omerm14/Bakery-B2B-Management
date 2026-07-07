import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import SearchInput from '../components/SearchInput'
import { useTranslation } from '../context/LanguageContext'
import { customerDisplayName } from '../lib/displayName'

const CustomTooltip = ({ active, payload, label, locale }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--accent)', fontWeight: 600 }}>{p.name}: {p.value?.toLocaleString(locale)}</div>
      ))}
    </div>
  )
}

const MAX_WEEKS = 12
const PAGE_SIZE = 1000

// Supabase/PostgREST caps a single response at PAGE_SIZE rows by default —
// a customer's or item's full order history can exceed that as more weeks
// accumulate, silently dropping rows (usually the oldest) with no error.
// Paginate with .range() until a page comes back short to fetch everything.
async function fetchAllPages(buildQuery) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) { console.error('[History] fetchAllPages', error); break }
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export default function History() {
  const { t, lang } = useTranslation()
  const locale = lang === 'en' ? 'en-US' : 'he-IL'
  const location = useLocation()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState('customer')
  const { customers } = useCustomers()
  const { menuItems } = useMenuItems()
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tableData, setTableData] = useState(null) // { weeks: [...iso], rows: [...], trendData: [...] }
  const [pillFilter, setPillFilter] = useState('')

  function displayName(item) {
    return lang === 'en' ? (item.name_en || item.name_he) : item.name_he
  }

  useEffect(() => {
    if (customers.length && !selectedCustomer) setSelectedCustomer(customers[0])
  }, [customers])

  useEffect(() => {
    if (!menuItems.length) return
    const wantedId = location.state?.itemId
    if (!wantedId) return
    const match = menuItems.find(i => i.id === wantedId)
    if (match) { setViewMode('item'); setSelectedItem(match) }
    navigate(location.pathname, { replace: true, state: null })
  }, [menuItems, location.state])

  useEffect(() => { setPillFilter('') }, [viewMode])

  useEffect(() => {
    if (viewMode === 'customer' && selectedCustomer) loadCustomerHistory()
    else if (viewMode === 'item' && selectedItem) loadItemHistory()
    else setTableData(null)
  }, [viewMode, selectedCustomer, selectedItem])

  async function loadCustomerHistory() {
    if (!selectedCustomer) return
    setLoading(true)
    try {
      const lines = await fetchAllPages((from, to) =>
        supabase
          .from('order_lines')
          .select('week_id, menu_item_id, quantity, weeks(start_date), menu_items(name_he, name_en, unit)')
          .eq('customer_id', selectedCustomer.id)
          .gt('quantity', 0)
          .range(from, to)
      )

      if (!lines.length) { setTableData(null); return }

      // Group by (menu_item_id, week)
      const itemWeekMap = {} // itemId → { name_he, name_en, unit, weekQtys: {iso: qty}, total }
      const weekSet = new Set()

      for (const l of lines) {
        const iso = l.weeks?.start_date
        if (!iso) continue
        weekSet.add(iso)
        const id = l.menu_item_id
        if (!itemWeekMap[id]) itemWeekMap[id] = { id, name_he: l.menu_items?.name_he, name_en: l.menu_items?.name_en, unit: l.menu_items?.unit, weekQtys: {}, total: 0 }
        itemWeekMap[id].weekQtys[iso] = (itemWeekMap[id].weekQtys[iso] || 0) + parseFloat(l.quantity)
        itemWeekMap[id].total += parseFloat(l.quantity)
      }

      // Sort weeks, take last MAX_WEEKS
      const allWeeks = [...weekSet].sort()
      const recentWeeks = allWeeks.slice(-MAX_WEEKS)

      // Build rows, sorted by total desc, filter items with any qty in recent weeks
      const rows = Object.values(itemWeekMap)
        .filter(r => recentWeeks.some(w => r.weekQtys[w] > 0))
        .sort((a, b) => b.total - a.total)
        .map(r => ({
          ...r,
          standing: detectStanding(r.weekQtys, recentWeeks),
          recentTotal: recentWeeks.reduce((s, w) => s + (r.weekQtys[w] || 0), 0),
        }))

      // Trend: total per week across all weeks
      const weekTotals = {}
      for (const l of lines) {
        const iso = l.weeks?.start_date
        if (!iso) continue
        weekTotals[iso] = (weekTotals[iso] || 0) + parseFloat(l.quantity)
      }
      const trendData = allWeeks.map(iso => ({ label: fmtWeek(iso), כמות: Math.round((weekTotals[iso] || 0) * 10) / 10 }))

      setTableData({ weeks: recentWeeks, rows, trendData, title: customerDisplayName(selectedCustomer, lang) })
    } finally {
      setLoading(false)
    }
  }

  async function loadItemHistory() {
    if (!selectedItem) return
    setLoading(true)
    try {
      const lines = await fetchAllPages((from, to) =>
        supabase
          .from('order_lines')
          .select('week_id, customer_id, quantity, weeks(start_date), customers!inner(name, name_en, active)')
          .eq('menu_item_id', selectedItem.id)
          .eq('customers.active', true)
          .gt('quantity', 0)
          .range(from, to)
      )

      if (!lines.length) { setTableData(null); return }

      const custWeekMap = {}
      const weekSet = new Set()

      for (const l of lines) {
        const iso = l.weeks?.start_date
        if (!iso) continue
        weekSet.add(iso)
        const id = l.customer_id
        if (!custWeekMap[id]) custWeekMap[id] = { id, name: l.customers?.name, name_en: l.customers?.name_en, weekQtys: {}, total: 0 }
        custWeekMap[id].weekQtys[iso] = (custWeekMap[id].weekQtys[iso] || 0) + parseFloat(l.quantity)
        custWeekMap[id].total += parseFloat(l.quantity)
      }

      const allWeeks = [...weekSet].sort()
      const recentWeeks = allWeeks.slice(-MAX_WEEKS)

      const rows = Object.values(custWeekMap)
        .filter(r => recentWeeks.some(w => r.weekQtys[w] > 0))
        .sort((a, b) => b.total - a.total)
        .map(r => ({
          ...r,
          standing: detectStanding(r.weekQtys, recentWeeks),
          recentTotal: recentWeeks.reduce((s, w) => s + (r.weekQtys[w] || 0), 0),
        }))

      const weekTotals = {}
      for (const l of lines) {
        const iso = l.weeks?.start_date
        if (!iso) continue
        weekTotals[iso] = (weekTotals[iso] || 0) + parseFloat(l.quantity)
      }
      const trendData = allWeeks.map(iso => ({ label: fmtWeek(iso), כמות: Math.round((weekTotals[iso] || 0) * 10) / 10 }))

      setTableData({ weeks: recentWeeks, rows, trendData, title: displayName(selectedItem) })
    } finally {
      setLoading(false)
    }
  }

  function detectStanding(weekQtys, recentWeeks) {
    // 3+ consecutive recent weeks with identical positive qty
    let streak = 0, lastQty = null
    for (const w of recentWeeks) {
      const q = weekQtys[w] || 0
      if (q > 0 && q === lastQty) streak++
      else { streak = q > 0 ? 1 : 0; lastQty = q > 0 ? q : null }
      if (streak >= 3) return true
    }
    return false
  }

  function fmtWeek(iso) {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('history.title')}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'btn btn-sm ' + (viewMode === 'customer' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('customer')}>{t('history.byCustomer')}</button>
          <button className={'btn btn-sm ' + (viewMode === 'item' ? 'btn-primary' : 'btn-ghost')} onClick={() => setViewMode('item')}>{t('history.byItem')}</button>
        </div>
      </div>

      <div className="sidebar-layout">
        {/* Selector sidebar */}
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>{viewMode === 'customer' ? t('common.customer') : t('common.item')}</div>
          <SearchInput value={pillFilter} onChange={setPillFilter} placeholder={viewMode === 'customer' ? t('history.searchCustomer') : t('history.searchItem')} />
          <div className="customer-list" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
            {(viewMode === 'customer' ? customers : menuItems)
              .filter(item => (viewMode === 'customer' ? customerDisplayName(item, lang) : displayName(item)).includes(pillFilter.trim()))
              .map(item => {
              const isSelected = viewMode === 'customer' ? selectedCustomer?.id === item.id : selectedItem?.id === item.id
              return (
                <div
                  key={item.id}
                  className={'customer-pill' + (isSelected ? ' active' : '')}
                  onClick={() => viewMode === 'customer' ? setSelectedCustomer(item) : setSelectedItem(item)}
                >
                  {viewMode === 'customer' ? customerDisplayName(item, lang) : displayName(item)}
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
          ) : !tableData?.rows?.length ? (
            <div className="empty">
              <div className="empty-icon">📊</div>
              <div className="empty-text">{t('history.emptyText')}</div>
            </div>
          ) : (
            <>
              {/* Trend chart */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                  {t('history.trendPrefix')} — {tableData.title}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={tableData.trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="var(--bdr)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip locale={locale} />} />
                    <Line type="monotone" dataKey="כמות" name={t('common.quantity')} stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)', r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Cross-tab table: rows = items/customers, columns = weeks */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', fontSize: 12, color: 'var(--t3)' }}>
                  {viewMode === 'customer' ? t('common.items') : t('common.customers')} × {tableData.weeks.length} {t('history.recentWeeksCount')}
                  {tableData.weeks.length === MAX_WEEKS && (
                    lang === 'en' ? ` (${t('history.last')} ${MAX_WEEKS})` : ` (${MAX_WEEKS} ${t('history.last')})`
                  )}
                  <span style={{ marginInlineStart: 12 }}>{t('history.standingLegend')}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="itbl" style={{ minWidth: 500 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 160 }}>{viewMode === 'customer' ? t('common.item') : t('common.customer')}</th>
                        {viewMode === 'customer' && <th style={{ fontSize: 10, color: 'var(--t3)', minWidth: 40 }}>{t('common.unit')}</th>}
                        {tableData.weeks.map(iso => (
                          <th key={iso} style={{ textAlign: 'center', minWidth: 52, fontSize: 11 }}>{fmtWeek(iso)}</th>
                        ))}
                        <th style={{ textAlign: 'center', minWidth: 56, fontWeight: 700 }}>{t('common.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map(row => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: 500 }}>
                            {viewMode === 'customer' ? displayName(row) : customerDisplayName(row, lang)}
                            {row.standing && <span title={t('history.standingOrder')} style={{ marginInlineStart: 6 }}>🔄</span>}
                          </td>
                          {viewMode === 'customer' && (
                            <td style={{ fontSize: 11, color: 'var(--t3)' }}>{row.unit}</td>
                          )}
                          {tableData.weeks.map(iso => {
                            const qty = row.weekQtys[iso] || 0
                            return (
                              <td key={iso} style={{ textAlign: 'center', color: qty ? 'var(--t1)' : 'var(--bdr2)', fontWeight: qty ? 600 : 400, fontSize: 13 }}>
                                {qty ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : '—'}
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>
                            {row.recentTotal % 1 === 0 ? row.recentTotal : row.recentTotal.toFixed(1)}
                          </td>
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
