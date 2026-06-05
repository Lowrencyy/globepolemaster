import { useCallback, useEffect, useState } from 'react'
import { API_BASE, getToken } from '../lib/auth'

type CompanyKey = 'skycable' | 'globe' | 'meralco'

type CompanyStatus = {
  active: boolean
  message: string | null
  started_at: string | null
  set_by: string | null
}

const COMPANIES: { key: CompanyKey; label: string; icon: string; color: string; ring: string }[] = [
  { key: 'skycable', label: 'SkyCable',  icon: '📡', color: '#2563eb', ring: 'ring-blue-500'  },
  { key: 'globe',    label: 'Globe',     icon: '🌐', color: '#16a34a', ring: 'ring-green-500' },
  { key: 'meralco',  label: 'Meralco',   icon: '⚡', color: '#d97706', ring: 'ring-amber-500' },
]

function timeSince(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export default function MaintenanceControl() {
  const [companies, setCompanies] = useState<Record<CompanyKey, CompanyStatus>>({
    skycable: { active: false, message: null, started_at: null, set_by: null },
    globe:    { active: false, message: null, started_at: null, set_by: null },
    meralco:  { active: false, message: null, started_at: null, set_by: null },
  })
  const [messages, setMessages] = useState<Record<CompanyKey, string>>({
    skycable: '', globe: '', meralco: '',
  })
  const [loading, setLoading] = useState<Record<CompanyKey, boolean>>({
    skycable: false, globe: false, meralco: false,
  })
  const [loadingAll, setLoadingAll] = useState(false)
  const [fetching, setFetching]     = useState(true)

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${getToken()}`,
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/v1/maintenance`)
      const data = await res.json()
      setCompanies(data.companies)
      setMessages({
        skycable: data.companies.skycable?.message ?? '',
        globe:    data.companies.globe?.message    ?? '',
        meralco:  data.companies.meralco?.message  ?? '',
      })
    } catch {}
    finally { setFetching(false) }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const toggle = async (key: CompanyKey, active: boolean) => {
    setLoading(p => ({ ...p, [key]: true }))
    try {
      await fetch(`${API_BASE}/api/v1/admin/maintenance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ company: key, active, message: messages[key] || undefined }),
      })
      await fetchStatus()
    } catch {}
    finally { setLoading(p => ({ ...p, [key]: false })) }
  }

  const toggleAll = async (active: boolean) => {
    setLoadingAll(true)
    try {
      await fetch(`${API_BASE}/api/v1/admin/maintenance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ company: 'all', active }),
      })
      await fetchStatus()
    } catch {}
    finally { setLoadingAll(false) }
  }

  const anyActive = Object.values(companies).some(c => c.active)

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-red-50 via-orange-50/40 to-transparent dark:from-red-950/20" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              🔧 System Control
            </div>
            <h4 className="text-xl font-semibold text-slate-950 dark:text-slate-100">Maintenance Mode</h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Toggle maintenance per company. When active, users see a maintenance screen.
            </p>
          </div>

          {/* Global toggle */}
          <div className="flex items-center gap-3">
            {anyActive && (
              <button
                onClick={() => toggleAll(false)}
                disabled={loadingAll}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                {loadingAll ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" /> : '✅'}
                Lift All
              </button>
            )}
            <button
              onClick={() => toggleAll(true)}
              disabled={loadingAll}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-700 disabled:opacity-50"
            >
              {loadingAll ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : '🔴'}
              All Maintenance
            </button>
          </div>
        </div>
      </div>

      {/* Company cards */}
      {fetching ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COMPANIES.map(({ key, label, icon, color, ring }) => {
            const status = companies[key]
            const isOn   = status.active
            const busy   = loading[key]

            return (
              <div
                key={key}
                className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-slate-900 ${
                  isOn
                    ? 'border-red-200 dark:border-red-800/60'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Top accent bar */}
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: isOn ? '#ef4444' : color }}
                />

                <div className="p-5">
                  {/* Company header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                        style={{ background: `${color}18` }}
                      >
                        {icon}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                        <p className={`text-xs font-semibold ${isOn ? 'text-red-500' : 'text-emerald-500'}`}>
                          {isOn ? '● Under Maintenance' : '● Operational'}
                        </p>
                      </div>
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggle(key, !isOn)}
                      disabled={busy}
                      className={`relative h-7 w-12 rounded-full transition-colors duration-200 focus:outline-none ${
                        isOn ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700'
                      } ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                          isOn ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Active info */}
                  {isOn && status.started_at && (
                    <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                      <span className="font-semibold">Active</span> since {timeSince(status.started_at)}
                      {status.set_by && <span className="text-red-400"> · {status.set_by}</span>}
                      {status.message && <p className="mt-1 text-red-600 dark:text-red-400">"{status.message}"</p>}
                    </div>
                  )}

                  {/* Message input */}
                  <div className="mt-4">
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Maintenance Message
                    </label>
                    <textarea
                      rows={2}
                      value={messages[key]}
                      onChange={e => setMessages(p => ({ ...p, [key]: e.target.value }))}
                      placeholder="e.g. Scheduled downtime. Back at 3PM."
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  {/* Action button */}
                  <button
                    onClick={() => toggle(key, !isOn)}
                    disabled={busy}
                    className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
                      isOn
                        ? 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700'
                        : 'bg-red-600 shadow-red-500/20 hover:bg-red-700'
                    }`}
                  >
                    {busy ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Updating…
                      </span>
                    ) : isOn ? (
                      '✅ Lift Maintenance'
                    ) : (
                      '🔴 Enable Maintenance'
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Live status summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Live Status</p>
        <div className="flex flex-wrap gap-3">
          {COMPANIES.map(({ key, label, icon }) => (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                companies[key].active
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
              <span className={`h-2 w-2 rounded-full ${companies[key].active ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
