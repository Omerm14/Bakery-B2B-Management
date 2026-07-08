import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../context/LanguageContext'
import { useBranding } from '../../hooks/useBranding'
import {
  LayoutDashboard, ClipboardList, ShoppingCart, PackageCheck, CalendarDays, History, TrendingUp, Settings, X, LogOut, ChevronLeft,
} from 'lucide-react'
import flooryIcon from '../../assets/floory/icon.svg'
import flooryLogoOnDark from '../../assets/floory/logo-horizontal-ondark.png'
import flooryLogoOnLight from '../../assets/floory/logo-horizontal-onlight.png'

const links = [
  { to: '/dashboard',   key: 'nav.dashboard',   Icon: LayoutDashboard },
  { to: '/orders',      key: 'nav.orders',      Icon: ClipboardList },
  { to: '/production',  key: 'nav.production',  Icon: ShoppingCart },
  { to: '/packing',     key: 'nav.packing',     Icon: PackageCheck },
  { to: '/weekly',      key: 'nav.weekly',      Icon: CalendarDays },
  { to: '/history',     key: 'nav.history',     Icon: History },
  { to: '/forecasting', key: 'nav.forecasting', Icon: TrendingUp },
]

export function BrandMark({ size = 28 }) {
  return <img src={flooryIcon} alt="" width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0 }} />
}

export default function Sidebar({ mobileOpen, setMobileOpen, isDark }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const branding = useBranding()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('floory_sidebar_collapsed') === '1')

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('floory_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function closeMenu() { setMobileOpen(false) }

  return (
    <>
      {mobileOpen && <button className="sb-scrim no-print" aria-label={t('nav.closeMenu')} onClick={closeMenu} />}
      <nav className={'sb no-print' + (mobileOpen ? ' sb-drawer drawer-anim' : '') + (collapsed ? ' sb-collapsed' : '')} aria-label={t('nav.main')}>
        {!mobileOpen && (
          <button
            className="sb-collapse-btn no-print"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <ChevronLeft size={13} style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform .2s' }} />
          </button>
        )}

        {/* Scrolling happens in this inner wrapper, not on .sb itself —
            .sb needs overflow: visible so the collapse button (positioned
            just outside .sb's own edge) never gets clipped. */}
        <div className="sb-scroll">
          {collapsed ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 18px' }}>
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              ) : (
                <BrandMark />
              )}
            </div>
          ) : (
            <div style={{ padding: '4px 10px 18px' }}>
              {branding.logo_url && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <img src={branding.logo_url} alt="" style={{ height: 40, maxWidth: 180, objectFit: 'contain' }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={isDark ? flooryLogoOnDark : flooryLogoOnLight} alt="Floory" style={{ height: 24, width: 'auto' }} />
                <div style={{ flex: 1 }} />
                {mobileOpen && (
                  <button onClick={closeMenu} aria-label={t('nav.close')}
                    style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {links.map(({ to, key, Icon }) => (
              <NavLink key={to} to={to} onClick={closeMenu} title={t(key)}
                className={({ isActive }) => 'sb-nav-item' + (isActive ? ' active' : '') + (collapsed ? ' sb-nav-item-collapsed' : '')}>
                {({ isActive }) => (
                  <>
                    <Icon size={15} strokeWidth={1.75} color={isActive ? 'var(--accent)' : 'currentColor'} style={{ flexShrink: 0 }} aria-hidden="true" />
                    {!collapsed && <span style={{ flex: 1 }}>{t(key)}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ padding: '12px 2px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <NavLink to="/settings" onClick={closeMenu} title={t('nav.settings')}
              className={({ isActive }) => 'sb-nav-item' + (isActive ? ' active' : '') + (collapsed ? ' sb-nav-item-collapsed' : '')}>
              {({ isActive }) => (
                <>
                  <Settings size={15} strokeWidth={1.75} color={isActive ? 'var(--accent)' : 'currentColor'} style={{ flexShrink: 0 }} aria-hidden="true" />
                  {!collapsed && <span style={{ flex: 1 }}>{t('nav.settings')}</span>}
                </>
              )}
            </NavLink>
            <button className={'sb-nav-item' + (collapsed ? ' sb-nav-item-collapsed' : '')} onClick={handleLogout} style={{ color: 'var(--red)' }} title={t('nav.logout')}>
              <LogOut size={15} strokeWidth={1.75} style={{ flexShrink: 0, opacity: .8 }} aria-hidden="true" />
              {!collapsed && <span style={{ flex: 1 }}>{t('nav.logout')}</span>}
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
