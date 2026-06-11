import { useEffect, useRef, useState } from 'react'
import { getToken, getSubcontractorId, isSubconSide, SKYCABLE_API } from '../lib/auth'
import { cacheGet, cacheSet } from '../lib/cache'
import { fetchTile } from '../lib/tile-cache'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Cached Leaflet tile layer ──────────────────────────────────────────────────
// Routes every tile through tile-cache so the Philippines map tiles are stored
// in the browser Cache API after first load — no re-download on revisit.
class CachedTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const img = document.createElement('img')
    img.alt = ''
    img.setAttribute('role', 'presentation')
    const url = this.getTileUrl(coords)
    fetchTile(url)
      .then(blobUrl => { img.src = blobUrl; done(undefined, img) })
      .catch(() => { img.src = url; done(undefined, img) })
    return img
  }
}

function cachedTileLayer(url: string, options?: L.TileLayerOptions): CachedTileLayer {
  return new CachedTileLayer(url, options)
}

interface MapPin {
  id: number
  node_id: string
  node_name: string | null
  city: string | null
  province: string | null
  sites: string | null
  team: string | null
  status: string
  progress: number
  lat: number
  lng: number
  pole_count: number
}

interface FocusPin {
  lat: number
  lng: number
  title: string
  subtitle?: string
  detail?: string
}

const STATUS_COLOR: Record<string, string> = {
  'IN_PROGRESS': '#3b82f6',
  'COMPLETED':   '#22c55e',
  'PENDING':     '#f59e0b',
}

const STATUS_LABEL: Record<string, string> = {
  'IN_PROGRESS': 'Ongoing',
  'COMPLETED':   'Completed',
  'PENDING':     'Pending',
}

function pinColor(status: string) {
  return STATUS_COLOR[status?.toUpperCase()] ?? '#6b7280'
}

function makePinIcon(status: string) {
  const color = pinColor(status)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.625 14 22 14 22S28 23.625 28 14C28 6.27 21.73 0 14 0z"
        fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  })
}

function makeFocusIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path d="M17 0C7.61 0 0 7.61 0 17c0 11.69 17 25 17 25s17-13.31 17-25C34 7.61 26.39 0 17 0z"
        fill="#10b981" stroke="#ffffff" stroke-width="2"/>
      <circle cx="17" cy="17" r="7" fill="#ffffff"/>
      <circle cx="17" cy="17" r="3" fill="#10b981"/>
    </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -42],
  })
}

// eslint-disable-next-line react-refresh/only-export-components
export const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, Maxar, Earthstar Geographics', label: 'Satellite' },
  street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           attribution: '© OpenStreetMap contributors',            label: 'Street'    },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                attribution: '© CartoDB',                               label: 'Dark'      },
}
export type MapView = keyof typeof TILE_LAYERS

interface Props {
  mapView?: MapView
  onMapViewChange?: (v: MapView) => void
  syncTrigger?: number
  focusPin?: FocusPin | null
}

