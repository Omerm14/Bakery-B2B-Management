import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import flooryLogoOnDark from '../assets/floory/logo-horizontal-ondark.png'

const FEATURES = [
  { icon: '📋', title: 'הזמנות שבועיות', desc: 'טבלת הזמנות חכמה לכל לקוח — ימים, כמויות, עריכה ישירה. כמו Excel, רק חכם יותר.', accent: 'rgba(61,214,163,.45)' },
  { icon: '🤖', title: 'AI מ-WhatsApp',   desc: 'לקוחות שולחים הזמנות בWhatsApp בעברית. Floory מנתחת ומזינה אוטומטית.', accent: 'rgba(31,169,122,.45)' },
  { icon: '🏭', title: 'ייצור יומי',       desc: 'רשימת ייצור לפי ספק וקטגוריה — כל בוקר יודעים בדיוק מה לייצר ובאיזה כמות.', accent: 'rgba(59,214,140,.45)' },
  { icon: '📦', title: 'אריזה וסיום',      desc: 'צ׳קליסט אריזה לכל לקוח. מסמנים פריט אחר פריט, המערכת זוכרת מה ארזנו.', accent: 'rgba(217,169,63,.45)' },
]

const STEPS = [
  { num: '01', title: 'ייבוא נתונים',   desc: 'מייבאים את קובצי ה-Excel הקיימים תוך דקות. הכל נשמר בענן.' },
  { num: '02', title: 'הזמנות נכנסות', desc: 'לקוחות שולחים הזמנות בWhatsApp — Floory מזינה הכל אוטומטית.' },
  { num: '03', title: 'ייצור ואריזה',  desc: 'הצוות עובד מרשימות חכמות — ייצור, אריזה, משלוח. בלי טעויות.' },
]

const STATS = [
  { num: '320+', label: 'הזמנות שבועיות', sub: 'ממוצע לחנות' },
  { num: '+40%',  label: 'חיסכון בזמן', sub: 'לעומת Excel' },
  { num: '<3s',   label: 'עיבוד הזמנה', sub: 'מ-WhatsApp ועד ייצור' },
  { num: '100%',  label: 'כיסוי יומי', sub: 'ייצור + אריזה + היסטוריה' },
]

function useMouseSpotlight(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const move = (e) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--sx', `${e.clientX - r.left}px`)
      el.style.setProperty('--sy', `${e.clientY - r.top}px`)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])
}

