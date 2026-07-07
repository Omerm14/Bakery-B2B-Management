// Shared English-name fallback for customers, mirroring the name_he/name_en
// pattern menu_items already has (see per-page item displayName helpers).
// Falls back to the Hebrew name when no English name has been set.
export function customerDisplayName(customer, lang) {
  if (!customer) return ''
  return lang === 'en' ? (customer.name_en || customer.name) : customer.name
}
