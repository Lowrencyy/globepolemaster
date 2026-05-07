import { useEffect, useRef, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { isAdmin, getToken, GLOBE_API } from '../../lib/auth'

// ── API types ─────────────────────────────────────────────────────────────────
type NapStatus = 'active' | 'inactive' | 'for_removal'
type PortCount = '8' | '12' | '16' | '32'

type NapBarangay = { code: string; name: string; city_code: string }
type NapPole = { id: number; pole_code: string; barangay_code: string; lat: string; lng: string; globe_status: string | null; barangay: NapBarangay }
type NapPort  = { id: number; nap_box_id: number; port_number: number; status: 'active' | 'inactive' | 'free'; subscriber_name: string | null; account_number: string | null }
type NapBox   = { id: number; pole_id: number; nap_code: string; port_count: PortCount; status: NapStatus; deleted_at: string | null; created_at: string; updated_at: string; pole?: NapPole; ports?: NapPort[] }

type ApiMeta = { current_page: number; last_page: number; per_page: number; total: number }
type NapBoxListResponse = { data: NapBox[]; last_page: number; current_page: number; total: number; meta?: ApiMeta }

// ── Slot / fiber panel ────────────────────────────────────────────────────────
type SlotStatus = 'occupied' | 'available' | 'reserved'

const SLOT_COLOR: Record<SlotStatus, { body: string; ferrule: string; glow: string; label: string; pill: string }> = {
  occupied: { body: '#dc2626', ferrule: '#fee2e2', glow: '0 0 8px 3px #dc262688', label: 'Active',   pill: 'bg-red-100 text-red-700 ring-red-200' },
  reserved: { body: '#d97706', ferrule: '#fef3c7', glow: '0 0 8px 3px #d9770688', label: 'Inactive', pill: 'bg-amber-100 text-amber-700 ring-amber-200' },
  available:{ body: '#16a34a', ferrule: '#bbf7d0', glow: '0 0 8px 3px #16a34a88', label: 'Free',     pill: 'bg-green-100 text-green-700 ring-green-200' },
}

const PORT_TO_SLOT: Record<'active' | 'inactive' | 'free', SlotStatus> = {
  active: 'occupied', inactive: 'reserved', free: 'available',
}

const BOX_STATUS_COLOR: Record<NapStatus, { label: string; bg: string; text: string }> = {
  active:      { label: 'Active',      bg: '#16a34a20', text: '#4ade80' },
  inactive:    { label: 'Inactive',    bg: '#64748b20', text: '#94a3b8' },
  for_removal: { label: 'For Removal', bg: '#dc262620', text: '#f87171' },
}

interface FiberSlot { number: number; status: SlotStatus; subscriberName?: string }

function FiberPort({ slot, hovered, onHover }: { slot: FiberSlot; hovered: FiberSlot | null; onHover: (s: FiberSlot | null) => void }) {
  const cfg = SLOT_COLOR[slot.status]
  const isHov = hovered?.number === slot.number
  return (
    <div
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      style={{
        width: 36, height: 36, background: '#111', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: isHov ? `inset 0 0 0 1.5px #ffffff50, ${cfg.glow}` : 'inset 0 0 0 1px #ffffff10',
        transition: 'box-shadow 0.12s', cursor: 'default', position: 'relative',
      }}
    >
      <div style={{ width: 26, height: 26, background: '#060606', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9)' }}>
        <div style={{ width: 18, height: 18, background: cfg.body, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: cfg.glow }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.ferrule }} />
        </div>
      </div>
      <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#ffffff40', fontFamily: 'monospace' }}>{slot.number}</span>
    </div>
  )
}

function NapPanelCard({ box, onEdit, onDelete, admin }: { box: NapBox; onEdit: (b: NapBox) => void; onDelete: (b: NapBox) => void; admin: boolean }) {
  const [hovered, setHovered] = useState<FiberSlot | null>(null)
  const navigate = useNavigate()

  const total = parseInt(box.port_count)
  const cols  = Math.ceil(total / 2)

  const slots: FiberSlot[] = useMemo(() => Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const port = box.ports?.find(p => p.port_number === n)
    return { number: n, status: port ? PORT_TO_SLOT[port.status] : 'available', subscriberName: port?.subscriber_name ?? undefined }
  }), [box.ports, total])

  const row1 = slots.slice(0, cols)
  const row2 = slots.slice(cols)

  const counts = useMemo(() => ({
    occupied:  slots.filter(s => s.status === 'occupied').length,
    reserved:  slots.filter(s => s.status === 'reserved').length,
    available: slots.filter(s => s.status === 'available').length,
  }), [slots])

  const utilPct = Math.round(((counts.occupied + counts.reserved) / total) * 100)
  const sc = BOX_STATUS_COLOR[box.status]
  const barangay = box.pole?.barangay?.name ?? ''
  const poleCode = box.pole?.pole_code ?? String(box.pole_id)

  return (
    <div className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden hover:ring-violet-400 dark:hover:ring-violet-500 transition-shadow hover:shadow-lg hover:shadow-violet-500/10">

      {/* Card header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 dark:from-zinc-900 dark:to-zinc-800 px-5 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/nap/boxes/${box.id}`)}
              className="font-mono text-sm font-bold text-white hover:text-violet-300 transition underline-offset-2 hover:underline"
            >
              {box.nap_code}
            </button>
          </div>
          <p className="text-white/50 text-[11px] mt-0.5">
            <i className="mdi mdi-map-marker mr-1" />{barangay || '—'} · Pole: {poleCode}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">{box.port_count}-port</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: sc.bg, color: sc.text }}>
            {sc.label}
          </span>
          {admin && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={e => { e.stopPropagation(); onEdit(box) }}
                className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white transition"
                title="Edit"
              >
                <i className="bx bx-edit text-sm" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(box) }}
                className="rounded-lg p-1 text-white/40 hover:bg-red-500/20 hover:text-red-400 transition"
                title="Delete"
              >
                <i className="bx bx-trash text-sm" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Physical fiber panel */}
        <div
          onClick={() => navigate(`/nap/boxes/${box.id}`)}
          style={{ background: 'linear-gradient(180deg,#222 0%,#161616 100%)', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)', cursor: 'pointer' }}
        >
          <div style={{ height: 3, background: '#2a2a2a', borderRadius: 2, marginBottom: 8 }} />
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 justify-center flex-wrap">
              {row1.map(s => <FiberPort key={s.number} slot={s} hovered={hovered} onHover={setHovered} />)}
            </div>
            {row2.length > 0 && (
              <div className="flex gap-1.5 justify-center flex-wrap">
                {row2.map(s => <FiberPort key={s.number} slot={s} hovered={hovered} onHover={setHovered} />)}
              </div>
            )}
          </div>
          <div style={{ height: 3, background: '#2a2a2a', borderRadius: 2, marginTop: 8, marginBottom: 4 }} />
          <div className="flex justify-between px-0.5">
            <span style={{ fontSize: 8, color: '#ffffff25', fontFamily: 'monospace', letterSpacing: 1 }}>{box.nap_code} · SC/APC</span>
            <span style={{ fontSize: 8, color: '#ffffff25', fontFamily: 'monospace' }}>GLOBE</span>
          </div>
        </div>

        {/* Hover tooltip */}
        <div className="h-6 flex items-center">
          {hovered ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${SLOT_COLOR[hovered.status].pill}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SLOT_COLOR[hovered.status].body }} />
              Slot #{hovered.number} — {SLOT_COLOR[hovered.status].label}
              {hovered.subscriberName && <span className="opacity-60 ml-1">{hovered.subscriberName}</span>}
            </span>
          ) : (
            <span className="text-[11px] text-slate-300 dark:text-zinc-600 italic">Hover a port to inspect</span>
          )}
        </div>

        {/* Utilization bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Utilization</span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{counts.occupied + counts.reserved}/{total} ({utilPct}%)</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden flex">
            {counts.occupied > 0 && <div className="h-full" style={{ width: `${(counts.occupied / total) * 100}%`, background: '#dc2626' }} />}
            {counts.reserved > 0 && <div className="h-full" style={{ width: `${(counts.reserved / total) * 100}%`, background: '#d97706' }} />}
          </div>
        </div>

        {/* Slot counts */}
        <div className="flex flex-wrap gap-1.5">
          {(['occupied', 'reserved', 'available'] as SlotStatus[]).map(k => (
            <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SLOT_COLOR[k].pill}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SLOT_COLOR[k].body }} />
              {counts[k]} {SLOT_COLOR[k].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const iCls = 'h-[42px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-700/60 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:bg-zinc-700 dark:focus:ring-violet-500/10'
const sCls = `${iCls} appearance-none pr-10 cursor-pointer`
const lCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'
const primaryBtnCls   = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]'
const secondaryBtnCls = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
const dangerBtnCls    = 'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-700 active:scale-[0.99]'

