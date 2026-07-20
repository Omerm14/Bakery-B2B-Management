import { useEffect, useRef } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import Confetti from './Confetti'

// Combined success popup shown right after a successful שלח הזמנה: checkmark
// + message + confetti burst, all in one card. Auto-dismisses on its own
// after AUTO_CLOSE_MS, but the X button (and clicking the backdrop) close
// it early -- same overlay/modal interaction pattern as every other modal
// in this app, just self-dismissing on top of that.
const AUTO_CLOSE_MS = 3000

export default function SendSuccessPopup({ note, onClose }) {
  // Read via a ref, not a useEffect dependency — the caller passes an
  // inline arrow function that's a new identity on every render, and the
  // parent page re-renders periodically (a live cutoff-lock clock ticking
  // every minute) independent of whether this popup is open. Depending on
  // `onClose` directly would reset the timer from scratch on any such
  // re-render that happens to land while this is visible, delaying auto-close.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const id = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="overlay" onClick={onClose}>
      <Confetti />
      <div className="modal" style={{ width: 380, textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
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
          <CheckCircle2 size={28} color="var(--green)" />
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--t1)' }}>ההזמנה נשלחה בהצלחה!</h2>
        {note && <p style={{ margin: 0, fontSize: 14, color: 'var(--t3)' }}>{note}</p>}
      </div>
    </div>
  )
}
