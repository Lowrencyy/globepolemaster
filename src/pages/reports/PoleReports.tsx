import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

interface Area {
  id: number
  name: string
  nodes_count?: number
  map_url?: string | null
  logo_url?: string | null
  image_url?: string | null
}

interface SkycableNode {
  id: number
  name: string
  full_label: string | null
  status: 'pending' | 'in_progress' | 'completed'
  progress_percentage: number
  area: { id: number; name: string } | null
}

const BRAND = {
  blue: '#2563eb',
  sky: '#06b6d4',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  emerald: '#10b981',
  teal: '#14b8a6',
  textDark: '#0f172a',
  muted: '#475569',
  muted2: '#94a3b8',
  soft: '#eff6ff',
  panel: '#f8fafc',
  border: '#cbd5e1',
}

const SITE_GRADIENTS = [
  'linear-gradient(135deg, #2563eb, #0ea5e9)',
  'linear-gradient(135deg, #06b6d4, #22d3ee)',
  'linear-gradient(135deg, #f59e0b, #f97316)',
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
]

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    }
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'Ongoing'
  return 'Pending'
}

function statusStyle(status: string) {
  if (status === 'completed') {
    return {
      dot: '#10b981',
      text: '#047857',
      soft: '#ecfdf5',
      border: '#a7f3d0',
    }
  }

  if (status === 'in_progress') {
    return {
      dot: '#8b5cf6',
      text: '#6d28d9',
      soft: '#f5f3ff',
      border: '#ddd6fe',
    }
  }

  return {
    dot: '#f59e0b',
    text: '#b45309',
    soft: '#fffbeb',
    border: '#fde68a',
  }
}

function StatCard({
  label,
  value,
  helper,
  icon,
  accent,
}: {
  label: string
  value: number | string
  helper: string
  icon: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />

      <div
        className="absolute right-0 top-0 h-14 w-14 rounded-bl-[22px] opacity-15"
        style={{ background: accent }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            {label}
          </p>

          <p className="mt-4 font-mono text-3xl font-black leading-none text-slate-950">
            {value}
          </p>

          <p className="mt-3 text-xs font-medium text-slate-500">
            {helper}
          </p>
        </div>

        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ background: accent }}
        >
          <i className={`bx ${icon} text-xl`} />
        </div>
      </div>
    </div>
  )
}