export default function FieldCoverageMap({ mapView: mapViewProp = 'satellite', syncTrigger = 0, focusPin = null }: Props = {}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const focusLayerRef = useRef<L.LayerGroup | null>(null)
  const [pins, setPins] = useState<MapPin[]>(() => cacheGet<MapPin[]>('dashboard_map_pins') ?? [])
  const [loading, setLoading] = useState(() => !cacheGet<MapPin[]>('dashboard_map_pins'))
  const [error, setError] = useState<string | null>(null)
  const mapView = mapViewProp

  // Fetch pins — skip if cache is fresh and this is not a forced sync (syncTrigger > 0)
  useEffect(() => {
    if (syncTrigger === 0 && cacheGet<MapPin[]>('dashboard_map_pins')) {
      setLoading(false)
      return
    }

    const token = getToken()
    const subconId = getSubcontractorId()
    const isSubcon = isSubconSide()
    const url = new URL(`${SKYCABLE_API}/nodes/map-pins`)
    if (isSubcon && subconId) {
      url.searchParams.set('subcontractor_id', String(subconId))
    }

    fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPins(data)
          cacheSet('dashboard_map_pins', data)
          setError(null)
        }
        else setError('Unexpected response from server')
      })
      .catch(() => setError('Failed to load node data'))
      .finally(() => setLoading(false))
  }, [syncTrigger])

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const map = L.map(mapRef.current, {
      center: [12.8797, 121.774],
      zoom: 6,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
    })

    const tl = cachedTileLayer(TILE_LAYERS.satellite.url, {
      attribution: TILE_LAYERS.satellite.attribution,
    }).addTo(map)
    tileLayerRef.current = tl
    markerLayerRef.current = L.layerGroup().addTo(map)
    focusLayerRef.current = L.layerGroup().addTo(map)

    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Swap tile layer when mapView changes
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    const { url, attribution } = TILE_LAYERS[mapView]
    tileLayerRef.current = cachedTileLayer(url, { attribution }).addTo(map)
  }, [mapView])

  // Add / refresh markers whenever pins change
  useEffect(() => {
    const map = mapInstance.current
    const markerLayer = markerLayerRef.current
    if (!map || !markerLayer) return

    markerLayer.clearLayers()

    pins.forEach(pin => {
      if (!pin.lat || !pin.lng) return

      const statusUp = pin.status?.toUpperCase() ?? ''
      const color = pinColor(statusUp)
      const label = STATUS_LABEL[statusUp] ?? pin.status

      const progressBar = `
        <div style="background:#e5e7eb;border-radius:4px;height:6px;margin-top:6px">
          <div style="background:${color};width:${pin.progress}%;height:6px;border-radius:4px"></div>
        </div>
        <div style="font-size:10px;color:#6b7280;margin-top:2px">${pin.progress.toFixed(0)}% complete</div>`

      const popup = `
        <div style="min-width:180px;font-family:inherit">
          <div style="font-weight:700;font-size:13px;color:#1f2937">${pin.node_id}</div>
          ${pin.node_name ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${pin.node_name}</div>` : ''}
          <div style="margin-top:6px">
            <span style="background:${color}22;color:${color};font-size:10px;font-weight:600;padding:1px 7px;border-radius:4px">${label}</span>
          </div>
          ${pin.city || pin.province ? `<div style="font-size:11px;color:#374151;margin-top:5px">📍 ${[pin.city, pin.province].filter(Boolean).join(', ')}</div>` : ''}
          ${pin.sites ? `<div style="font-size:11px;color:#374151">🏢 ${pin.sites}</div>` : ''}
          <div style="font-size:11px;color:#374151;margin-top:2px">⚡ ${pin.pole_count} poles mapped</div>
          ${progressBar}
        </div>`

      const marker = L.marker([pin.lat, pin.lng], { icon: makePinIcon(statusUp) })
        .addTo(markerLayer)
        .bindPopup(popup, { maxWidth: 240, autoPan: false })

      marker.on('click', () => {
        map.flyTo([pin.lat, pin.lng], 15, { animate: true, duration: 1.2 })
        map.once('moveend', () => marker.openPopup())
      })
    })
  }, [pins])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || focusPin) return

    const mappablePins = pins.filter(pin => pin.lat && pin.lng)
    if (!mappablePins.length) return

    try {
      const bounds = L.latLngBounds(mappablePins.map(pin => [pin.lat, pin.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 })
    } catch {
      // Ignore invalid bounds from incomplete GPS data.
    }
  }, [pins, focusPin])

  useEffect(() => {
    const map = mapInstance.current
    const focusLayer = focusLayerRef.current
    if (!map || !focusLayer) return

    focusLayer.clearLayers()
    if (!focusPin) return

    const popup = `
      <div style="min-width:180px;font-family:inherit">
        <div style="font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#10b981">Pole GPS</div>
        <div style="margin-top:3px;font-size:14px;font-weight:900;color:#0f172a">${focusPin.title}</div>
        ${focusPin.subtitle ? `<div style="margin-top:2px;font-size:11px;font-weight:600;color:#64748b">${focusPin.subtitle}</div>` : ''}
        ${focusPin.detail ? `<div style="margin-top:8px;font-family:monospace;font-size:11px;color:#475569">${focusPin.detail}</div>` : ''}
      </div>`

    const marker = L.marker([focusPin.lat, focusPin.lng], {
      icon: makeFocusIcon(),
      zIndexOffset: 1000,
    })
      .addTo(focusLayer)
      .bindPopup(popup, { maxWidth: 260, autoPan: false })

    map.flyTo([focusPin.lat, focusPin.lng], 18, { animate: true, duration: 1 })
    map.once('moveend', () => marker.openPopup())
  }, [focusPin])

  function resetView() {
    if (focusPin) {
      mapInstance.current?.flyTo([focusPin.lat, focusPin.lng], 18, { animate: true, duration: 1 })
      return
    }

    mapInstance.current?.flyTo([12.8797, 121.774], 6, { animate: true, duration: 1.5 })
  }

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-zinc-800/70">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-500 dark:text-zinc-400">Loading nodes…</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-zinc-800/80">
          <div className="text-center px-4">
            <i data-feather="alert-circle" className="mx-auto mb-2 text-red-400" style={{ width: 24, height: 24 }} />
            <p className="text-xs text-red-500">{error}</p>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />

      {/* Reset view button */}
      {!loading && !error && (
        <button
          onClick={resetView}
          title="Zoom out to Philippines"
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg border border-emerald-500/70 bg-emerald-600/95 px-2.5 py-1.5 text-[11px] font-black text-white shadow backdrop-blur-sm transition-colors hover:bg-emerald-700 dark:border-emerald-400/60 dark:bg-emerald-600/95 dark:hover:bg-emerald-500"
          style={{ zIndex: 1000 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="M3 12h4m10 0h4M12 3v4m0 10v4"/>
          </svg>
          Reset View
        </button>
      )}

      {/* Legend */}
      {!loading && !error && (
        <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm rounded-lg p-2.5 shadow text-[10px] space-y-1.5 border border-gray-100 dark:border-zinc-700" style={{ zIndex: 1000 }}>
          {Object.entries(STATUS_COLOR).map(([key, col]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: col }} />
              <span className="text-gray-700 dark:text-zinc-300">{STATUS_LABEL[key]}</span>
            </div>
          ))}
          <div className="pt-1 border-t border-gray-200 dark:border-zinc-600 text-gray-400 dark:text-zinc-500">
            {pins.length} nodes
          </div>
        </div>
      )}
    </div>
  )
}
