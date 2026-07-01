import { useState, useEffect, useRef } from 'react'
import { Plus, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const [tab, setTab] = useState('menu')
  const [menuItems, setMenuItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)

  // New item form
  const [newItem, setNewItem] = useState({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '' })
  const [newSupplier, setNewSupplier] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: items }, { data: sups }, { data: custs }] = await Promise.all([
      supabase.from('menu_items').select('*, suppliers(name)').order('category').order('name_he'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('customers').select('*').order('name'),
    ])
    setMenuItems(items || [])
    setSuppliers(sups || [])
    setCustomers(custs || [])
    setLoading(false)
  }

  async function addMenuItem() {
    if (!newItem.name_he.trim()) return
    const { data } = await supabase.from('menu_items').insert({
      ...newItem,
      supplier_id: newItem.supplier_id || null,
      active: true,
    }).select('*, suppliers(name)').single()
    if (data) setMenuItems(prev => [...prev, data])
    setNewItem({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '' })
    setShowAddItem(false)
  }

  async function toggleItemActive(id, current) {
    await supabase.from('menu_items').update({ active: !current }).eq('id', id)
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, active: !current } : i))
  }

  async function addSupplier() {
    if (!newSupplier.trim()) return
    const { data } = await supabase.from('suppliers').insert({ name: newSupplier.trim() }).select().single()
    if (data) setSuppliers(prev => [...prev, data])
    setNewSupplier('')
    setShowAddSupplier(false)
  }

  async function toggleCustomerActive(id, current) {
    await supabase.from('customers').update({ active: !current }).eq('id', id)
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, active: !current } : c))
  }

  const UNITS = ['יח׳', 'ק״ג', 'גרם', 'ליטר', 'מ״ל', 'מגש', 'קרטון']

// ── Excel Import helpers ─────────────────────────────────────────────────────

const SKIP_PATTERNS = [
  /כמויות/, /כפתורי/, /גיליון/, /לו"ז/, /ללא מיתוג/, /רשימת/,
  /^Sheet\d*$/, /לקוח חדש/, /דוגמאות/, /^\.*$/, /^[…—_ס]/,
  /סופגניות/, /בראסרי/, /המבורגר/,
]
const NON_ITEM = new Set(['מאפים','מתוקים','קפואים','שונות','עוגות ועוגיות','קפואים ושונות - קונדי','תאריך'])
const DAY_OFFSET = { 'ראשון':0,'שני':1,'שלישי':2,'רביעי':3,'חמישי':4,'שישי':5,'שבת':6,'שבת ':6 }

function skipSheet(name) { return SKIP_PATTERNS.some(p => p.test(name)) }

function normalizeCustomer(name) {
  return name
    .replace(/\s*-?\s*תפריט חדש\s*/g, '')
    .replace(/\s*-\s*\d+%\s*הנחה.*/g, '')
    .replace(/\(ליגורי\)/g, '')
    .replace(/עדינה/g, '')
    .trim().replace(/^[ -]+|[ -]+$/g, '')
}

function parseQty(v) {
  if (v == null) return 0
  const f = parseFloat(v)
  return isNaN(f) || f <= 0 ? 0 : f
}

function getSunday(d) {
  const day = new Date(d)
  const dow = day.getDay() // 0=Sun
  day.setDate(day.getDate() - dow)
  return day
}

function toIso(d) {
  return d.toISOString().slice(0, 10)
}

