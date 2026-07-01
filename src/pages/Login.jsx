import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SAMPLE_ORDERS = [
  { customer: 'קפה לואיז', items: [{ name: 'קרואסון חמאה', qty: 24 }, { name: 'בגט', qty: 6 }] },
  { customer: 'מסעדת הים', items: [{ name: 'עוגת גבינה', qty: 3 }, { name: 'פוקצ׳ה', qty: 8 }] },
  { customer: 'בית קפה רוטשילד', items: [{ name: 'רולדת שוקולד', qty: 2 }, { name: 'מאפין בלוברי', qty: 12 }] },
  { customer: 'סניף תל אביב', items: [{ name: 'לחם שיפון', qty: 5 }, { name: 'קרואסון שקדים', qty: 18 }] },
]

function AnimatedMetric({ target, label, prefix = '', suffix = '' }) {
  const [val, setVal] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const steps = 40
    let i = 0
    const timer = setInterval(() => {
      i++
      setVal(Math.round(target * (i / steps)))
      if (i >= steps) clearInterval(timer)
    }, 30)
    return () => clearInterval(timer)
  }, [target])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', lineHeight: 1 }}>
        {prefix}{val.toLocaleString('he-IL')}{suffix}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t3)' }}>{label}</div>
    </div>
  )
}

function FloatingCard({ order, style }) {
  return (
    <div style={{
      background: 'rgba(17,24,39,.85)',
      border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 12,
      padding: '14px 16px',
      backdropFilter: 'blur(12px)',
      minWidth: 220,
      ...style,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)', marginBottom: 8 }}>{order.customer}</div>
      {order.items.map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: i < order.items.length - 1 ? 4 : 0 }}>
          <span>{item.name}</span>
          <span style={{ color: 'var(--t1)', fontWeight: 600 }}>×{item.qty}</span>
        </div>
      ))}
    </div>
  )
}

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleLogin() {
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/orders' },
    })
    if (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'inherit', background: 'var(--bg)' }}>

      {/* Left panel — visual / hero (desktop only) */}
      <div className="login-left" style={{
        flex: '0 0 44%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 48px',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Glow blob */}
        <div style={{
          position: 'absolute', top: '30%', left: '20%',
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(6,182,212,.15) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(40px)', zIndex: 0,
        }} />

        {/* Floating cards */}
        <FloatingCard order={SAMPLE_ORDERS[0]} style={{
          position: 'absolute', bottom: '38%', left: 40, zIndex: 2,
          animation: 'floatCard 5s ease-in-out infinite',
        }} />
        <FloatingCard order={SAMPLE_ORDERS[1]} style={{
          position: 'absolute', bottom: '18%', right: 32, zIndex: 2,
          animation: 'floatCard 6.5s ease-in-out infinite 1s',
        }} />
        <FloatingCard order={SAMPLE_ORDERS[2]} style={{
          position: 'absolute', bottom: '55%', right: 24, zIndex: 2,
          animation: 'floatCard 7s ease-in-out infinite 0.5s',
        }} />

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 3 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--t1)', lineHeight: 1.2, marginBottom: 16, direction: 'rtl' }}>
            כל הזמנה.{' '}
            <span style={{
              background: 'var(--grad)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>בזמן.</span>
          </div>
          <div style={{ fontSize: 15, color: 'var(--t3)', lineHeight: 1.6, direction: 'rtl', marginBottom: 40, maxWidth: 300 }}>
            מערכת ניהול ההזמנות החכמה למאפיות B2B — מהלקוח ועד הייצור, בלחיצה אחת.
          </div>

          {/* Metrics */}
          <div style={{ display: 'flex', gap: 32, direction: 'rtl' }}>
            <AnimatedMetric target={320} label="הזמנות שבועיות" suffix="+" />
            <AnimatedMetric target={12} label="לקוחות פעילים" />
            <AnimatedMetric target={3} label="דקות לייבוא" />
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 32px',
        background: 'var(--surf)',
        position: 'relative',
      }}>
        {/* Mobile background effect */}
        <div className="login-mobile-bg" style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }} />
        <div className="login-mobile-glow" style={{
          position: 'absolute',
          top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(6,182,212,.08) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(60px)', zIndex: 0,
          pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 360, position: 'relative', zIndex: 1, animation: 'loginFadeUp .5s ease both' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40, direction: 'rtl' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'var(--grad)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>🥐</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t1)' }}>נוגה</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>מערכת ניהול מאפייה</div>
            </div>
          </div>

          <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--t1)', marginBottom: 6, direction: 'rtl' }}>ברוכים הבאים</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 32, direction: 'rtl' }}>היכנסו לניהול ההזמנות החכם של המאפייה</div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 8, color: 'var(--red)', fontSize: 13, direction: 'rtl',
            }}>{error}</div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '13px 20px',
              background: loading ? 'rgba(59,130,246,.5)' : 'var(--grad)',
              border: 'none', borderRadius: 10, color: '#fff',
              fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10,
              transition: 'opacity .2s, transform .1s',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="rgba(255,255,255,.85)"/>
                <path d="M3.964 10.707C3.784 10.167 3.682 9.59 3.682 9c0-.59.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="rgba(255,255,255,.7)"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="rgba(255,255,255,.9)"/>
              </svg>
            )}
            {loading ? (
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            ) : null}
            {loading ? 'מתחבר...' : 'כניסה עם Google'}
          </button>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--t3)', direction: 'rtl' }}>
            כניסה מאובטחת דרך Google OAuth
          </div>
        </div>
      </div>
    </div>
  )
}
