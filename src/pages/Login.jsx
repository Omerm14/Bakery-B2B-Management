import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import flooryLogoOnDark from '../assets/floory/logo-horizontal-ondark.png'

const FLOAT_CARDS = [
  { customer: 'קפה לואיז',         items: [{ name: 'קרואסון חמאה', qty: 24 }, { name: 'בגט', qty: 8 }],      init: 'ק', iColor: '#3DD6A3', left: '8%',  dur: '11s', del: '0s',   rot: '-2deg'  },
  { customer: 'מסעדת הים',         items: [{ name: 'עוגת גבינה', qty: 3 },   { name: 'פוקצ׳ה', qty: 6 }],   init: 'מ', iColor: '#3987E5', left: '52%', dur: '13s', del: '2.2s', rot: '1.5deg' },
  { customer: 'בית קפה רוטשילד',   items: [{ name: 'מאפין בלוברי', qty: 12 }, { name: 'כרוב ממולא', qty: 4 }], init: 'ב', iColor: '#3BD68C', left: '26%', dur: '14s', del: '4.8s', rot: '-1deg'  },
  { customer: 'סניף תל אביב',      items: [{ name: 'לחם שיפון', qty: 5 },    { name: 'קרואסון שקדים', qty: 18 }], init: 'ס', iColor: '#D9A93F', left: '68%', dur: '10s', del: '1.4s', rot: '2deg'   },
  { customer: 'מלון דן',           items: [{ name: 'בגט צרפתי', qty: 20 },   { name: 'רולדת שוקו', qty: 2 }], init: 'ד', iColor: '#D9A93F', left: '14%', dur: '12s', del: '6.5s', rot: '-1.5deg' },
  { customer: 'קייטרינג כהן',      items: [{ name: 'פיתה', qty: 40 },        { name: 'לחמניות', qty: 30 }],   init: 'כ', iColor: '#E8604C', left: '72%', dur: '15s', del: '3.6s', rot: '1deg'   },
  { customer: 'גן ילדים השקמה',    items: [{ name: 'רוגלך', qty: 24 },       { name: 'עוגיות', qty: 30 }],   init: 'ג', iColor: '#3DD6A3', left: '40%', dur: '11s', del: '8.2s', rot: '-0.5deg' },
  { customer: 'אולפן ABC',         items: [{ name: 'מאפה גבינה', qty: 8 },   { name: 'קרואסון', qty: 16 }],  init: 'א', iColor: '#3BD68C', left: '82%', dur: '13s', del: '5.1s', rot: '2.5deg' },
  { customer: 'מרכז קהילתי',       items: [{ name: 'עוגת שיש', qty: 2 },     { name: 'בורקס', qty: 20 }],    init: 'מ', iColor: '#3987E5', left: '33%', dur: '14s', del: '9.3s', rot: '1.5deg' },
  { customer: 'בית אבות הזהב',     items: [{ name: 'לחם לבן', qty: 10 },    { name: 'דניש', qty: 12 }],     init: 'ב', iColor: '#D9A93F', left: '60%', dur: '12s', del: '7.1s', rot: '-2deg'  },
]

