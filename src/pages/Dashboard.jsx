import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ thisWeekLines: 0, activeCustomers: 0, topItem: null, topItemQty: 0, wowChange: null })
  const [weekHistory, setWeekHistory] = useState([]) // ascending, weeks with data only
  const [chartEnd, setChartEnd] = useState(-1) // index into weekHistory of the trend chart's rightmost week
  const [topItems, setTopItems] = useState([])
  const [latestWeekLabel, setLatestWeekLabel] = useState(null)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Base "current week" on the most recent week that actually has order
      // data, not just the most recent row in `weeks` — calendar navigation
      // and the customer ordering portal can pre-create a blank week row
      // before any order exists in it, which must not be mistaken for "this
      // week" (it would show zero everywhere despite real recent data).
      const { data: candidateWeeksDesc } = await supabase
        .from('weeks')
        .select('id, start_date')
        .order('start_date', { ascending: false })
        .limit(104)

      const candidateIds = (candidateWeeksDesc || []).map(w => w.id)
      const { data: rawLines } = candidateIds.length
        ? await supabase.from('order_lines').select('week_id, customer_id, menu_item_id, quantity, menu_items(name_he)').in('week_id', candidateIds).gt('quantity', 0)
        : { data: [] }

      const linesByWeek = new Map()
      for (const l of rawLines || []) {
        // Exclude a corrupted historical menu item ("תאריך") whose bogus
        // quantities (leftover date-serial values from an old import bug)
        // would otherwise blow up every total that includes it.
        if (!l.menu_items || l.menu_items.name_he === 'תאריך') continue
        if (!linesByWeek.has(l.week_id)) linesByWeek.set(l.week_id, [])
        linesByWeek.get(l.week_id).push(l)
      }

      // Full history of weeks that actually have data, oldest first — kept in
      // state so the trend chart can be paged through client-side with no
      // extra queries. KPI cards below always reflect the true latest week,
      // independent of whatever range the chart is currently showing.
      const historyAsc = (candidateWeeksDesc || [])
        .filter(w => linesByWeek.has(w.id))
        .reverse()
        .map(w => ({
          id: w.id,
          start_date: w.start_date,
          label: formatWeekShort(w.start_date),
          qty: (linesByWeek.get(w.id) || []).reduce((s, l) => s + parseFloat(l.quantity), 0),
        }))
      setWeekHistory(historyAsc)
      setChartEnd(historyAsc.length - 1)

      const thisWeek = historyAsc[historyAsc.length - 1] || null
      const prevWeek = historyAsc[historyAsc.length - 2] || null
      setLatestWeekLabel(thisWeek ? thisWeek.label : null)

      // This week stats
      const thisWeekLines = thisWeek ? (linesByWeek.get(thisWeek.id) || []) : []
      const prevWeekLines = prevWeek ? (linesByWeek.get(prevWeek.id) || []) : []
      const thisTotal = thisWeekLines.reduce((s, l) => s + parseFloat(l.quantity), 0)
      const prevTotal = prevWeekLines.reduce((s, l) => s + parseFloat(l.quantity), 0)
      const wowChange = prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 100) : null

      const activeCustomers = new Set(thisWeekLines.map(l => l.customer_id)).size

      // Top items this week
      const itemTotals = {}
      for (const l of thisWeekLines) {
        if (!itemTotals[l.menu_item_id]) itemTotals[l.menu_item_id] = { name: l.menu_items?.name_he, qty: 0 }
        itemTotals[l.menu_item_id].qty += parseFloat(l.quantity)
      }
      const sortedItems = Object.entries(itemTotals).sort((a, b) => b[1].qty - a[1].qty)
      const top10 = sortedItems.slice(0, 10).map(([, v]) => ({ name: v.name, qty: Math.round(v.qty * 10) / 10 }))
      setTopItems(top10)

      const topItem = sortedItems[0]
      setStats({
        thisWeekLines: Math.round(thisTotal),
        activeCustomers,
        topItem: topItem ? topItem[1].name : null,
        topItemQty: topItem ? Math.round(topItem[1].qty * 10) / 10 : 0,
        wowChange,
      })
    } finally {
      setLoading(false)
    }
  }

  function formatWeekShort(iso) {
    const d = new Date(iso + 'T00:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
  }

  const maxBar = topItems[0]?.qty || 1
  const trendData = weekHistory.slice(Math.max(0, chartEnd - (TREND_WINDOW - 1)), chartEnd + 1)
  const atLatest = chartEnd >= weekHistory.length - 1
  const atOldest = chartEnd <= 0

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">דשבורד</h1>
        <span style={{ fontSize: 13, color: 'var(--t3)' }}>
          {latestWeekLabel ? `שבוע אחרון עם נתונים: ${latestWeekLabel}` : 'שבוע נוכחי'}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">כמות שבועית</div>
          <div className="stat-val"><AnimatedNumber value={stats.thisWeekLines} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-blue">
          <div className="stat-lbl">לקוחות פעילים</div>
          <div className="stat-val"><AnimatedNumber value={stats.activeCustomers} loading={loading} /></div>
        </div>
        <div className="card stat-card stat-amber">
          <div className="stat-lbl">פריט מוביל</div>
          <div className="stat-val" style={{ fontSize: 15, fontWeight: 700 }}>
            {loading ? '—' : (stats.topItem || '—')}
          </div>
          {!loading && stats.topItem && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{stats.topItemQty.toLocaleString('he-IL')} יח׳</div>
          )}
        </div>
        <div className="card stat-card" style={{ borderBottom: `3px solid ${stats.wowChange === null ? 'var(--bdr2)' : stats.wowChange >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
          <div className="stat-lbl">שינוי שבועי</div>
          <div className="stat-val" style={{ fontSize: 22, color: stats.wowChange === null ? 'var(--t3)' : stats.wowChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {loading || stats.wowChange === null ? '—' : `${stats.wowChange > 0 ? '+' : ''}${stats.wowChange}%`}
          </div>
        </div>
      </div>

      <div className="dash-layout">
        {/* Area chart — 8 week trend */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>מגמת כמויות — 8 שבועות</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!atLatest && (
                <button className="btn btn-ghost btn-sm" onClick={() => setChartEnd(weekHistory.length - 1)} style={{ fontSize: 12 }}>
                  לשבוע האחרון
                </button>
              )}
              <button className="btn btn-ghost btn-sm" disabled={atOldest} onClick={() => setChartEnd(i => Math.max(0, i - 1))}>
                <ChevronRight size={16} />
              </button>
              <button className="btn btn-ghost btn-sm" disabled={atLatest} onClick={() => setChartEnd(i => Math.min(weekHistory.length - 1, i + 1))}>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>10 פריטים מובילים השבוע</div>
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>כמויות לפי פריט — שבוע נוכחי</div>
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
