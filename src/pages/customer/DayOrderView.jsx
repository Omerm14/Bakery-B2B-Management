import { useRef } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import QtyStepper from './QtyStepper'
import CutoffCountdown from './CutoffCountdown'
import CutoffBlockedNotice from './CutoffBlockedNotice'

const SWIPE_THRESHOLD = 50

// Single-day, list-style order entry — the mobile-first default view.
// Swiping the list left/right (or tapping the arrows) moves a day at a
// time, mirroring how the week-nav chevrons already work elsewhere in the
// app (ChevronRight = previous, ChevronLeft = next, matching RTL reading
// order).
export default function DayOrderView({
  dayLabel, dateLabel, date, grouped, orderLines, canEdit, lockAt,
  saveStates, onQtyChange, onPrevDay, onNextDay, dayTotal,
}) {
  const touchStartX = useRef(null)

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < SWIPE_THRESHOLD) return
    if (dx < 0) onNextDay(); else onPrevDay()
  }

  return (
    <div>
      <div className="day-nav">
        <button className="btn btn-ghost btn-sm day-nav-btn" onClick={onPrevDay} aria-label="יום קודם">
          <ChevronRight size={18} />
        </button>
        <div className="day-nav-label">
          <div className="day-nav-day">{dayLabel}</div>
          <div className="day-nav-date">{dateLabel}</div>
        </div>
        <button className="btn btn-ghost btn-sm day-nav-btn" onClick={onNextDay} aria-label="יום הבא">
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="day-status-row">
        {canEdit && <CutoffCountdown lockAt={lockAt} />}
        {dayTotal > 0 && <span className="day-total-pill">סה״כ היום: {dayTotal}</span>}
      </div>

      {!canEdit && <CutoffBlockedNotice />}

      <div className="day-list" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {Object.keys(grouped).length === 0 && (
          <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">אין פריטים זמינים</div></div>
        )}
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="day-list-group">
            <div className="day-list-cat">{cat}</div>
            {items.map(item => {
              const key = `${item.id}_${date}`
              const line = orderLines[key]
              const isAutoCopy = line?.change_reason === 'auto_copy'
              return (
                <div key={item.id} className="day-list-row">
                  <div className="day-list-item">
                    <div className="day-list-item-name">
                      {item.name_he}
                      {isAutoCopy && <span className="badge-autocopy">הועתק משבוע שעבר</span>}
                    </div>
                    <div className="day-list-item-unit">
                      {item.unit}{item.price != null ? ` · ${item.price}₪` : ''}
                    </div>
                  </div>
                  <QtyStepper
                    value={line?.quantity || 0}
                    onChange={v => onQtyChange(item.id, date, v)}
                    disabled={!canEdit}
                    saveState={saveStates[key]}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
