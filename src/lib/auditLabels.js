const REASON_KEYS = {
  customer_request: 'settings.auditReason.customerRequest',
  internal_decision: 'settings.auditReason.internalDecision',
  correction: 'settings.auditReason.correction',
  other: 'settings.auditReason.other',
  import: 'settings.auditReason.import',
  forecast: 'settings.auditReason.forecast',
  auto_copy: 'settings.auditReason.autoCopy',
}

// Reason column text, with the one-time marker appended when set.
export function auditReasonLabel(row, t) {
  const base = REASON_KEYS[row.change_reason] ? t(REASON_KEYS[row.change_reason]) : (row.change_reason || '—')
  return row.no_carry_forward ? `${base} · ${t('settings.auditOneTime')}` : base
}
