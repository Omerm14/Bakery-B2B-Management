import { useState } from 'react'
import { ChevronRight, ChevronLeft, ChevronDown, Star } from 'lucide-react'
import QtyStepper from './QtyStepper'
import CutoffCountdown from './CutoffCountdown'
import CutoffBlockedNotice from './CutoffBlockedNotice'
import SearchInput from '../../components/SearchInput'
import { displayCategoryLabel } from '../../constants/categories'

const FAVORITES_KEY = '__favorites__'

// Single-day, list-style order entry — the mobile-first default view.
// Day navigation is via the chevrons only (ChevronRight = previous,
// ChevronLeft = next, matching RTL reading order).
export default function DayOrderView({
  dayLabel, dateLabel, date, grouped, orderLines, canEdit, lockAt,
  onQtyChange, onToggleFavorite, onPrevDay, onNextDay, dayTotal,
}) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())

  function toggleCategory(cat) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  const searching = search.trim().length > 0
  const searchTerm = search.trim().toLowerCase()
  const visibleGroups = Object.entries(grouped)
    .map(([cat, items]) => [cat, searching ? items.filter(i => i.name_he.toLowerCase().includes(searchTerm)) : items])
    .filter(([, items]) => items.length > 0)

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

      <div style={{ marginBottom: 12 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="חיפוש פריט..." />
      </div>

      <div className="day-list">
        {visibleGroups.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <div className="empty-text">{searching ? 'לא נמצאו פריטים תואמים' : 'אין פריטים זמינים'}</div>
          </div>
        )}
        {visibleGroups.map(([cat, items]) => {
          const isCollapsed = !searching && collapsed.has(cat)
          return (
            <div key={cat} className="day-list-group">
              <button type="button" className="day-list-cat" onClick={() => toggleCategory(cat)}>
                <span>{cat === FAVORITES_KEY ? '⭐ מועדפים' : displayCategoryLabel(cat)}</span>
                <ChevronDown size={14} className={`day-list-cat-chevron${isCollapsed ? ' collapsed' : ''}`} />
              </button>
              {!isCollapsed && items.map(item => {
                const key = `${item.id}_${date}`
                const line = orderLines[key]
                const isAutoCopy = line?.change_reason === 'auto_copy'
                const isPending = !!line?.pending
                const isOneTime = line?.no_carry_forward === true
                return (
                  <div key={item.id} className="day-list-row">
                    <button
                      type="button"
                      className="day-list-fav-btn"
                      onClick={() => onToggleFavorite(item.id, item.is_favorite)}
                      aria-label={item.is_favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                    >
                      <Star size={16} fill={item.is_favorite ? 'var(--amber)' : 'none'} color={item.is_favorite ? 'var(--amber)' : 'var(--t3)'} />
                    </button>
                    <div className="day-list-item">
                      <div className="day-list-item-name">
                        {item.name_he}
                        {isAutoCopy && <span className="badge-autocopy">הועתק משבוע שעבר</span>}
                        {isPending && <span className="badge-pending">טרם נשלח</span>}
                        {isOneTime && <span className="badge-onetime">חד-פעמי</span>}
                      </div>
                      <div className="day-list-item-unit">
                        {item.unit}{item.price != null ? ` · ${item.price}₪` : ''}
                      </div>
                    </div>
                    <QtyStepper
                      value={line?.quantity || 0}
                      onChange={v => onQtyChange(item.id, date, v)}
                      disabled={!canEdit}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
