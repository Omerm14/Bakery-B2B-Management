import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { weekStart } from '../constants/days'

const TREND_WINDOW = 8

function AnimatedNumber({ value, loading, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (loading || value === null || value === undefined) return
    const start = prev.current
    const end = value
    const diff = end - start
    if (diff === 0) return
    const steps = 30
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplay(Math.round(start + diff * (i / steps)))
      if (i >= steps) { clearInterval(timer); prev.current = end }
    }, 16)
    return () => clearInterval(timer)
  }, [value, loading])
  if (loading) return <span>—</span>
  return <span>{prefix}{display.toLocaleString('he-IL')}{suffix}</span>
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value?.toLocaleString('he-IL')}</div>
      ))}
    </div>
  )
}

function formatWeekShort(iso) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
}

const PAGE_SIZE = 1000

// Supabase/PostgREST caps a single response at PAGE_SIZE rows by default —
// with enough historical order data across many weeks, that cap can be hit
// before the response ever reaches the most recent (physically later in the
// table) rows, silently dropping the current week from every aggregate.
// Paginate with .range() until a page comes back short to fetch everything.
async function fetchAllOrderLines(weekIds) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('order_lines')
      .select('week_id, customer_id, menu_item_id, quantity, menu_items(name_he), customers!inner(active)')
      .in('week_id', weekIds)
      .eq('customers.active', true)
      .gt('quantity', 0)
      .range(from, from + PAGE_SIZE - 1)
    if (error) { console.error('[Dashboard] fetchAllOrderLines', error); break }
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  // Ascending list of weeks that actually have order data, each pre-computed
  // with its own qty/active-customers/top-items — lets every part of the
  // page (KPI cards, top-items panel, trend chart) navigate together off a
  // single index with zero additional queries per click.
  const [weekHistory, setWeekHistory] = useState([])
  const [viewedIndex, setViewedIndex] = useState(-1)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Base "current week" on the most recent week, no later than today,
      // that actually has order data — calendar navigation and the customer
      // ordering portal can both pre-create a blank week row (before any
      // order exists in it) and let a customer place a standing/advance
      // order for a week far in the future. Neither should be mistaken for
      // "this week": a blank stub would show zero everywhere despite real
      // recent data, and a future week with one pre-order would hide the
      // real current week's much larger activity behind it.
      const todayIso = weekStart().toISOString().slice(0, 10)
      const { data: candidateWeeksDesc } = await supabase
        .from('weeks')
        .select('id, start_date')
        .lte('start_date', todayIso)
        .order('start_date', { ascending: false })
        .limit(104)

      const candidateIds = (candidateWeeksDesc || []).map(w => w.id)
      const rawLines = candidateIds.length ? await fetchAllOrderLines(candidateIds) : []

      const linesByWeek = new Map()
      for (const l of rawLines || []) {
        // Exclude a corrupted historical menu item ("תאריך") whose bogus
        // quantities (leftover date-serial values from an old import bug)
        // would otherwise blow up every total that includes it.
        if (!l.menu_items || l.menu_items.name_he === 'תאריך') continue
        if (!linesByWeek.has(l.week_id)) linesByWeek.set(l.week_id, [])
        linesByWeek.get(l.week_id).push(l)
      }

      // Full history of weeks that actually have data, oldest first, each
      // pre-aggregated (qty, active customers, top items) so navigating
      // between weeks afterward is just an index change — no re-fetching.
      const historyAsc = (candidateWeeksDesc || [])
        .filter(w => linesByWeek.has(w.id))
        .reverse()
        .map(w => {
          const lines = linesByWeek.get(w.id) || []
          const qty = lines.reduce((s, l) => s + parseFloat(l.quantity), 0)
          const activeCustomers = new Set(lines.map(l => l.customer_id)).size

          const itemTotals = {}
          for (const l of lines) {
            if (!itemTotals[l.menu_item_id]) itemTotals[l.menu_item_id] = { name: l.menu_items?.name_he, qty: 0 }
            itemTotals[l.menu_item_id].qty += parseFloat(l.quantity)
          }
          const sortedItems = Object.entries(itemTotals).sort((a, b) => b[1].qty - a[1].qty)
          const top10 = sortedItems.slice(0, 10).map(([, v]) => ({ name: v.name, qty: Math.round(v.qty * 10) / 10 }))
          const topItem = sortedItems[0] ? { name: sortedItems[0][1].name, qty: Math.round(sortedItems[0][1].qty * 10) / 10 } : null

          return { id: w.id, start_date: w.start_date, label: formatWeekShort(w.start_date), qty, activeCustomers, top10, topItem }
        })

      setWeekHistory(historyAsc)
      setViewedIndex(historyAsc.length - 1)
    } finally {
      setLoading(false)
    }
  }

  const viewedWeek = weekHistory[viewedIndex] || null
  const prevWeek = weekHistory[viewedIndex - 1] || null
  const thisTotal = viewedWeek?.qty || 0
  const prevTotal = prevWeek?.qty || 0
  const wowChange = prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 100) : null
  const activeCustomers = viewedWeek?.activeCustomers || 0
  const topItem = viewedWeek?.topItem || null
  const topItems = viewedWeek?.top10 || []
  const maxBar = topItems[0]?.qty || 1
  const trendData = weekHistory.slice(Math.max(0, viewedIndex - (TREND_WINDOW - 1)), viewedIndex + 1)
  const atLatest = viewedIndex >= weekHistory.length - 1
  const atOldest = viewedIndex <= 0

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">דשבורד</h1>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" disabled={atOldest} onClick={() => setViewedIndex(i => Math.max(0, i - 1))}><ChevronRight size={16} /></button>
        <span className="week-label">{viewedWeek ? viewedWeek.label : '—'}</span>
        <button className="btn btn-ghost btn-sm" disabled={atLatest} onClick={() => setViewedIndex(i => Math.min(weekHistory.length - 1, i + 1))}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" disabled={atLatest} onClick={() => setViewedIndex(weekHistory.length - 1)} style={{ fontSize: 12 }}>שבוע אחרון עם נתונים</button>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">כמות שבועית</div>
          <div className="stat-val"><AnimatedNumber value={Math.round(thisTotal)} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-blue">
          <div className="stat-lbl">לקוחות פעילים</div>
          <div className="stat-val"><AnimatedNumber value={activeCustomers} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-amber">
          <div className="stat-lbl">פריט מוביל</div>
          <div className="stat-val" style={{ fontSize: 15, fontWeight: 700 }}>
            {loading ? '—' : (topItem?.name || '—')}
          </div>
          {!loading && topItem && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{topItem.qty.toLocaleString('he-IL')} יח׳</div>
          )}
        </div>
        <div className="card stat-card" style={{ borderBottom: `3px solid ${wowChange === null ? 'var(--bdr2)' : wowChange >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
          <div className="stat-lbl">שינוי שבועי</div>
          <div className="stat-val" style={{ fontSize: 22, color: wowChange === null ? 'var(--t3)' : wowChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {loading || wowChange === null ? '—' : `${wowChange > 0 ? '+' : ''}${wowChange}%`}
          </div>
        </div>
      </div>

      <div className="dash-layout">
        {/* Area chart — trend */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>מגמת כמויות — {TREND_WINDOW} שבועות</div>
          {loading ? (
            <div className="shimmer" style={{ height: 220 }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--bdr)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="qty" name="כמות" stroke="var(--accent)" strokeWidth={2} fill="url(#areaGrad)" dot={{ fill: 'var(--accent)', r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 10 items */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>10 פריטים מובילים — {viewedWeek?.label || '—'}</div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 28 }} />)}
            </div>
          ) : topItems.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>אין נתונים לשבוע זה</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topItems.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--t1)', fontWeight: i === 0 ? 700 : 400 }}>{item.name}</span>
                    <span style={{ color: 'var(--t3)' }}>{item.qty.toLocaleString('he-IL')}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bdr2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(item.qty / maxBar) * 100}%`,
                      background: i === 0 ? 'var(--grad)' : 'var(--accent)',
                      borderRadius: 2,
                      opacity: 1 - i * 0.07,
                      transition: 'width .8s cubic-bezier(.16,1,.3,1)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full bar chart */}
      {!loading && topItems.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>כמויות לפי פריט — {viewedWeek?.label || '—'}</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topItems} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
              <CartesianGrid stroke="var(--bdr)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="qty" name="כמות" fill="var(--brass)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