function excelDateToJs(serial) {
  // Excel date serial → JS Date
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

function parseCellDate(val) {
  if (val == null) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return excelDateToJs(val)
  if (typeof val === 'string' && val.includes('/')) {
    const parts = val.trim().split('/')
    if (parts.length === 3) {
      let [d, m, y] = parts.map(Number)
      if (y < 100) y += 2000
      return new Date(y, m - 1, d)
    }
  }
  return null
}

function parseExcelWorkbook(wb) {
  // Returns { weekStart, customers, items, orderLines }
  // orderLines: [{weekStart, customerName, itemName, deliveryDate, qty}]
  const customers = new Set()
  const items = new Set()
  const orderLines = []

  let weekStart = null

  // Try to find weekStart from any sheet with dates in row 1
  for (const sname of wb.SheetNames) {
    if (skipSheet(sname)) continue
    const ws = wb.Sheets[sname]
    for (let col = 1; col <= 7; col++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: col })
      const cell = ws[addr]
      if (!cell) continue
      const d = parseCellDate(cell.v ?? cell.w)
      if (d && !isNaN(d)) { weekStart = getSunday(d); break }
    }
    if (weekStart) break
  }

  // Fallback: parse week from sheet name like '28.1-3.2'
  if (!weekStart) {
    for (const sname of wb.SheetNames) {
      const m = sname.match(/^(\d{1,2})\.(\d{1,2})-/)
      if (m) {
        const guessYear = new Date().getFullYear() - 1
        const d = new Date(guessYear, parseInt(m[2]) - 1, parseInt(m[1]))
        weekStart = getSunday(d)
        break
      }
    }
  }

  if (!weekStart) return null

  const wsIso = toIso(weekStart)

  for (const sname of wb.SheetNames) {
    if (skipSheet(sname)) continue
    const ws = wb.Sheets[sname]
    const cname = normalizeCustomer(sname)
    if (!cname || cname.length < 2) continue

    // Get dates from row 1 cols B-H (col indices 1-7)
    const dates = []
    for (let col = 1; col <= 7; col++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: col })
      const cell = ws[addr]
      if (!cell) { dates.push(null); continue }
      const d = parseCellDate(cell.v ?? cell.w)
      if (d && !isNaN(d)) { dates.push(d); continue }
      // Day name? map to weekStart + offset
      const txt = (cell.v ?? '').toString().trim()
      if (txt in DAY_OFFSET) {
        const dd = new Date(weekStart)
        dd.setDate(dd.getDate() + DAY_OFFSET[txt])
        dates.push(dd)
      } else {
        dates.push(null)
      }
    }

    if (!dates.some(Boolean)) continue
    customers.add(cname)

    // Rows 3+ (row index 2+): item in col 0, qtys in cols 1-7
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let r = 2; r <= range.e.r; r++) {
      const itemCell = ws[XLSX.utils.encode_cell({ r, c: 0 })]
      if (!itemCell) continue
      const iname = (itemCell.v ?? '').toString().trim()
      if (!iname || iname.length < 2) continue
      if (iname.startsWith('סה') || NON_ITEM.has(iname)) continue

      for (let col = 0; col < dates.length; col++) {
        const deliveryDate = dates[col]
        if (!deliveryDate) continue
        const qtyCell = ws[XLSX.utils.encode_cell({ r, c: col + 1 })]
        const qty = parseQty(qtyCell?.v)
        if (qty > 0) {
          items.add(iname)
          orderLines.push({ wsIso, cname, iname, ddate: toIso(deliveryDate), qty })
        }
      }
    }
  }

  return { wsIso, weekStart, customers: [...customers], items: [...items], orderLines }
}

async function upsertBatch(table, rows, onConflict) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: false })
  return error
}

