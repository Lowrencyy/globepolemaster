import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'

type NodeInfo = {
  id: number
  name: string
  full_label?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  expected_cable?: number
  actual_cable?: number
  progress_percentage?: number
  area?: { id: number; name: string } | null
  region?: string
  province?: string
  city?: string
}

interface SpanComponent {
  component_type: string
  expected_count: number | string
  actual_count: number | string
  unit: string
}

interface TeardownEntry {
  id: number
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  expected_cable: number | string
  actual_cable: number | string
  status: string
  team: { name: string } | null
  lineman: { first_name: string; last_name: string } | null
  span: {
    id: number
    span_code: string | null
    length_meters: number | string
    status: string
    fromPole?: { pole: { pole_code: string } | null } | null
    toPole?:   { pole: { pole_code: string } | null } | null
    components: SpanComponent[]
  } | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', submitted: 'Submitted', subcon_approved: 'Subcon Approved',
  backend_approved: 'Approved', rejected: 'Rejected',
}

const COMP_LABELS: Record<string, string> = {
  node: 'Node Box', amplifier: 'Amplifier', extender: 'Extender',
  tsc: 'TSC', powersupply: 'Power Supply', powersupply_case: 'PS Case',
}

const nodeStatusConfig = {
  pending:     { label: 'Pending',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  in_progress: { label: 'Ongoing',   dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  completed:   { label: 'Completed', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
}

const tdStatusMap: Record<string, string> = {
  backend_approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  subcon_approved:  'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  submitted:        'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  rejected:         'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  pending:          'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
}

function fmt(n: number | string | null | undefined, dec = 2) {
  return Number(n ?? 0).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function workDur(mins: number | null, start: string | null, end: string | null) {
  const m = mins ?? (start && end
    ? Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000))
    : null)
  if (!m) return '—'
  const h = Math.floor(m / 60), rm = m % 60
  return h > 0 ? `${h}h ${rm}m` : `${rm}m`
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

export default function NodeDetail() {
  const { siteSlug = '', nodeSlug = '' } = useParams()
  const navigate = useNavigate()
  const nodeId = idFromSlug(nodeSlug) || Number(nodeSlug)

  const today = new Date().toLocaleDateString('en-CA')
  const [date, setDate] = useState(today)
  const [node, setNode] = useState<NodeInfo | null>(null)
  const [teardowns, setTeardowns] = useState<TeardownEntry[]>([])
  const [nodeLoading, setNodeLoading] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!nodeId) return
    const hitNode = cacheGet<NodeInfo>(`nodedetail_info_${nodeId}`)
    const hitTd   = cacheGet<TeardownEntry[]>(`nodedetail_td_${nodeId}`)
    if (hitNode) { setNode(hitNode); setNodeLoading(false) }
    if (hitTd)   { setTeardowns(hitTd); setLoading(false) }

    Promise.all([
      fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=200`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([nodeData, tdData]) => {
      if (nodeData?.id) { setNode(nodeData); cacheSet(`nodedetail_info_${nodeId}`, nodeData) }
      const list: TeardownEntry[] = Array.isArray(tdData) ? tdData : (tdData?.data ?? [])
      setTeardowns(list)
      cacheSet(`nodedetail_td_${nodeId}`, list)
    }).catch(() => {}).finally(() => { setNodeLoading(false); setLoading(false) })
  }, [nodeId])

  const filtered = date
    ? teardowns.filter(td => {
        const d = td.start_time ? new Date(td.start_time).toLocaleDateString('en-CA') : null
        return d === date
      })
    : teardowns

  const totalCableExp = filtered.reduce((s, t) => s + Number(t.expected_cable ?? 0), 0)
  const totalCableAct = filtered.reduce((s, t) => s + Number(t.actual_cable ?? 0), 0)
  const cablePct      = totalCableExp > 0 ? Math.round((totalCableAct / totalCableExp) * 100) : 0

  const compMap: Record<string, { expected: number; actual: number; unit: string }> = {}
  filtered.forEach(td => {
    (td.span?.components ?? []).forEach(c => {
      if (c.component_type === 'cable') return
      if (!compMap[c.component_type]) compMap[c.component_type] = { expected: 0, actual: 0, unit: c.unit }
      compMap[c.component_type].expected += Number(c.expected_count ?? 0)
      compMap[c.component_type].actual   += Number(c.actual_count ?? 0)
    })
  })

  const displayDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'All Dates'

  const sc = nodeStatusConfig[node?.status ?? 'pending'] ?? nodeStatusConfig.pending

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #node-report-print, #node-report-print * { visibility: visible !important; }
          #node-report-print { position: fixed; inset: 0; padding: 10mm 12mm; }
          .no-print { display: none !important; }
          .report-table th, .report-table td { font-size: 8pt !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="flex flex-col gap-5 pb-10">

        {/* Breadcrumb */}
        <nav className="no-print flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/sites" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
            Site List
          </Link>
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <Link to={`/sites/${siteSlug}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
            {nodeLoading ? '…' : (node?.area?.name ?? 'Site')}
          </Link>
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {nodeLoading ? '…' : (node?.full_label ?? node?.name ?? 'Node')}
          </span>
        </nav>

        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">
              {nodeLoading ? '…' : (node?.full_label ?? node?.name)} — Daily Report
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              {node?.area?.name && <span>{node.area.name}</span>}
              {node?.city && <><span>·</span><span>{node.city}</span></>}
              {node && (
                <>
                  <span>·</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date picker */}
            <div className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <svg className="w-3.5 h-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input
                type="date" value={date} max={today}
                onChange={e => setDate(e.target.value)}
                className="text-sm font-medium text-zinc-700 bg-transparent outline-none dark:text-zinc-200"
              />
              <button onClick={() => setDate('')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 ml-1">
                ALL
              </button>
            </div>

            <button
              onClick={() => navigate(`/sites/${siteSlug}/nodes/${nodeSlug}/poles`)}
              className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <i className="bx bx-map-pin text-base" />
              Poles
            </button>
            <button
              onClick={() => navigate(`/sites/${siteSlug}/nodes/${nodeSlug}/spans`)}
              className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <i className="bx bx-git-branch text-base" />
              Spans
            </button>

            <button
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-2 rounded-2xl bg-[#183153] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f2340]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* Printable report card */}
        <div id="node-report-print" className="bg-white rounded-[20px] border border-zinc-200 shadow-sm overflow-hidden dark:border-zinc-700 dark:bg-zinc-900">

          {/* Dark header */}
          <div style={{ background: '#183153' }} className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300 mb-1">Globe Telecom · Skycable Teardown</p>
                <h2 className="text-2xl font-black text-white tracking-tight">Daily Report</h2>
                <p className="mt-1 text-sm text-blue-200 font-semibold">{displayDate}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Node</p>
                <p className="text-xl font-black text-white">{node?.name ?? `Node #${nodeId}`}</p>
                {node?.full_label && <p className="text-xs font-mono text-blue-300">{node.full_label}</p>}
                {node?.area && <p className="text-xs text-blue-200 mt-0.5">{node.area.name}</p>}
              </div>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-zinc-200 dark:border-zinc-700">
            {[
              { label: 'Teardowns',      value: filtered.length,                                                    color: '#6366f1' },
              { label: 'Approved',       value: filtered.filter(t => t.status === 'backend_approved').length,       color: '#10b981' },
              { label: 'Cable Expected', value: `${fmt(totalCableExp)} m`,                                         color: '#3b82f6' },
              { label: 'Cable Collected',value: `${fmt(totalCableAct)} m`,                                         color: '#0ea5e9' },
              { label: 'Recovery Rate',  value: `${cablePct}%`, color: cablePct >= 90 ? '#10b981' : cablePct >= 70 ? '#f59e0b' : '#ef4444' },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center justify-center gap-0.5 border-r border-zinc-200 dark:border-zinc-700 last:border-r-0 py-4 px-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{s.label}</p>
                <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Teardown table section */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Teardown Activities</p>
          </div>

          {loading && filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400 dark:text-zinc-500">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-semibold">
                No teardown activity{date ? ` on ${new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="report-table w-full border-collapse text-xs">
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    {['#', 'Span Code', 'From Pole', 'To Pole', 'Length (m)', 'Expected (m)', 'Collected (m)', 'Recovery', 'Team', 'Lineman', 'Start', 'End', 'Duration', 'Status'].map(h => (
                      <th key={h} className="border border-[#2d4f7a] px-2 py-2 text-left text-[10px] font-black uppercase tracking-wider text-white whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((td, i) => {
                    const cExp  = Number(td.expected_cable ?? 0)
                    const cAct  = Number(td.actual_cable ?? 0)
                    const pct   = cExp > 0 ? Math.round((cAct / cExp) * 100) : 0
                    const from  = td.span?.fromPole?.pole?.pole_code ?? '—'
                    const to    = td.span?.toPole?.pole?.pole_code   ?? '—'
                    const span  = td.span?.span_code ?? `#${td.id}`
                    const isOdd = i % 2 === 0

                    return (
                      <tr key={td.id} className={isOdd ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/40'}>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center font-bold text-zinc-600 dark:text-zinc-300 w-8">{i + 1}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">{span}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">{from}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">{to}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center text-zinc-600 dark:text-zinc-300">{fmt(td.span?.length_meters, 1)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center text-zinc-600 dark:text-zinc-300">{fmt(cExp)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center font-bold text-zinc-800 dark:text-zinc-100">{fmt(cAct)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center">
                          <span style={{ color: pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444' }} className="font-black">{pct}%</span>
                        </td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{td.team?.name ?? '—'}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                          {td.lineman ? `${td.lineman.first_name} ${td.lineman.last_name}` : '—'}
                        </td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{fmtTime(td.start_time)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{fmtTime(td.end_time)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 text-center text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{workDur(td.duration_minutes, td.start_time, td.end_time)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-2 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tdStatusMap[td.status] ?? tdStatusMap.pending}`}>
                            {STATUS_LABELS[td.status] ?? td.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0f4f8' }} className="dark:bg-zinc-800">
                    <td colSpan={5} className="border border-zinc-300 dark:border-zinc-600 px-2 py-2 font-black text-zinc-700 dark:text-zinc-200 text-right">TOTALS</td>
                    <td className="border border-zinc-300 dark:border-zinc-600 px-2 py-2 text-center font-black text-zinc-700 dark:text-zinc-200">{fmt(totalCableExp)}</td>
                    <td className="border border-zinc-300 dark:border-zinc-600 px-2 py-2 text-center font-black text-zinc-800 dark:text-zinc-100">{fmt(totalCableAct)}</td>
                    <td className="border border-zinc-300 dark:border-zinc-600 px-2 py-2 text-center font-black" style={{ color: cablePct >= 90 ? '#10b981' : cablePct >= 70 ? '#f59e0b' : '#ef4444' }}>{cablePct}%</td>
                    <td colSpan={6} className="border border-zinc-300 dark:border-zinc-600" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Component summary */}
          {Object.keys(compMap).length > 0 && (
            <div className="px-4 pb-4 mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Component Summary</p>
              <table className="report-table w-full border-collapse text-xs max-w-lg">
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    {['Component', 'Expected', 'Collected', 'Status'].map(h => (
                      <th key={h} className="border border-[#2d4f7a] px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-white">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compMap).map(([type, data], i) => {
                    const ok = data.actual >= data.expected
                    return (
                      <tr key={type} className={i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800/40'}>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                          {COMP_LABELS[type] ?? type}
                        </td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-center text-zinc-600 dark:text-zinc-300">
                          {data.expected} {data.unit}
                        </td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-center font-bold text-zinc-800 dark:text-zinc-100">
                          {data.actual} {data.unit}
                        </td>
                        <td className="border border-zinc-200 dark:border-zinc-700 px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400'}`}>
                            {ok ? 'Complete' : `Short ${data.expected - data.actual}`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold">
              Globe Telecom · Skycable Operations
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
