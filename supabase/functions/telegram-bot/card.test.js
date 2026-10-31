import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCustomerCardSvg, cardCaption, chartBuckets, subtitle, fmtQty, truncate } from './card.js'

export const sample = {
  business_name: 'Urban Bakery',
  customer: { name: 'קפה ביאליק' },
  from: '2026-10-25', to: '2026-10-31', days_in_range: 7,
  total_units: 1240, order_days: 5, distinct_items: 12, total_value: 8420, items_without_price: 2,
  prev: { from: '2026-10-18', to: '2026-10-24', total_units: 1100, order_days: 5, total_value: 7900 },
  items: [
    { name: 'לחם שאור', unit: 'יח׳', qty: 320, prev_qty: 300 },
    { name: 'קרואסון חמאה', unit: 'יח׳', qty: 260, prev_qty: 310 },
    { name: 'לחמניית בריוש', unit: 'יח׳', qty: 180, prev_qty: 0 },
    { name: 'עוגת שמרים שוקולד', unit: 'מגש', qty: 12.5, prev_qty: 10 },
  ],
  categories: [{ category: 'לחמים', qty: 700 }, { category: 'מאפים', qty: 440 }, { category: 'עוגות', qty: 100 }],
  days: [
    { date: '2026-10-25', units: 240 }, { date: '2026-10-26', units: 260 }, { date: '2026-10-27', units: 220 },
    { date: '2026-10-29', units: 300 }, { date: '2026-10-30', units: 220 },
  ],
}

test('caption and subtitle come from the numbers', () => {
  assert.equal(cardCaption(sample), '🧾 קפה ביאליק · 25/10/2026 – 31/10/2026\n1,240 יח׳ (+13%) · 5 ימי אספקה · 12 מוצרים')
  assert.equal(subtitle(sample), '1,240 יחידות ב-5 ימי אספקה, עלייה של 13% לעומת התקופה הקודמת.')
  assert.equal(subtitle({ ...sample, total_units: 0 }), 'לא היו הזמנות בתקופה הזו.')
  assert.equal(subtitle({ ...sample, order_days: 1, prev: { total_units: 0 } }), '1,240 יחידות ביום אספקה אחד, אין הזמנות בתקופה הקודמת להשוואה.')
})

test('chart buckets by day, week or month', () => {
  const days = chartBuckets(sample)
  assert.equal(days.unit, 'day')
  assert.equal(days.buckets.length, 7)
  assert.deepEqual(days.buckets[3], { label: 'ד', sub: '28.10', units: 0 })   // missing day = 0
  const weeks = chartBuckets({ from: '2026-10-01', to: '2026-10-31', days: [{ date: '2026-10-01', units: 5 }, { date: '2026-10-03', units: 5 }, { date: '2026-10-04', units: 7 }] })
  assert.equal(weeks.unit, 'week')
  assert.deepEqual(weeks.buckets.slice(0, 2).map(b => [b.label, b.units]), [['01.10', 10], ['04.10', 7]])
  const months = chartBuckets({ from: '2026-01-01', to: '2026-10-31', days: [{ date: '2026-03-02', units: 9 }] })
  assert.equal(months.unit, 'month')
  assert.equal(months.buckets.length, 10)
  assert.equal(months.buckets[2].units, 9)
})

test('formatting helpers', () => {
  assert.equal(fmtQty(1240), '1,240')
  assert.equal(fmtQty(12.5), '12.5')
  assert.equal(truncate('אבגדה', 4), 'אבג…')
})

test('svg renders and escapes names', () => {
  const svg = buildCustomerCardSvg({ ...sample, customer: { name: 'A&B <Cafe>' } })
  assert.ok(svg.startsWith('<svg'))
  assert.ok(svg.includes('A&amp;B &lt;Cafe&gt;'))
  assert.ok(!svg.includes('NaN'))
  // A single day has no chart; an empty period still renders.
  assert.ok(!buildCustomerCardSvg({ ...sample, from: '2026-10-25', to: '2026-10-25' }).includes('יחידות לפי'))
  assert.ok(buildCustomerCardSvg({ ...sample, total_units: 0, items: [], categories: [], days: [] }).includes('אין מוצרים'))
})
