import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix leaflet default marker icon paths broken by bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// ── Types ────────────────────────────────────────────────────────────────────

type PoleStatus = 'audited' | 'in_progress' | 'not_audited' | 'pending' | 'completed'
type Owner = 'Globe' | 'Meralco' | 'PLDT' | 'Converge'

interface Pole {
  id: string
  tag: string
  owner: Owner
  region: string
  city: string
  barangay: string
  lat: number
  lng: number
  status: PoleStatus
  remarks: string
}

// ── Sample data ──────────────────────────────────────────────────────────────

const poles: Pole[] = [
  { id: 'PL-8812', tag: 'TAG-0012', owner: 'Meralco',  region: 'NCR', city: 'Makati', barangay: 'Sta. Cruz',     lat: 14.5547, lng: 121.0244, status: 'audited',     remarks: '' },
  { id: 'PL-8801', tag: 'TAG-0009', owner: 'Globe',    region: 'NCR', city: 'Makati', barangay: 'Bangkal',       lat: 14.5510, lng: 121.0190, status: 'in_progress', remarks: 'Partial audit' },
  { id: 'PL-7703', tag: 'TAG-0033', owner: 'Meralco',  region: 'NCR', city: 'Makati', barangay: 'Palanan',       lat: 14.5488, lng: 121.0201, status: 'not_audited', remarks: '' },
  { id: 'PL-7654', tag: 'TAG-0041', owner: 'PLDT',     region: 'NCR', city: 'Makati', barangay: 'Pio del Pilar', lat: 14.5501, lng: 121.0155, status: 'audited',     remarks: '' },
  { id: 'PL-8790', tag: 'TAG-0055', owner: 'Meralco',  region: 'NCR', city: 'Makati', barangay: 'Comembo',       lat: 14.5533, lng: 121.0222, status: 'pending',     remarks: 'Scheduled next week' },
  { id: 'PL-7621', tag: 'TAG-0062', owner: 'Converge', region: 'NCR', city: 'Makati', barangay: 'Pembo',         lat: 14.5499, lng: 121.0265, status: 'not_audited', remarks: '' },
  { id: 'PL-6998', tag: 'TAG-0078', owner: 'Meralco',  region: 'NCR', city: 'Taguig', barangay: 'Ususan',        lat: 14.5321, lng: 121.0521, status: 'audited',     remarks: '' },
  { id: 'PL-6540', tag: 'TAG-0091', owner: 'Globe',    region: 'NCR', city: 'Taguig', barangay: 'Ibayo',         lat: 14.5299, lng: 121.0488, status: 'in_progress', remarks: '' },
  { id: 'PL-5802', tag: 'TAG-0104', owner: 'PLDT',     region: 'NCR', city: 'Taguig', barangay: 'Central',       lat: 14.5277, lng: 121.0501, status: 'completed',   remarks: 'Fully cleared' },
  { id: 'PL-5210', tag: 'TAG-0118', owner: 'Meralco',  region: 'NCR', city: 'Pasig',  barangay: 'Ugong',         lat: 14.5701, lng: 121.0712, status: 'not_audited', remarks: '' },
  { id: 'PL-4988', tag: 'TAG-0125', owner: 'Meralco',  region: 'NCR', city: 'Pasig',  barangay: 'Kapasigan',     lat: 14.5688, lng: 121.0699, status: 'pending',     remarks: '' },
  { id: 'PL-4421', tag: 'TAG-0139', owner: 'Converge', region: 'NCR', city: 'Pasig',  barangay: 'Pineda',        lat: 14.5643, lng: 121.0655, status: 'audited',     remarks: '' },
]

// ── Config ───────────────────────────────────────────────────────────────────

const statusColor: Record<PoleStatus, string> = {
  audited:     '#10b981',
  in_progress: '#8b5cf6',
  not_audited: '#9ca3af',
  pending:     '#f59e0b',
  completed:   '#3b82f6',
}

const statusLabel: Record<PoleStatus, string> = {
  audited:     'Audited',
  in_progress: 'In Progress',
  not_audited: 'Not Audited',
  pending:     'Pending',
  completed:   'Completed',
}

const ownerColor: Record<Owner, string> = {
  Globe:    '#0ea5e9',
  Meralco:  '#f59e0b',
  PLDT:     '#22c55e',
  Converge: '#f43f5e',
}

function makeIcon(color: string, size = 14) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size + 8}" height="${size + 8}" viewBox="0 0 ${size + 8} ${size + 8}">
      <circle cx="${(size + 8) / 2}" cy="${(size + 8) / 2}" r="${size / 2 + 1}" fill="white" opacity="0.85"/>
      <circle cx="${(size + 8) / 2}" cy="${(size + 8) / 2}" r="${size / 2}" fill="${color}"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    popupAnchor: [0, -((size + 8) / 2 + 4)],
  })
}

// ── GeoJSON export helper ─────────────────────────────────────────────────────

