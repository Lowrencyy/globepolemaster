import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Shared types ──────────────────────────────────────────────────────────────

interface SpanPhoto {
  id?: number
  photo_type?: string | null
  image_type?: string | null
  type?: string | null
  attachment_type?: string | null
  field_name?: string | null
  name?: string | null
  image_path?: string | null
  file_path?: string | null
  path?: string | null
  url?: string | null
  image_url?: string | null
  file_url?: string | null
  full_url?: string | null
  original_url?: string | null
  pole_id?: number | string | null
  pole?: { id?: number | string | null } | null
}

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
  nodes_collected: number | null
  amplifiers_collected: number | null
  extenders_collected: number | null
  tsc_collected: number | null
  powersupply_collected: number | null
  ps_housing_collected: number | null
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
    fromPole: { id: number; pole: { id: number; pole_code: string; lat?: number | null; lng?: number | null } | null } | null
    toPole:   { id: number; pole: { id: number; pole_code: string; lat?: number | null; lng?: number | null } | null } | null
    from_pole?: { id: number; pole_id?: number | null; pole?: { id: number; pole_code: string; lat?: number | null; lng?: number | null } | null } | null
    to_pole?: { id: number; pole_id?: number | null; pole?: { id: number; pole_code: string; lat?: number | null; lng?: number | null } | null } | null
  } | null
  team: { id: number; name: string } | null
  lineman: { id: number; first_name: string; last_name: string } | null
  photos: SpanPhoto[]
}

interface PoleReportDetail {
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
  slots: unknown[] | null
  created_at: string
  pole: { id: number; pole_code: string; lat?: number | null; lng?: number | null } | null
  node: { id: number; name: string } | null
  submitter: {
    id: number
    first_name: string
    last_name: string
    team?: { id: number; name: string } | null
  } | null
  photos: Array<{ id: number; image_type: string; file_path: string }> | null
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const authH = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  })

const SPAN_PHOTO_ALIASES: Record<string, string[]> = {
  from_before: ['from_before', 'from_before_photo'],
  from_after: ['from_after', 'from_after_photo'],
  from_pole_tag: ['from_pole_tag', 'from_pole_tag_photo'],
  to_before: ['to_before', 'to_before_photo'],
  to_after: ['to_after', 'to_after_photo'],
  to_pole_tag: ['to_pole_tag', 'to_pole_tag_photo'],
  bunching: ['bunching', 'bunching_photo'],
}

const GENERIC_SPAN_PHOTO_ALIASES: Record<string, string[]> = {
  before: ['before', 'before_photo'],
  after: ['after', 'after_photo'],
  pole_tag: ['pole_tag', 'pole_tag_photo', 'tag', 'tag_photo'],
  bunching: ['bunching', 'bunching_photo'],
}

