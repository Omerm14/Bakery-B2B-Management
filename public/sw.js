// Minimal pass-through service worker for the customer portal.
//
// Its ONLY job is satisfying Android/Chrome's install-prompt requirement
// (a registered service worker with a fetch handler). This is a live
// ordering app — DO NOT add caching here. Caching menu/order data risks
// showing stale prices/availability, and caching Vite's content-hashed
// JS/CSS filenames risks 404s against a newer deploy. If offline support
// is ever wanted, it needs a deliberate cache-invalidation strategy, not
// a quick addition to this file.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})
