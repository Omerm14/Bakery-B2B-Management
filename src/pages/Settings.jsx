import { useState, useEffect, useRef } from 'react'
import { Plus, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useImport } from '../context/ImportContext'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import { useToast } from '../context/ToastContext'
import SearchInput from '../components/SearchInput'

export default function Settings() {
  const toast = useToast()
  const [tab, setTab] = useState('menu')
  const { menuItems, setMenuItems } = useMenuItems({ activeOnly: false })
  const { customers, setCustomers } = useCustomers({ activeOnly: false })
  const [suppliers, setSuppliers] = useState([])
  const [filterText, setFilterText] = useState('')

  useEffect(() => { setFilterText('') }, [tab])

  // New item form
  const [newItem, setNewItem] = useState({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '', price: '' })
  const [newSupplier, setNewSupplier] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data, error }) => {
      if (error) { console.error('[Settings suppliers]', error); toast.error('טעינת הספקים נכשלה') }
      setSuppliers(data || [])
    })
  }, [])

  async function addMenuItem() {
    if (!newItem.name_he.trim()) return
    const { data, error } = await supabase.from('menu_items').insert({
      ...newItem,
      supplier_id: newItem.supplier_id || null,
      price: newItem.price ? parseFloat(newItem.price) : null,
      active: true,
    }).select('*, suppliers(name)').single()
    if (error) {
      toast.error('הוספת הפריט נכשלה')
      return
    }
    setMenuItems(prev => [...prev, data])
    toast.success(`נוסף פריט: ${data.name_he}`)
    setNewItem({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '', price: '' })
    setShowAddItem(false)
  }

  async function toggleItemActive(id, current) {
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, active: !current } : i))
    const { error } = await supabase.from('menu_items').update({ active: !current }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, active: current } : i))
      toast.error('עדכון הסטטוס נכשל')
    }
  }

  async function updateItemPrice(id, value) {
    const price = value === '' ? null : parseFloat(value)
    const prevPrice = menuItems.find(i => i.id === id)?.price
    if (price === prevPrice) return
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, price } : i))
    const { error } = await supabase.from('menu_items').update({ price }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, price: prevPrice } : i))
      toast.error('עדכון המחיר נכשל')
    }
  }

  async function updateItemCategory(id, category) {
    const prevCategory = menuItems.find(i => i.id === id)?.category ?? null
    if (category === prevCategory) return
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, category } : i))
    const { error } = await supabase.from('menu_items').update({ category }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, category: prevCategory } : i))
      toast.error('עדכון הקטגוריה נכשל')
    }
  }

  async function addSupplier() {
    if (!newSupplier.trim()) return
    const { data, error } = await supabase.from('suppliers').insert({ name: newSupplier.trim() }).select().single()
    if (error) {
      toast.error('הוספת הספק נכשלה')
      return
    }
    setSuppliers(prev => [...prev, data])
    toast.success(`נוסף ספק: ${data.name}`)
    setNewSupplier('')
    setShowAddSupplier(false)
  }

  async function toggleCustomerActive(id, current) {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, active: !current } : c))
    const { error } = await supabase.from('customers').update({ active: !current }).eq('id', id)
    if (error) {
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, active: current } : c))
      toast.error('עדכון הסטטוס נכשל')
    }
  }

  async function updateCustomerPhone(id, phone) {
    const prevPhone = customers.find(c => c.id === id)?.phone
    if (phone === prevPhone) return
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, phone } : c))
    const { error } = await supabase.from('customers').update({ phone: phone || null }).eq('id', id)
    if (error) {
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, phone: prevPhone } : c))
      toast.error('עדכון הטלפון נכשל')
    }
  }

  const [settingPin, setSettingPin] = useState(null)
  const [pinModal, setPinModal] = useState(null) // { customer, pin } | null

  function generatePin() {
    return String(Math.floor(100000 + Math.random() * 900000)) // 6 random digits
  }

  function portalUrlFor(customer) {
    return `${window.location.origin}/portal/login?phone=${encodeURIComponent(customer.phone)}`
  }

  async function generateAndSetPin(customer) {
    if (!customer.phone) { toast.error('יש להזין מספר טלפון לפני הגדרת קוד גישה'); return }
    setSettingPin(customer.id)
    try {
      const pin = generatePin()
      const { data, error } = await supabase.functions.invoke('set-customer-pin', { body: { customer_id: customer.id, pin } })
      if (error || !data?.ok) {
        toast.error(data?.error || 'הגדרת הקוד נכשלה')
        return
      }
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, auth_user_id: c.auth_user_id || 'pending' } : c))
      setPinModal({ customer, pin })
    } finally {
      setSettingPin(null)
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('הועתק')
    } catch {
      toast.error('ההעתקה נכשלה')
    }
  }

  const UNITS = ['יח׳', 'ק״ג', 'גרם', 'ליטר', 'מ״ל', 'מגש', 'קרטון']
  const knownCategories = [...new Set(menuItems.map(i => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'))

  function handleCategoryChange(itemId, e) {
    const value = e.target.value
    if (value === '__new__') {
      const name = window.prompt('שם קטגוריה חדשה:')
      if (name && name.trim()) updateItemCategory(itemId, name.trim())
      return
    }
    updateItemCategory(itemId, value || null)
  }

function ImportTab() {
  const { logs, running, startImport } = useImport()
  const fileRef = useRef()
  const [importHistory, setImportHistory] = useState([])

  useEffect(() => {
    supabase.from('import_log').select('file_name, imported_at, rows_new, rows_existing').order('imported_at', { ascending: false }).limit(20)
      .then(({ data }) => setImportHistory(data || []))
  }, [running])

  async function handleFiles(e) {
    const files = [...e.target.files]
    if (!files.length) return
    e.target.value = ''
    startImport(files)
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>ייבוא היסטוריית הזמנות מ-Excel</div>
        <div style={{ color: 'var(--t2)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          בחר קובץ Excel שבועי (פורמט המאפייה) — לקוח לכל גיליון, תאריכים בשורה 1, כמויות בעמודות B–H.
          ניתן לבחור מספר קבצים בו-זמנית. ניתן לנווט לדפים אחרים בזמן הייבוא — הוא ימשיך ברקע.
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
          {running ? 'מייבא ברקע...' : 'בחר קובץ/ים Excel'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={handleFiles} />
        </label>
      </div>

      {logs.length > 0 && (
        <div className="card" style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8, direction: 'rtl', marginBottom: 16 }}>
          {logs.map((l, i) => (
            <div key={i} style={{
              color: l.startsWith('✅') ? 'var(--green)' : l.startsWith('❌') ? 'var(--red)' : l.startsWith('⏭') ? 'var(--amber)' : 'var(--t1)',
            }}>{l}</div>
          ))}
          {running && <div className="shimmer" style={{ height: 14, width: 200, borderRadius: 4, marginTop: 8 }} />}
        </div>
      )}

      {importHistory.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', fontWeight: 600, fontSize: 14 }}>היסטוריית ייבוא</div>
          <table className="itbl">
            <thead>
              <tr>
                <th>שם קובץ</th>
                <th style={{ textAlign: 'center' }}>שורות חדשות</th>
                <th style={{ textAlign: 'center' }}>קיימות</th>
                <th style={{ textAlign: 'left' }}>תאריך</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 13 }}>{row.file_name || '—'}</td>
                  <td style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{row.rows_new ?? '—'}</td>
                  <td style={{ textAlign: 'center', color: 'var(--t3)' }}>{row.rows_existing ?? '—'}</td>
                  <td dir="ltr" style={{ fontSize: 12, color: 'var(--t3)' }}>
                    {new Date(row.imported_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const AUDIT_REASON_LABELS = {
  customer_request: '📞 לקוח / וואטסאפ',
  internal_decision: '🏭 החלטה פנימית',
  correction: '✏️ תיקון טעות',
  other: 'אחר',
  import: 'ייבוא',
  forecast: 'תחזית',
}

function AuditLogTab({ filterText }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    supabase.from('order_line_audit')
      .select('created_at, customer_name, item_name_he, delivery_date, old_quantity, new_quantity, source, change_reason, change_note, changed_by, changed_via')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setRows(data || []))
  }, [])

  const filtered = rows.filter(r =>
    (r.customer_name || '').includes(filterText.trim()) || (r.item_name_he || '').includes(filterText.trim())
  )

  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="itbl">
        <thead>
          <tr>
            <th>תאריך שינוי</th>
            <th>לקוח</th>
            <th>פריט</th>
            <th>תאריך אספקה</th>
            <th style={{ textAlign: 'center' }}>כמות</th>
            <th>מקור</th>
            <th>סיבה</th>
            <th>הערה</th>
            <th>בוצע ע"י</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, i) => (
            <tr key={i}>
              <td dir="ltr" style={{ fontSize: 12, color: 'var(--t3)' }}>
                {new Date(row.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td style={{ fontWeight: 500 }}>{row.customer_name || '—'}</td>
              <td>{row.item_name_he || '—'}</td>
              <td dir="ltr" style={{ fontSize: 12, color: 'var(--t3)' }}>{row.delivery_date}</td>
              <td style={{ textAlign: 'center', fontSize: 12 }}>
                {row.old_quantity ?? '—'} → {row.new_quantity}
              </td>
              <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.source}</td>
              <td style={{ fontSize: 12 }}>{AUDIT_REASON_LABELS[row.change_reason] || row.change_reason || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.change_note || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--t3)' }}>{row.changed_by || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
      </div>

      <div className="settings-tabs" style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {[['menu', 'תפריט'], ['suppliers', 'ספקים'], ['customers', 'לקוחות'], ['import', 'ייבוא Excel'], ['audit', 'יומן שינויים']].map(([k, l]) => (
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
          <SearchInput value={filterText} onChange={setFilterText} placeholder="חיפוש פריט..." />
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead>
                <tr>
                  <th>שם (עברית)</th>
                  <th>שם (אנגלית)</th>
                  <th>יחידה</th>
                  <th>קטגוריה</th>
                  <th>ספק</th>
                  <th>מחיר</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.filter(item => item.name_he.includes(filterText.trim())).map(item => (
                  <tr key={item.id} style={{ opacity: item.active ? 1 : 0.45 }}>
                    <td style={{ fontWeight: 500 }}>{item.name_he}</td>
                    <td style={{ color: 'var(--t3)' }}>{item.name_en || '—'}</td>
                    <td>{item.unit}</td>
                    <td>
                      <select
                        className="input"
                        style={{ fontSize: 12, padding: '4px 8px', minWidth: 150 }}
                        value={item.category || ''}
                        onChange={e => handleCategoryChange(item.id, e)}
                      >
                        <option value="">—</option>
                        {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__new__">+ קטגוריה חדשה...</option>
                      </select>
                    </td>
                    <td>{item.suppliers?.name || '—'}</td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.1"
                        style={{ width: 80, padding: '4px 8px' }}
                        defaultValue={item.price ?? ''}
                        placeholder="—"
                        onBlur={e => updateItemPrice(item.id, e.target.value)}
                      />
                    </td>
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
          <SearchInput value={filterText} onChange={setFilterText} placeholder="חיפוש ספק..." />
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead><tr><th>שם הספק</th></tr></thead>
              <tbody>
                {suppliers.filter(s => s.name.includes(filterText.trim())).map(s => (
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
          <SearchInput value={filterText} onChange={setFilterText} placeholder="חיפוש לקוח..." />
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead>
                <tr><th>שם</th><th>טלפון</th><th>גישה לפורטל</th><th>סטטוס</th></tr>
              </thead>
              <tbody>
                {customers.filter(c => c.name.includes(filterText.trim())).map(c => (
                  <tr key={c.id} style={{ opacity: c.active ? 1 : 0.45 }}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td>
                      <input
                        className="input"
                        dir="ltr"
                        style={{ width: 130, padding: '4px 8px' }}
                        defaultValue={c.phone ?? ''}
                        placeholder="050-1234567"
                        onBlur={e => updateCustomerPhone(c.id, e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => generateAndSetPin(c)}
                        disabled={settingPin === c.id}
                        title="מגדיר קוד גישה שהלקוח ישתמש בו כדי להיכנס לפורטל ההזמנות"
                      >
                        {settingPin === c.id ? 'מגדיר...' : c.auth_user_id ? 'אפס קוד' : 'הגדר קוד גישה'}
                      </button>
                    </td>
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

      {/* AUDIT LOG */}
      {tab === 'audit' && (
        <div>
          <SearchInput value={filterText} onChange={setFilterText} placeholder="חיפוש לפי לקוח או פריט..." />
          <AuditLogTab filterText={filterText} />
        </div>
      )}

      {/* Customer Access PIN Modal */}
      {pinModal && (
        <div className="overlay" onClick={() => setPinModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">קוד גישה — {pinModal.customer.name}</div>

            <label className="lbl">קישור לשליחה ללקוח</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input className="input" dir="ltr" readOnly value={portalUrlFor(pinModal.customer)} onFocus={e => e.target.select()} style={{ fontSize: 12 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(portalUrlFor(pinModal.customer))}>העתק</button>
            </div>

            <label className="lbl">קוד גישה</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" dir="ltr" readOnly value={pinModal.pin} onFocus={e => e.target.select()} style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', letterSpacing: '.1em' }} />
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(pinModal.pin)}>העתק</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>
              יש למסור את הקישור והקוד ללקוח (וואטסאפ, טלפון וכו׳). ניתן ליצור קוד חדש בכל עת מכאן.
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => generateAndSetPin(pinModal.customer)} disabled={settingPin === pinModal.customer.id}>
                {settingPin === pinModal.customer.id ? 'מייצר...' : 'צור קוד חדש'}
              </button>
              <button className="btn btn-primary" onClick={() => setPinModal(null)}>סגור</button>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="lbl">ספק</label>
                  <select className="input" value={newItem.supplier_id} onChange={e => setNewItem(p => ({ ...p, supplier_id: e.target.value }))}>
                    <option value="">ללא ספק</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">מחיר (ש״ח) — אופציונלי</label>
                  <input className="input" type="number" min="0" step="0.1" placeholder="לא נקבע" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} />
                </div>
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
