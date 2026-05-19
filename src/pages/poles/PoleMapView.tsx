import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

type PoleStatus = 'pending' | 'in_progress' | 'cleared'
type BaseTile   = 'satellite' | 'osm' | 'dark'

interface PoleEntry {
  id: number
  pole_code: string
  lat: number | null
  lng: number | null
  has_gps: boolean
  skycable_status: PoleStatus
  barangay?: string | null
  city?: string | null
  province?: string | null
  node?: string | null
  area?: string | null
}

const STATUS_COLOR: Record<PoleStatus, string> = {
  pending:     '#f59e0b',
  in_progress: '#8b5cf6',
  cleared:     '#10b981',
}

const STATUS_LABEL: Record<PoleStatus, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  cleared:     'Cleared',
}

const TILES: Record<BaseTile, { url: string; attr: string; label: string }> = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri', label: 'Satellite' },
  osm:       { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           attr: '© OpenStreetMap contributors', label: 'Streets' },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                attr: '© CartoDB', label: 'Dark' },
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' }
}

function makeIcon(color: string) {
  const html = `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`
  return L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14] })
}

export default function PoleMapView() {
  const mapRef   = useRef<HTMLDivElement>(null)
  const mapObj   = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const tileRef  = useRef<L.TileLayer | null>(null)

  const [poles, setPoles]           = useState<PoleEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [baseTile, setBaseTile]     = useState<BaseTile>('satellite')
  const [filterStatus, setFilterStatus] = useState<PoleStatus | 'all'>('all')
  const [filterGps, setFilterGps]   = useState<'all' | 'gps' | 'no_gps'>('all')
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState<PoleEntry | null>(null)

  // fetch all poles (with + without GPS)
  useEffect(() => {
    const cached = cacheGet<PoleEntry[]>('pole_map_all')
    if (cached) {
      setPoles(cached)
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(`${SKYCABLE_API}/poles/all`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setPoles(d)
          cacheSet('pole_map_all', d)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // init map
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return
    const map = L.map(mapRef.current, {
      center: [12.5, 122.0], zoom: 6, zoomControl: false,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    tileRef.current = L.tileLayer(TILES.satellite.url, { attribution: TILES.satellite.attr, maxZoom: 20 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapObj.current = map
    return () => { map.remove(); mapObj.current = null }
  }, [])

  // swap tile
  useEffect(() => {
    if (!mapObj.current) return
    tileRef.current?.remove()
    const t = TILES[baseTile]
    tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 20 }).addTo(mapObj.current)
  }, [baseTile])

  // draw markers (only poles with GPS)
  useEffect(() => {
    if (!mapObj.current || !layerRef.current) return
    layerRef.current.clearLayers()

    const mappable = filteredPoles.filter(p => p.has_gps && p.lat != null && p.lng != null)

    mappable.forEach(pin => {
      const color  = STATUS_COLOR[pin.skycable_status] ?? STATUS_COLOR.pending
      const marker = L.marker([pin.lat!, pin.lng!], { icon: makeIcon(color) })

      marker.bindPopup(`
        <div style="min-width:200px;font-family:system-ui,sans-serif">
          <div style="font-weight:900;font-size:14px;font-family:monospace;color:#1e293b;margin-bottom:8px">${pin.pole_code}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            ${pin.area   ? `<tr><td style="color:#64748b;padding:2px 0;width:56px">Area</td><td style="font-weight:600;text-align:right">${pin.area}</td></tr>` : ''}
            ${pin.node   ? `<tr><td style="color:#64748b;padding:2px 0">Node</td><td style="font-weight:600;text-align:right">${pin.node}</td></tr>` : ''}
            ${pin.city   ? `<tr><td style="color:#64748b;padding:2px 0">Location</td><td style="font-weight:600;text-align:right">${[pin.barangay, pin.city].filter(Boolean).join(', ')}</td></tr>` : ''}
            <tr><td style="color:#64748b;padding:2px 0">Status</td><td style="text-align:right">
              <span style="background:${color}22;color:${color};border-radius:999px;padding:2px 8px;font-weight:700;font-size:11px">
                ${STATUS_LABEL[pin.skycable_status] ?? pin.skycable_status}
              </span>
            </td></tr>
            <tr><td style="color:#64748b;padding:2px 0">Coords</td><td style="font-weight:600;text-align:right;font-family:monospace;font-size:11px">${pin.lat}, ${pin.lng}</td></tr>
          </table>
        </div>
      `, { maxWidth: 260 })

      marker.on('click', () => setSelected(pin))
      marker.addTo(layerRef.current!)
    })

    if (mappable.length > 0 && mapObj.current) {
      try {
        const bounds = L.latLngBounds(mappable.map(p => [p.lat!, p.lng!]))
        mapObj.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poles, filterStatus, search, filterGps])

  const filteredPoles = poles.filter(p => {
    const matchStatus = filterStatus === 'all' || p.skycable_status === filterStatus
    const matchGps    = filterGps === 'all' || (filterGps === 'gps' ? p.has_gps : !p.has_gps)
    const matchSearch = !search.trim() || p.pole_code.toLowerCase().includes(search.trim().toLowerCase())
    return matchStatus && matchGps && matchSearch
  })

  const withGps    = poles.filter(p => p.has_gps).length
  const withoutGps = poles.filter(p => !p.has_gps).length

  const counts = {
    all:         poles.length,
    pending:     poles.filter(p => p.skycable_status === 'pending').length,
    in_progress: poles.filter(p => p.skycable_status === 'in_progress').length,
    cleared:     poles.filter(p => p.skycable_status === 'cleared').length,
  }

  const flyTo = (p: PoleEntry) => {
    if (!p.has_gps || p.lat == null || p.lng == null) return
    mapObj.current?.flyTo([p.lat, p.lng], 18, { duration: 1.2 })
    setSelected(p)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-slate-800 dark:text-zinc-100">Pole Map</h4>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-zinc-500">
            {loading
              ? 'Loading…'
              : `${poles.length} total · ${withGps} with GPS · ${withoutGps} no GPS`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Base tile toggle */}
          <div className="flex overflow-hidden rounded-xl border border-slate-200 text-xs font-semibold dark:border-zinc-600">
            {(Object.keys(TILES) as BaseTile[]).map(k => (
              <button key={k} onClick={() => setBaseTile(k)}
                className={`px-3 py-1.5 transition ${baseTile === k ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                {TILES[k].label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          {(['all', 'pending', 'in_progress', 'cleared'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={[
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition',
                filterStatus === s
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
              ].join(' ')}
            >
              {s !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />}
              {s === 'all' ? `All (${counts.all})` : `${STATUS_LABEL[s]} (${counts[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Map + sidebar */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: 520 }}>

        {/* Map */}
        <div className="relative z-0 flex-1 overflow-hidden rounded-3xl shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700">
          {loading && (
            <div className="absolute inset-0 z-1001 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm">
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-500 dark:text-zinc-400">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500" />
                Loading poles…
              </div>
            </div>
          )}
          <div ref={mapRef} className="h-full w-full" />

          {/* Legend */}
          <div className="absolute bottom-10 left-3 z-1000 rounded-2xl bg-white/90 p-3 text-xs shadow-lg ring-1 ring-slate-100 backdrop-blur-sm dark:bg-zinc-800/90 dark:ring-zinc-700">
            <p className="mb-2 font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">Status</p>
            {(Object.entries(STATUS_COLOR) as [PoleStatus, string][]).map(([k, c]) => (
              <div key={k} className="mb-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} />
                <span className="text-slate-600 dark:text-zinc-300">{STATUS_LABEL[k]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
          {/* Search + GPS filter */}
          <div className="border-b border-slate-100 p-3 dark:border-zinc-700 space-y-2">
            <div className="relative">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search pole code…"
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              />
            </div>

            {/* GPS filter pills */}
            <div className="flex gap-1.5">
              {([
                { key: 'all',    label: `All (${poles.length})` },
                { key: 'gps',    label: `GPS (${withGps})` },
                { key: 'no_gps', label: `No GPS (${withoutGps})` },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setFilterGps(f.key)}
                  className={[
                    'flex-1 rounded-lg py-1 text-[10px] font-bold transition',
                    filterGps === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600',
                  ].join(' ')}>
                  {f.label}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              {filteredPoles.length} pole{filteredPoles.length !== 1 ? 's' : ''}
              {filteredPoles.filter(p => p.has_gps).length > 0
                ? ` · ${filteredPoles.filter(p => p.has_gps).length} on map`
                : ''}
            </p>
          </div>

          {/* List — ALL poles, GPS badge for those without */}
          <div className="flex-1 divide-y divide-slate-50 overflow-y-auto dark:divide-zinc-700/50">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" />
                Loading…
              </div>
            ) : filteredPoles.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400 dark:text-zinc-500">
                <i className="bx bx-map-alt text-3xl" />
                <p className="text-xs font-semibold">No poles found</p>
              </div>
            ) : filteredPoles.map(p => {
              const color      = STATUS_COLOR[p.skycable_status] ?? STATUS_COLOR.pending
              const isSelected = selected?.id === p.id
              const canFly     = p.has_gps
              return (
                <button key={p.id}
                  onClick={() => canFly && flyTo(p)}
                  className={[
                    'w-full px-4 py-3 text-left flex items-start gap-2.5 transition',
                    isSelected ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-700/40',
                    !canFly ? 'opacity-60 cursor-default' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`font-mono text-xs font-black truncate ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-zinc-200'}`}>
                        {p.pole_code}
                      </p>
                      {!canFly && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 dark:bg-zinc-700 dark:text-zinc-500">
                          No GPS
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-slate-400 dark:text-zinc-500">
                      {[p.barangay, p.city].filter(Boolean).join(', ') || p.area || p.node || '—'}
                    </p>
                    <p className="text-[11px] font-semibold" style={{ color }}>
                      {STATUS_LABEL[p.skycable_status] ?? p.skycable_status}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Selected detail */}
          {selected && selected.has_gps && (
            <div className="border-t border-slate-100 bg-slate-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-700/20">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-xs font-black text-slate-700 dark:text-zinc-200">{selected.pole_code}</span>
                <button onClick={() => setSelected(null)} className="text-slate-400 transition hover:text-slate-600 dark:hover:text-zinc-200">
                  <i className="bx bx-x text-lg" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                {[
                  ['Status',   STATUS_LABEL[selected.skycable_status] ?? selected.skycable_status],
                  ['Area',     selected.area ?? '—'],
                  ['Node',     selected.node ?? '—'],
                  ['Province', selected.province ?? '—'],
                  ['City',     selected.city ?? '—'],
                  ['Barangay', selected.barangay ?? '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-slate-400 dark:text-zinc-500">{k}</p>
                    <p className="font-semibold text-slate-700 dark:text-zinc-200 truncate">{v}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-slate-400 dark:text-zinc-500">Coordinates</p>
                  <p className="font-mono font-semibold text-slate-700 dark:text-zinc-200">{selected.lat}, {selected.lng}</p>
                </div>
              </div>
              <a href={`https://maps.google.com/?q=${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700">
                <i className="bx bx-map-pin" />
                Open in Google Maps
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
