import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
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
  expected_cable: number
  actual_cable: number
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

const BRAND_GRADIENTS = [
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

function fmt(n: number | string | null | undefined, dec = 1) {
  return Number(n ?? 0)
    .toFixed(dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function safeFileName(value: string) {
  return value
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

function nodeStatusLabel(status: string) {
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'In Progress'
  return 'Pending'
}

function nodeStatusStyle(status: string) {
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

export default function RTDReports() {
  const navigate = useNavigate()

  const cachedAreas = cacheGet<Area[]>('rtd_areas')

  const [areas, setAreas] = useState<Area[]>(() => cachedAreas ?? [])
  const [areasLoading, setAreasLoading] = useState(() => !cachedAreas)
  const [areasRefreshing, setAreasRefreshing] = useState(false)

  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [nodes, setNodes] = useState<SkycableNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const hit = cacheGet<Area[]>('rtd_areas')

    if (hit) {
      setAreas(hit)
      setAreasLoading(false)
      setAreasRefreshing(true)
    } else {
      setAreasLoading(true)
    }

    fetch(`${SKYCABLE_API}/areas`, { headers: headers() })
      .then(r => r.json())
      .then(data => {
        const list: Area[] = Array.isArray(data) ? data : data?.data ?? []
        cacheSet('rtd_areas', list)
        setAreas(list)
      })
      .catch(() => {})
      .finally(() => {
        setAreasLoading(false)
        setAreasRefreshing(false)
      })
  }, [])

  function selectArea(area: Area) {
    setSelectedArea(area)
    setSearch('')

    const cacheKey = `rtd_nodes_${area.id}`
    const hit = cacheGet<SkycableNode[]>(cacheKey)

    if (hit) {
      setNodes(hit)
      setNodesLoading(false)
      setNodesRefreshing(true)
    } else {
      setNodes([])
      setNodesLoading(true)
      setNodesRefreshing(false)
    }

    fetch(`${SKYCABLE_API}/nodes?area_id=${area.id}`, { headers: headers() })
      .then(r => r.json())
      .then(data => {
        const list: SkycableNode[] = Array.isArray(data) ? data : data?.data ?? []
        cacheSet(cacheKey, list)
        setNodes(list)
      })
      .catch(() => {})
      .finally(() => {
        setNodesLoading(false)
        setNodesRefreshing(false)
      })
  }

  function backToSites() {
    setSelectedArea(null)
    setNodes([])
    setSearch('')
    setNodesLoading(false)
    setNodesRefreshing(false)
  }

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return nodes

    return nodes.filter(
      node =>
        node.name.toLowerCase().includes(q) ||
        (node.full_label ?? '').toLowerCase().includes(q) ||
        (node.area?.name ?? '').toLowerCase().includes(q)
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
    const expected = filteredNodes.reduce((sum, node) => sum + Number(node.expected_cable ?? 0), 0)
    const collected = filteredNodes.reduce((sum, node) => sum + Number(node.actual_cable ?? 0), 0)
    const recovery = expected > 0 ? Math.round((collected / expected) * 100) : 0

    return {
      total,
      completed,
      inProgress,
      pending,
      expected,
      collected,
      recovery,
    }
  }, [filteredNodes])

  function exportSelectedSiteNodes() {
    if (!selectedArea || nodes.length === 0) return

    const wb = XLSX.utils.book_new()

    const rows = [
      [`RTD Node Report — ${selectedArea.name}`],
      [`Scope: All nodes under ${selectedArea.name}`],
      [`Exported Rows: ${nodes.length}`],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      [
        '#',
        'Node Name',
        'Full Label',
        'Area',
        'Status',
        'Progress %',
        'Expected Cable (m)',
        'Collected Cable (m)',
        'Recovery %',
      ],
      ...nodes.map((node, index) => {
        const expected = Number(node.expected_cable ?? 0)
        const collected = Number(node.actual_cable ?? 0)
        const recovery = expected > 0 ? Math.round((collected / expected) * 100) : 0

        return [
          index + 1,
          node.name,
          node.full_label ?? '—',
          node.area?.name ?? selectedArea.name,
          nodeStatusLabel(node.status),
          `${Math.round(node.progress_percentage ?? 0)}%`,
          expected,
          collected,
          `${recovery}%`,
        ]
      }),
      [],
      [
        '',
        '',
        '',
        '',
        'TOTALS',
        '',
        nodes.reduce((sum, node) => sum + Number(node.expected_cable ?? 0), 0),
        nodes.reduce((sum, node) => sum + Number(node.actual_cable ?? 0), 0),
      ],
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws['!cols'] = [
      { wch: 4 },
      { wch: 28 },
      { wch: 24 },
      { wch: 18 },
      { wch: 15 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'RTD Nodes')
    XLSX.writeFile(wb, `RTD_Nodes_${safeFileName(selectedArea.name)}.xlsx`)
  }

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
              RTD Reports
            </span>

            <h2
              className="mt-3 text-3xl font-black tracking-[-0.05em]"
              style={{ color: BRAND.blue }}
            >
              {selectedArea ? selectedArea.name : 'All Sites'}
            </h2>

            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>
              {selectedArea
                ? 'Minimal RTD node monitoring table with compact progress and Excel export.'
                : 'Select a site to view its nodes and export RTD reports as Excel.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            {selectedArea && (
              <button
                type="button"
                onClick={exportSelectedSiteNodes}
                disabled={nodes.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    nodes.length === 0
                      ? '#94a3b8'
                      : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
                  color: '#ffffff',
                }}
              >
                <i className="bx bx-download text-base" />
                Export Excel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* All Sites Screen */}
      {!selectedArea && (
        <>
          {/* Stats cards */}
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
                    icon: 'bx bx-map',
                    accent: BRAND_GRADIENTS[0],
                    helper: 'available sites',
                  },
                  {
                    label: 'Total Nodes',
                    value: siteStats.totalNodes,
                    icon: 'bx bx-git-branch',
                    accent: BRAND_GRADIENTS[1],
                    helper: 'site coverage',
                  },
                  {
                    label: 'Average Nodes',
                    value: siteStats.avgNodes,
                    icon: 'bx bx-analyse',
                    accent: BRAND_GRADIENTS[2],
                    helper: 'per site',
                  },
                  {
                    label: 'Cached',
                    value: areas.length,
                    icon: 'bx bx-data',
                    accent: BRAND_GRADIENTS[3],
                    helper: areasRefreshing ? 'updating' : 'ready',
                  },
                  {
                    label: 'Reports',
                    value: 'RTD',
                    icon: 'bx bx-file',
                    accent: BRAND_GRADIENTS[4],
                    helper: 'export ready',
                  },
                ].map(card => (
                  <div
                    key={card.label}
                    className="relative overflow-hidden rounded-[20px] bg-white p-4"
                    style={{
                      border: `1px solid ${BRAND.border}`,
                      boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
                    }}
                  >
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <p
                          className="text-[10px] font-black uppercase tracking-[0.16em]"
                          style={{ color: BRAND.muted2 }}
                        >
                          {card.label}
                        </p>

                        <p
                          className="mt-2 font-mono text-[28px] font-black leading-none"
                          style={{ color: BRAND.textDark }}
                        >
                          {card.value}
                        </p>

                        <p className="mt-2 text-[11px] font-bold" style={{ color: BRAND.muted2 }}>
                          {card.helper}
                        </p>
                      </div>

                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                        style={{ background: card.accent }}
                      >
                        <i className={`${card.icon} text-[22px]`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {areasRefreshing && areas.length > 0 && (
            <div
              className="inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
              style={{
                backgroundColor: BRAND.soft,
                color: BRAND.blue,
                border: `1px solid ${BRAND.borderStrong}`,
              }}
            >
              <i className="bx bx-refresh animate-spin text-sm" />
              Updating cached sites...
            </div>
          )}

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
                    const gradient = BRAND_GRADIENTS[index % BRAND_GRADIENTS.length]
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
                                <i className="bx bx-map-pin text-[22px]" />
                              </div>
                            </div>

                            <p
                              className="mt-3 text-sm font-semibold leading-6"
                              style={{ color: BRAND.muted }}
                            >
                              Open nodes, RTD details, and export report data.
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
                              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black transition group-hover:text-white"
                              style={{
                                backgroundColor: BRAND.soft,
                                color: BRAND.blue,
                              }}
                            >
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
      )}

      {/* Selected Site Screen */}
      {selectedArea && (
        <>
          {/* Stats cards */}
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
                    icon: 'bx bx-git-branch',
                    accent: BRAND_GRADIENTS[0],
                  },
                  {
                    label: 'Completed',
                    value: nodeStats.completed,
                    icon: 'bx bx-check-circle',
                    accent: 'linear-gradient(135deg, #059669, #0d9488)',
                  },
                  {
                    label: 'In Progress',
                    value: nodeStats.inProgress,
                    icon: 'bx bx-loader-circle',
                    accent: BRAND_GRADIENTS[2],
                  },
                  {
                    label: 'Pending',
                    value: nodeStats.pending,
                    icon: 'bx bx-time-five',
                    accent: 'linear-gradient(135deg, #ea580c, #f59e0b)',
                  },
                  {
                    label: 'Recovery',
                    value: `${nodeStats.recovery}%`,
                    icon: 'bx bx-trending-up',
                    accent:
                      nodeStats.recovery >= 90
                        ? 'linear-gradient(135deg, #059669, #0d9488)'
                        : nodeStats.recovery >= 70
                          ? 'linear-gradient(135deg, #ea580c, #f59e0b)'
                          : 'linear-gradient(135deg, #e11d48, #be185d)',
                  },
                ].map(card => (
                  <div
                    key={card.label}
                    className="rounded-[20px] bg-white p-4"
                    style={{
                      border: `1px solid ${BRAND.border}`,
                      boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="text-[10px] font-black uppercase tracking-[0.16em]"
                          style={{ color: BRAND.muted2 }}
                        >
                          {card.label}
                        </p>

                        <p
                          className="mt-2 truncate font-mono text-[28px] font-black leading-none"
                          style={{ color: BRAND.textDark }}
                        >
                          {card.value}
                        </p>
                      </div>

                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                        style={{ background: card.accent }}
                      >
                        <i className={`${card.icon} text-[22px]`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Toolbar */}
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
              {nodesRefreshing && (
                <span
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:inline-flex"
                  style={{
                    backgroundColor: BRAND.soft,
                    color: BRAND.blue,
                    border: `1px solid ${BRAND.borderStrong}`,
                  }}
                >
                  <i className="bx bx-refresh animate-spin text-sm" />
                  Updating cache...
                </span>
              )}

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
              className="overflow-hidden rounded-[20px] bg-white"
              style={{
                border: `1px solid ${BRAND.border}`,
                boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
              }}
            >
              <div
                className="flex items-center justify-between gap-3 border-b px-4 py-3"
                style={{ borderColor: BRAND.border }}
              >
                <div>
                  <p
                    className="text-[10px] font-black uppercase tracking-[0.16em]"
                    style={{ color: BRAND.muted2 }}
                  >
                    RTD Nodes
                  </p>

                  <h3 className="mt-1 text-lg font-black" style={{ color: BRAND.textDark }}>
                    {selectedArea.name}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={exportSelectedSiteNodes}
                  disabled={nodes.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background:
                      nodes.length === 0
                        ? '#94a3b8'
                        : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
                    color: '#ffffff',
                  }}
                >
                  <i className="bx bx-download text-sm" />
                  Export Excel
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr style={{ background: BRAND.blue }}>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        #
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Node
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Progress
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Expected
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Collected
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Recovery
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredNodes.map((node, index) => {
                      const status = nodeStatusStyle(node.status)
                      const progress = Math.min(100, Math.round(node.progress_percentage ?? 0))
                      const expected = Number(node.expected_cable ?? 0)
                      const collected = Number(node.actual_cable ?? 0)
                      const recovery = expected > 0 ? Math.round((collected / expected) * 100) : 0

                      return (
                        <tr
                          key={node.id}
                          onClick={() => navigate(`/reports/rtd/${node.id}`)}
                          className="cursor-pointer transition hover:bg-[#F8F9FF]"
                          style={{
                            backgroundColor: index % 2 === 0 ? '#ffffff' : BRAND.softer,
                          }}
                        >
                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <span className="text-xs font-bold" style={{ color: BRAND.muted2 }}>
                              {index + 1}
                            </span>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <div className="text-center">
                              {node.full_label && (
                                <p
                                  className="text-[10px] font-black uppercase tracking-[0.12em]"
                                  style={{ color: BRAND.blue }}
                                >
                                  {node.full_label}
                                </p>
                              )}

                              <p
                                className="mt-1 text-base font-black leading-tight"
                                style={{ color: BRAND.textDark }}
                              >
                                {node.name}
                              </p>

                              <p
                                className="mt-1 text-xs font-semibold"
                                style={{ color: BRAND.muted2 }}
                              >
                                {node.area?.name ?? selectedArea.name}
                              </p>
                            </div>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
                              style={{
                                backgroundColor: status.soft,
                                color: status.text,
                                border: `1px solid ${status.border}`,
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: status.dot }}
                              />
                              {nodeStatusLabel(node.status)}
                            </span>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <div className="mx-auto w-full max-w-[130px]">
                              <div
                                className="overflow-hidden rounded-full"
                                style={{
                                  backgroundColor: '#ECEEFF',
                                  border: `1px solid ${BRAND.border}`,
                                }}
                              >
                                <div
                                  className="flex h-[8px] items-center justify-end rounded-full transition-all duration-700"
                                  style={{
                                    width: progress === 0 ? '6px' : `${progress}%`,
                                    minWidth: progress > 0 ? '26px' : '6px',
                                    background: status.bar,
                                  }}
                                >
                                  {progress >= 25 && (
                                    <span className="pr-1 font-mono text-[8px] font-black leading-none text-white">
                                      {progress}%
                                    </span>
                                  )}
                                </div>
                              </div>

                              {progress < 25 && (
                                <p
                                  className="mt-1 text-center text-[9px] font-black"
                                  style={{ color: BRAND.muted2 }}
                                >
                                  {progress}%
                                </p>
                              )}
                            </div>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <p className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>
                              {fmt(expected)}
                            </p>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <p className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>
                              {fmt(collected)}
                            </p>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black"
                              style={{
                                backgroundColor:
                                  recovery >= 90
                                    ? '#ecfdf5'
                                    : recovery >= 70
                                      ? '#fffbeb'
                                      : '#fef2f2',
                                color:
                                  recovery >= 90
                                    ? '#047857'
                                    : recovery >= 70
                                      ? '#b45309'
                                      : '#b91c1c',
                              }}
                            >
                              {recovery}%
                            </span>
                          </td>

                          <td
                            className="border-b px-4 py-3 text-center align-middle"
                            style={{ borderColor: '#ECEEFF' }}
                          >
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                navigate(`/reports/rtd/${node.id}`)
                              }}
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-black"
                              style={{
                                backgroundColor: BRAND.soft,
                                color: BRAND.blue,
                              }}
                            >
                              View
                              <i className="bx bx-right-arrow-alt text-sm" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr style={{ backgroundColor: BRAND.panel }}>
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em]"
                        style={{ color: BRAND.muted }}
                      >
                        Totals
                      </td>

                      <td
                        className="px-4 py-3 text-center font-mono text-sm font-black"
                        style={{ color: BRAND.textDark }}
                      >
                        {fmt(nodeStats.expected)}
                      </td>

                      <td
                        className="px-4 py-3 text-center font-mono text-sm font-black"
                        style={{ color: BRAND.textDark }}
                      >
                        {fmt(nodeStats.collected)}
                      </td>

                      <td
                        className="px-4 py-3 text-center font-mono text-sm font-black"
                        style={{ color: BRAND.textDark }}
                      >
                        {nodeStats.recovery}%
                      </td>

                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}