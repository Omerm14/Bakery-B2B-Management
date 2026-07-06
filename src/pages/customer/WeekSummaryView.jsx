import { Fragment } from 'react'
import { WEEK_DAYS } from '../../constants/days'

// Read-only-at-a-glance overview of the whole week — same wide-table
// layout as the internal staff grid, kept as a secondary view (behind the
// day/week toggle) for customers who want to see everything at once
// instead of paging day by day. Still editable per-cell, gated by the
// same `canEdit` map the day view uses.
export default function WeekSummaryView({ dayDate, grouped, orderLines, canEdit, onQtyChange }) {
  const dayTotals = WEEK_DAYS.map(d => {
    const date = dayDate(d.key)
    let total = 0
    for (const key in orderLines) {
      if (key.endsWith(`_${date}`)) total += orderLines[key]?.quantity || 0
    }
    return total
  })

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
      <div className="order-grid-wrap">
        <table className="order-grid">
          <thead>
            <tr>
              <th className="item-col sticky-col">פריט</th>
              {WEEK_DAYS.map(d => {
                const date = dayDate(d.key)
                const locked = canEdit[date] === false
                return (
                  <th key={d.key}>
                    <div>{d.short}{locked && ' 🔒'}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                      {date.slice(5).replace('-', '/')}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([cat, items]) => (
              <Fragment key={cat}>
                <tr>
                  <td colSpan={8} style={{ padding: '8px 16px', background: 'var(--surf2)', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {cat}
                  </td>
                </tr>
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="item-name sticky-col">
                      {item.name_he}
                      {item.price != null && <span style={{ marginInlineStart: 6, fontSize: 11, color: 'var(--t3)' }}>{item.price}₪</span>}
                    </td>
                    {WEEK_DAYS.map(d => {
                      const date = dayDate(d.key)
                      const key = `${item.id}_${date}`
                      const line = orderLines[key]
                      const editable = canEdit[date]
                      return (
                        <td key={d.key} style={{ textAlign: 'center' }}>
                          {editable ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              className="qty-cell"
                              min="0"
                              step="0.5"
                              value={line?.quantity || ''}
                              placeholder="—"
                              onChange={e => onQtyChange(item.id, date, e.target.value)}
                            />
                          ) : (
                            <span style={{ color: 'var(--t3)', fontSize: 13 }}>{line?.quantity || '—'}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="item-name sticky-col" style={{ fontWeight: 700 }}>סה״כ</td>
              {dayTotals.map((t, i) => (
                <td key={i} style={{ textAlign: 'center', fontWeight: 700, color: 'var(--t1)' }}>{t || '—'}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
