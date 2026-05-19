import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { SKYCABLE_API, getToken } from '../../lib/auth'

// ── Types ─────────────────────────────────────────────────────────────────────

type LinemanStatus = 'active' | 'idle' | 'offline'

interface Lineman {
  id: string
  name: string
  employeeId: string
  status: LinemanStatus
  currentTask: string
  region: string
  lastUpdate: Date
  lat: number
  lng: number
  trail: Array<{ lat: number; lng: number }>
  _api?: ApiLineman
}

interface ApiLineman {
  id: string
  name: string
  employeeId: string
  status: LinemanStatus
  lat: number
  lng: number
  accuracy: number | null
  pingedAt: string
  // Address (reverse-geocoded from device)
  barangay: string | null
  city: string | null
  province: string | null
  regionName: string | null
  // Assignment
  teamId: number | null
  teamName: string | null
  subconId: number | null
  subconName: string | null
}

// ── Teardown log types ────────────────────────────────────────────────────────

type LogAction = 'started' | 'completed' | 'submitted' | 'flagged' | 'on_site'

interface TeardownLog {
  id: string
  ticket: string
  lineman: string
  employeeId: string
  pole: string
  span: string
  area: string
  action: LogAction
  ts: Date
}

const LOG_ACTION_STYLE: Record<LogAction, { label: string; cls: string }> = {
  started:   { label: 'Started',   cls: 'bg-blue-500/20 text-blue-500' },
  on_site:   { label: 'On Site',   cls: 'bg-violet-500/20 text-violet-500' },
  completed: { label: 'Completed', cls: 'bg-green-500/20 text-green-500' },
  submitted: { label: 'Submitted', cls: 'bg-teal-500/20 text-teal-500' },
  flagged:   { label: 'Flagged',   cls: 'bg-red-500/20 text-red-400' },
}

