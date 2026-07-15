import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronLeft, LogOut, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCustomerWeek } from '../../hooks/useCustomerWeek'
import { useCustomerMenuItems } from '../../hooks/useCustomerMenuItems'
import { useBranding } from '../../hooks/useBranding'
import { useToast } from '../../context/ToastContext'
import { WEEK_DAYS, formatShortDate, dayDate, toLocalISODate } from '../../constants/days'
import { CATEGORY_ORDER } from '../../constants/categories'
import { isPortalHost } from '../../lib/host'
import DayOrderView from './DayOrderView'
import WeekSummaryView from './WeekSummaryView'
import SendOrderModal from '../../components/customer/SendOrderModal'
import InstallPrompt from '../../components/customer/InstallPrompt'
import flooryLogoOnDark from '../../assets/floory/logo-horizontal-ondark.png'
import { trackEvent } from '../../lib/posthog'

const FAVORITES_KEY = '__favorites__'

export default function CustomerOrders() {
  const toast = useToast()
  const week = useCustomerWeek()
  const { menuItems, loading: itemsLoading } = useCustomerMenuItems()
  const branding = useBranding()
  const [customer, setCustomer] = useState(null)
  const [weekId, setWeekId] = useState(null)
  // `${menuItemId}_${date}` -> { quantity, id?, pending? }. Last week's
  // amount is carried forward and written through immediately (silently,
  // same as the existing Wednesday auto-copy) — the customer never needs
  // to "confirm" an unchanged default. `pending: true` marks only a value
  // the customer has actually typed this session, which stays local-only
  // until שלח הזמנה sends it.
  const [orderLines, setOrderLines] = useState({})
  const [lockAtByDate, setLockAtByDate] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('floory_portal_view') || 'day')
  const [dayOffset, setDayOffset] = useState(() => new Date().getDay())
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  // null = modal closed; array (possibly empty) = show the post-send
  // confetti/summary modal with these changes.
  const [sendSummary, setSendSummary] = useState(null)
  // Optimistic overrides for is_favorite, keyed by menu_item_id — simpler
  // than threading a setter through useCustomerMenuItems, which owns the
  // base list. Merged over each item's server-fetched is_favorite.
  const [favoriteOverrides, setFavoriteOverrides] = useState({})

  useEffect(() => { localStorage.setItem('floory_portal_view', viewMode) }, [viewMode])

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

  // Registered only on the portal host — makes the app installable
  // (Android/Chrome's beforeinstallprompt requires a registered SW with a
  // fetch handler). The staff app never registers one.
  useEffect(() => {
    if (!isPortalHost || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('[CustomerOrders] service worker registration failed', err)
    })
  }, [])

  // Previous week's quantities (qty > 0 only), keyed by `${menuItemId}_${dayOffset}`
  // (0-6) rather than a date string, so the caller can shift it onto
  // whichever week is currently being viewed.
  const fetchPreviousWeekQtyByOffset = useCallback(async () => {
    if (!customer) return {}
    const prevWeekStart = new Date(week.weekStartISO)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekStartIso = toLocalISODate(prevWeekStart)

    const { data: prevWeekRow } = await supabase.from('weeks').select('id').eq('start_date', prevWeekStartIso).maybeSingle()
    if (!prevWeekRow) return {}

    const { data: prevLines } = await supabase
      .from('order_lines')
      .select('menu_item_id, delivery_date, quantity')
      .eq('week_id', prevWeekRow.id)
      .eq('customer_id', customer.id)
      .gt('quantity', 0)

    const dateToOffset = {}
    WEEK_DAYS.forEach(d => { dateToOffset[dayDate(prevWeekStart, d.key)] = d.key })

    const result = {}
    for (const l of prevLines || []) {
      const offset = dateToOffset[l.delivery_date]
      if (offset != null) result[`${l.menu_item_id}_${offset}`] = l.quantity
    }
    return result
  }, [customer, week.weekStartISO])

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

      const map = {}
      if (wid) {
        const { data: lines, error: linesError } = await supabase
          .from('order_lines')
          .select('id, menu_item_id, delivery_date, quantity, change_reason')
          .eq('week_id', wid)
          .eq('customer_id', customer.id)
        if (linesError) { setLoadError(true); toast.error('טעינת ההזמנה נכשלה — נסו שוב') }
        for (const l of lines || []) map[`${l.menu_item_id}_${l.delivery_date}`] = l

        // Carry last week's quantities into any cell with no real row yet
        // — written through immediately (same as the Wednesday auto-copy,
        // just triggered by a view instead of a schedule), not just shown
        // locally, so the customer never has to "confirm" a default that
        // hasn't changed. Only touches days still open for editing.
        const prevQtyByItemOffset = await fetchPreviousWeekQtyByOffset()
        const autoDefaults = []
        for (const item of menuItems) {
          for (const d of WEEK_DAYS) {
            const date = week.dayDate(d.key)
            // Use the lock times just fetched above directly — the
            // memoized `canEdit` in component scope reflects the PREVIOUS
            // render's lockAtByDate, not what this same load just computed.
            const lockAt = lockAts[date]
            const dateCanEdit = lockAt ? Date.now() < new Date(lockAt).getTime() : true
            if (!dateCanEdit) continue
            const key = `${item.id}_${date}`
            if (map[key]) continue
            const prevQty = prevQtyByItemOffset[`${item.id}_${d.key}`]
            if (!(prevQty > 0)) continue
            map[key] = { quantity: prevQty, change_reason: 'auto_copy' }
            autoDefaults.push({
              week_id: wid,
              customer_id: customer.id,
              menu_item_id: item.id,
              delivery_date: date,
              quantity: prevQty,
              source: 'manual',
              status: 'ok',
              change_reason: 'auto_copy',
              change_note: 'הועתק אוטומטית משבוע קודם בעת צפיית הלקוח',
              changed_by: customer.phone || customer.name,
              changed_via: 'customer_portal',
              updated_at: new Date().toISOString(),
            })
          }
        }
        if (autoDefaults.length) {
          const { error: defaultsErr } = await supabase
            .from('order_lines')
            .upsert(autoDefaults, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
          if (defaultsErr) {
            console.error('[CustomerOrders.loadWeek] auto-default write-through failed', defaultsErr)
          } else {
            // Same signal as a real send — the floor should know this
            // customer's week just got auto-filled, same as the Wednesday
            // rollover. `autoDefaults` only ever contains cells that had no
            // row yet (filtered above), so this never re-fires for cells
            // already written by a previous view.
            const { error: notifyErr } = await supabase
              .from('order_change_notifications')
              .insert({ customer_id: customer.id, week_id: wid })
            if (notifyErr) console.error('[CustomerOrders.loadWeek] auto-default notification insert failed', notifyErr)
          }
        }
      }

      setOrderLines(map)
    } finally {
      setLoading(false)
    }
  }, [customer, week.weekStartISO, menuItems, fetchPreviousWeekQtyByOffset])

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

  // Local-only edit — nothing is written to the database here. The value
  // just becomes part of this tab's draft until שלח הזמנה is pressed.
  // original_quantity is captured only on the FIRST edit of a cell (not
  // overwritten by further edits within the same session) so the eventual
  // send-confirmation summary can show what actually changed since the
  // last real send, not just since the previous keystroke.
  function handleQtyChange(menuItemId, date, rawValue) {
    if (!canEdit[date] || !customer) return
    const qty = Math.round(parseFloat(rawValue)) || 0
    const key = `${menuItemId}_${date}`
    setOrderLines(prev => {
      const existing = prev[key]
      const originalQuantity = existing?.pending ? existing.original_quantity : (existing?.quantity ?? 0)
      return { ...prev, [key]: { ...existing, quantity: qty, pending: true, original_quantity: originalQuantity } }
    })
  }

  // The one action that actually updates the real order for anything the
  // customer has genuinely touched this session — untouched defaults are
  // already real (loadWeek writes those through immediately), so this
  // only ever sends `pending` entries, not the whole week.
  async function sendOrder() {
    if (!customer || !weekId || sending) return

    setSending(true)
    try {
      let skippedLocked = 0
      const upserts = []
      const changes = []
      for (const [key, line] of Object.entries(orderLines)) {
        if (!line.pending) continue
        const [menuItemId, date] = key.split('_')
        if (canEdit[date] === false) { skippedLocked++; continue }
        upserts.push({
          week_id: weekId,
          customer_id: customer.id,
          menu_item_id: menuItemId,
          delivery_date: date,
          quantity: line.quantity,
          source: 'manual',
          status: 'ok',
          change_reason: 'customer_request',
          changed_by: customer.phone || customer.name,
          changed_via: 'customer_portal',
          updated_at: new Date().toISOString(),
        })
        const item = menuItems.find(i => i.id === menuItemId)
        if (line.quantity !== (line.original_quantity ?? 0)) {
          changes.push({
            itemName: item ? (item.name_he || item.name_en) : '—',
            dateLabel: formatShortDate(date),
            from: line.original_quantity ?? 0,
            to: line.quantity,
          })
        }
      }

      if (!upserts.length) {
        toast.info(skippedLocked > 0 ? 'כל הימים הרלוונטיים נעולים לעדכון' : 'אין שינויים לשליחה')
        return
      }

      const { error } = await supabase
        .from('order_lines')
        .upsert(upserts, { onConflict: 'week_id,customer_id,menu_item_id,delivery_date' })
      if (error) throw error

      const { error: notifyErr } = await supabase
        .from('order_change_notifications')
        .insert({ customer_id: customer.id, week_id: weekId })
      if (notifyErr) console.error('[CustomerOrders.sendOrder] notification insert failed', notifyErr)

      await loadWeek()
      setSendSummary(changes)
      toast.success(skippedLocked > 0 ? `ההזמנה נשלחה — ${skippedLocked} ימים נעולים לא עודכנו` : 'ההזמנה נשלחה בהצלחה')
      trackEvent('order_submitted', { items_changed: changes.length, lines_submitted: upserts.length, skipped_locked: skippedLocked })
    } catch (err) {
      console.error('[CustomerOrders.sendOrder]', err)
      toast.error('שליחת ההזמנה נכשלה — נסו שוב')
      trackEvent('order_submit_failed')
    } finally {
      setSending(false)
    }
  }

  // Optimistic insert/delete on customer_favorite_items — RLS restricts
  // both to rows owned by this customer (see migration 040).
  async function toggleFavorite(menuItemId, currentlyFavorite) {
    if (!customer) return
    const next = !currentlyFavorite
    setFavoriteOverrides(prev => ({ ...prev, [menuItemId]: next }))
    const { error } = next
      ? await supabase.from('customer_favorite_items').insert({ customer_id: customer.id, menu_item_id: menuItemId })
      : await supabase.from('customer_favorite_items').delete().eq('customer_id', customer.id).eq('menu_item_id', menuItemId)
    if (error) {
      console.error('[CustomerOrders.toggleFavorite]', error)
      setFavoriteOverrides(prev => ({ ...prev, [menuItemId]: currentlyFavorite }))
      toast.error('עדכון המועדפים נכשל')
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

  // Ordered-bucket grouping (same pattern as Weekly.jsx's groupRows()):
  // favorited items are pinned into their own bucket first — moved there
  // instead of their normal category, never duplicated — then
  // CATEGORY_ORDER buckets in order, then any leftover categories
  // alphabetically.
  const grouped = (() => {
    const buckets = {}
    for (const item of menuItems) {
      const isFavorite = favoriteOverrides[item.id] ?? item.is_favorite ?? false
      const key = isFavorite ? FAVORITES_KEY : (item.category || 'כללי')
      if (!buckets[key]) buckets[key] = []
      buckets[key].push({ ...item, is_favorite: isFavorite })
    }
    const result = {}
    if (buckets[FAVORITES_KEY]?.length) result[FAVORITES_KEY] = buckets[FAVORITES_KEY]
    for (const k of CATEGORY_ORDER) if (buckets[k]?.length) result[k] = buckets[k]
    const rest = Object.keys(buckets).filter(k => k !== FAVORITES_KEY && !CATEGORY_ORDER.includes(k)).sort((a, b) => a.localeCompare(b, 'he'))
    for (const k of rest) result[k] = buckets[k]
    return result
  })()

  const selectedDate = week.dayDate(dayOffset)

  return (
    <div className="page portal-page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <img src={flooryLogoOnDark} alt="Floory" style={{ height: 34, width: 'auto' }} />
        {branding.logo_url && (
          <img src={branding.logo_url} alt={branding.business_name || ''} style={{ height: 34, maxWidth: 150, objectFit: 'contain' }} />
        )}
      </div>

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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={sendOrder} disabled={sending}>
            <Send size={14} /> {sending ? 'שולח...' : 'שלח הזמנה'}
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
          onQtyChange={handleQtyChange}
          onToggleFavorite={toggleFavorite}
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

      {sendSummary && <SendOrderModal changes={sendSummary} onClose={() => setSendSummary(null)} />}
      <InstallPrompt />
    </div>
  )
}
