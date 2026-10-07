import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

// A complete date with a believable year. While a date is being typed
// segment by segment the browser reports '' (incomplete) or partial years
// like 0002 / 0020 / 0202 — none of those may reach the URL or the database.
function isCommittable(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const y = Number(v.slice(0, 4))
  return y >= 2020 && y <= 2100
}

// <input type="date"> that keeps its own draft while the user types and only
// reports a value upward (onCommit) once it's a complete, sensible date —
// or '' when the field is deliberately cleared (on blur / Enter / the ✕).
// Binding the input straight to the URL wiped half-typed segments and fired
// a request per keystroke.
export default function DateFilterInput({ value, onCommit, label, style, inputStyle }) {
  const [draft, setDraft] = useState(value)

  // Follow outside changes: Clear filters, back/forward, reload.
  useEffect(() => { setDraft(value) }, [value])

  function settle() {
    if (draft === value) return
    if (draft === '') onCommit('')
    else if (isCommittable(draft)) onCommit(draft)
    else setDraft(value)
  }

  return (
    <label style={style}>
      {label}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <input
          type="date"
          className="input"
          style={inputStyle}
          value={draft}
          onChange={e => {
            const v = e.target.value
            setDraft(v)
            if (v !== value && isCommittable(v)) onCommit(v)
          }}
          onBlur={settle}
          onKeyDown={e => { if (e.key === 'Enter') settle() }}
        />
        {value && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: 4, minHeight: 0, lineHeight: 0 }}
            onClick={e => { e.preventDefault(); setDraft(''); onCommit('') }}
            aria-label="clear"
          >
            <X size={12} />
          </button>
        )}
      </span>
    </label>
  )
}
