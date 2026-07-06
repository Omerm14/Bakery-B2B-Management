import { useState } from 'react'
import { WEEK_DAYS, weekStart, dayDate, formatWeekLabel } from '../../constants/days'

// Standalone design preview of the customer portal — phone+PIN login ->
// order grid — using only local component state and static mock data.
// Makes zero Supabase/Edge Function calls, so it works today even before
// any migrations are run. Intentionally NOT wired into the real
// CustomerLogin/CustomerOrders components — this is a one-off preview,
// kept fully isolated so it can be deleted later without touching any
// real auth/session code.

const MOCK_ITEMS = [
  { id: 'm1', category: 'מאפים', name_he: 'קרואסון חמאה', unit: 'יח׳' },
  { id: 'm2', category: 'מאפים', name_he: 'מאפין בלוברי', unit: 'יח׳' },
  { id: 'm3', category: 'מאפים', name_he: 'רוגלך שוקולד', unit: 'יח׳' },
  { id: 'm4', category: 'לחם', name_he: 'לחם שיפון', unit: 'יח׳' },
  { id: 'm5', category: 'לחם', name_he: 'בגט צרפתי', unit: 'יח׳' },
]

const MOCK_STARTING_QTY = { m1_0: 12, m1_1: 12, m4_0: 3 }

const START = weekStart()
const LOCKED_DAY_OFFSETS = new Set([5, 6]) // Fri/Sat locked, for the preview

function PreviewBanner() {
  return (
    <div style={{
      background: 'var(--amber-tint)', border: '1px solid var(--amber-bdr)', color: 'var(--amber)',
      borderRadius: 'var(--rs)', padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600,
      textAlign: 'center', direction: 'rtl',
    }}>
      🔍 תצוגה מקדימה — אין חיבור לנתונים אמיתיים
    </div>
  )
}

function MockCutoffNotice() {
  return (
    <div className="alert alert-warn" style={{ direction: 'rtl' }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>מועד השינוי חלף</div>
        <div style={{ fontSize: 13 }}>לא ניתן לבצע שינוי בשעה זו. יש לפנות לעמית בטלפון או בקבוצת הוואטסאפ.</div>
      </div>
    </div>
  )
}

export default function CustomerPortalDemo() {
  const [step, setStep] = useState('login')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [qty, setQty] = useState(MOCK_STARTING_QTY)

  const grouped = MOCK_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  function setCell(itemId, offset, value) {
    setQty(prev => ({ ...prev, [`${itemId}_${offset}`]: parseFloat(value) || 0 }))
  }

  if (step === 'login') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <PreviewBanner />
          <div className="card" style={{ direction: 'rtl' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>כניסה להזמנות</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>הזן את מספר הטלפון וקוד הגישה שקיבלת.</div>
            <label className="lbl">מספר טלפון</label>
            <input className="input" dir="ltr" placeholder="050-1234567" value={phone} onChange={e => setPhone(e.target.value)} autoFocus />
            <label className="lbl" style={{ marginTop: 12 }}>קוד גישה</label>
            <input className="input" dir="ltr" type="password" placeholder="קוד הגישה שקיבלת" value={pin} onChange={e => setPin(e.target.value)} />
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setStep('orders')}>
              כניסה
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <PreviewBanner />
      <div className="page-header">
        <h1 className="page-title">הזמנות — קפה לואיז (דמו)</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setStep('login')}>יציאה</button>
      </div>

      <div className="week-nav">
        <span className="week-label">{formatWeekLabel(START)}</span>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12 }}><MockCutoffNotice /></div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="order-grid-wrap">
          <table className="order-grid">
            <thead>
              <tr>
                <th className="item-col sticky-col">פריט</th>
                {WEEK_DAYS.map(d => (
                  <th key={d.key}>
                    <div>{d.short}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                      {dayDate(START, d.key).slice(5).replace('-', '/')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([cat, items]) => (
                <>
                  <tr key={`cat-${cat}`}>
                    <td colSpan={8} style={{ padding: '8px 16px', background: 'var(--surf2)', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {cat}
                    </td>
                  </tr>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td className="item-name sticky-col">{item.name_he}</td>
                      {WEEK_DAYS.map(d => {
                        const key = `${item.id}_${d.key}`
                        const locked = LOCKED_DAY_OFFSETS.has(d.key)
                        return (
                          <td key={d.key} style={{ textAlign: 'center' }}>
                            {locked ? (
                              <span style={{ color: 'var(--t3)', fontSize: 13 }} title="מועד השינוי חלף">
                                {qty[key] || '—'} 🔒
                              </span>
                            ) : (
                              <input
                                type="number" className="qty-cell" min="0" step="0.5"
                                value={qty[key] || ''} placeholder="—"
                                onChange={e => setCell(item.id, d.key, e.target.value)}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
