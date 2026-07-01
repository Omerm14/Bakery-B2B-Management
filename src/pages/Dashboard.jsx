import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'

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
  const [trendData, setTrendData] = useState([])
  const [topItems, setTopItems] = useState([])

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Get last 8 weeks of data
      const today = new Date()
      const sunOffset = today.getDay() === 0 ? 0 : -today.getDay()
      const thisSunday = new Date(today)
      thisSunday.setDate(today.getDate() + sunOffset)
      thisSunday.setHours(0, 0, 0, 0)

      const weeks = []
      for (let i = 0; i < 8; i++) {
        const d = new Date(thisSunday)
        d.setDate(d.getDate() - i * 7)
        weeks.push(d.toISOString().slice(0, 10))
      }
      weeks.reverse() // oldest first

      // Fetch week rows for these dates
      const { data: weekRows } = await supabase
        .from('weeks')
        .select('id, start_date')
        .in('start_date', weeks)

      const weekMap = {}
      for (const w of weekRows || []) weekMap[w.start_date] = w.id

      const thisWeekIso = thisSunday.toISOString().slice(0, 10)
      const prevWeekDate = new Date(thisSunday)
      prevWeekDate.setDate(prevWeekDate.getDate() - 7)
      const prevWeekIso = prevWeekDate.toISOString().slice(0, 10)

      const thisWeekId = weekMap[thisWeekIso]
      const prevWeekId = weekMap[prevWeekIso]

      // Fetch order lines for all 8 weeks
      const weekIds = Object.values(weekMap)
      const { data: allLines } = weekIds.length
        ? await supabase.from('order_lines').select('week_id, customer_id, menu_item_id, quantity, menu_items(name_he)').in('week_id', weekIds).gt('quantity', 0)
        : { data: [] }

      // Build trend data: total quantity per week
      const trendMap = {}
      for (const iso of weeks) trendMap[iso] = { label: formatWeekShort(iso), qty: 0, iso }
      for (const line of allLines || []) {
        const iso = Object.keys(weekMap).find(k => weekMap[k] === line.week_id)
        if (iso && trendMap[iso]) trendMap[iso].qty += parseFloat(line.quantity)
      }
      setTrendData(Object.values(trendMap))

      // This week stats
      const thisWeekLines = (allLines || []).filter(l => l.week_id === thisWeekId)
      const prevWeekLines = (allLines || []).filter(l => l.week_id === prevWeekId)
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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">דשבורד</h1>
        <span style={{ fontSize: 13, color: 'var(--t3)' }}>שבוע נוכחי</span>
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>מגמת כמויות — 8 שבועות אחרונים</div>
          {loading ? (
            <div className="shimmer" style={{ height: 220 }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.05)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="qty" name="כמות" stroke="#06b6d4" strokeWidth={2} fill="url(#areaGrad)" dot={{ fill: '#06b6d4', r: 3 }} activeDot={{ r: 5 }} />
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
                      background: i === 0 ? 'var(--grad)' : 'var(--cyan)',
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
              <CartesianGrid stroke="rgba(255,255,255,.05)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="qty" name="כמות" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
