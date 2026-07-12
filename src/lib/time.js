export function timeAgo(iso, lang) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (lang === 'en') {
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin} min ago`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return `${Math.round(diffHr / 24)}d ago`
  }
  if (diffMin < 1) return 'עכשיו'
  if (diffMin < 60) return `לפני ${diffMin} דק׳`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `לפני ${diffHr} שעות`
  return `לפני ${Math.round(diffHr / 24)} ימים`
}
