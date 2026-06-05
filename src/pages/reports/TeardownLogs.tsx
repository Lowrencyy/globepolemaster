import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeardownLog {
  id: number
  span_id: number
  team_id: number | null
  lineman_id: number
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  expected_cable: number
  actual_cable: number
  status: string
  offline_mode: boolean
  notes: string | null
  created_at: string
  span: {
    id: number
    span_code: string | null
    length_meters: number | string
    status: string
    node: { id: number; name: string } | null
    fromPole: { id: number; pole: { id: number; pole_code: string } | null } | null
    toPole:   { id: number; pole: { id: number; pole_code: string } | null } | null
  } | null
  team: { id: number; name: string } | null
  lineman: { id: number; first_name: string; last_name: string } | null
  photos: Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }>
}

interface PoleReport {
  id: number
  pole_id: number
  node_id: number | null
  submitted_by: number
  condition: string | null
  material: string | null
  height_ft: string | null
  landmark: string | null
  notes: string | null
  latitude: number | null
  longitude: number | null
  gps_captured_at: string | null
  slots: any[] | null
  created_at: string
  pole: { id: number; pole_code: string } | null
  node: { id: number; name: string } | null
  submitter: {
    id: number
    first_name: string
    last_name: string
    team: { id: number; name: string } | null
  } | null
  photos: Array<{ id: number; image_type: string; file_path: string }> | null
}

// Combined feed item
type FeedItem =
  | { type: 'span'; data: TeardownLog }
  | { type: 'pole'; data: PoleReport }

function feedDate(item: FeedItem): number {
  const raw = item.type === 'span' ? item.data.created_at : item.data.created_at
  return new Date(raw).getTime()
}

const SPAN_PHOTO_ALIASES: Record<string, string[]> = {
  from_before: ['from_before', 'from_before_photo'],
  from_after: ['from_after', 'from_after_photo'],
  from_pole_tag: ['from_pole_tag', 'from_pole_tag_photo'],
  to_before: ['to_before', 'to_before_photo'],
  to_after: ['to_after', 'to_after_photo'],
  to_pole_tag: ['to_pole_tag', 'to_pole_tag_photo'],
  bunching: ['bunching', 'bunching_photo'],
}

function imgUrl(path: string | null | undefined) {
  const clean = path?.trim()
  if (!clean) return null
  if (/^https?:\/\//i.test(clean)) return clean
  if (clean.startsWith('//')) return `https:${clean}`
  if (clean.startsWith(API_BASE)) return clean
  if (clean.startsWith('/api/v1/files/')) return `${API_BASE}${clean}`
  if (clean.startsWith('api/v1/files/')) return `${API_BASE}/${clean}`
  return `${API_BASE}/api/v1/files/${clean.replace(/^\/+/, '')}`
}

function findSpanPhoto(
  photos: Array<{ photo_type: string; image_path?: string | null; file_path?: string | null }> | null | undefined,
  type: string,
) {
  const allowed = new Set((SPAN_PHOTO_ALIASES[type] ?? [type]).map((item) => item.toLowerCase()))
  return photos?.find((photo) => allowed.has(String(photo.photo_type ?? '').trim().toLowerCase())) ?? null
}

// Module-level blob cache — survives SPA nav, avoids re-downloading on revisit
const _imgCache = new Map<string, string>()
const _imgFlight = new Map<string, Promise<string | null>>()

// Per-pole-report photo cache — keyed by report id, stores correct photos from individual endpoint
const _polePhotoCache = new Map<number, Array<{ id: number; image_type: string; file_path: string }>>()
const _polePhotoFlight = new Map<number, Promise<Array<{ id: number; image_type: string; file_path: string }>>>()

// Per-span-teardown photo cache — keyed by log id, stores correct photos from individual endpoint
const _spanPhotoCache = new Map<number, Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }>>()
const _spanPhotoFlight = new Map<number, Promise<Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }>>>()

