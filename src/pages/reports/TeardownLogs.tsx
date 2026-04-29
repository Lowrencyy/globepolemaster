import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeardownLog {
  id: number
  span_id: number
  team_id: number | null
  lineman_id: number
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  expected_cable: number
  actual_cable: number
  status: string
  offline_mode: boolean
  notes: string | null
  created_at: string
  span: {
    id: number
    span_code: string | null
    length_meters: number | string
    status: string
    node: { id: number; name: string } | null
  } | null
  team: { id: number; name: string } | null
  lineman: { id: number; first_name: string; last_name: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function collectionPct(log: TeardownLog) {
  if (!log.expected_cable || log.expected_cable === 0) return null
  return Math.round((log.actual_cable / log.expected_cable) * 100)
}

function pctBadge(pct: number) {
  if (pct >= 100) return { bg: 'bg-green-500/15 text-green-600 dark:text-green-400',  label: `${pct}%` }
  if (pct >= 80)  return { bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',    label: `${pct}%` }
  return              { bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',  label: `${pct}%` }
}

function statusColor(status: string) {
  switch (status) {
    case 'backend_approved': return 'bg-green-500/15 text-green-600 dark:text-green-400'
    case 'subcon_approved':  return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'submitted':        return 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
    case 'rejected':         return 'bg-red-500/15 text-red-600 dark:text-red-400'
    default:                 return 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'tdlogs_list'

export default function TeardownLogs() {
  const navigate = useNavigate()

  const [logs, setLogs]       = useState<TeardownLog[]>(() => cacheGet<TeardownLog[]>(CACHE_KEY) ?? [])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const hit = cacheGet<TeardownLog[]>(CACHE_KEY)
    if (hit) { setLogs(hit); setLoading(false) }

    fetch(`${SKYCABLE_API}/teardowns`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
    })
      .then(r => r.json())
      .then(data => {
        const list: TeardownLog[] = Array.isArray(data) ? data : (data?.data ?? [])
        cacheSet(CACHE_KEY, list)
        setLogs(list)
      })
      .catch(() => { if (!cacheGet(CACHE_KEY)) setError('Failed to load teardown logs') })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="md:flex items-center justify-between px-0.5">
        <div>
          <h4 className="text-[18px] font-bold text-gray-800 dark:text-gray-100">Teardown Logs</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Live feed of all field teardown submissions</p>
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-1.5 rounded-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live Feed
          </span>
          <span className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-700 px-3 py-1.5 rounded-xl font-medium">
            {logs.length} records
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && logs.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500 dark:text-zinc-400">Loading teardown logs…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && logs.length === 0 && (
        <div className="text-center py-24 text-gray-400 dark:text-zinc-500 text-sm">No teardown logs found.</div>
      )}

      {/* Card grid */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {logs.map(log => {
            const pct    = collectionPct(log)
            const badge  = pct !== null ? pctBadge(pct) : null
            const span   = log.span?.span_code ?? `Log #${log.id}`
            const lineman = log.lineman
              ? `${log.lineman.first_name} ${log.lineman.last_name}`
              : null

            return (
              <div
                key={log.id}
                onClick={() => navigate(`/reports/teardown-logs/${log.id}`)}
                className="card dark:bg-zinc-800 dark:border-zinc-700 cursor-pointer hover:ring-2 hover:ring-violet-400/60 hover:shadow-lg hover:shadow-violet-500/10 transition-all group"
              >
                {/* Photo placeholder strip */}
                <div className="h-[88px] rounded-t-[inherit] bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center overflow-hidden">
                  <svg className="text-zinc-300 dark:text-zinc-600 w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M9.75 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                  </svg>
                </div>

                {/* Card body */}
                <div className="p-3.5">
                  {/* Span code + timestamp */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-[11px] font-mono text-violet-500 font-semibold group-hover:underline truncate">{span}</p>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0 mt-0.5">{timeAgo(log.created_at)}</span>
                  </div>

                  {/* Node */}
                  {log.span?.node && (
                    <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 mb-2 truncate">{log.span.node.name}</p>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
                      {log.actual_cable}m cable
                    </span>

                    {lineman && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 truncate max-w-30">
                        {lineman}
                      </span>
                    )}

                    {badge && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg}`}>
                        {badge.label}
                      </span>
                    )}

                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(log.status)}`}>
                      {log.status.replace(/_/g, ' ')}
                    </span>

                    {log.offline_mode && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        Offline
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
