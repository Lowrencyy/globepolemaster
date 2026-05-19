import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import telcoImg from '../../assets/images/telco.png'
import { getToken, isAdmin, SKYCABLE_API } from '../../lib/auth'
import { slugify } from '../../lib/utils'

interface Area {
  id: number
  name: string
  nodes_count?: number
}

interface Node {
  id: number
  name: string
  label: string | null
  full_label: string | null
  status: 'pending' | 'in_progress' | 'completed'
  report_type?: 'full_report' | 'pole_report' | null
  expected_cable: number | null
  actual_cable: number | null
  progress_percentage: number | null
  expected_nodes?: number | null
  expected_amplifier?: number | null
  expected_extender?: number | null
  expected_tsc?: number | null
  spans_count?: number | null
  span_summaries_sum_expected_cable?: number | null
  span_summaries_sum_actual_cable?: number | null
  span_summaries_sum_actual_node?: number | null
  span_summaries_sum_actual_amplifier?: number | null
  span_summaries_sum_actual_extender?: number | null
  span_summaries_sum_actual_tsc?: number | null
  barangay?: { name: string; city?: { name: string } } | null
  subcontractor?: { id: number; name: string } | null
  team?: { id: number; name: string } | null
  date_start?: string | null
  due_date?: string | null
  date_finished?: string | null
}

interface Subcon { id: number; name: string }
interface Team { id: number; name: string }

type NodeStatus = 'pending' | 'in_progress' | 'completed'
type ReportType = 'full_report' | 'pole_report'

interface NodeForm {
  name: string
  status: NodeStatus | ''
  report_type: ReportType | ''
  subcontractor_id: string
  team_id: string
  expected_cable: string
  expected_nodes: string
  expected_amplifier: string
  expected_extender: string
  expected_tsc: string
  date_start: string
  due_date: string
  date_finished: string
}

// ── Tile math ─────────────────────────────────────────────────────────────────
const TILE_PX = 256
function latLngToTileFrac(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z)
  const xFrac = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { xFrac, yFrac, tileX: Math.floor(xFrac), tileY: Math.floor(yFrac) }
}

const MAP_H = 144
const STATUS_DOT: Record<string, string> = {
  pending: '#f59e0b', in_progress: '#8b5cf6', cleared: '#10b981',
}

// Module-level cache: nodeId → pole pins
const nodePolesCache = new Map<number, { lat: number; lng: number; status: string }[]>()

