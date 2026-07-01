import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isoToday } from '../constants/days'

export default function Packing() {
  const [selectedDate, setSelectedDate] = useState(isoToday())
  const [clients, setClients] = useState([]) // [{customer_id, name, items: [{...}], expanded}]
  const [checks, setChecks] = useState({}) // key: order_line_id => bool
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    loadPacking()
  }, [selectedDate])

  async function loadPacking() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('order_lines')
        .select(`
          id,
          quantity,
          customer_id,
          menu_item_id,
          menu_items(name_he, unit),
          customers(name),
          packing_checks(id, packed_at)
        `)
        .eq('delivery_date', selectedDate)
        .gt('quantity', 0)
        .order('customer_id')

      if (!data) { setClients([]); return }

      // Group by customer
      const map = {}
      const initChecks = {}
      for (const line of data) {
        const cid = line.customer_id
        if (!map[cid]) {
          map[cid] = { customer_id: cid, name: line.customers?.name, items: [] }
        }
        map[cid].items.push({
          line_id: line.id,
          name_he: line.menu_items?.name_he,
          unit: line.menu_items?.unit,
          quantity: line.quantity,
        })
        initChecks[line.id] = line.packing_checks?.length > 0
      }

      const sorted = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'he'))
      setClients(sorted)
      setChecks(initChecks)
      // Auto-expand all clients with items
      const exp = {}
      sorted.forEach(c => { exp[c.customer_id] = true })
      setExpanded(exp)
    } finally {
      setLoading(false)
    }
  }

  async function toggleCheck(lineId) {
    const nowChecked = !checks[lineId]
    setChecks(prev => ({ ...prev, [lineId]: nowChecked }))

    if (nowChecked) {
      await supabase.from('packing_checks').upsert({ order_line_id: lineId, packed_at: new Date().toISOString() }, { onConflict: 'order_line_id' })
    } else {
      await supabase.from('packing_checks').delete().eq('order_line_id', lineId)
    }
  }

  function changeDate(delta) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  function isClientDone(client) {
    return client.items.every(i => checks[i.line_id])
  }

  const doneCount = clients.filter(isClientDone).length
  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">אריזה יומית</h1>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(-1)}>
          <ChevronRight size={16} />
        </button>
        <span className="week-label">{dateLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => changeDate(1)}>
          <ChevronLeft size={16} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(isoToday())} style={{ fontSize: 12 }}>
          היום
        </button>
      </div>

      {/* Progress */}
      {clients.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>התקדמות</span>
            <span style={{ fontSize: 13, color: 'var(--t2)' }}>{doneCount} / {clients.length} לקוחות</span>
          </div>
          <div style={{ height: 6, background: 'var(--bdr2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--grad)',
              borderRadius: 3,
              width: `${clients.length ? (doneCount / clients.length) * 100 : 0}%`,
              transition: 'width .5s cubic-bezier(.16,1,.3,1)'
            }} />
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
          return (
            <div key={client.customer_id} className={'client-block' + (done ? ' done' : '')}>
              <div className="client-hdr" onClick={() => setExpanded(p => ({ ...p, [client.customer_id]: !p[client.customer_id] }))}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? 'rgba(16,185,129,.15)' : 'var(--surf2)', border: `2px solid ${done ? 'var(--green)' : 'var(--bdr2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {done && <Check size={14} color="var(--green)" />}
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{client.name}</span>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {client.items.filter(i => checks[i.line_id]).length}/{client.items.length} פריטים
                </span>
                {isOpen ? <ChevronUp size={16} color="var(--t3)" /> : <ChevronDown size={16} color="var(--t3)" />}
              </div>
              {isOpen && (
                <div className="client-body">
                  {client.items.map(item => {
                    const checked = !!checks[item.line_id]
                    return (
                      <div key={item.line_id} className={'pack-item' + (checked ? ' checked' : '')} onClick={() => toggleCheck(item.line_id)}>
                        <div className={'pack-check' + (checked ? ' checked' : '')}>
                          {checked && <Check size={12} color="#fff" />}
                        </div>
                        <span className="pack-label" style={{ flex: 1, fontSize: 14 }}>{item.name_he}</span>
                        <span className="pack-qty">{item.quantity} {item.unit}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
