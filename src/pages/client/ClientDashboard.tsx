import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SKYCABLE_API, getToken, getUser } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

type NodeStat = {
  id: number
  name: string
  full_label: string | null
  status: 'pending' | 'in_progress' | 'completed'
  progress_percentage: number | null
  expected_cable: number | null
  actual_cable: number | null
  area?: { id: number; name: string } | null
  subcontractor?: { name: string } | null
  team?: { name: string } | null
}

type TeardownLog = {
  id: number
  status: string
  actual_cable: number
  expected_cable: number
  created_at: string
  span: { id: number; span_code: string | null; node: { id: number; name: string } | null } | null
  lineman: { first_name: string; last_name: string } | null
}

const h = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
})

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const STATUS: Record<string, { label: string; bar: string; badge: string; ring: string }> = {
  pending:     { label: 'Pending',     bar: '#f59e0b', badge: 'bg-amber-50 text-amber-700 border-amber-200',   ring: 'ring-amber-200' },
  in_progress: { label: 'In Progress', bar: '#6366f1', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', ring: 'ring-indigo-200' },
  completed:   { label: 'Completed',   bar: '#10b981', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'ring-emerald-200' },
}

export default function ClientDashboard() {
  const navigate = useNavigate()
  const user = getUser()
  const company = String(user?.company ?? user?.subcontractor_name ?? 'Your Project')

  const [nodes, setNodes]         = useState<NodeStat[]>(() => cacheGet<NodeStat[]>('client_nodes') ?? [])
  const [teardowns, setTeardowns] = useState<TeardownLog[]>(() => cacheGet<TeardownLog[]>('client_td') ?? [])
  const [loading, setLoading]     = useState(!cacheGet<NodeStat[]>('client_nodes'))

  useEffect(() => {
    Promise.all([
      fetch(`${SKYCABLE_API}/nodes?per_page=200`, { headers: h() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/teardowns?per_page=15`, { headers: h() }).then(r => r.json()),
    ]).then(([nd, td]) => {
      const nodeList: NodeStat[] = Array.isArray(nd) ? nd : (nd?.data ?? [])
      const tdList: TeardownLog[] = Array.isArray(td) ? td : (td?.data ?? [])
      setNodes(nodeList)
      setTeardowns(tdList)
      cacheSet('client_nodes', nodeList)
      cacheSet('client_td', tdList)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => ({
    total:      nodes.length,
    completed:  nodes.filter(n => n.status === 'completed').length,
    inProgress: nodes.filter(n => n.status === 'in_progress').length,
    pending:    nodes.filter(n => n.status === 'pending').length,
    pct:        nodes.length > 0
      ? Math.round((nodes.filter(n => n.status === 'completed').length / nodes.length) * 100)
      : 0,
    totalCableExp: nodes.reduce((s, n) => s + (n.expected_cable ?? 0), 0),
    totalCableAct: nodes.reduce((s, n) => s + (n.actual_cable ?? 0), 0),
  }), [nodes])

  const summaryCards = [
    { label: 'Total Nodes',  value: stats.total,      color: '#3b82f6', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', bg: 'bg-blue-50', ring: 'ring-blue-100' },
    { label: 'Completed',    value: stats.completed,  color: '#10b981', icon: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z', bg: 'bg-emerald-50', ring: 'ring-emerald-100' },
    { label: 'In Progress',  value: stats.inProgress, color: '#6366f1', icon: 'M13 10V3L4 14h7v7l9-11h-7z', bg: 'bg-indigo-50', ring: 'ring-indigo-100' },
    { label: 'Pending',      value: stats.pending,    color: '#f59e0b', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', bg: 'bg-amber-50', ring: 'ring-amber-100' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-900">
      {/* Header banner */}
      <div className="relative overflow-hidden border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.07),transparent_50%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.06),transparent_40%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-400">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Client View — Read Only
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Project Overview — {company}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Skycable Cable Teardown Progress · Last updated {new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>

            {/* Overall progress ring */}
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle
                    cx="32" cy="32" r="26" fill="none"
                    stroke="#10b981" strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 26}`}
                    strokeDashoffset={`${2 * Math.PI * 26 * (1 - stats.pct / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-900 dark:text-white">
                  {stats.pct}%
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Overall Completion</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{stats.completed} / {stats.total}</p>
                <p className="text-[11px] text-slate-400">nodes completed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map(c => (
            <div key={c.label} className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800`}>
              <div className="h-1 w-full" style={{ backgroundColor: c.color }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
                    <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
                      {loading ? '—' : c.value}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg} ring-1 ${c.ring}`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={c.color} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cable recovery */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-zinc-700">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Cable Recovery Summary</h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-zinc-700">
            {[
              { label: 'Expected', value: `${stats.totalCableExp.toLocaleString()}m`, color: 'text-slate-800 dark:text-white' },
              { label: 'Recovered', value: `${stats.totalCableAct.toLocaleString()}m`, color: 'text-emerald-600 dark:text-emerald-400' },
              {
                label: 'Recovery Rate',
                value: stats.totalCableExp > 0 ? `${Math.round((stats.totalCableAct / stats.totalCableExp) * 100)}%` : '—',
                color: stats.totalCableExp > 0 && (stats.totalCableAct / stats.totalCableExp) >= 0.9 ? 'text-emerald-600' : 'text-amber-600',
              },
            ].map(s => (
              <div key={s.label} className="px-6 py-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
                <p className={`mt-2 text-2xl font-black ${s.color}`}>{loading ? '—' : s.value}</p>
              </div>
            ))}
          </div>
          {/* Overall cable progress bar */}
          {stats.totalCableExp > 0 && (
            <div className="border-t border-slate-100 px-6 py-4 dark:border-zinc-700">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Cable Progress</span>
                <span>{Math.round((stats.totalCableAct / stats.totalCableExp) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.round((stats.totalCableAct / stats.totalCableExp) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Node list */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-zinc-700">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Node Progress</h2>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-zinc-700 dark:text-zinc-400">{nodes.length} nodes</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                </div>
              ) : nodes.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">No nodes found.</div>
              ) : nodes.map(node => {
                const s = STATUS[node.status] ?? STATUS.pending
                const pct = Math.min(100, node.progress_percentage ?? 0)
                return (
                  <div
                    key={node.id}
                    onClick={() => navigate(`/sites/${node.area?.id ?? ''}/nodes/${node.id}`)}
                    className="cursor-pointer border-b border-slate-50 px-6 py-4 transition last:border-0 hover:bg-slate-50 dark:border-zinc-700/50 dark:hover:bg-zinc-700/30"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-400">{node.full_label ?? `Node #${node.id}`}</p>
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{node.name}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${s.badge}`}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-700" style={{ height: 6 }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: s.bar }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[11px] font-bold" style={{ color: s.bar }}>{pct}%</span>
                    </div>
                    {(node.subcontractor?.name || node.team?.name) && (
                      <div className="mt-2 flex gap-1.5">
                        {node.subcontractor?.name && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">{node.subcontractor.name}</span>
                        )}
                        {node.team?.name && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-zinc-700 dark:text-zinc-400">{node.team.name}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent teardown activity */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-zinc-700">
              <div>
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Recent Teardown Activity</h2>
                <p className="mt-0.5 text-xs text-slate-400">Latest field submissions</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {teardowns.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">No activity yet.</div>
              ) : teardowns.map(log => {
                const statusCls: Record<string, string> = {
                  backend_approved: 'bg-emerald-50 text-emerald-700',
                  subcon_approved:  'bg-blue-50 text-blue-700',
                  submitted:        'bg-violet-50 text-violet-700',
                  rejected:         'bg-red-50 text-red-700',
                }
                const statusLbl: Record<string, string> = {
                  backend_approved: 'Approved', subcon_approved: 'Sub-approved',
                  submitted: 'Submitted', rejected: 'Rejected',
                }
                return (
                  <div key={log.id} className="flex items-start gap-3 border-b border-slate-50 px-6 py-4 last:border-0 dark:border-zinc-700/50">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-black text-slate-500 dark:bg-zinc-700 dark:text-zinc-400">
                      #{log.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {log.span?.span_code ?? `Span #${log.span?.id ?? '—'}`}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {log.span?.node?.name ?? '—'} · {log.actual_cable}m collected
                      </p>
                      {log.lineman && (
                        <p className="text-[11px] text-slate-400">{log.lineman.first_name} {log.lineman.last_name}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls[log.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {statusLbl[log.status] ?? log.status}
                      </span>
                      <p className="mt-1 text-[11px] text-slate-400">{timeAgo(log.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
