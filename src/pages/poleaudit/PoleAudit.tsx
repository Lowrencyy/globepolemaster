import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

type PoleStatus = 'pending' | 'in_progress' | 'cleared'
type NodeStatus = 'pending' | 'in_progress' | 'completed'

interface Area { id: number; name: string }

interface NodeInfo {
  id: number
  name: string
  full_label?: string
  status: NodeStatus
  area?: Area
}

interface Pole {
  id: number
  pole_code: string
  lat?: string | null
  lng?: string | null
  skycable_status?: PoleStatus
}

interface PoleRecord {
  id: number
  sequence: number
  node_id?: number
  node?: NodeInfo
  pole?: Pole
}

const poleStatusCfg: Record<PoleStatus, { label: string; dot: string; badge: string }> = {
  pending:     { label: 'Pending',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400' },
  in_progress: { label: 'Ongoing',   dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400' },
  cleared:     { label: 'Cleared',   dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' },
}

const STATUSES: Array<'all' | PoleStatus> = ['all', 'pending', 'in_progress', 'cleared']

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' }
}

function exportCSV(rows: PoleRecord[]) {
  const header = ['Pole Code', 'Sequence', 'Node', 'Area', 'Status', 'Lat', 'Lng']
  const lines  = rows.map(r => [
    r.pole?.pole_code ?? '',
    r.sequence,
    r.node?.full_label ?? r.node?.name ?? '',
    r.node?.area?.name ?? '',
    r.pole?.skycable_status ?? 'pending',
    r.pole?.lat ?? '',
    r.pole?.lng ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = 'pole-audit.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function PoleAudit() {
  const [nodes, setNodes]   = useState<NodeInfo[]>(() => cacheGet<NodeInfo[]>('poleaudit_nodes') ?? [])
  const [areas, setAreas]   = useState<Area[]>(()   => cacheGet<Area[]>('poleaudit_areas') ?? [])
  const [poles, setPoles]   = useState<PoleRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [polesLoading, setPolesLoading] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<'all' | PoleStatus>('all')
  const [areaFilter, setAreaFilter]       = useState<number | 'all'>('all')
  const [nodeFilter, setNodeFilter]       = useState<number | 'all'>('all')
  const [page, setPage]                   = useState(1)
  const perPage = 50

  // Load areas + nodes for filter dropdowns
  useEffect(() => {
    fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) { setAreas(d); cacheSet('poleaudit_areas', d) } })
      .catch(() => {})

    const hit = cacheGet<NodeInfo[]>('poleaudit_nodes')
    if (hit) setNodes(hit)
    fetch(`${SKYCABLE_API}/nodes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : (d?.data ?? []); setNodes(list); cacheSet('poleaudit_nodes', list) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load poles for selected node, or all poles when no node filter
  useEffect(() => {
    if (nodeFilter === 'all') {
      // When no node selected, show a prompt to pick a node (avoid loading all poles at once)
      setPoles([])
      return
    }
    const cacheKey = `poleaudit_poles_${nodeFilter}`
    const hit = cacheGet<PoleRecord[]>(cacheKey)
    if (hit) { setPoles(hit); setPolesLoading(false) }
    else setPolesLoading(true)

    fetch(`${SKYCABLE_API}/nodes/${nodeFilter}/poles`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const list: PoleRecord[] = Array.isArray(d) ? d : []
        // Attach node info to each record
        const node = nodes.find(n => n.id === nodeFilter)
        const enriched = list.map(p => ({ ...p, node_id: nodeFilter, node }))
        setPoles(enriched)
        cacheSet(cacheKey, enriched)
      })
      .catch(() => setError('Failed to load poles'))
      .finally(() => setPolesLoading(false))
  }, [nodeFilter, nodes])

  const filteredNodes = useMemo(() =>
    areaFilter === 'all' ? nodes : nodes.filter(n => n.area?.id === areaFilter),
    [nodes, areaFilter]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return poles.filter(r => {
      const code = (r.pole?.pole_code ?? '').toLowerCase()
      const st   = r.pole?.skycable_status ?? 'pending'
      return (
        (!q || code.includes(q)) &&
        (statusFilter === 'all' || st === statusFilter)
      )
    })
  }, [poles, search, statusFilter])

  const stats = useMemo(() => ({
    total:    poles.length,
    pending:  poles.filter(r => (r.pole?.skycable_status ?? 'pending') === 'pending').length,
    ongoing:  poles.filter(r => r.pole?.skycable_status === 'in_progress').length,
    cleared:  poles.filter(r => r.pole?.skycable_status === 'cleared').length,
  }), [poles])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  const selectedNode = nodes.find(n => n.id === nodeFilter)

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="md:flex items-center justify-between px-0.5">
        <div>
          <h4 className="text-[18px] font-bold text-gray-800 dark:text-gray-100">Pole Audit</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track clearance status of every pole by node</p>
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          {poles.length > 0 && (
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-2 h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <i className="bx bx-download text-base" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Stat cards (only when a node is selected) */}
      {nodeFilter !== 'all' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Total Poles', value: stats.total,   icon: 'bx bx-map-pin',       color: 'from-sky-500 to-blue-600',      ring: 'ring-sky-200 dark:ring-sky-500/20' },
            { label: 'Pending',     value: stats.pending, icon: 'bx bx-time',           color: 'from-amber-400 to-orange-500',  ring: 'ring-amber-200 dark:ring-amber-500/20' },
            { label: 'Ongoing',     value: stats.ongoing, icon: 'bx bx-loader-circle',  color: 'from-violet-500 to-purple-600', ring: 'ring-violet-200 dark:ring-violet-500/20' },
            { label: 'Cleared',     value: stats.cleared, icon: 'bx bx-check-circle',   color: 'from-emerald-500 to-teal-500',  ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
          ].map(c => (
            <div key={c.label} className="card dark:bg-zinc-800 dark:border-zinc-700">
              <div className="card-body flex items-center gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${c.color} ring-4 ${c.ring} shadow-lg`}>
                  <i className={`${c.icon} text-xl text-white`} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{c.label}</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{c.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card dark:bg-zinc-800 dark:border-zinc-700">
        <div className="card-body flex flex-wrap items-center gap-3">

          {/* Area filter */}
          <div className="relative">
            <select
              value={areaFilter}
              onChange={e => { setAreaFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setNodeFilter('all') }}
              className="h-9 rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-600 shadow-sm outline-none appearance-none transition hover:border-slate-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <option value="all">All Areas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          </div>

          {/* Node filter */}
          <div className="relative">
            <select
              value={nodeFilter}
              onChange={e => { setNodeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(1) }}
              className="h-9 rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-600 shadow-sm outline-none appearance-none transition hover:border-slate-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <option value="all">Select Node…</option>
              {filteredNodes.map(n => <option key={n.id} value={n.id}>{n.full_label ?? n.name}</option>)}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          </div>

          {/* Status filter */}
          <div className="flex rounded-xl border border-slate-200 dark:border-zinc-600 overflow-hidden">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`h-9 px-3 text-xs font-semibold capitalize transition ${
                  statusFilter === s
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {s === 'all' ? 'All' : poleStatusCfg[s].label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search pole code…"
              className="h-9 w-52 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </div>
      </div>

      {/* Main table */}
      <div className="card dark:bg-zinc-800 dark:border-zinc-700">
        {/* Table header with node name */}
        {selectedNode && (
          <div className="card-body border-b border-gray-50 dark:border-zinc-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15">
                <i className="bx bx-git-commit text-violet-600 dark:text-violet-400 text-lg" />
              </div>
              <div>
                <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedNode.full_label ?? selectedNode.name}</h5>
                <p className="text-xs text-slate-400">{selectedNode.area?.name} · {filtered.length} poles</p>
              </div>
            </div>
            <Link
              to={`/sites/${selectedNode.area?.id ?? ''}/nodes/${selectedNode.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              View Node <i className="bx bx-right-arrow-alt" />
            </Link>
          </div>
        )}

        {/* Loading / empty states */}
        {loading && !nodes.length && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && nodeFilter === 'all' && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400 dark:text-zinc-500">
            <i className="bx bx-map-pin text-4xl" />
            <p className="text-sm font-medium">Select a node to view its poles</p>
          </div>
        )}

        {nodeFilter !== 'all' && polesLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-6 text-sm text-red-500">{error}</div>
        )}

        {nodeFilter !== 'all' && !polesLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400 dark:text-zinc-500">
            <i className="bx bx-search-alt text-3xl" />
            <p className="text-sm">No poles match your filters</p>
          </div>
        )}

        {nodeFilter !== 'all' && !polesLoading && filtered.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-zinc-700">
                    {['#', 'Pole Code', 'GPS', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-zinc-700/60">
                  {paginated.map(r => {
                    const st  = (r.pole?.skycable_status ?? 'pending') as PoleStatus
                    const cfg = poleStatusCfg[st]
                    const hasGps = !!(r.pole?.lat && r.pole?.lng)
                    return (
                      <tr key={r.id} className="group transition hover:bg-slate-50 dark:hover:bg-zinc-700/40">
                        <td className="px-4 py-3 text-xs text-slate-400 tabular-nums w-12">{r.sequence}</td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {r.pole?.pole_code ?? `P-${r.id}`}
                        </td>
                        <td className="px-4 py-3">
                          {hasGps ? (
                            <a
                              href={`https://maps.google.com/?q=${r.pole!.lat},${r.pole!.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
                            >
                              <i className="bx bx-map-alt" />
                              {Number(r.pole!.lat).toFixed(5)}, {Number(r.pole!.lng).toFixed(5)}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-zinc-600">No GPS</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-zinc-700">
                <span className="text-xs text-slate-400">
                  {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700">
                    <i className="bx bx-chevron-left text-base" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700">
                    <i className="bx bx-chevron-right text-base" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