async function importWorkbook(wb, log) {
  const parsed = parseExcelWorkbook(wb)
  if (!parsed) { log('❌ לא ניתן לזהות תאריכי שבוע בקובץ'); return }
  const { wsIso, weekStart, customers, items, orderLines } = parsed

  const label = `שבוע ${weekStart.getDate().toString().padStart(2,'0')}/${(weekStart.getMonth()+1).toString().padStart(2,'0')}`
  log(`📅 שבוע: ${label} (${wsIso})`)
  log(`👤 לקוחות: ${customers.length} | 🥐 פריטים: ${items.length} | 📋 שורות: ${orderLines.length}`)

  // Upsert customers
  if (customers.length) {
    const err = await upsertBatch('customers',
      customers.map(name => ({ name, active: true })),
      'name'
    )
    if (err) { log(`❌ שגיאה בלקוחות: ${err.message}`); return }
  }

  // Upsert menu items
  if (items.length) {
    const err = await upsertBatch('menu_items',
      items.map(name_he => ({ name_he, unit: 'יח׳', active: true })),
      'name_he'
    )
    if (err) { log(`❌ שגיאה בפריטי תפריט: ${err.message}`); return }
  }

  // Upsert week
  {
    const err = await upsertBatch('weeks', [{ start_date: wsIso, label }], 'start_date')
    if (err) { log(`❌ שגיאה בשבוע: ${err.message}`); return }
  }

  // Fetch IDs
  const [{ data: custRows }, { data: itemRows }, { data: weekRows }] = await Promise.all([
    supabase.from('customers').select('id,name').in('name', customers),
    supabase.from('menu_items').select('id,name_he').in('name_he', items),
    supabase.from('weeks').select('id,start_date').eq('start_date', wsIso),
  ])

  const custMap = Object.fromEntries((custRows || []).map(r => [r.name, r.id]))
  const itemMap = Object.fromEntries((itemRows || []).map(r => [r.name_he, r.id]))
  const weekId = weekRows?.[0]?.id

  if (!weekId) { log('❌ לא ניתן לאחזר מזהה שבוע'); return }

  // Build order_lines rows
  const lines = orderLines
    .map(({ cname, iname, ddate, qty }) => ({
      week_id: weekId,
      customer_id: custMap[cname],
      menu_item_id: itemMap[iname],
      delivery_date: ddate,
      quantity: qty,
      source: 'manual',
      status: 'ok',
    }))
    .filter(r => r.customer_id && r.menu_item_id)

  // Upsert in batches of 200
  let inserted = 0
  for (let i = 0; i < lines.length; i += 200) {
    const batch = lines.slice(i, i + 200)
    const err = await upsertBatch('order_lines', batch, 'week_id,customer_id,menu_item_id,delivery_date')
    if (err) { log(`❌ שגיאה בשורות הזמנה: ${err.message}`); return }
    inserted += batch.length
  }

  log(`✅ יובאו ${inserted} שורות הזמנה בהצלחה!`)
}

// ── ImportTab component ──────────────────────────────────────────────────────

