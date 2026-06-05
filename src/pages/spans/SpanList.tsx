import { useEffect, useMemo, useState, useRef, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getToken, SKYCABLE_API, isAdmin } from '../../lib/auth'
import { cacheGet, cacheSet, cacheDel, TTL } from '../../lib/cache'
import { slugify } from '../../lib/utils'
import { fetchTile, arcgisTileUrl } from '../../lib/tile-cache'
import telcoImg from '../../assets/images/telco.png'

// ── Types ────────────────────────────────────────────────────────────────────

type SpanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

type PolePin = { lat: number; lng: number; status: string; area: string }

type Area = {
  id: number
  name: string
  nodes_count?: number
  pending_count?: number
  in_progress_count?: number
  completed_count?: number
}

type NodeItem = {
  id: number
  name: string
  full_label?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  expected_cable?: number | null
  spans_count?: number | null
  subcontractor?: { name: string } | null
  team?: { name: string } | null
  barangay?: { name: string } | null
}

type Span = {
  id: number
  span_code?: string | null
  strand_length?: number | null
  number_of_runs?: number | null
  actual_cable?: number | null
  status: SpanStatus
  from_pole?: { id: number; pole?: { id: number; pole_code: string } | null } | null
  to_pole?: { id: number; pole?: { id: number; pole_code: string } | null } | null
}

type EditForm = {
  span_code: string
  strand_length: string
  number_of_runs: string
  status: SpanStatus | ''
}

type AddForm = {
  from_pole_id: string
  to_pole_id: string
  span_code: string
  strand_length: string
  number_of_runs: string
}

type PoleOption = { id: number; pole_code: string; lat?: string | null; lng?: string | null }

// ── Brand UI ─────────────────────────────────────────────────────────────────

const BRAND = {
  blue: '#2563eb',
  blue2: '#0ea5e9',
  dark: '#0f172a',
  textDark: '#0f172a',
  soft: '#eff6ff',
  softer: '#f8fafc',
  panel: '#ffffff',
  border: '#e2e8f0',
  borderStrong: '#bfdbfe',
  muted: '#64748b',
  muted2: '#94a3b8',
}

const LIVE_NODE_DATA_TTL = TTL.SHORT
const LIVE_NODE_REFRESH_MS = 5_000
const LIVE_SITE_PREVIEW_TTL = TTL.SHORT
const LIVE_SITE_PREVIEW_REFRESH_MS = 5_000

const BRAND_GRADIENTS = [
  'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
  'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)',
  'linear-gradient(135deg, #0369a1 0%, #2563eb 100%)',
  'linear-gradient(135deg, #0f172a 0%, #2563eb 100%)',
]

const REGION_ORDER = [
  'north luzon',
  'south luzon',
  'ncr',
  'metro manila',
  'visayas',
  'mindanao',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')

const STATUSES: SpanStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']

const STATUS_CFG: Record<
  SpanStatus,
  {
    label: string
    dot: string
    text: string
    soft: string
    border: string
    icon: string
    bar: string
    active: string
  }
> = {
  pending: {
    label: 'Pending',
    dot: '#f59e0b',
    text: '#b45309',
    soft: '#fffbeb',
    border: '#fde68a',
    icon: 'bx-time-five',
    bar: 'linear-gradient(90deg, #f59e0b, #f97316)',
    active: 'bg-amber-500 text-white shadow-lg shadow-amber-500/25',
  },
  in_progress: {
    label: 'In Progress',
    dot: BRAND.blue,
    text: BRAND.blue,
    soft: BRAND.soft,
    border: BRAND.borderStrong,
    icon: 'bx-loader-circle',
    bar: 'linear-gradient(90deg, #2E3791, #5362D8)',
    active: 'bg-[#2E3791] text-white shadow-lg shadow-blue-900/20',
  },
  completed: {
    label: 'Completed',
    dot: '#10b981',
    text: '#047857',
    soft: '#ecfdf5',
    border: '#a7f3d0',
    icon: 'bx-check-circle',
    bar: 'linear-gradient(90deg, #10b981, #14b8a6)',
    active: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25',
  },
  cancelled: {
    label: 'Cancelled',
    dot: '#64748b',
    text: '#475569',
    soft: '#f8fafc',
    border: '#e2e8f0',
    icon: 'bx-x-circle',
    bar: 'linear-gradient(90deg, #64748b, #94a3b8)',
    active: 'bg-slate-600 text-white shadow-lg shadow-slate-500/20',
  },
}

const NODE_STATUS_CFG = {
  pending: STATUS_CFG.pending,
  in_progress: STATUS_CFG.in_progress,
  completed: STATUS_CFG.completed,
}

const emptyAdd = (): AddForm => ({
  from_pole_id: '',
  to_pole_id: '',
  span_code: '',
  strand_length: '',
  number_of_runs: '1',
})

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    }
}

function poleCode(spanPole?: { pole?: { pole_code: string } | null } | null) {
  return spanPole?.pole?.pole_code ?? '—'
}

function expectedCable(strand?: number | null, runs?: number | null) {
  if (strand == null || runs == null) return '—'
  return `${(strand * runs).toFixed(0)}m`
}

function formatMeters(value?: number | null) {
  return value != null ? `${value}m` : '—'
}

function normalizeAreaName(name: string) {
  const key = name.trim().toLowerCase()
  if (key === 'metro manila') return 'ncr'
  if (key === 'national capital region') return 'ncr'
  return key
}

function areaDisplayName(name: string) {
  const key = normalizeAreaName(name)
  if (key === 'ncr') return 'NCR'
  if (key === 'north luzon') return 'North Luzon'
  if (key === 'south luzon') return 'South Luzon'
  if (key === 'visayas') return 'Visayas'
  if (key === 'mindanao') return 'Mindanao'
  return name
}

function areaSortIndex(name: string) {
  const key = normalizeAreaName(name)
  const index = REGION_ORDER.findIndex((item) => item === key)
  return index === -1 ? 999 : index
}

function buildPoleAreaMap(rows: any[]) {
  const map = new Map<string, PolePin[]>()
  ;(Array.isArray(rows) ? rows : []).forEach((p: any) => {
    if (!p.lat || !p.lng || !p.area) return
    const key = String(p.area).toLowerCase().trim()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({
      lat: Number(p.lat),
      lng: Number(p.lng),
      status: p.skycable_status ?? 'pending',
      area: key,
    })
  })
  return map
}