function FeatCard({ f }) {
  const ref = useRef(null)
  const move = (e) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`)
    ref.current.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <div
      ref={ref}
      onMouseMove={move}
      style={{
        position: 'relative', background: 'var(--surf)', border: '1px solid var(--bdr)',
        borderRadius: 16, padding: 24, overflow: 'hidden',
        transition: 'border-color .3s, transform .3s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = f.accent.replace('.45)', '.6)'); e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Cursor spotlight */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none',
        background: `radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), ${f.accent.replace('.45)', '.12)')}, transparent 60%)`,
        transition: 'opacity .3s',
      }} className="feat-spotlight" />
      {/* Bottom accent bar */}
      <div style={{
        position: 'absolute', left: 0, bottom: 0, height: 2, width: 0,
        background: `linear-gradient(90deg, ${f.accent.replace('.45)', '1)')}, transparent)`,
        transition: 'width .4s cubic-bezier(.22,.61,.36,1)',
      }} className="feat-bar" />
      <div style={{
        width: 46, height: 46, borderRadius: 12, marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        background: `linear-gradient(135deg, ${f.accent.replace('.45)', '.16)')}, ${f.accent.replace('.45)', '.08)')})`,
        border: `1px solid ${f.accent.replace('.45)', '.25)')}`,
        position: 'relative', zIndex: 1,
      }}>{f.icon}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--t1)', marginBottom: 7, position: 'relative', zIndex: 1, direction: 'rtl' }}>{f.title}</div>
      <div style={{ fontSize: 14, color: 'var(--t3)', lineHeight: 1.65, position: 'relative', zIndex: 1, direction: 'rtl' }}>{f.desc}</div>

      <style>{`
        div:hover .feat-spotlight { opacity: 1; }
        div:hover .feat-bar { width: 100%; }
      `}</style>
    </div>
  )
}

function RevealDiv({ children, delay = 0, style }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('reveal-in') }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="reveal-block" style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  )
}

export default function Landing() {
  const spotRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const spot = spotRef.current
    const move = (e) => {
      if (spot) { spot.style.left = `${e.clientX}px`; spot.style.top = `${e.clientY}px` }
    }
    const scroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('mousemove', move)
    window.addEventListener('scroll', scroll)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('scroll', scroll) }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0A0F0D', fontFamily: 'var(--font-ui)', direction: 'rtl', overflowX: 'hidden' }}>
      <style>{`
        /* Page animations */
        @keyframes pgdrift1 { to { transform: translate(80px,60px) scale(1.1) } }
        @keyframes pgdrift2 { to { transform: translate(-70px,90px) scale(1.08) } }
        @keyframes pgdrift3 { to { transform: translate(60px,-50px) scale(1.12) } }
        @keyframes pgdrift4 { to { transform: translate(-50px,70px) scale(1.06) } }
        @keyframes floatChip { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes landingFade { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.35} }

        .reveal-block { opacity: 0; transform: translateY(26px); transition: opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1); }
        .reveal-block.reveal-in { opacity: 1; transform: none; }

        .land-nav-link { font-size: 14px; font-weight: 500; color: #A8B5AE; transition: color .2s; text-decoration: none; }
        .land-nav-link:hover { color: #F2F1EA; }

        .stat-cell:not(:last-child)::after { content:""; position:absolute; right:0; top:14%; height:72%; width:1px; background:rgba(242,241,234,.08); }

        .step-card:hover { border-color: rgba(61,214,163,.4); transform: translateY(-4px); }
        .cta-card-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 34px -8px rgba(61,214,163,.5); }

        @media(max-width:768px){
          .land-hero-grid { grid-template-columns: 1fr !important; }
          .land-hero-visual { display: none; }
          .land-feat-grid { grid-template-columns: 1fr !important; }
          .land-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .land-steps { grid-template-columns: 1fr !important; }
          .land-steps-line { display: none; }
          .land-nav-links-desktop { display: none !important; }
        }
      `}</style>

      {/* Fixed background blobs */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: '#0A0F0D', overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', filter: 'blur(100px)', background: 'radial-gradient(circle, rgba(61,214,163,.28), transparent 70%)', top: -200, left: -150, animation: 'pgdrift1 22s ease-in-out infinite alternate', willChange: 'transform' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', filter: 'blur(100px)', background: 'radial-gradient(circle, rgba(217,169,63,.18), transparent 70%)', top: '30%', right: -180, animation: 'pgdrift2 28s ease-in-out infinite alternate', willChange: 'transform' }} />
        <div style={{ position: 'absolute', width: 450, height: 450, borderRadius: '50%', filter: 'blur(90px)', background: 'radial-gradient(circle, rgba(61,214,163,.16), transparent 70%)', bottom: '10%', left: '20%', animation: 'pgdrift3 25s ease-in-out infinite alternate', willChange: 'transform' }} />
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, rgba(59,214,140,.12), transparent 70%)', bottom: -80, right: '5%', animation: 'pgdrift4 20s ease-in-out infinite alternate', willChange: 'transform' }} />
      </div>

      {/* Mouse spotlight */}
      <div ref={spotRef} style={{
        position: 'fixed', width: 900, height: 900, borderRadius: '50%',
        pointerEvents: 'none', zIndex: 0, transform: 'translate(-50%,-50%)',
        background: 'radial-gradient(circle at center, rgba(61,214,163,.07) 0%, rgba(31,169,122,.035) 30%, transparent 65%)',
        filter: 'blur(40px)', transition: 'left .5s, top .5s', left: '50%', top: '50%',
      }} />

      {/* Noise texture */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: .03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '256px 256px',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Nav ── */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 100,
          transition: 'background .3s, border-color .3s',
          background: scrolled ? 'rgba(10,15,13,.85)' : 'transparent',
          backdropFilter: scrolled ? 'blur(14px)' : 'none',
          borderBottom: `1px solid ${scrolled ? 'rgba(242,241,234,.07)' : 'transparent'}`,
        }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img src={flooryLogoOnDark} alt="Floory" style={{ height: 26, width: 'auto' }} />
            </div>
            <div className="land-nav-links-desktop" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <a href="#features" className="land-nav-link">יכולות</a>
              <a href="#how" className="land-nav-link">איך זה עובד</a>
            </div>
            <Link to="/login" style={{
              padding: '9px 22px', background: '#3DD6A3',
              borderRadius: 10, color: '#07120E', fontWeight: 600, fontSize: 14,
              textDecoration: 'none', boxShadow: '0 4px 18px -4px rgba(61,214,163,.5)',
              transition: 'transform .2s, box-shadow .2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px -4px rgba(61,214,163,.6)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 18px -4px rgba(61,214,163,.5)' }}
            >כניסה</Link>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section style={{ padding: '120px 0 80px', position: 'relative', overflow: 'hidden' }}>
          {/* Grid overlay */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, opacity: .45,
            backgroundImage: 'linear-gradient(rgba(61,214,163,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(61,214,163,.04) 1px, transparent 1px)',
            backgroundSize: '54px 54px',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 30%, transparent 75%)',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 30%, transparent 75%)',
          }} />

          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 2 }}>
            <div className="land-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 60, alignItems: 'center' }}>
              {/* Copy */}
              <div style={{ animation: 'landingFade .7s cubic-bezier(.16,1,.3,1) both' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                  background: '#111917', border: '1px solid rgba(242,241,234,.09)',
                  padding: '7px 14px 7px 10px', borderRadius: 100, fontSize: 13, color: '#A8B5AE', marginBottom: 26,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3BD68C', boxShadow: '0 0 0 3px rgba(59,214,140,.18)', flexShrink: 0, animation: 'pulse 1.6s infinite' }} />
                  פלטפורמת ניהול הזמנות ומלאי לעסקים
                </div>

                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(38px,5.4vw,62px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.03, marginBottom: 20, color: '#F2F1EA' }}>
                  ניהול הזמנות ומלאי חכם<br />
                  <span style={{ color: '#3DD6A3' }}>למאפייה שלך.</span>
                </h1>

                <p style={{ fontSize: 18, color: '#A8B5AE', marginBottom: 32, maxWidth: 520, lineHeight: 1.7 }}>
                  מהזמנת WhatsApp של הלקוח ועד רשימת הייצור של הבוקר — הכל אוטומטי, מדויק, ובעברית.
                </p>

                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
                  <Link to="/login" style={{
                    padding: '14px 28px', background: '#3DD6A3', borderRadius: 12,
                    color: '#07120E', fontWeight: 700, fontSize: 16, textDecoration: 'none',
                    boxShadow: '0 8px 24px -8px rgba(61,214,163,.6)',
                    transition: 'transform .25s, box-shadow .25s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 34px -8px rgba(61,214,163,.75)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(61,214,163,.6)' }}
                  >התחל עכשיו</Link>
                  <a href="#features" style={{
                    padding: '14px 28px', background: 'transparent', borderRadius: 12,
                    border: '1px solid rgba(242,241,234,.15)', color: '#F2F1EA',
                    fontWeight: 600, fontSize: 16, textDecoration: 'none',
                    transition: 'border-color .25s, background .25s, transform .25s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(61,214,163,.5)'; e.currentTarget.style.background = 'rgba(61,214,163,.06)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(242,241,234,.15)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none' }}
                  >צפה ביכולות</a>
                </div>

                {/* Trust line */}
                <div style={{ fontSize: 13, color: '#6E7B74', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span>✓ ייבוא Excel בדקות</span>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(242,241,234,.2)' }} />
                  <span>✓ ללא כרטיס אשראי</span>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(242,241,234,.2)' }} />
                  <span>✓ RTL מלא בעברית</span>
                </div>
              </div>

              {/* Hero visual — dashboard card */}
              <div className="land-hero-visual" style={{ animation: 'landingFade .7s cubic-bezier(.16,1,.3,1) .15s both' }}>
                <div style={{ position: 'relative' }}>
                  {/* Floating chips */}
                  {[
                    { label: '🥐 קרואסון ×24', top: '4%', left: 0, delay: 0 },
                    { label: '📦 אריזה הושלמה', top: '28%', right: 0, delay: '.8s' },
                    { label: '✅ נארז ×18', bottom: '26%', left: '-2%', delay: '1.6s' },
                    { label: '🚚 משלוח יצא', bottom: '2%', right: '6%', delay: '2.4s' },
                  ].map((chip, i) => (
                    <div key={i} style={{
                      position: 'absolute', ...chip,
                      background: 'rgba(17,25,23,.9)', border: '1px solid rgba(242,241,234,.1)',
                      borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 600, color: '#A8B5AE',
                      boxShadow: '0 12px 30px -16px rgba(0,0,0,.7)',
                      animation: `floatChip 5s ease-in-out ${chip.delay || '0s'} infinite`,
                      whiteSpace: 'nowrap', zIndex: 4,
                    }}>{chip.label}</div>
                  ))}

                  {/* Central dashboard card */}
                  <div style={{
                    position: 'relative', zIndex: 3, margin: '40px 20px',
                    background: 'linear-gradient(180deg,#17211E,#111917)',
                    border: '1px solid rgba(242,241,234,.1)',
                    borderRadius: 18, padding: 18,
                    boxShadow: '0 40px 80px -30px rgba(0,0,0,.85)',
                  }}>
                    {/* Gradient border */}
                    <div style={{
                      position: 'absolute', inset: -1, borderRadius: 18, padding: 1,
                      background: 'linear-gradient(135deg,rgba(61,214,163,.55),transparent 50%,rgba(217,169,63,.45))',
                      WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                      WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none',
                    }} />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#6E7B74' }}>הזמנות שבועיות</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#3BD68C', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3BD68C', animation: 'pulse 1.6s infinite' }} /> Live
                      </span>
                    </div>

                    {/* KPI row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      {[{ label: 'כמות השבוע', val: '320', color: '#F2F1EA' }, { label: 'לקוחות פעילים', val: '12', color: '#3BD68C' }].map((k, i) => (
                        <div key={i} style={{ background: '#0A0F0D', border: '1px solid rgba(242,241,234,.07)', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#6E7B74', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: k.color, marginTop: 3 }}>{k.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Order lines */}
                    {[
                      { name: 'קרואסון חמאה', qty: '×24', color: '#3DD6A3' },
                      { name: 'עוגת גבינה',   qty: '×3',  color: '#D9A93F' },
                      { name: 'בגט צרפתי',    qty: '×8',  color: '#3BD68C' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgba(242,241,234,.06)', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#A8B5AE' }}>
                          <div style={{ width: 6, height: 18, borderRadius: 3, background: row.color }} />
                          {row.name}
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#F2F1EA' }}>{row.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <section style={{ padding: '30px 0 60px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <RevealDiv>
              <div style={{
                background: 'linear-gradient(135deg,#17211E,#111917)',
                border: '1px solid rgba(242,241,234,.08)',
                borderRadius: 22, padding: '40px 28px',
                display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24,
                boxShadow: '0 30px 60px -40px rgba(0,0,0,.8)',
              }} className="land-stats-grid">
                {STATS.map((s, i) => (
                  <div key={i} className="stat-cell" style={{ textAlign: 'center', position: 'relative' }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,3.5vw,42px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
                      color: '#3DD6A3',
                    }}>{s.num}</div>
                    <div style={{ marginTop: 10, fontSize: 14, color: '#A8B5AE' }}>{s.label}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#6E7B74', fontStyle: 'italic' }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </RevealDiv>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" style={{ padding: '80px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <RevealDiv>
              <div style={{ marginBottom: 52 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: '#3DD6A3', marginBottom: 14 }}>
                  <span style={{ width: 18, height: 1, background: '#3DD6A3', display: 'inline-block' }} />
                  יכולות
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, color: '#F2F1EA' }}>כל מה שההזמנות שלך צריכות</h2>
                <p style={{ color: '#A8B5AE', marginTop: 14, fontSize: 17, maxWidth: 520 }}>ממשק אחד לניהול מלא — הזמנות, ייצור, אריזה, והיסטוריה. בלי Excel, בלי טעויות.</p>
              </div>
            </RevealDiv>
            <div className="land-feat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              {FEATURES.map((f, i) => (
                <RevealDiv key={i} delay={i * 80}>
                  <FeatCard f={f} />
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" style={{ padding: '80px 0', background: 'rgba(17,25,23,.6)', borderTop: '1px solid rgba(242,241,234,.05)', borderBottom: '1px solid rgba(242,241,234,.05)' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <RevealDiv>
              <div style={{ marginBottom: 52, textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: '#3DD6A3', marginBottom: 14 }}>
                  <span style={{ width: 18, height: 1, background: '#3DD6A3', display: 'inline-block' }} />
                  איך זה עובד
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, color: '#F2F1EA' }}>שלושה צעדים פשוטים</h2>
              </div>
            </RevealDiv>
            <div className="land-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, position: 'relative' }}>
              {/* Connector line */}
              <div className="land-steps-line" style={{
                position: 'absolute', top: 34, left: '14%', right: '14%', height: 1,
                background: 'linear-gradient(90deg,transparent,#3DD6A3,#D9A93F,transparent)', opacity: .5,
              }} />
              {STEPS.map((s, i) => (
                <RevealDiv key={i} delay={i * 120} style={{ position: 'relative', zIndex: 1 }}>
                  <div className="step-card" style={{
                    background: 'rgba(17,25,23,.8)', border: '1px solid rgba(242,241,234,.08)',
                    borderRadius: 18, padding: 28, transition: 'border-color .3s, transform .3s',
                  }}>
                    <div style={{
                      width: 68, height: 68, borderRadius: 18, display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#3DD6A3',
                      background: '#111917', border: '1px solid rgba(242,241,234,.09)',
                    }}>{s.num}</div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, marginBottom: 9, letterSpacing: '-0.01em', color: '#F2F1EA' }}>{s.title}</h3>
                    <p style={{ color: '#A8B5AE', fontSize: 15, lineHeight: 1.65 }}>{s.desc}</p>
                  </div>
                </RevealDiv>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ padding: '60px 0 90px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <RevealDiv>
              <div style={{
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(135deg,#0D1A16,#0F1A16)',
                border: '1px solid rgba(61,214,163,.3)',
                borderRadius: 26, padding: '70px 30px', textAlign: 'center',
                boxShadow: '0 40px 90px -40px rgba(61,214,163,.3)',
              }}>
                <div style={{
                  position: 'absolute', width: 400, height: 400, borderRadius: '50%',
                  filter: 'blur(80px)', opacity: .35,
                  background: 'radial-gradient(circle,#3DD6A3,transparent 70%)',
                  top: -180, left: '50%', transform: 'translateX(-50%)',
                }} />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, letterSpacing: '-0.02em', position: 'relative', color: '#F2F1EA' }}>
                  מוכנים להתחיל?
                </h2>
                <p style={{ color: '#A8B5AE', margin: '16px 0 32px', fontSize: 17, position: 'relative' }}>
                  הצטרפו לעסקים שכבר מנהלים את ההזמנות והמלאי שלהם בצורה חכמה יותר.
                </p>
                <Link to="/login" className="cta-card-btn" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '15px 36px', background: '#3DD6A3',
                  borderRadius: 12, color: '#07120E', fontWeight: 700, fontSize: 16,
                  textDecoration: 'none', position: 'relative',
                  boxShadow: '0 8px 24px -8px rgba(61,214,163,.6)',
                  transition: 'transform .25s, box-shadow .25s',
                }}>
                  כניסה למערכת
                </Link>
              </div>
            </RevealDiv>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid rgba(242,241,234,.06)', padding: '32px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img src={flooryLogoOnDark} alt="Floory" style={{ height: 18, width: 'auto', opacity: .85 }} />
            </div>
            <div style={{ fontSize: 13, color: '#6E7B74' }}>© 2025 Floory — Smart Floor Management</div>
            <Link to="/login" style={{ fontSize: 13, color: '#A8B5AE', textDecoration: 'none', transition: 'color .2s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#F2F1EA'}
              onMouseLeave={e => e.currentTarget.style.color = '#A8B5AE'}
            >כניסה</Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
