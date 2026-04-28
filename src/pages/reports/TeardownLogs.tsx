import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, API_BASE } from '../../lib/auth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeardownLog {
  id: number
  team: string | null
  status: string
  collected_cable: number
  expected_cable_snapshot: number
  did_collect_all_cable: boolean
  offline_mode: boolean
  submitted_by: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  node: { node_id: string; node_name: string | null; city: string | null } | null
  project: { name: string } | null
  pole_span: {
    id: number
    span_code: string
    from_pole: { pole_code: string } | null
    to_pole:   { pole_code: string } | null
  } | null
  images: Array<{ id: number; photo_type: string; image_path: string }> | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function collectionPct(log: TeardownLog) {
  if (!log.expected_cable_snapshot || log.expected_cable_snapshot === 0) return null
  return Math.round((log.collected_cable / log.expected_cable_snapshot) * 100)
}

function pctBadge(pct: number) {
  if (pct >= 100) return { bg: 'bg-green-500/15 text-green-600 dark:text-green-400',  label: `${pct}%` }
  if (pct >= 80)  return { bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',    label: `${pct}%` }
  return              { bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',  label: `${pct}%` }
}

function imgUrl(path: string) {
  return `${API_BASE}/api/files/${path}`
}

const THUMB_TYPES = ['from_before', 'to_before', 'from_tag']

// ── Component ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'tdlogs_list'

export default function TeardownLogs() {
  const navigate = useNavigate()

  const cached = sessionStorage.getItem(CACHE_KEY)
  const initial: TeardownLog[] = cached ? JSON.parse(cached) : []

  const [logs, setLogs]       = useState<TeardownLog[]>(initial)
  const [loading, setLoading] = useState(initial.length === 0)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    fetch(`${API_BASE}/api/v1/teardown-logs`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
          setLogs(data)
        } else if (initial.length === 0) {
          setError('Unexpected response')
        }
      })
      .catch(() => { if (initial.length === 0) setError('Failed to load teardown logs') })
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
      {loading && (
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
          <div className="text-center">
            <i data-feather="alert-circle" className="mx-auto mb-2 text-red-400" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      )}

      {/* Card grid */}
      {!loading && !error && logs.length === 0 && (
        <div className="text-center py-24 text-gray-400 dark:text-zinc-500 text-sm">No teardown logs found.</div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {logs.map(log => {
            const pct   = collectionPct(log)
            const badge = pct !== null ? pctBadge(pct) : null
            const from  = log.pole_span?.from_pole?.pole_code ?? '—'
            const to    = log.pole_span?.to_pole?.pole_code   ?? '—'
            const span  = log.pole_span?.span_code ?? `Log #${log.id}`

            const thumbs = THUMB_TYPES.map(type =>
              log.images?.find(img => img.photo_type === type) ?? null
            )

            return (
              <div
                key={log.id}
                onClick={() => navigate(`/reports/teardown-logs/${log.id}`)}
                className="card dark:bg-zinc-800 dark:border-zinc-700 cursor-pointer hover:ring-2 hover:ring-violet-400/60 hover:shadow-lg hover:shadow-violet-500/10 transition-all group"
              >
                {/* Thumbnail strip */}
                <div className="grid grid-cols-3 gap-0.5 rounded-t-[inherit] overflow-hidden" style={{ height: 88 }}>
                  {thumbs.map((img, i) => (
                    <div key={i} className="bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                      {img
                        ? <img src={imgUrl(img.image_path)} alt={img.photo_type}
                            className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <svg className="text-gray-300 dark:text-zinc-600 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M9.75 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                            </svg>
                          </div>
                      }
                    </div>
                  ))}
                </div>

                {/* Card body */}
                <div className="p-3.5">
                  {/* Span + poles */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono text-violet-500 font-semibold group-hover:underline truncate">{span}</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 mt-0.5">
                        {from} <span className="text-gray-400 dark:text-zinc-500 font-normal mx-1">→</span> {to}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0 mt-0.5">{timeAgo(log.created_at)}</span>
                  </div>

                  {/* Node info */}
                  {log.node && (
                    <div className="mb-2.5">
                      <p className="text-[11px] font-semibold text-gray-600 dark:text-zinc-300 truncate">{log.node.node_id}{log.node.node_name ? ` — ${log.node.node_name}` : ''}</p>
                      {log.node.city && <p className="text-[10px] text-gray-400 dark:text-zinc-500 truncate">{log.node.city}</p>}
                    </div>
                  )}

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-1.5">
                    {/* Cable collected */}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
                      {log.collected_cable}m cable
                    </span>

                    {/* Submitted by */}
                    {log.submitted_by && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 truncate max-w-30">
                        {log.submitted_by}
                      </span>
                    )}

                    {/* Collection % */}
                    {badge && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg}`}>
                        {badge.label}
                      </span>
                    )}

                    {/* Offline */}
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
