import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronLeft, LogOut, Copy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCustomerWeek } from '../../hooks/useCustomerWeek'
import { useCustomerMenuItems } from '../../hooks/useCustomerMenuItems'
import { useToast } from '../../context/ToastContext'
import { WEEK_DAYS, formatShortDate } from '../../constants/days'
import DayOrderView from './DayOrderView'
import WeekSummaryView from './WeekSummaryView'

const AUTOSAVE_DEBOUNCE_MS = 450
const SAVED_INDICATOR_MS = 1500

export default function CustomerOrders() {
  const toast = useToast()
  const week = useCustomerWeek()
  const { menuItems, loading: itemsLoading } = useCustomerMenuItems()
  const [customer, setCustomer] = useState(null)
  const [weekId, setWeekId] = useState(null)
  const [orderLines, setOrderLines] = useState({}) // `${menuItemId}_${date}` -> line
  const [lockAtByDate, setLockAtByDate] = useState({}) // date -> timestamptz string
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saveStates, setSaveStates] = useState({}) // key -> 'saving' | 'saved'
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('floory_portal_view') || 'day')
  const [dayOffset, setDayOffset] = useState(() => new Date().getDay())
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [copying, setCopying] = useState(false)
  const pendingTimers = useRef({})
  const pendingArgs = useRef({}) // key -> { menuItemId, date, qty } for any not-yet-committed debounced edit
  // upsertOrderLine (defined below) closes over weekId/customer, both of
  // which start out null on the very first render — an effect with a `[]`
  // dependency array only ever sees that first render's closure. Routing
  // the unmount flush through a ref that's reassigned every render (below)
  // ensures it always calls the version with the latest weekId/customer.
  const upsertOrderLineRef = useRef(null)

  useEffect(() => { localStorage.setItem('floory_portal_view', viewMode) }, [viewMode])

  // Flush (not just cancel) any edit still waiting out its debounce when
  // this unmounts — e.g. a customer types a quantity then immediately
  // taps יציאה. Without this, that last edit would silently vanish: the
  // pending timer never fires because the component (and its closures)
  // are gone. Calls the raw write directly, skipping the React state
  // updates commitQty would otherwise do, since there's no component left
  // to show them.
  useEffect(() => () => {
    Object.entries(pendingTimers.current).forEach(([key, timerId]) => {
      clearTimeout(timerId)
      const args = pendingArgs.current[key]
      if (args) upsertOrderLineRef.current?.(args.menuItemId, args.date, args.qty)
    })
  }, [])

  // Ticks every minute so a day that's currently editable locks itself in
  // the UI at the exact cutoff instant, without needing a page refresh.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const customerId = data.session?.user?.app_metadata?.customer_id
      if (!customerId) return
      supabase.from('customers').select('id, name, phone').eq('id', customerId).maybeSingle()
        .then(({ data: c }) => setCustomer(c))
    })
  }, [])

  useEffect(() => {
    document.title = customer ? `הזמנות — ${customer.name}` : 'הזמנות'
  }, [customer])

  const loadWeek = useCallback(async () => {
    if (!customer) return
    setLoading(true)
    setLoadError(false)
    try {
      const { id: wid, error: weekIdError } = await week.getWeekId()
      if (weekIdError) {
        setLoadError(true)
        toast.error('טעינת השבוע נכשלה — נסו שוב')
        return
      }
      setWeekId(wid)

      const lockAts = {}
      let lockAtFailed = false
      await Promise.all(WEEK_DAYS.map(async d => {
        const date = week.dayDate(d.key)
        const { data, error } = await supabase.rpc('get_delivery_date_lock_at', { p_delivery_date: date })
        if (error) lockAtFailed = true
        lockAts[date] = data
      }))
      setLockAtByDate(lockAts)
      if (lockAtFailed) { setLoadError(true); toast.error('בדיקת מועדי העדכון נכשלה — נסו שוב') }

      if (!wid) { setOrderLines({}); return }

      const { data: lines, error: linesError } = await supabase
        .from('order_lines')
        .select('id, menu_item_id, delivery_date, quantity, change_reason')
        .eq('week_id', wid)
        .eq('customer_id', customer.id)
      if (linesError) { setLoadError(true); toast.error('טעינת ההזמנה נכשלה — נסו שוב') }

      const map = {}
      for (const l of lines || []) map[`${l.menu_item_id}_${l.delivery_date}`] = l
      setOrderLines(map)
    } finally {
      setLoading(false)
    }
  }, [customer, week.weekStartISO])

  useEffect(() => { loadWeek() }, [loadWeek])

  const canEdit = useMemo(() => {
    const map = {}
    for (const d of WEEK_DAYS) {
      const date = week.dayDate(d.key)
      const lockAt = lockAtByDate[date]
      map[date] = lockAt ? nowTick < new Date(lockAt).getTime() : true
    }
    return map
  }, [lockAtByDate, nowTick, week.weekStartISO])

  // Pure write, no React state touched — safe to call from the unmount
  // cleanup above, where there's no component left to update.
  function upsertOrderLine(menuItemId, date, qty) {
    if (!weekId || !customer) return Promise.resolve({ data: null, error: null })
    return supabase
      .from('order_lines')
      .upsert({
        week_id: weekId,
        customer_id: customer.id,
        menu_item_id: menuItemId,
        delivery_date: date,
        quantity: qty,
        source: 'manual',
        status: 'ok',
        change_reason: 'customer_request',
        changed_by: customer.phone || customer.name,
        changed_via: 'customer_portal',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
      .select('id')
      .single()
  }
  upsertOrderLineRef.current = upsertOrderLine

  async function commitQty(menuItemId, date, qty, key) {
    setSaveStates(prev => ({ ...prev, [key]: 'saving' }))
    try {
      const { data, error } = await upsertOrderLine(menuItemId, date, qty)
      if (error) throw error
      setOrderLines(prev => ({ ...prev, [key]: { ...prev[key], id: data?.id } }))
      setSaveStates(prev => ({ ...prev, [key]: 'saved' }))
      setTimeout(() => {
        setSaveStates(prev => {
          if (prev[key] !== 'saved') return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      }, SAVED_INDICATOR_MS)
    } catch (err) {
      console.error('[CustomerOrders.commitQty]', err)
      toast.error('השמירה נכשלה — נסו שוב')
      setSaveStates(prev => { const next = { ...prev }; delete next[key]; return next })
    }
  }

  function handleQtyChange(menuItemId, date, rawValue) {
    if (!canEdit[date] || !customer) return
    const qty = parseFloat(rawValue) || 0
    const key = `${menuItemId}_${date}`

    setOrderLines(prev => ({ ...prev, [key]: { ...prev[key], quantity: qty, change_reason: 'customer_request' } }))

    pendingArgs.current[key] = { menuItemId, date, qty }
    if (pendingTimers.current[key]) clearTimeout(pendingTimers.current[key])
    pendingTimers.current[key] = setTimeout(() => {
      delete pendingTimers.current[key]
      delete pendingArgs.current[key]
      commitQty(menuItemId, date, qty, key)
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  // Lets a customer pull last week's quantities into the currently viewed
  // week on demand — on top of the automatic Wednesday rollover, in case
  // they want to reset back to last week's order, or are looking at a
  // week further out that auto-copy hasn't reached yet. Skips any day
  // that's already past its own cutoff rather than failing the whole
  // action (the RLS policy would reject those writes anyway).
  async function copyFromPreviousWeek() {
    if (!customer || !weekId || copying) return
    if (!window.confirm('הפעולה תחליף את הכמויות בימים שניתן עוד לערוך בשבוע זה בכמויות מהשבוע הקודם. להמשיך?')) return

    setCopying(true)
    try {
      const prevStart = new Date(week.weekStartISO)
      prevStart.setDate(prevStart.getDate() - 7)
      const { data: prevWeekRow } = await supabase
        .from('weeks').select('id').eq('start_date', prevStart.toISOString().slice(0, 10)).maybeSingle()
      if (!prevWeekRow) { toast.info('אין הזמנה בשבוע הקודם להעתקה'); return }

      const { data: prevLines, error: prevErr } = await supabase
        .from('order_lines')
        .select('menu_item_id, delivery_date, quantity')
        .eq('week_id', prevWeekRow.id)
        .eq('customer_id', customer.id)
        .gt('quantity', 0)
      if (prevErr) { toast.error('טעינת השבוע הקודם נכשלה'); return }
      if (!prevLines?.length) { toast.info('אין הזמנה בשבוע הקודם להעתקה'); return }

      let skippedLocked = 0
      const upserts = []
      for (const l of prevLines) {
        const d = new Date(l.delivery_date)
        d.setDate(d.getDate() + 7)
        const newDate = d.toISOString().slice(0, 10)
        if (canEdit[newDate] === false) { skippedLocked++; continue }
        upserts.push({
          week_id: weekId,
          customer_id: customer.id,
          menu_item_id: l.menu_item_id,
          delivery_date: newDate,
          quantity: l.quantity,
          source: 'manual',
          status: 'ok',
          change_reason: 'customer_request',
          change_note: 'הועתק מהשבוע הקודם על ידי הלקוח',
          changed_by: customer.phone || customer.name,
          changed_via: 'copy_prev_week',
          updated_at: new Date().toISOString(),
        })
      }

      if (!upserts.length) { toast.info('כל הימים הרלוונטיים נעולים לעדכון'); return }

      const { error } = await supabase
        .from('order_lines')
        .upsert(upserts, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
      if (error) throw error

      await loadWeek()
      toast.success(skippedLocked > 0 ? `הועתק — ${skippedLocked} ימים נעולים לא עודכנו` : 'הועתק בהצלחה מהשבוע הקודם')
    } catch (err) {
      console.error('[CustomerOrders.copyFromPreviousWeek]', err)
      toast.error('ההעתקה נכשלה — נסו שוב')
    } finally {
      setCopying(false)
    }
  }

  function dayTotal(date) {
    let total = 0
    for (const key in orderLines) {
      if (key.endsWith(`_${date}`)) total += orderLines[key]?.quantity || 0
    }
    return total
  }

  function nextDay() {
    setDayOffset(prev => {
      if (prev >= 6) { week.nextWeek(); return 0 }
      return prev + 1
    })
  }

  function prevDay() {
    setDayOffset(prev => {
      if (prev <= 0) { week.prevWeek(); return 6 }
      return prev - 1
    })
  }

  function goToToday() {
    week.goToToday()
    setDayOffset(new Date().getDay())
  }

  function signOut() {
    supabase.auth.signOut()
  }

  const grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const selectedDate = week.dayDate(dayOffset)

  return (
    <div className="page portal-page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">{customer ? `הזמנות — ${customer.name}` : 'הזמנות'}</h1>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>
          <LogOut size={14} /> יציאה
        </button>
      </div>

      <div className="view-toggle">
        <button className={`view-toggle-btn${viewMode === 'day' ? ' active' : ''}`} onClick={() => setViewMode('day')}>יומי</button>
        <button className={`view-toggle-btn${viewMode === 'week' ? ' active' : ''}`} onClick={() => setViewMode('week')}>שבועי</button>
      </div>

      <div className="week-nav">
        {viewMode === 'week' && (
          <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}><ChevronRight size={16} /></button>
        )}
        <span className="week-label">{week.weekLabel}</span>
        {viewMode === 'week' && (
          <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}><ChevronLeft size={16} /></button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={goToToday} style={{ fontSize: 12 }}>השבוע</button>
      </div>

      {weekId && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={copyFromPreviousWeek} disabled={copying}>
            <Copy size={14} /> {copying ? 'מעתיק...' : 'העתק מהשבוע שעבר'}
          </button>
        </div>
      )}

      {loading || itemsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 48 }} />)}
        </div>
      ) : loadError ? (
        <div className="empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-text">משהו השתבש בטעינת ההזמנה</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={loadWeek}>נסה שוב</button>
        </div>
      ) : !weekId ? (
        <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">ההזמנות לשבוע זה עדיין לא נפתחו</div></div>
      ) : viewMode === 'day' ? (
        <DayOrderView
          dayLabel={WEEK_DAYS[dayOffset].label}
          dateLabel={formatShortDate(selectedDate)}
          date={selectedDate}
          grouped={grouped}
          orderLines={orderLines}
          canEdit={canEdit[selectedDate]}
          lockAt={lockAtByDate[selectedDate]}
          saveStates={saveStates}
          onQtyChange={handleQtyChange}
          onPrevDay={prevDay}
          onNextDay={nextDay}
          dayTotal={dayTotal(selectedDate)}
        />
      ) : (
        <WeekSummaryView
          dayDate={week.dayDate}
          grouped={grouped}
          orderLines={orderLines}
          canEdit={canEdit}
          onSelectDay={offset => { setDayOffset(offset); setViewMode('day') }}
        />
      )}
    </div>
  )
}
