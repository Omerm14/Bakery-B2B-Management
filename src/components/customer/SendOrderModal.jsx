import { ArrowUp, ArrowDown, Sparkles, X } from 'lucide-react'

const CONFETTI_COLORS = ['#3DD6A3', '#FFC24D', '#E8890C', '#3987E5', '#E8604C']

// Pure-CSS confetti — no extra dependency for a one-off celebratory burst.
// Pieces are positioned/staggered via inline style so each one gets a
// distinct fall path/delay from a single shared @keyframes definition.
function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => i)
  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map(i => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.3
        const duration = 1.8 + Math.random() * 1.2
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const rotate = Math.random() * 360
        const size = 6 + Math.random() * 5
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              background: color,
              width: size,
              height: size * 0.4,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        )
      })}
    </div>
  )
}

// Shown right after a successful שלח הזמנה — turns a silent DB write into a
// deliberate, visible confirmation: exactly what changed, item by item,
// with an arrow that actually points toward the new value (up+green for
// more, down+red for less) instead of a static "→".
export default function SendOrderModal({ changes, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <Confetti />
      <div className="modal" style={{ width: 440, textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          style={{ position: 'absolute', insetInlineEnd: 20, top: 20, background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={18} />
        </button>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: 'var(--green-tint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <Sparkles size={26} color="var(--green)" />
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--t1)' }}>ההזמנה נשלחה!</h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--t3)' }}>
          {changes.length ? 'הנה סיכום השינויים שנשלחו:' : 'ההזמנה עודכנה בהצלחה.'}
        </p>
        {changes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'start', marginBottom: 8 }}>
            {changes.map((c, i) => {
              const isNew = c.from === 0 || c.from == null
              const increasing = !isNew && c.to > c.from
              const color = isNew || increasing ? 'var(--green)' : 'var(--red)'
              const Arrow = isNew || increasing ? ArrowUp : ArrowDown
              return (
                <div key={i} style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.itemName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 1 }}>{c.dateLabel}</div>
                  </div>
                  {/* dir="ltr" is load-bearing, not decorative: inside an RTL flex
                      row, "30 → 15" otherwise gets bidi-reordered to "15 → 30" —
                      the numbers themselves swap position even though the
                      string/DOM content is correct. Isolating this cluster in
                      LTR keeps the arrow direction and number order truthful. */}
                  <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 4, color, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    <Arrow size={14} />
                    {isNew ? `חדש: ${c.to}` : `${c.from} → ${c.to}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          סגור
        </button>
      </div>
    </div>
  )
}
