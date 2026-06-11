import { useEffect, useMemo, useState } from 'react'
import { API_BASE, getToken } from '../../lib/auth'
import telcoImg from '../../assets/images/telco.png'

const SKYCABLE_API = `${API_BASE}/api/v1/skycable`

const H = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
})

const RETAIN_DAYS = 30

type TrashedItem = {
  id: number
  name: string
  full_label?: string | null
  deleted_at: string
  deleted_by?: unknown
  deleted_by_name?: string | null
  deleted_by_user?: { name?: string | null; full_name?: string | null; email?: string | null } | null
  status?: string | null
  subcontractor?: { id: number; name: string } | null
  team?: { id: number; name: string } | null
  area?: { id: number; name: string } | null
  itemType: 'node' | 'site'
}

function parseDeletedAt(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time > 0 ? time : null
}

function daysAgo(value: string | null | undefined): number | null {
  const time = parseDeletedAt(value)
  if (time === null) return null
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000))
}

function daysLeft(value: string | null | undefined): number | null {
  const ago = daysAgo(value)
  if (ago === null) return null
  return Math.max(0, RETAIN_DAYS - ago)
}

function formatDeletedDate(value: string | null | undefined) {
  const time = parseDeletedAt(value)
  if (time === null) return 'Unknown'
  return new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDeletedDateTime(value: string | null | undefined) {
  const time = parseDeletedAt(value)
  if (time === null) return 'Unknown'
  return new Date(time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function urgencyTone(left: number | null) {
  if (left === null) {
    return {
      label: 'Unknown',
      soft: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
      dot: 'bg-slate-400',
      border: 'border-slate-200/80 dark:border-slate-800',
    }
  }
  if (left <= 3) {
    return {
      label: left === 0 ? 'Expires Today' : 'Critical',
      soft: 'bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
      dot: 'bg-rose-500',
      border: 'border-rose-200/80 dark:border-rose-900/50',
    }
  }
  if (left <= 7) {
    return {
      label: 'Expiring Soon',
      soft: 'bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
      dot: 'bg-amber-500',
      border: 'border-amber-200/80 dark:border-amber-900/50',
    }
  }
  return {
    label: `${left}d left`,
    soft: 'bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50',
    dot: 'bg-emerald-500',
    border: 'border-slate-200/80 dark:border-slate-800',
  }
}

function itemTone(itemType: TrashedItem['itemType']) {
  return itemType === 'node'
    ? {
        badge: 'bg-indigo-50 text-indigo-600 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/50',
        iconWrap: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300',
        icon: 'bx-broadcast',
        accent: 'from-indigo-500 to-sky-500',
      }
    : {
        badge: 'bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
        iconWrap: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
        icon: 'bx-map',
        accent: 'from-amber-500 to-orange-500',
      }
}

function deletedByLabel(item: TrashedItem) {
  if (typeof item.deleted_by_name === 'string' && item.deleted_by_name.trim()) return item.deleted_by_name
  if (item.deleted_by_user?.full_name?.trim()) return item.deleted_by_user.full_name
  if (item.deleted_by_user?.name?.trim()) return item.deleted_by_user.name
  if (item.deleted_by_user?.email?.trim()) return item.deleted_by_user.email
  if (typeof item.deleted_by === 'string' && item.deleted_by.trim()) return item.deleted_by
  if (typeof item.deleted_by === 'object' && item.deleted_by) {
    const candidate = item.deleted_by as Record<string, unknown>
    const fields = [candidate.full_name, candidate.name, candidate.email, candidate.username]
    const found = fields.find((value) => typeof value === 'string' && value.trim())
    if (typeof found === 'string') return found
  }
  return 'System Archive'
}

function isArchivedItem(item: Pick<TrashedItem, 'deleted_at'>) {
  return parseDeletedAt(item.deleted_at) !== null
}

function ConfirmModal({
  title,
  subtitle,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  loading,
}: {
  title: string
  subtitle: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <i className="bx bx-revision text-xl" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black">{title}</h3>
              <p className="mt-0.5 truncate text-xs font-medium text-white/75">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{body}</p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Restoring…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemCard({
  item,
  onRestore,
}: {
  item: TrashedItem
  onRestore: () => void
}) {
  const displayName = item.full_label ?? item.name
  const ago = daysAgo(item.deleted_at)
  const left = daysLeft(item.deleted_at)
  const deletedDate = formatDeletedDate(item.deleted_at)
  const deletedAtDateTime = formatDeletedDateTime(item.deleted_at)
  const deletedBy = deletedByLabel(item)
  const itemStyle = itemTone(item.itemType)
  const urgency = urgencyTone(left)
  const stateLabel = item.status
    ? item.status.replace(/_/g, ' ').toUpperCase()
    : item.itemType === 'node'
      ? 'NODE'
      : 'SITE'
  const archivedCopy = ago === null
    ? 'Archived date unavailable'
    : ago === 0
      ? 'Archived today'
      : `Archived ${ago} day${ago === 1 ? '' : 's'} ago`

  return (
    <article
      className={`group relative overflow-hidden rounded-[1.5rem] border bg-white p-2.5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 sm:rounded-[1.75rem] sm:p-3 ${urgency.border}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${itemStyle.accent}`} />

      <div className="flex items-start justify-between gap-2 px-1 pb-2.5 sm:gap-3 sm:pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black tracking-tight text-slate-900 dark:text-white sm:text-[1.05rem]">
            {displayName}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            {item.itemType === 'node' ? '1 archived node' : '1 archived site'}
          </p>
        </div>

        <button
          onClick={onRestore}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[11px]"
        >
          RESTORE
          <i className="bx bx-revision text-sm" />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[1rem] border border-slate-100 bg-slate-950 dark:border-slate-800 sm:rounded-[1.2rem]">
        <img src={telcoImg} alt="TelcoVantage" className="h-24 w-full object-cover opacity-35 sm:h-32" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-slate-900/10" />
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${itemStyle.accent}`} />
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 sm:left-4 sm:top-4">
          <span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-widest ring-1 sm:text-[9px] ${itemStyle.badge}`}>
            {item.itemType}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-slate-950/65 px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3">
          <p className="truncate text-xs font-black text-white sm:text-sm">{displayName}</p>
        </div>
      </div>

      <div className="mt-3 rounded-[1rem] border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/30 sm:rounded-2xl sm:px-3.5 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Archive Status</p>
            <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200 sm:text-sm">{archivedCopy}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ring-1 sm:px-2.5 sm:text-[10px] ${urgency.soft}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
            {urgency.label}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-[1rem] border border-amber-200/80 bg-amber-50/60 px-2 py-2.5 text-center dark:border-amber-900/40 dark:bg-amber-950/20 sm:rounded-2xl sm:px-3 sm:py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Deleted</p>
          <p className="mt-1.5 text-base font-black text-amber-600 dark:text-amber-300 sm:mt-2 sm:text-lg">{ago ?? '—'}</p>
        </div>
        <div className="rounded-[1rem] border border-indigo-200/80 bg-indigo-50/60 px-2 py-2.5 text-center dark:border-indigo-900/40 dark:bg-indigo-950/20 sm:rounded-2xl sm:px-3 sm:py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Retention</p>
          <p className="mt-1.5 text-base font-black text-indigo-600 dark:text-indigo-300 sm:mt-2 sm:text-lg">{left ?? '—'}</p>
        </div>
        <div className="rounded-[1rem] border border-emerald-200/80 bg-emerald-50/60 px-2 py-2.5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20 sm:rounded-2xl sm:px-3 sm:py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">State</p>
          <p className="mt-1.5 text-[11px] font-black text-emerald-600 dark:text-emerald-300 sm:mt-2 sm:text-sm">{stateLabel}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
        <div className="rounded-[1rem] border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-900 sm:rounded-2xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Area / Scope</p>
          <p className="mt-1 truncate font-bold text-slate-700 dark:text-slate-200">
            {item.area?.name ?? (item.itemType === 'site' ? 'Archived parent site' : 'Unassigned')}
          </p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-[1rem] border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-900 sm:rounded-2xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deleted By</p>
          <p className="mt-1 truncate font-bold text-slate-700 dark:text-slate-200">{deletedBy}</p>
        </div>
        <div className="rounded-[1rem] border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-900 sm:rounded-2xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deleted On</p>
          <p className="mt-1 truncate font-bold text-slate-700 dark:text-slate-200">{deletedAtDateTime}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={onRestore}
          className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-950/40 sm:rounded-2xl"
        >
          <i className="bx bx-revision text-base" />
          Restore
        </button>
        <div className="inline-flex items-center justify-center rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 sm:rounded-2xl">
          {deletedDate}
        </div>
      </div>
    </article>
  )
}

export default function RecycleBin() {
  const [items, setItems] = useState<TrashedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'all' | 'node' | 'site'>('all')
  const [search, setSearch] = useState('')
  const [actionItem, setActionItem] = useState<TrashedItem | null>(null)
  const [actionType, setActionType] = useState<'restore' | null>(null)
  const [acting, setActing] = useState(false)
  const [lastSynced, setLastSynced] = useState<number | null>(null)
  const [syncText, setSyncText] = useState('Never')

  useEffect(() => {
    function tick() {
      if (!lastSynced) {
        setSyncText('Never')
        return
      }
      const s = Math.floor((Date.now() - lastSynced) / 1000)
      setSyncText(s < 60 ? 'Just now' : `${Math.floor(s / 60)}m ago`)
    }

    tick()
    const t = setInterval(tick, 15000)
    return () => clearInterval(t)
  }, [lastSynced])

  async function fetchTrashed<T>(url: string, fallback: string): Promise<T[]> {
    let res = await fetch(url, { headers: H() })
    if (!res.ok) res = await fetch(fallback, { headers: H() })
    if (!res.ok) return []
    const d = await res.json().catch(() => null)
    return Array.isArray(d) ? d : (d?.data ?? [])
  }

  async function load() {
    setLoading(true)
    setError('')

    try {
      const [rawNodes, rawSites] = await Promise.all([
        fetchTrashed<any>(
          `${SKYCABLE_API}/nodes/trashed`,
          `${SKYCABLE_API}/nodes?trashed=1&per_page=500`,
        ),
        fetchTrashed<any>(
          `${SKYCABLE_API}/areas/trashed`,
          `${SKYCABLE_API}/areas?trashed=1&per_page=500`,
        ),
      ])

      const nodes: TrashedItem[] = rawNodes
        .map((n: any) => ({ ...n, itemType: 'node' as const }))
        .filter(isArchivedItem)

      const sites: TrashedItem[] = rawSites
        .map((s: any) => ({ ...s, itemType: 'site' as const }))
        .filter(isArchivedItem)

      setItems(
        [...nodes, ...sites].sort(
          (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
        ),
      )
      setLastSynced(Date.now())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load recycle bin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = tab === 'all' ? items : items.filter((i) => i.itemType === tab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.full_label ?? '').toLowerCase().includes(q) ||
        (i.subcontractor?.name ?? '').toLowerCase().includes(q) ||
        (i.area?.name ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [items, search, tab])

  async function callRestore(item: TrashedItem) {
    const ep = item.itemType === 'node' ? 'nodes' : 'areas'
    let res = await fetch(`${SKYCABLE_API}/${ep}/${item.id}/restore`, { method: 'POST', headers: H() })
    if (!res.ok) res = await fetch(`${SKYCABLE_API}/${ep}/${item.id}/recover`, { method: 'POST', headers: H() })
    if (!res.ok) throw new Error(`Restore failed (HTTP ${res.status})`)
  }

  async function confirmSingle() {
    if (!actionItem || !actionType) return
    setActing(true)
    try {
      await callRestore(actionItem)
      setActionItem(null)
      setActionType(null)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const stats = useMemo(() => {
    const nodes = items.filter((i) => i.itemType === 'node').length
    const sites = items.filter((i) => i.itemType === 'site').length
    const expiring = items.filter((i) => daysLeft(i.deleted_at) <= 7).length
    return { total: items.length, nodes, sites, expiring }
  }, [items])

  const summaryCards = [
    {
      label: 'Archived Items',
      value: stats.total,
      note: 'Combined sites and node records',
      tone: 'from-rose-500 to-red-500',
      soft: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
      icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    },
    {
      label: 'Node Records',
      value: stats.nodes,
      note: 'Recoverable child registry units',
      tone: 'from-indigo-500 to-sky-500',
      soft: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300',
      icon: 'M4 7h16M4 12h16M4 17h10M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z',
    },
    {
      label: 'Site Records',
      value: stats.sites,
      note: 'Parent areas pending restore',
      tone: 'from-amber-500 to-orange-500',
      soft: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      icon: 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5V13H9v8H4a1 1 0 01-1-1V10z',
    },
    {
      label: 'Expiring Soon',
      value: stats.expiring,
      note: `Items within ${Math.min(7, RETAIN_DAYS)} days of retention window`,
      tone: 'from-emerald-500 to-teal-500',
      soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  ] as const

  return (
    <div className="flex w-full flex-col gap-4 px-3 pb-10 sm:gap-6 sm:px-6 sm:pb-12">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/60 to-emerald-50/30 p-5 shadow-sm transition-all dark:border-slate-800 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900/90 dark:to-emerald-950/20 sm:rounded-3xl sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/15 sm:h-64 sm:w-64" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl dark:bg-rose-500/10 sm:h-64 sm:w-64" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6">
          <div>
            <nav className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500">
              <span>System</span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="text-emerald-600 dark:text-emerald-400">Recycle Bin</span>
            </nav>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Recovery Workspace
              </h1>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:border-emerald-400/20 dark:text-emerald-400">
                Restore Only
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-xs font-medium text-slate-600 dark:text-slate-400 sm:text-sm">
              Review archived sites and nodes using the same operational dashboard style as the rest of the system, then restore records without triggering permanent deletion.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-2xs backdrop-blur-xs dark:border-slate-700/80 dark:bg-slate-800/80">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Retention Window</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{RETAIN_DAYS} Days</p>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm font-bold text-slate-700 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              <i className={`bx bx-refresh text-base ${loading ? 'animate-spin' : ''}`} />
              Synced {syncText}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
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
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.soft} transition-transform duration-300 group-hover:scale-110`}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>
            </div>
          </article>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 dark:border-rose-900/60 dark:bg-rose-950/30">
          <i className="bx bx-error-circle text-lg text-rose-500" />
          <span className="flex-1 text-sm font-bold text-rose-700 dark:text-rose-300">{error}</span>
          <button onClick={() => setError('')} className="text-xs font-black text-rose-500 hover:text-rose-700">
            Close
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/50 sm:rounded-3xl">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Archived Registry</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              Review archived parent and child records before restoring them back into the live operational tree.
            </p>
          </div>

          {!loading && (
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-300">
                Showing {filtered.length} of {items.length} archived
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-4 dark:border-slate-800/80 dark:bg-slate-950/20 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <div className="relative w-full min-w-0 flex-1 sm:max-w-md">
            <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by node, site, subcontractor, or area…"
              className="h-10 w-full rounded-xl border border-slate-200/80 bg-white pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 shadow-2xs outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700/80 dark:bg-slate-900 dark:text-white dark:focus:border-emerald-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                Clear
              </button>
            )}
          </div>

          <div className="flex w-full flex-wrap gap-1.5 rounded-xl bg-slate-200/50 p-1 dark:bg-slate-800/50 sm:w-auto">
            {([
              { v: 'all', label: 'All Records', count: stats.total },
              { v: 'node', label: 'Nodes', count: stats.nodes },
              { v: 'site', label: 'Sites', count: stats.sites },
            ] as const).map((item) => {
              const active = tab === item.v
              return (
                <button
                  key={item.v}
                  onClick={() => setTab(item.v)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 sm:flex-none sm:px-3.5 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label} <span className="ml-1 text-[10px] opacity-70">{item.count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-3xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-20 text-center dark:border-slate-800 dark:bg-slate-950/20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {search ? 'No archived records match your search' : 'Recycle bin is currently empty'}
              </h3>
              <p className="mt-1 max-w-sm text-sm font-medium text-slate-500 dark:text-slate-400">
                {search
                  ? 'Try another keyword or switch to a different archive filter.'
                  : 'Deleted sites and nodes that remain recoverable will appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 sm:gap-4">
              {filtered.map((item) => (
                <ItemCard
                  key={`${item.itemType}-${item.id}`}
                  item={item}
                  onRestore={() => {
                    setActionItem(item)
                    setActionType('restore')
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/20 px-6 py-4 dark:border-slate-800/80 dark:bg-slate-950/10">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Archived records remain visible for operational review. Backend retention may still purge records after <span className="font-black text-slate-700 dark:text-slate-200">{RETAIN_DAYS} days</span>, but this interface only supports restore workflows.
            </p>
          </div>
        )}
      </section>

      {actionItem && actionType && (
        <ConfirmModal
          title="Restore Archived Record?"
          subtitle={actionItem.full_label ?? actionItem.name}
          body={`"${actionItem.full_label ?? actionItem.name}" will be restored back into the active registry with its recoverable hierarchy.`}
          confirmLabel="Restore Record"
          loading={acting}
          onConfirm={confirmSingle}
          onClose={() => {
            setActionItem(null)
            setActionType(null)
          }}
        />
      )}
    </div>
  )
}
