import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getToken, isAdmin, isExecutive, SKYCABLE_API, API_BASE } from '../../lib/auth'
import { cacheDel, cacheGet, cacheSet } from '../../lib/cache'
import { slugify, idFromSlug } from '../../lib/utils'

interface ApiLineman {
  id: string
  name: string
  status: 'active' | 'idle' | 'offline'
  lat: number
  lng: number
  pingedAt: string
  teamId: number | null
  teamName: string | null
  subconId: number | null
  subconName: string | null
  city: string | null
  barangay: string | null
}

interface Node {
  id: number
  name: string
  full_label: string | null
  status: string
  expected_cable: number | null
  actual_cable?: number | null
  progress_percentage?: number | null
  subcontractor?: { id: number; name: string; company?: string } | null
  team?: { id: number; name: string } | null
  date_start?: string | null
  due_date?: string | null
  date_finished?: string | null
  // Direct columns on skycable_nodes table
  expected_nodes?: number | null
  expected_amplifier?: number | null
  expected_extender?: number | null
  expected_tsc?: number | null
  expected_powersupply?: number | null
  expected_housing?: number | null
  actual_node?: number | null
  actual_amplifier?: number | null
  actual_extender?: number | null
  actual_tsc?: number | null
  actual_powersupply?: number | null
  actual_ps_housing?: number | null
  // Aggregated sums from span_summaries (via withSum on backend)
  span_summaries_sum_expected_node?: number | null
  span_summaries_sum_expected_amplifier?: number | null
  span_summaries_sum_expected_extender?: number | null
  span_summaries_sum_expected_tsc?: number | null
  span_summaries_sum_expected_powersupply?: number | null
  span_summaries_sum_expected_ps_housing?: number | null
  span_summaries_sum_actual_cable?: number | null
  span_summaries_sum_actual_node?: number | null
  span_summaries_sum_actual_amplifier?: number | null
  span_summaries_sum_actual_extender?: number | null
  span_summaries_sum_actual_tsc?: number | null
  span_summaries_sum_actual_powersupply?: number | null
  span_summaries_sum_actual_ps_housing?: number | null
  // Location / area info
  area?: { id: number; name: string } | null
  region?: string | null
  province?: string | null
  city?: string | null
  barangay_name?: string | null
  report_type?: string | null
}

interface Pole {
  id: number
  pole_db_id: number
  pole_code: string
  lat: string | null
  lng: string | null
  skycable_status: 'pending' | 'in_progress' | 'cleared'
  barangay?: { name: string } | null
  sequence?: number | null
}

interface TeardownRecord {
  id: number
  actual_cable: number | string | null
  nodes_collected: number | string | null
  amplifiers_collected: number | string | null
  extenders_collected: number | string | null
  tsc_collected: number | string | null
  powersupply_collected: number | string | null
  ps_housing_collected: number | string | null
  status: string
}


const POLE_CFG = {
  pending: {
    label: 'Pending',
    dot: 'bg-amber-400',
    hex: '#f59e0b',
    pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  in_progress: {
    label: 'Ongoing',
    dot: 'bg-indigo-500',
    hex: '#6366f1',
    pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  },
  cleared: {
    label: 'Cleared',
    dot: 'bg-emerald-500',
    hex: '#10b981',
    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
}

type BaseTile = 'satellite' | 'osm' | 'dark'
const TILES: Record<BaseTile, { url: string; attr: string; label: string }> = {
  satellite: { url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attr: '© Google', label: 'Satellite' },
  osm:       { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', label: 'Streets' },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© CartoDB', label: 'Dark' },
}


function h() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    }
}

// Override status based on last ping age — don't trust stale backend status
function effectiveStatus(l: ApiLineman): 'active' | 'idle' | 'offline' {
  if (!l.pingedAt) return 'offline'
  const mins = Math.floor((Date.now() - new Date(l.pingedAt).getTime()) / 60000)
  if (isNaN(mins) || mins > 30) return 'offline'
  if (mins > 15) return 'idle'
  return l.status
}

// Normalize raw Laravel snake_case response → ApiLineman
function normalizeLineman(r: any): ApiLineman {
  return {
    id:         String(r.id ?? r.user_id ?? ''),
    name:       r.name ?? r.user?.name ?? 'Unknown',
    status:     r.status ?? 'offline',
    lat:        Number(r.lat ?? r.latitude ?? 0),
    lng:        Number(r.lng ?? r.longitude ?? 0),
    // try every possible field name the backend might use
    pingedAt:   r.pinged_at ?? r.pingedAt ?? r.last_ping ?? r.last_seen
                ?? r.last_active ?? r.updated_at ?? '',
    teamId:     r.team_id ?? r.teamId ?? null,
    teamName:   r.team_name ?? r.teamName ?? r.team?.name ?? null,
    subconId:   r.subcon_id ?? r.subconId ?? r.subcontractor_id ?? null,
    subconName: r.subcon_name ?? r.subconName ?? r.subcontractor?.name ?? null,
    city:       r.city ?? null,
    barangay:   r.barangay ?? null,
  }
}

function iCls() {
  return 'h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white'
}

function pct(n: number, d: number) {
  if (!d) return 0
  return Math.round((n / d) * 100)
}

function Pill({ cfg, dot }: { cfg: { label: string; pill: string }; dot?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${cfg.pill}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {cfg.label}
    </span>
  )
}

