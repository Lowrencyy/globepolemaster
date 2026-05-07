import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type NodeInfo = {
  id: number
  name: string
  full_label?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  expected_cable?: number
  actual_cable?: number
  progress_percentage?: number
  area?: { id: number; name: string } | null
  region?: string
  province?: string
  city?: string
}

interface SpanComponent {
  component_type: string
  expected_count: number | string
  actual_count: number | string
  unit: string
}

interface TeardownEntry {
  id: number
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  expected_cable: number | string
  actual_cable: number | string
  status: string
  team: { name: string } | null
  lineman: { first_name: string; last_name: string } | null
  span: {
    id: number
    span_code: string | null
    length_meters: number | string
    status: string
    fromPole?: { pole: { pole_code: string } | null } | null
    toPole?: { pole: { pole_code: string } | null } | null
    components: SpanComponent[]
  } | null
}

interface PolePin {
  id: number
  pole_code: string
  lat: string | null
  lng: string | null
  skycable_status: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  subcon_approved: 'Subcon Approved',
  backend_approved: 'Approved',
  rejected: 'Rejected',
}

const COMP_LABELS: Record<string, string> = {
  node: 'Node Box',
  amplifier: 'Amplifier',
  extender: 'Extender',
  tsc: 'TSC',
  powersupply: 'Power Supply',
  powersupply_case: 'PS Case',
}

const nodeStatusConfig = {
  pending: {
    label: 'Pending',
    dotColor: '#f59e0b',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20',
  },
  in_progress: {
    label: 'Ongoing',
    dotColor: '#4f46e5',
    badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20',
  },
  completed: {
    label: 'Completed',
    dotColor: '#10b981',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
  },
}

const tdStatusMap: Record<string, string> = {
  backend_approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
  subcon_approved: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20',
  submitted: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20',
  rejected: 'bg-red-50 text-red-700 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
}