type FormData = { nap_code: string; pole_id: string; port_count: PortCount; status: NapStatus; lat: string; lng: string }
const emptyForm = (): FormData => ({ nap_code: '', pole_id: '', port_count: '16', status: 'active', lat: '', lng: '' })

function Chevron() {
  return <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
}

// ── GPS Map Picker ─────────────────────────────────────────────────────────────
function GpsMapPicker({ lat, lng, onChange }: { lat: string; lng: string; onChange: (lat: string, lng: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapObj       = useRef<L.Map | null>(null)
  const markerRef    = useRef<L.Marker | null>(null)
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [showMap, setShowMap]   = useState(false)

  const numLat = parseFloat(lat)
  const numLng = parseFloat(lng)
  const hasCoords = lat !== '' && lng !== '' && !isNaN(numLat) && !isNaN(numLng)

  useEffect(() => {
    if (!showMap || !containerRef.current || mapObj.current) return
    const center: [number, number] = hasCoords ? [numLat, numLng] : [14.5995, 120.9842]
    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 17)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
    }).addTo(map)
    const icon = L.divIcon({
      html: '<div style="width:18px;height:18px;border-radius:50%;background:#7c3aed;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>',
      className: '', iconSize: [18, 18], iconAnchor: [9, 9],
    })
    const marker = L.marker(center, { draggable: true, icon }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      onChange(p.lat.toFixed(7), p.lng.toFixed(7))
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      onChange(e.latlng.lat.toFixed(7), e.latlng.lng.toFixed(7))
    })
    mapObj.current   = map
    markerRef.current = marker
    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapObj.current = null; markerRef.current = null }
  }, [showMap])

  useEffect(() => {
    if (!mapObj.current || !markerRef.current || !hasCoords) return
    markerRef.current.setLatLng([numLat, numLng])
    mapObj.current.setView([numLat, numLng], mapObj.current.getZoom())
  }, [lat, lng])

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return }
    setLocating(true); setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        onChange(pos.coords.latitude.toFixed(7), pos.coords.longitude.toFixed(7))
        setLocating(false)
        setShowMap(true)
      },
      err => { setGpsError(err.message); setLocating(false) },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={lCls}>GPS Location</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={captureGps}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
        >
          {locating
            ? <><i className="bx bx-loader-alt animate-spin text-sm" /> Locating…</>
            : <><i className="bx bx-current-location text-sm" /> Capture GPS</>}
        </button>
        {hasCoords && (
          <button
            type="button"
            onClick={() => setShowMap(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <i className={`bx ${showMap ? 'bx-hide' : 'bx-map'} text-sm`} />
            {showMap ? 'Hide Map' : 'View Map'}
          </button>
        )}
        {hasCoords && (
          <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 truncate">
            {parseFloat(lat).toFixed(5)}, {parseFloat(lng).toFixed(5)}
          </span>
        )}
      </div>

      {hasCoords && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lCls}>Latitude</label>
            <input value={lat} onChange={e => onChange(e.target.value, lng)} className={iCls} placeholder="14.5995" />
          </div>
          <div>
            <label className={lCls}>Longitude</label>
            <input value={lng} onChange={e => onChange(lat, e.target.value)} className={iCls} placeholder="120.9842" />
          </div>
        </div>
      )}

      {showMap && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-violet-200 shadow-md" style={{ height: 220 }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {gpsError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{gpsError}</p>
      )}
    </div>
  )
}