function Modal({
  title,
  sub,
  color = 'from-slate-900 to-slate-700',
  icon,
  onClose,
  children,
  footer,
  size = 'max-w-lg',
}: {
  title: string
  sub?: string
  color?: string
  icon?: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  size?: string
}) {
  return (
    <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className={`flex max-h-[90vh] w-full ${size} flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-950`}>
        <div className={`shrink-0 bg-gradient-to-r ${color} px-6 py-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <i className={`${icon} text-lg text-white`} />
                </div>
              )}
              <div>
                <p className="text-sm font-black text-white">{title}</p>
                {sub && <p className="mt-0.5 text-xs text-white/70">{sub}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
            >
              <i className="bx bx-x text-lg" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">{children}</div>
        <div className="flex shrink-0 gap-3 border-t border-slate-100 px-6 py-4 dark:border-zinc-800">{footer}</div>
      </div>
    </div>
  )
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300"
    >
      Cancel
    </button>
  )
}

export default function NodePolesSpans() {
  const { siteId: siteSlugParam = '', nodeId: nodeSlugParam = '' } = useParams<{ siteId: string; nodeId: string }>()
  // Support both raw IDs ("6") and slugified names ("park-triange-6")
  const siteId = idFromSlug(siteSlugParam) || Number(siteSlugParam) || siteSlugParam
  const nodeId = String(idFromSlug(nodeSlugParam) || Number(nodeSlugParam) || nodeSlugParam)
  const navigate = useNavigate()
  const admin = isAdmin() || isExecutive()

  const [showCrew, setShowCrew] = useState(false)
  const [lastLinemenFetch, setLastLinemenFetch] = useState<number | null>(null)
  const [node, setNode] = useState<Node | null>(null)

  // Cache & Connection States
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem(`nodepoles_${nodeId}`)
      return raw ? JSON.parse(raw).ts : null
    } catch { return null }
  })
  const [syncText, setSyncText] = useState('Never')

  // Dynamic relative time calculations for sync label
  useEffect(() => {
    function updateText() {
      if (!lastSynced) {
        setSyncText('Never')
        return
      }
      const diff = Date.now() - lastSynced
      const secs = Math.floor(diff / 1000)
      if (secs < 60) {
        setSyncText('Just now')
      } else {
        const mins = Math.floor(secs / 60)
        setSyncText(`${mins}m ago`)
      }
    }
    updateText()
    const id = setInterval(updateText, 10000)
    return () => clearInterval(id)
  }, [lastSynced])

  // Track browser connectivity
  useEffect(() => {
    function handleOnline() { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  const [poles, setPoles] = useState<Pole[]>([])
  const [teardowns, setTeardowns] = useState<TeardownRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [linemen, setLinemen] = useState<ApiLineman[]>([])
  const crewMapRef = useRef<HTMLDivElement>(null)
  const crewMapObj = useRef<L.Map | null>(null)
  const crewMarkersRef = useRef<Record<string, L.Marker>>({})
  const vicinityCrewMarkersRef = useRef<Record<string, L.Marker>>({})

  const [search, setSearch] = useState('')

  const mapRef = useRef<HTMLDivElement>(null)
  const mapObj = useRef<any>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const [baseTile, setBaseTile] = useState<BaseTile>('osm')
  const [metricsModal, setMetricsModal] = useState(false)
  const [savingMetrics, setSavingMetrics] = useState(false)
  const [metricsData, setMetricsData] = useState({
    expected_nodes: 0,
    expected_amplifier: 0,
    expected_extender: 0,
    expected_tsc: 0,
    expected_powersupply: 0,
    expected_ps_housing: 0,
    actual_node: 0,
    actual_amplifier: 0,
    actual_extender: 0,
    actual_tsc: 0,
    actual_powersupply: 0,
    actual_ps_housing: 0,
    expected_cable: 0,
    actual_cable: 0,
    date_start: '' as string,
    due_date: '' as string,
    date_finished: '' as string,
  })

  const [poleModal, setPoleModal] = useState(false)
  const [poleCode, setPoleCode] = useState('')
  const [poleLat, setPoleLat] = useState('')
  const [poleLng, setPoleLng] = useState('')
  const [savingPole, setSavingPole] = useState(false)
  const [poleErr, setPoleErr] = useState<string | null>(null)

  // Map interaction modes
  const [mapMode, setMapMode] = useState<'view' | 'add' | 'reassign'>('view')
  const mapModeRef = useRef<'view' | 'add' | 'reassign'>('view')
  const [reassignMsg, setReassignMsg] = useState<{ code: string; ok: boolean } | null>(null)

  function setMode(m: 'view' | 'add' | 'reassign') {
    setMapMode(m)
    mapModeRef.current = m
  }

  const [editPoleModal, setEditPoleModal] = useState(false)
  const [editingPole, setEditingPole] = useState<Pole | null>(null)
  const [editPoleCode, setEditPoleCode] = useState('')
  const [editPoleLat, setEditPoleLat] = useState('')
  const [editPoleLng, setEditPoleLng] = useState('')
  const [editPoleStatus, setEditPoleStatus] = useState<'pending' | 'in_progress' | 'cleared'>('pending')
  const [savingEditPole, setSavingEditPole] = useState(false)
  const [editPoleErr, setEditPoleErr] = useState<string | null>(null)
  // Before photo lock state for the edit modal
  const [beforeImageRecord, setBeforeImageRecord] = useState<{ id: number; locked: boolean; image_url: string } | null>(null)
  const [togglingLock, setTogglingLock] = useState(false)
  // pole_db_id → true when pole has a before photo in backend
  const [beforePhotoMap, setBeforePhotoMap] = useState<Record<number, boolean>>({})
  const editMapRef = useRef<HTMLDivElement>(null)
  const editMapObj = useRef<L.Map | null>(null)
  const editMapMarker = useRef<L.Marker | null>(null)

  const addMapRef = useRef<HTMLDivElement>(null)
  const addMapObj = useRef<L.Map | null>(null)
  const addMapMarker = useRef<L.Marker | null>(null)
  const addMapTileRef = useRef<L.TileLayer | null>(null)
  const [addMapTile, setAddMapTile] = useState<BaseTile>('osm')

  const parsePoles = (d: any): Pole[] =>
    (Array.isArray(d) ? d : (d?.data ?? [])).map((p: any) => ({
      id: p.id,
      pole_db_id: p.pole?.id ?? p.id,
      pole_code: p.pole?.pole_code ?? `#${p.id}`,
      lat: p.pole?.lat ?? null,
      lng: p.pole?.lng ?? null,
      skycable_status: p.pole?.skycable_status ?? 'pending',
      barangay: p.pole?.barangay ?? null,
      sequence: p.sequence ?? null,
    }))

  const load = useCallback(async (silent = false) => {
    if (!nodeId) return

    const ck = `nodepoles_${nodeId}`
    const hit = cacheGet<{ node: Node; poles: Pole[] }>(ck)

    if (hit) {
      setNode(hit.node)
      setPoles(hit.poles)
      setLoading(false)
      setLastSynced(hit.ts || Date.now())
      
      // SWR: fetch fresh data in background silently — includes teardowns so inventory is always current
      Promise.all([
        fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: h() }),
        fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: h() }),
        fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=500`, { headers: h() }),
      ]).then(async ([nr, pr, tr]) => {
        const [nd, pd, td] = await Promise.all([nr.json(), pr.json(), tr.json()])
        const n = nd?.data ?? nd
        const p = parsePoles(pd)
        const t: TeardownRecord[] = Array.isArray(td) ? td : (td?.data ?? [])
        setNode(n)
        setPoles(p)
        setTeardowns(t)
        cacheSet(ck, { node: n, poles: p })
        setLastSynced(Date.now())
      }).catch(() => {})
      return
    }

    if (!silent) {
      setLoading(true)
    }

    try {
      const [nr, pr, tr] = await Promise.all([
        fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: h() }),
        fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: h() }),
        fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=500`, { headers: h() }),
      ])

      const [nd, pd, td] = await Promise.all([nr.json(), pr.json(), tr.json()])
      const n = nd?.data ?? nd
      const p = parsePoles(pd)
      const t: TeardownRecord[] = Array.isArray(td) ? td : (td?.data ?? [])

      setNode(n)
      setPoles(p)
      setTeardowns(t)
      cacheSet(ck, { node: n, poles: p })
      setLastSynced(Date.now())
    } catch {
      /* keep cached */
    } finally {
      setLoading(false)
    }
    // Fetch before photo map in background (non-blocking)
    fetch(`${API_BASE}/api/v1/teardown/node-images/${nodeId}?inventory_type=skycable&image_type=before`, { headers: h() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const imgs: { pole_id: number }[] = Array.isArray(d?.data) ? d.data : []
        if (imgs.length) {
          const map: Record<number, boolean> = {}
          imgs.forEach(i => { map[i.pole_id] = true })
          setBeforePhotoMap(map)
        }
      })
      .catch(() => {})
  }, [nodeId])

  useEffect(() => {
    load()
  }, [load])

  async function handleManualSync() {
    if (syncing || !isOnline) return
    setSyncing(true)

    try {
      cacheDel(`nodepoles_${nodeId}`)
      await load(true)
    } catch {
    } finally {
      setSyncing(false)
    }
  }

  function handleClearCache() {
    cacheDel(`nodepoles_${nodeId}`)
    setNode(null)
    setPoles([])
    setLastSynced(null)
    setTimeout(() => {
      load(false)
    }, 100)
  }

  const bust = () => {
    handleManualSync()
  }

  const stats = useMemo(() => {
    const gps     = poles.filter(p => p.lat && p.lng).length
    const cleared = poles.filter(p => p.skycable_status === 'cleared').length
    return {
      total:      poles.length,
      gps,
      cleared,
      cable:      node?.expected_cable ?? 0,
      actCable:   node?.span_summaries_sum_actual_cable ?? node?.actual_cable ?? null,
      nodes:      node?.expected_nodes      ?? node?.span_summaries_sum_expected_node      ?? 0,
      amps:       node?.expected_amplifier  ?? node?.span_summaries_sum_expected_amplifier ?? 0,
      exts:       node?.expected_extender   ?? node?.span_summaries_sum_expected_extender  ?? 0,
      tsc:        node?.expected_tsc        ?? node?.span_summaries_sum_expected_tsc       ?? 0,
      psu:        node?.expected_powersupply ?? node?.span_summaries_sum_expected_powersupply ?? 0,
      psh:        node?.expected_housing    ?? node?.span_summaries_sum_expected_ps_housing ?? 0,
      actNodes:   node?.actual_node         ?? node?.span_summaries_sum_actual_node        ?? 0,
      actAmps:    node?.actual_amplifier    ?? node?.span_summaries_sum_actual_amplifier   ?? 0,
      actExts:    node?.actual_extender     ?? node?.span_summaries_sum_actual_extender    ?? 0,
      actTsc:     node?.actual_tsc          ?? node?.span_summaries_sum_actual_tsc         ?? 0,
      actPsu:     node?.actual_powersupply  ?? node?.span_summaries_sum_actual_powersupply ?? 0,
      actPsh:     node?.actual_ps_housing   ?? node?.span_summaries_sum_actual_ps_housing  ?? 0,
      gpsPct:     pct(gps, poles.length),
      clearPct:   pct(cleared, poles.length),
      progressPct: node?.progress_percentage ?? null,
    }
  }, [poles, node])

  useEffect(() => {
    if (!mapRef.current) return

    if (mapObj.current) {
      mapObj.current.remove()
      mapObj.current = null
    }

    const gpsPoles = poles.filter(p => p.lat && p.lng)
    if (!gpsPoles.length) return

    const lats = gpsPoles.map(p => Number(p.lat))
    const lngs = gpsPoles.map(p => Number(p.lng))
    const cLat = lats.reduce((a, b) => a + b, 0) / lats.length
    const cLng = lngs.reduce((a, b) => a + b, 0) / lngs.length

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([cLat, cLng], 17)

    mapObj.current = map

    tileRef.current = L.tileLayer(TILES[baseTile].url, {
      maxZoom: 22,
    }).addTo(map)

    gpsPoles.forEach(p => {
      const cfg = POLE_CFG[p.skycable_status] ?? POLE_CFG.pending

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            width:28px;
            height:28px;
            border-radius:999px;
            background:${cfg.hex};
            border:4px solid white;
            box-shadow:0 8px 24px rgba(0,0,0,.35);
            display:flex;
            align-items:center;
            justify-content:center;
          ">
            <div style="width:8px;height:8px;border-radius:999px;background:white;"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      // In reassign mode: green drag icon; otherwise normal status icon
      const markerIcon = mapMode === 'reassign'
        ? L.divIcon({
            className: '',
            html: `<div style="width:32px;height:32px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 3px #10b98155,0 4px 14px rgba(0,0,0,.45);cursor:grab;display:flex;align-items:center;justify-content:center;">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M11 5h2v14h-2zm-5 5l-2 2 2 2V10zm12 0v4l2-2-2-2z"/></svg>
                   </div>`,
            iconSize: [32, 32], iconAnchor: [16, 16],
          })
        : icon

      const marker = L.marker([Number(p.lat), Number(p.lng)], { icon: markerIcon, draggable: mapMode === 'reassign' }).addTo(map)

      if (mapMode === 'reassign') {
        marker.bindTooltip(`<b style="font-family:monospace">${p.pole_code}</b><br/><span style="font-size:10px;opacity:.7">Drag to move</span>`, { permanent: false, direction: 'top', offset: [0, -18] })
        marker.on('dragend', async () => {
          const { lat: newLat, lng: newLng } = marker.getLatLng()
          try {
            // Try /gps endpoint first (NodeSpans pattern), fall back to PUT
            let ok = false
            const r1 = await fetch(`${SKYCABLE_API}/poles/${p.pole_db_id}/gps`, {
              method: 'POST', headers: h(),
              body: JSON.stringify({ lat: newLat, lng: newLng }),
            })
            if (r1.ok || r1.status === 204) { ok = true }
            if (!ok) {
              const r2 = await fetch(`${SKYCABLE_API}/poles/${p.pole_db_id}`, {
                method: 'PUT', headers: h(),
                body: JSON.stringify({ lat: newLat, lng: newLng, latitude: newLat, longitude: newLng }),
              })
              if (r2.ok || r2.status === 204) ok = true
            }
            if (!ok) throw new Error('Save failed')
            setTimeout(() => setReassignMsg({ code: p.pole_code, ok: true }), 0)
          } catch {
            setTimeout(() => setReassignMsg({ code: p.pole_code, ok: false }), 0)
            marker.setLatLng([Number(p.lat), Number(p.lng)])
          }
          setTimeout(() => setReassignMsg(null), 3000)
        })
      } else {
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:170px;padding:4px 0">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;margin-bottom:4px">Pole</div>
            <div style="font-size:15px;font-weight:900;color:#0f172a;font-family:monospace">${p.pole_code}</div>
            <div style="margin-top:4px">
              <span style="display:inline-flex;align-items:center;gap:4px;background:${cfg.hex}18;color:${cfg.hex};border:1px solid ${cfg.hex}40;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800">
                <span style="width:6px;height:6px;border-radius:50%;background:${cfg.hex};display:inline-block"></span>
                ${cfg.label}
              </span>
            </div>
            <a href="/sites/${siteId}/nodes/${nodeId}/teardown?pole_id=${p.id}&pole_code=${encodeURIComponent(p.pole_code)}"
              style="display:block;margin-top:10px;background:#10b981;color:#fff;text-align:center;padding:9px 12px;border-radius:10px;font-weight:900;font-size:12px;text-decoration:none;letter-spacing:.04em;box-shadow:0 4px 12px rgba(16,185,129,.35)">
              ▶ Start Teardown
            </a>
          </div>
        `, { maxWidth: 220 })
      }
    })

    // Map click — only acts in 'add' mode (reassign uses drag)
    if (admin) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (mapModeRef.current !== 'add') return
        const { lat, lng } = e.latlng
        setPoleCode('')
        setPoleLat(lat.toFixed(7))
        setPoleLng(lng.toFixed(7))
        setPoleErr(null)
        setPoleModal(true)
      })
    }

    setTimeout(() => {
      map.invalidateSize()

      const bounds = gpsPoles.map(p => [Number(p.lat), Number(p.lng)] as [number, number])
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 18 })
      }
    }, 160)

    return () => {
      if (mapObj.current) {
        mapObj.current.remove()
        mapObj.current = null
      }
    }
  }, [poles, mapMode])

  // Swap tile layer URL
  useEffect(() => {
    if (tileRef.current) {
      tileRef.current.setUrl(TILES[baseTile].url)
    }
  }, [baseTile])


  // Update crew markers on the Vicinity Map when linemen or node changes
  useEffect(() => {
    function drawVicinityCrewMarkers() {
      const map = mapObj.current
      if (!map) return false
      Object.values(vicinityCrewMarkersRef.current).forEach(m => m.remove())
      vicinityCrewMarkersRef.current = {}
      const subconId = node?.subcontractor?.id ?? null
      const crew = linemen.filter(l => (!subconId || l.subconId === subconId) && l.lat && l.lng)
      const COLOR: Record<string, string> = { active: '#16a34a', idle: '#d97706', offline: '#6b7280' }
      crew.forEach(l => {
        const c = COLOR[l.status] ?? '#6b7280'
        const initials = l.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:36px;z-index:9999;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
            ${l.status === 'active' ? `<div class="lm-ripple" style="border:2px solid ${c}"></div>` : ''}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="${c}" stroke="#ffffff" stroke-width="2" style="transform: rotate(-90deg);">
              <path d="M3 21l18-9-18-9 4 9-4 9z"/>
            </svg>
          </div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        })
        const marker = L.marker([l.lat, l.lng], { icon, zIndexOffset: 1000 })
          .bindPopup(`<div style="font-family:system-ui;min-width:150px;padding:2px 0">
            <div style="font-weight:900;font-size:13px;color:#0f172a">${l.name}</div>
            <div style="font-size:11px;color:${c};font-weight:700;margin-top:3px">${l.status.toUpperCase()}</div>
            ${l.teamName ? `<div style="font-size:10px;color:#64748b;margin-top:2px">👥 ${l.teamName}</div>` : ''}
            ${l.city ? `<div style="font-size:10px;color:#94a3b8">📍 ${l.city}</div>` : ''}
          </div>`)
          .addTo(map)
        vicinityCrewMarkersRef.current[l.id] = marker
      })
      return true
    }

    if (!drawVicinityCrewMarkers()) {
      const t = setTimeout(drawVicinityCrewMarkers, 500)
      return () => clearTimeout(t)
    }
  }, [linemen, node])

  // Map picker inside Edit Pole modal
  useEffect(() => {
    if (!editPoleModal) {
      if (editMapObj.current) { editMapObj.current.remove(); editMapObj.current = null }
      editMapMarker.current = null
      return
    }
    const timer = setTimeout(() => {
      if (!editMapRef.current || editMapObj.current) return
      const lat = parseFloat(editPoleLat) || 14.5995
      const lng = parseFloat(editPoleLng) || 120.9842
      const map = L.map(editMapRef.current, { zoomControl: true, attributionControl: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc' }).addTo(map)
      map.setView([lat, lng], 17)
      const mkIcon = () => L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 2px #10b981,0 4px 12px rgba(16,185,129,0.5)"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })
      if (!isNaN(parseFloat(editPoleLat)) && !isNaN(parseFloat(editPoleLng))) {
        editMapMarker.current = L.marker([lat, lng], { icon: mkIcon() }).addTo(map)
      }
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat: la, lng: ln } = e.latlng
        setEditPoleLat(la.toFixed(7))
        setEditPoleLng(ln.toFixed(7))
        if (editMapMarker.current) {
          editMapMarker.current.setLatLng(e.latlng)
        } else {
          editMapMarker.current = L.marker(e.latlng, { icon: mkIcon() }).addTo(map)
        }
      })
      editMapObj.current = map
      setTimeout(() => { map.invalidateSize(); map.setView([lat, lng], 17) }, 200)
    }, 250)
    return () => clearTimeout(timer)
  }, [editPoleModal])

  // Add Pole map picker
  useEffect(() => {
    if (!poleModal) {
      if (addMapObj.current) { addMapObj.current.remove(); addMapObj.current = null }
      addMapMarker.current = null; addMapTileRef.current = null
      return
    }
    const timer = setTimeout(() => {
      if (!addMapRef.current || addMapObj.current) return

      const gpsPoles = poles.filter(p => p.lat && p.lng)
      const clickedLat = parseFloat(poleLat)
      const clickedLng = parseFloat(poleLng)
      const hasClicked = !isNaN(clickedLat) && !isNaN(clickedLng)

      // Center: use clicked point if available, else centroid of existing poles, else Manila
      let initLat = 14.5995, initLng = 120.9842, initZoom = 12
      if (hasClicked) {
        initLat = clickedLat; initLng = clickedLng; initZoom = 18
      } else if (gpsPoles.length > 0) {
        initLat = gpsPoles.reduce((s, p) => s + Number(p.lat), 0) / gpsPoles.length
        initLng = gpsPoles.reduce((s, p) => s + Number(p.lng), 0) / gpsPoles.length
        initZoom = 17
      }

      const map = L.map(addMapRef.current, { zoomControl: true, attributionControl: false })
      const tile = L.tileLayer(TILES[addMapTile].url, { maxZoom: 22 }).addTo(map)
      addMapTileRef.current = tile
      map.setView([initLat, initLng], initZoom)

      // Draw existing poles as reference markers (dimmed)
      gpsPoles.forEach(p => {
        const cfg = POLE_CFG[p.skycable_status] ?? POLE_CFG.pending
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:18px;height:18px;border-radius:50%;
            background:${cfg.hex};border:2.5px solid rgba(255,255,255,0.85);
            box-shadow:0 2px 8px rgba(0,0,0,0.35);
            display:flex;align-items:center;justify-content:center;
          "><div style="width:5px;height:5px;border-radius:50%;background:white;opacity:0.9"></div></div>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        })
        L.marker([Number(p.lat), Number(p.lng)], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:130px;padding:2px 0">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;color:#94a3b8;margin-bottom:3px">Existing Pole</div>
            <div style="font-size:13px;font-weight:900;color:#0f172a;font-family:monospace">${p.pole_code}</div>
            <span style="display:inline-flex;align-items:center;gap:3px;background:${cfg.hex}18;color:${cfg.hex};border:1px solid ${cfg.hex}40;border-radius:999px;padding:1px 6px;font-size:9px;font-weight:800;margin-top:3px">
              <span style="width:5px;height:5px;border-radius:50%;background:${cfg.hex};display:inline-block"></span>
              ${cfg.label}
            </span>
          </div>`, { maxWidth: 180 })
      })

      // Fit to all poles if no clicked point
      if (!hasClicked && gpsPoles.length > 1) {
        const bounds = gpsPoles.map(p => [Number(p.lat), Number(p.lng)] as [number, number])
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 })
      }

      // New pole marker icon
      const mkIcon = () => L.divIcon({
        className: '',
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:#006241;border:3px solid #fff;
          box-shadow:0 0 0 2px #006241,0 4px 16px rgba(0,98,65,0.6);
          display:flex;align-items:center;justify-content:center;
        "><div style="width:7px;height:7px;border-radius:50%;background:white"></div></div>`,
        iconSize: [24, 24], iconAnchor: [12, 12],
      })

      if (hasClicked) {
        addMapMarker.current = L.marker([clickedLat, clickedLng], { icon: mkIcon() })
          .addTo(map)
          .bindPopup('<div style="font-size:11px;font-weight:900;color:#006241">New pole here</div>')
      }

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat: la, lng: ln } = e.latlng
        setPoleLat(la.toFixed(7))
        setPoleLng(ln.toFixed(7))
        if (addMapMarker.current) addMapMarker.current.setLatLng(e.latlng)
        else addMapMarker.current = L.marker(e.latlng, { icon: mkIcon() }).addTo(map)
      })

      addMapObj.current = map
      setTimeout(() => map.invalidateSize(), 200)
    }, 250)
    return () => clearTimeout(timer)
  }, [poleModal])

  // Swap tile in Add Pole map
  useEffect(() => {
    if (addMapTileRef.current) addMapTileRef.current.setUrl(TILES[addMapTile].url)
  }, [addMapTile])

  // Poll live lineman locations every 30s
  useEffect(() => {
    async function fetchLinemen() {
      try {
        const res = await fetch(`${SKYCABLE_API}/lineman/locations`, { headers: h() })
        if (!res.ok) return
        const raw = await res.json()
        const data = (Array.isArray(raw) ? raw : []).map((r: any) => {
          const normalized = normalizeLineman(r)
          return { ...normalized, status: effectiveStatus(normalized) }
        })
        setLinemen(data)
        setLastLinemenFetch(Date.now())
      } catch {}
    }
    fetchLinemen()
    const id = setInterval(fetchLinemen, 30_000)  // every 30s
    return () => clearInterval(id)
  }, [])

  // Init crew map once (after panel is shown)
  useEffect(() => {
    if (!showCrew) return
    const timer = setTimeout(() => {
      if (!crewMapRef.current || crewMapObj.current) return
      const map = L.map(crewMapRef.current, { zoomControl: true, attributionControl: false })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20, subdomains: 'abcd',
      }).addTo(map)
      map.setView([14.5995, 120.9842], 12)
      crewMapObj.current = map
      setTimeout(() => map.invalidateSize(), 100)
    }, 80)
    return () => { clearTimeout(timer) }
  }, [showCrew])

  // Invalidate size when crew panel is toggled on
  useEffect(() => {
    if (showCrew && crewMapObj.current) {
      setTimeout(() => crewMapObj.current?.invalidateSize(), 120)
    }
    if (!showCrew && crewMapObj.current) {
      crewMapObj.current.remove()
      crewMapObj.current = null
      Object.values(crewMarkersRef.current).forEach(m => m.remove())
      crewMarkersRef.current = {}
    }
  }, [showCrew])

  // Update crew markers when linemen or node changes — retry if map not ready yet
  useEffect(() => {
    function drawMarkers() {
      const map = crewMapObj.current
      if (!map) return false
      Object.values(crewMarkersRef.current).forEach(m => m.remove())
      crewMarkersRef.current = {}
      const subconId = node?.subcontractor?.id ?? null
      const crew = linemen.filter(l => (!subconId || l.subconId === subconId) && l.lat && l.lng)
      const COLOR: Record<string, string> = { active: '#16a34a', idle: '#d97706', offline: '#6b7280' }
      crew.forEach(l => {
        const c = COLOR[l.status] ?? '#6b7280'
        const initials = l.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
            ${l.status === 'active' ? `<div class="lm-ripple" style="border:2px solid ${c}"></div>` : ''}
            <svg width="30" height="30" viewBox="0 0 24 24" fill="${c}" stroke="#ffffff" stroke-width="2" style="transform: rotate(-90deg);">
              <path d="M3 21l18-9-18-9 4 9-4 9z"/>
            </svg>
          </div>`,
          iconSize: [38, 38], iconAnchor: [19, 19],
        })
        crewMarkersRef.current[l.id] = L.marker([l.lat, l.lng], { icon })
          .bindPopup(`<div style="font-family:system-ui;min-width:150px;padding:2px 0">
            <div style="font-weight:900;font-size:13px;color:#0f172a">${l.name}</div>
            <div style="font-size:11px;color:${c};font-weight:700;margin-top:3px">${l.status.toUpperCase()}</div>
            ${l.teamName ? `<div style="font-size:10px;color:#64748b;margin-top:2px">👥 ${l.teamName}</div>` : ''}
            ${l.city ? `<div style="font-size:10px;color:#94a3b8">📍 ${l.city}</div>` : ''}
          </div>`)
          .addTo(map)
      })
      if (crew.length > 0) {
        if (crew.length === 1) {
          map.setView([crew[0].lat, crew[0].lng], 16)
        } else {
          map.fitBounds(crew.map(l => [l.lat, l.lng] as [number, number]), { padding: [50, 50], maxZoom: 16 })
        }
      }
      map.invalidateSize()
      return true
    }

    // If map not ready yet, retry after it initialises
    if (!drawMarkers()) {
      const t = setTimeout(drawMarkers, 300)
      return () => clearTimeout(t)
    }
  }, [linemen, node])

  const filteredPoles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? poles.filter(p => p.pole_code.toLowerCase().includes(q)) : poles
  }, [poles, search])


  const saveMetrics = async () => {
    setSavingMetrics(true)
    try {
      const res = await fetch(`${SKYCABLE_API}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify(metricsData),
      })
      if (!res.ok) throw new Error('Failed to save metrics')
      bust()
      setMetricsModal(false)
    } catch (e) {
      alert('Failed to update metrics')
    } finally {
      setSavingMetrics(false)
    }
  }

  const savePole = async () => {
    if (!poleCode.trim()) {
      setPoleErr('Pole code is required.')
      return
    }

    setSavingPole(true)
    setPoleErr(null)

    const body: Record<string, unknown> = {
      node_id: Number(nodeId),
      pole_code: poleCode.trim(),
    }
    if (poleLat && !isNaN(Number(poleLat))) body.lat = Number(poleLat)
    if (poleLng && !isNaN(Number(poleLng))) body.lng = Number(poleLng)

    const endpoints = [
      `${SKYCABLE_API}/poles`,
      `${SKYCABLE_API}/nodes/${nodeId}/poles`,
    ]

    try {
      let lastErr = 'Failed to add pole'
      for (const url of endpoints) {
        const res = await fetch(url, { method: 'POST', headers: h(), body: JSON.stringify(body) })
        const text = await res.text()
        let data: any = {}
        try { data = JSON.parse(text) } catch { /* non-JSON */ }

        if (res.ok) {
          setPoleModal(false)
          setPoleCode('')
          setPoleLat('')
          setPoleLng('')
          bust()
          return
        }

        // Extract readable error from Laravel validation / message
        if (data?.errors) {
          const msgs = Object.values(data.errors as Record<string, string[]>).flat()
          lastErr = msgs.join(' · ')
        } else if (data?.message) {
          lastErr = data.message
        } else if (text) {
          lastErr = `HTTP ${res.status}: ${text.slice(0, 120)}`
        } else {
          lastErr = `HTTP ${res.status}`
        }

        // If 404 or 405 try next endpoint, else stop
        if (res.status !== 404 && res.status !== 405) break
      }
      setPoleErr(lastErr)
    } catch (e: any) {
      setPoleErr(e?.message ?? 'Network error — check connection')
    } finally {
      setSavingPole(false)
    }
  }

  const saveEditPole = async () => {
    if (!editingPole) return

    setSavingEditPole(true)
    setEditPoleErr(null)

    try {
      const body: Record<string, unknown> = {
        pole_code: editPoleCode.trim(),
        skycable_status: editPoleStatus,
      }

      if (editPoleLat) body.lat = Number(editPoleLat)
      if (editPoleLng) body.lng = Number(editPoleLng)

      const res = await fetch(`${SKYCABLE_API}/poles/${editingPole.pole_db_id}`, {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed')

      setEditPoleModal(false)
      bust()
    } catch (e: any) {
      setEditPoleErr(e.message)
    } finally {
      setSavingEditPole(false)
    }
  }

  if (loading && !node) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent" />
      </div>
    )
  }

  const nodeLabel = node?.full_label ?? node?.name ?? `Node ${nodeId}`

  function fmtDate(v: string | null | undefined) {
    if (!v) return '—'
    const d = new Date(v.includes('T') ? v : v + 'T00:00:00')
    if (isNaN(d.getTime())) return v
    const hasTime = v.includes('T') && !v.endsWith('T00:00:00')
    return d.toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      ...(hasTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
    })
  }

  const nodeSt: Record<string, { label: string; cls: string }> = {
    pending: {
      label: 'Pending',
      cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    },
    in_progress: {
      label: 'Ongoing',
      cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    },
    completed: {
      label: 'Completed',
      cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    },
  }

  const currentNodeStatus = nodeSt[node?.status ?? ''] ?? {
    label: node?.status ?? '—',
    cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  }

  const subconId = node?.subcontractor?.id ?? null
  const crewAll   = linemen.filter(l => !subconId || l.subconId === subconId)
  const crewActive = crewAll.filter(l => l.status === 'active')
  const crewIdle   = crewAll.filter(l => l.status === 'idle')

  // Sum all collected from teardown records (source of truth)
  const n2 = (v: number | string | null | undefined) => Number(v ?? 0)
  const tdCable   = teardowns.reduce((s, t) => s + n2(t.actual_cable),          0)
  const tdNodes   = teardowns.reduce((s, t) => s + n2(t.nodes_collected),       0)
  const tdAmps    = teardowns.reduce((s, t) => s + n2(t.amplifiers_collected),  0)
  const tdExts    = teardowns.reduce((s, t) => s + n2(t.extenders_collected),   0)
  const tdTsc     = teardowns.reduce((s, t) => s + n2(t.tsc_collected),         0)
  const tdPsu     = teardowns.reduce((s, t) => s + n2(t.powersupply_collected), 0)
  const tdPsh     = teardowns.reduce((s, t) => s + n2(t.ps_housing_collected),  0)

  const materialKpis = [
    { label: 'Total Cable',  value: `${tdCable.toFixed(2)}m`,  helper: `${n2(stats.cable).toFixed(2)}m expected`,  icon: 'bx bx-cable-car',   top: 'from-emerald-500 to-teal-500'   },
    { label: 'Node Box',     value: tdNodes,                   helper: `${stats.nodes} expected`,                  icon: 'bx bx-server',       top: 'from-sky-500 to-blue-500'       },
    { label: 'Amplifier',    value: tdAmps,                    helper: `${stats.amps} expected`,                   icon: 'bx bx-broadcast',    top: 'from-violet-500 to-purple-500'  },
    { label: 'Extender',     value: tdExts,                    helper: `${stats.exts} expected`,                   icon: 'bx bx-wifi',         top: 'from-teal-500 to-cyan-500'      },
    { label: 'TSC',          value: tdTsc,                     helper: `${stats.tsc} expected`,                    icon: 'bx bx-chip',         top: 'from-amber-500 to-orange-500'   },
    { label: 'Power Supply', value: tdPsu,                     helper: `${stats.psu} expected`,                    icon: 'bx bx-bolt-circle',  top: 'from-orange-500 to-red-500'     },
    { label: 'PS Case',      value: tdPsh,                     helper: `${stats.psh} expected`,                    icon: 'bx bx-cabinet',      top: 'from-slate-500 to-zinc-500'     },
  ]

  return (
    <div className="min-h-screen bg-[#f7f8fc] pb-12 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <style>{`@keyframes lm-ripple{0%{transform:scale(.9);opacity:.7}100%{transform:scale(2.2);opacity:0}}.lm-ripple{position:absolute;inset:0;border-radius:50%;animation:lm-ripple 2s ease-out infinite;pointer-events:none}`}</style>
      <div className="flex flex-col gap-6 px-4 py-5 sm:px-6">
        <div>
          <nav className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400">
            <Link to="/sites" className="transition hover:text-emerald-600">Sites</Link>
            <i className="bx bx-chevron-right text-sm" />
            <Link to={`/sites/${siteId}/nodes`} className="transition hover:text-emerald-600">Nodes</Link>
            <i className="bx bx-chevron-right text-sm" />
            <span className="font-bold text-slate-600 dark:text-slate-300">{nodeLabel}</span>
          </nav>

          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-black tracking-tight">{nodeLabel}</h1>

            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {/* Cache Control Panel */}
            <div className="flex items-center gap-2 rounded-2xl bg-white/50 backdrop-blur-md border border-slate-200 px-3 py-1.5 shadow-sm text-xs select-none dark:bg-zinc-900/50 dark:border-zinc-800">
              {/* Live Connection Badge */}
              <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200 dark:border-zinc-800">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </span>
                <span className="font-bold text-slate-600 dark:text-zinc-300">
                  {isOnline ? 'Online' : 'Offline Mode'}
                </span>
              </div>

              {/* Cache Status Details */}
              <div className="flex items-center gap-1 text-slate-400 font-medium">
                <i className="bx bx-time-five text-sm" />
                <span>Synced:</span>
                <span className="font-black text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 leading-none dark:bg-zinc-800 dark:text-zinc-300">
                  {syncText}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing || !isOnline}
                  title="Sync Now"
                  className={`flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition-all ${syncing ? 'animate-spin' : 'hover:bg-slate-100 hover:text-violet-500 dark:hover:bg-zinc-800'} disabled:opacity-50`}
                >
                  <i className="bx bx-refresh text-lg" />
                </button>

                <button
                  type="button"
                  onClick={handleClearCache}
                  title="Purge Cache"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 transition-all"
                >
                  <i className="bx bx-trash text-sm" />
                </button>
              </div>
            </div>

            {admin && (
              <>
                <button
                  onClick={() => {
                    setMetricsData({
                      expected_nodes: node?.expected_nodes ?? node?.span_summaries_sum_expected_node ?? 0,
                      expected_amplifier: node?.expected_amplifier ?? node?.span_summaries_sum_expected_amplifier ?? 0,
                      expected_extender: node?.expected_extender ?? node?.span_summaries_sum_expected_extender ?? 0,
                      expected_tsc: node?.expected_tsc ?? node?.span_summaries_sum_expected_tsc ?? 0,
                      expected_powersupply: node?.expected_powersupply ?? node?.span_summaries_sum_expected_powersupply ?? 0,
                      expected_ps_housing: node?.expected_housing ?? node?.span_summaries_sum_expected_ps_housing ?? 0,
                      actual_node: node?.actual_node ?? node?.span_summaries_sum_actual_node ?? 0,
                      actual_amplifier: node?.actual_amplifier ?? node?.span_summaries_sum_actual_amplifier ?? 0,
                      actual_extender: node?.actual_extender ?? node?.span_summaries_sum_actual_extender ?? 0,
                      actual_tsc: node?.actual_tsc ?? node?.span_summaries_sum_actual_tsc ?? 0,
                      actual_powersupply: node?.actual_powersupply ?? node?.span_summaries_sum_actual_powersupply ?? 0,
                      actual_ps_housing: node?.actual_ps_housing ?? node?.span_summaries_sum_actual_ps_housing ?? 0,
                      expected_cable: node?.expected_cable ?? 0,
                      actual_cable: node?.actual_cable ?? 0,
                      date_start: node?.date_start ?? '',
                      due_date: node?.due_date ?? '',
                      date_finished: node?.date_finished ?? '',
                    })
                    setMetricsModal(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <i className="bx bx-edit-alt" /> Edit Nodes
                </button>

                <button
                  onClick={() => setShowCrew(v => !v)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black shadow-sm transition ${
                    showCrew
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${showCrew ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-slate-400'}`} />
                  {showCrew ? 'Live Map On' : 'Live Map Off'}
                </button>
              </>
            )}

            <button
              onClick={() => navigate(`/${slugify(node?.area?.name ?? String(siteId))}-${siteId}/${slugify(node?.full_label ?? node?.name ?? String(nodeId))}-${nodeId}/spans`)}
              className="inline-flex items-center gap-2 rounded-2xl !bg-zinc-800 px-4 py-2.5 text-sm font-black !text-white shadow-sm transition hover:!bg-zinc-900"
            >
              <i className="bx bx-git-branch" /> Spans
            </button>

            {admin && (
              <button
                onClick={() => {
                  setPoleCode('')
                  setPoleLat('')
                  setPoleLng('')
                  setPoleErr(null)
                  setPoleModal(true)
                }}
                className="inline-flex items-center gap-2 rounded-2xl !bg-[#006241] px-4 py-2.5 text-sm font-black !text-white shadow-md transition hover:!bg-[#004d33]"
              >
                <i className="bx bx-plus" /> Add Pole
              </button>
            )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Poles',    value: stats.total,                        icon: 'bx bx-current-location', top: 'from-emerald-500 to-teal-500'  },
            { label: 'GPS Ready',      value: `${stats.gps}/${stats.total}`,      icon: 'bx bx-map',              top: 'from-teal-500 to-cyan-500'     },
            { label: 'Active Workers', value: crewActive.length,                  icon: 'bx bx-user-check',       top: 'from-green-500 to-emerald-500' },
            { label: 'Cleared',        value: `${stats.cleared}/${stats.total}`,  icon: 'bx bx-check-shield',     top: 'from-lime-500 to-green-500'    },
          ].map(k => (
            <div key={k.label} className="overflow-hidden rounded-[26px] bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
              <div className={`h-1 bg-gradient-to-r ${k.top}`} />
              <div className="flex items-start justify-between p-5">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">{k.label}:</p>
                  <p className="mt-5 text-3xl font-black tracking-tight">{k.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 dark:bg-zinc-800">
                  <i className={`${k.icon} text-xl`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Live Crew Panel ── */}
        {showCrew && <div className="overflow-hidden rounded-[28px] bg-[#030e1a] shadow-sm ring-1 ring-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <p className="text-sm font-black text-white">Live Crew</p>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/70">
                {subconId ? (node?.subcontractor?.name ?? 'Subcon') : 'All'} · polling every 5s
              </span>
              {lastLinemenFetch && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-400">
                  ✓ {new Date(lastLinemenFetch).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <span className="flex items-center gap-1.5 text-green-400">
                <span className="h-2 w-2 rounded-full bg-green-400" />{crewActive.length} Active
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" />{crewIdle.length} Idle
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-500" />{crewAll.filter(l => l.status === 'offline').length} Offline
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px]">
            {/* Map */}
            <div className="relative h-64">
              {crewAll.length === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#030e1a]">
                  <i className="bx bx-user-x text-3xl text-slate-600" />
                  <p className="text-xs font-bold text-slate-500">No crew data available</p>
                </div>
              )}
              <div ref={crewMapRef} className="h-full w-full" />
            </div>

            {/* Worker list */}
            <div className="max-h-64 overflow-y-auto border-t border-white/10 lg:border-l lg:border-t-0">
              {crewAll.length === 0 ? (
                <div className="flex h-full items-center justify-center py-8 text-xs text-slate-500">No workers assigned</div>
              ) : (
                crewAll
                  .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0))
                  .map(l => {
                    const COLOR: Record<string, string> = { active: '#16a34a', idle: '#d97706', offline: '#6b7280' }
                    const LABEL: Record<string, string> = { active: 'Active', idle: 'Idle', offline: 'Offline' }
                    const c = COLOR[l.status] ?? '#6b7280'
                    const mins = l.pingedAt ? Math.floor((Date.now() - new Date(l.pingedAt).getTime()) / 60000) : NaN
                    const ago = isNaN(mins) ? 'unknown' : mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`
                    return (
                      <div key={l.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                          style={{ background: c }}
                        >
                          {l.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-bold text-white">{l.name}</p>
                          <p className="text-[10px] text-slate-400">{l.teamName ?? l.subconName ?? '—'}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black" style={{ color: c }}>{LABEL[l.status]}</span>
                          <p className="text-[9px] text-slate-500">{ago}</p>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>}

        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
          <div className="flex h-full flex-col overflow-hidden rounded-[30px] bg-[#030718] shadow-sm ring-1 ring-slate-900/10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-5 py-5">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-white">Vicinity Map</h2>
                <p className="text-xs font-bold text-indigo-200/70">Poles and status overlay</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                {/* Controls row */}
                <div className="flex items-center gap-2">
                  {/* Tile switcher */}
                  <div className="flex overflow-hidden rounded-xl border border-white/15 text-[10px] font-black">
                    {(Object.keys(TILES) as BaseTile[]).map(k => (
                      <button key={k} onClick={() => setBaseTile(k)}
                        className={`px-3.5 py-2 transition ${
                          baseTile === k
                            ? 'bg-white text-slate-900'
                            : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                        }`}>
                        {TILES[k].label}
                      </button>
                    ))}
                  </div>

                  {admin && mapMode !== 'reassign' && (
                    <>
                      <button onClick={() => setMode(mapMode === 'add' ? 'view' : 'add')}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[10px] font-black transition ${
                          mapMode === 'add'
                            ? 'bg-emerald-500 text-white shadow-[0_4px_14px_-4px_rgba(16,185,129,0.7)]'
                            : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                        }`}>
                        <i className="bx bx-plus text-sm" /> Add Pole
                      </button>
                      <button onClick={() => setMode('reassign')}
                        className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[10px] font-black text-white/70 transition hover:bg-white/20 hover:text-white">
                        <i className="bx bx-move text-sm" /> Reassign GPS
                      </button>
                    </>
                  )}

                  {/* Reassign mode: inline Done/Cancel in header */}
                  {admin && mapMode === 'reassign' && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5">
                      <i className="bx bx-move text-amber-400 text-sm" />
                      <span className="text-[10px] font-black text-amber-300 whitespace-nowrap">
                        {reassignMsg
                          ? reassignMsg.ok
                            ? `✓ ${reassignMsg.code} saved`
                            : `✕ ${reassignMsg.code} failed`
                          : 'Drag poles to move'}
                      </span>
                      <div className="flex items-center gap-1 pl-2 border-l border-amber-500/30">
                        <button onClick={() => setMode('view')}
                          className="rounded-lg px-2 py-1 text-[10px] font-black text-white/50 hover:text-white transition">
                          Cancel
                        </button>
                        <button onClick={async () => {
                            // Clear cache and fetch fresh poles BEFORE switching mode
                            // so the map recreates once with updated positions
                            cacheDel(`nodepoles_${nodeId}`)
                            const [nr, pr] = await Promise.all([
                              fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: h() }),
                              fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: h() }),
                            ])
                            const [nd, pd] = await Promise.all([nr.json(), pr.json()])
                            const newNode = nd?.data ?? nd
                            const newPoles = parsePoles(pd)
                            setNode(newNode)
                            setPoles(newPoles)
                            cacheSet(`nodepoles_${nodeId}`, { node: newNode, poles: newPoles })
                            setLastSynced(Date.now())
                            setMode('view')  // exit reassign AFTER poles are updated
                          }}
                          className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-[10px] font-black text-white transition hover:bg-amber-400">
                          <i className="bx bx-check text-sm" /> Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 text-[10px] font-black text-white/80">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Cleared</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />Active</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending</span>
                </div>
              </div>
            </div>

            <div className="relative min-h-[550px] flex-1">
              {stats.gps === 0 && (
                <div className="absolute inset-0 z-[401] flex items-center justify-center bg-[#030718]">
                  <div className="rounded-[24px] border border-white/15 bg-white/10 px-6 py-5 text-center text-white backdrop-blur">
                    <i className="bx bx-map-pin text-4xl text-emerald-400" />
                    <p className="mt-2 text-sm font-black">No GPS coordinates yet</p>
                    <p className="mt-1 text-xs text-white/55">Add latitude and longitude to poles to show the map.</p>
                  </div>
                </div>
              )}

              {admin && mapMode === 'add' && (
                <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-900/70 px-3 py-1.5 backdrop-blur-sm">
                  <i className="bx bx-crosshair text-emerald-400 text-sm" />
                  <span className="text-[10px] font-black text-emerald-300">Click anywhere to add a pole</span>
                </div>
              )}
              {reassignMsg && (
                <div className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-1.5 rounded-full border px-3 py-1.5 backdrop-blur-sm ${
                  reassignMsg.ok
                    ? 'border-emerald-400/40 bg-emerald-900/70'
                    : 'border-rose-400/40 bg-rose-900/70'
                }`}>
                  <i className={`bx ${reassignMsg.ok ? 'bx-check text-emerald-400' : 'bx-x text-rose-400'} text-sm`} />
                  <span className={`text-[10px] font-black ${reassignMsg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {reassignMsg.ok ? `${reassignMsg.code} GPS updated` : `${reassignMsg.code} failed to save`}
                  </span>
                </div>
              )}

              <div ref={mapRef} className="absolute inset-0 bg-[#030718]" />
            </div>
          </div>

          <div className="flex h-full flex-col gap-5 rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800 xl:min-h-[650px]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Work Summary</h2>
                <p className="text-[11px] font-semibold text-slate-400">Operational snapshot</p>
              </div>
            </div>

            {/* Progress bars */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {([
                ['GPS Completion', stats.gpsPct, 'bg-emerald-500'],
                ['Pole Clearing', stats.clearPct, 'bg-indigo-500'],
                ...(stats.progressPct != null ? [['Overall Progress', stats.progressPct, 'bg-violet-500']] : []),
              ] as [string, number, string][]).map(([label, value, bar]) => (
                <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-zinc-950">
                  <div className="mb-2 flex min-h-8 items-start justify-between gap-3 text-[10px] font-black uppercase tracking-wide">
                    <span className="leading-4 text-slate-400">{label}</span>
                    <span className="shrink-0 text-sm leading-4 text-slate-800 dark:text-slate-100">
                      {label === 'Overall Progress' ? Number(value).toFixed(2) : Number(value).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                    <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-800" />

            {/* Info grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[0.85fr_0.85fr_0.85fr_1.45fr]">
              {[
                { label: 'Est. Cable',   value: `${Number(stats.cable ?? 0).toFixed(0)}m`,                                                     icon: 'bx bx-plug',          color: 'text-emerald-600' },
                { label: 'Actual Cable', value: stats.actCable != null ? `${Number(stats.actCable).toFixed(0)}m` : '—',                          icon: 'bx bx-plug',          color: 'text-teal-600'    },
                { label: 'Status',       value: currentNodeStatus.label,                                                                          icon: 'bx bx-loader-circle', color: 'text-amber-600'   },
                { label: 'Subcon / Team',value: `${node?.subcontractor?.name ?? '—'}${node?.team ? ` / ${node.team.name}` : ''}`,               icon: 'bx bx-group',         color: 'text-slate-700 dark:text-slate-200' },
              ].map((k, i) => (
                <div key={i} className="flex min-h-[88px] items-center gap-3 rounded-2xl bg-slate-50 px-3.5 py-3 dark:bg-zinc-950">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm dark:bg-zinc-800">
                    <i className={`${k.icon} text-sm`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{k.label}</p>
                    <p className={`mt-1 break-words text-[12px] font-black leading-4 ${k.color}`}>{k.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-slate-100 dark:bg-zinc-800" />

            {/* Date cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Date Started', value: node?.date_start,    icon: 'bx bx-calendar-play',  color: 'text-indigo-600 dark:text-indigo-400' },
                { label: 'Due Date',     value: node?.due_date,      icon: 'bx bx-calendar-event', color: 'text-amber-600 dark:text-amber-400'   },
                { label: 'Date Finished',value: node?.date_finished, icon: 'bx bx-calendar-check', color: 'text-emerald-600 dark:text-emerald-400' },
              ].map((d, i) => (
                <div key={i} className="min-h-[86px] rounded-2xl bg-slate-50 px-4 py-3 dark:bg-zinc-950">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    <i className={`${d.icon} text-xs`} />{d.label}
                  </div>
                  <p className={`mt-1.5 text-[12px] font-black ${d.color}`}>
                    {d.value ? fmtDate(d.value) : <span className="text-slate-300 dark:text-zinc-600">—</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {materialKpis.map((k, i) => (
          <div key={i} className="relative overflow-hidden rounded-[18px] bg-white px-3 py-3.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
            <div className={`absolute inset-x-0 top-0 h-0.75 bg-gradient-to-r ${k.top}`} />
            <p className="truncate text-[9px] font-black uppercase tracking-widest text-slate-400">{k.label}</p>
            <div className="mt-1.5">
              <span className="text-xl font-black text-slate-800 dark:text-white">{k.value}</span>
            </div>
            <p className="mt-1 text-[11px] font-bold text-[#006241] dark:text-emerald-400">{k.helper}</p>
            <div className="mt-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-zinc-800">
              <i className={`${k.icon} text-sm`} />
            </div>
          </div>
        ))}
      </div>


        <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
            <p className="text-sm font-black text-slate-700 dark:text-slate-200">Poles ({poles.length})</p>

            <div className="relative w-full sm:w-72">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search poles..."
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
            </div>
          </div>

          {(
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950">
                    {['Seq', 'Pole Code', 'GPS', 'Status', 'Actions'].map(x => (
                      <th key={x} className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredPoles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                        <i className="bx bx-map-pin mb-2 block text-3xl" />
                        {search ? 'No poles match your search.' : 'No poles yet. Add one to get started.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPoles.map(p => {
                      const cfg = POLE_CFG[p.skycable_status] ?? POLE_CFG.pending

                      return (
                        <tr
                          key={p.id}
                          className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
                        >
                          <td className="px-5 py-3">
                            <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-black dark:bg-zinc-800">
                              {p.sequence ?? '—'}
                            </span>
                          </td>

                          <td className="px-5 py-3">
                            <span className="font-mono font-black text-emerald-600">{p.pole_code}</span>
                            {p.barangay && <p className="mt-0.5 text-[11px] text-slate-400">{p.barangay.name}</p>}
                          </td>

                          <td className="px-5 py-3">
                            {p.lat && p.lng ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                <i className="bx bx-map-pin" /> GPS Ready
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-300">No GPS</span>
                            )}
                          </td>

                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Pill cfg={cfg} dot={cfg.dot} />
                              {beforePhotoMap[p.pole_db_id] && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600 border border-red-200">
                                  📷 Before ✓
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1">
                              {admin && (
                                <button
                                  onClick={() => {
                                    setEditingPole(p)
                                    setEditPoleCode(p.pole_code)
                                    setEditPoleLat(p.lat ?? '')
                                    setEditPoleLng(p.lng ?? '')
                                    setEditPoleStatus(p.skycable_status ?? 'pending')
                                    setEditPoleErr(null)
                                    setBeforeImageRecord(null)
                                    setEditPoleModal(true)
                                    // Routes are at /api/v1/teardown/ (no /skycable prefix)
                                    const TD_API = `${API_BASE}/api/v1`
                                    fetch(`${TD_API}/teardown/node-images/${nodeId}?inventory_type=skycable&image_type=before&pole_id=${p.pole_db_id}`, { headers: h() })
                                      .then(r => r.ok ? r.json() : null)
                                      .then(d => {
                                        const imgs = Array.isArray(d?.data) ? d.data : []
                                        // Match by pole_db_id or pivot id as fallback
                                        const toUrl = (img: any) => img.file_path ? `${API_BASE}/api/v1/files/${img.file_path}` : (img.image_url ?? '')
                                        const before = imgs.find((i: any) => i.image_type === 'before' && (i.pole_id === p.pole_db_id || i.pole_id === p.id))
                                        if (before) { setBeforeImageRecord({ id: before.id, locked: !!before.locked, image_url: toUrl(before) }); return }
                                        // Fallback: all node images, match any before photo for this pole
                                        return fetch(`${TD_API}/teardown/node-images/${nodeId}?inventory_type=skycable`, { headers: h() })
                                          .then(r => r.ok ? r.json() : null)
                                          .then(d2 => {
                                            const all = Array.isArray(d2?.data) ? d2.data : []
                                            const b2 = all.find((i: any) => i.image_type === 'before' && (i.pole_id === p.pole_db_id || i.pole_id === p.id))
                                            if (b2) setBeforeImageRecord({ id: b2.id, locked: !!b2.locked, image_url: toUrl(b2) })
                                          })
                                      })
                                      .catch(() => {})
                                  }}
                                  title="Edit pole"
                                  className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                                >
                                  <i className="bx bx-pencil text-sm" />
                                </button>
                              )}

                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {false && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950">
                    {['Span Code', 'From → To', 'Strand', 'Runs', 'Exp. Cable', 'Actual', 'Status', 'Actions'].map(x => (
                      <th key={x} className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredSpans.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                        <i className="bx bx-git-branch mb-2 block text-3xl" />
                        {search ? 'No spans match your search.' : 'No spans yet. Declare one above.'}
                      </td>
                    </tr>
                  ) : (
                    filteredSpans.map(s => {
                      const cfg = SPAN_CFG[s.status] ?? SPAN_CFG.pending
                      const expCable = (Number(s.strand_length ?? 0) * Number(s.number_of_runs ?? 1)).toFixed(1)
                      const fromCode = s.from_pole?.pole?.pole_code ?? '?'
                      const toCode = s.to_pole?.pole?.pole_code ?? '?'

                      return (
                        <tr
                          key={s.id}
                          className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
                        >
                          <td className="px-5 py-3">
                            <span className="font-mono text-xs font-black text-emerald-600">{s.span_code ?? `#${s.id}`}</span>
                          </td>

                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-black text-emerald-700">
                                {fromCode}
                              </span>
                              <i className="bx bx-right-arrow-alt text-slate-300" />
                              <span className="rounded-lg bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-black text-teal-700">
                                {toCode}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3 font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                            {s.strand_length != null ? `${s.strand_length}m` : '—'}
                          </td>

                          <td className="px-5 py-3 font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                            {s.number_of_runs ?? '—'}
                          </td>

                          <td className="px-5 py-3 font-black tabular-nums">
                            {s.strand_length && s.number_of_runs ? `${expCable}m` : '—'}
                          </td>

                          <td className="px-5 py-3">
                            {s.actual_cable != null ? (
                              <span className="font-black text-emerald-600">{s.actual_cable}m</span>
                            ) : (
                              <span className="font-semibold text-slate-300">—</span>
                            )}
                          </td>

                          <td className="px-5 py-3">
                            <Pill cfg={cfg} />
                          </td>

                          <td className="px-5 py-3">
                            {admin && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditSpan(s)
                                    setSpanForm({
                                      from_pole_id: String(s.from_pole?.id ?? ''),
                                      to_pole_id: String(s.to_pole?.id ?? ''),
                                      span_code: s.span_code ?? '',
                                      strand_length: String(s.strand_length ?? ''),
                                      number_of_runs: String(s.number_of_runs ?? 1),
                                      nodes_count: String(s.summary?.expected_node ?? 0),
                                      amplifier: String(s.summary?.expected_amplifier ?? 0),
                                      extender: String(s.summary?.expected_extender ?? 0),
                                      tsc: String(s.summary?.expected_tsc ?? 0),
                                      powersupply: String(s.summary?.expected_powersupply ?? 0),
                                      ps_housing: String(s.summary?.expected_ps_housing ?? 0),
                                    })
                                    setSpanErr(null)
                                    setSpanModal(true)
                                  }}
                                  title="Edit"
                                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
                                >
                                  <i className="bx bx-pencil text-xs" />
                                </button>

                                <button
                                  onClick={() => setDelSpan(s)}
                                  title="Delete"
                                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
                                >
                                  <i className="bx bx-trash text-xs" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {false && (
          <Modal
            title="Declare New Span"
            sub="Connect two poles with a cable span"
            color="from-emerald-600 to-teal-600"
            icon="bx bx-git-branch"
            onClose={() => {}}
            footer={
              <>
                <CancelBtn onClick={() => setSpanModal(false)} />
                <button
                  onClick={saveSpan}
                  disabled={savingSpan}
                  className="h-10 flex-1 rounded-2xl bg-emerald-600 px-6 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingSpan ? 'Saving…' : editSpan ? 'Update Span' : 'Declare Span'}
                </button>
              </>
            }
          >
            {spanErr && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
                {spanErr}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {(['from_pole_id', 'to_pole_id'] as const).map(key => (
                <div key={key}>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {key === 'from_pole_id' ? 'From Pole *:' : 'To Pole *:'}
                  </label>

                  <select
                    value={spanForm[key]}
                    onChange={e => setSpanForm(f => ({ ...f, [key]: e.target.value }))}
                    className={`${iCls()} cursor-pointer focus:border-emerald-500`}
                  >
                    <option value="">— Select —</option>
                    {poles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.pole_code}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Span Code:</label>
              <input
                value={spanForm.span_code}
                onChange={e => setSpanForm(f => ({ ...f, span_code: e.target.value }))}
                placeholder="e.g. SP-001"
                className={`${iCls()} focus:border-emerald-500`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Strand Length (m):
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={spanForm.strand_length}
                  onChange={e => setSpanForm(f => ({ ...f, strand_length: e.target.value }))}
                  className={`${iCls()} focus:border-emerald-500`}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  No. of Runs:
                </label>
                <input
                  type="number"
                  min="1"
                  value={spanForm.number_of_runs}
                  onChange={e => setSpanForm(f => ({ ...f, number_of_runs: e.target.value }))}
                  className={`${iCls()} focus:border-emerald-500`}
                />
              </div>
            </div>

            {spanCable && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">Expected Cable:</span>
                <span className="text-lg font-black text-emerald-700">{spanCable}m</span>
              </div>
            )}

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Expected Collectibles:</p>
              <div className="grid grid-cols-3 gap-2">
                {(['nodes_count', 'amplifier', 'extender', 'tsc', 'powersupply', 'ps_housing'] as const).map(k => (
                  <div key={k}>
                    <label className="mb-1 block text-center text-[10px] font-semibold capitalize text-slate-400 truncate">
                      {k === 'nodes_count' ? 'Nodes:' :
                        k === 'tsc' ? 'TSC:' :
                          k === 'powersupply' ? 'PSU:' :
                            k === 'ps_housing' ? 'PS Case:' :
                              k.charAt(0).toUpperCase() + k.slice(1) + ':'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={spanForm[k]}
                      onChange={e => setSpanForm(f => ({ ...f, [k]: e.target.value }))}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {poleModal && (
          <Modal
            title="Add New Pole"
            sub={`Node: ${nodeLabel}`}
            color="from-[#006241] to-teal-700"
            icon="bx bx-map-pin"
            size="max-w-2xl"
            onClose={() => setPoleModal(false)}
            footer={
              <>
                <CancelBtn onClick={() => setPoleModal(false)} />
                <button
                  onClick={savePole}
                  disabled={savingPole}
                  className="h-10 flex-1 rounded-2xl !bg-[#006241] px-6 text-sm font-black !text-white shadow-lg shadow-[#006241]/20 transition hover:!bg-[#004d33] disabled:opacity-50"
                >
                  {savingPole ? 'Adding…' : 'Add Pole'}
                </button>
              </>
            }
          >
            {poleErr && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
                {poleErr}
              </div>
            )}

            {/* Pole code */}
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Pole Code *</label>
              <input
                autoFocus
                value={poleCode}
                onChange={e => setPoleCode(e.target.value)}
                placeholder="e.g. POLE-001"
                className={`${iCls()} focus:border-emerald-500`}
              />
            </div>

            {/* Map with tile switcher */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <i className="bx bx-map-pin text-emerald-500" />
                  {poleLat && poleLng
                    ? `📍 ${Number(poleLat).toFixed(5)}, ${Number(poleLng).toFixed(5)}`
                    : 'Click map to pin location (optional)'}
                </label>
                {/* Tile switcher */}
                <div className="flex overflow-hidden rounded-lg border border-slate-200 text-[10px] font-bold dark:border-zinc-700">
                  {(Object.keys(TILES) as BaseTile[]).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAddMapTile(k)}
                      className={`px-2.5 py-1 transition ${addMapTile === k ? 'bg-[#006241] text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-zinc-800 dark:text-zinc-400'}`}
                    >
                      {TILES[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                ref={addMapRef}
                className="h-64 w-full rounded-2xl border border-slate-200 dark:border-zinc-700"
                style={{ zIndex: 0, minHeight: 256, cursor: 'crosshair' }}
              />
            </div>

            {/* Manual lat/lng inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={poleLat}
                  onChange={e => {
                    setPoleLat(e.target.value)
                    const la = parseFloat(e.target.value)
                    const ln = parseFloat(poleLng)
                    if (addMapObj.current && !isNaN(la) && !isNaN(ln)) {
                      const ll = L.latLng(la, ln)
                      if (addMapMarker.current) addMapMarker.current.setLatLng(ll)
                      addMapObj.current.setView(ll, addMapObj.current.getZoom())
                    }
                  }}
                  placeholder="14.xxxx"
                  className={`${iCls()} focus:border-emerald-500`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={poleLng}
                  onChange={e => {
                    setPoleLng(e.target.value)
                    const la = parseFloat(poleLat)
                    const ln = parseFloat(e.target.value)
                    if (addMapObj.current && !isNaN(la) && !isNaN(ln)) {
                      const ll = L.latLng(la, ln)
                      if (addMapMarker.current) addMapMarker.current.setLatLng(ll)
                      addMapObj.current.setView(ll, addMapObj.current.getZoom())
                    }
                  }}
                  placeholder="121.xxxx"
                  className={`${iCls()} focus:border-emerald-500`}
                />
              </div>
            </div>
          </Modal>
        )}

        {editPoleModal && editingPole && (
          <Modal
            title="Edit Pole"
            sub={editingPole.pole_code}
            color="from-emerald-600 to-teal-600"
            icon="bx bx-pencil"
            size="max-w-2xl"
            onClose={() => setEditPoleModal(false)}
            footer={
              <>
                <CancelBtn onClick={() => setEditPoleModal(false)} />
                <button
                  onClick={saveEditPole}
                  disabled={savingEditPole}
                  className="h-10 flex-1 rounded-2xl !bg-[#006241] px-6 text-sm font-black !text-white shadow-lg shadow-[#006241]/20 transition hover:!bg-[#004d33] disabled:opacity-50"
                >
                  {savingEditPole ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            }
          >
            {editPoleErr && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
                {editPoleErr}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Pole Code:</label>
                <input value={editPoleCode} onChange={e => setEditPoleCode(e.target.value)} className={`${iCls()} focus:border-emerald-500`} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Status:</label>
                <select
                  value={editPoleStatus}
                  onChange={e => setEditPoleStatus(e.target.value as 'pending' | 'in_progress' | 'cleared')}
                  className={`${iCls()} cursor-pointer focus:border-emerald-500`}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">Ongoing</option>
                  <option value="cleared">Cleared</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Latitude:</label>
                <input
                  type="number"
                  step="any"
                  value={editPoleLat}
                  onChange={e => setEditPoleLat(e.target.value)}
                  placeholder="14.xxxx"
                  className={`${iCls()} focus:border-emerald-500`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Longitude:</label>
                <input
                  type="number"
                  step="any"
                  value={editPoleLng}
                  onChange={e => setEditPoleLng(e.target.value)}
                  placeholder="121.xxxx"
                  className={`${iCls()} focus:border-emerald-500`}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <i className="bx bx-map-pin text-emerald-500" /> Click map to pin GPS location
              </label>
              <div ref={editMapRef} className="h-52 w-full rounded-2xl border border-slate-200 dark:border-zinc-700" style={{ zIndex: 0, minHeight: '208px' }} />
              {editPoleLat && editPoleLng && (
                <p className="mt-1.5 text-[11px] font-semibold text-emerald-600">
                  📍 {Number(editPoleLat).toFixed(6)}, {Number(editPoleLng).toFixed(6)}
                </p>
              )}
            </div>

            {/* Before Photo Lock Control */}
            {beforeImageRecord && (
              <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                beforeImageRecord.locked
                  ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  {beforeImageRecord.image_url && (
                    <img
                      src={beforeImageRecord.image_url}
                      alt="Before"
                      className="h-12 w-12 rounded-xl object-cover shrink-0 border border-black/10"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Before Photo
                    </p>
                    <p className={`text-[11px] font-bold mt-0.5 ${beforeImageRecord.locked ? 'text-red-600' : 'text-emerald-600'}`}>
                      {beforeImageRecord.locked ? '🔒 Locked — lineman cannot retake' : '🔓 Unlocked — lineman can retake'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!beforeImageRecord || togglingLock) return
                    setTogglingLock(true)
                    const endpoint = beforeImageRecord.locked ? 'unlock' : 'lock'
                    try {
                      const res = await fetch(`${API_BASE}/api/v1/teardown/images/${beforeImageRecord.id}/${endpoint}`, {
                        method: 'PATCH',
                        headers: h(),
                      })
                      if (res.ok) {
                        setBeforeImageRecord(prev => prev ? { ...prev, locked: !prev.locked } : null)
                      }
                    } catch {}
                    setTogglingLock(false)
                  }}
                  disabled={togglingLock}
                  className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black transition disabled:opacity-50 ${
                    beforeImageRecord.locked
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {togglingLock ? '…' : beforeImageRecord.locked ? 'Allow Retake' : 'Lock Again'}
                </button>
              </div>
            )}
          </Modal>
        )}

        {metricsModal && (
          <Modal
            title="Edit Node"
            sub="Update metrics, cable targets and schedule dates"
            color="from-emerald-600 to-teal-600"
            icon="bx bx-edit-alt"
            size="max-w-2xl"
            onClose={() => setMetricsModal(false)}
            footer={
              <div className="flex gap-3 w-full">
                <button type="button" onClick={() => setMetricsModal(false)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  Cancel
                </button>
                <button type="button" onClick={saveMetrics} disabled={savingMetrics}
                  className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50">
                  {savingMetrics ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            }
          >
            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Target (Expected)</p>
                {[
                  { label: 'Node Box',     key: 'expected_nodes' },
                  { label: 'Amplifier',    key: 'expected_amplifier' },
                  { label: 'Extender',     key: 'expected_extender' },
                  { label: 'TSC',          key: 'expected_tsc' },
                  { label: 'Power Supply', key: 'expected_powersupply' },
                  { label: 'PS Case',      key: 'expected_ps_housing' },
                  { label: 'Cable (m)',    key: 'expected_cable' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">{f.label}:</label>
                    <input type="number" value={metricsData[f.key as keyof typeof metricsData] as number}
                      onChange={e => setMetricsData(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                      className={iCls()} />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Collected (Actual)</p>
                {[
                  { label: 'Node Box',     key: 'actual_node' },
                  { label: 'Amplifier',    key: 'actual_amplifier' },
                  { label: 'Extender',     key: 'actual_extender' },
                  { label: 'TSC',          key: 'actual_tsc' },
                  { label: 'Power Supply', key: 'actual_powersupply' },
                  { label: 'PS Case',      key: 'actual_ps_housing' },
                  { label: 'Cable (m)',    key: 'actual_cable' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">{f.label}:</label>
                    <input type="number" value={metricsData[f.key as keyof typeof metricsData] as number}
                      onChange={e => setMetricsData(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                      className={iCls()} />
                  </div>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-zinc-800">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule Dates</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Date Started', key: 'date_start' },
                  { label: 'Due Date',     key: 'due_date' },
                  { label: 'Date Finished',key: 'date_finished' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">{f.label}:</label>
                    <input type="datetime-local"
                      value={(metricsData[f.key as keyof typeof metricsData] as string) ?? ''}
                      onChange={e => setMetricsData(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className={iCls()} />
                  </div>
                ))}
              </div>
            </div>

          </Modal>
        )}

      </div>
  )
}