function AnimatedMetric({ target, label, sub, isFloat }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const dur = 1400
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1)
      const e = 1 - Math.pow(1 - t, 3)
      setVal(isFloat ? parseFloat((target * e).toFixed(1)) : Math.round(target * e))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    const timeout = setTimeout(() => { raf = requestAnimationFrame(tick) }, 400)
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf) }
  }, [target])
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="login-metric-val" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: '#3DD6A3', lineHeight: 1, marginBottom: 4 }}>
        {val}{isFloat ? '' : '+'}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#A8B5AE', lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 10, color: '#6E7B74', marginTop: 2 }}>{sub}</div>
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
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-ui)' }}>
      <style>{`
        @keyframes floatCard {
          0%   { transform: translateY(110%) rotate(var(--rot)); opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateY(-20%) rotate(var(--rot)); opacity: 0; }
        }
        .login-float-card {
          position: absolute;
          animation: floatCard var(--dur) ease-in-out var(--del) infinite;
        }
        @keyframes loginFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .login-fade-in { animation: loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) both; }
        .login-fade-in-1 { animation: loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.1s both; }
        .login-fade-in-2 { animation: loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.2s both; }
        .login-fade-in-3 { animation: loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.28s both; }
        .login-fade-in-4 { animation: loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.38s both; }
        @keyframes metricGlow {
          0%, 100% { text-shadow: 0 0 12px rgba(61,214,163,0); }
          50% { text-shadow: 0 0 18px rgba(61,214,163,.45); }
        }
        .login-metric-val { animation: metricGlow 3s ease-in-out infinite; }
        .login-google-btn:hover { background: rgba(242,241,234,.09) !important; transform: translateY(-1px); }
        .login-google-btn:active { transform: none; }
      `}</style>

      {/* ── Left panel (desktop only) ── */}
      <div className="login-left" style={{
        width: '44%', flexShrink: 0,
        background: '#0A0F0D',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Grid overlay */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(61,214,163,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(61,214,163,.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px' }} />
        {/* Radial glow top-left */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 70% 50% at 30% 35%, rgba(61,214,163,.18) 0%, transparent 65%)' }} />
        {/* Radial glow bottom-right */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 50% 40% at 75% 70%, rgba(217,169,63,.10) 0%, transparent 60%)' }} />
        {/* Top+bottom fade — blends cards in/out */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          background: 'linear-gradient(to top, #0A0F0D 0%, transparent 25%, transparent 75%, #0A0F0D 100%)' }} />

        {/* Floating cards */}
        {FLOAT_CARDS.map((c, i) => (
          <div key={i} className="login-float-card" style={{
            left: c.left, bottom: '-120px',
            '--dur': c.dur, '--del': c.del, '--rot': c.rot, zIndex: 1,
          }}>
            <div style={{
              background: 'rgba(17,25,23,.85)',
              border: '1px solid rgba(242,241,234,.10)',
              borderRadius: 10, padding: '10px 14px',
              backdropFilter: 'blur(12px)',
              minWidth: 190,
              boxShadow: '0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(242,241,234,.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: c.iColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 10, color: '#fff', flexShrink: 0,
                }}>{c.init}</div>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#A8B5AE' }}>{c.customer}</span>
              </div>
              {c.items.map((item, j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: j < c.items.length - 1 ? 4 : 0 }}>
                  <span style={{ color: '#6E7B74' }}>{item.name}</span>
                  <span style={{ color: '#F2F1EA', fontWeight: 700 }}>×{item.qty}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Content — on top of cards */}
        <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 48px' }}>
          {/* Logo */}
          <div className="login-fade-in" style={{ display: 'flex', alignItems: 'center' }}>
            <img src={flooryLogoOnDark} alt="Floory" style={{ height: 40, width: 'auto' }} />
          </div>

          {/* Hero copy */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="login-fade-in-1" style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(38px,4vw,58px)', letterSpacing: '-0.03em',
              lineHeight: 1.05, color: '#F2F1EA', marginBottom: 14, direction: 'rtl',
            }}>
              כל הזמנה.<br />
              <span style={{ color: '#3DD6A3' }}>בזמן.</span>
            </div>
            <p className="login-fade-in-2" style={{
              fontSize: 15, lineHeight: 1.7, color: '#A8B5AE', maxWidth: 320,
              marginBottom: 28, direction: 'rtl',
            }}>
              Floory מנהל את כל ההזמנות והמלאי שלך — מהלקוח ועד הייצור, בלי Excel, בלי טעויות.
            </p>

            {/* Metric strip — connected bordered panel */}
            <div className="login-fade-in-3" style={{ display: 'flex' }}>
              {[
                { val: 320, label: 'הזמנות שבועיות', sub: 'ממוצע לחנות' },
                { val: 12,  label: 'לקוחות פעילים',  sub: 'השבוע' },
                { val: 3,   label: 'שניות לעיבוד',    sub: 'מהזמנה ועד ייצור' },
              ].map((m, i) => (
                <div key={i} style={{
                  flex: 1, padding: '14px 16px',
                  borderTop: '1px solid rgba(242,241,234,.08)',
                  borderBottom: '1px solid rgba(242,241,234,.08)',
                  borderInlineStart: '1px solid rgba(242,241,234,.08)',
                  borderInlineEnd: i === 2 ? '1px solid rgba(242,241,234,.08)' : 'none',
                  borderRadius: i === 0 ? '10px 0 0 10px' : i === 2 ? '0 10px 10px 0' : 0,
                  background: 'rgba(61,214,163,.04)',
                }}>
                  <AnimatedMetric target={m.val} label={m.label} sub={m.sub} />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom integration strip */}
          <div className="login-fade-in-4" style={{ borderTop: '1px solid rgba(242,241,234,.07)', paddingTop: 20 }}>
            <div style={{ fontSize: 10, color: '#6E7B74', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>עובד עם</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              {/* WhatsApp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: .7 }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#A8B5AE', letterSpacing: '-0.01em' }}>WhatsApp</span>
              </div>
              <div style={{ width: 1, height: 16, background: 'rgba(242,241,234,.08)' }} />
              {/* Excel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: .7 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: '#217346', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M4 20V4h16v16H4zM4 12h16M12 4v16"/></svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#A8B5AE', letterSpacing: '-0.01em' }}>Excel</span>
              </div>
              <div style={{ width: 1, height: 16, background: 'rgba(242,241,234,.08)' }} />
              {/* Supabase */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: .7 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: '#3ecf8e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>S</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#A8B5AE', letterSpacing: '-0.01em' }}>Supabase</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel (login form) ── */}
      <div style={{
        flex: 1,
        background: '#111917',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px',
        position: 'relative',
      }}>
        {/* Mobile bg effects (shown only when left panel hidden) */}
        <div className="login-mobile-bg" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(61,214,163,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(61,214,163,.04) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }} />
        <div className="login-mobile-glow" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 50% at 50% 20%, rgba(61,214,163,.10) 0%, transparent 60%)',
        }} />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          {/* Mobile logo */}
          <div className="login-mobile-logo" style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            <img src={flooryLogoOnDark} alt="Floory" style={{ height: 34, width: 'auto' }} />
          </div>

          <div style={{ marginBottom: 28, direction: 'rtl' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: '#F2F1EA', marginBottom: 6 }}>ברוכים הבאים</h1>
            <p style={{ fontSize: 15, color: '#A8B5AE' }}>היכנסו לניהול ההזמנות והמלאי החכם של העסק שלכם.</p>

            {/* Feature callout */}
            <div style={{
              borderRadius: 10, border: '1px solid rgba(61,214,163,.35)',
              background: 'rgba(61,214,163,.06)', padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 14, marginTop: 20,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'rgba(61,214,163,.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3DD6A3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#F2F1EA', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  ניהול <span style={{ color: '#3DD6A3' }}>מלא</span> של ההזמנות והמלאי
                </div>
                <div style={{ fontSize: 12, color: '#6E7B74', marginTop: 3 }}>הזמנות · ייצור · אריזה · היסטוריה</div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', direction: 'rtl',
              background: 'rgba(232,96,76,.12)', border: '1px solid rgba(232,96,76,.30)',
              borderRadius: 8, color: '#E8604C', fontSize: 13,
            }}>{error}</div>
          )}

          {/* Google button — frosted glass style */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="login-google-btn"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 12, padding: '13px 0',
              background: 'rgba(242,241,234,0.06)',
              border: '1px solid rgba(242,241,234,0.12)',
              borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 15, color: '#F2F1EA',
              marginBottom: 18, opacity: loading ? 0.7 : 1,
              transition: 'background .2s, transform .15s',
            }}
          >
            {loading ? (
              <div style={{ width: 18, height: 18, border: '2px solid rgba(242,241,234,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
            )}
            {loading ? 'מתחבר...' : 'Continue with Google'}
          </button>

          <p style={{ fontSize: 13, color: '#6E7B74', textAlign: 'center', direction: 'rtl' }}>
            כניסה מאובטחת · הנתונים שלך מוגנים
          </p>
        </div>
      </div>
    </div>
  )
}
