import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// Single-screen phone + PIN login. No OTP, no messaging service of any
// kind: get_customer_auth_email() resolves the phone to the customer's
// synthetic auth email (set up by staff via Settings' "set/reset PIN"
// button), then a plain signInWithPassword() call mints the session —
// picked up automatically by App.jsx's existing onAuthStateChange
// listener, same as the staff Google-OAuth flow.
export default function CustomerLogin() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function login() {
    if (!phone.trim() || !pin.trim()) return
    setLoading(true)
    setError('')

    const { data: authEmail, error: lookupErr } = await supabase.rpc('get_customer_auth_email', { p_phone: phone.trim() })
    if (lookupErr || !authEmail) {
      setLoading(false)
      setError('מספר טלפון או קוד שגויים')
      return
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password: pin.trim() })
    setLoading(false)
    if (signInErr) { setError('מספר טלפון או קוד שגויים'); return }
    // No navigate() needed — App.jsx's onAuthStateChange picks up the new
    // session and routes to /portal/orders on its own.
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, direction: 'rtl' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>כניסה להזמנות</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>הזן את מספר הטלפון וקוד הגישה שקיבלת.</div>

        <label className="lbl">מספר טלפון</label>
        <input
          className="input"
          dir="ltr"
          placeholder="050-1234567"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          autoFocus
        />

        <label className="lbl" style={{ marginTop: 12 }}>קוד גישה</label>
        <input
          className="input"
          dir="ltr"
          type="password"
          placeholder="קוד הגישה שקיבלת"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
        />

        {error && <div className="alert alert-err" style={{ marginTop: 12 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={login} disabled={loading || !phone.trim() || !pin.trim()}>
          {loading ? 'נכנס...' : 'כניסה'}
        </button>
      </div>
    </div>
  )
}
