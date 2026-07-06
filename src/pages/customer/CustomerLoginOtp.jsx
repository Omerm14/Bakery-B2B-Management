import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function CustomerLoginOtp() {
  const location = useLocation()
  const navigate = useNavigate()
  const phone = location.state?.phone
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!phone) {
    navigate('/portal/login', { replace: true })
    return null
  }

  async function verify() {
    if (!code.trim()) return
    setLoading(true)
    setError('')

    const { data, error: fnErr } = await supabase.functions.invoke('verify-customer-otp', { body: { phone, code: code.trim() } })
    if (fnErr || !data?.ok) {
      setLoading(false)
      setError(data?.error || 'קוד שגוי או שפג תוקפו')
      return
    }

    const { error: sessionErr } = await supabase.auth.verifyOtp({ email: data.email, token_hash: data.token_hash, type: 'magiclink' })
    setLoading(false)
    if (sessionErr) { setError('שגיאה בכניסה — נסה שוב'); return }
    navigate('/portal/orders', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, direction: 'rtl' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>הזן קוד אימות</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>שלחנו קוד בן 6 ספרות בוואטסאפ למספר {phone}.</div>

        <label className="lbl">קוד אימות</label>
        <input
          className="input"
          dir="ltr"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && verify()}
          autoFocus
        />

        {error && <div className="alert alert-err" style={{ marginTop: 12 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={verify} disabled={loading || code.trim().length !== 6}>
          {loading ? 'מאמת...' : 'כניסה'}
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => navigate('/portal/login')}>
          מספר אחר
        </button>
      </div>
    </div>
  )
}
