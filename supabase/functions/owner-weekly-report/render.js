// Weekly summary image for the owner's Telegram group, drawn as an SVG
// (rendered to PNG by index.ts). Pure functions, no dependencies, so the
// layout is unit-tested under Node (render.test.js).
//
// `s` is the jsonb from owner_weekly_summary() (migration 066).

const W = 1080
const H = 1350
const C = {
  bg: '#0A0F0D', surf: '#111917', bdr: '#1C2522', grid: '#1A2420',
  t1: '#F2F1EA', t2: '#A8B5AE', t3: '#6E7B74',
  acc: '#3DD6A3', prevBar: '#2B3A35', red: '#E8604C', amber: '#E0A93D',
}
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

const num = v => Number(v ?? 0)
const fmtInt = v => Math.round(num(v)).toLocaleString('en-US')
const fmtK = v => (num(v) >= 1000 ? (num(v) / 1000).toFixed(1) + 'k' : String(Math.round(num(v))))
const ddmm = iso => { const [, m, d] = String(iso).split('-'); return `${d}.${m}` }
const ddmmyyyy = iso => { const [y, m, d] = String(iso).split('-'); return `${d}.${m}.${y}` }

export function pctChange(cur, prev) {
  return num(prev) === 0 ? null : Math.round(((num(cur) - num(prev)) * 100) / num(prev))
}

export function alertCount(s) {
  return num(s.drop_alerts) + Object.values(s.alerts ?? {}).reduce((a, b) => a + num(b), 0)
}

// Headline + one-line subtitle, both from the numbers (no invented claims).
export function headline(s) {
  const n = alertCount(s)
  const pct = pctChange(s.units, s.prev_units)
  const trend = pct === null ? 'שבוע ראשון עם נתונים'
    : Math.abs(pct) < 5 ? 'שבוע יציב'
    : pct > 0 ? 'שבוע של צמיחה' : 'ירידה בייצור השבוע'
  const alerts = n === 0 ? 'בלי התראות' : n === 1 ? 'התראה אחת' : `${n} התראות`
  let sub = pct === null ? 'אין נתונים לשבוע הקודם להשוואה.'
    : pct === 0 ? 'הייצור זהה לשבוע שעבר.'
    : `הייצור ${pct > 0 ? 'עלה' : 'ירד'} ב-${Math.abs(pct)}% לעומת שבוע שעבר.`
  const down = (s.movers ?? []).find(m => num(m.pct) <= -20)
  if (down) sub += ` ${down.name} ירד ב-${Math.abs(num(down.pct))}%.`
  return { title: `${trend} · ${alerts}`, sub }
}

// Short caption sent with the photo (also the text fallback).
export function caption(s) {
  const pct = pctChange(s.units, s.prev_units)
  const n = alertCount(s)
  return `📊 סיכום שבועי ${ddmm(s.week_start)}–${ddmm(s.week_end)}\n`
    + `${fmtInt(s.units)} יח׳${pct === null ? '' : ` (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)`}`
    + ` · ${num(s.customers)} לקוחות · ${n === 0 ? 'בלי התראות' : n === 1 ? 'התראה אחת' : `${n} התראות`}`
}

