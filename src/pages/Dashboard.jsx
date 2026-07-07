import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { weekStart, formatWeekLabel, toLocalISODate } from '../constants/days'
import { useTranslation } from '../context/LanguageContext'

const TREND_WINDOW = 8

function AnimatedNumber({ value, loading, prefix = '', suffix = '', locale }) {
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
  return <span>{prefix}{display.toLocaleString(locale)}{suffix}</span>
}

const CustomTooltip = ({ active, payload, label, locale }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value?.toLocaleString(locale)}</div>
      ))}
    </div>
  )
}

function formatWeekShort(iso) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
}

// Aggregation happens server-side (see migration 029_dashboard_week_data_function.sql)
// via the dashboard_week_data RPC — it returns one row per (week, item) with
// that week's active-customer count attached, instead of raw per-customer,
// per-day order_lines rows. That's orders of magnitude smaller per week, so
// with HISTORY_BATCH capped at 20 weeks this almost always fits in a single
// page — but still paginates defensively in case it doesn't. Deliberately
// NOT using count: 'exact' here: PostgREST computes an exact count by running
// the whole (expensive, aggregating) query a second time, which was pushing
// this past Supabase's statement timeout. Plain sequential range() paging
// costs nothing extra in the (typical) single-page case.
const PAGE_SIZE = 1000

async function fetchWeekData(weekIds) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .rpc('dashboard_week_data', { p_week_ids: weekIds })
      .range(from, from + PAGE_SIZE - 1)
    if (error) { console.error('[Dashboard] dashboard_week_data', error); break }
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

// Only 8 weeks are ever shown at once (TREND_WINDOW) — fetching a batch of
// HISTORY_BATCH gives comfortable headroom for a few "prev" clicks without
// eagerly pulling much more than the page will actually render. Loading
// further back happens on demand (see loadMoreHistory) instead of loading
// everything up front.
const HISTORY_BATCH = 20

// Turns a page of `weeks` rows (descending) + their aggregated order rows
// into the ascending, pre-computed history entries the UI navigates over.
function buildHistorySegment(weeksDesc, weekRows) {
  const itemsByWeek = new Map() // week_id → [{name_he, name_en, qty}]
  const activeCustomersByWeek = new Map() // week_id → count
  for (const row of weekRows || []) {
    if (!itemsByWeek.has(row.week_id)) itemsByWeek.set(row.week_id, [])
    itemsByWeek.get(row.week_id).push({ name_he: row.item_name, name_en: row.item_name_en, qty: parseFloat(row.item_qty) })
    activeCustomersByWeek.set(row.week_id, row.active_customers)
  }

  return (weeksDesc || [])
    .filter(w => itemsByWeek.has(w.id))
    .reverse()
    .map(w => {
      const items = itemsByWeek.get(w.id) || []
      const qty = items.reduce((s, i) => s + i.qty, 0)
      const activeCustomers = activeCustomersByWeek.get(w.id) || 0

      const sortedItems = [...items].sort((a, b) => b.qty - a.qty)
      const top10 = sortedItems.slice(0, 10).map(i => ({ name_he: i.name_he, name_en: i.name_en, qty: Math.round(i.qty * 10) / 10 }))
      const topItem = sortedItems[0] ? { name_he: sortedItems[0].name_he, name_en: sortedItems[0].name_en, qty: Math.round(sortedItems[0].qty * 10) / 10 } : null

      // `label` is the compact single-date form used on the trend chart's
      // x-axis (little room per tick); `rangeLabel` spells out the full
      // week for the header and panel subtitles, where clarity matters
      // more than space.
      return { id: w.id, start_date: w.start_date, label: formatWeekShort(w.start_date), rangeLabel: formatWeekLabel(w.start_date), qty, activeCustomers, top10, topItem }
    })
}

const CACHE_KEY = 'dashboard_cache_v1'

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(weekHistory, viewedIndex, hasMoreHistory) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ weekHistory, viewedIndex, hasMoreHistory }))
  } catch {
    // sessionStorage full/unavailable — caching is a nice-to-have, safe to skip
  }
}

