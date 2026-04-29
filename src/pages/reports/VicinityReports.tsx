import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

interface Area { id: number; name: string; nodes_count?: number }

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

function headers() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' }
}

function statusColor(s: string) {
  if (s === 'completed')   return { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' }
  if (s === 'in_progress') return { dot: 'bg-violet-500',  text: 'text-violet-600',  bg: 'bg-violet-50 dark:bg-violet-500/10'  }
  return                          { dot: 'bg-amber-400',   text: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-500/10'   }
}
function statusLabel(s: string) {
  if (s === 'completed')   return 'Completed'
  if (s === 'in_progress') return 'In Progress'
  return 'Pending'
}

const gradients = [
  'from-blue-500 to-cyan-500', 'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
  'from-rose-500 to-pink-500', 'from-indigo-500 to-blue-600',
]

export default function VicinityReports() {
  const navigate = useNavigate()
  const [areas, setAreas]               = useState<Area[]>(() => cacheGet<Area[]>('vic_areas') ?? [])
  const [areasLoading, setAreasLoading] = useState(true)
  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [nodes, setNodes]               = useState<SkycableNode[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [search, setSearch]             = useState('')

  useEffect(() => {
    const hit = cacheGet<Area[]>('vic_areas')
    if (hit) { setAreas(hit); setAreasLoading(false) }
    fetch(`${SKYCABLE_API}/areas`, { headers: headers() })
      .then(r => r.json())
      .then(data => { const list = Array.isArray(data) ? data : (data?.data ?? []); cacheSet('vic_areas', list); setAreas(list) })
      .catch(() => {})
      .finally(() => setAreasLoading(false))
  }, [])

  function selectArea(area: Area) {
    setSelectedArea(area); setSearch(''); setNodes([])
    const key = `vic_nodes_${area.id}`
    const hit = cacheGet<SkycableNode[]>(key)
    if (hit) setNodes(hit)
    setNodesLoading(true)
    fetch(`${SKYCABLE_API}/nodes?area_id=${area.id}`, { headers: headers() })
      .then(r => r.json())
      .then(data => { const list = Array.isArray(data) ? data : (data?.data ?? []); cacheSet(key, list); setNodes(list) })
      .catch(() => {})
      .finally(() => setNodesLoading(false))
  }

  const filtered = search.trim()
    ? nodes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()) || (n.full_label ?? '').toLowerCase().includes(search.toLowerCase()))
    : nodes

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="relative overflow-hidden rounded-[28px] bg-[#0d1117] px-6 py-8 shadow-2xl border border-white/5">
        <div className="pointer-events-none absolute -left-10 -top-10 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-sky-400 ring-1 ring-sky-500/25 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              Reports
            </span>
            <h2 className="text-3xl font-black tracking-tight text-white">Vicinity Maps</h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              {selectedArea ? `Showing nodes under ${selectedArea.name}` : 'Select a site to view pole vicinity maps per node.'}
            </p>
          </div>
          {selectedArea && (
            <button onClick={() => { setSelectedArea(null); setNodes([]) }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/10 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              All Sites
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Area cards */}
      {!selectedArea && (
        areasLoading && areas.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {areas.map((area, i) => (
              <button key={area.id} onClick={() => selectArea(area)}
                className="group text-left rounded-[22px] border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-sky-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-sky-500/40">
                <div className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${gradients[i % gradients.length]} flex items-center justify-center mb-3 shadow-sm`}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <p className="text-base font-black text-zinc-900 dark:text-zinc-100 leading-tight">{area.name}</p>
                {area.nodes_count != null && (
                  <p className="mt-1 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">{area.nodes_count} nodes</p>
                )}
                <p className="mt-3 text-xs font-bold text-sky-500 group-hover:underline">View map →</p>
              </button>
            ))}
          </div>
        )
      )}

      {/* Step 2: Nodes table */}
      {selectedArea && (
        <>
          <div className="relative max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input type="text" placeholder="Search node…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          </div>

          {nodesLoading && nodes.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-zinc-400 text-sm">
              {search ? 'No nodes match your search.' : 'No nodes found in this site.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                    <th className="w-10 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4]">#</th>
                    {['Node', 'Status', 'Progress', 'Cable Exp (m)', 'Collected (m)', ''].map(h => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4] text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((node, idx) => {
                    const sc  = statusColor(node.status)
                    const pct = Math.min(100, Math.round(node.progress_percentage ?? 0))
                    return (
                      <tr key={node.id} onClick={() => navigate(`/reports/vicinity/${node.id}`)}
                        className="group border-b border-[#f0f5ff] transition-colors last:border-0 hover:bg-sky-50/50 dark:border-[#19304d]/60 dark:hover:bg-sky-900/10 cursor-pointer">
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-[11px] font-bold tabular-nums text-[#b0c8e8]">{idx + 1}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-900/30">
                              <svg className="w-4 h-4 text-sky-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                              </svg>
                            </div>
                            <div>
                              {node.full_label && <p className="text-[10px] font-black uppercase tracking-wider text-sky-600 font-mono leading-none mb-0.5">{node.full_label}</p>}
                              <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{node.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {statusLabel(node.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
                              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-violet-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] font-bold tabular-nums text-zinc-500 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-[12px] text-zinc-500 tabular-nums">{Number(node.expected_cable ?? 0).toFixed(1)}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-100 tabular-nums">{Number(node.actual_cable ?? 0).toFixed(1)}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-[11px] font-bold text-sky-500 group-hover:underline whitespace-nowrap">View Map →</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/60">
                    <td colSpan={4} className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-zinc-500">Totals</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] font-bold text-zinc-600 tabular-nums">
                      {filtered.reduce((s, n) => s + Number(n.expected_cable ?? 0), 0).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] font-black text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {filtered.reduce((s, n) => s + Number(n.actual_cable ?? 0), 0).toFixed(1)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