// RTL strings are wrapped in RLMs: the renderer resolves the paragraph
// direction from the text, and a line ending in "ב-34%." would otherwise
// get its trailing number and period laid out left-to-right.
const RLM = '\u200F'
const text = (x, y, str, { size = 24, weight = 400, fill = C.t1, anchor = 'end', family = 'Assistant', rtl = true } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${rtl ? ' direction="rtl"' : ''}>${rtl ? RLM + esc(str) + RLM : esc(str)}</text>`

const card = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${C.surf}" stroke="${C.bdr}"/>`

// ▲ / ▼ drawn as paths: the fonts have no arrow glyphs.
const arrow = (x, y, up, fill) => up
  ? `<path d="M${x} ${y} l9 -14 l9 14 z" fill="${fill}"/>`
  : `<path d="M${x} ${y - 14} l9 14 l9 -14 z" fill="${fill}"/>`

function delta(x, y, value, { suffix = '%', goodWhenUp = true, neutral = false, label } = {}) {
  if (label) return text(x, y, label, { size: 21, weight: 700, fill: C.acc })
  if (value === null || value === undefined) return text(x, y, '—', { size: 21, weight: 700, fill: C.t3 })
  const up = value >= 0
  const fill = value === 0 || neutral ? C.t2 : (up === goodWhenUp ? C.acc : C.red)
  const str = `${Math.abs(value)}${suffix}`
  // Number right-aligned at x, arrow to its left (LTR digits in an RTL card).
  const w = str.length * 13
  return text(x, y, str, { size: 21, weight: 700, fill, family: 'Spline Sans Mono', rtl: false })
    + (value === 0 ? '' : arrow(x - w - 26, y, up, fill))
}

const ICONS = {
  check: (x, y, col) => `<path d="M${x} ${y} l5 5 l9 -10" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: (x, y, col) => `<path d="M${x} ${y - 5} l10 10 M${x + 10} ${y - 5} l-10 10" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`,
  dot: (x, y, col) => `<circle cx="${x + 6}" cy="${y}" r="6" fill="${col}"/>`,
}
const TONE = { ok: C.acc, red: C.red, amber: C.amber, muted: C.t3 }

// One status per row, icon on the right (at most 7 rows: 2 jobs + 5 kinds).
function statusList(items, right, top) {
  return items.map((c, i) => {
    const y = top + i * 34, col = TONE[c.tone]
    return ICONS[c.icon ?? 'dot'](right - 16, y - 7, col)
      + text(right - 30, y, c.label, { size: 21, weight: 600, fill: c.tone === 'ok' ? C.t2 : col })
  }).join('')
}

export function healthChips(s) {
  const a = s.alerts ?? {}
  // ok === null: the run history wasn't available (unknown, not a failure).
  const status = (ok, name) => ok === true ? { label: name, tone: 'ok', icon: 'check' }
    : ok === false ? { label: `${name} לא רצה`, tone: 'red', icon: 'cross' } : { label: name, tone: 'muted', icon: 'dot' }
  const items = [status(s.rollover_ok, 'העתקה שבועית'), status(s.drop_check_ok, 'בדיקת חוסרים')]
  if (num(s.drop_alerts) > 0) items.push({ label: `מוצרים שלא הועתקו: ${num(s.drop_alerts)}`, tone: 'red' })
  if (num(a.lock_check) > 0) items.push({ label: `ימים עם חריגות: ${num(a.lock_check)}`, tone: 'amber' })
  if (num(a.late_changes) > 0) items.push({ label: `ימים עם שינויים מאוחרים: ${num(a.late_changes)}`, tone: 'amber' })
  if (num(a.mass_change) > 0) items.push({ label: `מחיקות / השבתות: ${num(a.mass_change)}`, tone: 'red' })
  if (num(a.cron_failure) > 0) items.push({ label: `משימות שנכשלו: ${num(a.cron_failure)}`, tone: 'red' })
  if (items.length === 2 && alertCount(s) === 0) items.push({ label: 'אין חריגות השבוע', tone: 'ok', icon: 'check' })
  return items
}

export function buildWeeklySvg(s) {
  const { title, sub } = headline(s)
  const brand = s.business_name ? `${s.business_name} · סיכום שבועי` : 'סיכום שבועי'
  const R = W - 60
  const parts = []

  parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`)
  parts.push(`<circle cx="${W - 60}" cy="40" r="520" fill="url(#glow)"/>`)

  // Header
  parts.push(text(R, 92, brand, { size: 27, weight: 700, fill: C.t2 }))
  const pill = `${ddmmyyyy(s.week_start)} – ${ddmmyyyy(s.week_end)}`
  parts.push(`<rect x="60" y="58" width="${pill.length * 14 + 40}" height="48" rx="24" fill="none" stroke="#2A3430"/>`)
  parts.push(text(80, 90, pill, { size: 22, weight: 700, fill: C.t3, anchor: 'start', family: 'Spline Sans Mono', rtl: false }))

  parts.push(text(R, 200, title, { size: 60, weight: 800 }))
  parts.push(text(R, 252, sub, { size: 28, fill: C.t2 }))

  // KPI tiles
  const n = alertCount(s)
  const tiles = [
    { label: 'יחידות', value: fmtInt(s.units), d: [pctChange(s.units, s.prev_units), {}] },
    { label: 'לקוחות פעילים', value: fmtInt(s.customers), d: [num(s.customers) - num(s.prev_customers), { suffix: '' }] },
    // More customer edits is neither good nor bad, so no colour.
    { label: 'שינויי לקוחות', value: fmtInt(s.customer_changes), d: [pctChange(s.customer_changes, s.prev_customer_changes), { neutral: true }] },
    { label: 'התראות', value: String(n), d: [null, { label: n === 0 ? 'הכול תקין' : 'פירוט למטה' }] },
  ]
  const tw = 228, tg = 16, ty = 290
  tiles.forEach((t, i) => {
    const x = R - (i + 1) * tw - i * tg
    parts.push(card(x, ty, tw, 160))
    parts.push(text(x + tw - 22, ty + 42, t.label, { size: 21, weight: 600, fill: C.t3 }))
    parts.push(text(x + tw - 22, ty + 106, t.value, { size: 50, weight: 700, family: 'Spline Sans Mono', rtl: false }))
    parts.push(delta(x + tw - 22, ty + 140, t.d[0], t.d[1]))
  })

  // Units per weekday, Sunday on the right.
  const cy = 474, ch = 430
  parts.push(card(60, cy, W - 120, ch))
  parts.push(text(R - 30, cy + 52, 'יחידות לפי יום', { size: 27, weight: 700, fill: C.t2 }))
  parts.push(`<rect x="96" y="${cy + 34}" width="16" height="16" rx="4" fill="${C.acc}"/>`)
  parts.push(text(120, cy + 48, 'השבוע', { size: 20, weight: 600, fill: C.t3, anchor: 'start' }))
  parts.push(`<rect x="200" y="${cy + 34}" width="16" height="16" rx="4" fill="${C.prevBar}"/>`)
  parts.push(text(224, cy + 48, 'שבוע שעבר', { size: 20, weight: 600, fill: C.t3, anchor: 'start' }))
  const days = s.days ?? []
  const max = Math.max(1, ...days.flatMap(d => [num(d.cur), num(d.prev)]))
  const baseY = cy + ch - 70, plotH = 270, bw = 44, slot = (W - 120 - 80) / 7
  parts.push(`<line x1="100" y1="${baseY}" x2="${W - 100}" y2="${baseY}" stroke="${C.grid}" stroke-width="2"/>`)
  for (let dow = 0; dow < 7; dow++) {
    const d = days.find(x => num(x.dow) === dow) ?? { cur: 0, prev: 0 }
    const center = W - 100 - slot * dow - slot / 2
    const hp = (num(d.prev) / max) * plotH, hc = (num(d.cur) / max) * plotH
    if (hp > 0) parts.push(`<rect x="${center - bw - 3}" y="${baseY - hp}" width="${bw}" height="${hp}" rx="9" fill="${C.prevBar}"/>`)
    if (hc > 0) {
      parts.push(`<rect x="${center + 3}" y="${baseY - hc}" width="${bw}" height="${hc}" rx="9" fill="${C.acc}"/>`)
      parts.push(text(center + 3 + bw / 2, baseY - hc - 12, fmtK(d.cur), { size: 18, weight: 700, fill: C.t2, anchor: 'middle', family: 'Spline Sans Mono', rtl: false }))
    }
    parts.push(text(center, baseY + 42, DAYS[dow], { size: 24, weight: 600, fill: C.t3, anchor: 'middle' }))
  }

  // Bottom row: system status (left), biggest movers (right).
  const by = cy + ch + 20, bh = 330, half = (W - 120 - 18) / 2
  parts.push(card(R - half, by, half, bh))
  parts.push(text(R - 30, by + 52, 'הכי השתנו', { size: 27, weight: 700, fill: C.t2 }))
  const movers = (s.movers ?? []).slice(0, 4)
  if (movers.length === 0) parts.push(text(R - 30, by + 110, 'אין שינויים משמעותיים', { size: 24, fill: C.t3 }))
  movers.forEach((m, i) => {
    const y = by + 108 + i * 48
    if (i > 0) parts.push(`<line x1="${R - half + 30}" y1="${y - 32}" x2="${R - 30}" y2="${y - 32}" stroke="${C.bdr}"/>`)
    parts.push(text(R - 30, y, m.name, { size: 24 }))
    const p = num(m.pct)
    parts.push(text(R - half + 30, y, `${p >= 0 ? '+' : '−'}${Math.abs(p)}%`, { size: 23, weight: 700, fill: p >= 0 ? C.acc : C.red, anchor: 'start', family: 'Spline Sans Mono', rtl: false }))
  })

  const lx = 60
  parts.push(card(lx, by, half, bh))
  parts.push(text(lx + half - 30, by + 52, 'מצב המערכת', { size: 27, weight: 700, fill: C.t2 }))
  parts.push(statusList(healthChips(s), lx + half - 30, by + 100))

  parts.push(text(R, H - 30, 'נשלח אוטומטית · ראשון בבוקר', { size: 20, fill: C.t3 }))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs><radialGradient id="glow"><stop offset="0" stop-color="${C.acc}" stop-opacity="0.13"/><stop offset="1" stop-color="${C.acc}" stop-opacity="0"/></radialGradient></defs>`
    + parts.join('') + '</svg>'
}