function fmt(n: number | string | null | undefined, dec = 2) {
  return Number(n ?? 0)
    .toFixed(dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function workDur(mins: number | null, start: string | null, end: string | null) {
  const m =
    mins ??
    (start && end
      ? Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000))
      : null)

  if (!m) return '—'

  const h = Math.floor(m / 60)
  const rm = m % 60

  return h > 0 ? `${h}h ${rm}m` : `${rm}m`
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

export default function NodeDetail() {
  const { siteSlug = '', nodeSlug = '' } = useParams()
  const navigate = useNavigate()
  const nodeId = idFromSlug(nodeSlug) || Number(nodeSlug)

  const today = new Date().toLocaleDateString('en-CA')

  const [date, setDate] = useState(today)
  const [node, setNode] = useState<NodeInfo | null>(null)
  const [teardowns, setTeardowns] = useState<TeardownEntry[]>([])
  const [nodeLoading, setNodeLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [poles, setPoles] = useState<PolePin[]>([])

  const mapRef = useRef<HTMLDivElement>(null)
  const mapObj = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!nodeId) return

    const hitNode = cacheGet<NodeInfo>(`nodedetail_info_${nodeId}`)
    const hitTd = cacheGet<TeardownEntry[]>(`nodedetail_td_${nodeId}`)

    if (hitNode) {
      setNode(hitNode)
      setNodeLoading(false)
    }

    if (hitTd) {
      setTeardowns(hitTd)
      setLoading(false)
    }

    Promise.all([
      fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=200`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() }).then(r => r.json()),
    ])
      .then(([nodeData, tdData, polesData]) => {
        if (nodeData?.id) {
          setNode(nodeData)
          cacheSet(`nodedetail_info_${nodeId}`, nodeData)
        }

        const list: TeardownEntry[] = Array.isArray(tdData) ? tdData : tdData?.data ?? []
        setTeardowns(list)
        cacheSet(`nodedetail_td_${nodeId}`, list)

        const poleList = Array.isArray(polesData) ? polesData : (polesData?.data ?? [])
        setPoles(poleList.map((sp: any) => ({
          id:              sp.pole?.id ?? sp.id,
          pole_code:       sp.pole?.pole_code ?? '',
          lat:             sp.pole?.lat ?? null,
          lng:             sp.pole?.lng ?? null,
          skycable_status: sp.pole?.skycable_status ?? 'pending',
        })))
      })
      .catch(() => {})
      .finally(() => {
        setNodeLoading(false)
        setLoading(false)
      })
  }, [nodeId])

  // Build Leaflet map once poles are loaded
  useEffect(() => {
    if (!mapRef.current || poles.length === 0) return
    if (mapObj.current) return // already initialised

    const gpsPoles = poles.filter(p => p.lat && p.lng)
    if (gpsPoles.length === 0) return

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
    mapObj.current = map

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 }).addTo(map)

    const STATUS_COLOR: Record<string, string> = {
      pending: '#f59e0b', in_progress: '#8b5cf6', cleared: '#10b981',
    }

    const latlngs: [number, number][] = gpsPoles.map(p => [Number(p.lat), Number(p.lng)])

    // Bounding rectangle showing the node area
    if (gpsPoles.length > 1) {
      const bounds = L.latLngBounds(latlngs)
      L.rectangle(bounds, {
        color: '#3b82f6', weight: 2, opacity: 0.8,
        fillColor: '#3b82f6', fillOpacity: 0.08,
        dashArray: '6 5',
      }).addTo(map)
    }

    // Pole markers
    gpsPoles.forEach(p => {
      const color = STATUS_COLOR[p.skycable_status] ?? '#6b7280'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:13px;height:13px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 0 7px ${color}99"></div>`,
        iconSize: [13, 13], iconAnchor: [6.5, 6.5],
      })
      L.marker([Number(p.lat), Number(p.lng)], { icon })
        .bindPopup(
          `<div style="font-family:monospace;min-width:110px">` +
          `<div style="font-size:13px;font-weight:900;color:#0f172a">${p.pole_code}</div>` +
          `<div style="font-size:10px;font-weight:700;color:${color};margin-top:3px">${p.skycable_status.replace(/_/g,' ')}</div>` +
          `</div>`
        )
        .addTo(map)
    })

    setTimeout(() => {
      map.invalidateSize()
      const bounds = L.latLngBounds(latlngs)
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 17 })
    }, 120)

    return () => { map.remove(); mapObj.current = null }
  }, [poles])

  const filtered = useMemo(() => {
    if (!date) return teardowns

    return teardowns.filter(td => {
      const d = td.start_time ? new Date(td.start_time).toLocaleDateString('en-CA') : null
      return d === date
    })
  }, [date, teardowns])

  const totalCableExp = filtered.reduce((s, t) => s + Number(t.expected_cable ?? 0), 0)
  const totalCableAct = filtered.reduce((s, t) => s + Number(t.actual_cable ?? 0), 0)
  const cablePct = totalCableExp > 0 ? Math.round((totalCableAct / totalCableExp) * 100) : 0

  const compMap: Record<string, { expected: number; actual: number; unit: string }> = {}

  filtered.forEach(td => {
    ;(td.span?.components ?? []).forEach(c => {
      if (c.component_type === 'cable') return

      if (!compMap[c.component_type]) {
        compMap[c.component_type] = { expected: 0, actual: 0, unit: c.unit }
      }

      compMap[c.component_type].expected += Number(c.expected_count ?? 0)
      compMap[c.component_type].actual += Number(c.actual_count ?? 0)
    })
  })

  const displayDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'All Dates'

  const sc = nodeStatusConfig[node?.status ?? 'pending'] ?? nodeStatusConfig.pending

  const reportStats = [
    { label: 'Teardowns', value: filtered.length, color: '#6366f1' },
    { label: 'Approved', value: filtered.filter(t => t.status === 'backend_approved').length, color: '#10b981' },
    { label: 'Cable Expected', value: `${fmt(totalCableExp)} m`, color: '#3b82f6' },
    { label: 'Cable Collected', value: `${fmt(totalCableAct)} m`, color: '#0ea5e9' },
    {
      label: 'Recovery Rate',
      value: `${cablePct}%`,
      color: cablePct >= 90 ? '#10b981' : cablePct >= 70 ? '#f59e0b' : '#ef4444',
    },
  ]

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #node-report-print, #node-report-print * { visibility: visible !important; }
          #node-report-print { position: fixed; inset: 0; padding: 10mm 12mm; }
          .no-print { display: none !important; }
          .report-table th, .report-table td { font-size: 8pt !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="space-y-6 pb-10 pt-5">
        <div className="no-print relative overflow-hidden rounded-[32px] border border-sky-100 bg-white shadow-[0_24px_70px_-38px_rgba(14,116,144,0.55)] dark:border-white/10 dark:bg-[#08111f]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.16),transparent_32%)]" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="relative p-6 sm:p-7">
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              <Link to={`/${siteSlug}`} className="transition hover:text-sky-600 dark:hover:text-sky-300">
                {nodeLoading ? '…' : node?.area?.name ?? 'Site'}
              </Link>

              <span className="text-slate-300 dark:text-slate-600">/</span>

              <span className="text-slate-800 dark:text-slate-100">
                {nodeLoading ? '…' : node?.full_label ?? node?.name ?? 'Node'}
              </span>
            </div>

            <div className="flex w-full items-center justify-between gap-6">
              <div className="min-w-0 max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18)]" />
                  Node Daily Report
                </div>

                <h4 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                  {nodeLoading ? '…' : node?.full_label ?? node?.name} — Daily Report
                </h4>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  {node?.area?.name && <span>{node.area.name}</span>}

                  {node?.city && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{node.city}</span>
                    </>
                  )}

                  {node && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${sc.badge}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sc.dotColor }} />
                        {sc.label}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                  <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={e => setDate(e.target.value)}
                    className="h-full bg-transparent text-xs font-bold text-slate-700 outline-none dark:text-slate-200"
                  />

                  <button
                    onClick={() => setDate('')}
                    className="rounded-lg px-2 py-1 text-[10px] font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    ALL
                  </button>
                </div>

                <button
                  onClick={() => navigate(`/${siteSlug}/${nodeSlug}/poles`)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 px-4 text-xs font-bold text-slate-600 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none dark:hover:bg-white/10"
                >
                  Poles
                </button>

                <button
                  onClick={() => navigate(`/${siteSlug}/${nodeSlug}/spans`)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 px-4 text-xs font-bold text-slate-600 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none dark:hover:bg-white/10"
                >
                  Spans
                </button>

                <button
                  onClick={() => window.print()}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-[0_16px_30px_-18px_rgba(37,99,235,0.75)] transition hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Node Vicinity Map ── */}
        <div className="no-print overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b1323]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Node Area Map</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                {poles.filter(p => p.lat && p.lng).length} / {poles.length} poles with GPS
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400">
              {[{ c: '#f59e0b', l: 'Pending' }, { c: '#8b5cf6', l: 'Active' }, { c: '#10b981', l: 'Cleared' }].map(({ c, l }) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm border border-blue-400 bg-blue-400/10" />Area
              </span>
            </div>
          </div>
          {poles.filter(p => p.lat && p.lng).length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-600">
              <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <p className="text-xs font-semibold">No GPS coordinates on poles in this node</p>
            </div>
          ) : (
            <div ref={mapRef} className="h-[300px] w-full" />
          )}
        </div>

        <div id="node-report-print" className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-[0_24px_80px_-44px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#0b1323]">
          <div className="relative overflow-hidden bg-[#183153] px-6 py-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />

            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">
                  Globe Telecom · Skycable Teardown
                </p>

                <h2 className="text-2xl font-black tracking-tight text-white">
                  Daily Report
                </h2>

                <p className="mt-1 text-sm font-semibold text-blue-200">
                  {displayDate}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
                  Node
                </p>

                <p className="text-xl font-black text-white">
                  {node?.name ?? `Node #${nodeId}`}
                </p>

                {node?.full_label && (
                  <p className="font-mono text-xs text-blue-300">
                    {node.full_label}
                  </p>
                )}

                {node?.area && (
                  <p className="mt-0.5 text-xs text-blue-200">
                    {node.area.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 border-b border-slate-100 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {reportStats.map(s => (
              <div key={s.label} className="flex flex-col items-center justify-center gap-1 border-b border-r border-slate-100 px-3 py-4 text-center last:border-r-0 dark:border-white/10 lg:border-b-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {s.label}
                </p>

                <p className="text-xl font-black" style={{ color: s.color }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">
                Teardown Activities
              </p>

              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Cable recovery and field activity records for the selected date.
              </p>
            </div>

            <div className="text-right text-xs font-semibold text-slate-400 dark:text-slate-500">
              Showing <span className="text-slate-700 dark:text-slate-200">{filtered.length}</span> entries
            </div>
          </div>

          {loading && filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-100 border-t-sky-600 dark:border-sky-500/10 dark:border-t-sky-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400 dark:text-slate-500">
              <div className="mb-2 h-16 w-16 rounded-[22px] bg-slate-50 ring-8 ring-slate-50/60 dark:bg-white/5 dark:ring-white/[0.03]" />

              <p className="text-sm font-black text-slate-500 dark:text-slate-400">
                No teardown activity
              </p>

              <p className="text-xs font-medium">
                {date
                  ? `No records on ${new Date(date + 'T00:00:00').toLocaleDateString('en-PH', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}.`
                  : 'No records available.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="report-table w-full min-w-[1320px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="bg-slate-50/90 dark:bg-white/[0.03]">
                    {[
                      'Span Code',
                      'From Pole',
                      'To Pole',
                      'Length',
                      'Expected',
                      'Collected',
                      'Recovery',
                      'Team',
                      'Lineman',
                      'Start',
                      'End',
                      'Duration',
                      'Status',
                    ].map(h => (
                      <th
                        key={h}
                        className={`border-b border-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:border-white/10 dark:text-slate-500 ${
                          ['Length', 'Expected', 'Collected', 'Recovery', 'Start', 'End', 'Duration', 'Status'].includes(h)
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filtered.map(td => {
                    const cExp = Number(td.expected_cable ?? 0)
                    const cAct = Number(td.actual_cable ?? 0)
                    const pct = cExp > 0 ? Math.round((cAct / cExp) * 100) : 0
                    const from = td.span?.fromPole?.pole?.pole_code ?? '—'
                    const to = td.span?.toPole?.pole?.pole_code ?? '—'
                    const span = td.span?.span_code ?? `#${td.id}`

                    return (
                      <tr key={td.id} className="transition-colors hover:bg-sky-50/50 dark:hover:bg-white/[0.035]">
                        <td className="border-b border-slate-100 px-4 py-3 font-mono text-[12px] font-black text-sky-700 dark:border-white/10 dark:text-sky-300">
                          {span}
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 font-mono text-[11px] font-bold text-slate-700 dark:border-white/10 dark:text-slate-300">
                          <span className="whitespace-nowrap rounded-xl bg-slate-100 px-2.5 py-1 dark:bg-white/5">
                            {from}
                          </span>
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 font-mono text-[11px] font-bold text-slate-700 dark:border-white/10 dark:text-slate-300">
                          <span className="whitespace-nowrap rounded-xl bg-slate-100 px-2.5 py-1 dark:bg-white/5">
                            {to}
                          </span>
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center font-bold text-slate-500 dark:border-white/10 dark:text-slate-400">
                          {fmt(td.span?.length_meters, 1)} m
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center font-bold text-slate-500 dark:border-white/10 dark:text-slate-400">
                          {fmt(cExp)} m
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center font-black text-slate-800 dark:border-white/10 dark:text-slate-100">
                          {fmt(cAct)} m
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center dark:border-white/10">
                          <span
                            className="font-black"
                            style={{ color: pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444' }}
                          >
                            {pct}%
                          </span>
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-600 dark:border-white/10 dark:text-slate-300">
                          {td.team?.name ?? '—'}
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-600 dark:border-white/10 dark:text-slate-300">
                          {td.lineman ? `${td.lineman.first_name} ${td.lineman.last_name}` : '—'}
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                          {fmtTime(td.start_time)}
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                          {fmtTime(td.end_time)}
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                          {workDur(td.duration_minutes, td.start_time, td.end_time)}
                        </td>

                        <td className="border-b border-slate-100 px-4 py-3 text-center dark:border-white/10">
                          <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-black ${tdStatusMap[td.status] ?? tdStatusMap.pending}`}>
                            {STATUS_LABELS[td.status] ?? td.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  <tr className="bg-slate-50 dark:bg-white/[0.03]">
                    <td colSpan={4} className="border-t border-slate-200 px-4 py-3 text-right text-xs font-black text-slate-700 dark:border-white/10 dark:text-slate-200">
                      TOTALS
                    </td>

                    <td className="border-t border-slate-200 px-4 py-3 text-center text-xs font-black text-slate-700 dark:border-white/10 dark:text-slate-200">
                      {fmt(totalCableExp)} m
                    </td>

                    <td className="border-t border-slate-200 px-4 py-3 text-center text-xs font-black text-slate-900 dark:border-white/10 dark:text-white">
                      {fmt(totalCableAct)} m
                    </td>

                    <td className="border-t border-slate-200 px-4 py-3 text-center text-xs font-black dark:border-white/10" style={{ color: cablePct >= 90 ? '#10b981' : cablePct >= 70 ? '#f59e0b' : '#ef4444' }}>
                      {cablePct}%
                    </td>

                    <td colSpan={6} className="border-t border-slate-200 dark:border-white/10" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {Object.keys(compMap).length > 0 && (
            <div className="border-t border-slate-100 px-5 py-4 dark:border-white/10">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">
                    Component Summary
                  </p>

                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Expected versus collected non-cable components.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="report-table w-full max-w-2xl border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 dark:bg-white/[0.03]">
                      {['Component', 'Expected', 'Collected', 'Status'].map(h => (
                        <th
                          key={h}
                          className={`border-b border-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:border-white/10 dark:text-slate-500 ${
                            h === 'Component' ? 'text-left' : 'text-center'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {Object.entries(compMap).map(([type, data]) => {
                      const ok = data.actual >= data.expected

                      return (
                        <tr key={type} className="transition-colors hover:bg-sky-50/50 dark:hover:bg-white/[0.035]">
                          <td className="border-b border-slate-100 px-4 py-3 font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">
                            {COMP_LABELS[type] ?? type}
                          </td>

                          <td className="border-b border-slate-100 px-4 py-3 text-center font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                            {data.expected} {data.unit}
                          </td>

                          <td className="border-b border-slate-100 px-4 py-3 text-center font-black text-slate-800 dark:border-white/10 dark:text-slate-100">
                            {data.actual} {data.unit}
                          </td>

                          <td className="border-b border-slate-100 px-4 py-3 text-center dark:border-white/10">
                            <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-black ${ok ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20' : 'bg-orange-50 text-orange-700 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20'}`}>
                              {ok ? 'Complete' : `Short ${data.expected - data.actual}`}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 dark:border-white/10">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
            </p>

            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              Globe Telecom · Skycable Operations
            </p>
          </div>
        </div>
      </div>
    </>
  )
}