export default function Dashboard() {
  const { t, lang } = useTranslation()
  const locale = lang === 'en' ? 'en-US' : 'he-IL'
  const cached = useRef(readCache()).current
  const [loading, setLoading] = useState(!cached)
  // Ascending list of weeks that actually have order data, each pre-computed
  // with its own qty/active-customers/top-items — lets every part of the
  // page (KPI cards, top-items panel, trend chart) navigate together off a
  // single index with zero additional queries per click.
  const [weekHistory, setWeekHistory] = useState(cached?.weekHistory || [])
  const [viewedIndex, setViewedIndex] = useState(cached?.viewedIndex ?? -1)
  // Whether older weeks might still exist further back than what's loaded —
  // starts optimistic; loadMoreHistory sets it false once a fetch comes back
  // short (or empty), meaning we've reached the actual beginning.
  const [hasMoreHistory, setHasMoreHistory] = useState(cached?.hasMoreHistory ?? true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => { loadDashboard(!!cached) }, [])

  // Base "current week" on the most recent week, no later than today, that
  // actually has order data — calendar navigation and the customer ordering
  // portal can both pre-create a blank week row (before any order exists in
  // it) and let a customer place a standing/advance order for a week far in
  // the future. Neither should be mistaken for "this week": a blank stub
  // would show zero everywhere despite real recent data, and a future week
  // with one pre-order would hide the real current week's much larger
  // activity behind it.
  async function loadDashboard(isBackgroundRefresh) {
    if (!isBackgroundRefresh) setLoading(true)
    try {
      const todayIso = toLocalISODate(weekStart())
      const { data: candidateWeeksDesc } = await supabase
        .from('weeks')
        .select('id, start_date')
        .lte('start_date', todayIso)
        .order('start_date', { ascending: false })
        .limit(HISTORY_BATCH)

      const candidateIds = (candidateWeeksDesc || []).map(w => w.id)
      const weekRows = candidateIds.length ? await fetchWeekData(candidateIds) : []
      const historyAsc = buildHistorySegment(candidateWeeksDesc, weekRows)
      const moreLikely = (candidateWeeksDesc || []).length >= HISTORY_BATCH

      setWeekHistory(historyAsc)
      setViewedIndex(historyAsc.length - 1)
      setHasMoreHistory(moreLikely)
      writeCache(historyAsc, historyAsc.length - 1, moreLikely)
    } finally {
      setLoading(false)
    }
  }

  // Fetches the next batch of weeks older than whatever's currently loaded,
  // and prepends them — used when the user pages back past the oldest
  // week already in memory, instead of loading everything up front.
  async function loadMoreHistory() {
    if (loadingMore || !hasMoreHistory || weekHistory.length === 0) return
    setLoadingMore(true)
    try {
      const oldestLoadedDate = weekHistory[0].start_date
      const { data: olderWeeksDesc } = await supabase
        .from('weeks')
        .select('id, start_date')
        .lt('start_date', oldestLoadedDate)
        .order('start_date', { ascending: false })
        .limit(HISTORY_BATCH)

      const olderIds = (olderWeeksDesc || []).map(w => w.id)
      const olderRows = olderIds.length ? await fetchWeekData(olderIds) : []
      const olderHistoryAsc = buildHistorySegment(olderWeeksDesc, olderRows)
      const moreLikely = (olderWeeksDesc || []).length >= HISTORY_BATCH && olderHistoryAsc.length > 0

      if (olderHistoryAsc.length === 0) {
        setHasMoreHistory(false)
        return
      }

      const merged = [...olderHistoryAsc, ...weekHistory]
      const newIndex = olderHistoryAsc.length - 1
      setWeekHistory(merged)
      setViewedIndex(newIndex)
      setHasMoreHistory(moreLikely)
      writeCache(merged, newIndex, moreLikely)
    } finally {
      setLoadingMore(false)
    }
  }

  function goOlder() {
    if (viewedIndex > 0) setViewedIndex(i => i - 1)
    else loadMoreHistory()
  }

  const viewedWeek = weekHistory[viewedIndex] || null
  const prevWeek = weekHistory[viewedIndex - 1] || null
  const thisTotal = viewedWeek?.qty || 0
  const prevTotal = prevWeek?.qty || 0
  const wowChange = prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 100) : null
  const activeCustomers = viewedWeek?.activeCustomers || 0
  const rawTopItem = viewedWeek?.topItem || null
  const topItem = rawTopItem ? { ...rawTopItem, name: lang === 'en' ? (rawTopItem.name_en || rawTopItem.name_he) : rawTopItem.name_he } : null
  const topItems = (viewedWeek?.top10 || []).map(i => ({ ...i, name: lang === 'en' ? (i.name_en || i.name_he) : i.name_he }))
  const maxBar = topItems[0]?.qty || 1
  const trendData = weekHistory.slice(Math.max(0, viewedIndex - (TREND_WINDOW - 1)), viewedIndex + 1)
  const atLatest = viewedIndex >= weekHistory.length - 1
  const atOldest = viewedIndex <= 0 && !hasMoreHistory

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('dashboard.title')}</h1>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" disabled={atOldest || loadingMore} onClick={goOlder}>
          {loadingMore ? <span className="shimmer" style={{ width: 16, height: 16, borderRadius: 4 }} /> : <ChevronRight size={16} />}
        </button>
        <span className="week-label">{viewedWeek ? viewedWeek.rangeLabel : '—'}</span>
        <button className="btn btn-ghost btn-sm" disabled={atLatest} onClick={() => setViewedIndex(i => Math.min(weekHistory.length - 1, i + 1))}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" disabled={atLatest} onClick={() => setViewedIndex(weekHistory.length - 1)} style={{ fontSize: 12 }}>{t('dashboard.lastWeekWithData')}</button>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="card stat-card stat-cyan">
          <div className="stat-lbl">{t('dashboard.weeklyQty')}</div>
          <div className="stat-val"><AnimatedNumber value={Math.round(thisTotal)} loading={loading} locale={locale} /></div>
        </div>
        <div className="card stat-card stat-blue">
          <div className="stat-lbl">{t('dashboard.activeCustomers')}</div>
          <div className="stat-val"><AnimatedNumber value={activeCustomers} loading={loading} locale={locale} /></div>
        </div>
        <div className="card stat-card stat-amber">
          <div className="stat-lbl">{t('dashboard.topItem')}</div>
          <div className="stat-val" style={{ fontSize: 15, fontWeight: 700 }}>
            {loading ? '—' : (topItem?.name || '—')}
          </div>
          {!loading && topItem && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{topItem.qty.toLocaleString(locale)} {t('common.unit')}</div>
          )}
        </div>
        <div className="card stat-card" style={{ borderBottom: `3px solid ${wowChange === null ? 'var(--bdr2)' : wowChange >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
          <div className="stat-lbl">{t('dashboard.weeklyChange')}</div>
          <div className="stat-val" style={{ fontSize: 22, color: wowChange === null ? 'var(--t3)' : wowChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {loading || wowChange === null ? '—' : `${wowChange > 0 ? '+' : ''}${wowChange}%`}
          </div>
        </div>
      </div>

      <div className="dash-layout">
        {/* Area chart — trend */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>{t('dashboard.trendTitle')} — {TREND_WINDOW} {t('dashboard.weeks')}</div>
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
                <Tooltip content={<CustomTooltip locale={locale} />} />
                <Area type="monotone" dataKey="qty" name={t('common.quantity')} stroke="var(--accent)" strokeWidth={2} fill="url(#areaGrad)" dot={{ fill: 'var(--accent)', r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 10 items */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{t('dashboard.top10Title')} — {viewedWeek?.rangeLabel || '—'}</div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 28 }} />)}
            </div>
          ) : topItems.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>{t('dashboard.noDataWeek')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topItems.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--t1)', fontWeight: i === 0 ? 700 : 400 }}>{item.name}</span>
                    <span style={{ color: 'var(--t3)' }}>{item.qty.toLocaleString(locale)}</span>
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>{t('dashboard.qtyByItem')} — {viewedWeek?.rangeLabel || '—'}</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topItems} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
              <CartesianGrid stroke="var(--bdr)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip locale={locale} />} />
              <Bar dataKey="qty" name={t('common.quantity')} fill="var(--brass)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
