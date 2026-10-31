import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unitFromMenuUnit, parseQty, stepQty, formatTotals, groupByDate, matchesText } from './waste.js'

const t = (k) => ({ 'waste.unitKg': 'ק״ג', 'waste.unitUnits': 'יח׳' })[k]

test('unitFromMenuUnit maps kilograms to kg and everything else to units', () => {
  assert.equal(unitFromMenuUnit('ק״ג'), 'kg')
  assert.equal(unitFromMenuUnit('ק"ג'), 'kg')
  assert.equal(unitFromMenuUnit(' KG '), 'kg')
  assert.equal(unitFromMenuUnit('יח׳'), 'units')
  assert.equal(unitFromMenuUnit('גרם'), 'units')
  assert.equal(unitFromMenuUnit(null), 'units')
})

test('parseQty rounds units to whole numbers and keeps kg decimals', () => {
  assert.equal(parseQty('6', 'units'), 6)
  assert.equal(parseQty('2.4', 'units'), 2)
  assert.equal(parseQty('2.555', 'kg'), 2.56)
  assert.equal(parseQty('1,5', 'kg'), 1.5)
  assert.equal(parseQty('0', 'kg'), null)
  assert.equal(parseQty('0.2', 'units'), null)
  assert.equal(parseQty('', 'units'), null)
  assert.equal(parseQty('abc', 'kg'), null)
})

test('stepQty steps by 1 unit or half a kilo and never goes negative', () => {
  assert.equal(stepQty(1, 'units', 1), 2)
  assert.equal(stepQty(2, 'kg', 1), 2.5)
  assert.equal(stepQty(0.3, 'kg', -1), 0)
  assert.equal(stepQty('', 'units', 1), 1)
})

test('formatTotals keeps units and kilograms apart', () => {
  const rows = [
    { quantity: 6, unit: 'units' }, { quantity: 2, unit: 'units' },
    { quantity: 2.5, unit: 'kg' }, { quantity: '0.25', unit: 'kg' },
  ]
  assert.equal(formatTotals(rows, t, 'en-US'), '8 יח׳ · 2.75 ק״ג')
  assert.equal(formatTotals([], t, 'en-US'), '—')
})

test('groupByDate orders days and rows newest first', () => {
  const groups = groupByDate([
    { id: 1, waste_date: '2026-10-30', created_at: '2026-10-30T08:00:00Z' },
    { id: 2, waste_date: '2026-10-31', created_at: '2026-10-31T07:00:00Z' },
    { id: 3, waste_date: '2026-10-31', created_at: '2026-10-31T09:00:00Z' },
  ])
  assert.deepEqual(groups.map(g => g.date), ['2026-10-31', '2026-10-30'])
  assert.deepEqual(groups[0].rows.map(r => r.id), [3, 2])
})

test('matchesText searches item name and reason', () => {
  const row = { item_name: 'לחם כוסמין', reason: 'נשרף בתנור' }
  assert.equal(matchesText(row, 'כוסמין'), true)
  assert.equal(matchesText(row, 'נשרף'), true)
  assert.equal(matchesText(row, 'חלה'), false)
  assert.equal(matchesText({ item_name: 'x', reason: null }, ''), true)
})
