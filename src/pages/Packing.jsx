import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Check, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isoToday, toLocalISODate } from '../constants/days'
import { buildPackingListHtml, openAndPrint } from '../lib/printHtml'
import { useToast } from '../context/ToastContext'
import { useTranslation } from '../context/LanguageContext'
import { customerDisplayName } from '../lib/displayName'

export default function Packing() {
  const toast = useToast()
  const { t, lang } = useTranslation()
  const locale = lang === 'en' ? 'en-US' : 'he-IL'
  const [selectedDate, setSelectedDate] = useState(isoToday())
  const [clients, setClients] = useState([])
  const [checks, setChecks] = useState({})    // line_id → packed_at ISO string or null
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [allDone, setAllDone] = useState(false)

  useEffect(() => { loadPacking() }, [selectedDate])

  function displayName(item) {
    return lang === 'en' ? (item.name_en || item.name_he) : item.name_he
  }

  async function loadPacking() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('order_lines')
        .select(`
          id, quantity, customer_id, menu_item_id,
          menu_items(name_he, name_en, unit),
          customers!inner(name, name_en, active),
          packing_checks(id, packed_at)
        `)
        .eq('delivery_date', selectedDate)
        .eq('customers.active', true)
        .gt('quantity', 0)
        .order('customer_id')

      if (!data) { setClients([]); return }

      const map = {}
      const initChecks = {}
      for (const line of data) {
        const cid = line.customer_id
        if (!map[cid]) map[cid] = { customer_id: cid, name: line.customers?.name, name_en: line.customers?.name_en, items: [] }
        const packedAt = line.packing_checks?.[0]?.packed_at || null
        map[cid].items.push({
          line_id: line.id,
          name_he: line.menu_items?.name_he,
          name_en: line.menu_items?.name_en,
          unit: line.menu_items?.unit,
          quantity: line.quantity,
          packed_at: packedAt,
        })
        initChecks[line.id] = packedAt
      }

      const sorted = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'he'))
      setClients(sorted)
      setChecks(initChecks)
      const exp = {}
      sorted.forEach(c => { exp[c.customer_id] = true })
      setExpanded(exp)
    } finally {
      setLoading(false)
    }
  }

  async function toggleCheck(lineId, client) {
    const already = !!checks[lineId]
    const nowPacked = !already
    const packedAt = nowPacked ? new Date().toISOString() : null
    setChecks(prev => ({ ...prev, [lineId]: packedAt }))

    // Checking off the last remaining item completes the card — collapse it
    // instead of leaving it open showing an all-checked list.
    if (nowPacked && client && client.items.every(i => i.line_id === lineId || !!checks[i.line_id])) {
      setExpanded(p => ({ ...p, [client.customer_id]: false }))
    }

    if (nowPacked) {
      await supabase.from('packing_checks').upsert(
        { order_line_id: lineId, packed_at: packedAt },
        { onConflict: 'order_line_id' }
      )
    } else {
      await supabase.from('packing_checks').delete().eq('order_line_id', lineId)
    }
  }

  // Bulk version of toggleCheck, driven by the customer card's round status
  // circle — marks (or unmarks, if already all packed) every item in the
  // card at once, using a single upsert/delete instead of looping the
  // single-item write.
  async function toggleAllForClient(client) {
    const done = isClientDone(client)
    const nowPacked = !done
    const packedAt = nowPacked ? new Date().toISOString() : null
    const lineIds = client.items.map(i => i.line_id)

    setChecks(prev => {
      const next = { ...prev }
      for (const id of lineIds) next[id] = packedAt
      return next
    })

    if (nowPacked) {
      setExpanded(p => ({ ...p, [client.customer_id]: false }))
      await supabase.from('packing_checks').upsert(
        lineIds.map(id => ({ order_line_id: id, packed_at: packedAt })),
        { onConflict: 'order_line_id' }
      )
    } else {
      await supabase.from('packing_checks').delete().in('order_line_id', lineIds)
    }
  }

  useEffect(() => {
    if (!clients.length) { setAllDone(false); return }
    const done = clients.every(c => c.items.every(i => !!checks[i.line_id]))
    setAllDone(done)
  }, [checks, clients])

  function changeDate(delta) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(toLocalISODate(d))
  }

  function isClientDone(client) {
    return client.items.every(i => !!checks[i.line_id])
  }

  function packedTime(isoStr) {
    if (!isoStr) return null
    return new Date(isoStr).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }

  function printClient(client) {
    const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const clientName = customerDisplayName(client, lang)
    const html = buildPackingListHtml({
      htmlTitle: `${t('packing.printTitleClient')} – ${clientName}`,
      h2: clientName,
      subheading: dateStr,
      sections: [{ items: client.items.map(i => ({ ...i, name_he: displayName(i) })) }],
      dir: lang === 'en' ? 'ltr' : 'rtl',
    })
    if (!openAndPrint(html)) toast.error(t('packing.popupBlocked'))
  }

  function printAll() {
    const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const html = buildPackingListHtml({
      htmlTitle: `${t('packing.printTitleAll')} – ${dateStr}`,
      h2: `${t('packing.printTitleAll')} – ${dateStr}`,
      sections: clients.map(client => ({ heading: customerDisplayName(client, lang), items: client.items.map(i => ({ ...i, name_he: displayName(i) })) })),
      dir: lang === 'en' ? 'ltr' : 'rtl',
    })
    if (!openAndPrint(html)) toast.error(t('packing.popupBlocked'))
  }

  const doneCount = clients.filter(isClientDone).length
  const totalItems = clients.reduce((s, c) => s + c.items.length, 0)
  const checkedItems = Object.values(checks).filter(Boolean).length

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="page packing-page">
      {/* Sticky progress header */}
      {clients.length > 0 && (
        <div className="packing-sticky-header no-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {allDone ? t('packing.allDone') : `${doneCount} / ${clients.length} ${t('packing.customersCount')}`}
            </span>
            <span style={{ fontSize: 13, color: 'var(--t2)' }}>{checkedItems}/{totalItems} {t('packing.itemsCount')}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bdr2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: allDone ? 'var(--green)' : 'var(--grad)',
              borderRadius: 3,
              width: `${clients.length ? (doneCount / clients.length) * 100 : 0}%`,
              transition: 'width .5s cubic-bezier(.16,1,.3,1)',
            }} />
          </div>
        </div>
      )}

      <div className="page-header" style={{ marginTop: clients.length ? 8 : 0 }}>
        <h1 className="page-title">{t('packing.title')}</h1>
        {clients.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm no-print" onClick={printAll}>
              <Printer size={14} /> {t('packing.printAll')}
            </button>
          </div>
        )}
      </div>

      <div className="week-nav no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(-1)}><ChevronRight size={16} /></button>
        <span className="week-label">{dateLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(1)}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(isoToday())} style={{ fontSize: 12 }}>{t('common.today')}</button>
      </div>

      {/* Completion celebration */}
      {allDone && clients.length > 0 && (
        <div className="completion-banner">
          <span style={{ fontSize: 28 }}>🎉</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{t('packing.completionTitle')}</div>
            <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 2 }}>{clients.length} {t('packing.customersCount')} · {totalItems} {t('packing.itemsCount')}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="shimmer" style={{ height: 80 }} />)}
        </div>
      ) : clients.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📦</div>
          <div className="empty-text">{t('packing.emptyText')}</div>
        </div>
      ) : (
        <div className="packing-grid">
          {clients.map(client => {
            const done = isClientDone(client)
            const isOpen = expanded[client.customer_id]
            const clientName = customerDisplayName(client, lang)
            const previewItems = client.items.slice(0, 3)
            const previewText = previewItems.map(i => `${displayName(i)} ×${i.quantity}`).join(', ')
              + (client.items.length > 3 ? ` ${t('packing.andMore')} ${client.items.length - 3}` : '')

            return (
              <div key={client.customer_id} className={'client-block' + (done ? ' done' : '')}>
                <div
                  className="client-hdr"
                  onClick={() => setExpanded(p => ({ ...p, [client.customer_id]: !p[client.customer_id] }))}
                >
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); toggleAllForClient(client) }}
                    aria-label={done ? t('packing.unmarkAll') : t('packing.markAll')}
                    title={done ? t('packing.unmarkAll') : t('packing.markAll')}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', padding: 0, cursor: 'pointer',
                      background: done ? 'var(--green-tint)' : 'var(--surf2)',
                      border: `2px solid ${done ? 'var(--green)' : 'var(--bdr2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      transition: 'all .3s',
                    }}
                  >
                    {done && <Check size={13} color="var(--green)" />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>{clientName}</div>
                    {!isOpen && (
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {previewText}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                      {client.items.filter(i => !!checks[i.line_id]).length}/{client.items.length}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm no-print"
                      onClick={e => { e.stopPropagation(); printClient(client) }}
                      title={t('packing.printClient')}
                      style={{ padding: '4px 6px' }}
                    >
                      <Printer size={12} />
                    </button>
                    {isOpen ? <ChevronUp size={14} color="var(--t3)" /> : <ChevronDown size={14} color="var(--t3)" />}
                  </div>
                </div>

                <div className={'client-body' + (isOpen ? ' open' : '')}>
                  {client.items.map(item => {
                    const checked = !!checks[item.line_id]
                    const time = checked ? packedTime(checks[item.line_id]) : null
                    return (
                      <div
                        key={item.line_id}
                        className={'pack-item' + (checked ? ' checked' : '')}
                        onClick={() => toggleCheck(item.line_id, client)}
                      >
                        <div className={'pack-check' + (checked ? ' checked' : '')}>
                          {checked && <Check size={11} color="#fff" />}
                        </div>
                        <span className="pack-label" style={{ flex: 1, fontSize: 14.5 }}>{displayName(item)}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span className="pack-qty">{item.quantity} {item.unit}</span>
                          {time && <span style={{ fontSize: 10, color: 'var(--green)' }}>{t('packing.packedAt')} {time}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
