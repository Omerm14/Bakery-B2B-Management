import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTelegramHtml, stripTags, splitMessage, israelToday, dateContext, cleanQuestion } from './format.js'

test('keeps allowed tags and escapes the rest', () => {
  assert.equal(toTelegramHtml('<b>קפה ביאליק</b>: 5 < 6 & more'), '<b>קפה ביאליק</b>: 5 &lt; 6 &amp; more')
  assert.equal(toTelegramHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;')
  assert.equal(toTelegramHtml('<a href="x">link</a>'), '&lt;a href="x"&gt;link&lt;/a&gt;')
  assert.equal(toTelegramHtml('&amp; stays'), '&amp; stays')
})

test('balances unclosed and misnested tags', () => {
  assert.equal(toTelegramHtml('<b>open'), '<b>open</b>')
  assert.equal(toTelegramHtml('<b><i>x</b>'), '<b><i>x</i></b>')
  assert.equal(toTelegramHtml('stray </i> close'), 'stray  close')
  assert.equal(toTelegramHtml('<blockquote expandable>a</blockquote>'), '<blockquote expandable>a</blockquote>')
})

test('converts markdown slips', () => {
  assert.equal(toTelegramHtml('**סה״כ** 40\n## כותרת'), '<b>סה״כ</b> 40\n<b>כותרת</b>')
})

test('strips tags for the plain fallback', () => {
  assert.equal(stripTags('<b>a</b> &lt;3 &amp; b'), 'a <3 & b')
})

test('splits long messages on line breaks', () => {
  const line = 'x'.repeat(100)
  const text = Array.from({ length: 60 }, () => line).join('\n')
  const parts = splitMessage(text, 1000)
  assert.ok(parts.every(p => p.length <= 1000))
  assert.equal(parts.join('\n'), text)
  assert.deepEqual(splitMessage('short'), ['short'])
})

test('dates are in Israel time with Sunday-start weeks', () => {
  // 2026-10-31 22:30 UTC is already Sunday 1 Nov in Israel (UTC+2).
  assert.deepEqual(israelToday(new Date('2026-10-31T22:30:00Z')), { iso: '2026-11-01', dow: 0, dayName: 'ראשון' })
  const ctx = dateContext(new Date('2026-10-29T10:00:00Z'))   // Thursday
  assert.match(ctx, /השבוע הנוכחי: 2026-10-25 עד 2026-10-31/)
  assert.match(ctx, /שבוע שעבר: 2026-10-18 עד 2026-10-24/)
})

test('cleans mentions and commands from the question', () => {
  assert.equal(cleanQuestion('@Urban_BakeryBot כמה הזמין קיוסקו?'), 'כמה הזמין קיוסקו?')
  assert.equal(cleanQuestion('/ask@BakeryBot סיכום'), 'סיכום')
  assert.equal(cleanQuestion('/start'), '')
})
