// Text helpers for the Telegram bot. Pure, unit-tested (format.test.js).

// Telegram's HTML parse mode accepts only a few tags, and rejects the whole
// message on anything else (or on a stray "<" / "&"). The model writes
// light HTML; this keeps the allowed tags and escapes everything else.
const ALLOWED = new Set(['b', 'i', 'u', 's', 'code', 'pre', 'blockquote'])

const escapeText = s => s.replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function toTelegramHtml(input) {
  let s = String(input ?? '').trim()
  // Markdown habits → HTML, in case the model slips.
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
  s = s.replace(/<br\s*\/?>/gi, '\n')

  const out = []
  const open = []
  const re = /<(\/?)([a-z]+)(?:\s+expandable)?\s*>/gi
  let last = 0
  for (let m; (m = re.exec(s));) {
    out.push(escapeText(s.slice(last, m.index)))
    last = re.lastIndex
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (!ALLOWED.has(tag)) { out.push(escapeText(m[0])); continue }
    if (!closing) {
      open.push(tag)
      out.push(tag === 'blockquote' && /expandable/i.test(m[0]) ? '<blockquote expandable>' : `<${tag}>`)
    } else if (open.includes(tag)) {
      // Close anything left open inside it first, so nesting stays valid.
      while (open.length) {
        const t = open.pop()
        out.push(`</${t}>`)
        if (t === tag) break
      }
    }
  }
  out.push(escapeText(s.slice(last)))
  while (open.length) out.push(`</${open.pop()}>`)
  return out.join('')
}

// Plain-text fallback when Telegram still refuses the HTML.
export function stripTags(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

// Telegram messages are capped at 4096 characters; split on blank lines,
// then lines, so formatting tags are rarely cut (each chunk is re-balanced).
export function splitMessage(text, max = 3900) {
  const chunks = []
  let rest = String(text ?? '')
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max)
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max)
    if (cut < max / 2) cut = max
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

// Today's date in Israel as YYYY-MM-DD, plus the weekday.
export function israelToday(now = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return { iso, dow, dayName: HE_DAYS[dow] }
}

// Date facts for the model, so "last week" / "yesterday" resolve the same
// way every time (weeks run Sunday to Saturday, as in the app).
export function dateContext(now = new Date()) {
  const { iso, dow, dayName } = israelToday(now)
  const add = n => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  return [
    `היום: יום ${dayName}, ${iso} (שעון ישראל).`,
    `השבוע הנוכחי: ${add(-dow)} עד ${add(6 - dow)}.`,
    `שבוע שעבר: ${add(-dow - 7)} עד ${add(-dow - 1)}.`,
    `שבוע הבא: ${add(7 - dow)} עד ${add(13 - dow)}.`,
  ].join('\n')
}

// Group messages address the bot with "@somethingbot" (every bot username
// ends in "bot"); drop it and any leading command from the question.
export function cleanQuestion(text) {
  return String(text ?? '')
    .replace(/^\/(ask|start|help)(@\w+)?/i, '')
    .replace(/@\w*bot\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
