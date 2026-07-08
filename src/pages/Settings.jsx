import { useState, useEffect, useRef } from 'react'
import { Plus, Upload, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { portalOrigin } from '../lib/host'
import { useImport } from '../context/ImportContext'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import { useToast } from '../context/ToastContext'
import SearchInput from '../components/SearchInput'
import { useTranslation } from '../context/LanguageContext'

export default function Settings() {
  const toast = useToast()
  const { t } = useTranslation()
  const [tab, setTab] = useState('menu')
  const { menuItems, setMenuItems } = useMenuItems({ activeOnly: false })
  const { customers, setCustomers, createCustomer } = useCustomers({ activeOnly: false })
  const [suppliers, setSuppliers] = useState([])
  const [filterText, setFilterText] = useState('')
  const { running: importRunning, startImport } = useImport()
  const importFileRef = useRef()

  useEffect(() => { setFilterText('') }, [tab])

  // New item form
  const [newItem, setNewItem] = useState({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '', price: '' })
  const [showAddItem, setShowAddItem] = useState(false)

  useEffect(() => {
    supabase.from('suppliers').select('*').order('name').then(({ data, error }) => {
      if (error) { console.error('[Settings suppliers]', error); toast.error(t('settings.toast.suppliersLoadFailed')) }
      setSuppliers(data || [])
    })
  }, [])

  // ── Branding (customer login page white-label) ──────────────────────
  const [branding, setBranding] = useState({ logo_url: null, business_name: null })
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    supabase.from('app_config').select('value').eq('key', 'branding').maybeSingle().then(({ data, error }) => {
      if (error) { console.error('[Settings branding]', error); return }
      if (data?.value) setBranding(data.value)
    })
  }, [])

  async function saveBranding(next) {
    setBranding(next)
    const { error } = await supabase.from('app_config').update({ value: next }).eq('key', 'branding')
    if (error) { console.error('[Settings saveBranding]', error); toast.error(t('settings.toast.brandingSaveFailed')) }
  }

  async function uploadLogo(file) {
    setUploadingLogo(true)
    try {
      const { error: uploadErr } = await supabase.storage
        .from('branding')
        .upload('logo', file, { upsert: true, contentType: file.type })
      if (uploadErr) throw uploadErr
      const { data: pub } = supabase.storage.from('branding').getPublicUrl('logo')
      // Cache-bust: the object path is always "logo", so the public URL
      // never changes on re-upload — without this, browsers/CDN would
      // keep showing the previous image after a replacement.
      await saveBranding({ ...branding, logo_url: `${pub.publicUrl}?t=${Date.now()}` })
      toast.success(t('settings.toast.logoUploadSuccess'))
    } catch (err) {
      console.error('[Settings uploadLogo]', err)
      toast.error(t('settings.toast.logoUploadFailed'))
    } finally {
      setUploadingLogo(false)
    }
  }

  async function removeLogo() {
    await supabase.storage.from('branding').remove(['logo'])
    await saveBranding({ ...branding, logo_url: null })
  }

  // ── Staff access allowlist ───────────────────────────────────────────
  const [staffEmails, setStaffEmails] = useState([])
  const [newStaffEmail, setNewStaffEmail] = useState('')

  useEffect(() => {
    supabase.from('staff_allowlist').select('email').order('email').then(({ data, error }) => {
      if (error) { console.error('[Settings staffAllowlist]', error); return }
      setStaffEmails(data || [])
    })
  }, [])

  async function addStaffEmail() {
    const email = newStaffEmail.trim().toLowerCase()
    if (!email) return
    const { data, error } = await supabase.from('staff_allowlist').insert({ email }).select('email').single()
    if (error) { toast.error(t('settings.toast.staffAddFailed')); return }
    setStaffEmails(prev => [...prev, data].sort((a, b) => a.email.localeCompare(b.email)))
    setNewStaffEmail('')
    toast.success(t('settings.toast.staffAdded'))
  }

  async function removeStaffEmail(email) {
    setStaffEmails(prev => prev.filter(s => s.email !== email))
    const { error } = await supabase.from('staff_allowlist').delete().eq('email', email)
    if (error) { toast.error(t('settings.toast.staffRemoveFailed')) }
  }

  async function addMenuItem() {
    if (!newItem.name_he.trim()) return
    const { data, error } = await supabase.from('menu_items').insert({
      ...newItem,
      supplier_id: newItem.supplier_id || null,
      price: newItem.price ? parseFloat(newItem.price) : null,
      active: true,
    }).select('*, suppliers(name)').single()
    if (error) {
      toast.error(t('settings.toast.itemAddFailed'))
      return
    }
    setMenuItems(prev => [...prev, data])
    toast.success(`${t('settings.toast.itemAdded')}: ${data.name_he}`)
    setNewItem({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '', price: '' })
    setShowAddItem(false)
  }

  async function toggleItemActive(id, current) {
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, active: !current } : i))
    const { error } = await supabase.from('menu_items').update({ active: !current }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, active: current } : i))
      toast.error(t('settings.toast.statusUpdateFailed'))
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
      toast.error(t('settings.toast.priceUpdateFailed'))
    }
  }

  async function updateItemCategory(id, category) {
    const prevCategory = menuItems.find(i => i.id === id)?.category ?? null
    if (category === prevCategory) return
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, category } : i))
    const { error } = await supabase.from('menu_items').update({ category }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, category: prevCategory } : i))
      toast.error(t('settings.toast.categoryUpdateFailed'))
    }
  }

  async function updateItemNameEn(id, nameEn) {
    const prevNameEn = menuItems.find(i => i.id === id)?.name_en ?? null
    const value = nameEn.trim() || null
    if (value === prevNameEn) return
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, name_en: value } : i))
    const { error } = await supabase.from('menu_items').update({ name_en: value }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, name_en: prevNameEn } : i))
      toast.error(t('settings.toast.nameEnUpdateFailed'))
    }
  }

  async function toggleCustomerActive(id, current) {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, active: !current } : c))
    const { error } = await supabase.from('customers').update({ active: !current }).eq('id', id)
    if (error) {
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, active: current } : c))
      toast.error(t('settings.toast.statusUpdateFailed'))
    }
  }

  async function updateCustomerPhone(id, phone) {
    const prevPhone = customers.find(c => c.id === id)?.phone
    if (phone === prevPhone) return
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, phone } : c))
    const { error } = await supabase.from('customers').update({ phone: phone || null }).eq('id', id)
    if (error) {
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, phone: prevPhone } : c))
      toast.error(t('settings.toast.phoneUpdateFailed'))
    }
  }

  async function updateCustomerNameEn(id, nameEn) {
    const prevNameEn = customers.find(c => c.id === id)?.name_en
    const value = nameEn.trim() || null
    if (value === prevNameEn) return
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, name_en: value } : c))
    const { error } = await supabase.from('customers').update({ name_en: value }).eq('id', id)
    if (error) {
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, name_en: prevNameEn } : c))
      toast.error(t('settings.toast.nameEnUpdateFailed'))
    }
  }

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')

  async function addCustomer() {
    if (!newCustomerName.trim()) return
    const { error, reactivated, alreadyActive, data } = await createCustomer(newCustomerName)
    if (error) {
      toast.error(alreadyActive ? t('settings.toast.customerAlreadyExists') : t('settings.toast.customerAddFailed'))
      return
    }
    toast.success(`${reactivated ? t('settings.toast.customerReactivated') : t('settings.toast.customerAdded')} ${data.name}`)
    setNewCustomerName('')
    setShowAddCustomer(false)
  }

  const [seedingFavorites, setSeedingFavorites] = useState(false)

  async function seedFavoritesFromHistory() {
    if (seedingFavorites) return
    if (!window.confirm(t('settings.seedFavoritesConfirm'))) return
    setSeedingFavorites(true)
    try {
      const { data, error } = await supabase.rpc('seed_favorite_items_from_history')
      if (error) { toast.error(t('settings.toast.seedFavoritesFailed')); return }
      toast.success(`${t('settings.toast.seedFavoritesSuccess')} ${data ?? 0}`)
    } finally {
      setSeedingFavorites(false)
    }
  }

  const [settingPin, setSettingPin] = useState(null)
  // The PIN itself is stored server-side (customers.portal_pin), kept in
  // sync with the real auth password by set-customer-pin — so we only need
  // to remember *which* customer's modal is open, not the PIN value. This
  // way the modal always reflects the actual current PIN, including across
  // reloads/other staff members, not just what was generated this session.
  const [pinModalCustomerId, setPinModalCustomerId] = useState(null)
  const pinModalCustomer = customers.find(c => c.id === pinModalCustomerId) || null

  function generatePin() {
    return String(Math.floor(100000 + Math.random() * 900000)) // 6 random digits
  }

  function portalUrlFor(customer) {
    return `${portalOrigin()}/login?phone=${encodeURIComponent(customer.phone)}`
  }

  async function generateAndSetPin(customer) {
    if (!customer.phone) { toast.error(t('settings.phoneRequiredForPin')); return }
    setSettingPin(customer.id)
    try {
      const pin = generatePin()
      const { data, error } = await supabase.functions.invoke('set-customer-pin', { body: { customer_id: customer.id, pin } })
      if (error || !data?.ok) {
        toast.error(data?.error || t('settings.toast.pinSetFailed'))
        return
      }
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, auth_user_id: c.auth_user_id || 'pending', portal_pin: pin } : c))
      setPinModalCustomerId(customer.id)
    } finally {
      setSettingPin(null)
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('settings.toast.copied'))
    } catch {
      toast.error(t('settings.toast.copyFailed'))
    }
  }

  const UNITS = ['יח׳', 'ק״ג', 'גרם', 'ליטר', 'מ״ל', 'מגש', 'קרטון']
  const knownCategories = [...new Set(menuItems.map(i => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'))

  const sortedMenuItems = [...menuItems].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he'))
  const sortedCustomers = [...customers].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name, 'he')
  })

  function handleCategoryChange(itemId, e) {
    const value = e.target.value
    if (value === '__new__') {
      const name = window.prompt(t('settings.newCategoryPrompt'))
      if (name && name.trim()) updateItemCategory(itemId, name.trim())
      return
    }
    updateItemCategory(itemId, value || null)
  }

  async function handleImportFiles(e) {
    const files = [...e.target.files]
    if (!files.length) return
    e.target.value = ''
    startImport(files)
  }

