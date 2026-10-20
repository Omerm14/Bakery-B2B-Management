// Fallback order used until the categories table (sort_order, migration 062)
// has loaded, or if that load fails — matches the order that was hardcoded
// before staff could reorder categories in Settings.
export const DEFAULT_CATEGORY_ORDER = ['מאפים', 'לחם', 'לחמניות', 'עוגות ועוגיות', 'קפואים ושונות - קונדי']

export const UNCATEGORIZED = 'כללי'

// Reorders a { category: items[] } map: categories in `order` first, then
// any leftover categories (on menu_items but not in the categories table)
// alphabetically, then uncategorized last.
export function orderCategoryBuckets(buckets, order) {
  const result = {}
  for (const k of order) if (buckets[k]?.length) result[k] = buckets[k]
  const rest = Object.keys(buckets)
    .filter(k => k !== UNCATEGORIZED && !order.includes(k))
    .sort((a, b) => a.localeCompare(b, 'he'))
  for (const k of rest) result[k] = buckets[k]
  if (buckets[UNCATEGORIZED]?.length && !(UNCATEGORIZED in result)) result[UNCATEGORIZED] = buckets[UNCATEGORIZED]
  return result
}

export function displayCategoryLabel(category) {
  return category === 'קפואים ושונות - קונדי' ? 'קפואים ושונות' : category
}
