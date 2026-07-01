import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/orders',     label: 'הזמנות' },
  { to: '/production', label: 'ייצור היום' },
  { to: '/packing',    label: 'אריזה' },
  { to: '/weekly',     label: 'תוכנית שבועית' },
  { to: '/settings',   label: 'הגדרות' },
]

export default function NavBar() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <nav className="nav">
      <a className="nav-brand" href="/orders">
        <span>נוגה</span> 🥐
      </a>
      <div className="nav-links">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <div className="nav-right">
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          יציאה
        </button>
      </div>
    </nav>
  )
}