function timeAgo(date: Date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`
}

function apiHeaders() {
  const token = getToken()
  return {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function mapApiLineman(api: ApiLineman, prev?: Lineman): Lineman {
  const trail = prev
    ? [...prev.trail, { lat: prev.lat, lng: prev.lng }].slice(-8)
    : []

  const locationParts = [api.city, api.province].filter(Boolean)
  const region = locationParts.length > 0 ? locationParts.join(', ') : (api.regionName ?? '—')

  return {
    id:          api.id,
    name:        api.name,
    employeeId:  api.employeeId,
    status:      api.status,
    currentTask: api.status === 'offline' ? 'No signal' : api.status === 'idle' ? 'Idle' : 'In the field',
    region,
    lastUpdate:  new Date(api.pingedAt),
    lat:         api.lat,
    lng:         api.lng,
    trail,
    // carry full api data for detail card
    _api:        api,
  } as Lineman & { _api: ApiLineman }
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<LinemanStatus, string> = {
  active:  '#16a34a',
  idle:    '#d97706',
  offline: '#6b7280',
}

const STATUS_LABEL: Record<LinemanStatus, string> = {
  active:  'Active',
  idle:    'Idle',
  offline: 'Offline',
}

const TILES = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri', label: 'Satellite' },
  osm:       { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           attr: '© OpenStreetMap contributors', label: 'Streets' },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                attr: '© CartoDB', label: 'Dark' },
}
type BaseTile = keyof typeof TILES

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  const p = name.trim().split(' ')
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

function injectPulseCSS() {
  if (document.getElementById('lm-pulse-css')) return
  const s = document.createElement('style')
  s.id = 'lm-pulse-css'
  s.textContent = `
    @keyframes lm-ripple {
      0%   { transform: scale(0.9); opacity: 0.7; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    .lm-ripple {
      position: absolute; inset: 0; border-radius: 50%;
      animation: lm-ripple 2s ease-out infinite;
      pointer-events: none;
    }
  `
  document.head.appendChild(s)
}

function makeIcon(l: Pick<Lineman, 'name' | 'status'>, size = 34, opacity = 1) {
  const color  = STATUS_COLOR[l.status]
  const ini    = initials(l.name)
  const pulse  = l.status === 'active' && opacity === 1
    ? `<div class="lm-ripple" style="border:2px solid ${color};"></div>`
    : ''

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity}">
      ${pulse}
      <div style="
        position:relative;z-index:1;
        width:${size}px;height:${size}px;border-radius:50%;
        background:#fff;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font:700 ${Math.round(size * 0.34)}px/1 system-ui,sans-serif;
        color:${color};
        box-shadow:0 2px 10px rgba(0,0,0,0.28);
      ">${ini}</div>
    </div>`

  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -(size / 2 + 6)] })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiveTeardown() {
  const mapRef     = useRef<HTMLDivElement>(null)
  const mapObj     = useRef<L.Map | null>(null)
  const tileRef    = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, { main: L.Marker; trail: L.Marker[] }>>(new Map())

  const [linemen, setLinemen]           = useState<Lineman[]>([])
  const [lastFetch, setLastFetch]       = useState<Date | null>(null)
  const [fetchError, setFetchError]     = useState(false)
  const linemenRef                      = useRef<Lineman[]>([])
  const [baseTile, setBaseTile]         = useState<BaseTile>('satellite')
  const [filterStatus, setFilterStatus] = useState<LinemanStatus | 'all'>('all')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState<string | null>(null)
  const [logsOpen, setLogsOpen]         = useState(false)
  const [logs]                          = useState<TeardownLog[]>([])
  const [logFilter, setLogFilter]       = useState<LogAction | 'all'>('all')

  const selectedLineman = linemen.find(l => l.id === selected) ?? null

  // ── Init pulse CSS ─────────────────────────────────────────────────────────
  useEffect(() => { injectPulseCSS() }, [])

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return
    const map = L.map(mapRef.current, { center: [12.5, 122.0], zoom: 6, zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    tileRef.current = L.tileLayer(TILES.satellite.url, { attribution: TILES.satellite.attr, maxZoom: 19 }).addTo(map)
    mapObj.current = map
    return () => { map.remove(); mapObj.current = null }
  }, [])

  // ── Swap tile ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapObj.current) return
    tileRef.current?.remove()
    const t = TILES[baseTile]
    tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(mapObj.current)
  }, [baseTile])

  // ── Poll backend for live lineman locations every 30 s ────────────────────
  useEffect(() => {
    async function fetchLocations() {
      try {
        const res = await fetch(`${SKYCABLE_API}/lineman/locations`, { headers: apiHeaders() })
        if (!res.ok) { setFetchError(true); return }
        const data: ApiLineman[] = await res.json()
        setFetchError(false)
        setLastFetch(new Date())
        setLinemen(prev => {
          linemenRef.current = data.map(api => {
            const existing = prev.find(p => p.id === api.id)
            return mapApiLineman(api, existing)
          })
          return linemenRef.current
        })
      } catch {
        setFetchError(true)
      }
    }

    fetchLocations()
    const id = setInterval(fetchLocations, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Redraw markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapObj.current) return

    linemen.forEach(l => {
      const existing = markersRef.current.get(l.id)

      // Remove stale trail
      existing?.trail.forEach(m => m.remove())

      // Main marker — update or create
      let main: L.Marker
      if (existing) {
        main = existing.main
        main.setLatLng([l.lat, l.lng])
        main.setIcon(makeIcon(l))
        main.off('click')
      } else {
        main = L.marker([l.lat, l.lng], { icon: makeIcon(l), zIndexOffset: 100 }).addTo(mapObj.current!)
      }
      main.on('click', () => {
        mapObj.current?.flyTo([l.lat, l.lng], 15, { duration: 1.2 })
        setSelected(l.id)
      })

      // Trail ghost markers — oldest = most faded
      const trail = l.trail.map((pos, i) => {
        const frac    = (i + 1) / l.trail.length
        const opacity = 0.06 + frac * 0.32
        const size    = Math.round(14 + frac * 14)
        return L.marker([pos.lat, pos.lng], {
          icon: makeIcon(l, size, opacity),
          interactive: false,
          zIndexOffset: -1000,
        }).addTo(mapObj.current!)
      })

      markersRef.current.set(l.id, { main, trail })
    })
  }, [linemen])

  // ── Fly to helper ──────────────────────────────────────────────────────────
  const flyTo = (l: Lineman) => {
    mapObj.current?.flyTo([l.lat, l.lng], 15, { duration: 1.2 })
    setSelected(l.id)
  }

  // ── Derived counts ─────────────────────────────────────────────────────────
  const counts = {
    active:  linemen.filter(l => l.status === 'active').length,
    idle:    linemen.filter(l => l.status === 'idle').length,
    offline: linemen.filter(l => l.status === 'offline').length,
  }

  const visible = linemen.filter(l =>
    (filterStatus === 'all' || l.status === filterStatus) &&
    (search === '' ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.employeeId.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-slate-800 dark:text-zinc-100">Live Teardown Map</h4>
          <p className="text-xs mt-0.5 flex items-center gap-1.5">
            {fetchError
              ? <span className="text-red-400 dark:text-red-400">⚠ Cannot reach server</span>
              : <><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" /><span className="text-slate-400 dark:text-zinc-500">Live · refreshes every 30 s{lastFetch ? ` · last at ${lastFetch.toLocaleTimeString()}` : ''}</span></>
            }
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Live status pills */}
          <div className="flex items-center gap-1.5 rounded-xl bg-green-50 dark:bg-green-500/10 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">{counts.active} Active</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{counts.idle} Idle</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-zinc-700 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">{counts.offline} Offline</span>
          </div>

          {/* Tile switcher */}
          <div className="flex rounded-xl border border-slate-200 dark:border-zinc-600 overflow-hidden text-xs font-semibold">
            {(Object.keys(TILES) as BaseTile[]).map(k => (
              <button key={k} onClick={() => setBaseTile(k)}
                className={`px-3 py-1.5 transition ${baseTile === k ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}>
                {TILES[k].label}
              </button>
            ))}
          </div>

          {/* Logs toggle */}
          <button
            onClick={() => setLogsOpen(o => !o)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition ${logsOpen ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-600 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Teardown Logs
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: logsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Teardown Logs dropdown ── */}
      {logsOpen && (
        <div className="rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">
          {/* Dropdown header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-zinc-700">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-200">Live Teardown Logs</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300">
                {logs.length} entries
              </span>
            </div>
            {/* Action filter pills */}
            <div className="flex gap-1">
              {(['all', 'started', 'on_site', 'completed', 'submitted', 'flagged'] as const).map(f => (
                <button key={f} onClick={() => setLogFilter(f)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold capitalize transition ${
                    logFilter === f
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-600'
                  }`}>
                  {f === 'on_site' ? 'On Site' : f === 'all' ? 'All' : LOG_ACTION_STYLE[f].label}
                </button>
              ))}
            </div>
          </div>

          {/* Logs table */}
          <div className="overflow-x-auto" style={{ maxHeight: 240 }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-700/60">
                <tr>
                  {['Ticket', 'Lineman', 'Pole', 'Span', 'Area', 'Action', 'Time'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-zinc-700/50">
                {logs
                  .filter(l => logFilter === 'all' || l.action === logFilter)
                  .map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-zinc-700/30 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-violet-500 whitespace-nowrap">{log.ticket}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-slate-700 dark:text-zinc-200">{log.lineman}</div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">{log.employeeId}</div>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-600 dark:text-zinc-300 whitespace-nowrap">{log.pole}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{log.span}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap max-w-40 truncate">{log.area}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${LOG_ACTION_STYLE[log.action].cls}`}>
                          {LOG_ACTION_STYLE[log.action].label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 dark:text-zinc-500 whitespace-nowrap">{timeAgo(log.ts)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Map + panel ── */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: 520 }}>

        {/* Map */}
        <div className="flex-1 rounded-3xl overflow-hidden shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 relative">
          <div ref={mapRef} className="w-full h-full" />

          {/* Legend */}
          <div className="absolute bottom-10 left-3 z-[1000] rounded-2xl bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm shadow-lg ring-1 ring-slate-100 dark:ring-zinc-700 p-3 text-xs">
            <p className="font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Lineman Status</p>
            {(Object.keys(STATUS_COLOR) as LinemanStatus[]).map(s => (
              <div key={s} className="flex items-center gap-2 mb-1 last:mb-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[s] }} />
                <span className="text-slate-600 dark:text-zinc-300">{STATUS_LABEL[s]}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-zinc-700 text-[10px] text-slate-400 dark:text-zinc-500">
              Faded trail = last 8 positions
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-72 shrink-0 rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 flex flex-col overflow-hidden">

          {/* Search + filter tabs */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 dark:border-zinc-700 flex flex-col gap-2">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or ID…"
              className="h-8 w-full rounded-xl border border-slate-200 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-700/50 px-3 text-xs outline-none text-slate-700 dark:text-zinc-200 placeholder:text-slate-400"
            />
            <div className="grid grid-cols-4 gap-1">
              {(['all', 'active', 'idle', 'offline'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`rounded-lg py-1 text-[10px] font-semibold capitalize transition ${filterStatus === s ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-600'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Lineman list */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-zinc-700/50">
            {visible.map(l => {
              const isSelected = selected === l.id
              return (
                <button key={l.id} onClick={() => flyTo(l)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition ${isSelected ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-700/40'}`}>
                  {/* Avatar */}
                  <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ border: `2px solid ${STATUS_COLOR[l.status]}`, color: STATUS_COLOR[l.status] }}>
                    {initials(l.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold truncate ${isSelected ? 'text-violet-600 dark:text-violet-400' : 'text-slate-700 dark:text-zinc-200'}`}>{l.name}</p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{l.employeeId} · {l.region}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] font-medium truncate" style={{ color: STATUS_COLOR[l.status] }}>
                        {STATUS_LABEL[l.status]}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 ml-1 shrink-0">
                        {timeAgo(l.lastUpdate)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
            {visible.length === 0 && (
              <p className="text-center text-xs text-slate-400 dark:text-zinc-500 py-8">No linemen found</p>
            )}
          </div>

          {/* Selected detail card */}
          {selectedLineman && (() => {
            const api = selectedLineman._api
            const address = [api?.barangay, api?.city, api?.province]
              .filter(Boolean).join(', ') || '—'

            return (
              <div className="border-t border-slate-100 dark:border-zinc-700 p-3 bg-slate-50/60 dark:bg-zinc-700/20 overflow-y-auto max-h-72">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ border: `2.5px solid ${STATUS_COLOR[selectedLineman.status]}`, color: STATUS_COLOR[selectedLineman.status] }}>
                      {initials(selectedLineman.name)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700 dark:text-zinc-200 leading-tight">{selectedLineman.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500">{selectedLineman.employeeId}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-zinc-600 transition">
                    ×
                  </button>
                </div>

                {/* Status + Last Seen */}
                <div className="flex gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: STATUS_COLOR[selectedLineman.status] + '22', color: STATUS_COLOR[selectedLineman.status] }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: STATUS_COLOR[selectedLineman.status] }} />
                    {STATUS_LABEL[selectedLineman.status]}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400">
                    {timeAgo(selectedLineman.lastUpdate)}
                  </span>
                </div>

                {/* Subcon + Team */}
                <div className="rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700 p-2.5 mb-2.5 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Assignment</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase">Subcontractor</span>
                      <p className="font-bold text-slate-700 dark:text-zinc-200 truncate">{api?.subconName ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase">Team</span>
                      <p className="font-bold text-slate-700 dark:text-zinc-200 truncate">{api?.teamName ?? '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700 p-2.5 mb-2.5 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Location</p>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-zinc-200">{address}</p>
                  {api?.regionName && (
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500">{api.regionName}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] pt-1 border-t border-slate-100 dark:border-zinc-700">
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500">Latitude</span>
                      <p className="font-mono font-bold text-slate-600 dark:text-zinc-300">{selectedLineman.lat.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500">Longitude</span>
                      <p className="font-mono font-bold text-slate-600 dark:text-zinc-300">{selectedLineman.lng.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500">Pinged At</span>
                      <p className="font-bold text-slate-600 dark:text-zinc-300">{selectedLineman.lastUpdate.toLocaleTimeString()}</p>
                    </div>
                    {api?.accuracy && (
                      <div>
                        <span className="text-slate-400 dark:text-zinc-500">Accuracy</span>
                        <p className="font-bold text-slate-600 dark:text-zinc-300">±{Math.round(api.accuracy)}m</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
