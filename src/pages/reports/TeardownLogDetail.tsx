import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

declare const L: any

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpanComponent {
  id: number
  span_id: number
  component_type: 'node' | 'amplifier' | 'extender' | 'tsc' | 'cable' | 'powersupply' | 'powersupply_case'
  expected_count: number | string
  actual_count: number | string
  unit: string
}

interface TeardownDetail {
  id: number
  span_id: number
  team_id: number | null
  lineman_id: number
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  expected_cable: number | string
  actual_cable: number | string
  status: string
  offline_mode: boolean
  notes: string | null
  before_photo: string | null
  after_photo: string | null
  pole_tag_photo: string | null
  bunching_photo: string | null
  captured_lat: number | string | null
  captured_lng: number | string | null
  received_at_server: string | null
  rejection_reason: string | null
  created_at: string
  span: {
    id: number
    span_code: string | null
    length_meters: number | string
    status: string
    node_id: number
    fromPole: {
      id: number
      pole: { id: number; pole_code: string; lat: number | string | null; lng: number | string | null } | null
    } | null
    toPole: {
      id: number
      pole: { id: number; pole_code: string; lat: number | string | null; lng: number | string | null } | null
    } | null
    components: SpanComponent[]
  } | null
  team: { id: number; name: string } | null
  lineman: { id: number; first_name: string; last_name: string } | null
  photos: Array<{ id: number; photo_type: string; image_path: string }>
  slots: Array<{ id: number; pole_id: number; slot_label: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: string | number | null | undefined, dec = 2) {
  return Number(n ?? 0)
    .toFixed(dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function workSpan(start: string | null, end: string | null) {
  if (!start || !end) return '—'
  const mins = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return [h > 0 ? `${h}h` : '', m > 0 || !h ? `${m}m` : ''].filter(Boolean).join(' ')
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function statusTone(ok: boolean) {
  return ok
    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800/60'
    : 'bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/25 dark:text-orange-300 dark:border-orange-800/60'
}

const COMP_LABELS: Record<string, string> = {
  node: 'Node', amplifier: 'Amplifier', extender: 'Extender',
  tsc: 'TSC', cable: 'Cable', powersupply: 'Power Supply', powersupply_case: 'PS Case',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeardownLogDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const cacheKey = `tdlog_${id}`

  const [log, setLog]       = useState<TeardownDetail | null>(() => cacheGet<TeardownDetail>(cacheKey))
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const mapRef      = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const lineRef     = useRef<any>(null)
  const [lineOn, setLineOn] = useState(true)

  useEffect(() => {
    if (log) setLoading(false)

    fetch(`${SKYCABLE_API}/teardowns/${id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
    })
      .then(r => r.json())
      .then(data => {
        if (data?.id) {
          cacheSet(cacheKey, data)
          setLog(data)
        } else if (!log) {
          setError('Log not found')
        }
      })
      .catch(() => { if (!log) setError('Failed to load teardown log') })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!log || !mapRef.current || mapInstance.current) return
    if (typeof L === 'undefined') return

    const fromLat = Number(log.span?.fromPole?.pole?.lat ?? 0)
    const fromLng = Number(log.span?.fromPole?.pole?.lng ?? 0)
    const toLat   = Number(log.span?.toPole?.pole?.lat ?? 0)
    const toLng   = Number(log.span?.toPole?.pole?.lng ?? 0)
    const hasGps  = (fromLat && fromLng) || (toLat && toLng)
    if (!hasGps) return

    const pts = [[fromLat, fromLng], [toLat, toLng]].filter(([a, b]) => a && b)
    const centerLat = pts.reduce((s, [a]) => s + a, 0) / pts.length
    const centerLng = pts.reduce((s, [, b]) => s + b, 0) / pts.length

    const map = L.map(mapRef.current, { zoomControl: true }).setView([centerLat, centerLng], 17)
    mapInstance.current = map

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '© Esri', maxZoom: 20 }
    ).addTo(map)

    function makeIcon(color: string) {
      return L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;background:${color};border:3px solid rgba(255,255,255,.96);box-shadow:0 8px 20px rgba(0,0,0,.28);transform:rotate(-45deg)"></div>`,
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -36],
      })
    }

    const fromCode = log.span?.fromPole?.pole?.pole_code ?? '?'
    const toCode   = log.span?.toPole?.pole?.pole_code   ?? '?'
    const bounds: [number, number][] = []

    if (fromLat && fromLng) {
      L.marker([fromLat, fromLng], { icon: makeIcon('#2563eb') })
        .addTo(map)
        .bindPopup(`<div style="padding:10px;min-width:160px"><div style="font-size:10px;color:#2563eb;font-weight:800;text-transform:uppercase;letter-spacing:.1em">From Pole</div><div style="font-size:15px;font-weight:900;color:#111">${fromCode}</div><div style="font-size:11px;color:#555;margin-top:4px">${fromLat.toFixed(6)}, ${fromLng.toFixed(6)}</div></div>`, { maxWidth: 240 })
      bounds.push([fromLat, fromLng])
    }

    if (toLat && toLng) {
      L.marker([toLat, toLng], { icon: makeIcon('#7c3aed') })
        .addTo(map)
        .bindPopup(`<div style="padding:10px;min-width:160px"><div style="font-size:10px;color:#7c3aed;font-weight:800;text-transform:uppercase;letter-spacing:.1em">To Pole</div><div style="font-size:15px;font-weight:900;color:#111">${toCode}</div><div style="font-size:11px;color:#555;margin-top:4px">${toLat.toFixed(6)}, ${toLng.toFixed(6)}</div></div>`, { maxWidth: 240 })
      bounds.push([toLat, toLng])
    }

    if (fromLat && fromLng && toLat && toLng) {
      const line = L.polyline([[fromLat, fromLng], [toLat, toLng]], {
        color: '#2563eb', weight: 5, opacity: 0.88, dashArray: '10 8',
      }).addTo(map)
      lineRef.current = line
    }

    setTimeout(() => {
      map.invalidateSize()
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 })
      else if (bounds.length === 1) map.setView(bounds[0], 18)
    }, 120)

    return () => { map.remove(); mapInstance.current = null }
  }, [log])

  function toggleLine() {
    const map  = mapInstance.current
    const line = lineRef.current
    if (!map || !line) return
    if (map.hasLayer(line)) { map.removeLayer(line); setLineOn(false) }
    else { line.addTo(map); setLineOn(true) }
  }

  if (loading && !log) {
    return (
      <div className="flex items-center justify-center py-28">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !log) {
    return (
      <div className="flex items-center justify-center py-28">
        <p className="text-sm font-medium text-red-500">{error ?? 'Log not found'}</p>
      </div>
    )
  }

  const fromCode   = log.span?.fromPole?.pole?.pole_code ?? '?'
  const toCode     = log.span?.toPole?.pole?.pole_code   ?? '?'
  const spanCode   = log.span?.span_code ?? `Log #${log.id}`
  const cableCol   = Number(log.actual_cable ?? 0)
  const cableExp   = Number(log.expected_cable ?? 0)
  const cablePct   = cableExp > 0 ? Math.min(100, Math.round((cableCol / cableExp) * 100)) : cableCol > 0 ? 100 : 0
  const allRecovered = cablePct >= 100

  const linemanName = log.lineman ? `${log.lineman.first_name} ${log.lineman.last_name}` : '—'
  const teamName    = log.team?.name ?? '—'
  const statusUpper = (log.status ?? 'pending').replace(/_/g, ' ').toUpperCase()

  const fromLat = Number(log.span?.fromPole?.pole?.lat ?? 0)
  const fromLng = Number(log.span?.fromPole?.pole?.lng ?? 0)
  const toLat   = Number(log.span?.toPole?.pole?.lat ?? 0)
  const toLng   = Number(log.span?.toPole?.pole?.lng ?? 0)
  const hasGps  = (fromLat && fromLng) || (toLat && toLng)

  const imgFor = (type: string) => log.photos?.find(p => p.photo_type === type)?.image_path ?? null
  const imgUrl = (path: string) => `${SKYCABLE_API.replace('/api/v1/skycable', '')}/api/files/${path}`

  // Components from span (exclude cable — shown separately)
  const spanComponents = (log.span?.components ?? []).filter(c => c.component_type !== 'cable')

  return (
    <div className="flex flex-col gap-5 pb-10">
      <button
        onClick={() => navigate('/reports/teardown-logs')}
        className="inline-flex items-center gap-2 self-start rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Back to Live Teardown Logs
      </button>

      {/* ── Hero banner ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[28px] bg-[#0d1117] shadow-2xl border border-white/5">
        <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 top-0 h-52 w-52 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-500" />

        <div className="relative grid gap-0 xl:grid-cols-[1fr_auto]">
          <div className="flex flex-col justify-between gap-6 p-6 xl:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/25">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Field recovery
              </span>
              {log.span?.node_id && (
                <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[11px] font-bold text-blue-400 ring-1 ring-blue-500/25">
                  Node #{log.span.node_id}
                </span>
              )}
              <span className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-bold text-zinc-400 ring-1 ring-white/10">
                {statusUpper}
              </span>
              {log.offline_mode && (
                <span className="rounded-full bg-orange-500/15 px-3 py-1 text-[11px] font-bold text-orange-400 ring-1 ring-orange-500/25">
                  Offline
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black tracking-tight text-white xl:text-5xl">{fromCode}</span>
                <span className="flex items-center justify-center rounded-2xl bg-white/8 px-3 py-1.5">
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-zinc-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
                <span className="text-4xl font-black tracking-tight text-white xl:text-5xl">{toCode}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-white/6 px-2.5 py-1 text-xs font-semibold text-zinc-400">{spanCode}</span>
                {log.span?.length_meters && (
                  <span className="rounded-xl bg-white/6 px-2.5 py-1 text-xs font-semibold text-zinc-400">
                    {Number(log.span.length_meters).toLocaleString()} m span
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-white/6 xl:border-l xl:border-t-0 xl:grid-cols-1 xl:w-64">
            {[
              { label: 'COLLECTED',    value: `${fmt(cableCol)} m`,  sub: `Expected ${fmt(cableExp)} m`,            color: 'text-emerald-400' },
              { label: 'RECOVERY',     value: `${cablePct}%`,        sub: allRecovered ? 'Complete recovery' : 'Partial recovery', color: 'text-blue-400' },
              { label: 'SUBMITTED BY', value: linemanName,           sub: teamName,                                 color: 'text-violet-400' },
              { label: 'WORK SPAN',    value: workSpan(log.start_time, log.end_time), sub: log.start_time ? fmtDate(log.start_time) : 'Not recorded', color: 'text-amber-400' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="flex flex-col justify-center gap-1 bg-white/[0.03] px-5 py-4 xl:border-b xl:border-white/6 last:border-0">
                <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                <span className="text-base font-black text-white leading-tight">{value}</span>
                <span className="text-[11px] font-medium text-zinc-500 truncate">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cable recovery + map ───────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 bg-gradient-to-r from-white to-emerald-50/40 px-5 py-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">Cable recovery overview</h2>
              <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {log.received_at_server ? `Uploaded: ${fmtDate(log.received_at_server)}` : 'Upload time unavailable'}
              </p>
            </div>
            <span className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-bold ${statusTone(allRecovered)}`}>
              {allRecovered ? 'All cable recovered' : 'Partial recovery'}
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.4fr]">
            <div className="flex flex-col gap-3">
              <MetricRow label="Collected"   value={`${fmt(cableCol)} m`}        accent="emerald" />
              <MetricRow label="Expected"    value={`${fmt(cableExp)} m`}        accent="blue" />
              <MetricRow label="Unrecovered" value={`${fmt(cableExp - cableCol > 0 ? cableExp - cableCol : 0)} m`} accent="orange" />
              {log.notes && <MetricRow label="Notes" value={log.notes} accent="zinc" />}

              <div className="rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <span>Recovery performance</span>
                  <span>{cablePct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className={`h-full rounded-full ${cablePct >= 100 ? 'bg-emerald-500' : cablePct >= 80 ? 'bg-blue-500' : 'bg-orange-500'}`}
                    style={{ width: `${cablePct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {hasGps ? (
                <div className="overflow-hidden rounded-[24px] border border-zinc-200 bg-zinc-50 shadow-inner dark:border-zinc-700 dark:bg-zinc-800/40">
                  <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200">Live span map</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.span?.length_meters && (
                        <span className="rounded-xl bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                          {Number(log.span.length_meters).toLocaleString()} m
                        </span>
                      )}
                      <button
                        onClick={toggleLine}
                        className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${lineOn ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300'}`}
                      >
                        Line {lineOn ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <div ref={mapRef} className="h-[320px] w-full xl:h-[400px]" />
                    <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
                      <MapChip tone="blue">From: {fromCode}</MapChip>
                      <MapChip tone="violet">To: {toCode}</MapChip>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="rounded-xl bg-black/65 px-3 py-2 text-xs font-medium text-white backdrop-blur">
                        {fromLat && fromLng ? `From ${fromLat.toFixed(6)}, ${fromLng.toFixed(6)}` : 'From GPS unavailable'}
                      </div>
                      <div className="rounded-xl bg-black/65 px-3 py-2 text-xs font-medium text-white backdrop-blur">
                        {toLat && toLng ? `To ${toLat.toFixed(6)}, ${toLng.toFixed(6)}` : 'To GPS unavailable'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[24px] border border-dashed border-zinc-300 bg-gradient-to-b from-zinc-50 to-white text-center dark:border-zinc-700 dark:from-zinc-800 dark:to-zinc-900">
                  <div className="mb-3 rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-800">
                    <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" className="text-zinc-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-4.35 7-11a7 7 0 10-14 0c0 6.65 7 11 7 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">No GPS coordinates recorded</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Map unavailable for this span</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Span components + Operational metadata ─────────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 bg-gradient-to-r from-white to-blue-50/30 px-5 py-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">Recovered components</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Hardware collected vs. expected per span</p>
          </div>

          <div className="grid gap-3 p-5">
            {spanComponents.length === 0 && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-6">No component data for this span.</p>
            )}
            {spanComponents.map(comp => {
              const col  = Number(comp.actual_count ?? 0)
              const exp  = Number(comp.expected_count ?? 0)
              const ok   = col >= exp
              const short = Math.max(0, exp - col)
              const label = COMP_LABELS[comp.component_type] ?? comp.component_type

              return (
                <div
                  key={comp.id}
                  className="grid items-center gap-3 rounded-[22px] border border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-4 py-4 shadow-sm dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-800 sm:grid-cols-[52px_minmax(0,1fr)_90px_120px]"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black ${ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                    {label.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">{label}</div>
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Expected {exp} {comp.unit}</div>
                  </div>
                  <div className="text-right text-lg font-black text-zinc-900 dark:text-zinc-100">
                    {col} <span className="text-zinc-400">/ {exp}</span>
                  </div>
                  <div className="flex justify-end">
                    <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${statusTone(ok)}`}>
                      {ok ? 'Complete' : `Short by ${short}`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 bg-gradient-to-r from-white to-violet-50/30 px-5 py-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">Operational metadata</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Assignment and timing details</p>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[
              { label: 'Span',         value: spanCode },
              { label: 'Team',         value: teamName },
              { label: 'Submitted by', value: linemanName },
              { label: 'Status',       value: statusUpper },
              { label: 'Started',      value: fmtDate(log.start_time) },
              { label: 'Finished',     value: fmtDate(log.end_time) },
              { label: 'Duration',     value: log.duration_minutes ? `${log.duration_minutes} min` : workSpan(log.start_time, log.end_time) },
              { label: 'Received',     value: fmtDate(log.received_at_server) },
              { label: 'Offline capture', value: log.offline_mode ? 'Yes' : 'No' },
              ...(log.rejection_reason ? [{ label: 'Rejection reason', value: log.rejection_reason }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 shrink-0">{label}</span>
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 text-right truncate">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Photo documentation ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* From pole */}
        <PolePhoPanel
          title="From pole"
          poleCode={fromCode}
          tone="blue"
          photos={[
            { label: 'Before',   src: imgFor('from_before')   },
            { label: 'After',    src: imgFor('from_after')    },
            { label: 'Pole Tag', src: imgFor('from_pole_tag') },
          ]}
          imgUrl={imgUrl}
          onZoom={setLightbox}
        />

        {/* To pole */}
        <PolePhoPanel
          title="To pole"
          poleCode={toCode}
          tone="violet"
          photos={[
            { label: 'Before',   src: imgFor('to_before')   },
            { label: 'After',    src: imgFor('to_after')    },
            { label: 'Pole Tag', src: imgFor('to_pole_tag') },
          ]}
          imgUrl={imgUrl}
          onZoom={setLightbox}
        />
      </div>

      {/* Bunching — span-wide */}
      {(() => {
        const src = imgFor('bunching')
        return (
          <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">Bunching</h2>
              <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Span-wide — {fromCode} → {toCode}</p>
            </div>
            <div className="p-4">
              <div
                className={`group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-950 max-w-sm ${src ? 'cursor-zoom-in hover:ring-2 hover:ring-amber-400/40' : ''}`}
                onClick={() => src && setLightbox(imgUrl(src))}
              >
                {src ? (
                  <>
                    <img src={imgUrl(src)} alt="Bunching" className="w-full h-52 object-contain transition duration-300 group-hover:brightness-90" />
                    <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/75 to-transparent">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Bunching</span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-52 flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-zinc-800/50">
                    <svg className="text-zinc-300 dark:text-zinc-600 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M9.75 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                    </svg>
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">No bunching photo</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )
      })()}

      {lightbox && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl text-white transition hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >×</button>
          <img
            src={lightbox}
            alt="Preview"
            className="max-h-[92vh] max-w-[94vw] rounded-3xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricRow({ label, value, accent }: { label: string; value: string; accent: 'emerald' | 'blue' | 'orange' | 'zinc' }) {
  const accents = { emerald: 'bg-emerald-500', blue: 'bg-blue-500', orange: 'bg-orange-500', zinc: 'bg-zinc-400' }
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <span className={`h-9 w-1.5 rounded-full ${accents[accent]}`} />
        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{label}</span>
      </div>
      <span className="max-w-[55%] text-right text-sm font-black text-zinc-900 dark:text-zinc-100">{value}</span>
    </div>
  )
}

function MapChip({ children, tone }: { children: ReactNode; tone: 'blue' | 'violet' }) {
  const styles = tone === 'blue' ? 'bg-blue-600/90 text-white' : 'bg-violet-600/90 text-white'
  return <span className={`rounded-full px-3 py-1 text-[11px] font-bold backdrop-blur ${styles}`}>{children}</span>
}

function PolePhoPanel({
  title, poleCode, tone, photos, imgUrl, onZoom,
}: {
  title: string
  poleCode: string
  tone: 'blue' | 'violet'
  photos: { label: string; src: string | null }[]
  imgUrl: (path: string) => string
  onZoom: (src: string) => void
}) {
  const accent = tone === 'blue'
    ? { badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', ring: 'hover:ring-blue-400/40', bar: 'from-white to-blue-50/40 dark:to-zinc-900' }
    : { badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', ring: 'hover:ring-violet-400/40', bar: 'from-white to-violet-50/40 dark:to-zinc-900' }

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className={`flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r ${accent.bar}`}>
        <div>
          <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">{title}</h2>
          <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 mt-0.5">Before · After · Pole Tag</p>
        </div>
        <span className={`rounded-2xl px-3.5 py-1.5 text-xs font-black tracking-wide ${accent.badge}`}>{poleCode}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 p-4">
        {photos.map(({ label, src }) => (
          <div
            key={label}
            className={`group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-950 transition hover:-translate-y-0.5 hover:shadow-lg ${src ? `cursor-zoom-in hover:ring-2 ${accent.ring}` : ''}`}
            onClick={() => src && onZoom(imgUrl(src))}
          >
            {src ? (
              <>
                <img src={imgUrl(src)} alt={label} className="w-full h-44 object-contain transition duration-300 group-hover:brightness-90" />
                <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/75 to-transparent">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">{label}</span>
                </div>
              </>
            ) : (
              <div className="flex h-44 flex-col items-center justify-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/50">
                <svg className="text-zinc-300 dark:text-zinc-600 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M9.75 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                </svg>
                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide text-center px-2">{label}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

