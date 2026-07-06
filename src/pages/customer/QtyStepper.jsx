import { Minus, Plus, Check, Loader2 } from 'lucide-react'

function roundToStep(n, step) {
  return Math.round(n / step) * step
}

// Big tap-target quantity control for mobile: -/+ buttons flank a numeric
// input (inputMode="decimal" opens the number pad on phones, not the full
// keyboard). `saveState` renders a small inline indicator so a customer on
// a flaky connection can see whether a tap actually went through, instead
// of silently trusting an autosave they can't observe.
export default function QtyStepper({ value, onChange, disabled, step = 0.5, min = 0, saveState }) {
  const qty = value || 0

  function commit(next) {
    onChange(Math.max(min, roundToStep(next, step)))
  }

  return (
    <div className={`qty-stepper${disabled ? ' qty-stepper-disabled' : ''}`}>
      <button
        type="button"
        className="qty-stepper-btn"
        onClick={() => commit(qty - step)}
        disabled={disabled || qty <= min}
        aria-label="הפחת כמות"
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        className="qty-stepper-input"
        value={qty || ''}
        placeholder="0"
        min={min}
        step={step}
        disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onFocus={e => e.target.select()}
      />
      <button
        type="button"
        className="qty-stepper-btn"
        onClick={() => commit(qty + step)}
        disabled={disabled}
        aria-label="הוסף כמות"
      >
        <Plus size={16} />
      </button>
      <span className="qty-save-indicator">
        {saveState === 'saving' && <Loader2 size={13} className="qty-save-spin" />}
        {saveState === 'saved' && <Check size={13} color="var(--accent)" />}
      </span>
    </div>
  )
}
