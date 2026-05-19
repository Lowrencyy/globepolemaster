# Globe App (Web Frontend) — Codex Context

## What this is
React 19 + Vite + TypeScript + Tailwind CSS web dashboard. Admin/operations UI for the TwinBackend multi-company telco platform.

## Key files
- `src/lib/auth.ts` — API base URL, SKYCABLE_API constant, token helpers, role checks
- `src/lib/cache.ts` — sessionStorage cache with 5-min TTL (`cacheGet`, `cacheSet`, `cacheDel`)
- `src/lib/utils.ts` — `slugify()` and other helpers
- `src/App.tsx` — All React Router v6 routes
- `src/pages/` — All page components

## Backend connection
```ts
export const API_BASE = 'https://disguisedly-enarthrodial-kristi.ngrok-free.dev'
export const SKYCABLE_API = `${API_BASE}/api/v1/skycable`
```
All fetch calls need header: `'ngrok-skip-browser-warning': '1'`  
Auth: `Authorization: Bearer ${getToken()}` from `localStorage.auth_token`

## Routing structure (App.tsx)
React Router v6 — static segments always beat dynamic params (no need to worry about order for most routes).

### Key routes
```
/dashboard                     → Dashboard
/nodes                         → AllPoles (nodelist)
/:siteSlug                     → SiteDetail
/:siteSlug/:nodeSlug           → NodeDetail
/:siteSlug/:nodeSlug/poles     → NodePolesList
/:siteSlug/:nodeSlug/spans     → NodeSpans
/:siteSlug/:nodeSlug/:poleCode → PoleDetail (pole code in URL, not ID)
/spans                         → SpanList (site select)
/spans/:spanSiteSlug           → SpanList (node select for that site)
/spans/:spanSiteSlug/:spanNodeSlug → SpanList (spans for that node)
/poles/map                     → PoleMapView
/reports/rtd                   → RTDReports
/reports/pole-reports          → PoleReports
```

### Slug pattern
`${slugify(name)}-${id}` — e.g. `north-luzon-1`, `cagayan-valley-node-2-45`  
Extract ID from slug: `slug.split('-').at(-1)` gives the numeric ID.

## Nodelist (src/pages/nodes/nodelist.tsx)
- Fetches `GET /api/v1/skycable/nodes` (paginated 50/page)
- Add/Edit modal includes: name, area, status, report_type, **subcontractor, team** (cascading), location (PSGC)
- Subcontractor dropdown: `GET /api/v1/admin/subcontractors?per_page=200`
- Team dropdown (loads on subcontractor select): `GET /api/v1/admin/teams?subcontractor_id={id}&per_page=200`
- Edit calls `PATCH /api/v1/skycable/nodes/{id}` — sends all fields including `site_id`, `subcontractor_id`, `team_id`
- PSGC cascade: `required={mode === 'add'}` — NOT required on edit to avoid HTML5 validation blocking when options haven't loaded

## PoleMapView (src/pages/poles/PoleMapView.tsx)
- Uses `GET /api/v1/skycable/poles/all` (returns all poles, has_gps flag)
- Cache key: `pole_map_all` (5-min TTL)
- Sidebar shows ALL poles; map shows only those with `has_gps: true`
- GPS filter pills: All / GPS / No GPS
- Leaflet map with satellite/streets/dark tile switcher

## SpanList (src/pages/spans/SpanList.tsx)
URL-driven navigation: selecting a site navigates to `/spans/:siteSlug`, selecting a node navigates to `/spans/:siteSlug/:nodeSlug`.  
On mount: reads `spanSiteSlug` + `spanNodeSlug` params → auto-selects area/node → loads spans.  
`useEffect([spanSiteSlug, spanNodeSlug])` syncs state when browser back/forward changes URL.  
Cache: `spanlist_areas`, `spanlist_nodes_{areaId}`

## Reports (RTD + Pole)
Both use `cacheGet/cacheSet` to skip re-fetch when cache is warm. Pattern:
```ts
if (cacheGet(key)) return  // skip fetch
fetch(...)  .then(data => { set(data); cacheSet(key, data) })
```

## Auth helpers (src/lib/auth.ts)
- `isAdmin()` — checks user role + JWT payload for admin/super_admin/administrator
- `isExecutive()` — executive/exec/manager
- `canManageStatus()` — isAdmin || isExecutive
- `getRole()` — returns lowercase role string, defaults to 'field_staff'

## Important patterns

### Cache-first fetching
All list pages use stale-while-revalidate or cache-skip pattern from `src/lib/cache.ts`.

### Slugified node URLs
Node clicks navigate to `/${siteSlug}/${slugify(node.full_label ?? node.name)}-${node.id}/poles`

### Pole code in URL (not ID)
PoleDetail route uses `:poleCode` param and fetches `GET /api/v1/skycable/poles/code/{code}`

### Edit saves to backend
`handleEdit` in nodelist calls `PATCH /api/v1/skycable/nodes/{id}` with full payload. Previously it was optimistic-only — always use PATCH for edits.
