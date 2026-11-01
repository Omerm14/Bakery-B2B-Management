// Pure helpers for the waste log page (src/pages/Waste.jsx). Kept free of
// React and Supabase so they can be unit-tested with node --test.

export const WASTE_UNITS = ['units', 'kg']

// Catalog units are free-form Hebrew strings ('יח׳', 'ק״ג', 'גרם', ...).
// Only kilograms map to the kg toggle; everything else is counted in units.
const KG_SPELLINGS = new Set(['ק״ג', 'ק"ג', 'קג', 'קילו', 'kg'])
export function unitFromMenuUnit(menuUnit) {
  return KG_SPELLINGS.has(String(menuUnit || '').trim().toLowerCase()) ? 'kg' : 'units'
}

export function round2(n) {
  return Math.round(n * 100) / 100
}

// Parses what's in the quantity box. Units are whole numbers; kilograms keep
// up to two decimals. Returns null for anything that isn't a positive amount.
export function parseQty(raw, unit) {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const v = unit === 'units' ? Math.round(n) : round2(n)
  return v > 0 ? v : null
}

// +/- buttons: 1 per press for units, half a kilo for kg. Never below zero.
export function stepQty(raw, unit, dir) {
  const step = unit === 'kg' ? 0.5 : 1
  const n = parseFloat(String(raw ?? '').replace(',', '.'))
  const next = round2((Number.isFinite(n) ? n : 0) + dir * step)
  return next < 0 ? 0 : next
}

export function unitLabel(unit, t) {
  return unit === 'kg' ? t('waste.unitKg') : t('waste.unitUnits')
}

export function formatQty(qty, unit, t, locale) {
  return `${Number(qty).toLocaleString(locale)} ${unitLabel(unit, t)}`
}

// "8 יח׳ · 2.5 ק״ג" — units and kilograms are never added together.
export function formatTotals(rows, t, locale) {
  let units = 0
  let kg = 0
  for (const r of rows) {
    if (r.unit === 'kg') kg += Number(r.quantity)
    else units += Number(r.quantity)
  }
  const parts = []
  if (units) parts.push(formatQty(units, 'units', t, locale))
  if (kg) parts.push(formatQty(round2(kg), 'kg', t, locale))
  return parts.length ? parts.join(' · ') : '—'
}

// Rows → [{ date, rows }] newest day first, rows within a day newest first.
export function groupByDate(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.waste_date === b.waste_date
      ? String(b.created_at || '').localeCompare(String(a.created_at || ''))
      : a.waste_date < b.waste_date ? 1 : -1)
  const groups = []
  for (const r of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.date === r.waste_date) last.rows.push(r)
    else groups.push({ date: r.waste_date, rows: [r] })
  }
  return groups
}

// Client-side text filter over item name and reason.
export function matchesText(row, text) {
  const q = String(text || '').trim().toLowerCase()
  if (!q) return true
  return String(row.item_name || '').toLowerCase().includes(q)
    || String(row.reason || '').toLowerCase().includes(q)
}
