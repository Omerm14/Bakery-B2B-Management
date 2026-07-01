export const WEEK_DAYS = [
  { key: 0, label: 'ראשון', short: 'א׳' },
  { key: 1, label: 'שני',   short: 'ב׳' },
  { key: 2, label: 'שלישי', short: 'ג׳' },
  { key: 3, label: 'רביעי', short: 'ד׳' },
  { key: 4, label: 'חמישי', short: 'ה׳' },
  { key: 5, label: 'שישי',  short: 'ו׳' },
]

// Returns Sunday of the week containing `date`
export function weekStart(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

// Returns ISO date string (YYYY-MM-DD) for day offset from a week-start date
export function dayDate(weekStartDate, dayOffset) {
  const d = new Date(weekStartDate)
  d.setDate(d.getDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

export function formatWeekLabel(weekStartDate) {
  const d = new Date(weekStartDate)
  const end = new Date(d)
  end.setDate(d.getDate() + 5)
  const fmt = (dt) => dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  return `${fmt(d)} – ${fmt(end)}`
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10)
}