function ImportTab() {
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const fileRef = useRef()

  function log(msg) { setLogs(prev => [...prev, msg]) }

  async function handleFiles(e) {
    const files = [...e.target.files]
    if (!files.length) return
    setLogs([])
    setRunning(true)
    for (const file of files) {
      log(`📂 קובץ: ${file.name}`)
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: false })
        await importWorkbook(wb, log)
      } catch (err) {
        log(`❌ שגיאה: ${err.message}`)
      }
      log('──────────')
    }
    setRunning(false)
    e.target.value = ''
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>ייבוא היסטוריית הזמנות מ-Excel</div>
        <div style={{ color: 'var(--t2)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          בחר קובץ Excel שבועי (פורמט המאפייה) — לקוח לכל גיליון, תאריכים בשורה 1, כמויות בעמודות B–H.
          ניתן לבחור מספר קבצים בו-זמנית. הנתונים יתמזגו עם הקיים.
        </div>
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '10px 20px', borderRadius: 'var(--rs)',
            background: 'var(--grad)', color: '#fff', fontWeight: 600, fontSize: 14,
            opacity: running ? 0.6 : 1, pointerEvents: running ? 'none' : 'auto',
          }}
        >
          <Upload size={16} />
          {running ? 'מייבא...' : 'בחר קובץ/ים Excel'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={handleFiles} />
        </label>
      </div>

      {logs.length > 0 && (
        <div className="card" style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8, direction: 'rtl' }}>
          {logs.map((l, i) => (
            <div key={i} style={{
              color: l.startsWith('✅') ? 'var(--green)' : l.startsWith('❌') ? 'var(--red)' : 'var(--t1)',
            }}>{l}</div>
          ))}
          {running && <div className="shimmer" style={{ height: 14, width: 200, borderRadius: 4, marginTop: 8 }} />}
        </div>
      )}
    </div>
  )
}

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {[['menu', 'תפריט'], ['suppliers', 'ספקים'], ['customers', 'לקוחות'], ['import', 'ייבוא Excel']].map(([k, l]) => (
          <button key={k} className={'btn btn-sm ' + (tab === k ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* MENU ITEMS */}
      {tab === 'menu' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(true)}>
              <Plus size={14} /> הוספת פריט
            </button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead>
                <tr>
                  <th>שם (עברית)</th>
                  <th>שם (אנגלית)</th>
                  <th>יחידה</th>
                  <th>קטגוריה</th>
                  <th>ספק</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map(item => (
                  <tr key={item.id} style={{ opacity: item.active ? 1 : 0.45 }}>
                    <td style={{ fontWeight: 500 }}>{item.name_he}</td>
                    <td style={{ color: 'var(--t3)' }}>{item.name_en || '—'}</td>
                    <td>{item.unit}</td>
                    <td>{item.category || '—'}</td>
                    <td>{item.suppliers?.name || '—'}</td>
                    <td>
                      <button className={'btn btn-sm ' + (item.active ? 'btn-success' : 'btn-ghost')} onClick={() => toggleItemActive(item.id, item.active)}>
                        {item.active ? 'פעיל' : 'לא פעיל'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUPPLIERS */}
      {tab === 'suppliers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddSupplier(true)}>
              <Plus size={14} /> הוספת ספק
            </button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead><tr><th>שם הספק</th></tr></thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id}><td style={{ fontWeight: 500 }}>{s.name}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CUSTOMERS */}
      {tab === 'customers' && (
        <div>
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead>
                <tr><th>שם</th><th>טלפון</th><th>סטטוס</th></tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} style={{ opacity: c.active ? 1 : 0.45 }}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td dir="ltr" style={{ color: 'var(--t3)' }}>{c.phone || '—'}</td>
                    <td>
                      <button className={'btn btn-sm ' + (c.active ? 'btn-success' : 'btn-ghost')} onClick={() => toggleCustomerActive(c.id, c.active)}>
                        {c.active ? 'פעיל' : 'לא פעיל'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IMPORT */}
      {tab === 'import' && <ImportTab />}

      {/* Add Menu Item Modal */}
      {showAddItem && (
        <div className="overlay" onClick={() => setShowAddItem(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">הוספת פריט לתפריט</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="lbl">שם בעברית *</label>
                <input className="input" placeholder="קרואסון חמאה" value={newItem.name_he} onChange={e => setNewItem(p => ({ ...p, name_he: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">שם באנגלית</label>
                <input className="input" placeholder="Butter Croissant" dir="ltr" value={newItem.name_en} onChange={e => setNewItem(p => ({ ...p, name_en: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="lbl">יחידת מידה</label>
                  <select className="input" value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">קטגוריה</label>
                  <input className="input" placeholder="מאפים" value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="lbl">ספק</label>
                <select className="input" value={newItem.supplier_id} onChange={e => setNewItem(p => ({ ...p, supplier_id: e.target.value }))}>
                  <option value="">ללא ספק</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddItem(false)}>ביטול</button>
              <button className="btn btn-primary" onClick={addMenuItem}>הוספה</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="overlay" onClick={() => setShowAddSupplier(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">הוספת ספק</div>
            <div>
              <label className="lbl">שם הספק</label>
              <input className="input" placeholder="שם הספק" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSupplier()} autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddSupplier(false)}>ביטול</button>
              <button className="btn btn-primary" onClick={addSupplier}>הוספה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
