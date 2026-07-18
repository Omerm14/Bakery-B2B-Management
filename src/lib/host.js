// The customer portal used to live on a separate subdomain
// (portal.urbanbakery.co); it now lives at /portal/:orgSlug/* on the same
// domain as the staff app (see App.jsx) — a second/third bakery client
// can't each get their own subdomain the way a single-tenant deployment
// could. `portalPath(orgSlug)` builds the customer-facing link for a given
// org (used by Settings' "set/reset PIN" -> "copy portal link" action);
// there is no longer a separate host to resolve.
export function portalPath(orgSlug, phone) {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : ''
  return `/portal/${orgSlug}/login${query}`
}
