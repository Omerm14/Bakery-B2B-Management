import posthog from 'posthog-js'
import { isPortalHost } from './host'

const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

// No key configured (e.g. local dev) — every helper below becomes a no-op,
// so the app runs identically with analytics fully off.
let enabled = false

export function initAnalytics() {
  if (!key) return
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    respect_dnt: true,
  })
  posthog.register({ app: isPortalHost ? 'portal' : 'staff' })
  enabled = true
}

// Customer identities carry only the DB id — no name/phone/email is sent to
// PostHog. Staff identities carry their work email, matching what the data
// practices doc already discloses about staff activity being attributable.
export function identifyUser(user) {
  if (!enabled || !user) return
  const role = user.app_metadata?.role
  if (role === 'customer') {
    posthog.identify(user.id, { role, customer_id: user.app_metadata?.customer_id })
  } else if (role === 'staff') {
    posthog.identify(user.id, { role, email: user.email })
  }
}

export function resetAnalytics() {
  if (!enabled) return
  posthog.reset()
}

export function trackEvent(name, properties) {
  if (!enabled) return
  posthog.capture(name, properties)
}

export function trackPageview(path) {
  if (!enabled) return
  posthog.capture('$pageview', { path })
}
