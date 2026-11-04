import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weekEndISO, isDateInWeek } from './weekGuard.js'

test('week end is the Saturday six days later, across month and year ends', () => {
  assert.equal(weekEndISO('2026-11-01'), '2026-11-07')
  assert.equal(weekEndISO('2026-08-30'), '2026-09-05')
  assert.equal(weekEndISO('2026-12-27'), '2027-01-02')
})

test('both edges of the week are inside', () => {
  assert.equal(isDateInWeek('2026-11-01', '2026-11-01'), true)
  assert.equal(isDateInWeek('2026-11-07', '2026-11-01'), true)
})

test('the 2026-08-21 portal write is rejected: 25.08 is not in the week of 30.08', () => {
  assert.equal(isDateInWeek('2026-08-25', '2026-08-30'), false)
  assert.equal(isDateInWeek('2026-08-29', '2026-08-30'), false)
})

test('dates after the week, and missing values, are rejected', () => {
  assert.equal(isDateInWeek('2026-11-08', '2026-11-01'), false)
  assert.equal(isDateInWeek(undefined, '2026-11-01'), false)
  assert.equal(isDateInWeek('2026-11-03', null), false)
})

test('addDaysISO shifts across month ends', async () => {
  const { addDaysISO } = await import('./weekGuard.js')
  assert.equal(addDaysISO('2026-10-29', 7), '2026-11-05')
  assert.equal(addDaysISO('2026-11-01', -7), '2026-10-25')
})