export default function PoleReports() {
  const navigate = useNavigate()

  const cachedAreas = cacheGet<Area[]>('pr_areas')
  const [areas, setAreas] = useState<Area[]>(() => cachedAreas?.length ? cachedAreas : [])
  const [areasLoading, setAreasLoading] = useState(() => !cachedAreas?.length)

  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [nodes, setNodes] = useState<SkycableNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const cached = cacheGet<Area[]>('pr_areas')
    if (cached?.length) {
      setAreasLoading(false)
      return
    }

    setAreasLoading(true)

    fetch(`${SKYCABLE_API}/areas`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        const list: Area[] = Array.isArray(d) ? d : d?.data ?? []
        if (list.length) cacheSet('pr_areas', list)
        setAreas(list)
      })
      .catch(() => {})
      .finally(() => setAreasLoading(false))
  }, [])

  function selectArea(area: Area) {
    setSelectedArea(area)
    setSearch('')

    const key = `pr_nodes_${area.id}`
    const hit = cacheGet<SkycableNode[]>(key)

    if (hit) {
      setNodes(hit)
      return
    }

    setNodes([])
    setNodesLoading(true)

    fetch(`${SKYCABLE_API}/nodes?area_id=${area.id}`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        const list: SkycableNode[] = Array.isArray(d) ? d : d?.data ?? []
        cacheSet(key, list)
        setNodes(list)
      })
      .catch(() => {})
      .finally(() => setNodesLoading(false))
  }

  function backToSites() {
    setSelectedArea(null)
    setNodes([])
    setSearch('')
    setNodesLoading(false)
  }

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return nodes

    return nodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      (n.full_label ?? '').toLowerCase().includes(q) ||
      (n.area?.name ?? '').toLowerCase().includes(q)
    )
  }, [nodes, search])

  const siteStats = useMemo(() => {
    const totalSites = areas.length
    const totalNodes = areas.reduce((sum, area) => sum + Number(area.nodes_count ?? 0), 0)

    return {
      totalSites,
      totalNodes,
      pending: 5,
      ongoing: 3,
      completed: 1,
    }
  }, [areas])

  const nodeStats = useMemo(() => {
    const total = filteredNodes.length
    const completed = filteredNodes.filter(node => node.status === 'completed').length
    const ongoing = filteredNodes.filter(node => node.status === 'in_progress').length
    const pending = filteredNodes.filter(node => node.status === 'pending').length

    return {
      total,
      completed,
      ongoing,
      pending,
    }
  }, [filteredNodes])

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-300 bg-white px-5 py-5 shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-blue-100 blur-2xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
              Skycable Areas
            </span>

            <h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">
              {selectedArea ? selectedArea.name : 'Site List'}
            </h2>

            <p className="mt-1 text-sm font-medium text-slate-500">
              {selectedArea
                ? 'Node pole photo reports and progress overview.'
                : 'Regional coverage dashboard for areas, nodes, and work progress.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedArea ? (
              <button
                type="button"
                onClick={backToSites}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <i className="bx bx-arrow-back" />
                All Sites
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <i className="bx bx-refresh" />
                  Refresh
                </button>

                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <i className="bx bx-plus text-lg" />
                  Add Site
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!selectedArea && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Total Sites"
              value={siteStats.totalSites}
              helper="Registered coverage areas"
              icon="bx-map"
              accent={SITE_GRADIENTS[0]}
            />

            <StatCard
              label="Total Nodes"
              value={siteStats.totalNodes}
              helper="Across all areas"
              icon="bx-menu"
              accent={SITE_GRADIENTS[1]}
            />

            <StatCard
              label="Pending"
              value={siteStats.pending}
              helper="Awaiting action"
              icon="bx-time-five"
              accent={SITE_GRADIENTS[2]}
            />

            <StatCard
              label="Ongoing"
              value={siteStats.ongoing}
              helper="Currently in progress"
              icon="bx-loader-circle"
              accent={SITE_GRADIENTS[3]}
            />

            <StatCard
              label="Completed"
              value={siteStats.completed}
              helper="Finished nodes"
              icon="bx-check-circle"
              accent={SITE_GRADIENTS[4]}
            />
          </div>

          {areasLoading && areas.length === 0 ? (
            <div className="flex items-center justify-center rounded-[24px] border border-slate-200 bg-white py-20">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="mt-4 text-sm font-bold text-slate-500">
                  Loading sites...
                </p>
              </div>
            </div>
          ) : areas.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-slate-200 bg-white py-20 text-slate-400">
              <i className="bx bx-map text-5xl" />
              <p className="mt-3 text-sm font-semibold">No sites found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {areas.map((area, index) => {
                const gradient = SITE_GRADIENTS[index % SITE_GRADIENTS.length]
                const nodeCount = Number(area.nodes_count ?? 0)
                const imageSrc = area.map_url || area.image_url || area.logo_url

                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => selectArea(area)}
                    className="group relative overflow-hidden rounded-[26px] bg-white text-left shadow-sm ring-1 ring-slate-200 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="absolute inset-x-0 top-0 z-10 h-1.5" style={{ background: gradient }} />

                    <div className="relative h-40 overflow-hidden bg-slate-100">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={area.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
                          <img
                            src="/logo.png"
                            alt="Skycable"
                            className="h-20 w-20 object-contain opacity-80"
                          />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />

                      <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700 shadow-sm">
                        Site {index + 1}
                      </span>

                      <div
                        className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg"
                        style={{ background: gradient }}
                      >
                        <i className="bx bx-map-alt text-[22px]" />
                      </div>
                    </div>

                    <div className="p-5">
                      <h3 className="line-clamp-2 text-xl font-black leading-tight tracking-[-0.04em] text-slate-950">
                        {area.name}
                      </h3>

                      <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                        Regional coverage, nodes, and pole report monitoring.
                      </p>

                      <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            Nodes
                          </p>

                          <p className="mt-1 font-mono text-3xl font-black leading-none text-slate-950">
                            {nodeCount}
                          </p>
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                          Open Site
                          <i className="bx bx-right-arrow-alt text-base" />
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {selectedArea && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Nodes"
              value={nodeStats.total}
              helper="Selected site nodes"
              icon="bx-git-branch"
              accent={SITE_GRADIENTS[0]}
            />

            <StatCard
              label="Pending"
              value={nodeStats.pending}
              helper="Awaiting action"
              icon="bx-time-five"
              accent={SITE_GRADIENTS[2]}
            />

            <StatCard
              label="Ongoing"
              value={nodeStats.ongoing}
              helper="Currently in progress"
              icon="bx-loader-circle"
              accent={SITE_GRADIENTS[3]}
            />

            <StatCard
              label="Completed"
              value={nodeStats.completed}
              helper="Finished nodes"
              icon="bx-check-circle"
              accent={SITE_GRADIENTS[4]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative min-w-[260px] flex-1">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                placeholder="Search node name, label, or area..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
              {filteredNodes.length} results
            </span>
          </div>

          {nodesLoading && nodes.length === 0 ? (
            <div className="flex items-center justify-center rounded-[24px] border border-slate-200 bg-white py-20">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="mt-4 text-sm font-bold text-slate-500">
                  Loading nodes...
                </p>
              </div>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-slate-200 bg-white py-20 text-slate-400">
              <i className="bx bx-search-alt text-5xl" />
              <p className="mt-3 text-sm font-semibold">
                {search ? 'No nodes match your search.' : 'No nodes found in this site.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredNodes.map((node, index) => {
                const gradient = SITE_GRADIENTS[index % SITE_GRADIENTS.length]
                const status = statusStyle(node.status)
                const progress = Math.min(100, Math.round(node.progress_percentage ?? 0))

                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => navigate(`/reports/pole-reports/${node.id}`)}
                    className="group relative overflow-hidden rounded-[26px] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: gradient }} />

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {node.full_label && (
                          <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                            {node.full_label}
                          </p>
                        )}

                        <h3 className="mt-2 line-clamp-2 text-xl font-black leading-tight tracking-[-0.04em] text-slate-950">
                          {node.name}
                        </h3>

                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {node.area?.name ?? selectedArea.name}
                        </p>
                      </div>

                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                        style={{ background: gradient }}
                      >
                        <i className="bx bx-camera text-[22px]" />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
                        style={{
                          backgroundColor: status.soft,
                          color: status.text,
                          border: `1px solid ${status.border}`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.dot }} />
                        {statusLabel(node.status)}
                      </span>

                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
                        Pole Photos
                      </span>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Progress
                        </p>

                        <p className="font-mono text-xs font-black text-slate-950">
                          {progress}%
                        </p>
                      </div>

                      <div className="overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                        <div
                          className="h-2.5 rounded-full transition-all duration-700"
                          style={{
                            width: progress === 0 ? '8px' : `${progress}%`,
                            minWidth: progress > 0 ? '28px' : '8px',
                            background: progress >= 100
                              ? SITE_GRADIENTS[4]
                              : gradient,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Report Type
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          Pole Audit
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Photos
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          Before / After
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="text-xs font-bold text-slate-500">
                        Open pole photo report
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                        View Photos
                        <i className="bx bx-right-arrow-alt text-base" />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}