function fmt(n: number | string | null | undefined, dec = 0) {
  return Number(n ?? 0)
    .toFixed(dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ── Shared classes ───────────────────────────────────────────────────────────

const inputCls =
  'h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-blue-900/10'

const selectCls = `${inputCls} appearance-none pr-10 cursor-pointer`

const labelCls =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500'

const primaryBtnCls =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

const secondaryBtnCls =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold transition hover:-translate-y-0.5'

const dangerBtnCls =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 text-sm font-black text-white shadow-lg shadow-red-500/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

// ── Small Components ─────────────────────────────────────────────────────────

function Chevron() {
  return <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lg text-[#8E96C5]" />
}

function StatusChip({ status }: { status: SpanStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
      style={{
        backgroundColor: cfg.soft,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

function Modal({
  open,
  title,
  sub,
  onClose,
  children,
  wide = false,
  danger = false,
}: {
  open: boolean
  title: string
  sub?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  danger?: boolean
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onClose} />

      <div
        className={cx(
          'relative max-h-[90vh] w-full overflow-hidden rounded-2xl bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.55)] dark:bg-slate-900',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        
      >
        <div
          className="relative overflow-hidden border-b border-slate-100 px-6 py-5"
          style={{
            backgroundColor: danger ? '#dc2626' : '#0f172a',
          }}
        >
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {sub && <p className="mt-1 text-xs text-blue-100/75">{sub}</p>}
            </div>

            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-lg font-bold text-white/75 transition hover:bg-white/20 hover:text-white">×</button>
          </div>
        </div>

        <div className="max-h-[calc(90vh-84px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      className="relative min-h-[190px] overflow-hidden rounded-2xl bg-white p-5"
      style={{
        border: `1px solid #e2e8f0`,
        boxShadow: '0 20px 40px -30px rgba(15,23,42,0.35)',
      }}
    >
      <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-7 h-4 w-2/3 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-3 h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
    </div>
  )
}

function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-dashed bg-slate-50 px-6 py-14 text-center"
      style={{
        border: `1px solid #e2e8f0`,
      }}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <i className={cx('bx text-3xl', icon)} />
      </div>
      <h3 className="mt-3 text-base font-black" style={{ color: '#0f172a' }}>{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm font-semibold" style={{ color: '#64748b' }}>{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function StatCard({ label, value, icon, accent, helper }: { label: string; value: number | string; icon: string; accent: string; helper?: string }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="pointer-events-none absolute -right-7 -top-7 h-20 w-20 rounded-full opacity-10 blur-xl" style={{ background: accent }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            {label}
          </p>
          <h3 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            {value}
          </h3>
          {helper && <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{helper}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: accent }}>
          <i className={cx('bx text-xl', icon)} />
        </div>
      </div>
    </article>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 pb-10">{children}</div>
}

function ViewHero({
  crumbs,
  eyebrow,
  title,
  subtitle,
  actions,
  isOnline,
  syncing,
  syncText,
  onSync,
  onClear,
}: {
  crumbs: Array<{ label: ReactNode; onClick?: () => void }>;
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  actions?: ReactNode;
  isOnline?: boolean;
  syncing?: boolean;
  syncText?: string;
  onSync?: () => void;
  onClear?: () => void;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm"
      style={{
        borderColor: '#e2e8f0',
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-blue-50 via-sky-50/60 to-transparent" />
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />

      <div className="relative">
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold" style={{ color: '#64748b' }}>
          {crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 && <i className="bx bx-chevron-right text-base" />}
              {c.onClick ? (
                <button type="button" onClick={c.onClick} className="transition hover:text-[#2E3791]">
                  {c.label}
                </button>
              ) : (
                <span style={{ color: '#0f172a' }}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full border bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700"
              style={{
                borderColor: '#bfdbfe',
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#2563eb" }} />
              {eyebrow}
            </span>

            <h2 className="mt-3 text-xl font-semibold text-slate-950">
              {title}
            </h2>

            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Cache Control Panel */}
            {syncText && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 px-3 py-1.5 shadow-sm text-xs select-none">
                {/* Live Connection Badge */}
                <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </span>
                  <span className="font-bold text-slate-600">
                    {isOnline ? 'Online' : 'Offline Mode'}
                  </span>
                </div>

                {/* Cache Status Details */}
                <div className="flex items-center gap-1 text-slate-400 font-medium">
                  <i className="bx bx-time-five text-sm" />
                  <span>Synced:</span>
                  <span className="font-black text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 leading-none">
                    {syncText}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                  <button
                    type="button"
                    onClick={onSync}
                    disabled={syncing || !isOnline}
                    title="Sync Now"
                    className={`flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition-all ${syncing ? 'animate-spin' : 'hover:bg-slate-100 hover:text-violet-500'} disabled:opacity-50`}
                  >
                    <i className="bx bx-refresh text-lg" />
                  </button>

                  <button
                    type="button"
                    onClick={onClear}
                    title="Purge Cache"
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
                  >
                    <i className="bx bx-trash text-sm" />
                  </button>
                </div>
              </div>
            )}

            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function PolePill({ value }: { value: ReactNode }) {
  return (
    <span
      className="inline-flex rounded-full border bg-blue-50 px-3 py-1 font-mono text-[11px] font-semibold text-blue-700"
      style={{
        borderColor: '#bfdbfe',
      }}
    >
      {value}
    </span>
  )
}

const TILE_PX = 256
const MAP_H = 128

function latLngToTileFrac(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z)
  const xFrac = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { xFrac, yFrac, tileX: Math.floor(xFrac), tileY: Math.floor(yFrac) }
}

function SiteCardMap({ poles, siteName }: { poles: PolePin[]; siteName: string }) {
  const [w, setW] = useState(300)
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setW(rect.width)
    const obs = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width && width > 0) setW(width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (poles.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <img src={telcoImg} alt="Telcovantage" className="h-32 w-full object-contain p-4 opacity-40" />
      </div>
    )
  }

  const h = MAP_H
  const lats = poles.map(p => p.lat)
  const lngs = poles.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length
  const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length

  const latSpan = Math.max(maxLat - minLat, 0.0005)
  const lngSpan = Math.max(maxLng - minLng, 0.0005)
  const zLng = Math.log2((w * 0.55 * 360) / (256 * lngSpan))
  const zLat = Math.log2((h * 0.55 * 180) / (256 * latSpan))
  const zoom = Math.max(8, Math.min(14, Math.floor(Math.min(zLng, zLat))))

  const { xFrac, yFrac, tileX, tileY } = latLngToTileFrac(centerLat, centerLng, zoom)
  const fracX = xFrac - tileX
  const fracY = yFrac - tileY
  const scale = Math.max(w / 256, h / 256)
  const imgW = 256 * scale
  const imgH = 256 * scale
  const offX = w / 2 - fracX * imgW
  const offY = h / 2 - fracY * imgH

  const sw = latLngToTileFrac(minLat, minLng, zoom)
  const ne = latLngToTileFrac(maxLat, maxLng, zoom)
  const bxL = offX + (sw.xFrac - tileX) * imgW
  const bxT = offY + (ne.yFrac - tileY) * imgH
  const bxW = (ne.xFrac - sw.xFrac) * imgW
  const bxH = (sw.yFrac - ne.yFrac) * imgH

  const STATUS_COLOR: Record<string, string> = {
    pending: '#f59e0b',
    in_progress: '#6366f1',
    completed: '#10b981',
    cleared: '#10b981',
  }

  return (
    <div ref={divRef} className="relative w-full overflow-hidden rounded-xl" style={{ height: MAP_H, background: '#1a1a2e' }}>
      {[-1, 0, 1].flatMap(dx =>
        [-1, 0, 1].map(dy => (
          <img
            key={`${dx}-${dy}`}
            src={`https://mt1.google.com/vt/lyrs=s&x=${tileX + dx}&y=${tileY + dy}&z=${zoom}`}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: offX + dx * imgW,
              top: offY + dy * imgH,
              width: imgW,
              height: imgH,
              userSelect: 'none',
            }}
          />
        ))
      )}

      {poles.length > 1 && bxW > 2 && bxH > 2 && (
        <div
          style={{
            position: 'absolute',
            left: bxL,
            top: bxT,
            width: bxW,
            height: bxH,
            border: '2.5px solid #f59e0b',
            borderRadius: 3,
            background: 'rgba(245,158,11,0.13)',
            pointerEvents: 'none',
          }}
        />
      )}

      {poles.map((p, i) => {
        const { xFrac: px, yFrac: py } = latLngToTileFrac(p.lat, p.lng, zoom)
        const color = STATUS_COLOR[p.status] ?? '#94a3b8'
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: offX + (px - tileX) * imgW - 3.5,
              top: offY + (py - tileY) * imgH - 3.5,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#ffffff',
              border: `1.5px solid ${color}`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )
      })}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '4px 10px', zIndex: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{siteName}</span>
      </div>
    </div>
  )
}

function CachedTile({ z, y, x, style }: { z: number; y: number; x: number; style: CSSProperties }) {
  const url = arcgisTileUrl(z, y, x)
  const [src, setSrc] = useState<string>(url)

  useEffect(() => {
    let alive = true
    fetchTile(url).then(blobUrl => {
      if (alive) setSrc(blobUrl)
    })
    return () => {
      alive = false
    }
  }, [url])

  return <img src={src} alt="" draggable={false} style={style} />
}

const NODE_STATUS_DOT: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#8b5cf6',
  completed: '#10b981',
  cleared: '#10b981',
}

const nodePolesCache = new Map<number, { lat: number; lng: number; status: string }[]>()

function NodeVicinityMap({ nodeId, nodeName }: { nodeId: number; nodeName: string }) {
  const [poles, setPoles] = useState<{ lat: number; lng: number; status: string }[]>(
    () => nodePolesCache.get(nodeId) ?? []
  )
  const [loaded, setLoaded] = useState(() => nodePolesCache.has(nodeId))
  const [w, setW] = useState(320)
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() })
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

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setW(rect.width)
    const obs = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width && width > 0) setW(width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (!loaded) {
    return <div className="h-36 w-full animate-pulse rounded-xl bg-slate-100" />
  }

  if (poles.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
        <img src={telcoImg} alt="No GPS" className="h-36 w-full object-contain p-4 opacity-25" />
      </div>
    )
  }

  const h = MAP_H
  const lats = poles.map(p => p.lat)
  const lngs = poles.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const centerLat = (minLat + maxLat) / 2
  const centerLng = (minLng + maxLng) / 2

  const latSpan = Math.max(maxLat - minLat, 0.0005)
  const lngSpan = Math.max(maxLng - minLng, 0.0005)
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

  const sw = latLngToTileFrac(minLat, minLng, zoom)
  const ne = latLngToTileFrac(maxLat, maxLng, zoom)
  const bxL = offX + (sw.xFrac - tileX) * imgW
  const bxT = offY + (ne.yFrac - tileY) * imgH
  const bxW = (ne.xFrac - sw.xFrac) * imgW
  const bxH = (sw.yFrac - ne.yFrac) * imgH

  return (
    <div
      ref={divRef}
      className="relative w-full overflow-hidden rounded-xl border border-white/5 shadow-inner transition-transform duration-500 group-hover:scale-[1.02]"
      style={{ height: MAP_H, background: '#0f172a' }}
    >
      {([-1, 0, 1] as const).flatMap(dy =>
        ([-1, 0, 1] as const).map(dx => (
          <CachedTile
            key={`${dx},${dy}`}
            z={zoom}
            y={tileY + dy}
            x={tileX + dx}
            style={{
              position: 'absolute',
              left: offX + dx * imgW,
              top: offY + dy * imgH,
              width: imgW,
              height: imgH,
              userSelect: 'none',
              filter: 'brightness(0.95) contrast(1.05)',
            }}
          />
        ))
      )}

      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-slate-950/60 to-transparent pointer-events-none z-[1]" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent pointer-events-none z-[1]" />

      {poles.length > 1 && bxW > 2 && bxH > 2 && (
        <div
          style={{
            position: 'absolute',
            left: bxL,
            top: bxT,
            width: bxW,
            height: bxH,
            border: '2px dashed rgba(245, 158, 11, 0.8)',
            borderRadius: 6,
            background: 'rgba(245, 158, 11, 0.15)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {poles.map((p, i) => {
        const { xFrac: px, yFrac: py } = latLngToTileFrac(p.lat, p.lng, zoom)
        const dotColor = NODE_STATUS_DOT[p.status] ?? '#94a3b8'
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: offX + (px - tileX) * imgW - 4,
              top: offY + (py - tileY) * imgH - 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ffffff',
              border: `2px solid ${dotColor}`,
              boxShadow: `0 0 8px ${dotColor}`,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )
      })}

      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 shadow-lg backdrop-blur-md z-[3]">
        <span className="truncate text-xs font-bold tracking-wide text-white">{nodeName}</span>
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/80">
          {poles.length} {poles.length === 1 ? 'Pole' : 'Poles'}
        </span>
      </div>
    </div>
  )
}

// ── Leaflet Span Map ─────────────────────────────────────────────────────────

const SPAN_TILES = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri',
    label: 'Satellite',
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap contributors',
    label: 'Streets',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© CartoDB',
    label: 'Dark',
  },
} as const
type SpanTile = keyof typeof SPAN_TILES

function makePoleIcon(color: string, size: number) {
  const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.45);cursor:pointer"></div>`
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 4] })
}

