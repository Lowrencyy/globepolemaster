import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

interface Area {
  id: number
  name: string
  nodes_count?: number
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

const GRADIENTS = [
  'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
  'linear-gradient(135deg, #1F276F 0%, #2E3791 100%)',
  'linear-gradient(135deg, #2E3791 0%, #5362D8 100%)',
  'linear-gradient(135deg, #283184 0%, #4450C4 100%)',
  'linear-gradient(135deg, #182060 0%, #2E3791 100%)',
]

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function statusStyle(status: string) {
  if (status === 'completed') {
    return {
      dot: '#10b981',
      text: '#047857',
      soft: '#ecfdf5',
      border: '#a7f3d0',
      bar: 'linear-gradient(90deg, #10b981, #14b8a6)',
    }
  }

  if (status === 'in_progress') {
    return {
      dot: BRAND.blue,
      text: BRAND.blue,
      soft: BRAND.soft,
      border: BRAND.borderStrong,
      bar: 'linear-gradient(90deg, #2E3791, #5362D8)',
    }
  }

  return {
    dot: '#f59e0b',
    text: '#b45309',
    soft: '#fffbeb',
    border: '#fde68a',
    bar: 'linear-gradient(90deg, #f59e0b, #f97316)',
  }
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'In Progress'
  return 'Pending'
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
          <p
            className="text-[10px] font-black uppercase tracking-[0.16em]"
            style={{ color: BRAND.muted2 }}
          >
            {label}
          </p>

          <p
            className="mt-2 truncate font-mono text-[28px] font-black leading-none"
            style={{ color: BRAND.textDark }}
          >
            {value}
          </p>

          {helper && <p className="mt-2 text-[11px] font-bold" style={{ color: BRAND.muted2 }}>{helper}</p>}
        </div>

        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: accent }}
        >
          <i className={`bx ${icon} text-[22px]`} />
        </div>
      </div>
    </div>
  )
}

