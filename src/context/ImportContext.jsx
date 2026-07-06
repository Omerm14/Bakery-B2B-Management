import { createContext, useContext, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { toLocalISODate } from '../constants/days'

// ── helpers (copied from Settings so they run in context, not component) ──────

const SKIP_SHEETS = new Set(['כמויות', 'כפתורי', 'גיליון', 'לו"ז', 'ללא מיתוג', 'רשימת', 'Sheet1', 'לקוח חדש', 'דוגמאות', 'Template', 'template'])
const NON_ITEM = new Set(['', 'סה"כ', 'Total', 'total', 'תאריך', 'Date', 'date'])

// Section-header rows inside each customer sheet — mark the category of the
// item rows below them until the next header (or end of sheet). Some sheets
// prefix the header with a colon (e.g. ":עוגות ועוגיות") — stripped before matching.
const CATEGORY_HEADERS = new Set(['מאפים', 'מתוקים', 'קפואים', 'שונות', 'עוגות ועוגיות', 'קפואים ושונות - קונדי', 'לחם ולחמניות'])

function normalizeCategoryLabel(s) {
  return s.trim().replace(/^[:：]\s*/, '').replace(/\s*[:：]$/, '')
}

const HE_DAYS = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5 }

function parseQty(v) {
  if (v == null || v === '') return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function toIso(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  return toLocalISODate(new Date(d))
}

function parseExcelWorkbook(wb) {
  let wsIso = null
  let weekStart = null

  // Try to find week start from first valid sheet
  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue
    const ws = wb.Sheets[sheetName]
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
    // Try row 1, cols B-H for a date
    for (let c = 1; c <= 7; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
      if (!cell) continue
      if (cell.t === 'n' && cell.v > 10000) {
        const dt = XLSX.SSF.parse_date_code(cell.v)
        if (dt) {
          const d = new Date(dt.y, dt.m - 1, dt.d)
          while (d.getDay() !== 0) d.setDate(d.getDate() - 1)
          wsIso = toLocalISODate(d)
          weekStart = d
          break
        }
      }
      if (cell.t === 's') {
        const m = cell.v.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/)
        if (m) {
          const day = parseInt(m[1]), month = parseInt(m[2])
          const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear()
          const d = new Date(year, month - 1, day)
          if (!isNaN(d.getTime())) {
            while (d.getDay() !== 0) d.setDate(d.getDate() - 1)
            wsIso = toLocalISODate(d)
            weekStart = d
          }
          break
        }
      }
    }
    if (wsIso) break

    // Fallback: parse sheet name like "28.1-3.2" or "28.1.25"
    const nm = sheetName.match(/(\d{1,2})[./](\d{1,2})/)
    if (nm) {
      const day = parseInt(nm[1]), month = parseInt(nm[2])
      const year = new Date().getFullYear()
      const d = new Date(year, month - 1, day)
      if (!isNaN(d.getTime())) {
        while (d.getDay() !== 0) d.setDate(d.getDate() - 1)
        wsIso = toLocalISODate(d)
        weekStart = d
      }
    }
    if (wsIso) break
  }

  if (!wsIso) return null

  const customers = new Set()
  const items = new Set()
  const orderLines = []
  const itemCategories = {}

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue
    const ws = wb.Sheets[sheetName]
    if (!ws['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])

    let cname = sheetName.replace(/\s*[-–]\s*תפריט.*$/, '').trim()
    if (!cname || cname.length < 2) continue

    // Detect dates from row 1 or Hebrew day names
    let dates = []
    for (let c = 1; c <= Math.min(7, range.e.c); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
      if (!cell) { dates.push(null); continue }
      if (cell.t === 'n' && cell.v > 10000) {
        const dt = XLSX.SSF.parse_date_code(cell.v)
        dates.push(dt ? new Date(dt.y, dt.m - 1, dt.d) : null)
      } else if (cell.t === 's') {
        const m = cell.v.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/)
        if (m) {
          const day = parseInt(m[1]), month = parseInt(m[2])
          const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : weekStart.getFullYear()
          dates.push(new Date(year, month - 1, day))
        } else {
          // Hebrew day name
          const stripped = cell.v.trim().replace(/^יום\s*/, '')
          const dow = HE_DAYS[stripped]
          if (dow !== undefined) {
            const d = new Date(weekStart)
            d.setDate(d.getDate() + dow)
            dates.push(d)
          } else {
            dates.push(null)
          }
        }
      } else {
        dates.push(null)
      }
    }

    // Read items from row 3+ (row index 2+)
    let currentCategory = null
    for (let r = 2; r <= range.e.r; r++) {
      const itemCell = ws[XLSX.utils.encode_cell({ r, c: 0 })]
      if (!itemCell) continue
      const iname = (itemCell.v ?? '').toString().trim()
      if (!iname || iname.length < 2) continue
      const normalized = normalizeCategoryLabel(iname)
      if (CATEGORY_HEADERS.has(normalized)) { currentCategory = normalized; continue }
      if (iname.startsWith('סה') || NON_ITEM.has(iname)) continue

      for (let col = 0; col < dates.length; col++) {
        const deliveryDate = dates[col]
        if (!deliveryDate) continue
        const qtyCell = ws[XLSX.utils.encode_cell({ r, c: col + 1 })]
        const qty = parseQty(qtyCell?.v)
        if (qty > 0) {
          items.add(iname)
          customers.add(cname)
          if (currentCategory) itemCategories[iname] = currentCategory
          orderLines.push({ wsIso, cname, iname, ddate: toIso(deliveryDate), qty })
        }
      }
    }
  }

  return { wsIso, weekStart, customers: [...customers], items: [...items], orderLines, itemCategories }
}

