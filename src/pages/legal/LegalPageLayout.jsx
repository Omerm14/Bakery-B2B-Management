import { Link } from 'react-router-dom'
import flooryLogoOnDark from '../../assets/floory/logo-horizontal-ondark.png'

export default function LegalPageLayout({ title, updated, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0A0F0D', fontFamily: 'var(--font-ui)', direction: 'rtl' }}>
      <nav style={{ borderBottom: '1px solid rgba(242,241,234,.07)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          <Link to="/">
            <img src={flooryLogoOnDark} alt="Floory" style={{ height: 40, width: 'auto' }} />
          </Link>
          <Link to="/" style={{ fontSize: 14, color: '#A8B5AE', textDecoration: 'none' }}>← חזרה לדף הבית</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '56px 24px 100px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, letterSpacing: '-0.02em', color: '#F2F1EA', marginBottom: 8 }}>
          {title}
        </h1>
        {updated && (
          <p style={{ fontSize: 13, color: '#6E7B74', marginBottom: 40 }}>עודכן לאחרונה: {updated}</p>
        )}
        <div className="legal-content" style={{ color: '#C7D0CB', fontSize: 16, lineHeight: 1.85 }}>
          {children}
        </div>
        <style>{`
          .legal-content h2 { font-family: var(--font-display); font-size: 21px; font-weight: 700; color: #F2F1EA; margin: 40px 0 14px; letter-spacing: -0.01em; }
          .legal-content h2:first-child { margin-top: 0; }
          .legal-content p { margin: 0 0 16px; }
          .legal-content ul { margin: 0 0 16px; padding-inline-start: 22px; }
          .legal-content li { margin-bottom: 8px; }
          .legal-content strong { color: #F2F1EA; }
          .legal-content a { color: #3DD6A3; }
        `}</style>
      </div>

      <footer style={{ borderTop: '1px solid rgba(242,241,234,.06)', padding: '28px 0' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', fontSize: 13, color: '#6E7B74' }}>
          © 2025 Floory — Smart Floor Management
        </div>
        <div style={{ maxWidth: 820, margin: '8px auto 0', padding: '0 24px' }}>
          <a href="https://aaa-tech.com" target="_blank" rel="noopener" style={{ fontSize: 12, color: '#6E7B74', textDecoration: 'none' }}>מבית AAA — סוכנות סוכני AI</a>
        </div>
      </footer>
    </div>
  )
}
