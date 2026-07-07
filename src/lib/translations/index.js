import common from './common'
import layout from './layout'
import packing from './packing'
import weekly from './weekly'
import production from './production'
import dashboard from './dashboard'

// Each page contributes its own { he: {...}, en: {...} } dictionary --
// merged here into one flat lookup table per language. Keys are
// dot-namespaced by page (e.g. 'dashboard.title') to avoid collisions.
const sources = [common, layout, packing, weekly, production, dashboard]

function merge(langKey) {
  return sources.reduce((acc, src) => ({ ...acc, ...src[langKey] }), {})
}

export const TRANSLATIONS = {
  he: merge('he'),
  en: merge('en'),
}
