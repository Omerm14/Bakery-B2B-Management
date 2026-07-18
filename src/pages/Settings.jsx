import { useState, useEffect, useRef } from 'react'
import { Plus, Upload, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { portalPath } from '../lib/host'
import { useImport } from '../context/ImportContext'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import { useToast } from '../context/ToastContext'
import SearchInput from '../components/SearchInput'
import { useTranslation } from '../context/LanguageContext'
import { useTenant } from '../context/TenantContext'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { trackEvent } from '../lib/posthog'

export default function Settings() {
  const toast = useToast()
  const { t } = useTranslation()
  const { organizationId, isSuperAdmin, organizations, setOrganizationId } = useTenant()
  const userEmail = useCurrentUser()
  const [tab, setTab] = useState('menu')
  const { menuItems, setMenuItems } = useMenuItems({ activeOnly: false })
  const { customers, setCustomers, createCustomer } = useCustomers({ activeOnly: false })
  const [suppliers, setSuppliers] = useState([])
  const [categories, setCategories] = useState([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [filterText, setFilterText] = useState('')
  const { running: importRunning, startImport } = useImport()
  const importFileRef = useRef()

  useEffect(() => { setFilterText('') }, [tab])

  // New item form
  const [newItem, setNewItem] = useState({ name_he: '', name_en: '', unit: 'יח׳', category: '', supplier_id: '', price: '' })
  const [showAddItem, setShowAddItem] = useState(false)
  const [showCategories, setShowCategories] = useState(false)

  useEffect(() => {
    if (!organizationId) { setSuppliers([]); return }
    supabase.from('suppliers').select('*').eq('organization_id', organizationId).order('name').then(({ data, error }) => {
      if (error) { console.error('[Settings suppliers]', error); toast.error(t('settings.toast.suppliersLoadFailed')) }
      setSuppliers(data || [])
    })
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) { setCategories([]); return }
    supabase.from('categories').select('*').eq('organization_id', organizationId).order('name').then(({ data, error }) => {
      if (error) { console.error('[Settings categories]', error); toast.error(t('settings.toast.categoriesLoadFailed')) }
      setCategories(data || [])
    })
  }, [organizationId])

  // ── Branding (customer login page white-label) ──────────────────────
  // Reads/writes organizations.business_name/logo_url directly (migration
  // 055) — replaces the old app_config('branding') key/value row now that
  // branding is a real per-org column, not a global singleton.
  const [branding, setBranding] = useState({ logo_url: null, business_name: null })
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    supabase.from('organizations').select('business_name, logo_url').eq('id', organizationId).maybeSingle().then(({ data, error }) => {
      if (error) { console.error('[Settings branding]', error); return }
      if (data) setBranding({ business_name: data.business_name, logo_url: data.logo_url })
    })
  }, [organizationId])

  async function saveBranding(next) {
    setBranding(next)
    const { error } = await supabase.from('organizations').update({ business_name: next.business_name, logo_url: next.logo_url }).eq('id', organizationId)
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

  // ── Staff access (memberships — migration 056, replaces staff_allowlist) ──
  const [staffEmails, setStaffEmails] = useState([])
  const [newStaffEmail, setNewStaffEmail] = useState('')

  useEffect(() => {
    if (!organizationId) { setStaffEmails([]); return }
    supabase.from('memberships').select('email').eq('organization_id', organizationId).order('email').then(({ data, error }) => {
      if (error) { console.error('[Settings memberships]', error); return }
      setStaffEmails(data || [])
    })
  }, [organizationId])

  async function addStaffEmail() {
    const email = newStaffEmail.trim().toLowerCase()
    if (!email) return
    const { data, error } = await supabase.from('memberships')
      .insert({ email, organization_id: organizationId, added_by: userEmail })
      .select('email').single()
    if (error) { toast.error(t('settings.toast.staffAddFailed')); return }
    setStaffEmails(prev => [...prev, data].sort((a, b) => a.email.localeCompare(b.email)))
    setNewStaffEmail('')
    toast.success(t('settings.toast.staffAdded'))
  }

  async function removeStaffEmail(email) {
    setStaffEmails(prev => prev.filter(s => s.email !== email))
    const { error } = await supabase.from('memberships').delete().eq('email', email).eq('organization_id', organizationId)
    if (error) { toast.error(t('settings.toast.staffRemoveFailed')) }
  }

  // ── Super-admin only: create a new client organization ──────────────
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSlug, setNewOrgSlug] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  async function createOrganization() {
    const name = newOrgName.trim()
    const slug = newOrgSlug.trim().toLowerCase()
    if (!name || !slug) return
    setCreatingOrg(true)
    try {
      const { data, error } = await supabase.from('organizations')
        .insert({ name, slug, created_by: userEmail })
        .select('id, name, slug').single()
      if (error) { toast.error(error.message); return }
      toast.success(`Organization created: ${data.name}`)
      setNewOrgName('')
      setNewOrgSlug('')
      setOrganizationId(data.id)
    } finally {
      setCreatingOrg(false)
    }
  }

  async function addMenuItem() {
    if (!newItem.name_he.trim()) return
    const { data, error } = await supabase.from('menu_items').insert({
      ...newItem,
      supplier_id: newItem.supplier_id || null,
      price: newItem.price ? parseFloat(newItem.price) : null,
      active: true,
      organization_id: organizationId,
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

  async function addCategory(name) {
    const value = name.trim()
    if (!value) return
    if (knownCategories.includes(value)) { toast.error(t('settings.toast.categoryAlreadyExists')); return }
    const { data, error } = await supabase.from('categories').insert({ name: value, organization_id: organizationId }).select().single()
    if (error) { toast.error(t('settings.toast.categoryUpdateFailed')); return }
    setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'he')))
    setNewCategoryName('')
  }

  // Renaming to an existing category name is allowed on purpose — it's the
  // natural way to merge two categories into one (e.g. "עוגות" into
  // "עוגות ועוגיות") without a separate merge action. In that case the old
  // category row is dropped (its name would collide) instead of renamed.
  async function renameCategory(oldName, newName) {
    const value = newName.trim()
    if (!value || value === oldName) return
    const prevCategories = categories
    const prevByItemId = new Map(menuItems.filter(i => i.category === oldName).map(i => [i.id, i.category]))
    const mergingIntoExisting = categories.some(c => c.name === value)

    setMenuItems(prev => prev.map(i => i.category === oldName ? { ...i, category: value } : i))
    setCategories(prev => mergingIntoExisting
      ? prev.filter(c => c.name !== oldName)
      : prev.map(c => c.name === oldName ? { ...c, name: value } : c))

    const [{ error: catError }, { error: itemsError }] = await Promise.all([
      mergingIntoExisting
        ? supabase.from('categories').delete().eq('name', oldName).eq('organization_id', organizationId)
        : supabase.from('categories').update({ name: value }).eq('name', oldName).eq('organization_id', organizationId),
      supabase.from('menu_items').update({ category: value }).eq('category', oldName).eq('organization_id', organizationId),
    ])
    if (catError || itemsError) {
      setCategories(prevCategories)
      setMenuItems(prev => prev.map(i => prevByItemId.has(i.id) ? { ...i, category: prevByItemId.get(i.id) } : i))
      toast.error(t('settings.toast.categoryUpdateFailed'))
    }
  }

  async function deleteCategory(name) {
    if (!window.confirm(`${t('settings.confirmDeleteCategory')} "${name}"?`)) return
    const prevCategories = categories
    const prevByItemId = new Map(menuItems.filter(i => i.category === name).map(i => [i.id, i.category]))
    setCategories(prev => prev.filter(c => c.name !== name))
    setMenuItems(prev => prev.map(i => i.category === name ? { ...i, category: null } : i))
    const [{ error: catError }, { error: itemsError }] = await Promise.all([
      supabase.from('categories').delete().eq('name', name).eq('organization_id', organizationId),
      supabase.from('menu_items').update({ category: null }).eq('category', name).eq('organization_id', organizationId),
    ])
    if (catError || itemsError) {
      setCategories(prevCategories)
      setMenuItems(prev => prev.map(i => prevByItemId.has(i.id) ? { ...i, category: prevByItemId.get(i.id) } : i))
      toast.error(t('settings.toast.categoryUpdateFailed'))
    }
  }

  async function updateItemNameHe(id, nameHe) {
    const value = nameHe.trim()
    const prevNameHe = menuItems.find(i => i.id === id)?.name_he
    if (!value || value === prevNameHe) return
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, name_he: value } : i))
    const { error } = await supabase.from('menu_items').update({ name_he: value }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, name_he: prevNameHe } : i))
      toast.error(t('settings.toast.nameHeUpdateFailed'))
    }
  }

  async function updateItemUnit(id, unit) {
    const prevUnit = menuItems.find(i => i.id === id)?.unit
    if (unit === prevUnit) return
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, unit } : i))
    const { error } = await supabase.from('menu_items').update({ unit }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, unit: prevUnit } : i))
      toast.error(t('settings.toast.unitUpdateFailed'))
    }
  }

  async function updateItemSupplier(id, supplierId) {
    const prevItem = menuItems.find(i => i.id === id)
    const prevSupplierId = prevItem?.supplier_id ?? null
    const prevSupplier = prevItem?.suppliers ?? null
    const value = supplierId || null
    if (value === prevSupplierId) return
    const nextSupplier = value ? suppliers.find(s => s.id === value) : null
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, supplier_id: value, suppliers: nextSupplier ? { name: nextSupplier.name } : null } : i))
    const { error } = await supabase.from('menu_items').update({ supplier_id: value }).eq('id', id)
    if (error) {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, supplier_id: prevSupplierId, suppliers: prevSupplier } : i))
      toast.error(t('settings.toast.supplierUpdateFailed'))
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

  // Dedicated "Edit Customer" modal — consolidates every editable customer
  // field (including name, which has no inline editor at all) in one place
  // instead of growing the table with more inline columns.
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', name_en: '', phone: '', contact_person: '', email: '' })
  const [savingCustomer, setSavingCustomer] = useState(false)

  function openEditCustomer(c) {
    setEditingCustomer(c)
    setEditForm({
      name: c.name || '',
      name_en: c.name_en || '',
      phone: c.phone || '',
      contact_person: c.contact_person || '',
      email: c.email || '',
    })
  }

  async function saveEditCustomer() {
    if (!editingCustomer || savingCustomer) return
    const name = editForm.name.trim()
    if (!name) { toast.error(t('settings.customerNameRequired')); return }
    const payload = {
      name,
      name_en: editForm.name_en.trim() || null,
      phone: editForm.phone.trim() || null,
      contact_person: editForm.contact_person.trim() || null,
      email: editForm.email.trim() || null,
    }
    const prev = editingCustomer
    setSavingCustomer(true)
    setCustomers(list => list.map(c => c.id === prev.id ? { ...c, ...payload } : c))
    const { error } = await supabase.from('customers').update(payload).eq('id', prev.id)
    setSavingCustomer(false)
    if (error) {
      setCustomers(list => list.map(c => c.id === prev.id ? prev : c))
      toast.error(t('settings.toast.customerUpdateFailed'))
      return
    }
    toast.success(t('settings.toast.customerUpdated'))
    setEditingCustomer(null)
  }

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

  const [currentOrgSlug, setCurrentOrgSlug] = useState(null)
  useEffect(() => {
    if (!organizationId) return
    supabase.from('organizations').select('slug').eq('id', organizationId).maybeSingle()
      .then(({ data }) => setCurrentOrgSlug(data?.slug || null))
  }, [organizationId])

  function portalUrlFor(customer) {
    return `${window.location.origin}${portalPath(currentOrgSlug, customer.phone)}`
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
      trackEvent('customer_pin_reset')
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
  // Union of the categories table (source of truth, including categories
  // with zero items) and whatever's still on menu_items — covers rows
  // written before the categories table existed, or any other drift.
  const knownCategories = [...new Set([...categories.map(c => c.name), ...menuItems.map(i => i.category).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, 'he'))

  const sortedMenuItems = [...menuItems].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name_he.localeCompare(b.name_he, 'he')
  })
  const sortedCustomers = [...customers].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name, 'he')
  })

  function handleCategoryChange(itemId, e) {
    const value = e.target.value
    if (value === '__new__') {
      const name = window.prompt(t('settings.newCategoryPrompt'))
      const trimmed = name?.trim()
      if (!trimmed) return
      if (!knownCategories.includes(trimmed)) addCategory(trimmed)
      updateItemCategory(itemId, trimmed)
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
          <div className="itbl-wrap">
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
        </div>
      )}
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
        {[['menu', t('settings.tabs.menu')], ['customers', t('common.customers')], ['import', t('settings.importExcel')], ['branding', t('settings.tabs.branding')], ['staff', t('settings.tabs.staff')], ...(isSuperAdmin ? [['orgs', 'Organizations']] : [])].map(([k, l]) => (
          <button key={k} className={'btn btn-sm ' + (tab === k ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* MENU ITEMS */}
      {tab === 'menu' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowCategories(true)}>
              <Pencil size={14} /> {t('settings.manageCategories')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(true)}>
              <Plus size={14} /> {t('settings.addItem')}
            </button>
          </div>
          <SearchInput value={filterText} onChange={setFilterText} placeholder={t('settings.searchItemPlaceholder')} />
          <div className="card" style={{ padding: 0 }}>
            <div className="itbl-wrap">
            <table className="itbl" style={{ minWidth: 800 }}>
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
                    <td>
                      <input
                        className="input"
                        style={{ width: 130, padding: '4px 8px', fontWeight: 500 }}
                        defaultValue={item.name_he}
                        onBlur={e => updateItemNameHe(item.id, e.target.value)}
                      />
                    </td>
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
                    <td>
                      <select
                        className="input"
                        style={{ fontSize: 12, padding: '4px 8px', minWidth: 90 }}
                        value={item.unit}
                        onChange={e => updateItemUnit(item.id, e.target.value)}
                      >
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
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
                    <td>
                      <select
                        className="input"
                        style={{ fontSize: 12, padding: '4px 8px', minWidth: 130 }}
                        value={item.supplier_id || ''}
                        onChange={e => updateItemSupplier(item.id, e.target.value)}
                      >
                        <option value="">{t('settings.noSupplierOption')}</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
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
            <div className="itbl-wrap">
            <table className="itbl" style={{ minWidth: 700 }}>
              <thead>
                <tr><th>{t('settings.col.name')}</th><th>{t('settings.col.nameEn')}</th><th>{t('settings.col.phone')}</th><th>{t('settings.col.portalAccess')}</th><th>{t('settings.col.status')}</th><th></th></tr>
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
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditCustomer(c)} title={t('settings.editCustomerTitle')} aria-label={t('settings.editCustomerTitle')}>
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT */}
      {tab === 'import' && <ImportTab />}

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

      {/* ORGANIZATIONS (super-admin only) */}
      {tab === 'orgs' && isSuperAdmin && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="section-title">Client organizations</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>
            Create a new client organization, or switch which one you're currently viewing/editing.
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              className="input"
              placeholder="Name (e.g. Jorno)"
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
            />
            <input
              className="input"
              dir="ltr"
              placeholder="slug (e.g. jorno)"
              value={newOrgSlug}
              onChange={e => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              onKeyDown={e => e.key === 'Enter' && createOrganization()}
            />
            <button className="btn btn-primary btn-sm" onClick={createOrganization} disabled={creatingOrg || !newOrgName.trim() || !newOrgSlug.trim()}>
              {creatingOrg ? '…' : t('common.add')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {organizations.map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--rs)', background: o.id === organizationId ? 'var(--accent-tint)' : 'var(--surf2)' }}>
                <span style={{ fontSize: 13 }}>{o.name} <span style={{ color: 'var(--t3)', fontSize: 11 }} dir="ltr">/{o.slug}</span></span>
                {o.id === organizationId ? (
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Viewing</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setOrganizationId(o.id)}>Switch</button>
                )}
              </div>
            ))}
          </div>
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

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="overlay" onClick={() => setEditingCustomer(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('settings.editCustomerModalTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="lbl">{t('settings.customerNameLabel')}</label>
                <input
                  className="input"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="lbl">{t('settings.col.nameEn')}</label>
                <input
                  className="input"
                  dir="ltr"
                  value={editForm.name_en}
                  onChange={e => setEditForm(f => ({ ...f, name_en: e.target.value }))}
                />
              </div>
              <div>
                <label className="lbl">{t('settings.col.phone')}</label>
                <input
                  className="input"
                  dir="ltr"
                  placeholder="050-1234567"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="lbl">{t('settings.contactPersonLabel')}</label>
                <input
                  className="input"
                  value={editForm.contact_person}
                  onChange={e => setEditForm(f => ({ ...f, contact_person: e.target.value }))}
                />
              </div>
              <div>
                <label className="lbl">{t('settings.emailLabel')}</label>
                <input
                  className="input"
                  dir="ltr"
                  type="email"
                  placeholder="name@example.com"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEditCustomer()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditingCustomer(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={saveEditCustomer} disabled={savingCustomer}>
                {savingCustomer ? t('settings.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Categories Modal */}
      {showCategories && (
        <div className="overlay" onClick={() => setShowCategories(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('settings.categoriesModalTitle')}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder={t('settings.addCategoryPlaceholder')}
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory(newCategoryName)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => addCategory(newCategoryName)}>
                <Plus size={14} /> {t('settings.addCategoryButton')}
              </button>
            </div>
            {knownCategories.length === 0 ? (
              <div style={{ color: 'var(--t3)', fontSize: 13.5 }}>{t('settings.categoriesEmpty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {knownCategories.map(cat => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      defaultValue={cat}
                      onBlur={e => renameCategory(cat, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                    />
                    <span style={{ fontSize: 12, color: 'var(--t3)', minWidth: 60, textAlign: 'center' }}>
                      {menuItems.filter(i => i.category === cat).length} {t('common.items')}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)' }}
                      onClick={() => deleteCategory(cat)}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowCategories(false)}>{t('common.close')}</button>
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
