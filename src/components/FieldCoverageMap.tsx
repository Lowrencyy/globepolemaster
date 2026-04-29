import { useEffect, useRef, useState } from 'react'
import { getToken } from '../lib/auth'

declare const L: any

const API_BASE = 'https://disguisedly-enarthrodial-kristi.ngrok-free.dev'

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

const STATUS_COLOR: Record<string, string> = {
  'ON GOING':  '#3b82f6',
  'COMPLETED': '#22c55e',
  'PENDING':   '#f59e0b',
  'BILLING':   '#8b5cf6',
}

const STATUS_LABEL: Record<string, string> = {
  'ON GOING':  'On Going',
  'COMPLETED': 'Completed',
  'PENDING':   'Pending',
  'BILLING':   'Billing',
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

export const TILE_LAYERS = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, Maxar, Earthstar Geographics', label: 'Satellite' },
  street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           attribution: '© OpenStreetMap contributors',            label: 'Street'    },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                attribution: '© CartoDB',                               label: 'Dark'      },
}
export type MapView = keyof typeof TILE_LAYERS

interface Props {
  mapView?: MapView
  onMapViewChange?: (v: MapView) => void
}

export default function FieldCoverageMap({ mapView: mapViewProp, onMapViewChange }: Props = {}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const [pins, setPins] = useState<MapPin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapViewInternal, setMapViewInternal] = useState<MapView>('satellite')

  const mapView = mapViewProp ?? mapViewInternal
  const setMapView = onMapViewChange ?? setMapViewInternal

  // Fetch pins from backend
  useEffect(() => {
    const token = getToken()
    fetch(`${API_BASE}/api/v1/nodes/map-pins`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setPins(data)
        else setError('Unexpected response from server')
      })
      .catch(() => setError('Failed to load node data'))
      .finally(() => setLoading(false))
  }, [])

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (typeof L === 'undefined') return

    const map = L.map(mapRef.current, {
      center: [12.8797, 121.774],
      zoom: 6,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
    })

    const tl = L.tileLayer(TILE_LAYERS.satellite.url, {
      attribution: TILE_LAYERS.satellite.attribution,
    }).addTo(map)
    tileLayerRef.current = tl

    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Swap tile layer when mapView changes
  useEffect(() => {
    const map = mapInstance.current
    if (!map || typeof L === 'undefined') return
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    const { url, attribution } = TILE_LAYERS[mapView]
    tileLayerRef.current = L.tileLayer(url, { attribution }).addTo(map)
  }, [mapView])

  // Add / refresh markers whenever pins change
  useEffect(() => {
    const map = mapInstance.current
    if (!map || typeof L === 'undefined') return

    // Remove old markers
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) map.removeLayer(layer)
    })

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
        .addTo(map)
        .bindPopup(popup, { maxWidth: 240, autoPan: false })

      marker.on('click', () => {
        map.flyTo([pin.lat, pin.lng], 15, { animate: true, duration: 1.2 })
        map.once('moveend', () => marker.openPopup())
      })
    })
  }, [pins])

  function resetView() {
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
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm border border-gray-100 dark:border-zinc-700 shadow text-[11px] font-medium text-gray-700 dark:text-zinc-200 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
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
