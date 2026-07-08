import { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Sidebar from './components/layout/Sidebar'
import GlobalHeader from './components/layout/GlobalHeader'
import Login from './pages/Login'
import Orders from './pages/Orders'
import Production from './pages/Production'
import Packing from './pages/Packing'
import Weekly from './pages/Weekly'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Forecasting from './pages/Forecasting'
import { ImportProvider, useImport } from './context/ImportContext'
import { ToastProvider } from './context/ToastContext'
import { LanguageProvider } from './context/LanguageContext'
import ToastHost from './components/ToastHost'
import SearchOverlay from './components/search/SearchOverlay'
import Landing from './pages/Landing'
import CustomerLogin from './pages/customer/CustomerLogin'
import CustomerOrders from './pages/customer/CustomerOrders'
import CustomerPortalDemo from './pages/customer/CustomerPortalDemo'

function ImportToast() {
  const { running, progress, logs } = useImport()
  const [visible, setVisible] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    if (running) { setVisible(true); setFadeOut(false) }
    else if (visible) {
      const t = setTimeout(() => { setFadeOut(true) }, 2000)
      const t2 = setTimeout(() => setVisible(false), 2800)
      return () => { clearTimeout(t); clearTimeout(t2) }
    }
  }, [running])

  if (!visible) return null

  const lastLog = logs[logs.length - 1] || ''
  const lineCount = logs.filter(l => l.startsWith('✅')).join(' ').match(/\d+ שורות חדשות/g)?.[0] || ''

  return (
    <div style={{
      position: 'fixed', bottom: 24, insetInlineStart: 24, zIndex: 9999,
      background: 'var(--surf2)', border: '1px solid var(--bdr2)',
      borderRadius: 12, padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: 'var(--shadow-pop)',
      opacity: fadeOut ? 0 : 1,
      transform: fadeOut ? 'translateY(8px)' : 'translateY(0)',
      transition: 'opacity .6s, transform .6s',
      minWidth: 260, maxWidth: 360,
    }}>
      {running ? (
        <div style={{ width: 18, height: 18, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
      ) : (
        <span style={{ fontSize: 18 }}>✅</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
          {running
            ? `מייבא קובץ ${progress.current}/${progress.total}…`
            : 'ייבוא הושלם'}
        </div>
        {running && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastLog.replace(/^[^\s]+\s/, '')}
          </div>
        )}
        {!running && lineCount && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>{lineCount}</div>
        )}
      </div>
    </div>
  )
}

function AccessPending() {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 16, padding: '32px 28px', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--t1)' }}>הגישה שלך ממתינה לאישור</h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--t3)', lineHeight: 1.6 }}>
          החשבון שלך התחבר בהצלחה, אך עדיין לא הוגדרה עבורו הרשאת גישה למערכת. פנה לצוות כדי להסדיר את הגישה.
        </p>
        <button onClick={handleSignOut} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--bdr2)', background: 'var(--surf1)', color: 'var(--t1)', cursor: 'pointer', fontSize: 14 }}>
          התנתקות
        </button>
      </div>
    </div>
  )
}

function ProtectedLayout({ children, isDark, onToggleTheme }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <LanguageProvider>
      <div className="app-shell">
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} isDark={isDark} />
        <div className="app-main">
          <GlobalHeader isDark={isDark} onToggleTheme={onToggleTheme} onMenuOpen={() => setMobileOpen(true)} onSearchOpen={() => setSearchOpen(true)} />
          {children}
        </div>
        <ImportToast />
        <ToastHost />
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </LanguageProvider>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [isDark, setIsDark] = useState(() => localStorage.getItem('floory_theme') !== 'day')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'night' : 'day'
    localStorage.setItem('floory_theme', isDark ? 'night' : 'day')
  }, [isDark])

  const toggleTheme = useCallback(() => setIsDark(v => !v), [])
  const role = session?.user?.app_metadata?.role
  const isCustomer = role === 'customer'
  const isStaff = role === 'staff'
  const homeFor = isCustomer ? '/portal/orders' : isStaff ? '/dashboard' : '/access-pending'

  // A client's branded custom domain (e.g. portal.urbanbakery.co, wired up
  // in Vercel per client) always means "customer ordering portal", never
  // the marketing site or staff login — regardless of which path a logged-
  // out visitor lands on.
  const isPortalHost = window.location.hostname.startsWith('portal.')

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="shimmer" style={{ width: 200, height: 40 }} />
      </div>
    )
  }

  return (
    <ToastProvider>
      <ImportProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={
              session ? <Navigate to={homeFor} replace />
                : isPortalHost ? <Navigate to="/portal/login" replace />
                : <Landing />
            } />
            <Route path="/login" element={session ? <Navigate to={homeFor} replace /> : <Login />} />
            <Route path="/portal/login" element={session ? <Navigate to={homeFor} replace /> : <CustomerLogin />} />
            <Route path="/portal/preview" element={<CustomerPortalDemo />} />
            {session && isCustomer ? (
              <>
                <Route path="/portal/orders" element={<CustomerOrders />} />
                <Route path="*" element={<Navigate to="/portal/orders" replace />} />
              </>
            ) : session && isStaff ? (
              <>
                <Route path="/dashboard" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Dashboard /></ProtectedLayout>} />
                <Route path="/orders" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Orders /></ProtectedLayout>} />
                <Route path="/production" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Production /></ProtectedLayout>} />
                <Route path="/packing" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Packing /></ProtectedLayout>} />
                <Route path="/weekly" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Weekly /></ProtectedLayout>} />
                <Route path="/history" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><History /></ProtectedLayout>} />
                <Route path="/forecasting" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Forecasting /></ProtectedLayout>} />
                <Route path="/settings" element={<ProtectedLayout isDark={isDark} onToggleTheme={toggleTheme}><Settings /></ProtectedLayout>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </>
            ) : session ? (
              <>
                <Route path="/access-pending" element={<AccessPending />} />
                <Route path="*" element={<Navigate to="/access-pending" replace />} />
              </>
            ) : (
              <Route path="*" element={<Navigate to={isPortalHost ? '/portal/login' : '/login'} replace />} />
            )}
          </Routes>
        </BrowserRouter>
      </ImportProvider>
    </ToastProvider>
  )
}
