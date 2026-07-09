# Floory — Data Practices

**Status: DRAFT v0.1 — internal review needed before publishing to clients.**
This document is not legal advice. Items marked `[TBD]` need an owner decision (and, ideally, a lawyer's read) before this is published or linked from the product.

---

## 1. Who this applies to

Floory has two separate groups of users, and this document covers both:

- **Staff** — internal bakery team members who sign in with a Google account and manage orders, inventory, and customers.
- **Customers** — B2B clients (bakeries, cafés, stores) who sign in to the customer portal with a phone number and PIN to place and review their orders.

What's collected and why differs between the two groups, so it's broken out separately below.

## 2. What we collect

### About customers (B2B clients)

| Data | Purpose |
|---|---|
| Business/contact name, contact person name | Identify who we're doing business with and who to reach |
| Phone number | Login identifier and WhatsApp contact |
| Email (optional) | Contact / correspondence |
| Order history (items, quantities, dates, status) | Fulfil and track orders |
| A full change history of order edits (what changed, when, and who made the change — staff or customer) | Resolve disputes, correct mistakes, and keep an accurate operational record |
| Favorite/frequently-ordered items | Speed up re-ordering in the portal |
| Login PIN | Authenticate you into the portal |
| Internal notes | Staff-only notes about the account (e.g. delivery instructions) |

### About staff

| Data | Purpose |
|---|---|
| Name and email (from Google sign-in) | Identify who is using the system and what they're authorized to do |
| Actions taken in the system (orders created/edited, etc.) | Same operational audit trail as above — accountability for changes made on a client's order |

## 3. Where it's stored and who can see it

- All data is stored in our hosted database (Supabase / PostgreSQL), not in spreadsheets or personal devices.
- Access is enforced at the database level: **a customer can only ever see their own data** — never another client's orders, contacts, or history. Staff accounts can see data across all clients, scoped to their job.
- Only pre-approved staff email addresses can get staff-level access; everyone else who signs in lands on a "no access" screen.

## 4. What we don't collect

- No payment card or billing/bank information (Floory doesn't process payments).
- No physical address or precise location data.
- No data from anyone other than the account holder — we don't collect data about your customers' customers.

## 5. Analytics

*(To be filled in once a tool is selected — see the separate analytics tool recommendation.)*

When we add product analytics, this section will name the specific tool, state plainly what it tracks (e.g. "which screens and features are used, and how often" — not keystrokes, not message content, no session recordings unless explicitly stated), and confirm it does not add any new personal data beyond what's already listed above. This section will be updated *before* the tool goes live, not after.

## 6. Data retention

`[TBD]` — we don't currently have a defined retention/deletion policy (e.g. how long we keep a former client's order history after they stop ordering). Needs an owner decision.

## 7. Your rights / contact

`[TBD]` — add a real contact channel here (email or phone) for a client who wants to ask what data we hold about them, correct it, or request deletion.

## 8. Changes to this document

We'll update this page whenever what we collect changes, and keep old versions available on request. Last updated: `[TBD — fill in on publish]`.

---

### Internal notes (remove before publishing externally)

- Source material for this draft came from reviewing the database schema and migration history directly — the migration files (e.g. `022_customer_auth_foundation.sql`, `039_staff_allowlist.sql`, `036_order_change_notifications.sql`) already contain good prose explaining *why* each data decision was made and are worth re-reading if this doc needs expanding.
- The customer-facing portal UI is in Hebrew; if this document is meant to be read by clients rather than just staff, it likely needs a Hebrew translation before publishing, not just an English version.
- This is deliberately *not* framed as a formal Privacy Policy / legal document — it's a plain-language internal source of truth that a real policy (and any consent UI) should be built from.
