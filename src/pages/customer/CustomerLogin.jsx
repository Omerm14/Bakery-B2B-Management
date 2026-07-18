import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// Single-screen phone + PIN login, scoped to one bakery client via the
// :orgSlug URL segment (/portal/:orgSlug/login — see App.jsx) since phone
// numbers are only unique WITHIN one org's customer list, not globally.
// No OTP, no messaging service of any kind: get_customer_auth_email()
// resolves (orgSlug, phone) to the customer's synthetic auth email (set up
// by staff via Settings' "set/reset PIN" button), then a plain
// signInWithPassword() call mints the session — picked up automatically by
// App.jsx's existing onAuthStateChange listener, same as the staff
// Google-OAuth flow.
export default function CustomerLogin() {
  const { orgSlug } = useParams()
  const [searchParams] = useSearchParams()
  // The link staff shares (Settings -> customer -> "set/reset PIN") embeds
  // the customer's own phone number, so they only need to type the PIN.
  const [phone, setPhone] = useState(() => searchParams.get('phone') || '')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contact, setContact] = useState(null)
  const [customerName, setCustomerName] = useState(null)
  const [branding, setBranding] = useState({ logo_url: null, business_name: null })
  const [orgNotFound, setOrgNotFound] = useState(false)

  useEffect(() => {
    supabase.rpc('get_organization_public_info', { p_slug: orgSlug }).then(({ data, error }) => {
      const org = data?.[0]
      if (error || !org) { setOrgNotFound(true); return }
      setBranding({ business_name: org.business_name, logo_url: org.logo_url })
      setContact({ name: org.support_contact_name, phone: org.support_contact_phone, whatsapp_link: org.support_contact_whatsapp_link })
    })

    // Only look up a name for the phone pre-filled from the shared link
    // (not on every keystroke as someone types a phone manually) — keeps
    // this to the intended "you clicked your own link" personalization,
    // not an open phone-to-name lookup surface.
    const initialPhone = searchParams.get('phone')
    if (initialPhone) {
      supabase.rpc('get_customer_display_name', { p_org_slug: orgSlug, p_phone: initialPhone })
        .then(({ data }) => { if (data) setCustomerName(data) })
    }
  }, [orgSlug])

  useEffect(() => {
    document.title = branding.business_name ? `כניסה — ${branding.business_name}` : 'כניסה להזמנות'
  }, [branding.business_name])

  async function login() {
    if (!phone.trim() || !pin.trim()) return
    setLoading(true)
    setError('')

    const { data: authEmail, error: lookupErr } = await supabase.rpc('get_customer_auth_email', { p_org_slug: orgSlug, p_phone: phone.trim() })
    if (lookupErr || !authEmail) {
      setLoading(false)
      setError('מספר טלפון או קוד שגויים')
      return
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password: pin.trim() })
    setLoading(false)
    if (signInErr) { setError('מספר טלפון או קוד שגויים'); return }
    // No navigate() needed — App.jsx's onAuthStateChange picks up the new
    // session and routes to /portal/:orgSlug/orders on its own.
  }

  if (orgNotFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ width: '100%', maxWidth: 360, textAlign: 'center', direction: 'rtl' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>העסק לא נמצא</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>הקישור שקיבלת אינו תקין. פנו לצוות שממנו קיבלתם את הקישור.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, direction: 'rtl' }}>
        {branding.logo_url ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img
              src={branding.logo_url}
              alt={branding.business_name || 'לוגו'}
              style={{ maxHeight: 64, maxWidth: 200, objectFit: 'contain' }}
            />
          </div>
        ) : branding.business_name ? (
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 16, color: 'var(--t2)' }}>
            {branding.business_name}
          </div>
        ) : null}

        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
          {customerName ? `שלום, ${customerName}! 👋` : 'כניסה להזמנות'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>
          {customerName ? 'הזינו את קוד הגישה שקיבלתם כדי להיכנס להזמנות שלכם.' : 'הזן את מספר הטלפון וקוד הגישה שקיבלת.'}
        </div>

        <label className="lbl">מספר טלפון</label>
        <input
          className="input"
          dir="ltr"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="050-1234567"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          autoFocus={!phone}
          style={{ fontSize: 16 }}
        />

        <label className="lbl" style={{ marginTop: 12 }}>קוד גישה</label>
        <input
          className="input"
          dir="ltr"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="קוד הגישה שקיבלת"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          autoFocus={!!phone}
          style={{ fontSize: 16 }}
        />

        {error && <div className="alert alert-err" style={{ marginTop: 12 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={login} disabled={loading || !phone.trim() || !pin.trim()}>
          {loading ? 'נכנס...' : 'כניסה'}
        </button>

        {contact && (contact.phone || contact.whatsapp_link) && (
          <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', marginTop: 16 }}>
            לא זוכרים את הקוד או המספר לא מזוהה? יש לפנות ל{contact.name || 'הצוות'}
            {contact.phone && <> בטלפון <span dir="ltr">{contact.phone}</span></>}
            {contact.whatsapp_link && (
              <>
                {' '}או ב<a href={contact.whatsapp_link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>וואטסאפ</a>
              </>
            )}
            .
          </div>
        )}
      </div>
    </div>
  )
}
