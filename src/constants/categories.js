export const CATEGORY_ORDER = ['מאפים', 'לחם', 'לחמניות', 'עוגות ועוגיות', 'קפואים ושונות - קונדי']

export function displayCategoryLabel(category) {
  return category === 'קפואים ושונות - קונדי' ? 'קפואים ושונות' : category
}
