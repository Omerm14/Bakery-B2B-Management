import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: '📋',
    title: 'ניהול הזמנות שבועי',
    desc: 'טבלת הזמנות חכמה לכל לקוח — ימים, כמויות, עריכה ישירה. כמו Excel, רק חכם יותר.',
  },
  {
    icon: '🤖',
    title: 'נוגה — סוכנת WhatsApp',
    desc: 'לקוחות שולחים הזמנות בWhatsApp בעברית חופשית. נוגה מנתחת ומזינה אוטומטית לתוך המערכת.',
  },
  {
    icon: '🏭',
    title: 'תכנון ייצור יומי',
    desc: 'רשימת ייצור מסודרת לפי ספק וקטגוריה — כל בוקר יודעים בדיוק מה לייצר ובאיזה כמות.',
  },
  {
    icon: '📦',
    title: 'רשימת אריזה',
    desc: 'צ׳קליסט אריזה לכל לקוח — מסמנים פריט אחר פריט, המערכת זוכרת מה ארזנו.',
  },
]

const STEPS = [
  { num: '01', title: 'ייבוא נתונים', desc: 'מייבאים את קובצי ה-Excel הקיימים תוך דקות. הכל נשמר בענן.' },
  { num: '02', title: 'הזמנות נכנסות', desc: 'לקוחות שולחים הזמנות בWhatsApp — נוגה מזינה הכל אוטומטית.' },
  { num: '03', title: 'ייצור ואריזה', desc: 'הצוות עובד מהרשימות החכמות — ייצור, אריזה, משלוח. בלי טעויות.' },
]

function useScrollReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.style.opacity = '1'; el.style.transform = 'translateY(0)' }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function RevealSection({ children, delay = 0 }) {
  const ref = useScrollReveal()
  return (
    <div ref={ref} style={{ opacity: 0, transform: 'translateY(30px)', transition: `opacity .6s ${delay}ms ease, transform .6s ${delay}ms ease` }}>
      {children}
    </div>
  )
}

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'inherit', direction: 'rtl' }}>

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(11,15,26,.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--bdr)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🥐</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--t1)' }}>נוגה</span>
        </div>
        <Link to="/login" style={{
          padding: '8px 20px', background: 'var(--grad)', borderRadius: 8,
          color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none',
          transition: 'opacity .2s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >כניסה</Link>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '100px 40px 80px' }}>
        {/* Background effects */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div style={{
          position: 'absolute', top: -100, right: '20%',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(59,130,246,.12) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(60px)', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', top: 50, left: '10%',
          width: 350, height: 350,
          background: 'radial-gradient(circle, rgba(6,182,212,.08) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(50px)', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 100,
            background: 'rgba(6,182,212,.1)', border: '1px solid rgba(6,182,212,.2)',
            fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginBottom: 24,
          }}>
            ✨ ניהול הזמנות חכם למאפיות B2B
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900,
            color: 'var(--t1)', lineHeight: 1.15, marginBottom: 20, margin: '0 0 20px',
          }}>
            ניהול הזמנות חכם{' '}
            <span style={{
              background: 'var(--grad)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>למאפייה שלך</span>
          </h1>

          <p style={{ fontSize: 18, color: 'var(--t2)', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 40px' }}>
            מהזמנת WhatsApp של הלקוח ועד רשימת הייצור של הבוקר — הכל אוטומטי, מדויק, ובעברית.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" style={{
              padding: '14px 32px', background: 'var(--grad)', borderRadius: 10,
              color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 24px rgba(59,130,246,.3)',
            }}>
              התחל עכשיו
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
          </div>
        </div>

        {/* Hero card preview */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '60px auto 0', animation: 'loginFadeUp .8s ease .2s both' }}>
          <div style={{
            background: 'var(--surf)', border: '1px solid var(--bdr2)',
            borderRadius: 16, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>הזמנות שבועיות</span>
              <span style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>שבוע 29/6 – 4/7/25</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(6, 40px)', gap: 4 }}>
              {['פריט', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', padding: '4px 0', textAlign: i > 0 ? 'center' : 'right' }}>{h}</div>
              ))}
              {[
                ['קרואסון חמאה', 24, 24, 30, 24, 24, 20],
                ['עוגת גבינה', 3, '', 5, 3, '', 4],
                ['בגט', 8, 8, 8, 10, 8, 6],
              ].map((row, ri) => (
                row.map((cell, ci) => (
                  <div key={`${ri}-${ci}`} style={{
                    fontSize: ci === 0 ? 12 : 11,
                    fontWeight: ci === 0 ? 500 : 400,
                    color: ci === 0 ? 'var(--t1)' : cell ? 'var(--t2)' : 'var(--bdr2)',
                    padding: '6px 0', textAlign: ci > 0 ? 'center' : 'right',
                    borderBottom: '1px solid var(--bdr)',
                  }}>
                    {cell || (ci > 0 ? '—' : '')}
                  </div>
                ))
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 40px', maxWidth: 1000, margin: '0 auto' }}>
        <RevealSection>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600, marginBottom: 8 }}>יכולות</div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>כל מה שמאפייה צריכה</h2>
          </div>
        </RevealSection>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {FEATURES.map((f, i) => (
            <RevealSection key={i} delay={i * 80}>
              <div style={{
                background: 'var(--surf)', border: '1px solid var(--bdr)',
                borderRadius: 14, padding: 24,
                transition: 'border-color .2s, box-shadow .2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(6,182,212,.3)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(6,182,212,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)', marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </RevealSection>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '60px 40px 80px', background: 'var(--surf)', borderTop: '1px solid var(--bdr)', borderBottom: '1px solid var(--bdr)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <RevealSection>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600, marginBottom: 8 }}>איך זה עובד</div>
              <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>שלושה צעדים פשוטים</h2>
            </div>
          </RevealSection>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {STEPS.map((s, i) => (
              <RevealSection key={i} delay={i * 100}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: '#fff',
                  }}>{s.num}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t1)', marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: 'var(--t3)', lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 40px', textAlign: 'center' }}>
        <RevealSection>
          <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t1)', marginBottom: 12 }}>מוכנים להתחיל?</h2>
            <p style={{ fontSize: 15, color: 'var(--t3)', marginBottom: 32, lineHeight: 1.6 }}>
              הצטרפו למאפיות שכבר מנהלות את ההזמנות שלהן בצורה חכמה יותר.
            </p>
            <Link to="/login" style={{
              padding: '14px 40px', background: 'var(--grad)', borderRadius: 10,
              color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none',
              display: 'inline-block',
              boxShadow: '0 4px 24px rgba(59,130,246,.3)',
            }}>כניסה למערכת</Link>
          </div>
        </RevealSection>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--bdr)', padding: '24px 40px', textAlign: 'center', fontSize: 12, color: 'var(--t3)' }}>
        © 2025 נוגה — מערכת ניהול מאפייה
      </footer>
    </div>
  )
}
