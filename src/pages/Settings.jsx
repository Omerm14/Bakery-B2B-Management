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
  const [newItem, setNewItem] = useState({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '' })
  const [newSupplier, setNewSupplier] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data }) => setSuppliers(data || []))
  }, [])

  async function addMenuItem() {
    if (!newItem.name_he.trim()) return
    const { data, error } = await supabase.from('menu_items').insert({
      ...newItem,
      supplier_id: newItem.supplier_id || null,
      active: true,
    }).select('*, suppliers(name)').single()
    if (error) {
      toast.error('הוספת הפריט נכשלה')
      return
    }
    setMenuItems(prev => [...prev, data])
    toast.success(`נוסף פריט: ${data.name_he}`)
    setNewItem({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '' })
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

  const UNITS = ['יח׳', 'ק״ג', 'גרם', 'ליטר', 'מ״ל', 'מגש', 'קרטון']

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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
      </div>

      <div className="settings-tabs" style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
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
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.filter(item => item.name_he.includes(filterText.trim())).map(item => (
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
                <tr><th>שם</th><th>טלפון</th><th>סטטוס</th></tr>
              </thead>
              <tbody>
                {customers.filter(c => c.name.includes(filterText.trim())).map(c => (
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
