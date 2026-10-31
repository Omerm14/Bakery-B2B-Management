// Customer summary image for the Telegram bot ("סיכום על לקוח X"), drawn
// as an SVG in the same visual language as the weekly report and rendered
// to PNG by index.ts. Pure functions, unit-tested under Node (card.test.js).
//
// `r` is the jsonb from bot_customer_report() (migration 067).
import { C, num, fmtInt, pctChange, ddmm, ddmmyyyy, text, card, delta } from '../owner-weekly-report/render.js'

const W = 1080
const R = W - 60
const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']
const CAT_COLORS = [C.acc, '#5AA9E6', C.amber, '#B48CE8', '#E87AA4', '#7FD1C7', C.t3]

// Quantities can be fractional (kg); whole numbers get thousands separators.
export const fmtQty = v => (Number.isInteger(num(v)) ? fmtInt(v) : num(v).toLocaleString('en-US', { maximumFractionDigits: 1 }))

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = iso => new Date(`${iso}T00:00:00Z`).getUTCDay()
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

export function truncate(str, max) {
  const s = String(str ?? '')
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

export function periodLabel(r) {
  return r.from === r.to ? ddmmyyyy(r.from) : `${ddmmyyyy(r.from)} – ${ddmmyyyy(r.to)}`
}

// Bars for the chart: one per day up to two weeks, one per week (starting
// Sunday) up to ~4 months, otherwise one per month. Missing days count as 0.
export function chartBuckets(r) {
  const span = daysBetween(r.from, r.to) + 1
  const byDate = new Map((r.days ?? []).map(d => [String(d.date), num(d.units)]))
  const buckets = []
  if (span <= 14) {
    for (let i = 0; i < span; i++) {
      const iso = addDays(r.from, i)
      buckets.push({ label: DAY_LETTERS[dow(iso)], sub: ddmm(iso), units: byDate.get(iso) ?? 0 })
    }
    return { unit: 'day', buckets }
  }
  if (span <= 120) {
    let start = addDays(r.from, -dow(r.from))
    while (start <= r.to) {
      let units = 0
      for (let i = 0; i < 7; i++) units += byDate.get(addDays(start, i)) ?? 0
      buckets.push({ label: ddmm(start < r.from ? r.from : start), sub: '', units })
      start = addDays(start, 7)
    }
    return { unit: 'week', buckets }
  }
  const months = new Map()
  for (const [iso, units] of byDate) {
    const key = iso.slice(0, 7)
    months.set(key, (months.get(key) ?? 0) + units)
  }
  let key = r.from.slice(0, 7)
  while (key <= r.to.slice(0, 7)) {
    const [y, m] = key.split('-').map(Number)
    buckets.push({ label: MONTHS[m - 1], sub: String(y).slice(2), units: months.get(key) ?? 0 })
    key = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return { unit: 'month', buckets }
}

// One plain-language line under the customer's name, from the numbers only.
export function subtitle(r) {
  const units = num(r.total_units)
  if (units === 0) return 'לא היו הזמנות בתקופה הזו.'
  const days = num(r.order_days)
  let s = `${fmtQty(units)} יחידות ב${days === 1 ? 'יום אספקה אחד' : `-${days} ימי אספקה`}`
  const pct = pctChange(units, r.prev?.total_units)
  if (pct === null) s += ', אין הזמנות בתקופה הקודמת להשוואה.'
  else if (Math.abs(pct) < 3) s += ', בדומה לתקופה הקודמת.'
  else s += `, ${pct > 0 ? 'עלייה' : 'ירידה'} של ${Math.abs(pct)}% לעומת התקופה הקודמת.`
  return s
}

export function cardCaption(r) {
  const pct = pctChange(r.total_units, r.prev?.total_units)
  return `🧾 ${r.customer?.name ?? ''} · ${periodLabel(r).replace(/\./g, '/')}\n`
    + `${fmtQty(r.total_units)} יח׳${pct === null ? '' : ` (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)`}`
    + ` · ${num(r.order_days)} ימי אספקה · ${num(r.distinct_items)} מוצרים`
}

const MAX_ITEMS = 10

export function buildCustomerCardSvg(r) {
  const parts = []
  const brand = r.business_name ? `${r.business_name} · סיכום לקוח` : 'סיכום לקוח'
  const units = num(r.total_units)
  const { unit: bucketUnit, buckets } = chartBuckets(r)
  const showChart = buckets.length > 1 && units > 0
  const items = (r.items ?? []).filter(i => num(i.qty) > 0).slice(0, MAX_ITEMS)
  const moreItems = (r.items ?? []).filter(i => num(i.qty) > 0).length - items.length
  const cats = (r.categories ?? []).filter(c => num(c.qty) > 0)

  let y = 0
  // Header
  parts.push(text(R, 92, brand, { size: 27, weight: 700, fill: C.t2 }))
  const pill = periodLabel(r)
  parts.push(`<rect x="60" y="58" width="${pill.length * 14 + 40}" height="48" rx="24" fill="none" stroke="#2A3430"/>`)
  parts.push(text(80, 90, pill, { size: 22, weight: 700, fill: C.t3, anchor: 'start', family: 'Spline Sans Mono', rtl: false }))
  parts.push(text(R, 196, truncate(r.customer?.name, 26), { size: 64, weight: 800 }))
  parts.push(text(R, 248, subtitle(r), { size: 28, fill: C.t2 }))
  y = 290

  // KPI tiles
  const prev = r.prev ?? {}
  const hasValue = r.total_value !== null && r.total_value !== undefined
  const tiles = [
    { label: 'יחידות', value: fmtQty(units), d: [pctChange(units, prev.total_units), {}] },
    { label: 'ימי אספקה', value: String(num(r.order_days)), d: [num(r.order_days) - num(prev.order_days), { suffix: '' }] },
    { label: 'מוצרים שונים', value: String(num(r.distinct_items)), d: [null, { label: ' ' }] },
    hasValue
      ? { label: 'שווי בש״ח', value: fmtInt(r.total_value), d: [pctChange(r.total_value, prev.total_value), {}] }
      : { label: 'ממוצע ליום', value: num(r.order_days) ? fmtQty(Math.round(units / num(r.order_days))) : '0', d: [null, { label: ' ' }] },
  ]
  const tw = 228, tg = 16
  tiles.forEach((t, i) => {
    const x = R - (i + 1) * tw - i * tg
    parts.push(card(x, y, tw, 160))
    parts.push(text(x + tw - 22, y + 42, t.label, { size: 21, weight: 600, fill: C.t3 }))
    parts.push(text(x + tw - 22, y + 106, t.value, { size: t.value.length > 6 ? 40 : 50, weight: 700, family: 'Spline Sans Mono', rtl: false }))
    parts.push(delta(x + tw - 22, y + 140, t.d[0], t.d[1]))
  })
  y += 160 + 20

  // Units over time, earliest on the right.
  if (showChart) {
    const ch = 400
    parts.push(card(60, y, W - 120, ch))
    const chartTitle = { day: 'יחידות לפי יום', week: 'יחידות לפי שבוע', month: 'יחידות לפי חודש' }[bucketUnit]
    parts.push(text(R - 30, y + 52, chartTitle, { size: 27, weight: 700, fill: C.t2 }))
    const max = Math.max(1, ...buckets.map(b => b.units))
    const baseY = y + ch - (buckets.some(b => b.sub) ? 84 : 64), plotH = 230
    const slot = (W - 120 - 80) / buckets.length
    const bw = Math.min(54, slot * 0.6)
    parts.push(`<line x1="100" y1="${baseY}" x2="${W - 100}" y2="${baseY}" stroke="${C.grid}" stroke-width="2"/>`)
    buckets.forEach((b, i) => {
      const center = W - 100 - slot * i - slot / 2
      const h = (b.units / max) * plotH
      if (h > 0) {
        parts.push(`<rect x="${center - bw / 2}" y="${baseY - h}" width="${bw}" height="${h}" rx="${Math.min(9, bw / 3)}" fill="${C.acc}"/>`)
        if (buckets.length <= 16) {
          parts.push(text(center, baseY - h - 12, fmtQty(b.units), { size: 18, weight: 700, fill: C.t2, anchor: 'middle', family: 'Spline Sans Mono', rtl: false }))
        }
      }
      const small = buckets.length > 9
      parts.push(text(center, baseY + 36, b.label, { size: small ? 17 : 22, weight: 600, fill: b.units ? C.t2 : C.t3, anchor: 'middle', rtl: !/^\d/.test(b.label), family: /^\d/.test(b.label) ? 'Spline Sans Mono' : 'Assistant' }))
      if (b.sub) parts.push(text(center, baseY + 62, b.sub, { size: small ? 14 : 17, weight: 700, fill: C.t3, anchor: 'middle', family: 'Spline Sans Mono', rtl: false }))
    })
    y += ch + 20
  }

  // Products, biggest first, with a bar and the change from the previous period.
  const rowH = 58
  const listH = 92 + Math.max(1, items.length) * rowH + (moreItems > 0 ? 40 : 0) + (cats.length > 1 ? 120 : 10)
  parts.push(card(60, y, W - 120, listH))
  parts.push(text(R - 30, y + 52, 'מה הוזמן', { size: 27, weight: 700, fill: C.t2 }))
  parts.push(text(100, y + 52, 'מול התקופה הקודמת', { size: 19, weight: 600, fill: C.t3, anchor: 'start' }))
  if (items.length === 0) parts.push(text(R - 30, y + 120, 'אין מוצרים בתקופה הזו', { size: 24, fill: C.t3 }))
  const maxQty = Math.max(1, ...items.map(i => num(i.qty)))
  const nameRight = R - 30, barRight = R - 380, barMaxW = barRight - 330
  items.forEach((it, i) => {
    const ry = y + 112 + i * rowH
    if (i > 0) parts.push(`<line x1="100" y1="${ry - 36}" x2="${R - 30}" y2="${ry - 36}" stroke="${C.bdr}"/>`)
    parts.push(text(nameRight, ry, truncate(it.name, 20), { size: 24, weight: 600 }))
    const bwid = Math.max(6, (num(it.qty) / maxQty) * barMaxW)
    parts.push(`<rect x="${barRight - bwid}" y="${ry - 20}" width="${bwid}" height="22" rx="7" fill="${C.acc}" fill-opacity="${0.35 + 0.65 * (num(it.qty) / maxQty)}"/>`)
    const unit = it.unit && it.unit !== 'יח׳' ? ` ${it.unit}` : ''
    parts.push(text(barRight - bwid - 14, ry, fmtQty(it.qty) + unit, { size: 22, weight: 700, fill: C.t1, family: unit ? 'Assistant' : 'Spline Sans Mono', rtl: !!unit }))
    const pct = pctChange(it.qty, it.prev_qty)
    parts.push(delta(200, ry, pct, pct === null ? { label: 'חדש' } : {}))
  })
  let ly = y + 112 + Math.max(1, items.length) * rowH - 20
  if (moreItems > 0) {
    parts.push(text(R - 30, ly + 22, `ועוד ${moreItems} מוצרים`, { size: 21, fill: C.t3 }))
    ly += 40
  }

  // Category split as one stacked bar with a legend.
  if (cats.length > 1) {
    const total = cats.reduce((a, c) => a + num(c.qty), 0) || 1
    const barY = ly + 30, barW = W - 200
    let x = R - 40
    const shown = cats.slice(0, CAT_COLORS.length - 1)
    const rest = cats.slice(CAT_COLORS.length - 1).reduce((a, c) => a + num(c.qty), 0)
    const segs = rest > 0 ? [...shown, { category: 'אחר', qty: rest }] : shown
    parts.push(`<clipPath id="catclip"><rect x="${R - 40 - barW}" y="${barY}" width="${barW}" height="18" rx="9"/></clipPath><g clip-path="url(#catclip)">`)
    segs.forEach((c, i) => {
      const w = (num(c.qty) / total) * barW
      parts.push(`<rect x="${x - w}" y="${barY}" width="${w}" height="18" fill="${CAT_COLORS[i % CAT_COLORS.length]}"/>`)
      x -= w
    })
    parts.push('</g>')
    let lx = R - 40
    segs.slice(0, 5).forEach((c, i) => {
      const label = `${truncate(c.category, 12)} ${Math.round((num(c.qty) * 100) / total)}%`
      parts.push(`<rect x="${lx - 14}" y="${barY + 44}" width="14" height="14" rx="4" fill="${CAT_COLORS[i % CAT_COLORS.length]}"/>`)
      parts.push(text(lx - 22, barY + 57, label, { size: 19, weight: 600, fill: C.t2 }))
      lx -= label.length * 10 + 60
    })
  }
  y += listH

  const H = y + 70
  parts.push(text(R, H - 30, 'נשלח לבקשה מהבוט', { size: 20, fill: C.t3 }))
  parts.unshift(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`, `<circle cx="${W - 60}" cy="40" r="520" fill="url(#glow)"/>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs><radialGradient id="glow"><stop offset="0" stop-color="${C.acc}" stop-opacity="0.13"/><stop offset="1" stop-color="${C.acc}" stop-opacity="0"/></radialGradient></defs>`
    + parts.join('') + '</svg>'
}

