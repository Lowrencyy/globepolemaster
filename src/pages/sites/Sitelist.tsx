import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { SKYCABLE_API, getToken, isAdmin } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

const CACHE_KEY = 'sitelist'
import { slugify } from '../../lib/utils'

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

const REGION_MARKERS: Record<string, [number, number]> = {
  'north luzon': [76, 45],
  ncr: [81, 88],
  'metro manila': [81, 88],
  'south luzon': [103, 111],
  visayas: [110, 158],
  mindanao: [111, 214],
}

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

function PhilippinesMap({ siteName }: { siteName: string }) {
  const key = normalizeAreaName(siteName)
  const marker = REGION_MARKERS[key] ?? null

  const isActive = (area: string) => {
    if (area === 'ncr') return key === 'ncr' || key === 'metro manila'
    return key === area
  }

  const fillFor = (area: string) => (isActive(area) ? '#2563eb' : '#dbe5f3')
  const strokeFor = (area: string) => (isActive(area) ? '#1d4ed8' : '#b7c5d8')
  const strokeWidthFor = (area: string) => (isActive(area) ? '1.35' : '0.75')

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_top,#f8fbff_0%,#edf5ff_48%,#eaf1fb_100%)] dark:border-slate-700 dark:bg-[radial-gradient(circle_at_top,#17233b_0%,#111827_55%,#0f172a_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),transparent_45%,rgba(14,165,233,0.08))]" />

      <svg
        viewBox="0 0 160 250"
        className="relative h-32 w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M28 0V250" stroke="#dbeafe" strokeWidth="0.6" opacity="0.65" />
        <path d="M80 0V250" stroke="#dbeafe" strokeWidth="0.6" opacity="0.65" />
        <path d="M132 0V250" stroke="#dbeafe" strokeWidth="0.6" opacity="0.65" />
        <path d="M0 54H160" stroke="#dbeafe" strokeWidth="0.6" opacity="0.65" />
        <path d="M0 125H160" stroke="#dbeafe" strokeWidth="0.6" opacity="0.65" />
        <path d="M0 196H160" stroke="#dbeafe" strokeWidth="0.6" opacity="0.65" />

        {/* North Luzon */}
        <path
          d="M79 9C90 5 106 10 112 21L117 36C120 50 115 64 107 72H74L68 44C67 28 71 14 79 9Z"
          fill={fillFor('north luzon')}
          stroke={strokeFor('north luzon')}
          strokeWidth={strokeWidthFor('north luzon')}
        />

        {/* NCR */}
        <path
          d="M74 72H107C103 78 105 86 102 95L97 105C93 113 86 116 80 112L74 104C70 96 72 86 74 78Z"
          fill={fillFor('ncr')}
          stroke={strokeFor('ncr')}
          strokeWidth={strokeWidthFor('ncr')}
        />

        {/* South Luzon */}
        <path
          d="M102 95C105 99 109 106 111 114L109 124C106 131 101 133 97 127L95 115L97 105Z"
          fill={fillFor('south luzon')}
          stroke={strokeFor('south luzon')}
          strokeWidth={strokeWidthFor('south luzon')}
        />

        {/* Palawan */}
        <path
          d="M65 107C59 119 52 133 45 147C38 161 33 175 30 188C29 192 32 195 35 193C40 181 45 168 52 155C59 141 66 127 72 113Z"
          fill="#dbe5f3"
          stroke="#b7c5d8"
          strokeWidth="0.75"
        />

        {/* Visayas */}
        <ellipse
          cx="76"
          cy="148"
          rx="13"
          ry="9"
          fill={fillFor('visayas')}
          stroke={strokeFor('visayas')}
          strokeWidth={strokeWidthFor('visayas')}
        />
        <ellipse
          cx="91"
          cy="158"
          rx="7"
          ry="14"
          fill={fillFor('visayas')}
          stroke={strokeFor('visayas')}
          strokeWidth={strokeWidthFor('visayas')}
        />
        <ellipse
          cx="105"
          cy="154"
          rx="5"
          ry="13"
          fill={fillFor('visayas')}
          stroke={strokeFor('visayas')}
          strokeWidth={strokeWidthFor('visayas')}
        />
        <ellipse
          cx="120"
          cy="146"
          rx="10"
          ry="11"
          fill={fillFor('visayas')}
          stroke={strokeFor('visayas')}
          strokeWidth={strokeWidthFor('visayas')}
        />
        <ellipse
          cx="132"
          cy="138"
          rx="11"
          ry="8"
          fill={fillFor('visayas')}
          stroke={strokeFor('visayas')}
          strokeWidth={strokeWidthFor('visayas')}
        />
        <ellipse
          cx="106"
          cy="170"
          rx="9"
          ry="6"
          fill={fillFor('visayas')}
          stroke={strokeFor('visayas')}
          strokeWidth={strokeWidthFor('visayas')}
        />

        {/* Mindanao */}
        <path
          d="M78 188C96 180 121 178 141 184L156 193C162 205 159 222 150 232C141 242 128 246 114 245L96 242C78 237 66 224 63 210L62 197Z"
          fill={fillFor('mindanao')}
          stroke={strokeFor('mindanao')}
          strokeWidth={strokeWidthFor('mindanao')}
        />

        {marker ? (
          <>
            <circle cx={marker[0]} cy={marker[1]} r="18" fill="#2563eb" opacity="0.08" />
            <circle cx={marker[0]} cy={marker[1]} r="11" fill="#2563eb" opacity="0.18" />
            <circle cx={marker[0]} cy={marker[1]} r="5.5" fill="#2563eb" />
            <circle cx={marker[0]} cy={marker[1]} r="2" fill="white" />
          </>
        ) : (
          <>
            <circle cx="80" cy="125" r="18" fill="#2563eb" opacity="0.08" />
            <circle cx="80" cy="125" r="10" fill="#2563eb" opacity="0.18" />
            <circle cx="80" cy="125" r="5" fill="#2563eb" />
            <circle cx="80" cy="125" r="2" fill="white" />
          </>
        )}
      </svg>
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
        <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 px-6 py-5 dark:border-slate-800">
          <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-blue-400/20 blur-2xl" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {sub && <p className="mt-1 text-xs text-blue-100/75">{sub}</p>}
            </div>

            <button
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
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
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

            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.98]"
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
                  onClick={() => navigate(`/sites/${slugify(site.name)}-${site.id}`)}
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
                    <PhilippinesMap siteName={site.name} />
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

                  <div className="mt-3 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <button
                      onClick={(event) => openEdit(site, event)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>

                    <button
                      onClick={(event) => openDelete(site, event)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
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