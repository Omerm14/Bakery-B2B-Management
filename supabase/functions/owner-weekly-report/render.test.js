import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeklySvg, headline, caption, healthChips, esc } from './render.js'

const base = {
  business_name: 'Urban Bakery', week_start: '2026-10-25', week_end: '2026-10-31',
  units: 12480, prev_units: 11990, customers: 47, prev_customers: 45,
  customer_changes: 86, prev_customer_changes: 70,
  days: [0, 1, 2, 3, 4, 5, 6].map(dow => ({ dow, cur: 1000 + dow * 100, prev: 1000 })),
  movers: [{ name: 'קיוסקו', cur: 92, prev: 140, pct: -34 }, { name: 'קפה ביאליק', cur: 330, prev: 280, pct: 18 }],
  drop_alerts: 0, alerts: {}, rollover_ok: true, drop_check_ok: true,
}

test('headline reflects trend and alerts', () => {
  assert.deepEqual(headline(base), { title: 'שבוע יציב · בלי התראות', sub: 'הייצור עלה ב-4% לעומת שבוע שעבר. קיוסקו ירד ב-34%.' })
  assert.equal(headline({ ...base, units: 15000, alerts: { late_changes: 1 } }).title, 'שבוע של צמיחה · התראה אחת')
  assert.equal(headline({ ...base, units: 9000, drop_alerts: 3 }).title, 'ירידה בייצור השבוע · 3 התראות')
  assert.equal(headline({ ...base, prev_units: 0 }).title, 'שבוע ראשון עם נתונים · בלי התראות')
})

test('caption is a short text summary', () => {
  assert.equal(caption(base), '📊 סיכום שבועי 25.10–31.10\n12,480 יח׳ (+4%) · 47 לקוחות · בלי התראות')
})

test('health chips flag failures and alerts', () => {
  assert.deepEqual(healthChips(base).map(c => c.label), ['העתקה שבועית', 'בדיקת חוסרים', 'אין חריגות השבוע'])
  const bad = healthChips({ ...base, rollover_ok: false, drop_alerts: 2, alerts: { cron_failure: 1 } })
  assert.deepEqual(bad.map(c => c.label), ['העתקה שבועית לא רצה', 'בדיקת חוסרים', 'מוצרים שלא הועתקו: 2', 'משימות שנכשלו: 1'])
  assert.equal(healthChips({ ...base, rollover_ok: null })[0].tone, 'muted')
})

test('svg contains the numbers, seven day labels and escapes names', () => {
  const svg = buildWeeklySvg({ ...base, movers: [{ name: 'A & <B>', cur: 1, prev: 50, pct: -98 }] })
  assert.match(svg, /^<svg [^>]*width="1080" height="1350"/)
  assert.ok(svg.includes('12,480'))
  for (const d of ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']) assert.ok(svg.includes(`>‏${d}‏<`), `day ${d}`)
  assert.ok(svg.includes('A &amp; &lt;B&gt;'))
  assert.ok(!svg.includes('<B>'))
})

test('esc covers all XML specials', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
})
