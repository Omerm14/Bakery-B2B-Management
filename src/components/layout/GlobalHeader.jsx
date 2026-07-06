import { useLocation } from 'react-router-dom'
import { Menu, Sun, Moon, Search } from 'lucide-react'

const TITLES = {
  '/dashboard': 'דשבורד',
  '/orders': 'הזמנות',
  '/production': 'ייצור היום',
  '/packing': 'אריזה',
  '/weekly': 'תוכנית שבועית',
  '/history': 'היסטוריה',
  '/forecasting': 'תחזית',
  '/settings': 'הגדרות',
}

export default function GlobalHeader({ isDark, onToggleTheme, onMenuOpen, onSearchOpen }) {
  const { pathname } = useLocation()
  const title = TITLES[pathname] || ''

  return (
    <header className="hd no-print">
      <button className="hd-btn hd-menu-btn" style={{ border: 'none' }} onClick={onMenuOpen} aria-label="תפריט">
        <Menu size={18} />
      </button>
      <span className="hd-title">{title}</span>
      <div style={{ flex: 1 }} />
      <button className="hd-search" onClick={onSearchOpen} aria-label="חיפוש">
        <Search size={13} aria-hidden="true" />
        <span>חיפוש</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button className="hd-btn" onClick={onToggleTheme} aria-label={isDark ? 'עבור למצב יום' : 'עבור למצב לילה'}>
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  )
}
