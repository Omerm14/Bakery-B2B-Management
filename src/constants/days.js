export const WEEK_DAYS = [
  { key: 0, label: 'ראשון', short: 'א׳' },
  { key: 1, label: 'שני',   short: 'ב׳' },
  { key: 2, label: 'שלישי', short: 'ג׳' },
  { key: 3, label: 'רביעי', short: 'ד׳' },
  { key: 4, label: 'חמישי', short: 'ה׳' },
  { key: 5, label: 'שישי',  short: 'ו׳' },
  { key: 6, label: 'שבת',   short: 'ש׳' },
]

// Returns Sunday of the week containing `date`
export function weekStart(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

// Formats a Date by its LOCAL calendar fields (Y/M/D) — NOT `.toISOString()`,
// which converts to UTC first and silently shifts the date back a day
// whenever the local timezone is ahead of UTC (e.g. Israel) for any Date
// representing local midnight. Use this everywhere a local Date needs to
// become a plain SQL date string.
export function toLocalISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Returns ISO date string (YYYY-MM-DD) for day offset from a week-start date
export function dayDate(weekStartDate, dayOffset) {
  const d = new Date(weekStartDate)
  d.setDate(d.getDate() + dayOffset)
  return toLocalISODate(d)
}

export function formatWeekLabel(weekStartDate) {
  const d = new Date(weekStartDate)
  const end = new Date(d)
  end.setDate(d.getDate() + 6)
  const fmt = (dt) => dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  const fmtEnd = (dt) => dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
  return `${fmt(d)} – ${fmtEnd(end)}`
}

export function isoToday() {
  return toLocalISODate(new Date())
}
