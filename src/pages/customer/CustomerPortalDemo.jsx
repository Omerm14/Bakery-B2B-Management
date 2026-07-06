import { useState, useMemo } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { WEEK_DAYS, weekStart, dayDate, formatWeekLabel, formatShortDate } from '../../constants/days'
import QtyStepper from './QtyStepper'
import CutoffCountdown from './CutoffCountdown'
import WeekSummaryView from './WeekSummaryView'

// Standalone design preview of the customer portal — phone+PIN login ->
// day/week order views — using only local component state and static mock
// data. Makes zero Supabase/Edge Function calls, so it works today even
// before any migrations are run. Reuses the real QtyStepper/
// CutoffCountdown/WeekSummaryView (all pure, prop-driven, no network calls
// of their own) for visual parity with the live portal, but does NOT
// reuse CustomerOrders/DayOrderView/CutoffBlockedNotice — those fetch
// real session/config data from Supabase, which would break the
// zero-network guarantee this preview depends on.

const MOCK_ITEMS = [
  { id: 'm1', category: 'מאפים', name_he: 'קרואסון חמאה', unit: 'יח׳' },
  { id: 'm2', category: 'מאפים', name_he: 'מאפין בלוברי', unit: 'יח׳' },
  { id: 'm3', category: 'מאפים', name_he: 'רוגלך שוקולד', unit: 'יח׳' },
  { id: 'm4', category: 'לחם', name_he: 'לחם שיפון', unit: 'יח׳' },
  { id: 'm5', category: 'לחם', name_he: 'בגט צרפתי', unit: 'יח׳' },
]

const START = weekStart()
const LOCKED_DAY_OFFSETS = new Set([5, 6]) // Fri/Sat locked, for the preview

function dateKey(itemId, offset) { return `${itemId}_${dayDate(START, offset)}` }

const MOCK_STARTING_QTY = {
  [dateKey('m1', 0)]: 12,
  [dateKey('m1', 1)]: 12,
  [dateKey('m4', 0)]: 3,
}

function PreviewBanner() {
  return (
    <div style={{
      background: 'var(--amber-tint)', border: '1px solid var(--amber-bdr)', color: 'var(--amber)',
      borderRadius: 'var(--rs)', padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600,
      textAlign: 'center', direction: 'rtl',
    }}>
      🔍 תצוגה מקדימה — אין חיבור לנתונים אמיתיים
    </div>
  )
}

function MockCutoffNotice() {
  return (
    <div className="alert alert-warn" style={{ direction: 'rtl' }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>מועד השינוי חלף</div>
        <div style={{ fontSize: 13 }}>לא ניתן לבצע שינוי בשעה זו. יש לפנות לעמית בטלפון או בקבוצת הוואטסאפ.</div>
      </div>
    </div>
  )
}

export default function CustomerPortalDemo() {
  const [step, setStep] = useState('login')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [viewMode, setViewMode] = useState('day')
  const [dayOffset, setDayOffset] = useState(() => new Date().getDay())
  const [qty, setQty] = useState(MOCK_STARTING_QTY)

  const grouped = MOCK_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const orderLines = useMemo(() => {
    const map = {}
    for (const key in qty) map[key] = { quantity: qty[key] }
    return map
  }, [qty])

  const canEdit = useMemo(() => {
    const map = {}
    WEEK_DAYS.forEach(d => { map[dayDate(START, d.key)] = !LOCKED_DAY_OFFSETS.has(d.key) })
    return map
  }, [])

  function handleQtyChange(itemId, date, rawValue) {
    setQty(prev => ({ ...prev, [`${itemId}_${date}`]: parseFloat(rawValue) || 0 }))
  }

  function nextDay() { setDayOffset(o => (o + 1) % 7) }
  function prevDay() { setDayOffset(o => (o + 6) % 7) }

  if (step === 'login') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <PreviewBanner />
          <div className="card" style={{ direction: 'rtl' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>כניסה להזמנות</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>הזן את מספר הטלפון וקוד הגישה שקיבלת.</div>
            <label className="lbl">מספר טלפון</label>
            <input className="input" dir="ltr" placeholder="050-1234567" value={phone} onChange={e => setPhone(e.target.value)} autoFocus />
            <label className="lbl" style={{ marginTop: 12 }}>קוד גישה</label>
            <input className="input" dir="ltr" type="password" placeholder="קוד הגישה שקיבלת" value={pin} onChange={e => setPin(e.target.value)} />
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setStep('orders')}>
              כניסה
            </button>
          </div>
        </div>
      </div>
    )
  }

  const selectedDate = dayDate(START, dayOffset)
  const dayEditable = canEdit[selectedDate]
  const mockLockAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  const dayTotal = MOCK_ITEMS.reduce((sum, item) => sum + (orderLines[`${item.id}_${selectedDate}`]?.quantity || 0), 0)

  return (
    <div className="page portal-page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <PreviewBanner />
      <div className="page-header">
        <h1 className="page-title">הזמנות — קפה לואיז (דמו)</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setStep('login')}>יציאה</button>
      </div>

      <div className="view-toggle">
        <button className={`view-toggle-btn${viewMode === 'day' ? ' active' : ''}`} onClick={() => setViewMode('day')}>יומי</button>
        <button className={`view-toggle-btn${viewMode === 'week' ? ' active' : ''}`} onClick={() => setViewMode('week')}>שבועי</button>
      </div>

      <div className="week-nav">
        <span className="week-label">{formatWeekLabel(START)}</span>
      </div>

      {viewMode === 'day' ? (
        <div>
          <div className="day-nav">
            <button className="btn btn-ghost btn-sm day-nav-btn" onClick={prevDay} aria-label="יום קודם"><ChevronRight size={18} /></button>
            <div className="day-nav-label">
              <div className="day-nav-day">{WEEK_DAYS[dayOffset].label}</div>
              <div className="day-nav-date">{formatShortDate(selectedDate)}</div>
            </div>
            <button className="btn btn-ghost btn-sm day-nav-btn" onClick={nextDay} aria-label="יום הבא"><ChevronLeft size={18} /></button>
          </div>

          <div className="day-status-row">
            {dayEditable && <CutoffCountdown lockAt={mockLockAt} />}
            {dayTotal > 0 && <span className="day-total-pill">סה״כ היום: {dayTotal}</span>}
          </div>

          {!dayEditable && <MockCutoffNotice />}

          <div className="day-list">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="day-list-group">
                <div className="day-list-cat">{cat}</div>
                {items.map(item => {
                  const key = `${item.id}_${selectedDate}`
                  return (
                    <div key={item.id} className="day-list-row">
                      <div className="day-list-item">
                        <div className="day-list-item-name">{item.name_he}</div>
                        <div className="day-list-item-unit">{item.unit}</div>
                      </div>
                      <QtyStepper
                        value={orderLines[key]?.quantity || 0}
                        onChange={v => handleQtyChange(item.id, selectedDate, v)}
                        disabled={!dayEditable}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <WeekSummaryView
          dayDate={offset => dayDate(START, offset)}
          grouped={grouped}
          orderLines={orderLines}
          canEdit={canEdit}
          onSelectDay={offset => { setDayOffset(offset); setViewMode('day') }}
        />
      )}
    </div>
  )
}
