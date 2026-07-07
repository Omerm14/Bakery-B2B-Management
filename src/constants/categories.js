export const CATEGORY_ORDER = ['מאפים', 'לחם ולחמניות', 'עוגות ועוגיות', 'קפואים ושונות - קונדי']

export function displayCategoryLabel(category) {
  return category === 'קפואים ושונות - קונדי' ? 'קפואים ושונות' : category
}
