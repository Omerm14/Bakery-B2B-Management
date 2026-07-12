export const WEEK_DAYS = [
  { key: 0, label: 'ראשון', short: 'א׳', short_en: 'Sun' },
  { key: 1, label: 'שני',   short: 'ב׳', short_en: 'Mon' },
  { key: 2, label: 'שלישי', short: 'ג׳', short_en: 'Tue' },
  { key: 3, label: 'רביעי', short: 'ד׳', short_en: 'Wed' },
  { key: 4, label: 'חמישי', short: 'ה׳', short_en: 'Thu' },
  { key: 5, label: 'שישי',  short: 'ו׳', short_en: 'Fri' },
  { key: 6, label: 'שבת',   short: 'ש׳', short_en: 'Sat' },
]

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

// Formats a YYYY-MM-DD string as DD/MM — deliberately day-first: Israeli/
// Hebrew convention reads dates as DD/MM, not the US-style MM/DD. Slicing
// the string directly (no Date object) avoids any timezone risk entirely.
export function formatShortDate(isoDate) {
  const [, m, d] = isoDate.split('-')
  return `${d}/${m}`
}

// Weekday name for a YYYY-MM-DD string. Built from explicit y/m/d fields
// (not `new Date(isoString)`, which parses as UTC and can shift the day
// backward in timezones ahead of UTC) so the result always matches the
// calendar date, not whatever local midnight happens to be in UTC.
export function weekdayLabel(isoDate, lang = 'he') {
  const [y, m, d] = isoDate.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return lang === 'en' ? WEEK_DAYS[day].short_en : WEEK_DAYS[day].label
}
