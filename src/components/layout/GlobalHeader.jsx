import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Sun, Moon, Search, Bell, Languages } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useTranslation } from '../../context/LanguageContext'
import { customerDisplayName } from '../../lib/displayName'

const TITLE_KEYS = {
  '/dashboard': 'nav.dashboard',
  '/orders': 'nav.orders',
  '/production': 'nav.production',
  '/packing': 'nav.packing',
  '/weekly': 'nav.weekly',
  '/history': 'nav.history',
  '/forecasting': 'nav.forecasting',
  '/settings': 'nav.settings',
}

const POLL_MS = 30000

function timeAgo(iso, lang) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (lang === 'en') {
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin} min ago`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return `${Math.round(diffHr / 24)}d ago`
  }
  if (diffMin < 1) return 'עכשיו'
  if (diffMin < 60) return `לפני ${diffMin} דק׳`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `לפני ${diffHr} שעות`
  return `לפני ${Math.round(diffHr / 24)} ימים`
}

// Lets the floor know a customer sent a self-service order update — the
// customer portal no longer auto-saves silently, so every send is a
// deliberate signal worth surfacing here rather than staff having to
// notice a change on their own.
function NotificationBell() {
  const { t, lang } = useTranslation()
  const userEmail = useCurrentUser()
  const navigate = useNavigate()
  const [unseenCount, setUnseenCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [auditRows, setAuditRows] = useState({})
  const wrapRef = useRef(null)

  const refreshCount = useCallback(async () => {
    const { count } = await supabase
      .from('order_change_notifications')
      .select('id', { count: 'exact', head: true })
      .is('seen_at', null)
    setUnseenCount(count || 0)
  }, [])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(id)
  }, [refreshCount])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // A ±10s window around each notification's created_at reliably isolates
  // just that send's changes in order_line_audit, since sendOrder() in
  // CustomerOrders.jsx does one batched upsert immediately followed by
  // the notification insert, all in the same request.
  async function fetchAuditRows(n) {
    const center = new Date(n.created_at).getTime()
    const { data, error } = await supabase
      .from('order_line_audit')
      .select('item_name_he, old_quantity, new_quantity, menu_items(name_he, name_en)')
      .eq('customer_id', n.customer_id)
      .eq('week_id', n.week_id)
      .eq('changed_via', 'customer_portal')
      .gte('created_at', new Date(center - 10000).toISOString())
      .lte('created_at', new Date(center + 10000).toISOString())
    if (error) { console.error('[NotificationBell audit]', error); return [] }
    return data || []
  }

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (!next) return
    setLoadingItems(true)
    const { data } = await supabase
      .from('order_change_notifications')
      .select('id, customer_id, week_id, created_at, seen_at, customers(name, name_en), weeks(label)')
      .order('created_at', { ascending: false })
      .limit(20)
    const list = data || []
    setItems(list)
    setLoadingItems(false)

    // The itemized breakdown is shown immediately, not behind a click — so
    // fetch every notification's rows up front instead of lazily on expand.
    const entries = await Promise.all(list.map(async n => [n.id, await fetchAuditRows(n)]))
    setAuditRows(Object.fromEntries(entries))

    // Viewing the list now IS viewing the detail, so mark everything unseen
    // as seen as soon as the panel opens instead of per-item on click.
    const unseenIds = list.filter(n => !n.seen_at).map(n => n.id)
    if (unseenIds.length) {
      const seenAt = new Date().toISOString()
      await supabase.from('order_change_notifications').update({ seen_at: seenAt, seen_by: userEmail }).in('id', unseenIds)
      setItems(prev => prev.map(i => unseenIds.includes(i.id) ? { ...i, seen_at: seenAt } : i))
      refreshCount()
    }
  }

  function goToOrder(n) {
    setOpen(false)
    navigate('/orders', { state: { customerId: n.customer_id } })
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button className="hd-btn" onClick={toggleOpen} aria-label={t('header.notifications')}>
        <Bell size={14} />
        {unseenCount > 0 && <span className="notif-badge">{unseenCount > 9 ? '9+' : unseenCount}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-title">{t('header.notificationsTitle')}</div>
          {loadingItems ? (
            <div className="notif-empty">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="notif-empty">{t('header.notificationsEmpty')}</div>
          ) : (
            items.map(n => {
              const rows = auditRows[n.id]
              return (
                <div key={n.id} className={`notif-item${!n.seen_at ? ' unseen' : ''}`}>
                  <div className="notif-item-header">
                    <div className="notif-item-name">{n.customers ? customerDisplayName(n.customers, lang) : t('common.customer')}</div>
                    <div className="notif-item-meta">{n.weeks?.label || ''} · {timeAgo(n.created_at, lang)}</div>
                  </div>
                  <div className="notif-item-detail">
                    {rows === undefined ? (
                      <div className="notif-empty">{t('common.loading')}</div>
                    ) : rows.length === 0 ? (
                      <div className="notif-empty">{t('header.notificationsNoDetail')}</div>
                    ) : (
                      rows.map((r, i) => {
                        const isNew = r.old_quantity === null
                        const increasing = !isNew && r.new_quantity > r.old_quantity
                        const color = isNew ? 'var(--accent)' : increasing ? 'var(--green)' : 'var(--red)'
                        const itemName = r.menu_items
                          ? (lang === 'en' ? (r.menu_items.name_en || r.menu_items.name_he) : r.menu_items.name_he)
                          : r.item_name_he
                        return (
                          <div key={i} className="notif-detail-row">
                            <span>{itemName || '—'}</span>
                            <span style={{ color }}>
                              {isNew ? `${t('header.notificationsNewItem')}: ${r.new_quantity}` : `${r.old_quantity} → ${r.new_quantity}`}
                            </span>
                          </div>
                        )
                      })
                    )}
                    <button type="button" className="notif-detail-goto" onClick={() => goToOrder(n)}>
                      {t('header.notificationsGoToOrder')}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function GlobalHeader({ isDark, onToggleTheme, onMenuOpen, onSearchOpen }) {
  const { pathname } = useLocation()
  const { t, toggleLang } = useTranslation()
  const title = t(TITLE_KEYS[pathname] || '')

  return (
    <header className="hd no-print">
      <button className="hd-btn hd-menu-btn" style={{ border: 'none' }} onClick={onMenuOpen} aria-label={t('header.menu')}>
        <Menu size={18} />
      </button>
      <span className="hd-title">{TITLE_KEYS[pathname] ? title : ''}</span>
      <div style={{ flex: 1 }} />
      <button className="hd-search" onClick={onSearchOpen} aria-label={t('header.search')}>
        <Search size={13} aria-hidden="true" />
        <span>{t('header.search')}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <NotificationBell />
      <button className="hd-btn" onClick={toggleLang} aria-label={t('header.lang')} title={t('header.lang')}>
        <Languages size={14} />
      </button>
      <button className="hd-btn" onClick={onToggleTheme} aria-label={isDark ? t('header.toggleDay') : t('header.toggleNight')}>
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  )
}
