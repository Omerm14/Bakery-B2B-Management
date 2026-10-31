import { useState, useEffect } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { useTranslation } from '../../context/LanguageContext'

const cleanName = (s) => s.trim().replace(/\s+/g, ' ')
const byName = (a, b) => a.name.localeCompare(b.name, 'he')

// Settings › Workers: the names offered under "thrown by" on the waste page.
// A worker with waste rows can't be deleted (their history needs the name),
// so deleting one of those hides them instead.
export default function WorkersTab() {
  const toast = useToast()
  const { t } = useTranslation()
  const [workers, setWorkers] = useState(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    supabase.from('waste_workers').select('id, name, active').then(({ data, error }) => {
      if (error) { console.error('[WorkersTab]', error); toast.error(t('workers.loadFailed')) }
      setWorkers((data || []).sort(byName))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const taken = (name, exceptId) =>
    (workers || []).some(w => w.id !== exceptId && w.name.trim().toLowerCase() === name.toLowerCase())

  async function add() {
    const name = cleanName(newName)
    if (!name || busy) return
    if (taken(name)) { toast.warning(t('workers.exists')); return }
    setBusy(true)
    const { data, error } = await supabase.from('waste_workers').insert({ name }).select('id, name, active').single()
    setBusy(false)
    if (error) { toast.error(error.code === '23505' ? t('workers.exists') : t('workers.saveFailed')); return }
    setWorkers(prev => [...prev, data].sort(byName))
    setNewName('')
    toast.success(t('workers.added'))
  }

  function startEdit(w) {
    setEditId(w.id)
    setEditName(w.name)
    setConfirmId(null)
  }

  async function saveEdit(w) {
    const name = cleanName(editName)
    if (!name) return
    if (name === w.name) { setEditId(null); return }
    if (taken(name, w.id)) { toast.warning(t('workers.exists')); return }
    const { error } = await supabase.from('waste_workers').update({ name }).eq('id', w.id)
    if (error) { toast.error(error.code === '23505' ? t('workers.exists') : t('workers.saveFailed')); return }
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, name } : x).sort(byName))
    setEditId(null)
    toast.success(t('workers.updated'))
  }

  async function setActive(w, active) {
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, active } : x))
    const { error } = await supabase.from('waste_workers').update({ active }).eq('id', w.id)
    if (error) {
      setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, active: w.active } : x))
      toast.error(t('workers.saveFailed'))
      return false
    }
    return true
  }

  async function remove(w) {
    setConfirmId(null)
    const { error } = await supabase.from('waste_workers').delete().eq('id', w.id)
    if (!error) {
      setWorkers(prev => prev.filter(x => x.id !== w.id))
      toast.success(t('workers.deleted'))
      return
    }
    // 23503: referenced by waste rows — keep the name for history, hide it.
    if (error.code === '23503') {
      if (await setActive(w, false)) toast.info(t('workers.hiddenInstead'))
      return
    }
    console.error('[WorkersTab delete]', error)
    toast.error(t('workers.deleteFailed'))
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="section-title">{t('workers.title')}</div>
      <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>{t('workers.description')}</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          className="input"
          placeholder={t('workers.namePlaceholder')}
          aria-label={t('workers.namePlaceholder')}
          value={newName}
          maxLength={80}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !newName.trim()}>{t('workers.add')}</button>
      </div>

      {workers === null ? (
        <div className="shimmer" style={{ height: 40 }} />
      ) : workers.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>{t('workers.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {workers.map(w => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 12px', borderRadius: 'var(--rs)', background: 'var(--surf2)', minHeight: 48 }}>
              {editId === w.id ? (
                <>
                  <input
                    className="input"
                    style={{ padding: '7px 10px', fontSize: 14 }}
                    aria-label={t('workers.namePlaceholder')}
                    value={editName}
                    maxLength={80}
                    autoFocus
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(w); if (e.key === 'Escape') setEditId(null) }}
                  />
                  <button className="waste-icon-btn" aria-label={t('workers.save')} title={t('workers.save')} onClick={() => saveEdit(w)}><Check size={16} /></button>
                  <button className="waste-icon-btn" aria-label={t('workers.cancel')} title={t('workers.cancel')} onClick={() => setEditId(null)}><X size={16} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, opacity: w.active ? 1 : 0.55 }}>
                    {w.name}
                    {!w.active && <span style={{ fontSize: 12, color: 'var(--t3)', marginInlineStart: 8 }}>{t('workers.hidden')}</span>}
                  </span>
                  {confirmId === w.id ? (
                    <>
                      <span style={{ fontSize: 13, color: 'var(--t2)' }}>{t('workers.confirmDelete')}</span>
                      <button className="btn btn-sm waste-danger" onClick={() => remove(w)}>{t('workers.delete')}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>{t('workers.cancel')}</button>
                    </>
                  ) : (
                    <>
                      {!w.active && <button className="btn btn-ghost btn-sm" onClick={() => setActive(w, true)}>{t('workers.restore')}</button>}
                      <button className="waste-icon-btn" aria-label={t('workers.edit')} title={t('workers.edit')} onClick={() => startEdit(w)}><Pencil size={15} /></button>
                      <button className="waste-icon-btn" aria-label={t('workers.delete')} title={t('workers.delete')} onClick={() => { setConfirmId(w.id); setEditId(null) }}><Trash2 size={15} /></button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
