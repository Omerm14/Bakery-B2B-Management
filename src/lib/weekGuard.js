// An order line belongs to exactly one week: its delivery_date must fall
// between the week's Sunday and Saturday (enforced in the DB by migration
// 070). Save paths filter with this before writing, so a draft that outlived
// a week switch can never be stored under the wrong week again.
//
// Plain 'YYYY-MM-DD' strings compare correctly as text, and the end date is
// computed in UTC so the browser's time zone can't shift it.
export function weekEndISO(weekStartISO) {
  const [y, m, d] = weekStartISO.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d + 6))
  return end.toISOString().slice(0, 10)
}

export function isDateInWeek(dateISO, weekStartISO) {
  if (!dateISO || !weekStartISO) return false
  return dateISO >= weekStartISO && dateISO <= weekEndISO(weekStartISO)
}

// 'YYYY-MM-DD' + n days, in UTC so the browser's time zone can't shift it
// (new Date('YYYY-MM-DD') is UTC midnight, so mixing it with local-time
// setDate/getDate moves the date by a day west of UTC).
export function addDaysISO(dateISO, n) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