function LeafletSpanMap({
  poles, spans, onPairSelected, savedPairs,
}: {
  poles: PoleOption[]
  spans: Span[]
  onPairSelected: (from: PoleOption, to: PoleOption) => void
  savedPairs: Array<{ from: number; to: number }>
}) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<L.Map | null>(null)
  const markerLayRef  = useRef<L.LayerGroup | null>(null)
  const spanLayRef    = useRef<L.LayerGroup | null>(null)
  const tileLayRef    = useRef<L.TileLayer | null>(null)
  const fromRef       = useRef<PoleOption | null>(null)
  const onSelectRef   = useRef(onPairSelected)
  const didFitRef     = useRef(false)
  useEffect(() => { onSelectRef.current = onPairSelected }, [onPairSelected])

  const [baseTile,    setBaseTile]    = useState<SpanTile>('satellite')
  const [fromDisplay, setFromDisplay] = useState<PoleOption | null>(null)

  const gpsPoles = useMemo(() => poles.filter(p => p.lat && p.lng), [poles])

  // Init map (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [12.88, 121.77], zoom: 6, zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    tileLayRef.current = L.tileLayer(SPAN_TILES.satellite.url, { attribution: SPAN_TILES.satellite.attr, maxZoom: 21 }).addTo(map)
    spanLayRef.current   = L.layerGroup().addTo(map)
    markerLayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; didFitRef.current = false }
  }, [])

  // Tile switching
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    tileLayRef.current?.remove()
    tileLayRef.current = L.tileLayer(SPAN_TILES[baseTile].url, { attribution: SPAN_TILES[baseTile].attr, maxZoom: 21 })
    tileLayRef.current.addTo(map)
    tileLayRef.current.setZIndex(0)
  }, [baseTile])

  // Draw spans
  useEffect(() => {
    const lay = spanLayRef.current; if (!lay) return
    lay.clearLayers()

    spans.forEach(s => {
      const fp = gpsPoles.find(p => p.id === s.from_pole?.id)
      const tp = gpsPoles.find(p => p.id === s.to_pole?.id)
      if (!fp || !tp) return
      const line = L.polyline(
        [[Number(fp.lat), Number(fp.lng)], [Number(tp.lat), Number(tp.lng)]],
        { color: '#ffffff', weight: 2.5, dashArray: '6 5', opacity: 0.85 },
      ).addTo(lay)
      line.bindPopup(`
        <div style="font-family:ui-sans-serif,sans-serif;min-width:190px">
          <div style="background:linear-gradient(135deg,#2E3791,#4450C4);color:#fff;padding:8px 12px;border-radius:8px 8px 0 0;margin:-8px -12px 10px">
            <div style="font-size:9px;opacity:.65;text-transform:uppercase;letter-spacing:.12em">Span</div>
            <div style="font-size:13px;font-weight:900;font-family:ui-monospace,monospace">${s.span_code ?? `#${s.id}`}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${[['From', poleCode(s.from_pole)], ['To', poleCode(s.to_pole)], ['Length', formatMeters(s.strand_length)], ['Runs', String(s.number_of_runs ?? '—')], ['Cable', expectedCable(s.strand_length, s.number_of_runs)], ['Status', STATUS_CFG[s.status]?.label ?? s.status]]
              .map(([k, v]) => `<div><div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#8E96C5">${k}</div><div style="font-weight:700;color:#0D123F;font-size:12px">${v}</div></div>`).join('')}
          </div>
        </div>
      `, { maxWidth: 260 })
    })

    savedPairs.forEach(s => {
      const fp = gpsPoles.find(p => p.id === s.from)
      const tp = gpsPoles.find(p => p.id === s.to)
      if (!fp || !tp) return
      L.polyline([[Number(fp.lat), Number(fp.lng)], [Number(tp.lat), Number(tp.lng)]], { color: '#34d399', weight: 4 }).addTo(lay)
    })
  }, [gpsPoles, spans, savedPairs])

  // Draw markers (re-runs when fromDisplay changes to update colors)
  useEffect(() => {
    const lay = markerLayRef.current; if (!lay) return
    lay.clearLayers()

    const currentFrom = fromRef.current
    gpsPoles.forEach(p => {
      const isFrom = currentFrom?.id === p.id
      const marker = L.marker(
        [Number(p.lat), Number(p.lng)],
        { icon: makePoleIcon(isFrom ? '#2563eb' : '#f59e0b', isFrom ? 26 : 20) },
      ).addTo(lay)
      marker.bindTooltip(`<b style="font-family:ui-monospace,monospace;font-size:11px">${p.pole_code}</b>`, { direction: 'top', className: 'pole-tooltip' })
      marker.on('click', () => {
        const cf = fromRef.current
        if (!cf) {
          fromRef.current = p; setFromDisplay(p)
        } else if (cf.id !== p.id) {
          fromRef.current = null; setFromDisplay(null)
          onSelectRef.current(cf, p)
        }
      })
    })

    if (!didFitRef.current && mapRef.current && gpsPoles.length > 0) {
      mapRef.current.fitBounds(
        L.latLngBounds(gpsPoles.map(p => [Number(p.lat), Number(p.lng)] as [number, number])),
        { padding: [50, 50], maxZoom: 17 },
      )
      didFitRef.current = true
    }
  }, [gpsPoles, fromDisplay])

  const clearFrom = () => { fromRef.current = null; setFromDisplay(null) }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div ref={containerRef} className="flex-1 h-full" />

      {/* Tile buttons */}
      <div className="absolute left-3 top-3 z-[1000] flex overflow-hidden rounded-xl shadow-xl" style={{ border: '1px solid rgba(255,255,255,0.18)' }}>
        {(Object.keys(SPAN_TILES) as SpanTile[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setBaseTile(t)}
            className="px-3.5 py-2 text-xs font-black transition"
            style={{
              background: baseTile === t ? 'linear-gradient(135deg,#2E3791,#4450C4)' : 'rgba(0,0,0,0.55)',
              color: baseTile === t ? '#fff' : 'rgba(255,255,255,0.75)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {SPAN_TILES[t].label}
          </button>
        ))}
      </div>

      {/* From pole indicator */}
      {fromDisplay && (
        <div className="absolute bottom-10 left-1/2 z-[1000] -translate-x-1/2 flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-2xl" style={{ border: '2px solid #2563eb' }}>
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          <span className="text-xs font-black text-slate-800">
            From: <span className="text-blue-600">{fromDisplay.pole_code}</span>
          </span>
          <span className="text-xs text-slate-400">— click the To pole</span>
          <button type="button" onClick={clearFrom} className="ml-1 rounded-full p-0.5 text-slate-400 transition hover:text-red-500">
            <i className="bx bx-x text-base leading-none" />
          </button>
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-3 right-3 z-[1000] flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 text-[11px] font-semibold shadow-xl"
        style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)' }}
      >
        {[{ color: '#f59e0b', label: 'Pole' }, { color: '#2563eb', label: 'From' }, { color: '#ffffff', label: 'Span (click for details)' }, { color: '#34d399', label: 'Newly added' }].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}


// ── Main Component ───────────────────────────────────────────────────────────

function idFromSlug(slug: string): number | null {
  const parts = slug.split('-')
  const id = Number(parts[parts.length - 1])
  return isNaN(id) ? null : id
}

export default function SpanList() {
  const admin = isAdmin()
  const navigate = useNavigate()
  const { spanSiteSlug, spanNodeSlug } = useParams<{ spanSiteSlug?: string; spanNodeSlug?: string }>()

  // Cache & Connection States
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    const keys = ['spanlist_areas', 'spanlist_overview_stats']
    // check sessionStorage for oldest timestamp among active keys
    const times = keys.map(k => {
      try {
        const raw = sessionStorage.getItem(k)
        return raw ? JSON.parse(raw).ts : null
      } catch { return null }
    }).filter(Boolean) as number[]
    return times.length > 0 ? Math.min(...times) : null
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

  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null)

  // Sync state with URL (handles browser back/forward and navigate-only calls)
  useEffect(() => {
    if (!spanSiteSlug) {
      setSelectedArea(null)
      setSelectedNode(null)
    } else if (!spanNodeSlug) {
      setSelectedNode(null)
    }
  }, [spanSiteSlug, spanNodeSlug])

  const [areas, setAreas] = useState<Area[]>([])
  const [polesByArea, setPolesByArea] = useState<Map<string, PolePin[]>>(new Map())
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [spans, setSpans] = useState<Span[]>([])
  const [poles, setPoles] = useState<PoleOption[]>([])

  const [areasLoading, setAreasLoading] = useState(true)
  const [nodesLoading, setNodesLoading] = useState(false)
  const [spansLoading, setSpansLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SpanStatus | ''>('')

  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [selected, setSelected] = useState<Span | null>(null)

  const [addForm, setAddForm] = useState<AddForm>(emptyAdd())
  const [editForm, setEditForm] = useState<EditForm>({ span_code: '', strand_length: '', number_of_runs: '', status: '' })

  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewStats, setOverviewStats] = useState({ total: 0, completed: 0, pending: 0 })

  const [spanView, setSpanView] = useState<'list' | 'map'>('list')
  const [savedPairs, setSavedPairs] = useState<Array<{ from: number; to: number }>>([])


  useEffect(() => {
    const hit = cacheGet<Area[]>('spanlist_areas')
    if (hit) {
      setAreas([...hit].sort((a, b) => areaSortIndex(a.name) - areaSortIndex(b.name)))
      setAreasLoading(false)
      // silent background revalidation fetch:
      fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          const sorted = [...list].sort((a, b) => areaSortIndex(a.name) - areaSortIndex(b.name))
          setAreas(sorted)
          cacheSet('spanlist_areas', sorted)
          setLastSynced(Date.now())
        }).catch(() => {})
      if (spanSiteSlug) {
        const areaId = idFromSlug(spanSiteSlug)
        const area = hit.find(a => a.id === areaId) ?? null
        setSelectedArea(area)
      }
      return
    }

    fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: Area[] = Array.isArray(data) ? data : data?.data ?? []
        const sorted = [...list].sort((a, b) => areaSortIndex(a.name) - areaSortIndex(b.name))
        setAreas(sorted)
        cacheSet('spanlist_areas', sorted)
        setLastSynced(Date.now())
        if (spanSiteSlug) {
          const areaId = idFromSlug(spanSiteSlug)
          const area = sorted.find(a => a.id === areaId) ?? null
          setSelectedArea(area)
        }
      })
      .catch(() => {})
      .finally(() => setAreasLoading(false))
  }, [])

  const loadSitePolePreview = ({ forceFresh = false }: { forceFresh?: boolean } = {}) => {
    const POLE_MAP_KEY = 'spanlist_site_pole_map'
    const cached = forceFresh ? null : cacheGet<any[]>(POLE_MAP_KEY, LIVE_SITE_PREVIEW_TTL)

    if (cached) {
      setPolesByArea(buildPoleAreaMap(cached))
      fetch(`${SKYCABLE_API}/poles/map`, {
        headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
      })
        .then(r => r.json())
        .then((rows: any[]) => {
          cacheSet(POLE_MAP_KEY, rows, LIVE_SITE_PREVIEW_TTL)
          setPolesByArea(buildPoleAreaMap(rows))
          setLastSynced(Date.now())
        })
        .catch(() => {})
      return
    }

    fetch(`${SKYCABLE_API}/poles/map`, {
      headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
    })
      .then(r => r.json())
      .then((rows: any[]) => {
        cacheSet(POLE_MAP_KEY, rows, LIVE_SITE_PREVIEW_TTL)
        setPolesByArea(buildPoleAreaMap(rows))
        setLastSynced(Date.now())
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadSitePolePreview({ forceFresh: true })
  }, [])

  useEffect(() => {
    if (!isOnline) return

    const refreshSitePreview = () => {
      if (document.visibilityState !== 'visible') return
      loadSitePolePreview({ forceFresh: true })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSitePreview()
    }

    window.addEventListener('focus', refreshSitePreview)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const id = window.setInterval(refreshSitePreview, LIVE_SITE_PREVIEW_REFRESH_MS)

    return () => {
      window.removeEventListener('focus', refreshSitePreview)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(id)
    }
  }, [isOnline])

  useEffect(() => {
    let mounted = true

    const loadOverview = async () => {
      const ck = 'spanlist_overview_stats'
      const hit = cacheGet<any>(ck)
      if (hit) {
        setOverviewStats(hit)
        setOverviewLoading(false)
        // silent background fetch to revalidate
        fetch(`${SKYCABLE_API}/spans?per_page=500`, { headers: authHeaders() })
          .then(r => r.json())
          .then(async data => {
            let page = 1
            let lastPage = Array.isArray(data) ? 1 : data?.meta?.last_page ?? data?.last_page ?? 1
            const all: Span[] = Array.isArray(data) ? data : data?.data ?? []
            while (page < lastPage) {
              page += 1
              const res = await fetch(`${SKYCABLE_API}/spans?per_page=500&page=${page}`, { headers: authHeaders() })
              const d = await res.json()
              const rows = Array.isArray(d) ? d : d?.data ?? []
              all.push(...rows)
            }
            const stats = {
              total: all.length,
              completed: all.filter(s => s.status === 'completed').length,
              pending: all.filter(s => s.status === 'pending').length,
            }
            if (mounted) {
              setOverviewStats(stats)
              cacheSet(ck, stats)
              setLastSynced(Date.now())
            }
          }).catch(() => {})
        return
      }

      setOverviewLoading(true)
      try {
        let page = 1
        let lastPage = 1
        const all: Span[] = []

        do {
          const res = await fetch(`${SKYCABLE_API}/spans?per_page=500&page=${page}`, { headers: authHeaders() })
          const data = await res.json()
          const rows: Span[] = Array.isArray(data) ? data : data?.data ?? []
          all.push(...rows)
          lastPage = Array.isArray(data) ? 1 : data?.meta?.last_page ?? data?.last_page ?? 1
          page += 1
        } while (page <= lastPage)

        if (!mounted) return

        const stats = {
          total: all.length,
          completed: all.filter(s => s.status === 'completed').length,
          pending: all.filter(s => s.status === 'pending').length,
        }
        setOverviewStats(stats)
        cacheSet(ck, stats)
        setLastSynced(Date.now())
      } catch {
        if (!mounted) return
        setOverviewStats({ total: 0, completed: 0, pending: 0 })
      } finally {
        if (mounted) setOverviewLoading(false)
      }
    }

    loadOverview()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedArea) {
      setNodes([])
      return
    }

    const cacheKey = `spanlist_nodes_${selectedArea.id}`
    const hit = cacheGet<NodeItem[]>(cacheKey)
    if (hit) {
      setNodes(hit)
      // silent background fetch to revalidate
      fetch(`${SKYCABLE_API}/nodes?area_id=${selectedArea.id}&per_page=200`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          setNodes(list)
          cacheSet(cacheKey, list)
          setLastSynced(Date.now())
        }).catch(() => {})
      if (spanNodeSlug) {
        const nodeId = idFromSlug(spanNodeSlug)
        const node = hit.find(n => n.id === nodeId) ?? null
        setSelectedNode(node)
      }
      return
    }

    setNodesLoading(true)

    fetch(`${SKYCABLE_API}/nodes?area_id=${selectedArea.id}&per_page=200`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: NodeItem[] = Array.isArray(data) ? data : data?.data ?? []
        setNodes(list)
        cacheSet(cacheKey, list)
        setLastSynced(Date.now())
        if (spanNodeSlug) {
          const nodeId = idFromSlug(spanNodeSlug)
          const node = list.find(n => n.id === nodeId) ?? null
          setSelectedNode(node)
        }
      })
      .catch(() => setNodes([]))
      .finally(() => setNodesLoading(false))
  }, [selectedArea])

  const loadSpans = ({ silent = false, forceFresh = false }: { silent?: boolean; forceFresh?: boolean } = {}) => {
    if (!selectedNode) return

    const ck = `spanlist_spans_${selectedNode.id}`
    const hit = forceFresh ? null : cacheGet<Span[]>(ck, LIVE_NODE_DATA_TTL)
    if (hit) {
      setSpans(hit)
      setSpansLoading(false)
      // Background revalidation silently
      fetch(`${SKYCABLE_API}/spans?node_id=${selectedNode.id}&per_page=200`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          setSpans(list)
          cacheSet(ck, list, LIVE_NODE_DATA_TTL)
          setLastSynced(Date.now())
        }).catch(() => {})
      return
    }

    if (!silent) setSpansLoading(true)

    fetch(`${SKYCABLE_API}/spans?node_id=${selectedNode.id}&per_page=200`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data?.data ?? []
        setSpans(list)
        cacheSet(ck, list, LIVE_NODE_DATA_TTL)
        setLastSynced(Date.now())
      })
      .catch(() => setSpans([]))
      .finally(() => setSpansLoading(false))
  }

  const loadPoles = ({ forceFresh = false }: { forceFresh?: boolean } = {}) => {
    if (!selectedNode) return

    const pck = `spanlist_poles_${selectedNode.id}`
    const phit = forceFresh ? null : cacheGet<any[]>(pck, LIVE_NODE_DATA_TTL)
    if (phit) {
      setPoles(phit)
      fetch(`${SKYCABLE_API}/nodes/${selectedNode.id}/poles`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          const parsed = list.map((p: any) => ({
            id:        p.id,
            pole_code: p.pole?.pole_code ?? p.pole_code ?? `#${p.id}`,
            lat:       p.pole?.lat  ?? null,
            lng:       p.pole?.lng  ?? null,
          }))
          setPoles(parsed)
          cacheSet(pck, parsed, LIVE_NODE_DATA_TTL)
          setLastSynced(Date.now())
        }).catch(() => {})
      return
    }

    fetch(`${SKYCABLE_API}/nodes/${selectedNode.id}/poles`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data?.data ?? []
        const parsed = list.map((p: any) => ({
          id:        p.id,
          pole_code: p.pole?.pole_code ?? p.pole_code ?? `#${p.id}`,
          lat:       p.pole?.lat  ?? null,
          lng:       p.pole?.lng  ?? null,
        }))
        setPoles(parsed)
        cacheSet(pck, parsed, LIVE_NODE_DATA_TTL)
        setLastSynced(Date.now())
      })
      .catch(() => setPoles([]))
  }

  useEffect(() => {
    if (!selectedNode) {
      setSpans([])
      setPoles([])
      setSavedPairs([])
      setSpanView('list')
      return
    }

    loadSpans({ forceFresh: true })
    loadPoles({ forceFresh: true })
  }, [selectedNode])

  useEffect(() => {
    if (!selectedNode || !isOnline) return

    const refreshNodeData = () => {
      if (document.visibilityState !== 'visible') return
      loadSpans({ silent: true, forceFresh: true })
      loadPoles({ forceFresh: true })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNodeData()
    }

    window.addEventListener('focus', refreshNodeData)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const id = window.setInterval(refreshNodeData, LIVE_NODE_REFRESH_MS)

    return () => {
      window.removeEventListener('focus', refreshNodeData)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(id)
    }
  }, [selectedNode, isOnline])

  async function handleManualSync() {
    if (syncing || !isOnline) return
    setSyncing(true)

    try {
      const promises: Promise<any>[] = []

      // 1. Purge all cache keys
      cacheDel('spanlist_areas')
      cacheDel('spanlist_overview_stats')
      if (selectedArea) cacheDel(`spanlist_nodes_${selectedArea.id}`)
      if (selectedNode) {
        cacheDel(`spanlist_spans_${selectedNode.id}`)
        cacheDel(`spanlist_poles_${selectedNode.id}`)
      }

      // 2. Fetch fresh sites & overview stats
      promises.push(
        fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
          .then(r => r.json())
          .then(data => {
            const list = Array.isArray(data) ? data : data?.data ?? []
            setAreas(list)
            cacheSet('spanlist_areas', list)
          })
      )

      promises.push(
        (async () => {
          let page = 1
          let lastPage = 1
          const all: Span[] = []
          do {
            const res = await fetch(`${SKYCABLE_API}/spans?per_page=500&page=${page}`, { headers: authHeaders() })
            const data = await res.json()
            const rows = Array.isArray(data) ? data : data?.data ?? []
            all.push(...rows)
            lastPage = Array.isArray(data) ? 1 : data?.meta?.last_page ?? data?.last_page ?? 1
            page += 1
          } while (page <= lastPage)

          const stats = {
            total: all.length,
            completed: all.filter(s => s.status === 'completed').length,
            pending: all.filter(s => s.status === 'pending').length,
          }
          setOverviewStats(stats)
          cacheSet('spanlist_overview_stats', stats)
        })()
      )

      // 3. If area selected, fetch fresh nodes
      if (selectedArea) {
        promises.push(
          fetch(`${SKYCABLE_API}/nodes?area_id=${selectedArea.id}&per_page=200`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
              const list = Array.isArray(data) ? data : data?.data ?? []
              setNodes(list)
              cacheSet(`spanlist_nodes_${selectedArea.id}`, list)
            })
        )
      }

      // 4. If node selected, fetch fresh spans & poles
      if (selectedNode) {
        promises.push(
          fetch(`${SKYCABLE_API}/spans?node_id=${selectedNode.id}&per_page=200`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
              const list = Array.isArray(data) ? data : data?.data ?? []
              setSpans(list)
              cacheSet(`spanlist_spans_${selectedNode.id}`, list, LIVE_NODE_DATA_TTL)
            })
        )

        promises.push(
          fetch(`${SKYCABLE_API}/nodes/${selectedNode.id}/poles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
              const list = Array.isArray(data) ? data : data?.data ?? []
              const parsed = list.map((p: any) => ({
                id:        p.id,
                pole_code: p.pole?.pole_code ?? p.pole_code ?? `#${p.id}`,
                lat:       p.pole?.lat  ?? null,
                lng:       p.pole?.lng  ?? null,
              }))
              setPoles(parsed)
              cacheSet(`spanlist_poles_${selectedNode.id}`, parsed, LIVE_NODE_DATA_TTL)
            })
        )
      }

      await Promise.all(promises)
      setLastSynced(Date.now())
    } catch {
    } finally {
      setSyncing(false)
    }
  }

  function handleClearCache() {
    cacheDel('spanlist_areas')
    cacheDel('spanlist_overview_stats')
    if (selectedArea) cacheDel(`spanlist_nodes_${selectedArea.id}`)
    if (selectedNode) {
      cacheDel(`spanlist_spans_${selectedNode.id}`)
      cacheDel(`spanlist_poles_${selectedNode.id}`)
    }

    setAreas([])
    setOverviewStats({ total: 0, completed: 0, pending: 0 })
    setNodes([])
    setSpans([])
    setPoles([])
    setLastSynced(null)

    // Trigger full fresh reload
    setTimeout(() => {
      // Re-trigger useEffect fetches
      setSelectedArea(null)
      setSelectedNode(null)
      navigate('/spans')
      
      // Fetch fresh areas
      fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          setAreas(list)
          cacheSet('spanlist_areas', list)
        })
    }, 100)
  }

  // Auto-generate span_code from pole codes whenever from/to pole changes,
  // but only if span_code is empty or was previously auto-generated (not manually typed).
  const autoSpanCodeRef = useRef<string>('')
  useEffect(() => {
    if (!addOpen) return
    const from = poles.find(p => String(p.id) === addForm.from_pole_id)
    const to   = poles.find(p => String(p.id) === addForm.to_pole_id)
    if (!from || !to) return
    const generated = `${from.pole_code}-${to.pole_code}`
    if (!addForm.span_code || addForm.span_code === autoSpanCodeRef.current) {
      autoSpanCodeRef.current = generated
      setAddForm(f => ({ ...f, span_code: generated }))
    }
  }, [addForm.from_pole_id, addForm.to_pole_id, addOpen, poles])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return spans.filter(s => {
      const spanCode = (s.span_code ?? '').toLowerCase()
      const fromPole = poleCode(s.from_pole).toLowerCase()
      const toPole = poleCode(s.to_pole).toLowerCase()

      const matchSearch = !q || spanCode.includes(q) || fromPole.includes(q) || toPole.includes(q)
      const matchStatus = !statusFilter || s.status === statusFilter

      return matchSearch && matchStatus
    })
  }, [spans, search, statusFilter])

  const areaStats = useMemo(() => {
    const nodeTotal = areas.reduce((sum, area) => sum + (area.nodes_count ?? 0), 0)
    return { sites: areas.length, nodes: nodeTotal }
  }, [areas])

  const nodeStats = useMemo(
    () => ({
      total: nodes.length,
      pending: nodes.filter(n => n.status === 'pending').length,
      ongoing: nodes.filter(n => n.status === 'in_progress').length,
      done: nodes.filter(n => n.status === 'completed').length,
    }),
    [nodes],
  )

  const spanStats = useMemo(
    () => ({
      total: spans.length,
      pending: spans.filter(s => s.status === 'pending').length,
      ongoing: spans.filter(s => s.status === 'in_progress').length,
      done: spans.filter(s => s.status === 'completed').length,
      cable: spans.reduce((sum, s) => sum + (s.strand_length ?? 0) * (s.number_of_runs ?? 0), 0),
    }),
    [spans],
  )

  const closeModal = () => {
    setAddOpen(false)
    setEditOpen(false)
    setDelOpen(false)
    setSelected(null)
    setFormErr(null)
    setAddForm(emptyAdd())
    setEditForm({ span_code: '', strand_length: '', number_of_runs: '', status: '' })
    autoSpanCodeRef.current = ''
  }

  const handleAdd = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedNode) return

    setSaving(true)
    setFormErr(null)

    try {
      const res = await fetch(`${SKYCABLE_API}/spans`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          node_id: selectedNode.id,
          from_pole_id: Number(addForm.from_pole_id),
          to_pole_id: Number(addForm.to_pole_id),
          span_code: addForm.span_code || null,
          strand_length: addForm.strand_length ? Number(addForm.strand_length) : null,
          number_of_runs: Number(addForm.number_of_runs) || 1,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to add span')

      const newSpan: Span = data.data ?? data
      setSpans(prev => {
        const next = [newSpan, ...prev]
        cacheSet(`spanlist_spans_${selectedNode.id}`, next, LIVE_NODE_DATA_TTL)
        return next
      })

      const fromId = Number(addForm.from_pole_id)
      const toId = Number(addForm.to_pole_id)
      closeModal()
      if (fromId && toId) setSavedPairs(prev => [...prev, { from: fromId, to: toId }])
      loadSpans({ silent: true, forceFresh: true }) // auto-refresh — show new span immediately
    } catch (err: any) {
      setFormErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected || !selectedNode) return

    setSaving(true)
    setFormErr(null)

    try {
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          span_code: editForm.span_code || null,
          strand_length: editForm.strand_length ? Number(editForm.strand_length) : null,
          number_of_runs: editForm.number_of_runs ? Number(editForm.number_of_runs) : null,
          status: editForm.status || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to update span')

      const updatedSpan: Span = data.data ?? data
      setSpans(prev => {
        const next = prev.map(s => s.id === updatedSpan.id ? updatedSpan : s)
        cacheSet(`spanlist_spans_${selectedNode.id}`, next, LIVE_NODE_DATA_TTL)
        return next
      })

      closeModal()
      loadSpans({ silent: true, forceFresh: true }) // auto-refresh — reflect backend changes immediately
    } catch (err: any) {
      setFormErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || !selectedNode) return

    setSaving(true)
    setFormErr(null)

    try {
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })

      if (!res.ok) throw new Error('Failed to delete span')

      setSpans(prev => {
        const next = prev.filter(s => s.id !== selected.id)
        cacheSet(`spanlist_spans_${selectedNode.id}`, next, LIVE_NODE_DATA_TTL)
        return next
      })

      closeModal()
    } catch (err: any) {
      setFormErr(err.message ?? 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (s: Span) => {
    setSelected(s)
    setEditForm({
      span_code: s.span_code ?? '',
      strand_length: s.strand_length != null ? String(s.strand_length) : '',
      number_of_runs: s.number_of_runs != null ? String(s.number_of_runs) : '',
      status: s.status,
    })
    setFormErr(null)
    setEditOpen(true)
  }

  const renderSites = () => {
    const siteHeaderCards = [
      { label: 'Total Sites', value: areaStats.sites, icon: 'bx-buildings', accent: BRAND_GRADIENTS[0], helper: 'available sites' },
      { label: 'Total Nodes', value: areaStats.nodes, icon: 'bx-git-branch', accent: BRAND_GRADIENTS[1], helper: 'site coverage' },
      { label: 'Total Spans', value: overviewLoading ? '...' : overviewStats.total, icon: 'bx-network-chart', accent: BRAND_GRADIENTS[2], helper: 'all span records' },
      { label: 'Finished Span', value: overviewLoading ? '...' : overviewStats.completed, icon: 'bx-check-circle', accent: 'linear-gradient(135deg, #059669, #0d9488)', helper: 'completed' },
      { label: 'Pending Span', value: overviewLoading ? '...' : overviewStats.pending, icon: 'bx-time-five', accent: 'linear-gradient(135deg, #ea580c, #f59e0b)', helper: 'waiting' },
    ]

    return (
      <>
        <ViewHero
          crumbs={[{ label: 'Span Management' }]}
          eyebrow="Network Control"
          title="All Sites"
          subtitle="Select a site to open nodes, pole mapping, span status, runs, and expected cable details."
          isOnline={isOnline}
          syncing={syncing}
          syncText={syncText}
          onSync={handleManualSync}
          onClear={handleClearCache}
        />

        <div className="rounded-2xl border bg-white p-5 shadow-sm" className="border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid min-w-[1080px] grid-cols-5 gap-4 xl:min-w-0">
              {siteHeaderCards.map(card => <StatCard key={card.label} {...card} />)}
            </div>
          </div>
        </div>

        {areasLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : areas.length === 0 ? (
          <EmptyState icon="bx-buildings" title="No sites available" text="Once sites are available, they will appear here." />
        ) : (
          <div className="rounded-2xl border bg-white p-5 shadow-sm" className="border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid min-w-[1180px] grid-cols-5 gap-4 xl:min-w-0">
                {areas.map((area) => {
                  const nodeCount = Number(area.nodes_count ?? 0)
                  const pendingCount = Number(area.pending_count ?? 0)
                  const ongoingCount = Number(area.in_progress_count ?? 0)
                  const completedCount = Number(area.completed_count ?? 0)

                  return (
                    <article
                      key={area.id}
                      onClick={() => {
                        navigate(`/spans/${slugify(area.name)}-${area.id}`)
                        setSelectedArea(area)
                        setSelectedNode(null)
                        setSearch('')
                        setStatusFilter('')
                      }}
                      className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-sky-400 opacity-0 transition group-hover:opacity-100" />

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-slate-950">
                            {areaDisplayName(area.name)}
                          </h3>

                          <p className="mt-1 text-xs text-slate-400">
                            {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                          View
                          <svg className="h-3 w-3 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>

                      <div className="mt-3">
                        <SiteCardMap poles={polesByArea.get(normalizeAreaName(area.name)) ?? []} siteName={areaDisplayName(area.name)} />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-1.5 py-2 text-center">
                          <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500">
                            Pending
                          </p>
                          <p className="mt-1 text-base font-bold text-amber-600">
                            {pendingCount}
                          </p>
                        </div>

                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-1.5 py-2 text-center">
                          <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500">
                            Ongoing
                          </p>
                          <p className="mt-1 text-base font-bold text-indigo-600">
                            {ongoingCount}
                          </p>
                        </div>

                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-1.5 py-2 text-center">
                          <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500">
                            Done
                          </p>
                          <p className="mt-1 text-base font-bold text-emerald-600">
                            {completedCount}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition group-hover:border-blue-300 group-hover:bg-blue-50 group-hover:text-blue-700">
                          <i className="bx bx-map-pin text-sm" />
                          View Site
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  const renderNodes = () => (
    <>
      <ViewHero
        crumbs={[
          {
            label: 'Sites',
            onClick: () => { navigate('/spans'); setSelectedArea(null); setSelectedNode(null) },
          },
          { label: selectedArea?.name },
        ]}
        eyebrow="Selected Site"
        title={selectedArea?.name}
        subtitle="Choose a node to view span inventory and cable details."
        isOnline={isOnline}
        syncing={syncing}
        syncText={syncText}
        onSync={handleManualSync}
        onClear={handleClearCache}
        actions={
          <button
            type="button"
            onClick={() => { navigate('/spans'); setSelectedArea(null); setSelectedNode(null) }}
            className={secondaryBtnCls}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-blue-50"
          >
            <i className="bx bx-arrow-back text-base" />
            All Sites
          </button>
        }
      />

      <div className="rounded-2xl border bg-white p-5 shadow-sm" className="border-slate-200 dark:border-slate-700">
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-[940px] grid-cols-4 gap-4 xl:min-w-0">
            <StatCard label="Total Nodes" value={nodeStats.total} icon="bx-network-chart" accent={BRAND_GRADIENTS[0]} />
            <StatCard label="Pending" value={nodeStats.pending} icon="bx-time-five" accent="linear-gradient(135deg, #ea580c, #f59e0b)" />
            <StatCard label="In Progress" value={nodeStats.ongoing} icon="bx-loader-circle" accent={BRAND_GRADIENTS[2]} />
            <StatCard label="Completed" value={nodeStats.done} icon="bx-check-circle" accent="linear-gradient(135deg, #059669, #0d9488)" />
          </div>
        </div>
      </div>

      {nodesLoading ? (
        <div className="grid justify-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,420px))]">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState icon="bx-layer" title="No nodes in this site" text="This site does not have any nodes yet." />
      ) : (
        <div className="rounded-2xl border bg-white p-5 shadow-sm" className="border-slate-200 dark:border-slate-700">
          <div className="grid justify-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,420px))]">
            {nodes.map((node) => {
              const cfg = NODE_STATUS_CFG[node.status] ?? NODE_STATUS_CFG.pending
              const nodeCode = node.full_label ?? `Node #${node.id}`
              const contractor = node.subcontractor?.name ?? 'No contractor'
              const team = node.team?.name ?? 'No team assigned'
              const spansCount = Number(node.spans_count ?? 0)
              const expectedCable = Number(node.expected_cable ?? 0)

              return (
                <article
                  key={node.id}
                  onClick={() => {
                    navigate(`/spans/${slugify(selectedArea!.name)}-${selectedArea!.id}/${slugify(node.full_label ?? node.name)}-${node.id}`)
                    setSelectedNode(node)
                    setSearch('')
                    setStatusFilter('')
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                >
                  <div className="relative overflow-hidden rounded-xl border border-slate-100">
                    <NodeVicinityMap nodeId={node.id} nodeName={node.name} />
                    <div
                      className="absolute top-2.5 right-2.5 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-md"
                      style={{ background: cfg.bar }}
                    >
                      {cfg.label}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col px-3.5 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: '#64748b' }}>
                          {nodeCode}
                        </p>
                        <h3 className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600" title={node.name}>
                          {node.name}
                        </h3>
                        <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                          Skycable Node · ID: {node.id}{node.barangay?.name ? ` · ${node.barangay.name}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-4 rounded-2xl border border-slate-100/80 bg-slate-50/80 p-2.5 text-center">
                      <div className="border-r border-slate-200/60 last:border-none">
                        <span className="block text-sm font-black text-slate-900">
                          {spansCount}
                        </span>
                        <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">
                          Spans
                        </span>
                      </div>
                      <div className="border-r border-slate-200/60 last:border-none">
                        <span className="block text-sm font-black text-rose-600">
                          {expectedCable ? `${expectedCable}m` : '0m'}
                        </span>
                        <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">
                          Target
                        </span>
                      </div>
                      <div className="border-r border-slate-200/60 last:border-none">
                        <span className="block truncate px-1 text-[10px] font-black text-blue-600">
                          {team}
                        </span>
                        <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">
                          Team
                        </span>
                      </div>
                      <div className="border-r border-slate-200/60 last:border-none">
                        <span className="block text-sm font-black" style={{ color: cfg.text }}>
                          {cfg.label}
                        </span>
                        <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">
                          Status
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600" title={`Subcontractor: ${contractor}`}>
                          {contractor}
                        </span>
                        <span className="truncate rounded-md bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600" title={`Team: ${team}`}>
                          {team}
                        </span>
                      </div>

                      <svg className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </>
  )

  const renderSpans = () => (
    <>
      <ViewHero
        crumbs={[
          {
            label: 'Sites',
            onClick: () => { navigate('/spans'); setSelectedArea(null); setSelectedNode(null) },
          },
          {
            label: selectedArea?.name,
            onClick: () => { navigate(`/spans/${slugify(selectedArea?.name ?? '')}-${selectedArea?.id}`); setSelectedNode(null) },
          },
          { label: selectedNode?.name },
        ]}
        eyebrow={selectedNode?.full_label ?? `Node #${selectedNode?.id}`}
        title={selectedNode?.name}
        subtitle="Track pole mapping, span status, runs, and expected cable."
        isOnline={isOnline}
        syncing={syncing}
        syncText={syncText}
        onSync={handleManualSync}
        onClear={handleClearCache}
        actions={
          <>
            {admin && (
              <button
                type="button"
                onClick={() => {
                  setAddForm(emptyAdd())
                  setFormErr(null)
                  setAddOpen(true)
                }}
                className={primaryBtnCls}
                style={{ backgroundColor: '#059669' }}
              >
                <i className="bx bx-plus text-base" />
                Add Span
              </button>
            )}

            {/* View toggle */}
            <div
              className="flex overflow-hidden rounded-xl"
              style={{ border: `1px solid #bfdbfe` }}
            >
              {(['list', 'map'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSpanView(v)}
                  className="inline-flex h-10 items-center gap-1.5 px-3.5 text-xs font-black transition"
                  style={{
                    background: spanView === v ? '#059669' : '#ffffff',
                    color: spanView === v ? '#ffffff' : '#64748b',
                  }}
                >
                  <i className={`bx text-base ${v === 'list' ? 'bx-list-ul' : 'bx-map-alt'}`} />
                  {v === 'list' ? 'List' : 'Map'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => { navigate(`/spans/${slugify(selectedArea?.name ?? '')}-${selectedArea?.id}`); setSelectedNode(null) }}
              className={secondaryBtnCls}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-blue-50"
            >
              <i className="bx bx-arrow-back text-base" />
              Back
            </button>
          </>
        }
      />

      <div className="rounded-2xl border bg-white p-5 shadow-sm" className="border-slate-200 dark:border-slate-700">
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-[1080px] grid-cols-5 gap-4 xl:min-w-0">
            <StatCard label="Total Spans" value={spanStats.total} icon="bx-git-branch" accent={BRAND_GRADIENTS[0]} />
            <StatCard label="Pending" value={spanStats.pending} icon="bx-time-five" accent="linear-gradient(135deg, #ea580c, #f59e0b)" />
            <StatCard label="In Progress" value={spanStats.ongoing} icon="bx-loader-circle" accent={BRAND_GRADIENTS[2]} />
            <StatCard label="Completed" value={spanStats.done} icon="bx-check-circle" accent="linear-gradient(135deg, #059669, #0d9488)" />
            <StatCard label="Exp. Cable" value={`${fmt(spanStats.cable)}m`} icon="bx-ruler" accent={BRAND_GRADIENTS[4]} />
          </div>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
        style={{ border: `1px solid #e2e8f0` }}
      >
        <div className="relative min-w-[260px] max-w-xl flex-1">
          <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-[#8E96C5]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search span or pole..."
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-sm font-semibold outline-none"
            style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className="h-10 rounded-xl px-3.5 text-xs font-black transition"
            style={{
              background: !statusFilter ? '#0f172a' : '#ffffff',
              color: !statusFilter ? '#ffffff' : '#64748b',
              border: !statusFilter ? '1px solid transparent' : '1px solid #e2e8f0',
            }}
          >
            All
          </button>

          {STATUSES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-black transition"
              style={{
                background: statusFilter === s ? STATUS_CFG[s].bar : '#ffffff',
                color: statusFilter === s ? '#ffffff' : STATUS_CFG[s].text,
                border: statusFilter === s ? '1px solid transparent' : `1px solid ${STATUS_CFG[s].border}`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusFilter === s ? '#ffffff' : STATUS_CFG[s].dot }} />
              {STATUS_CFG[s].label}
            </button>
          ))}

          <span className="rounded-xl px-3 py-2 text-xs font-black" style={{ backgroundColor: '#eff6ff', color: '#64748b', border: `1px solid #e2e8f0` }}>
            {filtered.length} results
          </span>
        </div>
      </div>

      {spanView === 'map' ? (
        <div
          className="overflow-hidden rounded-[20px]"
          style={{ height: 640, border: `1px solid #e2e8f0`, boxShadow: '0 20px 40px -30px rgba(15,23,42,0.28)' }}
        >
          <LeafletSpanMap
            poles={poles}
            spans={spans}
            savedPairs={savedPairs}
            onPairSelected={(from, to) => {
              setAddForm(f => ({ ...f, from_pole_id: String(from.id), to_pole_id: String(to.id) }))
              setFormErr(null)
              setAddOpen(true)
            }}
          />
        </div>
      ) : spansLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-sm font-bold" style={{ color: '#64748b' }}>Loading spans...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="bx-git-branch"
          title="No spans found"
          text={search || statusFilter ? 'Try changing the search keyword or status filter.' : 'Declare the first span for this node.'}
          action={
            admin && (
              <button
                type="button"
                onClick={() => {
                  setAddForm(emptyAdd())
                  setFormErr(null)
                  setAddOpen(true)
                }}
                className={primaryBtnCls}
                style={{ backgroundColor: '#059669' }}
              >
                <i className="bx bx-plus" />
                Declare First Span
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: `1px solid #e2e8f0` }}>
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4" className="border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#64748b' }}>Span Inventory</p>
              <h3 className="mt-1 text-base font-semibold" style={{ color: '#0f172a' }}>{selectedNode?.name}</h3>
            </div>
            <span className="rounded-xl border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600" className="border-slate-200 dark:border-slate-700">
              Showing {filtered.length} {filtered.length === 1 ? 'span' : 'spans'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="bg-slate-900">
                  {['Span Code', 'From Pole', 'To Pole', 'Length', 'Runs', 'Exp. Cable', 'Status', ...(admin ? ['Actions'] : [])].map(h => (
                    <th key={h} className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80 first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((span, index) => {
                  const cfg = STATUS_CFG[span.status] ?? STATUS_CFG.pending

                  return (
                    <tr
                      key={span.id}
                      className="transition hover:bg-slate-50"
                      
                    >
                      <td className="border-b px-4 py-3 align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: cfg.bar }}>
                            <i className="bx bx-git-branch text-lg" />
                          </div>
                          <div>
                            <p className="font-mono text-sm font-bold" style={{ color: '#2563eb' }}>
                              {span.span_code ?? <span className="font-sans text-slate-400">No code</span>}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Span #{span.id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <PolePill value={poleCode(span.from_pole)} />
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <PolePill value={poleCode(span.to_pole)} />
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <p className="font-mono text-sm font-black" style={{ color: '#0f172a' }}>{formatMeters(span.strand_length)}</p>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <p className="font-mono text-sm font-black" style={{ color: '#0f172a' }}>{span.number_of_runs ?? '—'}</p>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <p className="font-mono text-sm font-black" style={{ color: '#0f172a' }}>{expectedCable(span.strand_length, span.number_of_runs)}</p>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <StatusChip status={span.status} />
                      </td>

                      {admin && (
                        <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                          <div className="inline-flex items-center gap-1 rounded-xl border bg-slate-50 p-1" className="border-slate-200 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => openEdit(span)}
                              title="Edit"
                              className="rounded-lg p-2 transition hover:text-white"
                              style={{ color: '#2563eb' }}
                            >
                              <i className="bx bx-edit text-base" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(span)
                                setFormErr(null)
                                setDelOpen(true)
                              }}
                              title="Delete"
                              className="rounded-lg p-2 text-red-500 transition hover:bg-red-600 hover:text-white"
                            >
                              <i className="bx bx-trash text-base" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>

              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <td colSpan={admin ? 8 : 7} className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: '#64748b' }}>
                    Live filter active — {filtered.length} displayed
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )

  return (
    <PageShell>
      {!selectedArea && renderSites()}
      {selectedArea && !selectedNode && renderNodes()}
      {selectedArea && selectedNode && renderSpans()}

      <Modal open={addOpen} title="Declare New Span" sub={`Node: ${selectedNode?.name}`} onClose={closeModal} wide>
        <form onSubmit={handleAdd} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['from_pole_id', 'to_pole_id'] as const).map(k => (
              <div key={k}>
                <label className={labelCls}>{k === 'from_pole_id' ? 'From Pole *' : 'To Pole *'}</label>
                <div className="relative">
                  <select
                    required
                    value={addForm[k]}
                    onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))}
                    className={selectCls}
                    style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
                  >
                    <option value="">Select pole...</option>
                    {poles.map(p => <option key={p.id} value={p.id}>{p.pole_code}</option>)}
                  </select>
                  <Chevron />
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className={labelCls}>
              Span Code
              {addForm.span_code && addForm.span_code === autoSpanCodeRef.current && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: '#eff6ff', color: '#2563eb', border: `1px solid #bfdbfe` }}>
                  Auto
                </span>
              )}
            </label>
            <input
              value={addForm.span_code}
              onChange={e => {
                autoSpanCodeRef.current = ''
                setAddForm(f => ({ ...f, span_code: e.target.value }))
              }}
              placeholder="Auto-generated from poles"
              className={inputCls}
              style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Strand Length (m)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={addForm.strand_length}
                onChange={e => setAddForm(f => ({ ...f, strand_length: e.target.value }))}
                placeholder="0.00"
                className={inputCls}
                style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
              />
            </div>

            <div>
              <label className={labelCls}>Runs</label>
              <input
                type="number"
                min="1"
                value={addForm.number_of_runs}
                onChange={e => setAddForm(f => ({ ...f, number_of_runs: e.target.value }))}
                className={inputCls}
                style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
              />
            </div>
          </div>

          {addForm.strand_length && (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: '#eff6ff', border: `1px solid #bfdbfe` }}>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#2563eb' }}>Expected Cable</span>
              <span className="text-lg font-black" style={{ color: '#2563eb' }}>
                {(parseFloat(addForm.strand_length || '0') * (parseInt(addForm.number_of_runs) || 1)).toFixed(1)}m
              </span>
            </div>
          )}

          {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{formErr}</div>}

          <div className="flex justify-end gap-2 border-t pt-4" className="border-slate-200 dark:border-slate-700">
            <button type="button" onClick={closeModal} className={secondaryBtnCls} style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}>Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60" style={{ backgroundColor: '#059669' }}>
              {saving ? <><i className="bx bx-loader-alt animate-spin" />Saving...</> : <><i className="bx bx-check" />Declare Span</>}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} title="Edit Span" sub={selected?.span_code ?? `Span #${selected?.id}`} onClose={closeModal} wide>
        <form onSubmit={handleEdit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: 'From Pole', code: poleCode(selected?.from_pole) },
              { label: 'To Pole', code: poleCode(selected?.to_pole) },
            ].map(({ label, code }) => (
              <div key={label}>
                <p className={labelCls}>{label}</p>
                <div className="flex h-11 items-center rounded-xl bg-[#F7F8FF] px-4 font-mono text-sm font-black" style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}>{code}</div>
              </div>
            ))}
          </div>

          <div>
            <label className={labelCls}>Span Code</label>
            <input
              value={editForm.span_code}
              onChange={e => setEditForm(f => ({ ...f, span_code: e.target.value }))}
              placeholder="SP-001"
              className={inputCls}
              style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Strand Length (m)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.strand_length}
                onChange={e => setEditForm(f => ({ ...f, strand_length: e.target.value }))}
                className={inputCls}
                style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
              />
            </div>

            <div>
              <label className={labelCls}>Runs</label>
              <input
                type="number"
                min="1"
                value={editForm.number_of_runs}
                onChange={e => setEditForm(f => ({ ...f, number_of_runs: e.target.value }))}
                className={inputCls}
                style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
              />
            </div>
          </div>

          {editForm.strand_length && (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: '#eff6ff', border: `1px solid #bfdbfe` }}>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#2563eb' }}>Expected Cable</span>
              <span className="text-lg font-black" style={{ color: '#2563eb' }}>
                {(parseFloat(editForm.strand_length || '0') * (parseInt(editForm.number_of_runs) || 1)).toFixed(1)}m
              </span>
            </div>
          )}

          <div>
            <label className={labelCls}>Status</label>
            <div className="relative">
              <select
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value as SpanStatus }))}
                className={selectCls}
                style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
              </select>
              <Chevron />
            </div>
          </div>

          {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{formErr}</div>}

          <div className="flex justify-end gap-2 border-t pt-4" className="border-slate-200 dark:border-slate-700">
            <button type="button" onClick={closeModal} className={secondaryBtnCls} style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}>Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60" style={{ backgroundColor: '#059669' }}>
              {saving ? <><i className="bx bx-loader-alt animate-spin" />Saving...</> : <><i className="bx bx-save" />Update Span</>}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={delOpen && !!selected} title="Delete Span?" sub="This action cannot be undone." onClose={closeModal} danger>
        <div className="space-y-5">
          <div className="rounded-2xl bg-[#F7F8FF] p-4" style={{ border: `1px solid #e2e8f0` }}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Span', selected?.span_code ?? `SPAN-${selected?.id}`],
                ['From Pole', poleCode(selected?.from_pole)],
                ['To Pole', poleCode(selected?.to_pole)],
                ['Status', selected?.status ? STATUS_CFG[selected.status].label : '—'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: '#64748b' }}>{k}</dt>
                  <dd className="mt-1 font-black" style={{ color: '#0f172a' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{formErr}</div>}

          <div className="flex gap-3">
            <button type="button" onClick={handleDelete} disabled={saving} className={`${dangerBtnCls} flex-1`}>
              {saving ? <><i className="bx bx-loader-alt animate-spin" />Deleting...</> : <><i className="bx bx-trash" />Yes, Delete</>}
            </button>

            <button type="button" onClick={closeModal} className={`${secondaryBtnCls} flex-1`} style={{ border: `1px solid #e2e8f0`, color: '#0f172a' }}>Cancel</button>
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}
