// Host-based app split: portal.urbanbakery.co serves the customer portal at
// clean paths (/login, /orders), while every other host — floory.urbanbakery.co,
// the raw *.vercel.app domain, localhost — serves the management app.
// Locally, open portal.localhost:5173 to exercise the portal side (browsers
// resolve *.localhost to 127.0.0.1 and the Vite dev server accepts it).
const { hostname } = window.location

export const isPortalHost = hostname.startsWith('portal.')

// Absolute origin of the customer portal, for links generated on the
// management host (e.g. the "copy portal link" action in Settings).
export function portalOrigin() {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    const { protocol, port } = window.location
    return `${protocol}//portal.localhost${port ? `:${port}` : ''}`
  }
  return 'https://portal.urbanbakery.co'
}
