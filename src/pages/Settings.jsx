import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {[['menu', 'תפריט'], ['suppliers', 'ספקים'], ['customers', 'לקוחות']].map(([k, l]) => (
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
