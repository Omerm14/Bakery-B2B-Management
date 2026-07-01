import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import NavBar from './components/NavBar'
import Login from './pages/Login'
import Orders from './pages/Orders'
import Production from './pages/Production'
import Packing from './pages/Packing'
import Weekly from './pages/Weekly'
import Settings from './pages/Settings'

function ProtectedLayout({ children }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="shimmer" style={{ width: 200, height: 40 }} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/orders" replace /> : <Login />} />
        {session ? (
          <>
            <Route path="/orders" element={<ProtectedLayout><Orders /></ProtectedLayout>} />
            <Route path="/production" element={<ProtectedLayout><Production /></ProtectedLayout>} />
            <Route path="/packing" element={<ProtectedLayout><Packing /></ProtectedLayout>} />
            <Route path="/weekly" element={<ProtectedLayout><Weekly /></ProtectedLayout>} />
            <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}
