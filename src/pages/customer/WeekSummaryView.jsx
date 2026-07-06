import { WEEK_DAYS, formatShortDate } from '../../constants/days'

// Read-only weekly overview — a stack of day cards, not an editable grid.
// A 7-column table never reads well on a phone (small touch targets,
// forced horizontal scroll), so this view is purely for "what's ordered
// this week at a glance" — tapping a card jumps into the day view, which
// is the only place editing happens.
export default function WeekSummaryView({ dayDate, grouped, orderLines, canEdit, onSelectDay }) {
  const items = Object.values(grouped).flat()

  return (
    <div className="week-card-list">
      {WEEK_DAYS.map(d => {
        const date = dayDate(d.key)
        const locked = canEdit[date] === false
        const activeItems = items.filter(item => (orderLines[`${item.id}_${date}`]?.quantity || 0) > 0)
        const total = activeItems.reduce((sum, item) => sum + (orderLines[`${item.id}_${date}`]?.quantity || 0), 0)
        const hasPending = activeItems.some(item => orderLines[`${item.id}_${date}`]?.pending)

        return (
          <button key={d.key} type="button" className="week-day-card" onClick={() => onSelectDay(d.key)}>
            <div className="week-day-card-hdr">
              <div>
                <div className="week-day-card-label">
                  {d.label}{locked && ' 🔒'}
                  {hasPending && <span className="badge-pending" style={{ marginInlineStart: 6 }}>טרם נשלח</span>}
                </div>
                <div className="week-day-card-date">{formatShortDate(date)}</div>
              </div>
              {total > 0 && <div className="week-day-card-total">{total}</div>}
            </div>
            {activeItems.length === 0 ? (
              <div className="week-day-card-empty">אין הזמנה</div>
            ) : (
              <div className="week-day-card-items">
                {activeItems.map(item => (
                  <span key={item.id} className="week-day-card-item">
                    {item.name_he} ×{orderLines[`${item.id}_${date}`].quantity}
                  </span>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
