import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carryForwardQty } from './carryForward.js'

test('permanent line carries its quantity', () => {
  assert.equal(carryForwardQty({ quantity: 15, no_carry_forward: false, carry_forward_quantity: null }), 15)
})

test('one-time line carries its regular quantity', () => {
  assert.equal(carryForwardQty({ quantity: 15, no_carry_forward: true, carry_forward_quantity: '12.00' }), 12)
})

test('one-time zeroed line comes back', () => {
  assert.equal(carryForwardQty({ quantity: 0, no_carry_forward: true, carry_forward_quantity: 12 }), 12)
})

test('new one-time line or unknown regular quantity carries nothing', () => {
  assert.equal(carryForwardQty({ quantity: 5, no_carry_forward: true, carry_forward_quantity: 0 }), 0)
  assert.equal(carryForwardQty({ quantity: 5, no_carry_forward: true, carry_forward_quantity: null }), 0)
})
