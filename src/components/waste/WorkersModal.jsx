import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { useTranslation } from '../../context/LanguageContext'

// Manage the names offered in the waste page's "thrown by" dropdown. Names
// are hidden (active = false) rather than deleted so past rows keep them.
export default function WorkersModal({ workers, setWorkers, onClose }) {
  const toast = useToast()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean || busy) return
    if (workers.some(w => w.name.trim().toLowerCase() === clean.toLowerCase())) {
      toast.warning(t('waste.workerExists'))
      return
    }
    setBusy(true)
    const { data, error } = await supabase.from('waste_workers').insert({ name: clean }).select('id, name, active').single()
    setBusy(false)
    if (error) {
      toast.error(error.code === '23505' ? t('waste.workerExists') : t('waste.workerSaveFailed'))
      return
    }
    setWorkers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'he')))
    setName('')
  }

  async function toggle(w) {
    const active = !w.active
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, active } : x))
    const { error } = await supabase.from('waste_workers').update({ active }).eq('id', w.id)
    if (error) {
      setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, active: w.active } : x))
      toast.error(t('waste.workerSaveFailed'))
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="waste-workers-title" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div id="waste-workers-title" className="modal-title" style={{ marginBottom: 0 }}>{t('waste.workersTitle')}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('waste.close')}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 18, lineHeight: 1.6 }}>{t('waste.workersDescription')}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            className="input"
            placeholder={t('waste.workerNamePlaceholder')}
            aria-label={t('waste.workerNamePlaceholder')}
            value={name}
            maxLength={80}
            autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
          />
          <button className="btn btn-primary" onClick={add} disabled={busy || !name.trim()}>{t('waste.workerAdd')}</button>
        </div>

        {workers.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>{t('waste.workersEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {workers.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 'var(--rs)', background: 'var(--surf2)', opacity: w.active ? 1 : 0.6 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {w.name}
                  {!w.active && <span style={{ fontSize: 12, color: 'var(--t3)', marginInlineStart: 8 }}>{t('waste.workerHidden')}</span>}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(w)}>
                  {w.active ? t('waste.workerHide') : t('waste.workerShow')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
