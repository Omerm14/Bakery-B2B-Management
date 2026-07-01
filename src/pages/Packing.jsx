import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Check, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isoToday } from '../constants/days'

export default function Packing() {
  const [selectedDate, setSelectedDate] = useState(isoToday())
  const [clients, setClients] = useState([])
  const [checks, setChecks] = useState({})    // line_id → packed_at ISO string or null
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [allDone, setAllDone] = useState(false)

  useEffect(() => { loadPacking() }, [selectedDate])

  async function loadPacking() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('order_lines')
        .select(`
          id, quantity, customer_id, menu_item_id,
          menu_items(name_he, unit),
          customers(name),
          packing_checks(id, packed_at)
        `)
        .eq('delivery_date', selectedDate)
        .gt('quantity', 0)
        .order('customer_id')

      if (!data) { setClients([]); return }

      const map = {}
      const initChecks = {}
      for (const line of data) {
        const cid = line.customer_id
        if (!map[cid]) map[cid] = { customer_id: cid, name: line.customers?.name, items: [] }
        const packedAt = line.packing_checks?.[0]?.packed_at || null
        map[cid].items.push({
          line_id: line.id,
          name_he: line.menu_items?.name_he,
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

  async function toggleCheck(lineId) {
    const already = !!checks[lineId]
    const nowPacked = !already
    const packedAt = nowPacked ? new Date().toISOString() : null
    setChecks(prev => ({ ...prev, [lineId]: packedAt }))

    if (nowPacked) {
      await supabase.from('packing_checks').upsert(
        { order_line_id: lineId, packed_at: packedAt },
        { onConflict: 'order_line_id' }
      )
    } else {
      await supabase.from('packing_checks').delete().eq('order_line_id', lineId)
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
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  function isClientDone(client) {
    return client.items.every(i => !!checks[i.line_id])
  }

  function packedTime(isoStr) {
    if (!isoStr) return null
    return new Date(isoStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  function printClient(client) {
    const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    const rows = client.items.map(i =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">☐ ${i.name_he}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:left">${i.quantity} ${i.unit}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>שליחה – ${client.name}</title>
      <style>body{font-family:Arial,sans-serif;margin:30px}h2{margin-bottom:4px}p{color:#666;font-size:14px;margin:0 0 16px}table{width:100%;border-collapse:collapse}td{font-size:15px}</style>
      </head><body>
      <h2>${client.name}</h2><p>${dateStr}</p>
      <table>${rows}</table>
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  function printAll() {
    const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    const sections = clients.map(client => {
      const rows = client.items.map(i =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">☐ ${i.name_he}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:left">${i.quantity} ${i.unit}</td></tr>`
      ).join('')
      return `<div style="page-break-inside:avoid;margin-bottom:28px">
        <h3 style="margin:0 0 4px">${client.name}</h3>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      </div>`
    }).join('<hr style="margin:24px 0">')
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>רשימות אריזה – ${dateStr}</title>
      <style>body{font-family:Arial,sans-serif;margin:30px}h2{margin-bottom:16px}h3{font-size:16px}</style>
      </head><body>
      <h2>רשימות אריזה – ${dateStr}</h2>
      ${sections}
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  const doneCount = clients.filter(isClientDone).length
  const totalItems = clients.reduce((s, c) => s + c.items.length, 0)
  const checkedItems = Object.values(checks).filter(Boolean).length

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="page packing-page">
      {/* Sticky progress header */}
      {clients.length > 0 && (
        <div className="packing-sticky-header no-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {allDone ? '🎉 הכל נארז!' : `${doneCount} / ${clients.length} לקוחות`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>{checkedItems}/{totalItems} פריטים</span>
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
        <h1 className="page-title">אריזה יומית</h1>
        {clients.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm no-print" onClick={printAll}>
              <Printer size={14} /> הכל
            </button>
          </div>
        )}
      </div>

      <div className="week-nav no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(-1)}><ChevronRight size={16} /></button>
        <span className="week-label">{dateLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(1)}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(isoToday())} style={{ fontSize: 12 }}>היום</button>
      </div>

      {/* Completion celebration */}
      {allDone && clients.length > 0 && (
        <div className="completion-banner">
          <span style={{ fontSize: 28 }}>🎉</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>כל ההזמנות נארזו!</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>{clients.length} לקוחות · {totalItems} פריטים</div>
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
          <div className="empty-text">אין הזמנות לאריזה היום</div>
        </div>
      ) : (
        clients.map(client => {
          const done = isClientDone(client)
          const isOpen = expanded[client.customer_id]
          const previewItems = client.items.slice(0, 3)
          const previewText = previewItems.map(i => `${i.name_he} ×${i.quantity}`).join(', ')
            + (client.items.length > 3 ? ` ועוד ${client.items.length - 3}` : '')

          return (
            <div key={client.customer_id} className={'client-block' + (done ? ' done' : '')}>
              <div
                className="client-hdr"
                onClick={() => setExpanded(p => ({ ...p, [client.customer_id]: !p[client.customer_id] }))}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: done ? 'rgba(16,185,129,.15)' : 'var(--surf2)',
                  border: `2px solid ${done ? 'var(--green)' : 'var(--bdr2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  transition: 'all .3s',
                }}>
                  {done && <Check size={16} color="var(--green)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{client.name}</div>
                  {!isOpen && (
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {previewText}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                    {client.items.filter(i => !!checks[i.line_id]).length}/{client.items.length}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm no-print"
                    onClick={e => { e.stopPropagation(); printClient(client) }}
                    title="הדפס שליחה"
                    style={{ padding: '4px 8px' }}
                  >
                    <Printer size={13} />
                  </button>
                  {isOpen ? <ChevronUp size={16} color="var(--t3)" /> : <ChevronDown size={16} color="var(--t3)" />}
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
                      onClick={() => toggleCheck(item.line_id)}
                    >
                      <div className={'pack-check' + (checked ? ' checked' : '')}>
                        {checked && <Check size={13} color="#fff" />}
                      </div>
                      <span className="pack-label" style={{ flex: 1, fontSize: 15 }}>{item.name_he}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="pack-qty">{item.quantity} {item.unit}</span>
                        {time && <span style={{ fontSize: 10, color: 'var(--green)' }}>נארז {time}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
