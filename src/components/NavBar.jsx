import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/dashboard',   label: 'דשבורד' },
  { to: '/orders',      label: 'הזמנות' },
  { to: '/production',  label: 'ייצור היום' },
  { to: '/packing',     label: 'אריזה' },
  { to: '/weekly',      label: 'תוכנית שבועית' },
  { to: '/history',     label: 'היסטוריה' },
  { to: '/forecasting', label: 'תחזית' },
  { to: '/settings',    label: 'הגדרות' },
]

export default function NavBar() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function closeMenu() { setMenuOpen(false) }

  return (
    <nav className="nav">
      <a className="nav-brand" href="/orders">
        <span>נוגה</span> 🥐
      </a>
      <div className={'nav-links' + (menuOpen ? ' open' : '')}>
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            onClick={closeMenu}
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <div className="nav-right">
        <button className="btn btn-ghost btn-sm no-print" onClick={handleLogout}>יציאה</button>
        <button
          className={'hamburger no-print' + (menuOpen ? ' open' : '')}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="תפריט"
        >
          <span /><span /><span />
        </button>
      </div>
    </nav>
  )
}
