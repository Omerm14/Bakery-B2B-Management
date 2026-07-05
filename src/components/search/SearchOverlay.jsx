import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User, Package } from 'lucide-react'
import { useCustomers } from '../../hooks/useCustomers'
import { useMenuItems } from '../../hooks/useMenuItems'

const MAX_RESULTS_PER_GROUP = 8

export default function SearchOverlay({ open, onClose }) {
  const navigate = useNavigate()
  const { customers } = useCustomers()
  const { menuItems } = useMenuItems()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus after the overlay has mounted/rendered
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const customerResults = customers
      .filter(c => c.name.includes(q))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map(c => ({ kind: 'customer', id: c.id, label: c.name }))
    const itemResults = menuItems
      .filter(i => i.name_he.includes(q))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map(i => ({ kind: 'item', id: i.id, label: i.name_he }))
    return [...customerResults, ...itemResults]
  }, [query, customers, menuItems])

  useEffect(() => { setActiveIndex(0) }, [results.length])

  if (!open) return null

  function selectResult(result) {
    if (!result) return
    if (result.kind === 'customer') {
      navigate('/orders', { state: { customerId: result.id } })
    } else {
      navigate('/history', { state: { itemId: result.id, viewMode: 'item' } })
    }
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); selectResult(results[activeIndex]); }
  }

  return (
    <div className="overlay search-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-modal-input-row">
          <Search size={16} color="var(--t3)" aria-hidden="true" />
          <input
            ref={inputRef}
            className="search-modal-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="חיפוש לקוח או פריט..."
            aria-label="חיפוש"
          />
          <kbd className="search-modal-kbd">Esc</kbd>
        </div>

        {query.trim() === '' ? (
          <div className="search-modal-hint">התחילו להקליד כדי לחפש לקוחות ופריטים</div>
        ) : results.length === 0 ? (
          <div className="search-modal-hint">אין תוצאות עבור "{query}"</div>
        ) : (
          <div className="search-modal-results" role="listbox">
            {results.map((r, i) => (
              <button
                key={`${r.kind}-${r.id}`}
                className={'search-result-item' + (i === activeIndex ? ' active' : '')}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectResult(r)}
                role="option"
                aria-selected={i === activeIndex}
              >
                {r.kind === 'customer' ? <User size={14} aria-hidden="true" /> : <Package size={14} aria-hidden="true" />}
                <span>{r.label}</span>
                <span className="search-result-kind">{r.kind === 'customer' ? 'לקוח' : 'פריט'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
