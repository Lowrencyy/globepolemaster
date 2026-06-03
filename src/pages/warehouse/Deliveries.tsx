import { useEffect, useMemo, useState } from 'react'
import { API_BASE, getToken, isTelcoVantage, getSubcontractorId, getSubcontractorName } from '../../lib/auth'

const API = `${API_BASE}/api/v1/skycable`

// ── Types ─────────────────────────────────────────────────────────────────────

interface PullOutItem {
  id: number
  item_type: string
  quantity: number
  unit: string | null
}

interface Warehouse {
  id: number
  name: string
  type: string | null
}

interface DriverUser {
  id: number
  name: string
}

interface Delivery {
  id: number
  from_warehouse_id: number
  to_warehouse_id: number
  driver_id: number | null
  status: 'pending' | 'in_transit' | 'arrived' | 'accepted' | 'rejected'
  dispatched_at: string | null
  arrived_at: string | null
  accepted_at: string | null
  created_at: string
  fromWarehouse?: Warehouse | null
  toWarehouse?: Warehouse | null
  driver?: DriverUser | null
  dispatchedBy?: DriverUser | null
  acceptedBy?: DriverUser | null
  items?: PullOutItem[]
}

interface PullOutRequest {
  id: number
  warehouse_id: number
  to_warehouse_id: number | null
  status: string
  purpose: string | null
  notes: string | null
  created_at: string
  warehouse?: Warehouse | null
  toWarehouse?: Warehouse | null
  declaredBy?: DriverUser | null
  approvedBy?: DriverUser | null
  items?: PullOutItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDT(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000)
  const h = d.getUTCHours(), mi = String(d.getUTCMinutes()).padStart(2,'0')
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${h % 12 || 12}:${mi} ${h >= 12 ? 'PM' : 'AM'}`
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/json',
      'ngrok-skip-browser-warning': '1',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400'  },
  in_transit: { label: 'In Transit', cls: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500'   },
  arrived:    { label: 'Arrived',    cls: 'bg-violet-50 text-violet-700 border-violet-200',dot: 'bg-violet-500' },
  accepted:   { label: 'Accepted',   cls: 'bg-green-50 text-green-700 border-green-200',  dot: 'bg-green-500'  },
  rejected:   { label: 'Rejected',   cls: 'bg-red-50 text-red-700 border-red-200',        dot: 'bg-red-500'    },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

// ── Item chips ────────────────────────────────────────────────────────────────

const ITEM_COLOR: Record<string, string> = {
  cable: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  node: 'text-blue-700 bg-blue-50 border-blue-200',
  amplifier: 'text-violet-700 bg-violet-50 border-violet-200',
  extender: 'text-teal-700 bg-teal-50 border-teal-200',
  tsc: 'text-amber-700 bg-amber-50 border-amber-200',
  powersupply: 'text-red-700 bg-red-50 border-red-200',
}

function ItemChips({ items }: { items?: PullOutItem[] }) {
  if (!items?.length) return <span className="text-xs text-gray-400">No items</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${ITEM_COLOR[it.item_type] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
          {parseFloat(String(it.quantity))}{it.item_type === 'cable' ? 'm' : ''} {it.item_type}
        </span>
      ))}
    </div>
  )
}

// ── Delivery row ──────────────────────────────────────────────────────────────

function DeliveryRow({ d, isAdmin }: { d: Delivery; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr
        className="border-b border-gray-100 dark:border-zinc-700 hover:bg-gray-50/60 dark:hover:bg-zinc-700/30 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
          #{d.id}
        </td>
        {isAdmin && (
          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {d.fromWarehouse?.name ?? `WH #${d.from_warehouse_id}`}
          </td>
        )}
        <td className="px-4 py-3">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {d.fromWarehouse?.name ?? `WH #${d.from_warehouse_id}`}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            → {d.toWarehouse?.name ?? `WH #${d.to_warehouse_id}`}
          </div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={d.status} />
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <ItemChips items={d.items} />
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">
          {d.driver?.name ?? <span className="text-gray-300">Unassigned</span>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap hidden xl:table-cell">
          {fmtDT(d.created_at)}
        </td>
        <td className="px-4 py-3 text-center">
          <i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'} text-gray-400`}></i>
        </td>
      </tr>

      {open && (
        <tr className="bg-gray-50/80 dark:bg-zinc-800/60">
          <td colSpan={isAdmin ? 8 : 7} className="px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">From</p>
                <p className="text-gray-800 dark:text-gray-200">{d.fromWarehouse?.name ?? `WH #${d.from_warehouse_id}`}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">To</p>
                <p className="text-gray-800 dark:text-gray-200">{d.toWarehouse?.name ?? `WH #${d.to_warehouse_id}`}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Driver</p>
                <p className="text-gray-800 dark:text-gray-200">{d.driver?.name ?? '—'}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Dispatched by</p>
                <p className="text-gray-800 dark:text-gray-200">{d.dispatchedBy?.name ?? '—'}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Dispatched at</p>
                <p className="text-gray-800 dark:text-gray-200">{fmtDT(d.dispatched_at)}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Arrived at</p>
                <p className="text-gray-800 dark:text-gray-200">{fmtDT(d.arrived_at)}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Accepted at</p>
                <p className="text-gray-800 dark:text-gray-200">{fmtDT(d.accepted_at)}</p>
              </div>
              {d.acceptedBy && (
                <div>
                  <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Accepted by</p>
                  <p className="text-gray-800 dark:text-gray-200">{d.acceptedBy.name}</p>
                </div>
              )}
            </div>
            {(d.items?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                <ItemChips items={d.items} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Pull-out row ──────────────────────────────────────────────────────────────

const PO_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400'  },
  approved:   { label: 'Approved',   cls: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500'   },
  dispatched: { label: 'Dispatched', cls: 'bg-violet-50 text-violet-700 border-violet-200',dot: 'bg-violet-500' },
  rejected:   { label: 'Rejected',   cls: 'bg-red-50 text-red-700 border-red-200',        dot: 'bg-red-500'    },
  delivered:  { label: 'Delivered',  cls: 'bg-green-50 text-green-700 border-green-200',  dot: 'bg-green-500'  },
}

function PullOutRow({ r, isAdmin }: { r: PullOutRequest; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const m = PO_STATUS_META[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' }

  return (
    <>
      <tr
        className="border-b border-gray-100 dark:border-zinc-700 hover:bg-gray-50/60 dark:hover:bg-zinc-700/30 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
          #{r.id}
        </td>
        {isAdmin && (
          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {r.warehouse?.name ?? `WH #${r.warehouse_id}`}
          </td>
        )}
        <td className="px-4 py-3">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {r.warehouse?.name ?? `WH #${r.warehouse_id}`}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            → {r.toWarehouse?.name ?? 'Main Warehouse'}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
            {m.label}
          </span>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <ItemChips items={r.items} />
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">
          {r.declaredBy?.name ?? '—'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap hidden xl:table-cell">
          {fmtDT(r.created_at)}
        </td>
        <td className="px-4 py-3 text-center">
          <i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'} text-gray-400`}></i>
        </td>
      </tr>

      {open && (
        <tr className="bg-gray-50/80 dark:bg-zinc-800/60">
          <td colSpan={isAdmin ? 8 : 7} className="px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">From Warehouse</p>
                <p className="text-gray-800 dark:text-gray-200">{r.warehouse?.name ?? `WH #${r.warehouse_id}`}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">To Warehouse</p>
                <p className="text-gray-800 dark:text-gray-200">{r.toWarehouse?.name ?? 'Main Warehouse'}</p>
              </div>
              <div>
                <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Requested by</p>
                <p className="text-gray-800 dark:text-gray-200">{r.declaredBy?.name ?? '—'}</p>
              </div>
              {r.approvedBy && (
                <div>
                  <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Approved by</p>
                  <p className="text-gray-800 dark:text-gray-200">{r.approvedBy.name}</p>
                </div>
              )}
              {r.notes && (
                <div className="col-span-2">
                  <p className="font-bold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-gray-800 dark:text-gray-200">{r.notes}</p>
                </div>
              )}
            </div>
            {(r.items?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                <ItemChips items={r.items} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, cls }: { label: string; value: number; icon: string; cls: string }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${cls}`}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/60 dark:bg-zinc-800/40">
        <i className={`bx ${icon} text-xl`}></i>
      </div>
      <div>
        <p className="text-2xl font-black">{value}</p>
        <p className="text-xs font-semibold opacity-70">{label}</p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Tab = 'deliveries' | 'pull-outs'
type StatusFilter = 'all' | 'pending' | 'in_transit' | 'arrived' | 'accepted'

export default function Deliveries() {
  const isAdmin = isTelcoVantage()
  const subconId = getSubcontractorId()
  const subconName = getSubcontractorName()

  const [tab,           setTab]           = useState<Tab>('deliveries')
  const [deliveries,    setDeliveries]    = useState<Delivery[]>([])
  const [pullOuts,      setPullOuts]      = useState<PullOutRequest[]>([])
  const [loading,       setLoading]       = useState(true)
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all')
  const [search,        setSearch]        = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      apiFetch<Delivery[]>('/deliveries'),
      apiFetch<PullOutRequest[]>('/pull-out-requests'),
    ]).then(([dr, pr]) => {
      if (dr.status === 'fulfilled') setDeliveries(Array.isArray(dr.value) ? dr.value : [])
      if (pr.status === 'fulfilled') setPullOuts(Array.isArray(pr.value) ? pr.value : [])
    }).finally(() => setLoading(false))
  }, [])

  // Stats
  const stats = useMemo(() => ({
    pending:    deliveries.filter(d => d.status === 'pending').length,
    in_transit: deliveries.filter(d => d.status === 'in_transit').length,
    arrived:    deliveries.filter(d => d.status === 'arrived').length,
    accepted:   deliveries.filter(d => d.status === 'accepted').length,
  }), [deliveries])

  // Filtered deliveries
  const filteredDeliveries = useMemo(() => {
    let list = deliveries
    if (statusFilter !== 'all') list = list.filter(d => d.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        d.fromWarehouse?.name?.toLowerCase().includes(q) ||
        d.toWarehouse?.name?.toLowerCase().includes(q) ||
        d.driver?.name?.toLowerCase().includes(q) ||
        String(d.id).includes(q)
      )
    }
    return list
  }, [deliveries, statusFilter, search])

  // Filtered pull-outs
  const filteredPullOuts = useMemo(() => {
    if (!search.trim()) return pullOuts
    const q = search.toLowerCase()
    return pullOuts.filter(r =>
      r.warehouse?.name?.toLowerCase().includes(q) ||
      r.declaredBy?.name?.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    )
  }, [pullOuts, search])

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-800 dark:text-gray-100">
            {isAdmin ? 'All Deliveries' : `${subconName} · Deliveries`}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin
              ? 'Warehouse-to-warehouse transfers across all subcontractors'
              : 'Your pull-out requests and incoming/outgoing deliveries'}
          </p>
        </div>
        {!isAdmin && subconId && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700">
            <i className="bx bx-building-house text-sm"></i>
            {subconName}
          </span>
        )}
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Pending"    value={stats.pending}    icon="bx-time-five"     cls="border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400" />
          <StatCard label="In Transit" value={stats.in_transit} icon="bx-truck"         cls="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" />
          <StatCard label="Arrived"    value={stats.arrived}    icon="bx-map-pin"       cls="border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400" />
          <StatCard label="Accepted"   value={stats.accepted}   icon="bx-check-circle"  cls="border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" />
        </div>
      )}

      {/* Tabs + filters */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-100 dark:border-zinc-700 shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 dark:border-zinc-700">
          {(['deliveries', 'pull-outs'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t === 'deliveries' ? `Deliveries (${deliveries.length})` : `Pull-Out Requests (${pullOuts.length})`}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50">
          {/* Search */}
          <div className="relative">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search warehouse, driver…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-500 w-52"
            />
          </div>

          {/* Status pills (deliveries tab only) */}
          {tab === 'deliveries' && (
            <div className="flex gap-1.5 flex-wrap">
              {(['all','pending','in_transit','arrived','accepted'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    statusFilter === s
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white dark:bg-zinc-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-600 hover:border-violet-300'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'in_transit' ? 'In Transit' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <i className="bx bx-loader-alt bx-spin text-2xl mr-2"></i>
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            {tab === 'deliveries' ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-zinc-700">
                    <th className="px-4 py-3">#</th>
                    {isAdmin && <th className="px-4 py-3">Subcon</th>}
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 hidden md:table-cell">Items</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Driver</th>
                    <th className="px-4 py-3 hidden xl:table-cell">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 8 : 7} className="py-16 text-center text-sm text-gray-400">
                      <i className="bx bx-package text-3xl block mb-2"></i>
                      No deliveries found
                    </td></tr>
                  ) : filteredDeliveries.map(d => (
                    <DeliveryRow key={d.id} d={d} isAdmin={isAdmin} />
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-zinc-700">
                    <th className="px-4 py-3">#</th>
                    {isAdmin && <th className="px-4 py-3">Subcon</th>}
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 hidden md:table-cell">Items</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Requested by</th>
                    <th className="px-4 py-3 hidden xl:table-cell">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPullOuts.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 8 : 7} className="py-16 text-center text-sm text-gray-400">
                      <i className="bx bx-transfer text-3xl block mb-2"></i>
                      No pull-out requests found
                    </td></tr>
                  ) : filteredPullOuts.map(r => (
                    <PullOutRow key={r.id} r={r} isAdmin={isAdmin} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
