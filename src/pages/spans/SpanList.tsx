import { useEffect, useMemo, useState, useRef, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getToken, SKYCABLE_API, isAdmin } from '../../lib/auth'
import { cacheGet, cacheSet, cacheDel } from '../../lib/cache'
import { slugify } from '../../lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type SpanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

type Area = { id: number; name: string; nodes_count?: number }

type NodeItem = {
  id: number
  name: string
  full_label?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  expected_cable?: number | null
  subcontractor?: { name: string } | null
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
  blue: '#2E3791',
  blue2: '#4450C4',
  dark: '#1F276F',
  textDark: '#0D123F',
  soft: '#EEF1FF',
  softer: '#F7F8FF',
  panel: '#F4F6FF',
  border: '#D8DCFF',
  borderStrong: '#C9D0FF',
  muted: '#6B73A8',
  muted2: '#8E96C5',
}

const BRAND_GRADIENTS = [
  'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
  'linear-gradient(135deg, #1F276F 0%, #2E3791 100%)',
  'linear-gradient(135deg, #2E3791 0%, #5362D8 100%)',
  'linear-gradient(135deg, #283184 0%, #4450C4 100%)',
  'linear-gradient(135deg, #182060 0%, #2E3791 100%)',
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
    'ngrok-skip-browser-warning': '1',
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
  'mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-[#8E96C5]'

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
          'relative max-h-[90vh] w-full overflow-hidden rounded-[24px] bg-white shadow-2xl',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        style={{ border: `1px solid ${danger ? '#fecaca' : BRAND.borderStrong}` }}
      >
        <div
          className="relative overflow-hidden px-6 py-5"
          style={{
            background: danger
              ? 'linear-gradient(135deg, #dc2626 0%, #e11d48 100%)'
              : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
          }}
        >
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white">{title}</h3>
              {sub && <p className="mt-0.5 text-xs font-semibold text-white/75">{sub}</p>}
            </div>

            <button onClick={onClose} className="rounded-full p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white">
              <i className="bx bx-x text-xl leading-none" />
            </button>
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
      className="relative min-h-[190px] overflow-hidden rounded-[22px] bg-white p-5"
      style={{
        border: `1px solid ${BRAND.border}`,
        boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
      }}
    >
      <div className="h-11 w-11 animate-pulse rounded-2xl bg-[#EEF1FF]" />
      <div className="mt-7 h-4 w-2/3 animate-pulse rounded-full bg-[#EEF1FF]" />
      <div className="mt-3 h-3 w-1/3 animate-pulse rounded-full bg-[#EEF1FF]" />
    </div>
  )
}

