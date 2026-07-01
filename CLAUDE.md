# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build
npm run preview   # Preview production build locally
npm run lint      # Run oxlint
```

There is no test runner configured.

## Architecture

**React 19 SPA** backed by **Supabase** (PostgreSQL + Auth), built with Vite, deployed to Vercel.

### Auth & Routing

`App.jsx` manages the Supabase auth session and controls routing via React Router v7. Unauthenticated users see `Landing` / `Login`. Authenticated users get a shared `NavBar` layout wrapping all protected pages.

### Pages

| Page | Purpose |
|---|---|
| `Dashboard` | KPI metrics and Recharts charts |
| `Orders` | Order entry and management |
| `Production` | Production planning |
| `Packing` | Packing tick-off view |
| `Weekly` | Weekly planning view |
| `History` | Historical order data |
| `Forecasting` | Demand forecasting (Recharts) |
| `Settings` | App configuration |

### Global State

`ImportContext` (`src/context/ImportContext.jsx`) provides `running`, `progress`, and `logs` app-wide for async Excel import status. An `ImportToast` in `App.jsx` displays this state.

### Supabase / Database

Client is initialized in `src/lib/supabase.js`. All tables use Row Level Security — authenticated users have full access (single shared login model).

**Core tables:**
- `weeks` — working periods (week starts on Sunday)
- `customers` — B2B wholesale clients (phone in WhatsApp E.164 format)
- `menu_items` — products with Hebrew primary name (`name_he`) and optional English name (`name_en`)
- `order_lines` — central fact table; unique per `(week_id, customer_id, menu_item_id, delivery_date)`; `source` is `manual` or `noga`
- `packing_checks` — one-per-order-line packing tick-off state
- `noga_messages` — inbound/outbound WhatsApp messages (Phase 2)
- `forecasts` — demand forecasts (Phase 3)
- `suppliers` — raw-material suppliers

DB schema is managed via numbered SQL files in `supabase/migrations/`. Run them in order against your Supabase project.

### Excel Import

`scripts/import_excel.py` is a Python helper for bulk data import. Import progress is surfaced through `ImportContext`.

### Localization

The UI is in Hebrew. `src/constants/days.js` contains Hebrew day names. Menu items use `name_he` as the primary display name.