async function upsertBatch(table, rows, onConflict) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: false })
  return error
}

// Compute a simple hash of the workbook content to detect re-imports
function workbookHash(wb) {
  let hash = ''
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let r = 0; r <= Math.min(range.e.r, 50); r++) {
      for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell?.v != null) hash += String(cell.v)
      }
    }
  }
  // Simple djb2-style hash
  let h = 5381
  for (let i = 0; i < hash.length; i++) h = (h * 33) ^ hash.charCodeAt(i)
  return (h >>> 0).toString(16)
}

// ── Context ───────────────────────────────────────────────────────────────────

const ImportContext = createContext(null)

export function ImportProvider({ children }) {
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  async function isHashSeen(h) {
    const { data } = await supabase.from('import_log').select('id').eq('file_hash', h).maybeSingle()
    return !!data
  }
  async function saveHash(h, fileName, rowsNew, rowsExisting) {
    await supabase.from('import_log').upsert({ file_hash: h, file_name: fileName, rows_new: rowsNew, rows_existing: rowsExisting }, { onConflict: 'file_hash' })
  }

  function log(msg) { setLogs(prev => [...prev, msg]) }

  async function categorizeItems(items, itemCategories) {
    const categorized = items.filter(name => itemCategories[name])
    if (!categorized.length) return 0
    const err = await upsertBatch('menu_items', categorized.map(name_he => ({ name_he, category: itemCategories[name_he] })), 'name_he')
    if (err) { log(`⚠️ שגיאה בסיווג קטגוריות: ${err.message}`); return 0 }
    return categorized.length
  }

  async function importWorkbook(wb, fileName) {
    log(`📂 קובץ: ${fileName}`)

    const hash = workbookHash(wb)
    const parsed = parseExcelWorkbook(wb)
    if (!parsed) { log('❌ לא ניתן לזהות תאריכי שבוע בקובץ'); log('──────────'); return }
    const { wsIso, weekStart, customers, items, orderLines, itemCategories } = parsed

    // Dedup by content hash — order lines were already imported, but a
    // previously-imported file may predate category detection, so still
    // backfill categories for it instead of skipping outright.
    if (await isHashSeen(hash)) {
      log('⏭️ קובץ זה כבר יובא בעבר — מעדכן קטגוריות בלבד')
      const n = await categorizeItems(items, itemCategories)
      log(n ? `🏷️ סווגו ${n} פריטים לפי קטגוריה` : 'ℹ️ לא זוהו כותרות קטגוריה בקובץ זה')
      log('──────────')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const changedBy = sessionData.session?.user?.email || null

    const label = `שבוע ${weekStart.getDate().toString().padStart(2, '0')}/${(weekStart.getMonth() + 1).toString().padStart(2, '0')}/${weekStart.getFullYear()}`
    log(`📅 שבוע: ${label} (${wsIso})`)
    log(`👤 לקוחות: ${customers.length} | 🥐 פריטים: ${items.length} | 📋 שורות: ${orderLines.length}`)

    if (customers.length) {
      const err = await upsertBatch('customers', customers.map(name => ({ name, active: true })), 'name')
      if (err) { log(`❌ שגיאה בלקוחות: ${err.message}`); log('──────────'); return }
    }

    if (items.length) {
      const err = await upsertBatch('menu_items', items.map(name_he => ({ name_he, unit: 'יח׳', active: true })), 'name_he')
      if (err) { log(`❌ שגיאה בפריטי תפריט: ${err.message}`); log('──────────'); return }
    }

    // Categorize items found under a section header — leaves category untouched
    // for items where no header was detected this time (e.g. manual edits).
    const categorizedCount = await categorizeItems(items, itemCategories)
    if (categorizedCount) log(`🏷️ סווגו ${categorizedCount} פריטים לפי קטגוריה`)

    {
      const err = await upsertBatch('weeks', [{ start_date: wsIso, label }], 'start_date')
      if (err) { log(`❌ שגיאה בשבוע: ${err.message}`); log('──────────'); return }
    }

    const [{ data: custRows }, { data: itemRows }, { data: weekRows }] = await Promise.all([
      supabase.from('customers').select('id,name').in('name', customers),
      supabase.from('menu_items').select('id,name_he').in('name_he', items),
      supabase.from('weeks').select('id,start_date').eq('start_date', wsIso),
    ])

    const custMap = Object.fromEntries((custRows || []).map(r => [r.name, r.id]))
    const itemMap = Object.fromEntries((itemRows || []).map(r => [r.name_he, r.id]))
    const weekId = weekRows?.[0]?.id
    if (!weekId) { log('❌ לא ניתן לאחזר מזהה שבוע'); log('──────────'); return }

    const rawLines = orderLines
      .map(({ cname, iname, ddate, qty }) => ({
        week_id: weekId,
        customer_id: custMap[cname],
        menu_item_id: itemMap[iname],
        delivery_date: ddate,
        quantity: qty,
        source: 'import',
        status: 'ok',
        change_reason: 'import',
        change_note: fileName,
        changed_by: changedBy,
        changed_via: 'import',
        updated_at: new Date().toISOString(),
      }))
      .filter(r => r.customer_id && r.menu_item_id)

    // Collapse rows sharing the same upsert key (e.g. duplicate item rows or
    // duplicate date columns in the sheet) — last occurrence wins. A single
    // upsert cannot affect the same row twice, so duplicates must be merged
    // before batching.
    const lineByKey = new Map()
    for (const line of rawLines) {
      lineByKey.set(`${line.customer_id}_${line.menu_item_id}_${line.delivery_date}`, line)
    }
    const lines = [...lineByKey.values()]
    const inFileDupCount = rawLines.length - lines.length
    if (inFileDupCount > 0) log(`⚠️ נמצאו ${inFileDupCount} שורות כפולות בקובץ (אותו לקוח/פריט/תאריך) — נלקחה הערך האחרון`)

    // Check how many already exist to report dup stats
    const existingKeys = new Set()
    if (lines.length) {
      const { data: existing } = await supabase
        .from('order_lines')
        .select('menu_item_id,customer_id,delivery_date')
        .eq('week_id', weekId)
        .in('customer_id', [...new Set(lines.map(l => l.customer_id))])
      for (const e of existing || []) {
        existingKeys.add(`${e.customer_id}_${e.menu_item_id}_${e.delivery_date}`)
      }
    }

    const newLines = lines.filter(l => !existingKeys.has(`${l.customer_id}_${l.menu_item_id}_${l.delivery_date}`))
    const dupCount = lines.length - newLines.length

    let inserted = 0
    for (let i = 0; i < lines.length; i += 200) {
      const batch = lines.slice(i, i + 200)
      const err = await upsertBatch('order_lines', batch, 'week_id,customer_id,menu_item_id,delivery_date')
      if (err) { log(`❌ שגיאה בשורות הזמנה: ${err.message}`); log('──────────'); return }
      inserted += newLines.filter((_, idx) => {
        const globalIdx = lines.indexOf(newLines[idx])
        return globalIdx >= i && globalIdx < i + 200
      }).length
    }

    await saveHash(hash, fileName, newLines.length, dupCount)
    log(`✅ הסתיים — ${newLines.length} שורות חדשות, ${dupCount} קיימות`)
    log('──────────')
  }

  async function startImport(files) {
    setLogs([])
    setRunning(true)
    setProgress({ current: 0, total: files.length })

    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length })
      const file = files[i]
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: false })
        await importWorkbook(wb, file.name)
      } catch (err) {
        log(`❌ שגיאה ב-${file.name}: ${err.message}`)
        log('──────────')
      }
    }

    setRunning(false)
    setProgress({ current: 0, total: 0 })
  }

  return (
    <ImportContext.Provider value={{ logs, running, progress, startImport }}>
      {children}
    </ImportContext.Provider>
  )
}

export function useImport() {
  return useContext(ImportContext)
}