function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] bg-white px-6 py-14 text-center"
      style={{
        color: BRAND.muted2,
        border: `1px solid ${BRAND.border}`,
      }}
    >
      <i className={cx('bx text-5xl', icon)} />
      <h3 className="mt-3 text-base font-black" style={{ color: BRAND.textDark }}>{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm font-semibold" style={{ color: BRAND.muted }}>{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function StatCard({ label, value, icon, accent, helper }: { label: string; value: number | string; icon: string; accent: string; helper?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[20px] bg-white p-4"
      style={{
        border: `1px solid ${BRAND.border}`,
        boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
      }}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>
            {label}
          </p>

          <p className="mt-2 truncate font-mono text-[28px] font-black leading-none" style={{ color: BRAND.textDark }}>
            {value}
          </p>

          {helper && <p className="mt-2 text-[11px] font-bold" style={{ color: BRAND.muted2 }}>{helper}</p>}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: accent }}>
          <i className={cx('bx text-[22px]', icon)} />
        </div>
      </div>
    </div>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 bg-slate-50 px-4 py-4 pb-10 sm:px-6 lg:px-8">{children}</div>
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
      className="relative overflow-hidden rounded-[28px] px-6 py-7"
      style={{
        background: `linear-gradient(135deg, #ffffff 0%, ${BRAND.softer} 40%, ${BRAND.soft} 100%)`,
        border: `1px solid ${BRAND.borderStrong}`,
        boxShadow: '0 24px 60px -38px rgba(46,55,145,0.38)',
      }}
    >
      <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(46,55,145,0.12)' }} />
      <div className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(68,80,196,0.12)' }} />

      <div className="relative">
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold" style={{ color: BRAND.muted2 }}>
          {crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 && <i className="bx bx-chevron-right text-base" />}
              {c.onClick ? (
                <button type="button" onClick={c.onClick} className="transition hover:text-[#2E3791]">
                  {c.label}
                </button>
              ) : (
                <span style={{ color: BRAND.textDark }}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                backgroundColor: BRAND.soft,
                color: BRAND.blue,
                border: `1px solid ${BRAND.borderStrong}`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND.blue }} />
              {eyebrow}
            </span>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]" style={{ color: BRAND.blue }}>
              {title}
            </h2>

            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>{subtitle}</p>
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
      className="inline-flex rounded-full px-3 py-1 font-mono text-[11px] font-black"
      style={{
        backgroundColor: BRAND.soft,
        color: BRAND.blue,
        border: `1px solid ${BRAND.borderStrong}`,
      }}
    >
      {value}
    </span>
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
      setAreas(hit)
      setAreasLoading(false)
      // silent background revalidation fetch:
      fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          setAreas(list)
          cacheSet('spanlist_areas', list)
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
        setAreas(list)
        cacheSet('spanlist_areas', list)
        setLastSynced(Date.now())
        if (spanSiteSlug) {
          const areaId = idFromSlug(spanSiteSlug)
          const area = list.find(a => a.id === areaId) ?? null
          setSelectedArea(area)
        }
      })
      .catch(() => {})
      .finally(() => setAreasLoading(false))
  }, [])

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

  const loadSpans = (silent = false) => {
    if (!selectedNode) return

    const ck = `spanlist_spans_${selectedNode.id}`
    const hit = cacheGet<Span[]>(ck)
    if (hit) {
      setSpans(hit)
      setSpansLoading(false)
      // Background revalidation silently
      fetch(`${SKYCABLE_API}/spans?node_id=${selectedNode.id}&per_page=200`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.data ?? []
          setSpans(list)
          cacheSet(ck, list)
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
        cacheSet(ck, list)
        setLastSynced(Date.now())
      })
      .catch(() => setSpans([]))
      .finally(() => setSpansLoading(false))
  }

  useEffect(() => {
    if (!selectedNode) {
      setSpans([])
      setPoles([])
      setSavedPairs([])
      setSpanView('list')
      return
    }

    loadSpans()

    const pck = `spanlist_poles_${selectedNode.id}`
    const phit = cacheGet<any[]>(pck)
    if (phit) {
      setPoles(phit)
      // silent background fetch to revalidate
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
          cacheSet(pck, parsed)
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
        cacheSet(pck, parsed)
        setLastSynced(Date.now())
      })
      .catch(() => setPoles([]))
  }, [selectedNode])

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
              cacheSet(`spanlist_spans_${selectedNode.id}`, list)
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
              cacheSet(`spanlist_poles_${selectedNode.id}`, parsed)
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
        cacheSet(`spanlist_spans_${selectedNode.id}`, next)
        return next
      })

      const fromId = Number(addForm.from_pole_id)
      const toId = Number(addForm.to_pole_id)
      closeModal()
      if (fromId && toId) setSavedPairs(prev => [...prev, { from: fromId, to: toId }])
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
        cacheSet(`spanlist_spans_${selectedNode.id}`, next)
        return next
      })

      closeModal()
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
        cacheSet(`spanlist_spans_${selectedNode.id}`, next)
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

        <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
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
          <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid min-w-[1180px] grid-cols-5 gap-4 xl:min-w-0">
                {areas.map((area, index) => {
                  const gradient = BRAND_GRADIENTS[index % BRAND_GRADIENTS.length]
                  const nodeCount = Number(area.nodes_count ?? 0)

                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => {
                        navigate(`/spans/${slugify(area.name)}-${area.id}`)
                        setSelectedArea(area)
                        setSelectedNode(null)
                        setSearch('')
                        setStatusFilter('')
                      }}
                      className="group relative overflow-hidden rounded-[22px] bg-white p-5 text-left transition duration-300 hover:-translate-y-1"
                      style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
                    >
                      <div className="absolute inset-x-0 top-0 h-1" style={{ background: gradient }} />

                      <div className="relative flex min-h-[190px] flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>
                                Site {index + 1}
                              </p>

                              <p className="mt-3 line-clamp-2 text-xl font-black leading-tight tracking-[-0.04em]" style={{ color: BRAND.textDark }}>
                                {area.name}
                              </p>
                            </div>

                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: gradient }}>
                              <i className="bx bx-map-pin text-[22px]" />
                            </div>
                          </div>

                          <p className="mt-3 text-sm font-semibold leading-6" style={{ color: BRAND.muted }}>
                            Open nodes and manage declared pole-to-pole spans.
                          </p>
                        </div>

                        <div className="mt-5 flex items-end justify-between border-t pt-4" style={{ borderColor: BRAND.border }}>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>Nodes</p>
                            <p className="mt-1 font-mono text-3xl font-black leading-none" style={{ color: BRAND.textDark }}>{nodeCount}</p>
                          </div>

                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black transition" style={{ backgroundColor: BRAND.soft, color: BRAND.blue }}>
                            View Nodes
                            <i className="bx bx-right-arrow-alt text-base" />
                          </span>
                        </div>
                      </div>
                    </button>
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
            style={{ border: `1px solid ${BRAND.borderStrong}`, color: BRAND.dark }}
          >
            <i className="bx bx-arrow-back text-base" />
            All Sites
          </button>
        }
      />

      <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState icon="bx-layer" title="No nodes in this site" text="This site does not have any nodes yet." />
      ) : (
        <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
            {nodes.map((node, index) => {
              const cfg = NODE_STATUS_CFG[node.status] ?? NODE_STATUS_CFG.pending
              const gradient = BRAND_GRADIENTS[index % BRAND_GRADIENTS.length]

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    navigate(`/spans/${slugify(selectedArea!.name)}-${selectedArea!.id}/${slugify(node.full_label ?? node.name)}-${node.id}`)
                    setSelectedNode(node)
                    setSearch('')
                    setStatusFilter('')
                  }}
                  className="group relative overflow-hidden rounded-[22px] bg-white p-5 text-left transition duration-300 hover:-translate-y-1"
                  style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
                >
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: cfg.bar }} />

                  <div className="relative flex min-h-[170px] flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>
                            {node.full_label ?? `Node #${node.id}`}
                          </p>

                          <p className="mt-3 truncate text-xl font-black leading-tight tracking-[-0.04em]" style={{ color: BRAND.textDark }}>
                            {node.name}
                          </p>
                        </div>

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: gradient }}>
                          <i className="bx bx-git-branch text-[22px]" />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <StatusChip status={node.status} />

                        {node.subcontractor?.name ? (
                          <span className="max-w-full truncate rounded-full px-2.5 py-1 text-[10px] font-black" style={{ backgroundColor: BRAND.soft, color: BRAND.blue }}>
                            {node.subcontractor.name}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-400">No contractor</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t pt-4" style={{ borderColor: BRAND.border }}>
                      <span className="text-xs font-bold" style={{ color: BRAND.muted }}>View span inventory</span>
                      <span className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black" style={{ backgroundColor: BRAND.soft, color: BRAND.blue }}>
                        View
                        <i className="bx bx-right-arrow-alt text-base" />
                      </span>
                    </div>
                  </div>
                </button>
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
                style={{ background: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' }}
              >
                <i className="bx bx-plus text-base" />
                Add Span
              </button>
            )}

            {/* View toggle */}
            <div
              className="flex overflow-hidden rounded-xl"
              style={{ border: `1px solid ${BRAND.borderStrong}` }}
            >
              {(['list', 'map'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSpanView(v)}
                  className="inline-flex h-10 items-center gap-1.5 px-3.5 text-xs font-black transition"
                  style={{
                    background: spanView === v ? 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' : '#ffffff',
                    color: spanView === v ? '#ffffff' : BRAND.muted,
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
              style={{ border: `1px solid ${BRAND.borderStrong}`, color: BRAND.dark }}
            >
              <i className="bx bx-arrow-back text-base" />
              Back
            </button>
          </>
        }
      />

      <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
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
        className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-3"
        style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
      >
        <div className="relative min-w-[260px] max-w-xl flex-1">
          <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-[#8E96C5]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search span or pole..."
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-sm font-semibold outline-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className="h-10 rounded-xl px-3.5 text-xs font-black transition"
            style={{
              background: !statusFilter ? 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' : '#ffffff',
              color: !statusFilter ? '#ffffff' : BRAND.muted,
              border: !statusFilter ? '1px solid transparent' : `1px solid ${BRAND.border}`,
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

          <span className="rounded-xl px-3 py-2 text-xs font-black" style={{ backgroundColor: BRAND.softer, color: BRAND.muted, border: `1px solid ${BRAND.border}` }}>
            {filtered.length} results
          </span>
        </div>
      </div>

      {spanView === 'map' ? (
        <div
          className="overflow-hidden rounded-[20px]"
          style={{ height: 640, border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
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
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }} />
            <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>Loading spans...</p>
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
                style={{ background: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' }}
              >
                <i className="bx bx-plus" />
                Declare First Span
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[20px] bg-white" style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: BRAND.border }}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>Span Inventory</p>
              <h3 className="mt-1 text-lg font-black" style={{ color: BRAND.textDark }}>{selectedNode?.name}</h3>
            </div>
            <span className="rounded-xl px-3 py-2 text-xs font-black" style={{ backgroundColor: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
              Showing {filtered.length} {filtered.length === 1 ? 'span' : 'spans'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr style={{ background: BRAND.blue }}>
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
                      className="transition hover:bg-[#F8F9FF]"
                      style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : BRAND.softer }}
                    >
                      <td className="border-b px-4 py-3 align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: cfg.bar }}>
                            <i className="bx bx-git-branch text-lg" />
                          </div>
                          <div>
                            <p className="font-mono text-sm font-black" style={{ color: BRAND.blue }}>
                              {span.span_code ?? <span className="font-sans text-slate-400">No code</span>}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: BRAND.muted2 }}>Span #{span.id}</p>
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
                        <p className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>{formatMeters(span.strand_length)}</p>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <p className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>{span.number_of_runs ?? '—'}</p>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <p className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>{expectedCable(span.strand_length, span.number_of_runs)}</p>
                      </td>

                      <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                        <StatusChip status={span.status} />
                      </td>

                      {admin && (
                        <td className="border-b px-4 py-3 text-center align-middle" style={{ borderColor: '#ECEEFF' }}>
                          <div className="inline-flex items-center gap-1 rounded-xl bg-[#F7F8FF] p-1" style={{ border: `1px solid ${BRAND.border}` }}>
                            <button
                              type="button"
                              onClick={() => openEdit(span)}
                              title="Edit"
                              className="rounded-lg p-2 transition hover:text-white"
                              style={{ color: BRAND.blue }}
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
                <tr style={{ backgroundColor: BRAND.panel }}>
                  <td colSpan={admin ? 8 : 7} className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted }}>
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
                    style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
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
                <span className="ml-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
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
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
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
                style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
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
                style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
              />
            </div>
          </div>

          {addForm.strand_length && (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: BRAND.soft, border: `1px solid ${BRAND.borderStrong}` }}>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: BRAND.blue }}>Expected Cable</span>
              <span className="text-lg font-black" style={{ color: BRAND.blue }}>
                {(parseFloat(addForm.strand_length || '0') * (parseInt(addForm.number_of_runs) || 1)).toFixed(1)}m
              </span>
            </div>
          )}

          {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{formErr}</div>}

          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: BRAND.border }}>
            <button type="button" onClick={closeModal} className={secondaryBtnCls} style={{ border: `1px solid ${BRAND.border}`, color: BRAND.dark }}>Cancel</button>
            <button type="submit" disabled={saving} className={primaryBtnCls} style={{ background: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' }}>
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
                <div className="flex h-11 items-center rounded-xl bg-[#F7F8FF] px-4 font-mono text-sm font-black" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}>{code}</div>
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
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
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
                style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
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
                style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
              />
            </div>
          </div>

          {editForm.strand_length && (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: BRAND.soft, border: `1px solid ${BRAND.borderStrong}` }}>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: BRAND.blue }}>Expected Cable</span>
              <span className="text-lg font-black" style={{ color: BRAND.blue }}>
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
                style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
              </select>
              <Chevron />
            </div>
          </div>

          {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{formErr}</div>}

          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: BRAND.border }}>
            <button type="button" onClick={closeModal} className={secondaryBtnCls} style={{ border: `1px solid ${BRAND.border}`, color: BRAND.dark }}>Cancel</button>
            <button type="submit" disabled={saving} className={primaryBtnCls} style={{ background: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' }}>
              {saving ? <><i className="bx bx-loader-alt animate-spin" />Saving...</> : <><i className="bx bx-save" />Update Span</>}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={delOpen && !!selected} title="Delete Span?" sub="This action cannot be undone." onClose={closeModal} danger>
        <div className="space-y-5">
          <div className="rounded-2xl bg-[#F7F8FF] p-4" style={{ border: `1px solid ${BRAND.border}` }}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Span', selected?.span_code ?? `SPAN-${selected?.id}`],
                ['From Pole', poleCode(selected?.from_pole)],
                ['To Pole', poleCode(selected?.to_pole)],
                ['Status', selected?.status ? STATUS_CFG[selected.status].label : '—'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: BRAND.muted2 }}>{k}</dt>
                  <dd className="mt-1 font-black" style={{ color: BRAND.textDark }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {formErr && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{formErr}</div>}

          <div className="flex gap-3">
            <button type="button" onClick={handleDelete} disabled={saving} className={`${dangerBtnCls} flex-1`}>
              {saving ? <><i className="bx bx-loader-alt animate-spin" />Deleting...</> : <><i className="bx bx-trash" />Yes, Delete</>}
            </button>

            <button type="button" onClick={closeModal} className={`${secondaryBtnCls} flex-1`} style={{ border: `1px solid ${BRAND.border}`, color: BRAND.dark }}>Cancel</button>
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}
