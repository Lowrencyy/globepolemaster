import { useEffect, useState } from 'react'
import { API_BASE } from '../lib/auth'

type CompanyStatus = {
  active: boolean
  message: string | null
  started_at: string | null
  set_by: string | null
}

type MaintenanceData = {
  any_active: boolean
  companies: {
    skycable: CompanyStatus
    globe: CompanyStatus
    meralco: CompanyStatus
  }
}

const COMPANY_CFG = {
  skycable: {
    name: 'SkyCable',
    color: '#2563eb',
    bg: 'from-blue-900 to-slate-900',
    accent: 'bg-blue-500',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
    icon: '📡',
    route: '/sites',
  },
  globe: {
    name: 'Globe',
    color: '#16a34a',
    bg: 'from-green-900 to-slate-900',
    accent: 'bg-green-500',
    border: 'border-green-500/30',
    text: 'text-green-300',
    icon: '🌐',
    route: '/nap/boxes',
  },
  meralco: {
    name: 'Meralco',
    color: '#d97706',
    bg: 'from-amber-900 to-slate-900',
    accent: 'bg-amber-500',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
    icon: '⚡',
    route: '/meralco',
  },
} as const

type CompanyKey = keyof typeof COMPANY_CFG

function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`
}

export default function MaintenancePage() {
  const [data, setData] = useState<MaintenanceData | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/maintenance`)
      const json = await res.json()
      setData(json)
    } catch {}
  }

  useEffect(() => {
    fetchStatus()
    const iv = setInterval(fetchStatus, 60_000) // recheck every 1 min
    return () => clearInterval(iv)
  }, [])

  if (!data) return null

  const activeCompanies = (Object.keys(COMPANY_CFG) as CompanyKey[])
    .filter(k => data.companies[k]?.active)

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 px-4 overflow-y-auto py-10">

      {/* Background grid */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Animated top bar */}
      <div className="fixed top-0 left-0 right-0 h-1 overflow-hidden">
        <div className="h-full w-full animate-pulse" style={{ background: 'linear-gradient(90deg,#2563eb,#16a34a,#d97706,#2563eb)', backgroundSize: '200%' }} />
      </div>

      <div className="relative w-full max-w-2xl">

        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-4xl backdrop-blur">
            🔧
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">System Maintenance</h1>
          <p className="mt-2 text-slate-400 text-sm">
            Our team is currently working on improvements. Services listed below are temporarily unavailable.
          </p>
        </div>

        {/* Company cards */}
        <div className="flex flex-col gap-4">
          {(Object.keys(COMPANY_CFG) as CompanyKey[]).map(key => {
            const cfg    = COMPANY_CFG[key]
            const status = data.companies[key]
            const active = status?.active

            return (
              <div
                key={key}
                className={`relative overflow-hidden rounded-2xl border backdrop-blur-sm transition ${
                  active
                    ? `${cfg.border} bg-white/5`
                    : 'border-white/5 bg-white/[0.02] opacity-60'
                }`}
              >
                {/* Status bar */}
                {active && (
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.accent} animate-pulse`} />
                )}

                <div className="flex items-start gap-4 p-5">
                  {/* Icon */}
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
                    active ? 'bg-white/10' : 'bg-white/5'
                  }`}>
                    {cfg.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-base">{cfg.name}</span>
                      {active ? (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cfg.text} bg-white/10`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.accent} animate-pulse`} />
                          Under Maintenance
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Operational
                        </span>
                      )}
                    </div>

                    {active && status.message && (
                      <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{status.message}</p>
                    )}

                    {active && status.started_at && (
                      <p className="mt-1 text-xs text-slate-500">
                        Started {timeSince(status.started_at)}
                        {status.set_by ? ` · by ${status.set_by}` : ''}
                      </p>
                    )}

                    {!active && (
                      <p className="mt-1 text-xs text-slate-500">All systems running normally</p>
                    )}
                  </div>

                  {/* Action button */}
                  <div className="shrink-0">
                    {active ? (
                      <button
                        disabled
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-500 cursor-not-allowed"
                      >
                        Unavailable
                      </button>
                    ) : (
                      <a
                        href={cfg.route}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition hover:opacity-90`}
                        style={{ backgroundColor: cfg.color }}
                      >
                        Open {cfg.name}
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-600">
            Auto-refreshes every minute. Contact your administrator for updates.
          </p>
          <button
            onClick={fetchStatus}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0119 5" />
            </svg>
            Check again
          </button>
        </div>
      </div>
    </div>
  )
}