interface ModalProps { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; danger?: boolean; width?: string }
function Modal({ open, onClose, title, subtitle, children, danger, width = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-zinc-900`}>
        <div className={`rounded-t-3xl px-6 py-5 ${danger ? 'bg-gradient-to-r from-red-600 to-rose-600' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="mt-0.5 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white transition">
              <i className="bx bx-x text-xl leading-none" />
            </button>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

interface NapFormProps { data: FormData; onChange: (d: FormData) => void; onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void; close: () => void; mode: 'add' | 'edit' }
function NapForm({ data, onChange, onSubmit, close, mode }: NapFormProps) {
  const upd = (k: keyof FormData, v: string) => onChange({ ...data, [k]: v })
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lCls}>NAP Code</label>
          <input value={data.nap_code} onChange={e => upd('nap_code', e.target.value)} className={iCls} placeholder="NAP-001" required />
        </div>
        <div>
          <label className={lCls}>Pole ID</label>
          <input type="number" value={data.pole_id} onChange={e => upd('pole_id', e.target.value)} className={iCls} placeholder="Pole ID number" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lCls}>Port Count</label>
          <div className="relative">
            <select value={data.port_count} onChange={e => upd('port_count', e.target.value)} className={sCls} required>
              {(['8', '12', '16', '32'] as PortCount[]).map(p => <option key={p} value={p}>{p} ports</option>)}
            </select>
            <Chevron />
          </div>
        </div>
        <div>
          <label className={lCls}>Status</label>
          <div className="relative">
            <select value={data.status} onChange={e => upd('status', e.target.value)} className={sCls} required>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="for_removal">For Removal</option>
            </select>
            <Chevron />
          </div>
        </div>
      </div>

      {mode === 'add' && (
        <div className="rounded-2xl bg-slate-50 dark:bg-zinc-800/60 p-4 ring-1 ring-slate-100 dark:ring-zinc-700">
          <GpsMapPicker
            lat={data.lat}
            lng={data.lng}
            onChange={(lat, lng) => onChange({ ...data, lat, lng })}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-zinc-700">
        <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
        <button type="submit" className={primaryBtnCls}>{mode === 'add' ? 'Save NAP Box' : 'Update NAP Box'}</button>
      </div>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const statuses: Array<'all' | NapStatus> = ['all', 'active', 'inactive', 'for_removal']

export default function AllNapBoxes() {
  const admin = isAdmin()

  const [boxes, setBoxes]               = useState<NapBox[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | NapStatus>('all')
  const [isAddOpen, setIsAddOpen]       = useState(false)
  const [editBox, setEditBox]           = useState<NapBox | null>(null)
  const [delBox, setDelBox]             = useState<NapBox | null>(null)
  const [formData, setFormData]         = useState<FormData>(emptyForm())
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)

  const authHeaders = (token: string | null) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  })

  const loadBoxes = async () => {
    const token = getToken()
    const headers = { Accept: 'application/json', 'ngrok-skip-browser-warning': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    setLoading(true)
    setError(null)
    try {
      // Load all pages
      let allBoxes: NapBox[] = []
      let page = 1; let lastPage = 1
      do {
        const qs = new URLSearchParams({ page: String(page) })
        if (filterStatus !== 'all') qs.set('status', filterStatus)
        const res  = await fetch(`${GLOBE_API}/poles/0/nap-boxes?${qs}`, { headers })
        const data: NapBoxListResponse = await res.json()
        allBoxes = [...allBoxes, ...data.data]
        lastPage = data.meta?.last_page ?? data.last_page ?? 1
        page++
      } while (page <= lastPage)

      // Load ports for all boxes in parallel
      const portsResults = await Promise.all(
        allBoxes.map(b =>
          fetch(`${GLOBE_API}/nap-boxes/${b.id}/ports`, { headers })
            .then(r => r.json() as Promise<NapPort[]>)
            .catch(() => [] as NapPort[])
        )
      )
      setBoxes(allBoxes.map((b, i) => ({ ...b, ports: portsResults[i] ?? [] })))
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load NAP boxes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBoxes() }, [filterStatus])

  const counts = useMemo(() => ({
    total:       boxes.length,
    active:      boxes.filter(b => b.status === 'active').length,
    inactive:    boxes.filter(b => b.status === 'inactive').length,
    for_removal: boxes.filter(b => b.status === 'for_removal').length,
  }), [boxes])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return boxes
    return boxes.filter(b =>
      b.nap_code.toLowerCase().includes(q) ||
      (b.pole?.pole_code ?? '').toLowerCase().includes(q) ||
      (b.pole?.barangay?.name ?? '').toLowerCase().includes(q)
    )
  }, [boxes, search])

  const close = () => { setIsAddOpen(false); setEditBox(null); setDelBox(null); setSaveError(null) }

  const handleAdd = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const token = getToken()
    setSaving(true); setSaveError(null)
    try {
      const body: Record<string, unknown> = {
        pole_id: Number(formData.pole_id),
        nap_code: formData.nap_code,
        port_count: formData.port_count,
        status: formData.status,
      }
      if (formData.lat && formData.lng) { body.lat = formData.lat; body.lng = formData.lng }
      const res = await fetch(`${GLOBE_API}/nap-boxes`, {
        method: 'POST', headers: authHeaders(token),
        body: JSON.stringify(body),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.message ?? `Server error ${res.status}`) }
      close()
      loadBoxes()
    } catch (err) { setSaveError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleEdit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editBox) return
    const token = getToken()
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch(`${GLOBE_API}/nap-boxes/${editBox.id}`, {
        method: 'PUT', headers: authHeaders(token),
        body: JSON.stringify({ nap_code: formData.nap_code, status: formData.status }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.message ?? `Server error ${res.status}`) }
      const updated: NapBox = await res.json()
      setBoxes(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated, pole: b.pole, ports: b.ports } : b))
      close()
    } catch (err) { setSaveError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleDel = async () => {
    if (!delBox) return
    const token = getToken()
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch(`${GLOBE_API}/nap-boxes/${delBox.id}`, {
        method: 'PUT', headers: authHeaders(token),
        body: JSON.stringify({ status: 'for_removal' }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.message ?? `Server error ${res.status}`) }
      setBoxes(prev => prev.map(b => b.id === delBox.id ? { ...b, status: 'for_removal' } : b))
      close()
    } catch (err) { setSaveError((err as Error).message) }
    finally { setSaving(false) }
  }

  const statCards = [
    { label: 'Total NAP Boxes', key: 'total',       icon: 'bx bx-server',       accent: 'from-sky-500 to-blue-500',     ring: 'ring-sky-200 dark:ring-sky-500/20' },
    { label: 'Active',          key: 'active',       icon: 'bx bx-check-circle', accent: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
    { label: 'Inactive',        key: 'inactive',     icon: 'bx bx-minus-circle', accent: 'from-gray-400 to-gray-500',    ring: 'ring-gray-200 dark:ring-zinc-500/20' },
    { label: 'For Removal',     key: 'for_removal',  icon: 'bx bx-error-circle', accent: 'from-red-500 to-rose-500',     ring: 'ring-red-200 dark:ring-red-500/20' },
  ] as const

  const fiCls = 'h-9 w-full rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-slate-200 dark:hover:border-zinc-500 dark:focus:border-violet-500'
  const fsCls = `${fiCls} appearance-none pr-8 cursor-pointer`

  return (
    <>
      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(c => (
          <div key={c.key} className={`relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ${c.ring} flex flex-col justify-between p-4 min-h-[96px]`}>
            <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${c.accent}`} />
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-tight">{c.label}</p>
              <i className={`${c.icon} text-xl text-slate-300 dark:text-zinc-600 shrink-0`} />
            </div>
            <p className="text-[28px] font-bold leading-none text-slate-800 dark:text-zinc-100">
              {loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-100 dark:bg-zinc-700" /> : counts[c.key as keyof typeof counts]}
            </p>
          </div>
        ))}
      </div>

      {/* Legend + Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Legend */}
        <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 px-4 py-2">
          {(['occupied', 'reserved', 'available'] as SlotStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
              <span className="h-3 w-3 rounded-sm" style={{ background: SLOT_COLOR[s].body }} />
              {SLOT_COLOR[s].label}
            </span>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NAP box, pole, barangay…"
              className={`${fiCls} pl-8 w-52`} />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as typeof filterStatus) }} className={`${fsCls} w-40`}>
              {statuses.map(s => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Statuses' : s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : 'For Removal'}
                </option>
              ))}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          </div>

          <span className="text-xs font-medium text-slate-400 dark:text-zinc-500">{filtered.length} {filtered.length === 1 ? 'box' : 'boxes'}</span>

          {admin && (
            <button
              onClick={() => { setFormData(emptyForm()); setIsAddOpen(true) }}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]"
            >
              <i className="bx bx-plus text-[18px]" />
              <span>Add NAP Box</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid / states */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 dark:text-zinc-500">
          <i className="mdi mdi-loading mdi-spin text-4xl block mb-2" />
          Loading NAP boxes and port data…
        </div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">
          <i className="mdi mdi-alert-circle text-4xl block mb-2" />{error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-400 dark:text-zinc-500">
          <i className="bx bx-server text-4xl block mb-2" />
          No NAP boxes match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(b => (
            <NapPanelCard
              key={b.id}
              box={b}
              admin={admin}
              onEdit={b => { setFormData({ nap_code: b.nap_code, pole_id: String(b.pole_id), port_count: b.port_count, status: b.status }); setEditBox(b) }}
              onDelete={b => setDelBox(b)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <Modal open={isAddOpen} onClose={close} title="Add NAP Box" subtitle="Register a new NAP box">
        {saveError && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{saveError}</p>}
        <NapForm data={formData} onChange={setFormData} onSubmit={handleAdd} close={close} mode="add" />
        {saving && <p className="mt-2 text-center text-xs text-slate-400">Saving…</p>}
      </Modal>

      <Modal open={!!editBox} onClose={close} title="Edit NAP Box" subtitle={`Editing ${editBox?.nap_code}`}>
        {saveError && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{saveError}</p>}
        <NapForm data={formData} onChange={setFormData} onSubmit={handleEdit} close={close} mode="edit" />
        {saving && <p className="mt-2 text-center text-xs text-slate-400">Saving…</p>}
      </Modal>

      <Modal open={!!delBox} onClose={close} title="Delete NAP Box?" subtitle="This action cannot be undone." danger width="max-w-sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-zinc-300 text-center">
            You are about to delete <span className="font-semibold text-slate-800 dark:text-zinc-100">{delBox?.nap_code}</span>.
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-zinc-800 p-4 text-sm">
            {([['NAP Code', delBox?.nap_code], ['Pole Code', delBox?.pole?.pole_code ?? '—'], ['Port Count', delBox ? `${delBox.port_count}-port` : '—'], ['Barangay', delBox?.pole?.barangay?.name ?? '—']] as [string, string | undefined][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{k}</dt>
                <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
          {saveError && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{saveError}</p>}
          <div className="flex flex-row gap-3 justify-center">
            <button onClick={handleDel} disabled={saving} className={`${dangerBtnCls} flex-1 disabled:opacity-60`}>
              {saving ? 'Saving…' : 'Yes, Delete'}
            </button>
            <button onClick={close} disabled={saving} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