function fetchCachedBlob(src: string): Promise<string | null> {
  const hit = _imgCache.get(src)
  if (hit) return Promise.resolve(hit)
  const inflight = _imgFlight.get(src)
  if (inflight) return inflight
  const p = fetch(src, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
    .then(r => {
      if (!r.ok) throw new Error(`Image request failed: ${r.status}`)
      return r.blob()
    })
    .then(blob => { const u = URL.createObjectURL(blob); _imgCache.set(src, u); return u })
    .catch(() => null)
    .finally(() => _imgFlight.delete(src))
  _imgFlight.set(src, p)
  return p
}

function SafeImage({ src, alt, className, style, onClick }: {
  src: string | null
  alt?: string
  className?: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => src ? (_imgCache.get(src) ?? null) : null)
  const [loading, setLoading] = useState(() => !!src && !_imgCache.has(src))

  useEffect(() => {
    if (!src) return
    if (_imgCache.has(src)) { setBlobUrl(_imgCache.get(src)!); setLoading(false); return }
    let alive = true
    setLoading(true)
    fetchCachedBlob(src).then(u => { if (!alive) return; setBlobUrl(u); setLoading(false) })
    return () => { alive = false }
  }, [src])

  if (!src) return null

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-100 animate-pulse`}>
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <img
      src={blobUrl || src}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function collectionPct(log: TeardownLog) {
  if (!log.expected_cable || log.expected_cable === 0) return null
  return Math.round((log.actual_cable / log.expected_cable) * 100)
}

function pctBadge(pct: number) {
  if (pct >= 100) return { bg: 'bg-green-500/15 text-green-600 dark:text-green-400',  label: `${pct}%` }
  if (pct >= 80)  return { bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',    label: `${pct}%` }
  return              { bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',  label: `${pct}%` }
}

function statusColor(status: string) {
  switch (status) {
    case 'backend_approved': return 'bg-green-500/15 text-green-600 dark:text-green-400'
    case 'subcon_approved':  return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'submitted':        return 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
    case 'rejected':         return 'bg-red-500/15 text-red-600 dark:text-red-400'
    default:                 return 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
  }
}

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  })

// ── Mini photo thumb ──────────────────────────────────────────────────────────

function MiniPhoto({ src, label }: { src: string | null; label: string }) {
  if (!src) {
    return (
      <div className="relative flex-1 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800" style={{ aspectRatio: '1' }}>
        <div className="flex h-full flex-col items-center justify-center gap-0.5">
          <svg className="h-4 w-4 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M9.75 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
          </svg>
          <span className="text-[8px] font-bold uppercase tracking-wide text-zinc-300 dark:text-zinc-600">{label}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="relative flex-1 overflow-hidden rounded-xl bg-zinc-900" style={{ aspectRatio: '1' }}>
      <SafeImage src={src} alt={label} className="h-full w-full object-cover" />
      <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[8px] font-black uppercase tracking-wide text-white">{label}</span>
    </div>
  )
}

// ── Span teardown card ────────────────────────────────────────────────────────

function fetchSpanPhotos(id: number): Promise<Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }>> {
  if (_spanPhotoCache.has(id)) return Promise.resolve(_spanPhotoCache.get(id)!)
  const inflight = _spanPhotoFlight.get(id)
  if (inflight) return inflight
  const p = fetch(`${SKYCABLE_API}/teardowns/${id}`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      const item = data?.data ?? data
      const photos: Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }> = item?.photos ?? []
      _spanPhotoCache.set(id, photos)
      return photos
    })
    .catch(() => {
      _spanPhotoCache.set(id, [])
      return [] as Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }>
    })
    .finally(() => _spanPhotoFlight.delete(id))
  _spanPhotoFlight.set(id, p)
  return p
}

function SpanCard({ log, seq }: { log: TeardownLog; seq: number }) {
  const navigate = useNavigate()
  const pct     = collectionPct(log)
  const spanCode = log.span?.span_code ?? `Log #${log.id}`
  const lineman  = log.lineman ? `${log.lineman.first_name} ${log.lineman.last_name}` : null
  const nodeName = log.span?.node?.name ?? null

  const fromPole = log.span?.fromPole || (log.span as any)?.from_pole
  const toPole   = log.span?.toPole   || (log.span as any)?.to_pole
  const fromCode = fromPole?.pole?.pole_code ?? '—'
  const toCode   = toPole?.pole?.pole_code   ?? '—'

  // Fetch correct photos from individual endpoint (list endpoint omits photos)
  const [photos, setPhotos] = useState<Array<{ id: number; photo_type: string; image_path?: string | null; file_path?: string | null }>>(
    () => _spanPhotoCache.get(log.id) ?? []
  )

  useEffect(() => {
    if (_spanPhotoCache.has(log.id)) return
    fetchSpanPhotos(log.id).then(setPhotos)
  }, [log.id])

  const p = (type: string) => {
    const found = findSpanPhoto(photos, type)
    return imgUrl(found?.image_path ?? found?.file_path)
  }

  return (
    <div
      onClick={() => navigate(`/reports/teardown-logs/${log.id}`)}
      className="group flex h-[360px] w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:ring-2 hover:ring-violet-400/40 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900"
    >
      {/* Top accent + header */}
      <div className="h-0.5 w-full shrink-0 bg-gradient-to-r from-blue-500 via-violet-500 to-indigo-500" />
      <div className="flex shrink-0 items-center justify-between gap-2 bg-[#0d1117] px-3.5 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/10 px-1.5 text-[9px] font-black text-white">#{seq}</span>
          <span className="font-mono text-[11px] font-bold text-zinc-300 truncate">{spanCode}</span>
        </div>
        <span className="shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-300">Full Report</span>
      </div>

      {/* Span poles row */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
        <span className="rounded-lg bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-black text-blue-600 dark:text-blue-400 truncate max-w-[42%]">{fromCode}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <span className="rounded-lg bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] font-black text-violet-600 dark:text-violet-400 truncate max-w-[42%]">{toCode}</span>
        <span className="ml-auto shrink-0 text-[9px] text-zinc-400">{timeAgo(log.created_at)}</span>
      </div>

      {/* 3 photos — To pole only, same layout as PoleCard */}
      <div className="flex flex-1 flex-col justify-center p-3">
        <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-violet-500">To · {toCode}</p>
        <div className="flex gap-1.5">
          <MiniPhoto src={p('to_before')}   label="Before" />
          <MiniPhoto src={p('to_after')}    label="After"  />
          <MiniPhoto src={p('to_pole_tag')} label="Tag"    />
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-zinc-100 px-3.5 py-2.5 dark:border-zinc-800">
        {nodeName && <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">{nodeName}</span>}
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{log.actual_cable}m cable</span>
        {pct !== null && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pctBadge(pct).bg}`}>{pct}%</span>}
        {lineman && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 truncate max-w-[100px]">{lineman}</span>}
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(log.status)}`}>{log.status.replace(/_/g, ' ')}</span>
      </div>
    </div>
  )
}

// ── Pole report card ──────────────────────────────────────────────────────────

function polePhotoUrl(filePath: string) {
  return imgUrl(filePath)
}

function fetchPolePhotos(id: number): Promise<Array<{ id: number; image_type: string; file_path: string }>> {
  if (_polePhotoCache.has(id)) return Promise.resolve(_polePhotoCache.get(id)!)
  const inflight = _polePhotoFlight.get(id)
  if (inflight) return inflight
  const p = fetch(`${SKYCABLE_API}/pole-reports/${id}`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      const photos: Array<{ id: number; image_type: string; file_path: string }> = data?.photos ?? []
      _polePhotoCache.set(id, photos)
      return photos
    })
    .catch(() => {
      _polePhotoCache.set(id, [])
      return [] as Array<{ id: number; image_type: string; file_path: string }>
    })
    .finally(() => _polePhotoFlight.delete(id))
  _polePhotoFlight.set(id, p)
  return p
}

function PoleCard({ report, seq }: { report: PoleReport; seq: number }) {
  const navigate = useNavigate()
  const poleCode  = report.pole?.pole_code ?? `Pole #${report.pole_id}`
  const nodeName  = report.node?.name ?? null
  const submitter = report.submitter
    ? `${report.submitter.first_name} ${report.submitter.last_name}`.trim()
    : null
  const teamName  = report.submitter?.team?.name ?? null
  const hasGps    = report.latitude !== null && report.longitude !== null

  // Fetch correct photos from individual endpoint (list endpoint returns wrong photo associations)
  const [photos, setPhotos] = useState<Array<{ id: number; image_type: string; file_path: string }>>(
    () => _polePhotoCache.get(report.id) ?? []
  )

  useEffect(() => {
    if (_polePhotoCache.has(report.id)) return
    fetchPolePhotos(report.id).then(setPhotos)
  }, [report.id])

  const beforePhoto = photos.find(p => p.image_type === 'before')
  const afterPhoto  = photos.find(p => p.image_type === 'after')
  const tagPhoto    = photos.find(p => p.image_type === 'pole_tag')

  return (
    <div
      onClick={() => navigate(`/reports/teardown-logs/${report.id}?type=pole`)}
      className="group flex h-[360px] w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:ring-2 hover:ring-emerald-400/40 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900"
    >
      {/* Top accent */}
      <div className="h-0.5 w-full shrink-0 bg-gradient-to-r from-emerald-400 via-teal-500 to-green-500" />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 bg-[#061a12] px-3.5 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/10 px-1.5 text-[9px] font-black text-white">#{seq}</span>
          <span className="font-mono text-[11px] font-bold text-emerald-300 truncate">{poleCode}</span>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Pole Report</span>
      </div>

      {/* Node + meta row */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
        <span className="truncate text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{nodeName ?? '—'}</span>
        {hasGps && <span className="ml-auto shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-600 dark:text-green-400">GPS ✓</span>}
        <span className="shrink-0 text-[9px] text-zinc-400">{timeAgo(report.created_at)}</span>
      </div>

      {/* 3 photos */}
      <div className="flex flex-1 flex-col justify-center p-3">
        <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">Pole Documentation</p>
        <div className="flex gap-1.5">
          <MiniPhoto src={beforePhoto ? polePhotoUrl(beforePhoto.file_path) : null} label="Before" />
          <MiniPhoto src={afterPhoto  ? polePhotoUrl(afterPhoto.file_path)  : null} label="After"  />
          <MiniPhoto src={tagPhoto    ? polePhotoUrl(tagPhoto.file_path)    : null} label="Tag"    />
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-zinc-100 px-3.5 py-2.5 dark:border-zinc-800">
        {submitter && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">{submitter}</span>}
        {teamName  && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 truncate max-w-[100px]">{teamName}</span>}
        {report.condition && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{report.condition}</span>}
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">Cleared</span>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const CACHE_KEY      = 'tdlogs_list'
const CACHE_KEY_POLE = 'tdlogs_pole_list'

export default function TeardownLogs() {
  const [spanLogs, setSpanLogs]   = useState<TeardownLog[]>(() => cacheGet<TeardownLog[]>(CACHE_KEY) ?? [])
  const [poleLogs, setPoleLogs]   = useState<PoleReport[]>(() => cacheGet<PoleReport[]>(CACHE_KEY_POLE) ?? [])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    let done = 0
    const finish = () => { if (++done === 2) setLoading(false) }

    // Span-based teardowns
    fetch(`${SKYCABLE_API}/teardowns`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const raw: TeardownLog[] = Array.isArray(data) ? data : (data?.data ?? [])
        const list = [...raw].sort((a, b) => {
          if (!a.start_time && !b.start_time) return a.id - b.id
          if (!a.start_time) return 1
          if (!b.start_time) return -1
          return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        })
        cacheSet(CACHE_KEY, list)
        setSpanLogs(list)
      })
      .catch(() => { if (!cacheGet(CACHE_KEY)) setError('Failed to load teardown logs') })
      .finally(finish)

    // Pole reports
    fetch(`${SKYCABLE_API}/pole-reports?per_page=100`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const raw: PoleReport[] = Array.isArray(data) ? data : (data?.data ?? [])
        console.log('[TeardownLogs] pole-reports response:', raw.map(r => ({
          id: r.id,
          pole: r.pole?.pole_code,
          photos: r.photos?.map(p => ({ image_type: p.image_type, file_path: p.file_path })),
        })))
        cacheSet(CACHE_KEY_POLE, raw)
        setPoleLogs(raw)
      })
      .catch(() => {})
      .finally(finish)
  }, [])

  // Merge + sort newest-first
  const feed: FeedItem[] = [
    ...spanLogs.map(d => ({ type: 'span' as const, data: d })),
    ...poleLogs.map(d => ({ type: 'pole' as const, data: d })),
  ].sort((a, b) => feedDate(b) - feedDate(a))

  const totalCount = feed.length
  const spanCount  = spanLogs.length
  const poleCount  = poleLogs.length

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="md:flex items-center justify-between px-0.5">
        <div>
          <h4 className="text-[18px] font-bold text-gray-800 dark:text-gray-100">Teardown Logs</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Live feed of all field teardown submissions</p>
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-1.5 rounded-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live Feed
          </span>
          <span className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-700 px-3 py-1.5 rounded-xl font-medium">
            {totalCount} records
          </span>
          <span className="text-xs text-violet-500 dark:text-violet-400 bg-violet-500/10 px-3 py-1.5 rounded-xl font-semibold">
            {spanCount} spans
          </span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl font-semibold">
            {poleCount} pole reports
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && feed.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500 dark:text-zinc-400">Loading teardown logs…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && feed.length === 0 && (
        <div className="text-center py-24 text-gray-400 dark:text-zinc-500 text-sm">No teardown logs found.</div>
      )}

      {/* Card grid */}
      {feed.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {feed.map((item, idx) => {
            if (item.type === 'span') {
              return <SpanCard key={`span-${item.data.id}`} log={item.data} seq={idx + 1} />
            }
            return <PoleCard key={`pole-${item.data.id}`} report={item.data} seq={idx + 1} />
          })}
        </div>
      )}
    </div>
  )
}
