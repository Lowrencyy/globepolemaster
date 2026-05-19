import {
  useEffect,
  useRef,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { SKYCABLE_API, getToken, isAdmin } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import telcoImg from '../../assets/images/telco.png'

const CACHE_KEY = 'sitelist'

type PolePin = { lat: number; lng: number; status: string; area: string }

type Site = {
  id: number
  name: string
  nodes_count?: number
  pending_count?: number
  in_progress_count?: number
  completed_count?: number
}

type ApiListResponse = Site[] | { data?: Site[]; message?: string }
type ApiSingleResponse = Site | { data?: Site; message?: string }

const REGION_ORDER = [
  'north luzon',
  'south luzon',
  'ncr',
  'metro manila',
  'visayas',
  'mindanao',
]

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

function apiMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message

    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

function authHeaders(): Record<string, string> {
  const token = getToken()

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

// ── Tile math helpers (mirrors mobile PolesVicinityMap) ───────────────────────
const TILE_PX = 256

function latLngToTileFrac(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z)
  const xFrac = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { xFrac, yFrac, tileX: Math.floor(xFrac), tileY: Math.floor(yFrac) }
}

// ── Site card thumbnail: static-tile vicinity map ────────────────────────────
// Uses a fixed card size (h-36 = 144px height, width measured once on mount).
const MAP_H = 144

function SiteCardMap({ poles, siteName }: { poles: PolePin[]; siteName: string }) {
  // Start with a reasonable default; update once the container is measured
  const [w, setW] = useState(300)
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    // Measure real width immediately
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setW(rect.width)
    // Update on resize
    const obs = new ResizeObserver(es => {
      const cw = es[0]?.contentRect.width
      if (cw && cw > 0) setW(cw)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (poles.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
        <img src={telcoImg} alt="Telcovantage" className="h-36 w-full object-contain p-4 opacity-40" />
      </div>
    )
  }

  const h = MAP_H
  const lats = poles.map(p => p.lat)
  const lngs = poles.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // Use centroid (average) so the view centers on where most poles cluster,
  // not skewed toward outliers like bounding-box midpoint would be.
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length
  const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length

  const latSpan = Math.max(maxLat - minLat, 0.0005)
  const lngSpan = Math.max(maxLng - minLng, 0.0005)
  const zLng = Math.log2((w * 0.55 * 360) / (TILE_PX * lngSpan))
  const zLat = Math.log2((h * 0.55 * 180) / (TILE_PX * latSpan))
  const zoom = Math.max(8, Math.min(14, Math.floor(Math.min(zLng, zLat))))

  const { xFrac, yFrac, tileX, tileY } = latLngToTileFrac(centerLat, centerLng, zoom)
  const fracX = xFrac - tileX
  const fracY = yFrac - tileY
  const scale = Math.max(w / TILE_PX, h / TILE_PX)
  const imgW  = TILE_PX * scale
  const imgH  = TILE_PX * scale
  const offX  = w / 2 - fracX * imgW
  const offY  = h / 2 - fracY * imgH

  // Bounding box pixel coords
  const sw    = latLngToTileFrac(minLat, minLng, zoom)
  const ne    = latLngToTileFrac(maxLat, maxLng, zoom)
  const bxL   = offX + (sw.xFrac - tileX) * imgW
  const bxT   = offY + (ne.yFrac - tileY) * imgH
  const bxW   = (ne.xFrac - sw.xFrac) * imgW
  const bxH   = (sw.yFrac - ne.yFrac) * imgH

  const STATUS_COLOR: Record<string, string> = {
    pending: '#f59e0b', in_progress: '#8b5cf6', cleared: '#10b981',
  }

  return (
    <div
      ref={divRef}
      className="relative w-full overflow-hidden rounded-xl"
      style={{ height: MAP_H, background: '#1a1a2e' }}
    >
      {/* Satellite tiles — 3x3 grid to cover the card without gaps */}
      {[-1, 0, 1].flatMap(dx =>
        [-1, 0, 1].map(dy => (
          <img
            key={`${dx}-${dy}`}
            src={`https://mt1.google.com/vt/lyrs=s&x=${tileX + dx}&y=${tileY + dy}&z=${zoom}`}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left:   offX + dx * imgW,
              top:    offY + dy * imgH,
              width:  imgW,
              height: imgH,
              userSelect: 'none',
            }}
          />
        ))
      )}

      {/* Orange bounding box (only when multiple poles have spread) */}
      {poles.length > 1 && bxW > 2 && bxH > 2 && (
        <div
          style={{
            position: 'absolute',
            left:   bxL, top: bxT,
            width:  bxW, height: bxH,
            border: '2.5px solid #f59e0b',
            borderRadius: 3,
            background: 'rgba(245,158,11,0.13)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Pole dots */}
      {poles.map((p, i) => {
        const { xFrac: px, yFrac: py } = latLngToTileFrac(p.lat, p.lng, zoom)
        const color = STATUS_COLOR[p.status] ?? '#94a3b8'
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: offX + (px - tileX) * imgW - 3.5,
              top:  offY + (py - tileY) * imgH - 3.5,
              width: 7, height: 7, borderRadius: '50%',
              background: '#ffffff',
              border: `1.5px solid ${color}`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )
      })}

      {/* Area name label */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.5)',
        padding: '4px 10px',
        zIndex: 2,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{siteName}</span>
      </div>
    </div>
  )
}


function Modal({
  title,
  sub,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  title: string
  sub?: string
  onClose: () => void
  children: ReactNode
  maxWidth?: string
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-slate-900`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-slate-100 bg-slate-900 px-6 py-5 dark:border-slate-800" style={{ backgroundColor: '#0f172a' }}>
          <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-blue-400/20 blur-2xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {sub && <p className="mt-1 text-xs text-blue-100/75">{sub}</p>}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-lg font-bold text-white/75 transition hover:bg-white/20 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

const labelCls =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'

export default function Sitelist() {
  const navigate = useNavigate()
  const admin = isAdmin()

  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchErr, setFetchErr] = useState('')
  const [polesByArea, setPolesByArea] = useState<Map<string, PolePin[]>>(new Map())

  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)

  const [selected, setSelected] = useState<Site | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  async function loadSites(options?: { silent?: boolean }) {
    if (!options?.silent) {
      const hit = cacheGet<Site[]>(CACHE_KEY)
      if (hit) { setSites(hit); setLoading(false) }
      else setLoading(true)
    }

    setFetchErr('')

    try {
      const response = await fetch(`${SKYCABLE_API}/areas`, {
        headers: authHeaders(),
      })

      const data = await readJsonSafe<ApiListResponse>(response)

      if (!response.ok) {
        throw new Error(apiMessage(data, `Failed to load sites. Error ${response.status}`))
      }

      const list = Array.isArray(data) ? data : data?.data ?? []
      const sorted = [...list].sort((a, b) => areaSortIndex(a.name) - areaSortIndex(b.name))

      setSites(sorted)
      if (!options?.silent) cacheSet(CACHE_KEY, sorted)
    } catch (error) {
      setFetchErr(error instanceof Error ? error.message : 'Failed to load sites')
      setSites([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSites()
  }, [])

  // Fetch all skycable poles with GPS and group by area name
  useEffect(() => {
    fetch(`${SKYCABLE_API}/poles/map`, {
      headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' },
    })
      .then(r => r.json())
      .then((rows: any[]) => {
        const map = new Map<string, PolePin[]>()
        ;(Array.isArray(rows) ? rows : []).forEach((p: any) => {
          if (!p.lat || !p.lng || !p.area) return
          const key = (p.area as string).toLowerCase().trim()
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push({ lat: Number(p.lat), lng: Number(p.lng), status: p.skycable_status ?? 'pending', area: key })
        })
        setPolesByArea(map)
      })
      .catch(() => {})
  }, [])

  const totals = useMemo(() => {
    return {
      sites: sites.length,
      nodes: sites.reduce((sum, site) => sum + (site.nodes_count ?? 0), 0),
      pending: sites.reduce((sum, site) => sum + (site.pending_count ?? 0), 0),
      ongoing: sites.reduce((sum, site) => sum + (site.in_progress_count ?? 0), 0),
      completed: sites.reduce((sum, site) => sum + (site.completed_count ?? 0), 0),
    }
  }, [sites])

  const summaryCards = [
    {
      label: 'Total Sites',
      value: totals.sites,
      note: 'Registered coverage areas',
      tone: 'from-blue-600 to-sky-500',
      soft: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
      paths: [
        'M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z',
        'M15 11a3 3 0 11-6 0 3 3 0 016 0',
      ],
    },
    {
      label: 'Total Nodes',
      value: totals.nodes,
      note: 'Across all areas',
      tone: 'from-cyan-500 to-blue-500',
      soft: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300',
      paths: ['M4 7h16M4 12h16M4 17h16'],
    },
    {
      label: 'Pending',
      value: totals.pending,
      note: 'Awaiting action',
      tone: 'from-amber-400 to-orange-500',
      soft: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      paths: [
        'M12 8v4l3 3',
        'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      ],
    },
    {
      label: 'Ongoing',
      value: totals.ongoing,
      note: 'Currently in progress',
      tone: 'from-indigo-500 to-violet-500',
      soft: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300',
      paths: [
        'M4 4v6h6',
        'M20 20v-6h-6',
        'M5 19A9 9 0 0119 5',
        'M19 5h-5',
        'M5 19h5',
      ],
    },
    {
      label: 'Completed',
      value: totals.completed,
      note: 'Finished nodes',
      tone: 'from-emerald-500 to-teal-500',
      soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      paths: [
        'M9 12l2 2 4-4',
        'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      ],
    },
  ]

  function openAdd() {
    setSelected(null)
    setName('')
    setFormErr('')
    setAddOpen(true)
  }

  function closeForm() {
    setAddOpen(false)
    setEditOpen(false)
    setDelOpen(false)
    setSelected(null)
    setName('')
    setFormErr('')
  }

  async function handleAdd(event: SyntheticEvent) {
    event.preventDefault()

    const cleanName = name.trim()

    if (!cleanName) {
      setFormErr('Site name is required.')
      return
    }

    setSaving(true)
    setFormErr('')

    try {
      const response = await fetch(`${SKYCABLE_API}/areas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: cleanName }),
      })

      const data = await readJsonSafe<ApiSingleResponse>(response)

      if (!response.ok) {
        throw new Error(apiMessage(data, 'Failed to add site'))
      }

      setAddOpen(false)
      setName('')
      await loadSites({ silent: true })
    } catch (error) {
      setFormErr(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(site: Site, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()

    setSelected(site)
    setName(site.name)
    setFormErr('')
    setEditOpen(true)
  }

  async function handleEdit(event: SyntheticEvent) {
    event.preventDefault()

    if (!selected) return

    const cleanName = name.trim()

    if (!cleanName) {
      setFormErr('Site name is required.')
      return
    }

    setSaving(true)
    setFormErr('')

    try {
      const response = await fetch(`${SKYCABLE_API}/areas/${selected.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name: cleanName }),
      })

      const data = await readJsonSafe<ApiSingleResponse>(response)

      if (!response.ok) {
        throw new Error(apiMessage(data, 'Failed to update site'))
      }

      setEditOpen(false)
      setSelected(null)
      setName('')
      await loadSites({ silent: true })
    } catch (error) {
      setFormErr(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function openDelete(site: Site, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()

    if (!admin) return

    setSelected(site)
    setFormErr('')
    setDelOpen(true)
  }

  async function handleDelete() {
    if (!selected || !admin) return

    setSaving(true)
    setFormErr('')

    try {
      const response = await fetch(`${SKYCABLE_API}/areas/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })

      const data = await readJsonSafe<{ message?: string }>(response)

      if (!response.ok) {
        throw new Error(apiMessage(data, 'Failed to delete site'))
      }

      setSites((prev) => prev.filter((site) => site.id !== selected.id))
      closeForm()
    } catch (error) {
      setFormErr(error instanceof Error ? error.message : 'Failed to delete site')
    } finally {
      setSaving(false)
    }
  }

  function renderNameForm({
    onSubmit,
    buttonLabel,
  }: {
    onSubmit: (event: SyntheticEvent) => void
    buttonLabel: string
  }) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-5 p-6">
        {formErr && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {formErr}
          </div>
        )}

        <div>
          <label className={labelCls}>Site Name</label>
          <input
            required
            autoFocus
            className={inputCls}
            placeholder="e.g. North Luzon"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="mt-2 text-xs text-slate-400">
            Recommended: North Luzon, South Luzon, NCR, Visayas, Mindanao.
          </p>
        </div>

        <div className="flex gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={closeForm}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold shadow-lg transition active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: '#059669', color: '#ffffff' }}
          >
            {saving ? 'Saving…' : buttonLabel}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-blue-50 via-sky-50/60 to-transparent dark:from-blue-950/25 dark:via-sky-950/10" />
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              SkyCable Areas
            </div>

            <h4 className="text-xl font-semibold text-slate-950 dark:text-slate-100">
              Site List
            </h4>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Regional coverage dashboard for areas, nodes, and work progress.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => loadSites()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0119 5" />
              </svg>
              Refresh
            </button>

            {admin && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg transition active:scale-[0.98]"
                style={{ backgroundColor: '#059669', color: '#ffffff' }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Site
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className="group relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.tone}`} />
            <div className={`pointer-events-none absolute -right-7 -top-7 h-20 w-20 rounded-full bg-gradient-to-br ${card.tone} opacity-10 blur-xl`} />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {card.label}
                </p>

                <h3 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                  {loading ? '—' : card.value}
                </h3>

                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {card.note}
                </p>
              </div>

              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.soft}`}>
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  {card.paths.map((path) => (
                    <path
                      key={path}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={path}
                    />
                  ))}
                </svg>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Regional Cards */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
              Regional Coverage
            </h2>

            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Click a site card to view its nodes and area details.
            </p>
          </div>

          {!loading && (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {sites.length} {sites.length === 1 ? 'Site' : 'Sites'}
            </span>
          )}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[315px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : fetchErr ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-14 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8 14A1 1 0 003.16 19h17.68a1 1 0 00.87-1.5l-8-14a1 1 0 00-1.74 0z" />
                </svg>
              </div>

              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                {fetchErr}
              </p>

              <button
                onClick={() => loadSites()}
                className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Try Again
              </button>
            </div>
          ) : sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-950/30">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <svg
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>

              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                No sites yet
              </h3>

              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                Create your first SkyCable area. Start with North Luzon, South Luzon, NCR, Visayas, or Mindanao.
              </p>

              <button
                onClick={openAdd}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Site
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-4">
              {sites.map((site) => (
                <article
                  key={site.id}
                  onClick={() => navigate(`/sites/${site.id}/nodes`)}
                  className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-950/30 dark:hover:border-blue-500"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-sky-400 opacity-0 transition group-hover:opacity-100" />

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">
                        {areaDisplayName(site.name)}
                      </h3>

                      <p className="mt-1 text-xs text-slate-400">
                        {site.nodes_count ?? 0} node{(site.nodes_count ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      View
                      <svg
                        className="h-3 w-3 transition group-hover:translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>

                  <div className="mt-3">
                    <SiteCardMap poles={polesByArea.get(site.name.toLowerCase().trim()) ?? []} siteName={areaDisplayName(site.name)} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-1.5 py-2 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
                      <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Pending
                      </p>
                      <p className="mt-1 text-base font-bold text-amber-600 dark:text-amber-400">
                        {site.pending_count ?? 0}
                      </p>
                    </div>

                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-1.5 py-2 text-center dark:border-indigo-900/40 dark:bg-indigo-950/20">
                      <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Ongoing
                      </p>
                      <p className="mt-1 text-base font-bold text-indigo-600 dark:text-indigo-400">
                        {site.in_progress_count ?? 0}
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-1.5 py-2 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                      <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Done
                      </p>
                      <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {site.completed_count ?? 0}
                      </p>
                    </div>
                  </div>

                  {admin && (
                    <div className="mt-3 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <button
                        onClick={(event) => openEdit(site, event)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={(event) => openDelete(site, event)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Add modal */}
      {addOpen && (
        <Modal
          title="Add New Site"
          sub="Create a new SkyCable area."
          onClose={closeForm}
        >
          {renderNameForm({
            onSubmit: handleAdd,
            buttonLabel: 'Add Site',
          })}
        </Modal>
      )}

      {/* Edit modal */}
      {editOpen && selected && (
        <Modal
          title="Edit Site"
          sub={`Editing ${areaDisplayName(selected.name)}`}
          onClose={closeForm}
        >
          {renderNameForm({
            onSubmit: handleEdit,
            buttonLabel: 'Save Changes',
          })}
        </Modal>
      )}

      {/* Delete modal - admin only */}
      {admin && delOpen && selected && (
        <Modal
          title="Delete Site"
          sub="Admin action required."
          onClose={closeForm}
          maxWidth="max-w-sm"
        >
          <div className="p-6">
            {formErr && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                {formErr}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Selected Site
              </p>

              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                {areaDisplayName(selected.name)}
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selected.nodes_count ?? 0} node{(selected.nodes_count ?? 0) !== 1 ? 's' : ''} assigned
              </p>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
              This will remove the site from the area list. This action cannot be undone.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                onClick={closeForm}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? 'Deleting…' : 'Delete Site'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}