function NodeVicinityMap({ nodeId, nodeName }: { nodeId: number; nodeName: string }) {
  const [poles, setPoles] = useState<{ lat: number; lng: number; status: string }[]>(
    () => nodePolesCache.get(nodeId) ?? []
  )
  const [loaded, setLoaded] = useState(() => nodePolesCache.has(nodeId))
  const [w, setW] = useState(320)
  const divRef = useRef<HTMLDivElement>(null)

  // Fetch poles silently in background to refresh dynamic state without resetting loader
  useEffect(() => {
    fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, {
      headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' },
    })
      .then(r => r.json())
      .then((rows: any) => {
        const list: any[] = Array.isArray(rows) ? rows : (rows?.data ?? [])
        const pins = list.flatMap((sp: any) => {
          const lat = sp.pole?.lat ? Number(sp.pole.lat) : null
          const lng = sp.pole?.lng ? Number(sp.pole.lng) : null
          if (!lat || !lng) return []
          return [{ lat, lng, status: sp.pole?.skycable_status ?? 'pending' }]
        })
        nodePolesCache.set(nodeId, pins)
        setPoles(pins)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [nodeId])

  // Measure real container width
  useEffect(() => {
    const el = divRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setW(rect.width)
    const obs = new ResizeObserver(es => {
      const cw = es[0]?.contentRect.width
      if (cw && cw > 0) setW(cw)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (!loaded) {
    return <div className="h-36 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
  }

  if (poles.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/40">
        <img src={telcoImg} alt="No GPS" className="h-36 w-full object-contain p-4 opacity-25 dark:opacity-10" />
      </div>
    )
  }

  const h = MAP_H
  const lats = poles.map(p => p.lat)
  const lngs = poles.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)

  // Use bounding box midpoint for absolutely perfect geometric centering
  const centerLat = (minLat + maxLat) / 2
  const centerLng = (minLng + maxLng) / 2

  const latSpan = Math.max(maxLat - minLat, 0.0005)
  const lngSpan = Math.max(maxLng - minLng, 0.0005)
  // Highly safe padding factors to comfortably frame the box symmetrically
  const zLng = Math.log2((w * 0.45 * 360) / (TILE_PX * lngSpan))
  const zLat = Math.log2((h * 0.45 * 180) / (TILE_PX * latSpan))
  const zoom = Math.max(11, Math.min(17, Math.floor(Math.min(zLng, zLat))))

  const { xFrac, yFrac, tileX, tileY } = latLngToTileFrac(centerLat, centerLng, zoom)
  const fracX = xFrac - tileX
  const fracY = yFrac - tileY
  const scale = Math.max(w / TILE_PX, h / TILE_PX)
  const imgW = TILE_PX * scale
  const imgH = TILE_PX * scale
  const offX = w / 2 - fracX * imgW
  const offY = h / 2 - fracY * imgH

  const tileBase = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}`

  const sw = latLngToTileFrac(minLat, minLng, zoom)
  const ne = latLngToTileFrac(maxLat, maxLng, zoom)
  const bxL = offX + (sw.xFrac - tileX) * imgW
  const bxT = offY + (ne.yFrac - tileY) * imgH
  const bxW = (ne.xFrac - sw.xFrac) * imgW
  const bxH = (sw.yFrac - ne.yFrac) * imgH

  return (
    <div ref={divRef} className="relative w-full overflow-hidden rounded-xl border border-white/5 shadow-inner transition-transform duration-500 group-hover:scale-[1.02]" style={{ height: MAP_H, background: '#0f172a' }}>
      {/* Satellite tiles */}
      {[-1, 0, 1].map(dx => (
        <img key={dx} src={`${tileBase}/${tileX + dx}`} alt="" draggable={false}
          style={{ position: 'absolute', left: offX + dx * imgW, top: offY, width: imgW, height: imgH, userSelect: 'none', filter: 'brightness(0.95) contrast(1.05)' }} />
      ))}

      {/* Exquisite Glowing gradient overlay at the top and bottom for readability */}
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-slate-950/60 to-transparent pointer-events-none z-1" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent pointer-events-none z-1" />

      {/* Orange bounding box */}
      {poles.length > 1 && bxW > 2 && bxH > 2 && (
        <div style={{
          position: 'absolute', left: bxL, top: bxT, width: bxW, height: bxH,
          border: '2px dashed rgba(245, 158, 11, 0.8)', borderRadius: 6,
          background: 'rgba(245, 158, 11, 0.15)', pointerEvents: 'none', zIndex: 1,
        }} />
      )}

      {/* Pole dots with glowing rings */}
      {poles.map((p, i) => {
        const { xFrac: px, yFrac: py } = latLngToTileFrac(p.lat, p.lng, zoom)
        const dotColor = STATUS_DOT[p.status] ?? '#94a3b8'
        return (
          <div key={i} style={{
            position: 'absolute',
            left: offX + (px - tileX) * imgW - 4,
            top: offY + (py - tileY) * imgH - 4,
            width: 8, height: 8, borderRadius: '50%',
            background: '#ffffff', border: `2px solid ${dotColor}`,
            boxShadow: `0 0 8px ${dotColor}`,
            pointerEvents: 'none', zIndex: 2,
          }} />
        )
      })}

      {/* Stunning Glassmorphic Node name badge */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/60 backdrop-blur-md px-3 py-1.5 shadow-lg z-3">
        <span className="truncate text-xs font-bold tracking-wide text-white">{nodeName}</span>
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/80 backdrop-blur-xs">
          {poles.length} {poles.length === 1 ? 'Pole' : 'Poles'}
        </span>
      </div>
    </div>
  )
}

const STATUS_CFG = {
  pending: {
    label: 'Pending Scope',
    badge: 'bg-amber-500 text-white border-none shadow-md dark:bg-amber-500 dark:text-white',
    bar: '#f59e0b',
    top: 'from-amber-500 via-orange-500 to-amber-600',
    glow: 'group-hover:shadow-amber-500/10',
  },
  in_progress: {
    label: 'Active Teardown',
    badge: 'bg-indigo-600 text-white border-none shadow-md dark:bg-indigo-600 dark:text-white',
    bar: '#6366f1',
    top: 'from-indigo-500 via-violet-500 to-purple-600',
    glow: 'group-hover:shadow-indigo-500/10',
  },
  completed: {
    label: 'Cleared & Verified',
    badge: 'bg-emerald-600 text-white border-none shadow-md dark:bg-emerald-600 dark:text-white',
    bar: '#10b981',
    top: 'from-emerald-500 via-teal-500 to-emerald-600',
    glow: 'group-hover:shadow-emerald-500/10',
  },
}

const emptyForm = (): NodeForm => ({ name: '', status: 'pending', report_type: 'full_report', subcontractor_id: '', team_id: '', expected_cable: '', expected_nodes: '', expected_amplifier: '', expected_extender: '', expected_tsc: '', date_start: '', due_date: '', date_finished: '' })

const inputCls = 'w-full rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700/80 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:bg-slate-900'
const selectCls = `${inputCls} cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_14px_center] bg-no-repeat pr-9`
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400'

function h() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function Modal({ title, sub, onClose, maxWidth = 'max-w-lg', children }: { title: string; sub?: string; onClose: () => void; maxWidth?: string; children: React.ReactNode }) {
  const mwPx = maxWidth === 'max-w-4xl' ? 896 : 512
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className={`w-full ${maxWidth} flex flex-col max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200`} style={{ maxWidth: mwPx }} onClick={e => e.stopPropagation()}>
        <div className="relative overflow-hidden border-b border-slate-100 bg-slate-900 px-6 py-5 dark:border-slate-800" style={{ backgroundColor: '#0f172a' }}>
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-indigo-500/20 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-sky-500/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-white">{title}</h3>
              {sub && <p className="mt-1 text-xs font-medium text-indigo-200/80">{sub}</p>}
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg font-bold text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95">×</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

interface NodeFormFieldsProps {
  form: NodeForm
  setForm: React.Dispatch<React.SetStateAction<NodeForm>>
  formErr: string
  subcons: Subcon[]
  teams: Team[]
  teamsLoading: boolean
  onSubconChange: (val: string) => void
}

function NodeFormFields({ form, setForm, formErr, subcons, teams, teamsLoading, onSubconChange }: NodeFormFieldsProps) {
  return (
    <div className="flex flex-col gap-5 p-6 overflow-y-auto flex-1 min-h-0">
      {formErr && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 flex items-center gap-2 shadow-2xs">
          <svg className="h-4 w-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{formErr}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className={labelCls}>Node Name *</label>
          <input required autoFocus className={inputCls} placeholder="e.g. Makati Central Node Area-A" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as NodeStatus | '' }))}>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Report Type</label>
          <select className={selectCls} value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value as ReportType | '' }))}>
            <option value="full_report">Full Report</option>
            <option value="pole_report">Pole Report</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Start Date</label>
          <input type="date" className={inputCls} value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Due Date</label>
          <input type="date" className={inputCls} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Finished Date</label>
          <input type="date" className={inputCls} value={form.date_finished} onChange={e => setForm(f => ({ ...f, date_finished: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch pt-1">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4.5 dark:border-slate-800/80 dark:bg-slate-950/20 flex flex-col justify-between">
          <div>
            <p className="mb-3.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Assignment & Field Routing</p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className={labelCls}>Subcontractor</label>
                <select className={selectCls} value={form.subcontractor_id} onChange={e => onSubconChange(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {subcons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Field Team {teamsLoading && <span className="ml-1 text-indigo-400 animate-pulse">↻</span>}</label>
                <select className={selectCls} value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))} disabled={!form.subcontractor_id || teamsLoading}>
                  <option value="">— Select subcon first —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          {form.team_id && (
            <p className="mt-4 flex items-center gap-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border-t border-slate-200/60 pt-3 dark:border-slate-800/80">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>Routed for offline mobile syncing</span>
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50/30 p-4.5 shadow-2xs dark:border-indigo-900/30 dark:from-indigo-950/20 dark:via-slate-900/50 dark:to-slate-950/20">
          <p className="mb-3.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Hardware Scope Quotas & Quantities</p>
          <div className="mb-3.5">
            <label className={labelCls}>Expected Recoverable Cable Length</label>
            <div className="relative">
              <input type="number" min="0" step="any" className={inputCls} placeholder="Enter target length" value={form.expected_cable} onChange={e => setForm(f => ({ ...f, expected_cable: e.target.value }))} />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">Meters</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>📍 Nodes / Poles</label>
              <input type="number" min="0" className={inputCls} placeholder="0" value={form.expected_nodes} onChange={e => setForm(f => ({ ...f, expected_nodes: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>⚡ Amplifiers</label>
              <input type="number" min="0" className={inputCls} placeholder="0" value={form.expected_amplifier} onChange={e => setForm(f => ({ ...f, expected_amplifier: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>📡 Extenders</label>
              <input type="number" min="0" className={inputCls} placeholder="0" value={form.expected_extender} onChange={e => setForm(f => ({ ...f, expected_extender: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>🎛️ TSC Components</label>
              <input type="number" min="0" className={inputCls} placeholder="0" value={form.expected_tsc} onChange={e => setForm(f => ({ ...f, expected_tsc: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Module-level persistent cache for superfast client transitions without flash loading
const siteAreaCache = new Map<string, Area>()
const siteNodesCache = new Map<string, Node[]>()

export default function SiteNodes() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const admin = isAdmin()

  const [area, setArea] = useState<Area | null>(() => siteId ? (siteAreaCache.get(siteId) ?? null) : null)
  const [nodes, setNodes] = useState<Node[]>(() => siteId ? (siteNodesCache.get(siteId) ?? []) : [])
  const [loading, setLoading] = useState(() => siteId ? !siteNodesCache.has(siteId) : true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | NodeStatus>('all')

  // CRUD state
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [selected, setSelected] = useState<Node | null>(null)
  const [form, setForm] = useState<NodeForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  // Subcon + team dropdowns
  const [subcons, setSubcons] = useState<Subcon[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)

  useEffect(() => {
    fetch(`${SKYCABLE_API.replace('/skycable', '')}/admin/subcontractors?per_page=200`, { headers: h() })
      .then(r => r.json()).then(d => setSubcons(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => { })
  }, [])

  function onSubconChange(id: string) {
    setForm(f => ({ ...f, subcontractor_id: id, team_id: '' }))
    setTeams([])
    if (!id) return
    setTeamsLoading(true)
    fetch(`${SKYCABLE_API.replace('/skycable', '')}/admin/teams?subcontractor_id=${id}&per_page=200`, { headers: h() })
      .then(r => r.json()).then(d => setTeams(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => { }).finally(() => setTeamsLoading(false))
  }

  function loadData(hideSpinner = false) {
    if (!siteId) return
    if (!siteNodesCache.has(siteId) && !hideSpinner) {
      setLoading(true)
    }
    Promise.all([
      fetch(`${SKYCABLE_API}/areas/${siteId}`, { headers: h() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/nodes?area_id=${siteId}&per_page=200`, { headers: h() }).then(r => r.json()),
    ]).then(([areaData, nodesData]) => {
      const aVal = areaData?.data ?? areaData
      const nVal = Array.isArray(nodesData) ? nodesData : (nodesData?.data ?? [])
      siteAreaCache.set(siteId, aVal)
      siteNodesCache.set(siteId, nVal)
      setArea(aVal)
      setNodes(nVal)
    }).catch(() => { }).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (siteId && siteNodesCache.has(siteId)) {
      setArea(siteAreaCache.get(siteId) ?? null)
      setNodes(siteNodesCache.get(siteId) ?? [])
      setLoading(false)
    } else {
      setLoading(true)
    }
    loadData(true)
  }, [siteId])

  const counts = useMemo(() => ({
    total: nodes.length,
    pending: nodes.filter(n => n.status === 'pending').length,
    in_progress: nodes.filter(n => n.status === 'in_progress').length,
    completed: nodes.filter(n => n.status === 'completed').length,
  }), [nodes])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? nodes : nodes.filter(n => n.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n =>
        n.name.toLowerCase().includes(q) ||
        (n.full_label ?? '').toLowerCase().includes(q) ||
        (n.barangay?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [nodes, filter, search])

  function closeAll() {
    setAddOpen(false); setEditOpen(false); setDelOpen(false)
    setSelected(null); setForm(emptyForm()); setFormErr('')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr('Node name is required.'); return }
    setSaving(true); setFormErr('')
    try {
      const res = await fetch(`${SKYCABLE_API}/nodes`, {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({
          area_id: Number(siteId),
          name: form.name.trim(),
          status: form.status,
          report_type: form.report_type || null,
          subcontractor_id: form.subcontractor_id ? Number(form.subcontractor_id) : null,
          team_id: form.team_id ? Number(form.team_id) : null,
          expected_cable: form.expected_cable ? Number(form.expected_cable) : 0,
          expected_nodes: form.expected_nodes ? Number(form.expected_nodes) : 0,
          expected_amplifier: form.expected_amplifier ? Number(form.expected_amplifier) : 0,
          expected_extender: form.expected_extender ? Number(form.expected_extender) : 0,
          expected_tsc: form.expected_tsc ? Number(form.expected_tsc) : 0,
          date_start: form.date_start || null,
          due_date: form.due_date || null,
          date_finished: form.date_finished || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to add node')
      closeAll(); loadData()
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSaving(false) }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !form.name.trim()) { setFormErr('Node name is required.'); return }
    setSaving(true); setFormErr('')
    try {
      const res = await fetch(`${SKYCABLE_API}/nodes/${selected.id}`, {
        method: 'PATCH',
        headers: h(),
        body: JSON.stringify({
          name: form.name.trim(),
          status: form.status || undefined,
          report_type: form.report_type || null,
          subcontractor_id: form.subcontractor_id ? Number(form.subcontractor_id) : null,
          team_id: form.team_id ? Number(form.team_id) : null,
          expected_cable:    form.expected_cable    ? Number(form.expected_cable)    : 0,
          expected_nodes:    form.expected_nodes    ? Number(form.expected_nodes)    : 0,
          expected_amplifier: form.expected_amplifier ? Number(form.expected_amplifier) : 0,
          expected_extender:  form.expected_extender  ? Number(form.expected_extender)  : 0,
          expected_tsc:       form.expected_tsc       ? Number(form.expected_tsc)       : 0,
          date_start: form.date_start || null,
          due_date: form.due_date || null,
          date_finished: form.date_finished || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? data?.errors ? Object.values(data.errors as Record<string,string[]>).flat().join(' ') : 'Failed to update node')
      closeAll(); loadData()
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!selected) return
    setSaving(true)
    try {
      await fetch(`${SKYCABLE_API}/nodes/${selected.id}`, { method: 'DELETE', headers: h() })
      closeAll(); loadData()
    } catch { setFormErr('Failed to delete') } finally { setSaving(false) }
  }

  function openEdit(node: Node, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(node)
    const subId = node.subcontractor?.id ? String(node.subcontractor.id) : ''
    const tmId = node.team?.id ? String(node.team.id) : ''
    setForm({
      name: node.name,
      status: node.status,
      report_type: node.report_type ?? '',
      subcontractor_id: subId,
      team_id: tmId,
      expected_cable: node.expected_cable != null ? String(node.expected_cable) : '',
      expected_nodes: node.expected_nodes != null ? String(node.expected_nodes) : '',
      expected_amplifier: node.expected_amplifier != null ? String(node.expected_amplifier) : '',
      expected_extender: node.expected_extender != null ? String(node.expected_extender) : '',
      expected_tsc: node.expected_tsc != null ? String(node.expected_tsc) : '',
      date_start: node.date_start ? node.date_start.split('T')[0] : '',
      due_date: node.due_date ? node.due_date.split('T')[0] : '',
      date_finished: node.date_finished ? node.date_finished.split('T')[0] : '',
    })
    setTeams([])
    setFormErr('')
    setEditOpen(true)
    // Pre-load teams for the existing subcon
    if (subId) {
      setTeamsLoading(true)
      fetch(`${SKYCABLE_API.replace('/skycable', '')}/admin/teams?subcontractor_id=${subId}&per_page=200`, { headers: h() })
        .then(r => r.json()).then(d => setTeams(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => { }).finally(() => setTeamsLoading(false))
    }
  }

  function openDel(node: Node, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(node)
    setDelOpen(true)
  }

  const summaryCards = [
    { label: 'Total Nodes', value: counts.total, note: 'All registered nodes', tone: 'from-blue-600 to-sky-500', soft: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
    { label: 'Pending', value: counts.pending, note: 'Awaiting teardown', tone: 'from-amber-400 to-orange-400', soft: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'In Progress', value: counts.in_progress, note: 'Currently active', tone: 'from-indigo-500 to-violet-500', soft: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300', icon: 'M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0119 5' },
    { label: 'Completed', value: counts.completed, note: 'Finished nodes', tone: 'from-emerald-500 to-teal-500', soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300', icon: 'M5 13l4 4L19 7' },
  ]

  return (
    <div className="flex flex-col gap-6 pb-12 max-w-[1600px] mx-auto">

      {/* Exquisite Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/30 p-8 shadow-sm transition-all dark:border-slate-800 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/20">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/10" />

        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <nav className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500">
              <Link to="/sites" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Sites Overview</Link>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="text-indigo-600 dark:text-indigo-400">{area?.name ?? 'Loading Area…'}</span>
            </nav>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                {loading ? 'Loading Site Nodes…' : (area?.name ?? 'Site Operations')}
              </h1>
              <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:border-indigo-400/20 dark:text-indigo-400">
                Live Coverage Registry
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 dark:text-slate-400">
              High-fidelity dashboard for overseeing assigned field equipment, local-first node synchronization, and recovery logging.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {admin && (
              <button
                onClick={() => { setForm(emptyForm()); setFormErr(''); setAddOpen(true) }}
                className="group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-lg transition-all active:scale-[0.98]"
                style={{ backgroundColor: '#059669', color: '#ffffff' }}
              >
                <svg className="h-4 w-4 transition-transform group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add Nodes
              </button>
            )}
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 backdrop-blur-xs px-4 py-3 text-sm font-bold text-slate-700 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back to Overview
            </button>
          </div>
        </div>
      </div>

      {/* Premium Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(card => (
          <article key={card.label} className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.tone}`} />
            <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${card.tone} opacity-10 blur-xl transition-opacity group-hover:opacity-20`} />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{card.label}</p>
                <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  {loading ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
                  ) : card.value}
                </h3>
                <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{card.note}</p>
              </div>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.soft} transition-transform group-hover:scale-110 duration-300`}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Node Registry Block */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800/80">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assigned Node Dashboard</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">Click any card to load verified pole sequences and detailed asset recovery metrics.</p>
          </div>
          {!loading && (
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-300">
                Showing {filtered.length} of {nodes.length} registered
              </span>
            </div>
          )}
        </div>

        {/* Search & Filter Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/40 px-6 py-4 dark:border-slate-800/80 dark:bg-slate-950/20">
          <div className="relative min-w-64 flex-1 max-w-md">
            <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by node name, label, or location…" className="h-10 w-full rounded-xl border border-slate-200/80 bg-white pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 shadow-2xs outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700/80 dark:bg-slate-900 dark:text-white dark:focus:border-indigo-400" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Clear</button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
            {(['all', 'pending', 'in_progress', 'completed'] as const).map(v => {
              const active = filter === v
              const names: Record<string, string> = { all: 'All Nodes', pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' }
              return (
                <button
                  key={v}
                  onClick={() => setFilter(v)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${active
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                  {names[v]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main Grid Render */}
        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-96 w-full animate-pulse rounded-3xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-20 text-center dark:border-slate-800 dark:bg-slate-950/20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">No Assigned Nodes Found</h3>
              <p className="mt-1 max-w-sm text-sm font-medium text-slate-500 dark:text-slate-400">
                {search ? 'No nodes match your current search entry. Try relaxing your filters.' : 'There are no active nodes fitting the current lifecycle phase.'}
              </p>
              {search && (
                <button onClick={() => setSearch('')} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                  Reset Search Filter
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {filtered.map(node => {
                const cfg = STATUS_CFG[node.status] ?? STATUS_CFG.pending
                const spanTarget   = node.span_summaries_sum_expected_cable ?? node.expected_cable ?? 0
                const spanActual   = node.span_summaries_sum_actual_cable ?? node.actual_cable ?? 0
                const spanPct      = spanTarget > 0 ? Math.min(100, Math.round((spanActual / spanTarget) * 100)) : (node.progress_percentage ?? 0)
                const pct = spanPct
                return (
                  <div
                    key={node.id}
                    onClick={() => navigate(`/sites/${slugify(node.area?.name ?? String(siteId))}-${siteId}/nodes/${slugify(node.full_label ?? node.name)}-${node.id}`)}
                    className="group relative flex flex-col justify-between w-full rounded-3xl border border-slate-100 bg-white p-2.5 pb-4 shadow-xs transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-xl dark:border-slate-800/80 dark:bg-slate-900"
                  >
                    {/* Embedded Satellite Component Map Frame */}
                    <div className="relative overflow-hidden rounded-2xl border border-slate-50 dark:border-slate-800">
                      <NodeVicinityMap nodeId={node.id} nodeName={node.name} />
                      <div className={`absolute top-2.5 right-2.5 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-md ${cfg.badge}`}>
                        {cfg.label}
                      </div>
                    </div>

                    {/* Detailed Metadata Body matching the mockup perfectly */}
                    <div className="flex flex-col flex-1 px-3.5 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400" title={node.name}>
                            {node.name}
                          </h3>
                          <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                            Skycable Node · ID: {node.id} {node.barangay?.name ? `· ${node.barangay.name}` : ''}
                          </p>
                        </div>
                      </div>

                      {(node.date_start || node.due_date || node.date_finished) && (
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {node.date_start && (
                            <span className="flex items-center gap-1" title="Start Date">
                              <svg className="h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              {new Date(node.date_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {node.due_date && (
                            <span className="flex items-center gap-1" title="Due Date">
                              <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {new Date(node.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {node.date_finished && (
                            <span className="flex items-center gap-1" title="Finished Date">
                              <svg className="h-3 w-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {new Date(node.date_finished).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      )}

                      {/* The gorgeous single full-width stat row separated by vertical dividers exactly like the image! */}
                      <div className="mt-4 grid grid-cols-4 rounded-2xl bg-slate-50/80 p-2.5 text-center border border-slate-100/80 dark:bg-slate-950/30 dark:border-slate-800/60">
                        <div className="border-r border-slate-200/60 last:border-none dark:border-slate-800/80">
                          <span className="block text-sm font-black text-slate-900 dark:text-white">
                            {node.spans_count ?? node.expected_nodes ?? 0}
                          </span>
                          <span className="block text-[8px] font-bold tracking-wider text-slate-400 uppercase mt-0.5">
                            SPANS
                          </span>
                        </div>
                        <div className="border-r border-slate-200/60 last:border-none dark:border-slate-800/80">
                          <span className="block text-sm font-black text-rose-600 dark:text-rose-400">
                            {spanTarget ? `${spanTarget}m` : '0m'}
                          </span>
                          <span className="block text-[8px] font-bold tracking-wider text-slate-400 uppercase mt-0.5">
                            TARGET
                          </span>
                        </div>
                        <div className="border-r border-slate-200/60 last:border-none dark:border-slate-800/80">
                          <span className="block text-sm font-black text-blue-600 dark:text-blue-400">
                            {spanActual ? `${spanActual}m` : '0m'}
                          </span>
                          <span className="block text-[8px] font-bold tracking-wider text-slate-400 uppercase mt-0.5">
                            RECOVERED
                          </span>
                        </div>
                        <div className="border-r border-slate-200/60 last:border-none dark:border-slate-800/80">
                          <span className="block text-sm font-black text-emerald-600 dark:text-emerald-400">
                            {pct}%
                          </span>
                          <span className="block text-[8px] font-bold tracking-wider text-slate-400 uppercase mt-0.5">
                            PROGRESS
                          </span>
                        </div>
                      </div>

                      {/* Subcontractor Team & Quick Admin Controls Footer */}
                      <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 dark:border-slate-800/80">
                        <div className="flex flex-wrap gap-1.5 min-w-0">
                          <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={`Subcontractor: ${node.subcontractor?.name ?? 'Unassigned'}`}>
                            {node.subcontractor?.name || 'Unassigned'}
                          </span>
                          {node.team?.name && (
                            <span className="truncate rounded-md bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400" title={`Team: ${node.team.name}`}>
                              {node.team.name}
                            </span>
                          )}
                        </div>

                        {admin ? (
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            <button onClick={e => openEdit(node, e)} className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-indigo-400" title="Edit Node">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={e => openDel(node, e)} className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors dark:hover:bg-rose-950/40 dark:hover:text-rose-400" title="Delete Node">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        ) : (
                          <svg className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 duration-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Add Modal */}
      {addOpen && (
        <Modal title="Register New Site Node" sub={`Target Operating Area: ${area?.name ?? ''}`} maxWidth="max-w-4xl" onClose={closeAll}>
          <form onSubmit={handleAdd} className="flex flex-col min-h-0 max-h-[80vh]">
            <NodeFormFields form={form} setForm={setForm} formErr={formErr} subcons={subcons} teams={teams} teamsLoading={teamsLoading} onSubconChange={onSubconChange} />
            <div className="flex gap-3 border-t border-slate-100 px-6 pb-6 pt-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
              <button type="button" onClick={closeAll} className="flex-1 rounded-xl border border-slate-200/80 bg-white py-3 text-sm font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Cancel Return</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-bold shadow-lg transition-all disabled:opacity-60 active:scale-[0.98]" style={{ backgroundColor: '#059669', color: '#ffffff' }}>{saving ? 'Committing Updates…' : 'Save Node'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editOpen && selected && (
        <Modal title="Edit Node Configurations" sub={selected.full_label ?? selected.name} maxWidth="max-w-4xl" onClose={closeAll}>
          <form onSubmit={handleEdit} className="flex flex-col min-h-0 max-h-[80vh]">
            <NodeFormFields form={form} setForm={setForm} formErr={formErr} subcons={subcons} teams={teams} teamsLoading={teamsLoading} onSubconChange={onSubconChange} />
            <div className="flex gap-3 border-t border-slate-100 px-6 pb-6 pt-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
              <button type="button" onClick={closeAll} className="flex-1 rounded-xl border border-slate-200/80 bg-white py-3 text-sm font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Cancel Return</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-bold shadow-lg transition-all disabled:opacity-60 active:scale-[0.98]" style={{ backgroundColor: '#059669', color: '#ffffff' }}>{saving ? 'Committing Updates…' : 'Save Node'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Modal */}
      {delOpen && selected && (
        <Modal title="Revoke & Delete Node?" sub="Warning: This operation purges tracking pointers." onClose={closeAll}>
          <div className="p-6">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you absolutely certain you wish to unregister <strong className="font-bold text-slate-900 dark:text-white">{selected.full_label ?? selected.name}</strong> from the operational coverage database?
            </p>
            {formErr && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">{formErr}</p>}
            <div className="mt-6 flex gap-3">
              <button onClick={closeAll} className="flex-1 rounded-xl border border-slate-200/80 bg-white py-3 text-sm font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Keep Registry</button>
              <button onClick={handleDelete} disabled={saving} className="flex-1 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-rose-600/20 transition-all hover:from-rose-500 hover:to-red-500 hover:shadow-rose-600/30 disabled:opacity-60 active:scale-[0.98]">{saving ? 'Revoking…' : 'Confirm Deletion'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
