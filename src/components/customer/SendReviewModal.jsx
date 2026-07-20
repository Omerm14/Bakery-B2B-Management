import { ArrowUp, ArrowDown, Repeat } from 'lucide-react'

// Pre-send confirmation gate: shows exactly what's about to be written,
// lets the customer mark any individual line "one-time" (excluded from
// all three forward-copy paths — Wednesday cron, portal lazy-fill, staff's
// copy-prev-week button), then only calls onConfirm (the real upsert) once
// the customer explicitly proceeds. Nothing has been written to the DB yet
// while this is showing.
export default function SendReviewModal({ changes, onToggleOneTime, onConfirm, onCancel, sending }) {
  return (
    <div className="overlay" onClick={sending ? undefined : onCancel}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">אישור שינויים לפני שליחה</div>
        <p style={{ margin: '-8px 0 16px', fontSize: 13, color: 'var(--t3)' }}>
          סמנו "חד-פעמי" בכל שורה שלא צריכה לחזור אוטומטית לשבוע הבא.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {changes.map(c => {
            const isNew = c.from === 0 || c.from == null
            const increasing = !isNew && c.to > c.from
            const color = isNew || increasing ? 'var(--green)' : 'var(--red)'
            const Arrow = isNew || increasing ? ArrowUp : ArrowDown
            return (
              <div key={c.key} style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={c.oneTime ? { color: 'var(--t1)', background: 'var(--surf3)' } : undefined}
                  onClick={() => onToggleOneTime(c.key)}
                  aria-pressed={c.oneTime}
                  title={c.oneTime ? 'שינוי חד-פעמי — לא יועתק לשבוע הבא' : 'יחזור אוטומטית לשבוע הבא'}
                >
                  <Repeat size={13} />
                  {c.oneTime ? 'חד-פעמי' : 'קבוע'}
                </button>
              </div>
            )
          })}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={sending}>ביטול</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={sending}>
            {sending ? 'שולח...' : 'אישור ושליחה'}
          </button>
        </div>
      </div>
    </div>
  )
}