function imgUrl(path: string | null | undefined): string | null {
  const clean = path?.trim().replace(/\\/g, '/')
  if (!clean) return null
  if (/^https?:\/\//i.test(clean)) return clean
  if (clean.startsWith('//')) return `https:${clean}`
  if (clean.startsWith(API_BASE)) return clean
  if (clean.startsWith('/api/v1/files/')) return `${API_BASE}${encodeURI(clean)}`
  if (clean.startsWith('api/v1/files/')) return `${API_BASE}/${encodeURI(clean)}`

  const storageRelative = clean
    .replace(/^\/+/, '')
    .replace(/^public\/storage\//i, '')
    .replace(/^storage\//i, '')

  return `${API_BASE}/api/v1/files/${encodeURI(storageRelative)}`
}

function storagePhotoUrl(siteName: string | null | undefined, poleCode: string, fileBase: string, kind: 'before' | 'after' | 'poletag') {
  const cleanSite = siteName?.trim()
  const cleanPole = storageFolderName(poleCode)
  const cleanFileBase = fileBase.trim()
  if (!cleanSite || !cleanPole || !cleanFileBase || cleanPole === '—') return null
  return imgUrl(`DEMO SITES/${cleanSite}/${cleanPole}/${cleanFileBase}_${kind}.jpg`)
}

function storageFolderName(poleCode: string) {
  const clean = poleCode.trim()
  if (clean.toLowerCase() === 'tapat bahayy') return 'tapat bahay'
  return clean
}

function storagePhotoCandidates(siteName: string | null | undefined, poleCode: string, poleId: number | string | null | undefined, kind: 'before' | 'after' | 'poletag') {
  const fileBases = [
    storageFolderName(poleCode),
    poleId !== null && poleId !== undefined ? String(poleId) : null,
    storageFolderName(poleCode).toLowerCase() === 'tapat bahay' ? '3' : null,
  ].filter((item): item is string => Boolean(item))

  const candidates = fileBases
    .map(fileBase => storagePhotoUrl(siteName, poleCode, fileBase, kind))
    .filter((item): item is string => Boolean(item))

  return Array.from(new Set(candidates))
}

function imageCandidates(
  primary: string | null,
  ...fallbacks: Array<unknown>
) {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (value: unknown) => {
    if (typeof value !== 'string') return
    const clean = value.trim()
    if (!clean || seen.has(clean)) return
    seen.add(clean)
    out.push(clean)
  }

  push(primary)

  for (const fallback of fallbacks) {
    if (Array.isArray(fallback)) {
      for (const item of fallback) push(item)
      continue
    }
    push(fallback)
  }

  return out
}

function photoKind(type: string) {
  if (type.includes('before')) return 'before'
  if (type.includes('after')) return 'after'
  if (type.includes('tag')) return 'pole_tag'
  return type
}

function normalizeId(id: number | string | null | undefined) {
  if (id === null || id === undefined || id === '') return null
  const n = Number(id)
  return Number.isFinite(n) ? n : null
}

function photoType(photo: SpanPhoto) {
  return String(
    photo.photo_type ??
    photo.image_type ??
    photo.type ??
    photo.attachment_type ??
    photo.field_name ??
    photo.name ??
    '',
  ).trim().toLowerCase()
}

function photoPath(photo: SpanPhoto | null | undefined) {
  return photo?.image_path ??
    photo?.file_path ??
    photo?.path ??
    photo?.url ??
    photo?.image_url ??
    photo?.file_url ??
    photo?.full_url ??
    photo?.original_url ??
    null
}

function photoPoleId(photo: SpanPhoto) {
  return normalizeId(photo.pole_id ?? photo.pole?.id)
}

function findSpanPhoto(photos: SpanPhoto[] | null | undefined, type: string, poleId?: number | string | null) {
  if (!photos?.length) return null

  const exactAllowed = new Set((SPAN_PHOTO_ALIASES[type] ?? [type]).map((item) => item.toLowerCase()))
  const exact = photos.find((photo) => exactAllowed.has(photoType(photo)))
  if (exact) return exact

  const wantedPoleId = normalizeId(poleId)
  const genericAllowed = new Set((GENERIC_SPAN_PHOTO_ALIASES[photoKind(type)] ?? [photoKind(type)]).map((item) => item.toLowerCase()))
  const genericMatches = photos.filter((photo) => genericAllowed.has(photoType(photo)))

  if (wantedPoleId !== null) {
    const poleMatch = genericMatches.find((photo) => photoPoleId(photo) === wantedPoleId)
    if (poleMatch) return poleMatch
  }

  const sideIndex = type.startsWith('to_') ? 1 : 0
  return genericMatches[sideIndex] ?? genericMatches[0] ?? null
}

function isSpanPhoto(value: unknown): value is SpanPhoto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const hasPath = ['image_path', 'file_path', 'path', 'url', 'image_url', 'file_url', 'full_url', 'original_url']
    .some((key) => typeof item[key] === 'string' && String(item[key]).trim() !== '')
  const hasType = ['photo_type', 'image_type', 'type', 'attachment_type', 'field_name', 'name']
    .some((key) => typeof item[key] === 'string' && String(item[key]).trim() !== '')
  return hasPath && hasType
}

function collectSpanPhotos(source: unknown): SpanPhoto[] {
  const collected: SpanPhoto[] = []
  const seen = new Set<unknown>()
  const photoKeys = new Set(['photos', 'attachments', 'evidence', 'images', 'teardown_log_images', 'teardown_images'])

  function directPhotoType(key: string) {
    const lower = key.toLowerCase()
    if (!lower.includes('photo') && !lower.includes('image')) return null
    const normalized = lower
      .replace(/_(path|url|file|image)$/g, '')
      .replace(/^(photo|image)_/g, '')
    if (normalized.includes('before')) return normalized.includes('to_') ? 'to_before_photo' : normalized.includes('from_') ? 'from_before_photo' : 'before'
    if (normalized.includes('after')) return normalized.includes('to_') ? 'to_after_photo' : normalized.includes('from_') ? 'from_after_photo' : 'after'
    if (normalized.includes('tag')) return normalized.includes('to_') ? 'to_pole_tag_photo' : normalized.includes('from_') ? 'from_pole_tag_photo' : 'pole_tag'
    return null
  }

  function visit(value: unknown, forceArray = false) {
    if (!value || seen.has(value)) return
    if (typeof value === 'object') seen.add(value)

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, forceArray))
      return
    }

    if (isSpanPhoto(value)) {
      collected.push(value)
      return
    }

    if (typeof value !== 'object') return
    const obj = value as Record<string, unknown>
    for (const [key, child] of Object.entries(obj)) {
      const inferredType = directPhotoType(key)
      if (inferredType && typeof child === 'string' && child.trim() !== '') {
        collected.push({ photo_type: inferredType, file_path: child })
      }
      if (photoKeys.has(key) || forceArray) visit(child, true)
    }
  }

  visit(source)
  return collected
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDateTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