function polesToGeoJSON(list: Pole[]) {
  return {
    type: 'FeatureCollection',
    features: list.map(p => ({
      type: 'Feature',
      properties: { id: p.id, tag: p.tag, owner: p.owner, status: p.status, city: p.city, barangay: p.barangay, remarks: p.remarks },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type ColorMode = 'status' | 'owner'
type BaseTile  = 'osm' | 'satellite' | 'dark'

const TILES: Record<BaseTile, { url: string; attr: string; label: string }> = {
  osm:       { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                       attr: '© OpenStreetMap contributors', label: 'Streets' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri', label: 'Satellite' },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',            attr: '© CartoDB', label: 'Dark' },
}

export default function PoleMapView() {
  const mapRef    = useRef<HTMLDivElement>(null)
  const mapObj    = useRef<L.Map | null>(null)
  const layerRef  = useRef<L.LayerGroup | null>(null)
  const tileRef   = useRef<L.TileLayer | null>(null)

  const [colorMode, setColorMode]     = useState<ColorMode>('status')
  const [baseTile, setBaseTile]       = useState<BaseTile>('satellite')
  const [filterStatus, setFilterStatus] = useState<PoleStatus | 'all'>('all')
  const [filterOwner, setFilterOwner]   = useState<Owner | 'all'>('all')
  const [selected, setSelected]       = useState<Pole | null>(null)
  const [poleCount, setPoleCount]     = useState(poles.length)

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return

    const map = L.map(mapRef.current, {
      center: [14.5490, 121.0300],
      zoom: 14,
      zoomControl: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    tileRef.current = L.tileLayer(TILES.osm.url, { attribution: TILES.osm.attr, maxZoom: 19 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)

    mapObj.current = map
    return () => { map.remove(); mapObj.current = null }
  }, [])

  // ── Swap base tile ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapObj.current) return
    if (tileRef.current) { tileRef.current.remove() }
    const t = TILES[baseTile]
    tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(mapObj.current)
  }, [baseTile])

  // ── Redraw markers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapObj.current || !layerRef.current) return
    layerRef.current.clearLayers()

    const visible = poles.filter(p =>
      (filterStatus === 'all' || p.status === filterStatus) &&
      (filterOwner  === 'all' || p.owner  === filterOwner)
    )
    setPoleCount(visible.length)

    visible.forEach(pole => {
      const color = colorMode === 'status' ? statusColor[pole.status] : ownerColor[pole.owner]
      const marker = L.marker([pole.lat, pole.lng], { icon: makeIcon(color) })

      marker.bindPopup(`
        <div style="min-width:200px;font-family:system-ui,sans-serif">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#1e293b">${pole.id}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <tr><td style="color:#64748b;padding:2px 0">Tag</td><td style="font-weight:600;text-align:right">${pole.tag}</td></tr>
            <tr><td style="color:#64748b;padding:2px 0">Owner</td><td style="font-weight:600;text-align:right"><span style="color:${ownerColor[pole.owner]}">${pole.owner}</span></td></tr>
            <tr><td style="color:#64748b;padding:2px 0">Location</td><td style="font-weight:600;text-align:right">${pole.barangay}, ${pole.city}</td></tr>
            <tr><td style="color:#64748b;padding:2px 0">Status</td><td style="text-align:right"><span style="background:${statusColor[pole.status]}22;color:${statusColor[pole.status]};border-radius:9999px;padding:1px 8px;font-weight:600">${statusLabel[pole.status]}</span></td></tr>
            ${pole.remarks ? `<tr><td style="color:#64748b;padding:2px 0">Remarks</td><td style="font-weight:600;text-align:right">${pole.remarks}</td></tr>` : ''}
            <tr><td style="color:#64748b;padding:2px 0">Lat / Lng</td><td style="font-weight:600;text-align:right;font-family:monospace">${pole.lat}, ${pole.lng}</td></tr>
          </table>
        </div>
      `, { maxWidth: 280 })

      marker.on('click', () => setSelected(pole))
      marker.addTo(layerRef.current!)
    })
  }, [colorMode, filterStatus, filterOwner])

  // ── GeoJSON helpers ───────────────────────────────────────────────────────
  const getVisibleGeoJSON = () => {
    const visible = poles.filter(p =>
      (filterStatus === 'all' || p.status === filterStatus) &&
      (filterOwner  === 'all' || p.owner  === filterOwner)
    )
    return polesToGeoJSON(visible)
  }

  const downloadGeoJSON = () => {
    const blob = new Blob([JSON.stringify(getVisibleGeoJSON(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'poles.geojson'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const openInGeoJSONio = () => {
    const encoded = encodeURIComponent(JSON.stringify(getVisibleGeoJSON()))
    window.open(`https://geojson.io/#data=data:application/json,${encoded}`, '_blank')
  }

  // ── Fly to selected ───────────────────────────────────────────────────────
  const flyTo = (p: Pole) => {
    mapObj.current?.flyTo([p.lat, p.lng], 17, { duration: 1 })
    setSelected(p)
  }

  const statuses: (PoleStatus | 'all')[] = ['all', 'audited', 'in_progress', 'not_audited', 'pending', 'completed']
  const owners: (Owner | 'all')[] = ['all', 'Globe', 'Meralco', 'PLDT', 'Converge']

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-slate-800 dark:text-zinc-100">Pole Map View</h4>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">GeoJSON · {poleCount} poles visible</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Base tile toggle */}
          <div className="flex rounded-xl border border-slate-200 dark:border-zinc-600 overflow-hidden text-xs font-semibold">
            {(Object.keys(TILES) as BaseTile[]).map(k => (
              <button key={k} onClick={() => setBaseTile(k)}
                className={`px-3 py-1.5 transition ${baseTile === k ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}>
                {TILES[k].label}
              </button>
            ))}
          </div>

          {/* Color mode */}
          <div className="flex rounded-xl border border-slate-200 dark:border-zinc-600 overflow-hidden text-xs font-semibold">
            {(['status', 'owner'] as ColorMode[]).map(m => (
              <button key={m} onClick={() => setColorMode(m)}
                className={`px-3 py-1.5 capitalize transition ${colorMode === m ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}>
                By {m}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="h-8 rounded-xl border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 text-xs font-medium text-slate-600 dark:text-zinc-300 outline-none cursor-pointer">
            {statuses.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel[s]}</option>)}
          </select>

          {/* Owner filter */}
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value as typeof filterOwner)}
            className="h-8 rounded-xl border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 text-xs font-medium text-slate-600 dark:text-zinc-300 outline-none cursor-pointer">
            {owners.map(o => <option key={o} value={o}>{o === 'all' ? 'All Owners' : o}</option>)}
          </select>

          {/* Download GeoJSON */}
          <button onClick={downloadGeoJSON}
            className="h-8 rounded-xl border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition flex items-center gap-1.5">
            <i className="mdi mdi-download text-sm" />
            Download GeoJSON
          </button>

          {/* Open in geojson.io */}
          <button onClick={openInGeoJSONio}
            className="h-8 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white shadow-lg shadow-violet-500/30 hover:bg-violet-700 transition flex items-center gap-1.5">
            <i className="mdi mdi-open-in-new text-sm" />
            Open in geojson.io
          </button>
        </div>
      </div>

      {/* Map + sidebar layout */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>

        {/* Map */}
        <div className="flex-1 rounded-3xl overflow-hidden shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 relative">
          <div ref={mapRef} className="w-full h-full" />

          {/* Legend overlay */}
          <div className="absolute bottom-10 left-3 z-[1000] rounded-2xl bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm shadow-lg ring-1 ring-slate-100 dark:ring-zinc-700 p-3 text-xs">
            <p className="font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              {colorMode === 'status' ? 'Status' : 'Owner'}
            </p>
            {colorMode === 'status'
              ? Object.entries(statusColor).map(([k, c]) => (
                  <div key={k} className="flex items-center gap-2 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c }} />
                    <span className="text-slate-600 dark:text-zinc-300">{statusLabel[k as PoleStatus]}</span>
                  </div>
                ))
              : Object.entries(ownerColor).map(([k, c]) => (
                  <div key={k} className="flex items-center gap-2 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c }} />
                    <span className="text-slate-600 dark:text-zinc-300">{k}</span>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Pole list panel */}
        <div className="w-72 shrink-0 rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-700">
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Poles</p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">{poleCount} visible — click to fly</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-zinc-700/50">
            {poles
              .filter(p =>
                (filterStatus === 'all' || p.status === filterStatus) &&
                (filterOwner  === 'all' || p.owner  === filterOwner)
              )
              .map(p => {
                const color = colorMode === 'status' ? statusColor[p.status] : ownerColor[p.owner]
                const isSelected = selected?.id === p.id
                return (
                  <button key={p.id} onClick={() => flyTo(p)}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition ${isSelected ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-700/40'}`}>
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    <div className="min-w-0">
                      <p className={`text-xs font-bold font-mono ${isSelected ? 'text-violet-600 dark:text-violet-400' : 'text-slate-700 dark:text-zinc-200'}`}>{p.id}</p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{p.barangay}, {p.city}</p>
                      <p className="text-[11px] font-medium" style={{ color }}>{p.owner} · {statusLabel[p.status]}</p>
                    </div>
                  </button>
                )
              })}
          </div>

          {/* Selected detail */}
          {selected && (
            <div className="border-t border-slate-100 dark:border-zinc-700 p-4 bg-slate-50/50 dark:bg-zinc-700/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-200">{selected.id}</span>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
                  <i className="mdi mdi-close text-base" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  ['Tag',    selected.tag],
                  ['Owner',  selected.owner],
                  ['City',   selected.city],
                  ['Brgy',   selected.barangay],
                  ['Status', statusLabel[selected.status]],
                  ['Coords', `${selected.lat}, ${selected.lng}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-slate-400 dark:text-zinc-500">{k}</span>
                    <p className="font-semibold text-slate-700 dark:text-zinc-200 truncate">{v}</p>
                  </div>
                ))}
              </div>
              {selected.remarks && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 italic">"{selected.remarks}"</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
