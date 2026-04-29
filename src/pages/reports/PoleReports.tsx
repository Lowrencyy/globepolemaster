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
  if (status === 'completed') return { dot: '#10b981', text: '#047857', soft: '#ecfdf5', border: '#a7f3d0' }
  if (status === 'in_progress') return { dot: BRAND.blue, text: BRAND.blue, soft: BRAND.soft, border: BRAND.borderStrong }
  return { dot: '#f59e0b', text: '#b45309', soft: '#fffbeb', border: '#fde68a' }
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'In Progress'
  return 'Pending'
}

export default function PoleReports() {
  const navigate = useNavigate()

  const [areas, setAreas] = useState<Area[]>(() => cacheGet<Area[]>('pr_areas') ?? [])
  const [areasLoading, setAreasLoading] = useState(() => !cacheGet<Area[]>('pr_areas'))
  const [areasRefreshing, setAreasRefreshing] = useState(false)

  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [nodes, setNodes] = useState<SkycableNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const hit = cacheGet<Area[]>('pr_areas')
    if (hit) { setAreas(hit); setAreasLoading(false); setAreasRefreshing(true) }
    else setAreasLoading(true)

    fetch(`${SKYCABLE_API}/areas`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        const list: Area[] = Array.isArray(d) ? d : d?.data ?? []
        cacheSet('pr_areas', list)
        setAreas(list)
      })
      .catch(() => {})
      .finally(() => { setAreasLoading(false); setAreasRefreshing(false) })
  }, [])

  function selectArea(area: Area) {
    setSelectedArea(area)
    setSearch('')
    const key = `pr_nodes_${area.id}`
    const hit = cacheGet<SkycableNode[]>(key)
    if (hit) { setNodes(hit); setNodesLoading(false); setNodesRefreshing(true) }
    else { setNodes([]); setNodesLoading(true); setNodesRefreshing(false) }

    fetch(`${SKYCABLE_API}/nodes?area_id=${area.id}`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        const list: SkycableNode[] = Array.isArray(d) ? d : d?.data ?? []
        cacheSet(key, list)
        setNodes(list)
      })
      .catch(() => {})
      .finally(() => { setNodesLoading(false); setNodesRefreshing(false) })
  }

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      (n.full_label ?? '').toLowerCase().includes(q)
    )
  }, [nodes, search])

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
        <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(46,55,145,0.12)' }} />
        <div className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(68,80,196,0.12)' }} />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ backgroundColor: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND.blue }} />
              Pole Reports
            </span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]" style={{ color: BRAND.blue }}>
              {selectedArea ? selectedArea.name : 'All Sites'}
            </h2>
            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>
              {selectedArea
                ? 'Before & after pole photos by node.'
                : 'Select a site to view pole photo reports by node.'}
            </p>
          </div>

          {selectedArea && (
            <button
              type="button"
              onClick={() => { setSelectedArea(null); setNodes([]) }}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold"
              style={{ background: '#ffffff', border: `1px solid ${BRAND.borderStrong}`, color: BRAND.dark }}
            >
              <i className="bx bx-arrow-back text-base" />
              All Sites
            </button>
          )}
        </div>
      </div>

      {/* Sites grid */}
      {!selectedArea && (
        <>
          {areasRefreshing && areas.length > 0 && (
            <div className="inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
              style={{ backgroundColor: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
              <i className="bx bx-refresh animate-spin text-sm" /> Updating cached sites...
            </div>
          )}

          {areasLoading && areas.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }} />
                <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>Loading sites...</p>
              </div>
            </div>
          ) : areas.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] bg-white py-20"
              style={{ color: BRAND.muted2, border: `1px solid ${BRAND.border}` }}>
              <i className="bx bx-map text-5xl" />
              <p className="mt-3 text-sm font-semibold">No sites found.</p>
            </div>
          ) : (
            <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {areas.map((area, i) => {
                  const gradient = GRADIENTS[i % GRADIENTS.length]
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => selectArea(area)}
                      className="group relative overflow-hidden rounded-[22px] bg-white p-5 text-left transition duration-300 hover:-translate-y-1"
                      style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
                    >
                      <div className="absolute inset-x-0 top-0 h-1" style={{ background: gradient }} />
                      <div className="relative flex min-h-[160px] flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>Site {i + 1}</p>
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: gradient }}>
                              <i className="bx bx-camera text-[18px]" />
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-2 text-lg font-black leading-tight tracking-[-0.04em]" style={{ color: BRAND.textDark }}>
                            {area.name}
                          </p>
                        </div>
                        <div className="mt-4 flex items-end justify-between border-t pt-3" style={{ borderColor: BRAND.border }}>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>Nodes</p>
                            <p className="mt-0.5 font-mono text-2xl font-black leading-none" style={{ color: BRAND.textDark }}>
                              {area.nodes_count ?? 0}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-black"
                            style={{ backgroundColor: BRAND.soft, color: BRAND.blue }}>
                            View <i className="bx bx-right-arrow-alt text-sm" />
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

      {/* Nodes list */}
      {selectedArea && (
        <>
          {/* Search */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white p-3"
            style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
          >
            <div className="relative min-w-[260px] max-w-md flex-1">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-[#8E96C5]" />
              <input
                type="text"
                placeholder="Search node name or label..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-sm font-semibold outline-none"
                style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textDark }}
              />
            </div>
            <div className="flex items-center gap-2">
              {nodesRefreshing && (
                <span className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:inline-flex"
                  style={{ backgroundColor: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
                  <i className="bx bx-refresh animate-spin text-sm" /> Updating cache...
                </span>
              )}
              <span className="rounded-xl px-3 py-2 text-xs font-black"
                style={{ backgroundColor: BRAND.softer, color: BRAND.muted, border: `1px solid ${BRAND.border}` }}>
                {filteredNodes.length} nodes
              </span>
            </div>
          </div>

          {/* Node cards */}
          {nodesLoading && nodes.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }} />
                <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>Loading nodes...</p>
              </div>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] bg-white py-20"
              style={{ color: BRAND.muted2, border: `1px solid ${BRAND.border}` }}>
              <i className="bx bx-search-alt text-5xl" />
              <p className="mt-3 text-sm font-semibold">
                {search ? 'No nodes match your search.' : 'No nodes found in this site.'}
              </p>
            </div>
          ) : (
            <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredNodes.map((node, i) => {
                  const s = statusStyle(node.status)
                  const pct = Math.min(100, Math.round(node.progress_percentage ?? 0))
                  const gradient = GRADIENTS[i % GRADIENTS.length]

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => navigate(`/reports/pole-reports/${node.id}`)}
                      className="group relative overflow-hidden rounded-[22px] bg-white p-5 text-left transition duration-300 hover:-translate-y-1"
                      style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}
                    >
                      <div className="absolute inset-x-0 top-0 h-1" style={{ background: gradient }} />
                      <div className="relative flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {node.full_label && (
                              <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: BRAND.blue }}>
                                {node.full_label}
                              </p>
                            )}
                            <p className="mt-1 text-lg font-black leading-tight tracking-[-0.03em]" style={{ color: BRAND.textDark }}>
                              {node.name}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black"
                            style={{ backgroundColor: s.soft, color: s.text, border: `1px solid ${s.border}` }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
                            {statusLabel(node.status)}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: BRAND.muted2 }}>Progress</span>
                            <span className="text-[10px] font-black" style={{ color: BRAND.textDark }}>{pct}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: BRAND.soft }}>
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${pct}%`,
                                background: pct >= 100 ? 'linear-gradient(90deg,#10b981,#14b8a6)' : gradient,
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: BRAND.border }}>
                          <span className="text-xs font-semibold" style={{ color: BRAND.muted }}>
                            {node.area?.name ?? selectedArea.name}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black"
                            style={{ backgroundColor: BRAND.soft, color: BRAND.blue }}>
                            <i className="bx bx-camera text-sm" /> View Photos
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
