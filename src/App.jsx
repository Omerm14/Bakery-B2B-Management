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
import Landing from './pages/Landing'

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

function ProtectedLayout({ children, isDark, onToggleTheme }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="app-main">
        <GlobalHeader isDark={isDark} onToggleTheme={onToggleTheme} onMenuOpen={() => setMobileOpen(true)} />
        {children}
      </div>
      <ImportToast />
    </div>
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

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="shimmer" style={{ width: 200, height: 40 }} />
      </div>
    )
  }

  return (
    <ImportProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <Landing />} />
          <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
          {session ? (
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
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </BrowserRouter>
    </ImportProvider>
  )
}