// Module-level image blob cache — survives SPA nav, no re-download on revisit
const _imgCache = new Map<string, string>()
const _imgFlight = new Map<string, Promise<string | null>>()

function fetchCachedBlob(src: string): Promise<string | null> {
  const hit = _imgCache.get(src)
  if (hit) return Promise.resolve(hit)
  const inflight = _imgFlight.get(src)
  if (inflight) return inflight
  const p = fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => {
      if (!r.ok) throw new Error(`Image request failed: ${r.status}`)
      const contentType = r.headers.get('content-type')?.toLowerCase() ?? ''
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(`Image request returned ${contentType}`)
      }
      return r.blob()
    })
    .then(blob => {
      if (blob.size === 0) throw new Error('Image request returned an empty file')
      const u = URL.createObjectURL(blob)
      _imgCache.set(src, u)
      return u
    })
    .catch(() => null)
    .finally(() => _imgFlight.delete(src))
  _imgFlight.set(src, p)
  return p
}

function SafeImage({
  src, alt, className, style, onClick, onResolved,
}: {
  src: string | string[]
  alt?: string
  className?: string
  style?: CSSProperties
  onClick?: (e: MouseEvent) => void
  onResolved?: (src: string) => void
}) {
  const sources = Array.isArray(src) ? src : [src]
  const [sourceIndex, setSourceIndex] = useState(0)
  const activeSrc = sources[sourceIndex] ?? sources[0]
  const [blobUrl, setBlobUrl] = useState<string | null>(() => _imgCache.get(activeSrc) ?? null)
  const [loading, setLoading] = useState(!_imgCache.has(activeSrc))

  useEffect(() => {
    let alive = true
    fetchCachedBlob(activeSrc).then(u => {
      if (!alive) return
      if (u) {
        setBlobUrl(u)
        setLoading(false)
        onResolved?.(activeSrc)
        return
      }
      if (sourceIndex < sources.length - 1) {
        setSourceIndex(i => i + 1)
      } else {
        setLoading(false)
      }
    })
    return () => { alive = false }
  }, [activeSrc, onResolved, sourceIndex, sources.length])

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 animate-pulse`}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500" />
      </div>
    )
  }
  return (
    <img
      src={blobUrl || activeSrc}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onError={() => {
        if (sourceIndex < sources.length - 1) {
          setSourceIndex(i => i + 1)
        }
      }}
    />
  )
}

// ── Leaflet map styles ────────────────────────────────────────────────────────

const MAP_STYLES = `
  .leaflet-container { width:100%;height:100%;font-family:inherit;background:#0f172a }
  .leaflet-control-zoom { border:0!important;box-shadow:0 14px 30px rgba(15,23,42,.18)!important }
  .leaflet-control-zoom a { width:34px!important;height:34px!important;line-height:34px!important;border:0!important;color:#0f172a!important;font-weight:900!important }
  .leaflet-control-attribution { border-radius:12px 0 0 0;background:rgba(255,255,255,.84)!important;backdrop-filter:blur(10px);font-size:10px }
`

// ── Photo grid slot ───────────────────────────────────────────────────────────

function PhotoSlot({
  label, src, onZoom,
}: { label: string; src: string | string[] | null; onZoom: (src: string) => void }) {
  const sources = Array.isArray(src) ? src : src ? [src] : []
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(sources[0] ?? null)
  const zoomSrc = resolvedSrc && sources.includes(resolvedSrc) ? resolvedSrc : sources[0] ?? null

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-zinc-950 shadow-sm transition-all duration-200 ${
        sources.length > 0
          ? 'cursor-zoom-in border-zinc-200 hover:-translate-y-0.5 hover:shadow-xl hover:ring-2 hover:ring-blue-400/30 dark:border-zinc-700'
          : 'border-zinc-100 dark:border-zinc-800'
      }`}
      onClick={() => zoomSrc && onZoom(zoomSrc)}
    >
      {/* colour accent bar */}
      <div className={`h-0.5 w-full shrink-0 ${sources.length > 0 ? 'bg-gradient-to-r from-blue-500 via-violet-500 to-indigo-500' : 'bg-zinc-100 dark:bg-zinc-800'}`} />

      <div className="relative flex-1" style={{ height: 180 }}>
        {sources.length > 0 ? (
          <>
            <SafeImage src={sources} alt={label} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:brightness-90" onResolved={setResolvedSrc} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span className="absolute bottom-2.5 left-3 text-[9px] font-black uppercase tracking-[0.2em] text-white drop-shadow">{label}</span>
            {/* zoom hint */}
            <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-zinc-900/60">
            <svg className="h-6 w-6 text-zinc-300 dark:text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M9.75 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 dark:text-zinc-600">{label}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Back button ───────────────────────────────────────────────────────────────

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      Back to Teardown Logs
    </button>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button
        className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl text-white transition hover:bg-white/20"
        onClick={onClose}
      >×</button>
      <SafeImage
        src={src} alt="Preview"
        className="max-h-[92vh] max-w-[94vw] rounded-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeardownLogDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPole = searchParams.get('type')?.toLowerCase() === 'pole'

  // ── Full teardown log state ──
  const [log, setLog]         = useState<TeardownLog | null>(null)
  const [logLoading, setLogLoading] = useState(!isPole)
  const [logError, setLogError]     = useState<string | null>(null)

  // ── Pole report state ──
  const [poleReport, setPoleReport]   = useState<PoleReportDetail | null>(null)
  const [poleLoading, setPoleLoading] = useState(isPole)
  const [poleError, setPoleError]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (isPole) {
      fetch(`${SKYCABLE_API}/pole-reports/${id}`, { headers: authH() })
        .then(r => r.json())
        .then(data => { if (data?.id) setPoleReport(data); else setPoleError('Pole report not found') })
        .catch(() => setPoleError('Failed to load pole report'))
        .finally(() => setPoleLoading(false))
    } else {
      fetch(`${SKYCABLE_API}/teardowns/${id}`, { headers: authH() })
        .then(r => r.json())
        .then(data => {
          const item = data?.data ?? data
          if (item?.id) {
            setLog({
              ...item,
              photos: collectSpanPhotos(item),
            })
          } else setLogError('Teardown log not found')
        })
        .catch(() => setLogError('Failed to load teardown log'))
        .finally(() => setLogLoading(false))
    }
  }, [id, isPole])

  const back = () => navigate('/reports/teardown-logs')

  if (logLoading || poleLoading) {
    return (
      <div className="flex items-center justify-center py-28">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    )
  }

  if (!isPole && (logError || !log)) {
    return (
      <div className="flex items-center justify-center py-28">
        <p className="text-sm font-medium text-red-500">{logError ?? 'Teardown log not found'}</p>
      </div>
    )
  }

  if (isPole && (poleError || !poleReport)) {
    return (
      <div className="flex items-center justify-center py-28">
        <p className="text-sm font-medium text-red-500">{poleError ?? 'Pole report not found'}</p>
      </div>
    )
  }

  if (isPole && poleReport) {
    return <PoleReportView report={poleReport} onBack={back} />
  }

  return <TeardownView log={log!} onBack={back} />
}

// ── Full teardown (span) detail ───────────────────────────────────────────────

function TeardownView({ log, onBack }: { log: TeardownLog; onBack: () => void }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const mapRef  = useRef<HTMLDivElement>(null)
  const mapInst = useRef<L.Map | null>(null)
  // pole_id → batch-before photo URL (from pole_teardown_images where report_id is null)
  const [batchBeforeMap, setBatchBeforeMap] = useState<Record<number, string>>({})

  const span      = log.span
  const spanCode  = span?.span_code ?? `Log #${log.id}`
  const nodeName  = span?.node?.name ?? '—'
  const lineman   = log.lineman ? `${log.lineman.first_name} ${log.lineman.last_name}` : '—'
  const teamName  = log.team?.name ?? '—'

  const fromPole = span?.fromPole || span?.from_pole
  const toPole   = span?.toPole   || span?.to_pole
  const fromCode = fromPole?.pole?.pole_code ?? '—'
  const toCode   = toPole?.pole?.pole_code   ?? '—'
  const fromPoleId = fromPole?.pole?.id ?? fromPole?.pole_id ?? fromPole?.id ?? null
  const toPoleId = toPole?.pole?.id ?? toPole?.pole_id ?? toPole?.id ?? null

  // Fetch batch-before photos for both poles as fallback
  useEffect(() => {
    const poleIds = [fromPoleId, toPoleId].filter(Boolean) as number[]
    if (!poleIds.length) return
    Promise.all(poleIds.map(pid =>
      fetch(`${API_BASE}/api/v1/teardown/pole-images/${pid}?inventory_type=skycable&image_type=before`, {
        headers: { Authorization: `Bearer ${getToken()}`, },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const imgs: any[] = Array.isArray(d?.data) ? d.data : []
          const before = imgs.find((i: any) => i.image_type === 'before')
          if (before?.file_path) return { pid, url: `${API_BASE}/api/v1/files/${before.file_path}` }
          return null
        })
        .catch(() => null)
    )).then(results => {
      const map: Record<number, string> = {}
      results.forEach(r => { if (r) map[r.pid] = r.url })
      if (Object.keys(map).length) setBatchBeforeMap(map)
    })
  }, [fromPoleId, toPoleId])

  const fromLat = Number(fromPole?.pole?.lat ?? 0)
  const fromLng = Number(fromPole?.pole?.lng ?? 0)
  const toLat   = Number(toPole?.pole?.lat   ?? 0)
  const toLng   = Number(toPole?.pole?.lng   ?? 0)
  const hasFromGps = fromLat !== 0 && fromLng !== 0
  const hasToGps   = toLat   !== 0 && toLng   !== 0
  const hasAnyGps  = hasFromGps || hasToGps

  useEffect(() => {
    if (!hasAnyGps || !mapRef.current || mapInst.current) return

    const pins: [number, number][] = [
      ...(hasFromGps ? [[fromLat, fromLng]] as [number, number][] : []),
      ...(hasToGps   ? [[toLat,   toLng  ]] as [number, number][] : []),
    ]

    const center = pins.length === 1 ? pins[0] : [
      (fromLat + toLat) / 2,
      (fromLng + toLng) / 2,
    ] as [number, number]

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView(center, 16)
    mapInst.current = map

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22, maxNativeZoom: 18,
    }).addTo(map)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 22, maxNativeZoom: 20, opacity: 0.85, subdomains: 'abcd',
    }).addTo(map)

    const makeIcon = (color: string, label: string) => L.divIcon({
      className: '',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="width:28px;height:28px;border-radius:50%;background:${color};border:4px solid #fff;box-shadow:0 4px 16px ${color}bb,0 0 0 4px ${color}33"></div>
          <div style="background:rgba(0,0,0,0.75);color:#fff;font-size:10px;font-weight:900;padding:2px 7px;border-radius:6px;white-space:nowrap;backdrop-filter:blur(4px);letter-spacing:0.04em">${label}</div>
        </div>`,
      iconSize: [80, 52], iconAnchor: [40, 28],
    })

    if (hasFromGps) {
      L.marker([fromLat, fromLng], { icon: makeIcon('#3b82f6', fromCode) })
        .addTo(map)
        .bindPopup(`<b>From: ${fromCode}</b><br><span style="font-size:11px;color:#6b7280">${fromLat.toFixed(6)}, ${fromLng.toFixed(6)}</span>`)
    }
    if (hasToGps) {
      L.marker([toLat, toLng], { icon: makeIcon('#8b5cf6', toCode) })
        .addTo(map)
        .bindPopup(`<b>To: ${toCode}</b><br><span style="font-size:11px;color:#6b7280">${toLat.toFixed(6)}, ${toLng.toFixed(6)}</span>`)
    }

    if (hasFromGps && hasToGps) {
      L.polyline([[fromLat, fromLng], [toLat, toLng]], {
        color: '#6366f1', weight: 4, dashArray: '8 5', opacity: 0.9,
      }).addTo(map)
      map.fitBounds([[fromLat, fromLng], [toLat, toLng]], { padding: [60, 60], maxZoom: 18 })
    }

    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapInst.current = null }
  }, [hasAnyGps, fromLat, fromLng, toLat, toLng, fromCode, toCode])

  // 6 photo slots
  const photo = (type: string, poleId?: number | string | null) => {
    const p = findSpanPhoto(log.photos, type, poleId)
    return imgUrl(photoPath(p))
  }

  const fallbackPhoto = (poleCode: string, poleId: number | string | null | undefined, kind: 'before' | 'after' | 'poletag') => {
    return storagePhotoCandidates(nodeName, poleCode, poleId, kind)
  }

  const statusColor: Record<string, string> = {
    backend_approved: 'bg-green-500/15 text-green-600 dark:text-green-300',
    subcon_approved:  'bg-blue-500/15 text-blue-600 dark:text-blue-300',
    submitted:        'bg-violet-500/15 text-violet-600 dark:text-violet-300',
    rejected:         'bg-red-500/15 text-red-600 dark:text-red-300',
  }

  const pct = log.expected_cable > 0
    ? Math.round((log.actual_cable / log.expected_cable) * 100)
    : null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <style>{MAP_STYLES}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackBtn onClick={onBack} />
      </div>

      {/* Hero header */}
      {/* Hero header */}
      <section className="relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="h-[4px] bg-gradient-to-r from-[#006241] via-emerald-600 to-[#00704A]" />
        <div className="relative grid gap-0 xl:grid-cols-[1fr_420px]">
          <div className="flex min-h-[230px] flex-col justify-between gap-8 p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-[#006241] dark:bg-emerald-950/30 dark:text-emerald-300 ring-1 ring-emerald-600/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,.9)]" />
                Full Teardown
              </span>
              <span className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-widest ring-1 ring-zinc-200 dark:ring-zinc-800 ${statusColor[log.status] ?? 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                {log.status.replace(/_/g, ' ')}
              </span>
              {log.offline_mode && (
                <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300 ring-1 ring-amber-500/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
                  Offline Mode
                </span>
              )}
            </div>

            <div className="flex flex-col items-start w-full">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-zinc-400 dark:text-zinc-500">Span teardown</p>
              <h1 className="text-4xl font-black tracking-tight text-[#006241] dark:text-emerald-400 md:text-5xl">{spanCode}</h1>
              
              <div className="mt-4 mb-2 flex items-center justify-between w-full max-w-md rounded-2xl bg-[#006241] px-6 py-3 text-xl font-black text-white shadow-[0_4px_14px_rgba(0,98,65,0.25)]">
                <span className="font-mono">{fromCode}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                <span className="font-mono">{toCode}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-2xl bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-zinc-700 px-3 py-1.5 text-xs font-bold">{nodeName}</span>
                <span className="rounded-2xl bg-emerald-50 text-[#006241] dark:bg-emerald-950/20 dark:text-emerald-300 ring-1 ring-emerald-600/20 px-3 py-1.5 text-xs font-black">
                  Submitted {fmtDate(log.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-zinc-200/80 dark:border-zinc-800 xl:border-l xl:border-t-0">
            {[
              { label: 'Lineman',        value: lineman,   sub: 'Field personnel',    color: 'text-[#006241] dark:text-emerald-300' },
              { label: 'Team',           value: teamName,  sub: 'Assigned team',      color: 'text-emerald-700 dark:text-emerald-400'   },
              { label: 'Cable collected',value: `${log.actual_cable}m`, sub: `of ${log.expected_cable}m expected`, color: 'text-[#006241] dark:text-emerald-300' },
              { label: 'Submitted',      value: fmtDate(log.created_at), sub: fmtDateTime(log.created_at), color: 'text-emerald-700 dark:text-emerald-400'   },
            ].map(item => (
              <div key={item.label} className="flex min-h-[115px] flex-col justify-center gap-1 border-b border-r border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 px-5 last:border-r-0 xl:last:border-b-0">
                <span className={`text-[10px] font-black uppercase tracking-widest ${item.color}`}>{item.label}</span>
                <span className="truncate text-base font-black text-zinc-900 dark:text-zinc-100">{item.value}</span>
                <span className="truncate text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">{item.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'NODEID',    value: nodeName,         sub: 'Assigned node',       tone: 'blue'    },
          { label: 'Team',      value: teamName,         sub: 'Responsible team',    tone: 'violet'  },
          { label: 'ACTUAL CABLE', value: `${log.actual_cable}m`, sub: pct !== null ? `${pct}% of ${log.expected_cable}m expected` : 'No expected set', tone: 'emerald' },
          { label: 'Duration',  value: log.duration_minutes ? `${log.duration_minutes} min` : '—', sub: log.start_time ? fmtDate(log.start_time) : 'No time recorded', tone: 'amber' },
        ].map(card => (
          <div key={card.label} className={`rounded-[26px] border border-zinc-200 bg-gradient-to-br from-${card.tone}-500/10 to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-700 dark:to-zinc-900`}>
            <div className={`mb-4 inline-flex rounded-2xl bg-${card.tone}-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-${card.tone}-700 dark:text-${card.tone}-300`}>
              {card.label}
            </div>
            <div className="truncate text-lg font-black text-zinc-950 dark:text-zinc-50">{card.value}</div>
            <div className="mt-1 text-xs font-semibold text-zinc-400">{card.sub}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Collected Hardware</p>
        <div className="grid gap-4 grid-cols-6">
          {[
            { label: 'Node',          value: log.nodes_collected ?? 0,        tone: 'blue' },
            { label: 'Amplifier',     value: log.amplifiers_collected ?? 0,   tone: 'violet' },
            { label: 'Extender',      value: log.extenders_collected ?? 0,    tone: 'emerald' },
            { label: 'TSC',           value: log.tsc_collected ?? 0,          tone: 'amber' },
            { label: 'Power Supply',  value: log.powersupply_collected ?? 0, tone: 'rose' },
            { label: 'PSU Case',      value: log.ps_housing_collected ?? 0,  tone: 'indigo' },
          ].map(eq => (
            <div key={eq.label} className={`rounded-[26px] border border-zinc-200 bg-gradient-to-br from-${eq.tone}-500/10 to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-700 dark:to-zinc-900`}>
              <div className={`mb-4 inline-flex rounded-2xl bg-${eq.tone}-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-${eq.tone}-700 dark:text-${eq.tone}-300`}>
                {eq.label}
              </div>
              <div className="truncate text-lg font-black text-zinc-950 dark:text-zinc-50">{eq.value}</div>
              <div className="mt-1 text-xs font-semibold text-zinc-400">Collected</div>
            </div>
          ))}
        </div>
      </section>

      {/* Span GPS Map */}
      {hasAnyGps && (
        <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white px-6 py-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
            <div>
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-50">Span GPS Coverage</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">From · To pole locations</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              {hasFromGps && (
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  {fromCode}
                </span>
              )}
              {hasToGps && (
                <span className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                  {toCode}
                </span>
              )}
            </div>
          </div>
          <div className="relative h-[500px] overflow-hidden bg-zinc-950">
            <div ref={mapRef} className="h-full w-full" />
            {/* Cable collected overlay */}
            <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-2xl bg-black/65 px-4 py-3 backdrop-blur-md shadow-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 mb-0.5">Cable Collected</p>
              <p className="text-2xl font-black text-white leading-none">{log.actual_cable}<span className="ml-1 text-sm font-bold text-zinc-400">m</span></p>
              {log.expected_cable > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-400 mt-1">of {log.expected_cable}m expected</p>
                  <div className="mt-2 h-1.5 w-28 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${Math.min(100, Math.round((log.actual_cable / log.expected_cable) * 100))}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-black text-emerald-300 mt-1">{Math.round((log.actual_cable / log.expected_cable) * 100)}%</p>
                </>
              )}
            </div>
            {/* Span label */}
            {hasFromGps && hasToGps && (
              <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] rounded-xl bg-black/65 px-3 py-2 backdrop-blur-md shadow-xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Span</p>
                <p className="font-mono text-xs font-black text-white">{spanCode}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* All 6 photos */}
      <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Section header */}
        <div className="flex items-center justify-between border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white px-6 py-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-50">Field Documentation</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">Before · After · Pole Tag — per pole</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-xs font-black text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">{fromCode}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 dark:text-zinc-600"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            <span className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 font-mono text-xs font-black text-violet-700 dark:border-violet-800/50 dark:bg-violet-900/20 dark:text-violet-300">{toCode}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-zinc-100 dark:divide-zinc-800">
          {/* From Pole */}
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-7 w-1 rounded-full bg-blue-500" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">From Pole</p>
                <p className="font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400">{fromCode}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <PhotoSlot label="Before" src={imageCandidates(photo('from_before', fromPoleId), batchBeforeMap[fromPoleId as number], fallbackPhoto(fromCode, fromPoleId, 'before'))} onZoom={setLightbox} />
              <PhotoSlot label="After"  src={imageCandidates(photo('from_after', fromPoleId), fallbackPhoto(fromCode, fromPoleId, 'after'))} onZoom={setLightbox} />
              <PhotoSlot label="Tag"    src={imageCandidates(photo('from_pole_tag', fromPoleId), fallbackPhoto(fromCode, fromPoleId, 'poletag'))} onZoom={setLightbox} />
            </div>
          </div>

          {/* To Pole */}
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-7 w-1 rounded-full bg-violet-500" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">To Pole</p>
                <p className="font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400">{toCode}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <PhotoSlot label="Before" src={imageCandidates(photo('to_before', toPoleId), batchBeforeMap[toPoleId as number], fallbackPhoto(toCode, toPoleId, 'before'))} onZoom={setLightbox} />
              <PhotoSlot label="After"  src={imageCandidates(photo('to_after', toPoleId), fallbackPhoto(toCode, toPoleId, 'after'))} onZoom={setLightbox} />
              <PhotoSlot label="Tag"    src={imageCandidates(photo('to_pole_tag', toPoleId), fallbackPhoto(toCode, toPoleId, 'poletag'))} onZoom={setLightbox} />
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      {log.notes?.trim() && (
        <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Field Notes</p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{log.notes}</p>
        </section>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ── Pole report detail ────────────────────────────────────────────────────────

function PoleReportView({ report, onBack }: { report: PoleReportDetail; onBack: () => void }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const mapRef  = useRef<HTMLDivElement>(null)
  const mapInst = useRef<L.Map | null>(null)

  const poleCode  = report.pole?.pole_code ?? `Pole #${report.pole_id}`
  const nodeName  = report.node?.name ?? '—'
  const submitter = report.submitter ? `${report.submitter.first_name} ${report.submitter.last_name}`.trim() : '—'
  const teamName  = report.submitter?.team?.name ?? '—'

  const lat    = Number(report.latitude ?? report.pole?.lat ?? 0)
  const lng    = Number(report.longitude ?? report.pole?.lng ?? 0)
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)

  const before = report.photos?.find(p => p.image_type === 'before')?.file_path ?? null
  const after  = report.photos?.find(p => p.image_type === 'after')?.file_path  ?? null
  const tag    = report.photos?.find(p => p.image_type === 'pole_tag')?.file_path ?? null

  useEffect(() => {
    if (!hasGps || !mapRef.current || mapInst.current) return
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([lat, lng], 18)
    mapInst.current = map
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22, maxNativeZoom: 18 }).addTo(map)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 22, maxNativeZoom: 20, opacity: 0.85, subdomains: 'abcd' }).addTo(map)
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 2px 10px rgba(16,185,129,.6)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    })
    L.marker([lat, lng], { icon }).addTo(map).bindPopup(`<b>${poleCode}</b><br>${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup()
    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapInst.current = null }
  }, [hasGps, lat, lng, poleCode])

  return (
    <div className="flex flex-col gap-6 pb-10">
      <style>{MAP_STYLES}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackBtn onClick={onBack} />
      </div>

      {/* Hero header */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#080d16] shadow-2xl">
        <div className="h-[4px] bg-gradient-to-r from-emerald-400 via-blue-500 to-violet-500" />
        <div className="relative grid gap-0 xl:grid-cols-[1fr_420px]">
          <div className="flex min-h-[230px] flex-col justify-between gap-8 p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-300 ring-1 ring-emerald-400/25">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.9)]" />
                Pole Report
              </span>
              <span className="rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-300 ring-1 ring-white/10">Cleared</span>
            </div>
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-zinc-500">Field documentation</p>
              <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">{poleCode}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-2xl bg-white/8 px-3 py-1.5 text-xs font-bold text-zinc-300 ring-1 ring-white/10">{nodeName}</span>
                <span className="rounded-2xl bg-white/8 px-3 py-1.5 text-xs font-bold text-zinc-300 ring-1 ring-white/10">{teamName}</span>
                <span className="rounded-2xl bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-300 ring-1 ring-emerald-400/20">
                  Submitted {fmtDate(report.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-white/10 xl:border-l xl:border-t-0">
            {[
              { label: 'Submitted by', value: submitter, sub: teamName,                         color: 'text-violet-300' },
              { label: 'Team',         value: teamName,  sub: 'Responsible team',               color: 'text-blue-300'  },
              { label: 'Node',         value: nodeName,  sub: 'Assigned area',                  color: 'text-emerald-300' },
              { label: 'Submitted',    value: fmtDate(report.created_at), sub: fmtDateTime(report.created_at), color: 'text-amber-300' },
            ].map(item => (
              <div key={item.label} className="flex min-h-[115px] flex-col justify-center gap-1 border-b border-r border-white/10 bg-white/[0.035] px-5 last:border-r-0 xl:last:border-b-0">
                <span className={`text-[10px] font-black uppercase tracking-widest ${item.color}`}>{item.label}</span>
                <span className="truncate text-base font-black text-white">{item.value}</span>
                <span className="truncate text-[11px] font-semibold text-zinc-500">{item.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GPS Map */}
      {hasGps && (
        <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between rounded-[26px] border border-zinc-100 bg-gradient-to-r from-white to-emerald-50/50 px-5 py-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-800">
              <div>
                <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-50">Pole GPS Location</h2>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
              </div>
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[11px] font-black text-zinc-600 transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#e53e3e"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                Street View
              </a>
            </div>
            <div className="relative h-[380px] overflow-hidden rounded-[24px] border border-zinc-200 bg-zinc-950 dark:border-zinc-700">
              <div ref={mapRef} className="h-full w-full" />
            </div>
          </div>
        </section>
      )}

      {/* 3 photos */}
      <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="p-5">
          <div className="mb-5 flex items-center justify-between rounded-[26px] border border-zinc-100 bg-gradient-to-r from-white to-blue-50/40 px-5 py-5 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-800">
            <div>
              <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-50">Pole Documentation</h2>
              <p className="mt-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500">Before · After · Pole Tag</p>
            </div>
            <span className="rounded-2xl bg-blue-500/15 px-3.5 py-1.5 text-xs font-black tracking-wide text-blue-600 dark:text-blue-400">{poleCode}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PhotoSlot label="Before"   src={before ? imgUrl(before) : null} onZoom={setLightbox} />
            <PhotoSlot label="After"    src={after  ? imgUrl(after)  : null} onZoom={setLightbox} />
            <PhotoSlot label="Pole Tag" src={tag    ? imgUrl(tag)    : null} onZoom={setLightbox} />
          </div>
        </div>
      </section>

      {/* Notes / Landmark */}
      {(report.landmark?.trim() || report.notes?.trim()) && (
        <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 flex flex-col gap-3">
          {report.landmark?.trim() && (
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">Landmark</p>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{report.landmark}</p>
            </div>
          )}
          {report.notes?.trim() && (
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">Field Notes</p>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{report.notes}</p>
            </div>
          )}
        </section>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
