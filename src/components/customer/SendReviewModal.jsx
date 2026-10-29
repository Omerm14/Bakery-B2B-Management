import { ArrowUp, ArrowDown, Repeat } from 'lucide-react'

// Pre-send confirmation gate: shows exactly what's about to be written,
// lets the customer mark any individual line "one-time" (all three
// forward-copy paths — Wednesday cron, portal lazy-fill, staff's
// copy-prev-week button — bring it back at its regular quantity), then only calls onConfirm (the real upsert) once
// the customer explicitly proceeds. Nothing has been written to the DB yet
// while this is showing.
//
// Also used by staff on the Orders grid: they pass translated `labels` and
// put the change-reason/note fields in `children` (rendered above the list).
// The portal passes neither and keeps the Hebrew defaults below.
const DEFAULT_LABELS = {
  title: 'אישור שינויים לפני שליחה',
  hint: 'סמנו "חד-פעמי" בכל שינוי שנוגע רק לשבוע הזה — בשבוע הבא הכמות תחזור למה שהייתה.',
  markAll: 'סמן הכל:',
  oneTime: 'חד-פעמי',
  permanent: 'קבוע',
  oneTimeTitle: 'שינוי חד-פעמי — בשבוע הבא חוזרים לכמות הקבועה',
  permanentTitle: 'יחזור אוטומטית לשבוע הבא',
  newPrefix: 'חדש',
  cancel: 'ביטול',
  confirm: 'אישור ושליחה',
  sending: 'שולח...',
}

export default function SendReviewModal({ changes, onToggleOneTime, onSetAllOneTime, onConfirm, onCancel, sending, labels, children }) {
  const L = { ...DEFAULT_LABELS, ...labels }
  return (
    <div className="overlay" onClick={sending ? undefined : onCancel}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">{L.title}</div>
        <p style={{ margin: '-8px 0 16px', fontSize: 13, color: 'var(--t3)' }}>
          {L.hint}
        </p>
        {children}
        {changes.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12, color: 'var(--t3)' }}>
            <span>{L.markAll}</span>
            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => onSetAllOneTime(true)}>
              {L.oneTime}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => onSetAllOneTime(false)}>
              {L.permanent}
            </button>
          </div>
        )}
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
                  {isNew ? `${L.newPrefix}: ${c.to}` : `${c.from} → ${c.to}`}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={c.oneTime ? { color: 'var(--t1)', background: 'var(--surf3)' } : undefined}
                  onClick={() => onToggleOneTime(c.key)}
                  aria-pressed={c.oneTime}
                  title={c.oneTime ? L.oneTimeTitle : L.permanentTitle}
                >
                  <Repeat size={13} />
                  {c.oneTime ? L.oneTime : L.permanent}
                </button>
              </div>
            )
          })}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={sending}>{L.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={sending}>
            {sending ? L.sending : L.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
