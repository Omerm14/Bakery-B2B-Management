import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../context/LanguageContext'
import { useBranding } from '../../hooks/useBranding'
import {
  LayoutDashboard, ClipboardList, Factory, PackageCheck, CalendarDays, History, TrendingUp, Settings, X, LogOut,
} from 'lucide-react'

const links = [
  { to: '/dashboard',   key: 'nav.dashboard',   Icon: LayoutDashboard },
  { to: '/orders',      key: 'nav.orders',      Icon: ClipboardList },
  { to: '/production',  key: 'nav.production',  Icon: Factory },
  { to: '/packing',     key: 'nav.packing',     Icon: PackageCheck },
  { to: '/weekly',      key: 'nav.weekly',      Icon: CalendarDays },
  { to: '/history',     key: 'nav.history',     Icon: History },
  { to: '/forecasting', key: 'nav.forecasting', Icon: TrendingUp },
]

export function BrandMark({ size = 28 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: size * 0.28, background: 'var(--accent-tint)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    </span>
  )
}

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const branding = useBranding()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function closeMenu() { setMobileOpen(false) }

  return (
    <>
      {mobileOpen && <button className="sb-scrim no-print" aria-label={t('nav.closeMenu')} onClick={closeMenu} />}
      <nav className={'sb no-print' + (mobileOpen ? ' sb-drawer drawer-anim' : '')} aria-label={t('nav.main')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 18px' }}>
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <BrandMark />
          )}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em', color: 'var(--t1)', flex: 1 }}>Floory</span>
          {mobileOpen && (
            <button onClick={closeMenu} aria-label={t('nav.close')}
              style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {links.map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} onClick={closeMenu}
              className={({ isActive }) => 'sb-nav-item' + (isActive ? ' active' : '')}>
              {({ isActive }) => (
                <>
                  <Icon size={15} strokeWidth={1.75} color={isActive ? 'var(--accent)' : 'currentColor'} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ flex: 1 }}>{t(key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ padding: '12px 2px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <NavLink to="/settings" onClick={closeMenu}
            className={({ isActive }) => 'sb-nav-item' + (isActive ? ' active' : '')}>
            {({ isActive }) => (
              <>
                <Settings size={15} strokeWidth={1.75} color={isActive ? 'var(--accent)' : 'currentColor'} style={{ flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{t('nav.settings')}</span>
              </>
            )}
          </NavLink>
          <button className="sb-nav-item" onClick={handleLogout} style={{ color: 'var(--red)' }}>
            <LogOut size={15} strokeWidth={1.75} style={{ flexShrink: 0, opacity: .8 }} aria-hidden="true" />
            <span style={{ flex: 1 }}>{t('nav.logout')}</span>
          </button>
        </div>
      </nav>
    </>
  )
}
