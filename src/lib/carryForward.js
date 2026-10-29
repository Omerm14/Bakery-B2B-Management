// Quantity a line carries into next week — same rule as run_weekly_rollover()
// (migration 062). A one-time line reverts to the regular quantity it had
// before the one-time change instead of disappearing.
export function carryForwardQty(line) {
  return line.no_carry_forward ? Number(line.carry_forward_quantity ?? 0) : Number(line.quantity ?? 0)
}
