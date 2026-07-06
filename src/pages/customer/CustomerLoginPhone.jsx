import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function CustomerLoginPhone() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendCode() {
    if (!phone.trim()) return
    setLoading(true)
    setError('')
    const { error: err } = await supabase.functions.invoke('send-customer-otp', { body: { phone: phone.trim() } })
    setLoading(false)
    if (err) { setError('שגיאה בשליחת הקוד — נסה שוב'); return }
    navigate('/portal/verify', { state: { phone: phone.trim() } })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, direction: 'rtl' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>כניסה להזמנות</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>הזן את מספר הטלפון הרשום — נשלח קוד חד-פעמי בוואטסאפ.</div>

        <label className="lbl">מספר טלפון</label>
        <input
          className="input"
          dir="ltr"
          placeholder="050-1234567"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendCode()}
          autoFocus
        />

        {error && <div className="alert alert-err" style={{ marginTop: 12 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={sendCode} disabled={loading || !phone.trim()}>
          {loading ? 'שולח...' : 'שלח קוד'}
        </button>
      </div>
    </div>
  )
}
