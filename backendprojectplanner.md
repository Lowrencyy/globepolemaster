# Project State — Globe Operations Platform

> This document reflects the **actual current state** of the platform as of May 2026.  
> Read `C:/twinbackend/CLAUDE.md` for backend-specific context.  
> Read `C:/globe-app/globe-app/CLAUDE.md` for web frontend context.  
> Read `C:/globe-mobileapp/CLAUDE.md` for mobile app context.

---

## What's built

A multi-company telco field operations platform with three frontends sharing one Laravel backend.

### Backend (`C:/twinbackend/`)
Laravel 11 REST API. Exposed via ngrok tunnel. Four company scopes: **Skycable**, **Globe**, **Meralco**, **TelcoVantage (admin)**. Each scope has its own auth prefix and middleware.

### Web Dashboard (`C:/globe-app/globe-app/`)
React 19 + Vite + Tailwind. Admin/supervisor UI. Manages nodes, poles, spans, teardown workflows, reports, subcontractors.

### Mobile App (`C:/globe-mobileapp/`)
Expo 54 / React Native. For Globe field staff. Handles teardown reporting, NAP box management, pole map.

---

## Completed modules

### Skycable (backend + web)
- ✅ Areas, Sites, Nodes CRUD
- ✅ Node assignment to Subcontractor + Team (in Add/Edit modal)
- ✅ Poles with cable slots (auto-seeded C1–C5, DA)
- ✅ Pole lookup by code (`/poles/code/{code}`)
- ✅ Pole map pins (`/poles/map` — GPS only, `/poles/all` — all poles with has_gps flag)
- ✅ Spans with component tracking
- ✅ Teardown reports — two-step (`start` + `submit`) and one-shot mobile (`/teardown-logs`)
- ✅ Daily reports
- ✅ Warehouses, stock, deliveries, pickup requests
- ✅ RTD reports page (web)
- ✅ Pole reports page (web)
- ✅ Vicinity reports page (web)
- ✅ Pole Map View (web) — all poles sidebar + GPS filter
- ✅ Span list URL-driven navigation `/spans/:siteSlug/:nodeSlug`

### Globe (backend + web + mobile)
- ✅ Globe poles with GPS map
- ✅ NAP Boxes and ports
- ✅ NAP surveys
- ✅ Tickets
- ✅ Teardown reports per ticket
- ✅ Daily reports
- ✅ Mobile: teardown submit → `POST /api/v1/teardown-logs` (one-shot, any auth)
- ✅ Mobile: offline queue with auto-retry
- ✅ Mobile: PHT time (always UTC+8 regardless of device timezone)

### Admin
- ✅ Users CRUD with temp password
- ✅ Subcontractors + Teams + Members
- ✅ Audit logs

### Mobile app
- ✅ Token bridge (auth-context → lib/api.ts) — fixed teardown submission auth
- ✅ Weather cache (AsyncStorage, never shows "unavailable" after first load)
- ✅ Pole Map (explore.tsx) — all globe poles with GPS on Leaflet WebView
- ✅ Confirmation modal inside summary modal (fixes being hidden behind slide-up layer)
- ✅ PHT time display + saveDisplayTime on foreground
- ✅ NAP Box Status section removed from home screen

---

## Architecture decisions

### URL structure (web)
- Node details: `/:siteSlug/:nodeSlug` (no `/nodes/` segment)
- Pole details: `/:siteSlug/:nodeSlug/:poleCode` (pole CODE in URL, not ID)
- Spans: `/spans/:spanSiteSlug/:spanNodeSlug`

### Two API clients in mobile
`services/api.ts` (skycable/nap services, explicit token) and `lib/api.ts` (teardown screens, token-bridge). Both must be kept in sync via `token-bridge.ts`. Do NOT remove `setBridgeToken()` calls from auth-context.tsx.

### PHT time locking
All time-sensitive data uses `lib/display-time.ts` or the `pht` computed value in index.tsx. Never use `new Date().getHours()` for display or timestamps — always use `getUTCHours()` on a PHT-offset Date.

### Modal stacking in React Native
Confirm dialogs opened from inside a `animationType="slide"` Modal MUST be placed as children of that modal, not as siblings. React Native renders native modal layers independently — a sibling modal appears behind the slide layer.

---

## Known patterns / gotchas

| Issue | Fix |
|---|---|
| PSGC selects block edit form submit | `required={mode === 'add'}` on PsgcCascade — not required on edit |
| Edit modal wasn't saving to backend | Always call `PATCH /api/v1/skycable/nodes/{id}` in handleEdit, never optimistic-only |
| Teardown submit had no auth header | token-bridge.ts syncs auth-context token → lib/api.ts synchronously |
| Confirmation modal hidden by slide-up | Move confirmOpen Modal inside summaryOpen Modal JSX |
| Spans "could not load" | Caused by empty tokenStore — fixed by setBridgeToken on login |
| `/spans` sub-routes hidden by `/:siteSlug/:nodeSlug` | React Router v6 ranks `/spans/:x` over `/:x/:y` — static segments beat dynamic |

---

## Active branch
`withreports` — main development branch. `master` is base/stable.