function ImportTab() {
  const { logs, running } = useImport()
  const [importHistory, setImportHistory] = useState([])

  useEffect(() => {
    supabase.from('import_log').select('file_name, imported_at, rows_new, rows_existing').order('imported_at', { ascending: false }).limit(20)
      .then(({ data }) => setImportHistory(data || []))
  }, [running])

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, color: 'var(--t2)', fontSize: 13, lineHeight: 1.6 }}>
        {t('settings.importInstructions')}
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
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', fontWeight: 600, fontSize: 14 }}>{t('settings.importHistory')}</div>
          <table className="itbl">
            <thead>
              <tr>
                <th>{t('settings.col.fileName')}</th>
                <th style={{ textAlign: 'center' }}>{t('settings.col.newRows')}</th>
                <th style={{ textAlign: 'center' }}>{t('settings.col.existingRows')}</th>
                <th style={{ textAlign: 'left' }}>{t('settings.col.date')}</th>
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
  customer_request: t('settings.auditReason.customerRequest'),
  internal_decision: t('settings.auditReason.internalDecision'),
  correction: t('settings.auditReason.correction'),
  other: t('settings.auditReason.other'),
  import: t('settings.auditReason.import'),
  forecast: t('settings.auditReason.forecast'),
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
            <th>{t('settings.col.changeDate')}</th>
            <th>{t('common.customer')}</th>
            <th>{t('common.item')}</th>
            <th>{t('settings.col.deliveryDate')}</th>
            <th style={{ textAlign: 'center' }}>{t('common.quantity')}</th>
            <th>{t('settings.col.source')}</th>
            <th>{t('settings.col.reason')}</th>
            <th>{t('settings.col.note')}</th>
            <th>{t('settings.col.changedBy')}</th>
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
        <h1 className="page-title">{t('settings.title')}</h1>
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '10px 20px', borderRadius: 'var(--rs)',
            background: 'var(--grad)', color: '#fff', fontWeight: 600, fontSize: 14,
            opacity: importRunning ? 0.6 : 1, pointerEvents: importRunning ? 'none' : 'auto',
          }}
        >
          <Upload size={16} />
          {importRunning ? t('settings.importRunning') : t('settings.importExcel')}
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={handleImportFiles} />
        </label>
      </div>

      <div className="settings-tabs" style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {[['menu', t('settings.tabs.menu')], ['customers', t('common.customers')], ['import', t('settings.importExcel')], ['audit', t('settings.tabs.audit')], ['branding', t('settings.tabs.branding')], ['staff', t('settings.tabs.staff')]].map(([k, l]) => (
          <button key={k} className={'btn btn-sm ' + (tab === k ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* MENU ITEMS */}
      {tab === 'menu' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(true)}>
              <Plus size={14} /> {t('settings.addItem')}
            </button>
          </div>
          <SearchInput value={filterText} onChange={setFilterText} placeholder={t('settings.searchItemPlaceholder')} />
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead>
                <tr>
                  <th>{t('settings.col.nameHe')}</th>
                  <th>{t('settings.col.nameEn')}</th>
                  <th>{t('settings.col.unit')}</th>
                  <th>{t('common.category')}</th>
                  <th>{t('common.supplier')}</th>
                  <th>{t('settings.col.price')}</th>
                  <th>{t('settings.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedMenuItems.filter(item => item.name_he.includes(filterText.trim())).map(item => (
                  <tr key={item.id} style={{ opacity: item.active ? 1 : 0.45 }}>
                    <td style={{ fontWeight: 500 }}>{item.name_he}</td>
                    <td>
                      <input
                        className="input"
                        dir="ltr"
                        style={{ width: 130, padding: '4px 8px' }}
                        defaultValue={item.name_en ?? ''}
                        placeholder="Item Name"
                        onBlur={e => updateItemNameEn(item.id, e.target.value)}
                      />
                    </td>
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
                        <option value="__new__">{t('settings.newCategoryOption')}</option>
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
                        {item.active ? t('settings.active') : t('settings.inactive')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CUSTOMERS */}
      {tab === 'customers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={seedFavoritesFromHistory} disabled={seedingFavorites} title={t('settings.seedFavoritesTitle')}>
              {seedingFavorites ? t('settings.seeding') : t('settings.seedFavorites')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddCustomer(true)}>
              <Plus size={14} /> {t('settings.addCustomer')}
            </button>
          </div>
          <SearchInput value={filterText} onChange={setFilterText} placeholder={t('settings.searchCustomerPlaceholder')} />
          <div className="card" style={{ padding: 0 }}>
            <table className="itbl">
              <thead>
                <tr><th>{t('settings.col.name')}</th><th>{t('settings.col.nameEn')}</th><th>{t('settings.col.phone')}</th><th>{t('settings.col.portalAccess')}</th><th>{t('settings.col.status')}</th></tr>
              </thead>
              <tbody>
                {sortedCustomers.filter(c => c.name.includes(filterText.trim())).map(c => (
                  <tr key={c.id} style={{ opacity: c.active ? 1 : 0.45 }}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td>
                      <input
                        className="input"
                        dir="ltr"
                        style={{ width: 130, padding: '4px 8px' }}
                        defaultValue={c.name_en ?? ''}
                        placeholder="Customer Name"
                        onBlur={e => updateCustomerNameEn(c.id, e.target.value)}
                      />
                    </td>
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
                        onClick={() => {
                          if (!c.phone) { toast.error(t('settings.phoneRequiredForPin')); return }
                          setPinModalCustomerId(c.id)
                        }}
                        title={t('settings.pinButtonTitle')}
                      >
                        {c.auth_user_id ? t('settings.pinCode') : t('settings.setPinButton')}
                      </button>
                    </td>
                    <td>
                      <button className={'btn btn-sm ' + (c.active ? 'btn-success' : 'btn-ghost')} onClick={() => toggleCustomerActive(c.id, c.active)}>
                        {c.active ? t('settings.active') : t('settings.inactive')}
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
          <SearchInput value={filterText} onChange={setFilterText} placeholder={t('settings.searchAuditPlaceholder')} />
          <AuditLogTab filterText={filterText} />
        </div>
      )}

      {/* BRANDING (customer portal white-label) */}
      {tab === 'branding' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="section-title">{t('settings.brandingSectionTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>
            {t('settings.brandingDescription')}
          </div>

          <label className="lbl">{t('settings.businessNameLabel')}</label>
          <input
            className="input"
            defaultValue={branding.business_name ?? ''}
            placeholder={t('settings.businessNamePlaceholder')}
            onBlur={e => saveBranding({ ...branding, business_name: e.target.value.trim() || null })}
            style={{ marginBottom: 20 }}
          />

          <label className="lbl">{t('settings.logoLabel')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 'var(--rs)', border: '1px solid var(--bdr)',
              background: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={t('settings.logoAlt')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <ImageIcon size={24} color="var(--t3)" />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingLogo ? 'not-allowed' : 'pointer', opacity: uploadingLogo ? .6 : 1 }}>
                <Upload size={14} /> {uploadingLogo ? t('settings.uploading') : (branding.logo_url ? t('settings.replaceLogo') : t('settings.uploadLogo'))}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={uploadingLogo}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) uploadLogo(file)
                  }}
                />
              </label>
              {branding.logo_url && (
                <button className="btn btn-ghost btn-sm" onClick={removeLogo}>{t('settings.removeLogo')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAFF ACCESS */}
      {tab === 'staff' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="section-title">{t('settings.staffSectionTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>
            {t('settings.staffDescription')}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              className="input"
              dir="ltr"
              placeholder={t('settings.staffEmailPlaceholder')}
              value={newStaffEmail}
              onChange={e => setNewStaffEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addStaffEmail() }}
            />
            <button className="btn btn-primary btn-sm" onClick={addStaffEmail}>{t('settings.staffAddButton')}</button>
          </div>

          {staffEmails.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>{t('settings.staffEmptyText')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {staffEmails.map(s => (
                <div key={s.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--rs)', background: 'var(--surf2)' }}>
                  <span dir="ltr" style={{ fontSize: 13 }}>{s.email}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeStaffEmail(s.email)}>{t('settings.staffRemoveButton')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Customer Access PIN Modal */}
      {pinModalCustomer && (
        <div className="overlay" onClick={() => setPinModalCustomerId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('settings.pinCode')} — {pinModalCustomer.name}</div>

            <label className="lbl">{t('settings.pinModalLinkLabel')}</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input className="input" dir="ltr" readOnly value={portalUrlFor(pinModalCustomer)} onFocus={e => e.target.select()} style={{ fontSize: 12 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(portalUrlFor(pinModalCustomer))}>{t('settings.copy')}</button>
            </div>

            {pinModalCustomer.portal_pin ? (
              <>
                <label className="lbl">{t('settings.pinCode')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" dir="ltr" readOnly value={pinModalCustomer.portal_pin} onFocus={e => e.target.select()} style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', letterSpacing: '.1em' }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(pinModalCustomer.portal_pin)}>{t('settings.copy')}</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>
                  {t('settings.pinHasCodeNote')}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
                {t('settings.pinNoCodeNote')}
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => generateAndSetPin(pinModalCustomer)} disabled={settingPin === pinModalCustomer.id}>
                {settingPin === pinModalCustomer.id ? t('settings.generating') : t('settings.generateNewPin')}
              </button>
              <button className="btn btn-primary" onClick={() => setPinModalCustomerId(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="overlay" onClick={() => setShowAddCustomer(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('settings.addCustomerModalTitle')}</div>
            <div style={{ marginBottom: 16 }}>
              <label className="lbl">{t('settings.customerNameLabel')}</label>
              <input
                className="input"
                placeholder={t('settings.customerNamePlaceholder')}
                value={newCustomerName}
                onChange={e => setNewCustomerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomer()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddCustomer(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={addCustomer}>{t('common.add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Menu Item Modal */}
      {showAddItem && (
        <div className="overlay" onClick={() => setShowAddItem(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('settings.addItemModalTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="lbl">{t('settings.nameHeLabel')}</label>
                <input className="input" placeholder="קרואסון חמאה" value={newItem.name_he} onChange={e => setNewItem(p => ({ ...p, name_he: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">{t('settings.nameEnLabel')}</label>
                <input className="input" placeholder="Butter Croissant" dir="ltr" value={newItem.name_en} onChange={e => setNewItem(p => ({ ...p, name_en: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="lbl">{t('settings.unitLabel')}</label>
                  <select className="input" value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">{t('common.category')}</label>
                  <input className="input" placeholder="מאפים" value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="lbl">{t('common.supplier')}</label>
                  <select className="input" value={newItem.supplier_id} onChange={e => setNewItem(p => ({ ...p, supplier_id: e.target.value }))}>
                    <option value="">{t('settings.noSupplierOption')}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">{t('settings.priceLabel')}</label>
                  <input className="input" type="number" min="0" step="0.1" placeholder={t('settings.priceNotSetPlaceholder')} value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddItem(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={addMenuItem}>{t('common.add')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