export default function PoleReports() {
  const navigate = useNavigate()

  const [areas, setAreas] = useState<Area[]>(() => cacheGet<Area[]>('pr_areas') ?? [])
  const [areasLoading, setAreasLoading] = useState(() => !cacheGet<Area[]>('pr_areas'))

  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [nodes, setNodes] = useState<SkycableNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (cacheGet<Area[]>('pr_areas')) return

    fetch(`${SKYCABLE_API}/areas`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        const list: Area[] = Array.isArray(d) ? d : d?.data ?? []
        cacheSet('pr_areas', list)
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
    const avgNodes = totalSites > 0 ? Math.round(totalNodes / totalSites) : 0

    return {
      totalSites,
      totalNodes,
      avgNodes,
    }
  }, [areas])

  const nodeStats = useMemo(() => {
    const total = filteredNodes.length
    const completed = filteredNodes.filter(node => node.status === 'completed').length
    const inProgress = filteredNodes.filter(node => node.status === 'in_progress').length
    const pending = filteredNodes.filter(node => node.status === 'pending').length
    const avgProgress = total > 0
      ? Math.round(filteredNodes.reduce((sum, node) => sum + Number(node.progress_percentage ?? 0), 0) / total)
      : 0

    return {
      total,
      completed,
      inProgress,
      pending,
      avgProgress,
    }
  }, [filteredNodes])

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-[28px] px-6 py-7"
        style={{
          background: `linear-gradient(135deg, #ffffff 0%, ${BRAND.softer} 40%, ${BRAND.soft} 100%)`,
          border: `1px solid ${BRAND.borderStrong}`,
          boxShadow: '0 24px 60px -38px rgba(46,55,145,0.38)',
        }}
      >
        <div
          className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'rgba(46,55,145,0.12)' }}
        />

        <div
          className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'rgba(68,80,196,0.12)' }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
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
              Pole Reports
            </span>

            <h2
              className="mt-3 text-3xl font-black tracking-[-0.05em]"
              style={{ color: BRAND.blue }}
            >
              {selectedArea ? selectedArea.name : 'Pole Reports'}
            </h2>

            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>
              {selectedArea
                ? 'Before and after pole photo reports by selected node.'
                : 'Select a site to view pole photo reports by node.'}
            </p>
          </div>

          {selectedArea && (
            <button
              type="button"
              onClick={backToSites}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold"
              style={{
                background: '#ffffff',
                border: `1px solid ${BRAND.borderStrong}`,
                color: BRAND.dark,
              }}
            >
              <i className="bx bx-arrow-back text-base" />
              All Sites
            </button>
          )}
        </div>
      </div>

      {/* All Sites Screen */}
      {!selectedArea && (
        <>
          <div
            className="rounded-[24px] p-4"
            style={{
              background: BRAND.panel,
              border: `1px solid ${BRAND.border}`,
            }}
          >
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid min-w-[1080px] grid-cols-5 gap-4 xl:min-w-0">
                {[
                  {
                    label: 'Total Sites',
                    value: siteStats.totalSites,
                    icon: 'bx-map',
                    accent: GRADIENTS[0],
                    helper: 'available sites',
                  },
                  {
                    label: 'Total Nodes',
                    value: siteStats.totalNodes,
                    icon: 'bx-git-branch',
                    accent: GRADIENTS[1],
                    helper: 'site coverage',
                  },
                  {
                    label: 'Average Nodes',
                    value: siteStats.avgNodes,
                    icon: 'bx-analyse',
                    accent: GRADIENTS[2],
                    helper: 'per site',
                  },
                  {
                    label: 'Cached',
                    value: areas.length,
                    icon: 'bx-data',
                    accent: GRADIENTS[3],
                    helper: 'ready',
                  },
                  {
                    label: 'Reports',
                    value: 'POLE',
                    icon: 'bx-camera',
                    accent: GRADIENTS[4],
                    helper: 'photo ready',
                  },
                ].map(card => <StatCard key={card.label} {...card} />)}
              </div>
            </div>
          </div>


          {areasLoading && areas.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div
                  className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }}
                />
                <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>
                  Loading sites...
                </p>
              </div>
            </div>
          ) : areas.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-[24px] bg-white py-20"
              style={{
                color: BRAND.muted2,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <i className="bx bx-map text-5xl" />
              <p className="mt-3 text-sm font-semibold">No sites found.</p>
            </div>
          ) : (
            <div
              className="rounded-[24px] p-4"
              style={{
                background: BRAND.panel,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid min-w-[1180px] grid-cols-5 gap-4 xl:min-w-0">
                  {areas.map((area, index) => {
                    const gradient = GRADIENTS[index % GRADIENTS.length]
                    const nodeCount = Number(area.nodes_count ?? 0)

                    return (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => selectArea(area)}
                        className="group relative overflow-hidden rounded-[22px] bg-white p-5 text-left transition duration-300 hover:-translate-y-1"
                        style={{
                          border: `1px solid ${BRAND.border}`,
                          boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
                        }}
                      >
                        <div
                          className="absolute inset-x-0 top-0 h-1"
                          style={{ background: gradient }}
                        />

                        <div className="relative flex min-h-[190px] flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p
                                  className="text-[10px] font-black uppercase tracking-[0.16em]"
                                  style={{ color: BRAND.muted2 }}
                                >
                                  Site {index + 1}
                                </p>

                                <p
                                  className="mt-3 line-clamp-2 text-xl font-black leading-tight tracking-[-0.04em]"
                                  style={{ color: BRAND.textDark }}
                                >
                                  {area.name}
                                </p>
                              </div>

                              <div
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                                style={{ background: gradient }}
                              >
                                <i className="bx bx-camera text-[22px]" />
                              </div>
                            </div>

                            <p
                              className="mt-3 text-sm font-semibold leading-6"
                              style={{ color: BRAND.muted }}
                            >
                              Open node pole photo reports and progress details.
                            </p>
                          </div>

                          <div
                            className="mt-5 flex items-end justify-between border-t pt-4"
                            style={{ borderColor: BRAND.border }}
                          >
                            <div>
                              <p
                                className="text-[10px] font-black uppercase tracking-[0.16em]"
                                style={{ color: BRAND.muted2 }}
                              >
                                Nodes
                              </p>

                              <p
                                className="mt-1 font-mono text-3xl font-black leading-none"
                                style={{ color: BRAND.textDark }}
                              >
                                {nodeCount}
                              </p>
                            </div>

                            <span
                              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black transition"
                              style={{
                                backgroundColor: BRAND.soft,
                                color: BRAND.blue,
                              }}
                            >
                              View Photos
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
      )}

      {/* Selected Site Screen */}
      {selectedArea && (
        <>
          <div
            className="rounded-[24px] p-4"
            style={{
              background: BRAND.panel,
              border: `1px solid ${BRAND.border}`,
            }}
          >
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid min-w-[1180px] grid-cols-5 gap-4 xl:min-w-0">
                {[
                  {
                    label: 'Total Nodes',
                    value: nodeStats.total,
                    icon: 'bx-git-branch',
                    accent: GRADIENTS[0],
                  },
                  {
                    label: 'Completed',
                    value: nodeStats.completed,
                    icon: 'bx-check-circle',
                    accent: 'linear-gradient(135deg, #059669, #0d9488)',
                  },
                  {
                    label: 'In Progress',
                    value: nodeStats.inProgress,
                    icon: 'bx-loader-circle',
                    accent: GRADIENTS[2],
                  },
                  {
                    label: 'Pending',
                    value: nodeStats.pending,
                    icon: 'bx-time-five',
                    accent: 'linear-gradient(135deg, #ea580c, #f59e0b)',
                  },
                  {
                    label: 'Avg Progress',
                    value: `${nodeStats.avgProgress}%`,
                    icon: 'bx-trending-up',
                    accent:
                      nodeStats.avgProgress >= 90
                        ? 'linear-gradient(135deg, #059669, #0d9488)'
                        : nodeStats.avgProgress >= 70
                          ? 'linear-gradient(135deg, #ea580c, #f59e0b)'
                          : 'linear-gradient(135deg, #e11d48, #be185d)',
                  },
                ].map(card => <StatCard key={card.label} {...card} />)}
              </div>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-3"
            style={{
              border: `1px solid ${BRAND.border}`,
              boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
            }}
          >
            <div className="relative min-w-[280px] max-w-xl flex-1">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-[#8E96C5]" />

              <input
                type="text"
                placeholder="Search node name, label, or area..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-sm font-semibold outline-none"
                style={{
                  border: `1px solid ${BRAND.border}`,
                  color: BRAND.textDark,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">

              <span
                className="rounded-xl px-3 py-2 text-xs font-black"
                style={{
                  backgroundColor: BRAND.softer,
                  color: BRAND.muted,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                {filteredNodes.length} results
              </span>
            </div>
          </div>

          {nodesLoading && nodes.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div
                  className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }}
                />
                <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>
                  Loading nodes...
                </p>
              </div>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-[24px] bg-white py-20"
              style={{
                color: BRAND.muted2,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <i className="bx bx-search-alt text-5xl" />
              <p className="mt-3 text-sm font-semibold">
                {search ? 'No nodes match your search.' : 'No nodes found in this site.'}
              </p>
            </div>
          ) : (
            <div
              className="rounded-[24px] p-4"
              style={{
                background: BRAND.panel,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
                {filteredNodes.map((node, index) => {
                  const status = statusStyle(node.status)
                  const gradient = GRADIENTS[index % GRADIENTS.length]
                  const progress = Math.min(100, Math.round(node.progress_percentage ?? 0))

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => navigate(`/reports/pole-reports/${node.id}`)}
                      className="group relative overflow-hidden rounded-[22px] bg-white p-5 text-left transition duration-300 hover:-translate-y-1"
                      style={{
                        border: `1px solid ${BRAND.border}`,
                        boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
                      }}
                    >
                      <div className="absolute inset-x-0 top-0 h-1" style={{ background: gradient }} />

                      <div className="relative flex min-h-[230px] flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              {node.full_label && (
                                <p
                                  className="truncate text-[10px] font-black uppercase tracking-[0.16em]"
                                  style={{ color: BRAND.blue }}
                                >
                                  {node.full_label}
                                </p>
                              )}

                              <h3
                                className="mt-2 line-clamp-2 text-xl font-black leading-tight tracking-[-0.04em]"
                                style={{ color: BRAND.textDark }}
                              >
                                {node.name}
                              </h3>

                              <p className="mt-1 text-xs font-semibold" style={{ color: BRAND.muted2 }}>
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

                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black"
                              style={{
                                backgroundColor: BRAND.soft,
                                color: BRAND.blue,
                              }}
                            >
                              Pole Photos
                            </span>
                          </div>

                          <div className="mt-5">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>
                                Progress
                              </p>
                              <p className="font-mono text-xs font-black" style={{ color: BRAND.textDark }}>
                                {progress}%
                              </p>
                            </div>

                            <div
                              className="overflow-hidden rounded-full"
                              style={{
                                backgroundColor: '#ECEEFF',
                                border: `1px solid ${BRAND.border}`,
                              }}
                            >
                              <div
                                className="h-2.5 rounded-full transition-all duration-700"
                                style={{
                                  width: progress === 0 ? '8px' : `${progress}%`,
                                  minWidth: progress > 0 ? '28px' : '8px',
                                  background: progress >= 100 ? 'linear-gradient(90deg, #10b981, #14b8a6)' : gradient,
                                }}
                              />
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-3">
                            <div
                              className="rounded-2xl px-3 py-3"
                              style={{
                                backgroundColor: BRAND.softer,
                                border: `1px solid ${BRAND.border}`,
                              }}
                            >
                              <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: BRAND.muted2 }}>
                                Report Type
                              </p>
                              <p className="mt-1 text-sm font-black" style={{ color: BRAND.textDark }}>
                                Pole Audit
                              </p>
                            </div>

                            <div
                              className="rounded-2xl px-3 py-3"
                              style={{
                                backgroundColor: BRAND.softer,
                                border: `1px solid ${BRAND.border}`,
                              }}
                            >
                              <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: BRAND.muted2 }}>
                                Photos
                              </p>
                              <p className="mt-1 text-sm font-black" style={{ color: BRAND.textDark }}>
                                Before / After
                              </p>
                            </div>
                          </div>
                        </div>

                        <div
                          className="mt-5 flex items-center justify-between border-t pt-4"
                          style={{ borderColor: BRAND.border }}
                        >
                          <span className="text-xs font-bold" style={{ color: BRAND.muted }}>
                            Open pole photo report
                          </span>

                          <span
                            className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black transition"
                            style={{
                              backgroundColor: BRAND.soft,
                              color: BRAND.blue,
                            }}
                          >
                            View Photos
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
      )}
    </div>
  )
}
