import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FieldCoverageMap, { TILE_LAYERS } from '../../components/FieldCoverageMap'
import type { MapView } from '../../components/FieldCoverageMap'
import { getToken, SKYCABLE_API, GLOBE_API } from '../../lib/auth'
import { cacheDel, cacheGet, cacheSet } from '../../lib/cache'

declare const ApexCharts: any

function initCharts() {
  const w = window as any
  const AC = w.ApexCharts ?? (typeof ApexCharts !== 'undefined' ? ApexCharts : null)
  if (!AC) return

  const mini = (id: string, data: number[]) => {
    const el = document.querySelector(id)
    if (!el) return
    ;(el as any)._apexChart?.destroy()
    const c = new AC(el, {
      series: [{ data }],
      chart: { type: 'line', height: 50, sparkline: { enabled: true } },
      colors: ['#5156be'],
      stroke: { curve: 'smooth', width: 2 },
      tooltip: {
        fixed: { enabled: false },
        x: { show: false },
        y: { title: { formatter: () => '' } },
        marker: { show: false },
      },
    })
    c.render()
    ;(el as any)._apexChart = c
  }

  mini('#mini-chart1', [2, 10, 18, 22, 36, 15, 47, 75, 65, 19, 14, 2, 47, 42, 15])
  mini('#mini-chart2', [15, 42, 47, 2, 14, 19, 65, 75, 47, 15, 42, 47, 2, 14, 12])
  mini('#mini-chart3', [47, 15, 2, 67, 22, 20, 36, 60, 60, 30, 50, 11, 12, 3, 8])
  mini('#mini-chart4', [12, 14, 2, 47, 42, 15, 47, 75, 65, 19, 14, 2, 47, 42, 15])

  const napEl = document.querySelector('#nap-slot-chart')
  if (napEl) {
    ;(napEl as any)._apexChart?.destroy()
    const c = new AC(napEl, {
      series: [342, 187, 95],
      chart: { width: 227, height: 227, type: 'pie' },
      labels: ['Active', 'Inactive', 'Free'],
      colors: ['#5156be', '#f46a6a', '#f1b44c'],
      stroke: { width: 0 },
      legend: { show: false },
    })
    c.render()
    ;(napEl as any)._apexChart = c
  }

  const spanEl = document.querySelector('#span-teardown-chart')
  if (spanEl) {
    ;(spanEl as any)._apexChart?.destroy()
    const c = new AC(spanEl, {
      series: [
        { name: 'Completed', data: [14, 22, 18, 30, 25, 40, 35, 28, 42, 38, 50, 44] },
        { name: 'Pending', data: [8, 12, 9, 15, 18, 10, 20, 14, 16, 22, 12, 18] },
      ],
      chart: { type: 'bar', height: 250, stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { columnWidth: '45%', borderRadius: 2 } },
      colors: ['#5156be', '#f46a6a'],
      fill: { opacity: 1 },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'bottom' },
      yaxis: { labels: { formatter: (y: number) => y.toFixed(0) } },
      xaxis: {
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      },
    })
    c.render()
    ;(spanEl as any)._apexChart = c
  }

  const valEl = document.querySelector('#validation-progress-chart')
  if (valEl) {
    ;(valEl as any)._apexChart?.destroy()
    const c = new AC(valEl, {
      chart: { height: 270, type: 'radialBar', offsetY: -10 },
      plotOptions: {
        radialBar: {
          startAngle: -130,
          endAngle: 130,
          dataLabels: {
            name: { show: false },
            value: {
              offsetY: 10,
              fontSize: '18px',
              formatter: (v: number) => v + '%',
            },
          },
        },
      },
      colors: ['#5156be'],
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'dark',
          type: 'horizontal',
          gradientToColors: ['#34c38f'],
          shadeIntensity: 0.15,
          inverseColors: false,
          opacityFrom: 1,
          opacityTo: 1,
          stops: [20, 60],
        },
      },
      stroke: { dashArray: 4 },
      legend: { show: false },
      series: [72],
      labels: ['Approved'],
    })
    c.render()
    ;(valEl as any)._apexChart = c
  }
}

// ── NAP survey API types ──────────────────────────────────────────────────────

interface ApiNapBoxSurvey {
  id: number
  nap_code: string
  port_count: string
  status: 'active' | 'inactive' | 'for_removal'
  updated_at: string
  pole?: {
    pole_code: string
    barangay?: { name: string; city_code: string }
  }
}

interface ApiNapPort {
  port_number: number
  status: 'active' | 'inactive' | 'free'
  subscriber_name: string | null
}

interface NapSurveyRow {
  id: string
  pole: string
  area: string
  total: number
  used: number
  free: number
  inactive: number
  utilization: number
  boxStatus: 'active' | 'inactive' | 'for_removal'
  date: string
}

const validationQueue = [
  {
    id: 'TD-0041',
    submittedBy: 'J. Santos',
    pole: 'PL-8812',
    span: 'SP-1032',
    evidence: { before: true, after: true, tag: true, gps: true },
    date: 'Apr 17, 2026',
  },
  {
    id: 'TD-0035',
    submittedBy: 'R. Cruz',
    pole: 'PL-7210',
    span: 'SP-0901',
    evidence: { before: true, after: true, tag: false, gps: true },
    date: 'Apr 16, 2026',
  },
  {
    id: 'TD-0033',
    submittedBy: 'M. Reyes',
    pole: 'PL-6998',
    span: 'SP-0875',
    evidence: { before: true, after: false, tag: true, gps: true },
    date: 'Apr 15, 2026',
  },
  {
    id: 'TD-0029',
    submittedBy: 'A. Dela Cruz',
    pole: 'PL-6540',
    span: 'SP-0820',
    evidence: { before: true, after: true, tag: true, gps: false },
    date: 'Apr 14, 2026',
  },
]

const surveyBadge: Record<string, string> = {
  active: 'bg-green-500/15 text-green-600 ring-1 ring-green-500/20 dark:text-green-400',
  inactive: 'bg-gray-500/15 text-gray-600 ring-1 ring-gray-500/20 dark:text-gray-400',
  for_removal: 'bg-red-500/15 text-red-600 ring-1 ring-red-500/20 dark:text-red-400',
}

const surveyLabel: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  for_removal: 'For Removal',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeStat {
  id: number
  status: 'pending' | 'in_progress' | 'completed'
}

interface TeardownLog {
  id: number
  status: string
  actual_cable: number
  expected_cable: number
  offline_mode: boolean
  created_at: string
  span: {
    id: number
    span_code: string | null
    node: { id: number; name: string } | null
  } | null
  team: { id: number; name: string } | null
  lineman: { id: number; first_name: string; last_name: string } | null
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function SafeCell({
  children,
  className = '',
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <div
      title={title}
      className={`min-w-0 max-w-full overflow-hidden truncate ${className}`}
    >
      {children}
    </div>
  )
}

function PrettyEmptyState({
  icon,
  title,
  subtitle,
  compact = false,
}: {
  icon: string
  title: string
  subtitle?: string
  compact?: boolean
}) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-gradient-to-br from-white via-slate-50 to-violet-50/50 px-6 text-center dark:border-zinc-600 dark:from-zinc-900 dark:via-zinc-800 dark:to-violet-950/20 ${
        compact ? 'min-h-[170px] py-8' : 'min-h-[220px] py-10'
      }`}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-600 shadow-sm ring-1 ring-violet-600/10 dark:text-violet-300">
        <i className={`${icon} text-2xl`} />
      </div>

      <p className="text-sm font-bold text-slate-950 dark:text-zinc-100">{title}</p>

      {subtitle && (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
          {subtitle}
        </p>
      )}
    </div>
  )
}

const prettyCard =
  'card overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] ring-1 ring-white/60 dark:border-zinc-600 dark:bg-zinc-800 dark:shadow-none dark:ring-zinc-700/40'

const prettyCardHeader =
  'card-body border-b border-slate-200 bg-gradient-to-r from-white via-white to-slate-50 px-5 py-4 dark:border-zinc-700 dark:from-zinc-800 dark:via-zinc-800 dark:to-zinc-900'

const prettyInnerBox =
  'rounded-2xl border border-slate-300/80 bg-white shadow-inner shadow-slate-100/70 dark:border-zinc-700 dark:bg-zinc-800/40 dark:shadow-none'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function statusColor(s: string) {
  switch (s) {
    case 'backend_approved':
      return 'bg-green-500/15 text-green-600 dark:text-green-400'
    case 'subcon_approved':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'submitted':
      return 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
    case 'rejected':
      return 'bg-red-500/15 text-red-600 dark:text-red-400'
    case 'in_progress':
      return 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
    default:
      return 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
  }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    backend_approved: 'Backend Approved',
    subcon_approved: 'Subcon Approved',
    submitted: 'Submitted',
    rejected: 'Rejected',
    in_progress: 'In Progress',
  }
  return map[s] ?? s
}

const h = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubconDashboard() {
  const navigate = useNavigate()
  const [mapView, setMapView] = useState<MapView>('satellite')
  const [surveyTab, setSurveyTab] = useState<'all' | 'active' | 'inactive' | 'for_removal'>('all')
  const [nodes, setNodes] = useState<NodeStat[]>(() => cacheGet<NodeStat[]>('dashboard_nodes') ?? [])
  const [teardowns, setTeardowns] = useState<TeardownLog[]>(() => cacheGet<TeardownLog[]>('dashboard_tdlogs') ?? [])
  const [tdLoading, setTdLoading] = useState(() => !cacheGet<TeardownLog[]>('dashboard_tdlogs'))
  const [pulse, setPulse] = useState(false)
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [napSurveys, setNapSurveys] = useState<NapSurveyRow[]>(() => cacheGet<NapSurveyRow[]>('dashboard_nap_surveys') ?? [])
  const [napSurveyLoading, setNapSurveyLoading] = useState(() => !cacheGet<NapSurveyRow[]>('dashboard_nap_surveys'))

  // Cache & Connection States
  const [syncTrigger, setSyncTrigger] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    const keys = ['dashboard_nodes', 'dashboard_tdlogs', 'dashboard_nap_surveys', 'dashboard_map_pins']
    const times = keys.map(k => {
      try {
        const raw = sessionStorage.getItem(k)
        return raw ? JSON.parse(raw).ts : null
      } catch { return null }
    }).filter(Boolean) as number[]
    return times.length > 0 ? Math.min(...times) : null
  })
  const [syncText, setSyncText] = useState('Never')

  // Dynamic relative time calculations for sync label
  useEffect(() => {
    function updateText() {
      if (!lastSynced) {
        setSyncText('Never')
        return
      }
      const diff = Date.now() - lastSynced
      const secs = Math.floor(diff / 1000)
      if (secs < 60) {
        setSyncText('Just now')
      } else {
        const mins = Math.floor(secs / 60)
        setSyncText(`${mins}m ago`)
      }
    }
    updateText()
    const id = setInterval(updateText, 10000)
    return () => clearInterval(id)
  }, [lastSynced])

  // Track browser connectivity
  useEffect(() => {
    function handleOnline() { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(initCharts, 100)
    return () => clearTimeout(timer)
  }, [])

  function fetchNodes() {
    fetch(`${SKYCABLE_API}/nodes`, { headers: h() })
      .then(r => r.json())
      .then(d => {
        const list: NodeStat[] = Array.isArray(d) ? d : d?.data ?? []
        setNodes(list)
        cacheSet('dashboard_nodes', list)
        setLastSynced(Date.now())
      })
      .catch(() => {})
  }

  function fetchTeardowns(silent = false) {
    if (!silent) setTdLoading(true)

    fetch(`${SKYCABLE_API}/teardowns?per_page=15`, { headers: h() })
      .then(r => r.json())
      .then(d => {
        const list: TeardownLog[] = Array.isArray(d) ? d : d?.data ?? []
        setTeardowns(list)
        cacheSet('dashboard_tdlogs', list)
        setLastSynced(Date.now())
        setPulse(true)
        setTimeout(() => setPulse(false), 800)
      })
      .catch(() => {})
      .finally(() => {
        if (!silent) setTdLoading(false)
      })
  }

  async function fetchNapSurveys() {
    const cached = cacheGet<NapSurveyRow[]>('dashboard_nap_surveys')
    if (cached) {
      setNapSurveys(cached)
      setNapSurveyLoading(false)
      // Silent background fetch to update cache
      fetchNapSurveysForce().catch(() => {})
      return
    }
    await fetchNapSurveysForce()
  }

  async function fetchNapSurveysForce() {
    setNapSurveyLoading(true)
    try {
      const headers = {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
        Authorization: `Bearer ${getToken()}`,
      }

      const res = await fetch(`${GLOBE_API}/poles/0/nap-boxes?per_page=20`, { headers })
      const data = await res.json()
      const boxes: ApiNapBoxSurvey[] = Array.isArray(data) ? data : data?.data ?? []

      const portsResults: ApiNapPort[][] = []

      for (let i = 0; i < boxes.length; i += 5) {
        const batch = boxes.slice(i, i + 5)
        const results = await Promise.all(
          batch.map((b: ApiNapBoxSurvey) =>
            fetch(`${GLOBE_API}/nap-boxes/${b.id}/ports`, { headers })
              .then(r => r.json() as Promise<ApiNapPort[]>)
              .catch(() => [] as ApiNapPort[])
          )
        )
        portsResults.push(...results)
      }

      const rows: NapSurveyRow[] = boxes.map((b: ApiNapBoxSurvey, i: number) => {
        const ports: ApiNapPort[] = Array.isArray(portsResults[i]) ? portsResults[i] : []
        const total = parseInt(b.port_count) || 0
        const used = ports.filter(p => p.status === 'active').length
        const inactive = ports.filter(p => p.status === 'inactive').length
        const free = total - used - inactive
        const util = total > 0 ? Math.round((used / total) * 100) : 0
        const barangay = b.pole?.barangay?.name ?? ''

        return {
          id: b.nap_code,
          pole: b.pole?.pole_code ?? `Pole #${b.id}`,
          area: barangay,
          total,
          used,
          free: Math.max(free, 0),
          inactive,
          utilization: util,
          boxStatus: b.status,
          date: new Date(b.updated_at).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        }
      })

      setNapSurveys(rows)
      cacheSet('dashboard_nap_surveys', rows)
      setLastSynced(Date.now())
    } catch (_) {
      // silently fail — table stays empty
    } finally {
      setNapSurveyLoading(false)
    }
  }

  async function handleManualSync() {
    if (syncing || !isOnline) return
    setSyncing(true)

    try {
      cacheDel('dashboard_nodes')
      cacheDel('dashboard_tdlogs')
      cacheDel('dashboard_nap_surveys')
      cacheDel('dashboard_map_pins')
      setSyncTrigger(prev => prev + 1)

      await Promise.all([
        fetch(`${SKYCABLE_API}/nodes`, { headers: h() })
          .then(r => r.json())
          .then(d => {
            const list = Array.isArray(d) ? d : d?.data ?? []
            setNodes(list)
            cacheSet('dashboard_nodes', list)
          }),
        fetch(`${SKYCABLE_API}/teardowns?per_page=15`, { headers: h() })
          .then(r => r.json())
          .then(d => {
            const list = Array.isArray(d) ? d : d?.data ?? []
            setTeardowns(list)
            cacheSet('dashboard_tdlogs', list)
          }),
        fetchNapSurveysForce()
      ])

      setLastSynced(Date.now())
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  function handleClearCache() {
    cacheDel('dashboard_nodes')
    cacheDel('dashboard_tdlogs')
    cacheDel('dashboard_nap_surveys')
    cacheDel('dashboard_map_pins')
    setNodes([])
    setTeardowns([])
    setNapSurveys([])
    setLastSynced(null)
    setSyncTrigger(prev => prev + 1)

    // Trigger fresh load
    setTimeout(() => {
      fetchNodes()
      fetchTeardowns()
      fetchNapSurveysForce()
    }, 100)
  }

  useEffect(() => {
    fetchNodes()
    fetchTeardowns()
    fetchNapSurveys()

    const iv = setInterval(() => fetchTeardowns(true), 30_000)
    return () => clearInterval(iv)
  }, [])

  const dashStats = useMemo(() => {
    const total = nodes.length
    const completed = nodes.filter(n => n.status === 'completed').length
    const inProgress = nodes.filter(n => n.status === 'in_progress').length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    const pendingTd = teardowns.filter(l => !['backend_approved'].includes(l.status)).length

    return { total, completed, inProgress, pct, pendingTd }
  }, [nodes, teardowns])

  const recentTeardowns = teardowns

  const filteredSurveys = useMemo(
    () => (surveyTab === 'all' ? napSurveys : napSurveys.filter(s => s.boxStatus === surveyTab)),
    [napSurveys, surveyTab]
  )

  const dailyApproved = useMemo(
    () => teardowns.filter(l => l.status === 'backend_approved' && l.created_at.slice(0, 10) === dailyDate),
    [teardowns, dailyDate]
  )

  return (
    <>
      {/* Page title */}
      <div className="grid grid-cols-1 pb-6 min-w-0">
        <div className="md:flex items-center justify-between px-[2px] gap-3 min-w-0">
          <div className="min-w-0">
            <h4 className="text-[18px] font-medium text-gray-800 mb-1 dark:text-gray-100 truncate">
              Telcovantage — Subcon Dashboard
            </h4>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* Cache Control Panel */}
            <div className="flex items-center gap-2 rounded-2xl bg-white/40 dark:bg-zinc-800/40 backdrop-blur-md border border-white/20 dark:border-zinc-700/30 px-3 py-1.5 shadow-sm text-xs select-none">
              {/* Live Connection Badge */}
              <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200 dark:border-zinc-700/50">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </span>
                <span className="font-bold text-slate-600 dark:text-zinc-300">
                  {isOnline ? 'Online' : 'Offline Mode'}
                </span>
              </div>

              {/* Cache Status Details */}
              <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500 font-medium">
                <i className="bx bx-time-five text-sm" />
                <span>Synced:</span>
                <span className="font-black text-slate-600 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-700/60 rounded px-1.5 py-0.5 leading-none">
                  {syncText}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-zinc-700/50">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing || !isOnline}
                  title="Sync Now"
                  className={`flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 dark:text-zinc-300 transition-all ${syncing ? 'animate-spin' : 'hover:bg-slate-100 dark:hover:bg-zinc-700/50 hover:text-violet-500'} disabled:opacity-50`}
                >
                  <i className="bx bx-refresh text-lg" />
                </button>

                <button
                  type="button"
                  onClick={handleClearCache}
                  title="Purge Cache"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-all"
                >
                  <i className="bx bx-trash text-sm" />
                </button>
              </div>
            </div>

            <nav className="flex shrink-0 group-data-[sidebar-size=sm]:hidden md:block hidden" aria-label="breadcrumb">
              <ol className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <li>
                  <a href="#" className="hover:text-violet-500">
                    Telcovantage
                  </a>
                </li>
                <li>
                  <span className="mx-1">/</span>
                </li>
                <li className="text-gray-700 dark:text-gray-100">Dashboard</li>
              </ol>
            </nav>
          </div>
        </div>
      </div>

      {/* Row 1 — 4 mini stat cards */}
      <div className="grid grid-cols-1 gap-6 gap-y-0 2xl:gap-6 md:grid-cols-2 2xl:grid-cols-4 min-w-0">
        {[
          {
            label: 'Total Nodes',
            value: dashStats.total,
            badge: `${dashStats.pct}% done`,
            badgeColor: 'bg-green-500/40 text-green-500 dark:bg-green-500/30',
            chartId: 'mini-chart1',
          },
          {
            label: 'Completed Nodes',
            value: dashStats.completed,
            badge: `${dashStats.pct}% of total`,
            badgeColor: 'bg-green-500/40 text-green-500 dark:bg-green-500/30',
            chartId: 'mini-chart2',
          },
          {
            label: 'In Progress',
            value: dashStats.inProgress,
            badge: 'Ongoing',
            badgeColor: 'bg-violet-500/40 text-violet-500 dark:bg-violet-500/30',
            chartId: 'mini-chart3',
          },
          {
            label: 'Pending Teardowns',
            value: dashStats.pendingTd,
            badge: dashStats.pendingTd > 0 ? 'Needs review' : 'Clear',
            badgeColor:
              dashStats.pendingTd > 0
                ? 'bg-yellow-500/40 text-yellow-500 dark:bg-yellow-500/30'
                : 'bg-green-500/40 text-green-500 dark:bg-green-500/30',
            chartId: 'mini-chart4',
          },
        ].map(card => (
          <div key={card.chartId} className={`min-w-0 ${prettyCard}`}>
            <div className="card-body min-w-0">
              <div className="grid items-center grid-cols-12 gap-6 min-w-0">
                <div className="col-span-6 min-w-0">
                  <span className="block truncate text-gray-700 dark:text-zinc-100">{card.label}</span>
                  <h4 className="my-4 font-medium text-gray-800 text-21 dark:text-gray-100 truncate">
                    {card.value}
                  </h4>
                </div>
                <div className="col-span-6 min-w-0">
                  <div id={card.chartId} className="mb-2 apex-charts min-w-0" />
                </div>
              </div>

              <div className="flex items-center mt-1 min-w-0">
                <span className={`shrink-0 text-[10px] py-[1px] px-1 rounded font-medium ${card.badgeColor}`}>
                  {card.badge}
                </span>
                <span className="ltr:ml-1.5 rtl:mr-1.5 text-gray-700 text-13 dark:text-zinc-100 truncate">
                  Since last week
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 — NAP Slot Distribution + Teardown Overview + Validation Progress */}
      <div className="grid grid-cols-1 gap-6 gap-y-0 2xl:gap-6 lg:grid-cols-12 mt-4 min-w-0">
        <div className="col-span-12 2xl:col-span-5 min-w-0">
          <div className={`card-h-100 min-w-0 ${prettyCard}`}>
            <div className="card-body h-full flex flex-col justify-center min-w-0">
              <div className="flex flex-wrap items-center mb-3 gap-2 min-w-0">
                <h5 className="mr-2 font-medium text-gray-800 text-15 dark:text-gray-100 truncate">
                  NAP Slot Distribution
                </h5>
                <div className="flex gap-1 ltr:ml-auto rtl:mr-auto shrink-0 rounded-2xl bg-slate-100 p-1 dark:bg-zinc-900">
                  {['ALL', '1M', '6M', '1Y'].map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        i === 1
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-white hover:text-violet-600 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-12 2xl:gap-6 justify-items-stretch min-w-0">
                <div className="flex items-center justify-center col-span-12 md:col-span-6 min-w-0">
                  <div id="nap-slot-chart" className="apex-charts min-w-0" />
                </div>

                <div className="col-span-12 md:col-span-6 flex items-center min-w-0">
                  <div className="w-full space-y-4 md:text-left min-w-0">
                    {[
                      { label: 'Active', val: '342 slots', sub: 'In use', dot: 'text-violet-500' },
                      { label: 'Inactive', val: '187 slots', sub: 'Disconnected', dot: 'text-red-400' },
                      { label: 'Free', val: '95 slots', sub: 'Available', dot: 'text-yellow-500' },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[105px_minmax(0,1fr)] items-center gap-x-3 min-w-0"
                      >
                        <div className="flex items-center text-gray-800 dark:text-zinc-100 min-w-0">
                          <i className={`mr-2 mdi mdi-circle text-10 ${item.dot}`} />
                          <span className="truncate">{item.label}</span>
                        </div>

                        <div className="text-gray-800 dark:text-gray-100 min-w-0">
                          <span className="font-semibold whitespace-nowrap">{item.val}</span>
                          <span className="ml-1 font-normal text-gray-700 dark:text-zinc-100 text-14 break-words">
                            — {item.sub}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Span Teardown Overview + Validation Progress */}
        <div className="col-span-12 2xl:col-span-7 min-w-0">
          <div className="grid grid-cols-12 2xl:gap-6 min-w-0">
            <div className="col-span-12 2xl:col-span-8 min-w-0">
              <div className={`card-h-100 min-w-0 ${prettyCard}`}>
                <div className="card-body min-w-0">
                  <div className="flex flex-wrap items-center mb-6 gap-2 min-w-0">
                    <h5 className="mr-2 text-gray-800 text-15 dark:text-gray-100 truncate">
                      Span Teardown Overview
                    </h5>
                    <div className="ltr:ml-auto rtl:mr-auto shrink-0">
                      <select className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-gray-100">
                        {['2026', '2025', '2024'].map(y => (
                          <option key={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div id="span-teardown-chart" className="apex-charts flex justify-center min-w-0" />
                </div>
              </div>
            </div>

            <div className="col-span-12 2xl:col-span-4 min-w-0">
              <div className={`card-h-100 min-w-0 ${prettyCard}`}>
                <div className="card-body min-w-0">
                  <h5 className="mb-4 text-gray-800 text-15 dark:text-gray-100 text-center truncate">
                    Total Audit Poles
                  </h5>
                  <div id="validation-progress-chart" className="apex-charts min-w-0" />

                  <div className="mt-4 space-y-3 min-w-0">
                    {[
                      { label: 'Approved', val: '72%', dot: 'text-violet-500' },
                      { label: 'Pending', val: '18%', dot: 'text-yellow-500' },
                      { label: 'Rejected', val: '10%', dot: 'text-red-500' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center min-w-0">
                        <i className={`mr-2 align-middle mdi mdi-circle text-10 ${s.dot}`} />
                        <span className="grow text-gray-700 dark:text-zinc-100 text-13 truncate">{s.label}</span>
                        <span className="shrink-0 font-medium text-gray-700 dark:text-gray-100 text-13">
                          {s.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 — Live Teardown Logs + Map */}
      <div className="grid grid-cols-12 gap-6 gap-y-0 2xl:gap-6 mt-4 min-w-0 items-stretch">
        {/* Live Teardown Logs */}
        <div className="col-span-12 lg:col-span-8 min-w-0 flex flex-col">
          <div className={`min-w-0 flex flex-col flex-1 ${prettyCard}`}>
            <div className={`${prettyCardHeader} flex items-center gap-3 min-w-0`}>
              <div className="grow min-w-0">
                <h5 className="text-slate-900 text-15 font-semibold dark:text-gray-100 truncate">
                  Live Teardown Logs
                </h5>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                  Latest field teardown submissions — refreshes every 30s
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
                    pulse
                      ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                      : 'bg-green-500/10 text-green-600 dark:text-green-400'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
                <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-700 px-2.5 py-1 rounded-lg">
                  Latest 15
                </span>
              </div>
            </div>

            <div className="min-w-0 flex flex-col flex-1 p-3">
              {tdLoading && teardowns.length === 0 ? (
                <div className="flex flex-1 items-center justify-center min-h-[210px]">
                  <div className="h-7 w-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                </div>
              ) : teardowns.length === 0 ? (
                <div className="flex-1 min-h-[220px]">
                  <PrettyEmptyState
                    compact
                    icon="bx bx-broadcast"
                    title="No teardown logs yet"
                    subtitle="New field teardown submissions will appear here once available."
                  />
                </div>
              ) : (
                <div className={`min-w-0 flex flex-col flex-1 overflow-hidden ${prettyInnerBox}`}>
                  <div
                    className="w-full flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain"
                    data-simplebar
                    style={{ maxHeight: 360 }}
                  >
                    <table className="w-full min-w-[860px] border-separate border-spacing-0">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-zinc-700">
                          {['#', 'Span', 'Node', 'Lineman', 'Team', 'Cable', 'Status', 'Time'].map(th => (
                            <th
                              key={th}
                              className="sticky top-0 z-10 bg-slate-50 px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:bg-zinc-900 dark:text-zinc-400"
                            >
                              {th}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {recentTeardowns.map(log => {
                          const lineman = log.lineman
                            ? `${log.lineman.first_name} ${log.lineman.last_name}`
                            : '—'
                          const nodeName = log.span?.node?.name ?? '—'
                          const teamName = log.team?.name ?? '—'

                          return (
                            <tr
                              key={log.id}
                              onClick={() => navigate(`/reports/teardown-logs/${log.id}`)}
                              className="border-b border-slate-100 dark:border-zinc-700/60 last:border-0 cursor-pointer hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors"
                            >
                              <td className="p-3 font-mono text-xs font-semibold text-violet-500 whitespace-nowrap">
                                #{log.id}
                              </td>

                              <td className="p-3 text-sm font-medium text-gray-700 dark:text-gray-100 font-mono">
                                <SafeCell className="max-w-[130px]" title={log.span?.span_code ?? ''}>
                                  {log.span?.span_code ?? '—'}
                                </SafeCell>
                              </td>

                              <td className="p-3 text-xs text-gray-600 dark:text-zinc-300">
                                <SafeCell className="max-w-[190px]" title={nodeName}>
                                  {nodeName}
                                </SafeCell>
                              </td>

                              <td className="p-3 text-xs text-gray-600 dark:text-zinc-300">
                                <SafeCell className="max-w-[150px]" title={lineman}>
                                  {lineman}
                                </SafeCell>
                              </td>

                              <td className="p-3 text-xs text-gray-600 dark:text-zinc-300">
                                <SafeCell className="max-w-[150px]" title={teamName}>
                                  {teamName}
                                </SafeCell>
                              </td>

                              <td className="p-3 text-xs font-medium text-gray-700 dark:text-zinc-100 whitespace-nowrap">
                                {log.actual_cable}m
                              </td>

                              <td className="p-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(
                                    log.status
                                  )}`}
                                >
                                  {statusLabel(log.status)}
                                </span>
                              </td>

                              <td className="p-3 text-[11px] text-gray-400 dark:text-zinc-500 whitespace-nowrap">
                                {timeAgo(log.created_at)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Field Coverage Map */}
        <div className="col-span-12 lg:col-span-4 min-w-0 flex flex-col">
          <div className={`w-full min-w-0 flex flex-col flex-1 ${prettyCard}`}>
            <div className={`${prettyCardHeader} flex items-center justify-between gap-3 min-w-0`}>
              <div className="min-w-0">
                <h5 className="truncate text-[15px] font-semibold text-slate-900 dark:text-gray-100">
                  Field Coverage Map
                </h5>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-zinc-400">
                  Coverage and field activity overview
                </p>
              </div>

              <div className="flex shrink-0 rounded-2xl border border-slate-300 bg-slate-50 p-1 text-[11px] font-semibold dark:border-zinc-600 dark:bg-zinc-900">
                {(Object.keys(TILE_LAYERS) as MapView[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setMapView(k)}
                    className={`rounded-xl px-3 py-1.5 transition-colors ${
                      mapView === k
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {TILE_LAYERS[k].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-b-2xl min-h-[380px]">
              <FieldCoverageMap mapView={mapView} onMapViewChange={setMapView} syncTrigger={syncTrigger} />
            </div>
          </div>
        </div>
      </div>

      {/* Row 4 — NAP Box Latest Survey + Validation Queue */}
      <div className="grid grid-cols-12 gap-6 gap-y-0 2xl:gap-6 mt-4 min-w-0">
        {/* NAP Box Latest Survey */}
        <div className="col-span-12 xl:col-span-6 min-w-0">
          <div className={`card-h-100 min-w-0 ${prettyCard}`}>
            <div className="nav-tabs border-b-tabs min-w-0">
              <div className={`${prettyCardHeader} flex flex-wrap items-center gap-3 min-w-0`}>
                <div className="grow min-w-0">
                  <h5 className="truncate text-[15px] font-semibold text-slate-900 dark:text-gray-100">
                    NAP Box Latest Survey
                  </h5>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-zinc-400">
                    Most recent pole survey submissions
                  </p>
                </div>

                <ul
                  className="flex shrink-0 flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-zinc-900"
                  role="tablist"
                >
                  {[
                    ['all', 'All'],
                    ['active', 'Active'],
                    ['inactive', 'Inactive'],
                    ['for_removal', 'For Removal'],
                  ].map(([v, l]) => (
                    <li key={v} className="nav-item">
                      <button
                        type="button"
                        onClick={() => setSurveyTab(v as 'all' | 'active' | 'inactive' | 'for_removal')}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                          surveyTab === v
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-white hover:text-violet-600 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 min-w-0">
                <div className={`min-w-0 overflow-hidden ${prettyInnerBox}`}>
                  <div className="w-full overflow-x-auto overscroll-x-contain p-3" style={{ maxHeight: 390 }}>
                    {napSurveyLoading ? (
                      <div className="flex min-h-[220px] items-center justify-center">
                        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : filteredSurveys.length === 0 ? (
                      <div className="h-[230px]">
                        <PrettyEmptyState
                          compact
                          icon="bx bx-box"
                          title="No NAP boxes found"
                          subtitle="Survey records will show here once the backend returns NAP box data."
                        />
                      </div>
                    ) : (
                      <table className="w-full min-w-[920px] border-separate border-spacing-0">
                        <thead>
                          <tr>
                            {['NAP Box', 'Pole', 'Area', 'Slots', 'Utilization', 'Last Updated', 'Status'].map(col => (
                              <th
                                key={col}
                                className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-zinc-900/90 dark:text-zinc-400"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {filteredSurveys.map(row => (
                            <tr
                              key={row.id}
                              className="group border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/50 dark:border-zinc-700/70 dark:hover:bg-violet-900/10"
                            >
                              <td className="px-4 py-3 align-middle font-mono text-sm font-bold text-violet-500">
                                <SafeCell className="max-w-[130px]" title={row.id}>
                                  {row.id}
                                </SafeCell>
                              </td>

                              <td className="px-4 py-3 align-middle font-mono text-sm font-bold text-gray-700 dark:text-zinc-100">
                                <SafeCell className="max-w-[130px]" title={row.pole}>
                                  {row.pole}
                                </SafeCell>
                              </td>

                              <td className="px-4 py-3 align-middle text-xs text-gray-600 dark:text-zinc-300">
                                <SafeCell className="max-w-[180px]" title={row.area}>
                                  {row.area || '—'}
                                </SafeCell>
                              </td>

                              <td className="px-4 py-3 align-middle">
                                <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                                  <span className="rounded-full bg-violet-500/15 px-2 py-1 text-violet-500 whitespace-nowrap">
                                    {row.used} used
                                  </span>
                                  <span className="rounded-full bg-green-500/15 px-2 py-1 text-green-500 whitespace-nowrap">
                                    {row.free} free
                                  </span>
                                  {row.inactive > 0 && (
                                    <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-500 whitespace-nowrap">
                                      {row.inactive} inactive
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="px-4 py-3 align-middle">
                                <div className="flex items-center gap-2 min-w-24">
                                  <div className="h-2 grow overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-600">
                                    <div
                                      className={`h-2 rounded-full ${
                                        row.utilization >= 90
                                          ? 'bg-red-500'
                                          : row.utilization >= 60
                                            ? 'bg-violet-500'
                                            : 'bg-green-500'
                                      }`}
                                      style={{ width: `${row.utilization}%` }}
                                    />
                                  </div>
                                  <span className="whitespace-nowrap text-[11px] font-bold text-gray-700 dark:text-zinc-100">
                                    {row.utilization}%
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-3 align-middle whitespace-nowrap text-xs text-gray-600 dark:text-zinc-300">
                                {row.date}
                              </td>

                              <td className="px-4 py-3 align-middle whitespace-nowrap">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                    surveyBadge[row.boxStatus] ?? ''
                                  }`}
                                >
                                  {surveyLabel[row.boxStatus] ?? row.boxStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Validation Queue */}
        <div className="col-span-12 xl:col-span-6 min-w-0">
          <div className={`card-h-100 min-w-0 ${prettyCard}`}>
            <div className="nav-tabs border-b-tabs min-w-0">
              <div className={`${prettyCardHeader} flex items-center gap-3 min-w-0`}>
                <div className="grow min-w-0">
                  <h5 className="text-slate-900 text-15 font-semibold dark:text-gray-100 truncate">
                    Validation Queue
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                    Evidence review before backend approval
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-bold text-yellow-600 ring-1 ring-yellow-500/20 dark:text-yellow-400">
                  {validationQueue.length} pending
                </span>
              </div>

              <div className="p-4 min-w-0">
                <div className={`min-w-0 overflow-hidden ${prettyInnerBox}`}>
                  <div
                    className="w-full overflow-x-auto overscroll-x-contain"
                    data-simplebar
                    style={{ maxHeight: 390 }}
                  >
                    <table className="w-full min-w-[900px] border-separate border-spacing-0">
                      <thead>
                        <tr>
                          {['Ticket', 'Submitted By', 'Pole', 'Span', 'Before', 'After', 'Pole Tag', 'GPS Map', 'Date', 'Action'].map(
                            th => (
                              <th
                                key={th}
                                className={`sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-zinc-900/90 dark:text-zinc-400 ${
                                  ['Before', 'After', 'Pole Tag', 'GPS Map'].includes(th) ? 'text-center' : ''
                                }`}
                              >
                                {th}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>

                      <tbody>
                        {validationQueue.map(row => (
                          <tr
                            key={row.id}
                            className="group border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/50 dark:border-zinc-700/70 dark:hover:bg-violet-900/10"
                          >
                            <td className="px-4 py-3 align-middle font-mono text-sm font-bold text-violet-500">
                              <SafeCell className="max-w-[120px]" title={row.id}>
                                {row.id}
                              </SafeCell>
                            </td>

                            <td className="px-4 py-3 align-middle text-sm font-semibold text-gray-700 dark:text-zinc-100">
                              <SafeCell className="max-w-[160px]" title={row.submittedBy}>
                                {row.submittedBy}
                              </SafeCell>
                            </td>

                            <td className="px-4 py-3 align-middle font-mono text-xs text-gray-700 dark:text-zinc-100">
                              <SafeCell className="max-w-[110px]" title={row.pole}>
                                {row.pole}
                              </SafeCell>
                            </td>

                            <td className="px-4 py-3 align-middle font-mono text-xs text-gray-700 dark:text-zinc-100">
                              <SafeCell className="max-w-[110px]" title={row.span}>
                                {row.span}
                              </SafeCell>
                            </td>

                            {(['before', 'after', 'tag', 'gps'] as const).map(ev => (
                              <td key={ev} className="px-4 py-3 align-middle text-center">
                                {row.evidence[ev] ? (
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                                    <i className="bx bx-check text-lg" />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                                    <i className="bx bx-x text-lg" />
                                  </span>
                                )}
                              </td>
                            ))}

                            <td className="px-4 py-3 align-middle whitespace-nowrap text-xs text-gray-600 dark:text-zinc-300">
                              {row.date}
                            </td>

                            <td className="px-4 py-3 align-middle">
                              <div className="flex flex-wrap gap-1.5">
                                <button className="rounded-full bg-green-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-600">
                                  Approve
                                </button>
                                <button className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-600">
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 6 — Daily Report */}
      <div className="grid grid-cols-1 gap-6 gap-y-0 2xl:gap-6 mt-4 mb-3 min-w-0">
        <div className={`min-w-0 ${prettyCard}`}>
          <div className={`${prettyCardHeader} flex items-center gap-3 flex-wrap min-w-0`}>
            <div className="grow min-w-0">
              <h5 className="text-slate-900 text-15 font-semibold dark:text-gray-100 truncate">
                Daily Report
              </h5>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                Teardowns approved by the backend team
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="date"
                value={dailyDate}
                onChange={e => setDailyDate(e.target.value)}
                className="text-xs border border-slate-300 dark:border-zinc-600 rounded-xl px-3 py-1.5 bg-white dark:bg-zinc-700 text-gray-700 dark:text-zinc-100 outline-none focus:border-violet-400"
              />
              <span
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                  dailyApproved.length > 0
                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400'
                }`}
              >
                {dailyApproved.length} approved
              </span>
            </div>
          </div>

          <div className="p-4 min-w-0">
            {dailyApproved.length === 0 ? (
              <div className="h-[220px]">
                <PrettyEmptyState
                  compact
                  icon="bx bx-check-shield"
                  title={`No backend-approved teardowns for ${dailyDate}`}
                  subtitle="Try a different date or check back later."
                />
              </div>
            ) : (
              <div className={`min-w-0 overflow-hidden ${prettyInnerBox}`}>
                <div
                  className="w-full overflow-x-auto overscroll-x-contain"
                  data-simplebar
                  style={{ maxHeight: 352 }}
                >
                  <table className="w-full min-w-[1120px] border-separate border-spacing-0">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-700">
                        {[
                          '#',
                          'Span Code',
                          'Node',
                          'Lineman',
                          'Team',
                          'Expected Cable',
                          'Actual Cable',
                          'Collection',
                          'Offline',
                          'Approved At',
                        ].map(th => (
                          <th
                            key={th}
                            className="sticky top-0 z-10 bg-slate-50 p-3 text-left text-xs font-semibold text-slate-600 dark:bg-zinc-900 dark:text-zinc-400 whitespace-nowrap"
                          >
                            {th}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {dailyApproved.map(log => {
                        const lineman = log.lineman
                          ? `${log.lineman.first_name} ${log.lineman.last_name}`
                          : '—'
                        const nodeName = log.span?.node?.name ?? '—'
                        const teamName = log.team?.name ?? '—'
                        const pct =
                          log.expected_cable > 0
                            ? Math.round((log.actual_cable / log.expected_cable) * 100)
                            : null

                        return (
                          <tr
                            key={log.id}
                            onClick={() => navigate(`/reports/teardown-logs/${log.id}`)}
                            className="border-b border-slate-100 dark:border-zinc-700/60 last:border-0 cursor-pointer hover:bg-green-50/40 dark:hover:bg-green-900/10 transition-colors"
                          >
                            <td className="p-3 font-mono text-xs font-semibold text-violet-500 whitespace-nowrap">
                              #{log.id}
                            </td>

                            <td className="p-3 text-sm font-medium text-gray-700 dark:text-gray-100 font-mono">
                              <SafeCell className="max-w-[140px]" title={log.span?.span_code ?? ''}>
                                {log.span?.span_code ?? '—'}
                              </SafeCell>
                            </td>

                            <td className="p-3 text-xs text-gray-600 dark:text-zinc-300">
                              <SafeCell className="max-w-[200px]" title={nodeName}>
                                {nodeName}
                              </SafeCell>
                            </td>

                            <td className="p-3 text-xs text-gray-600 dark:text-zinc-300">
                              <SafeCell className="max-w-[160px]" title={lineman}>
                                {lineman}
                              </SafeCell>
                            </td>

                            <td className="p-3 text-xs text-gray-600 dark:text-zinc-300">
                              <SafeCell className="max-w-[160px]" title={teamName}>
                                {teamName}
                              </SafeCell>
                            </td>

                            <td className="p-3 text-xs font-medium text-gray-700 dark:text-zinc-100 whitespace-nowrap">
                              {log.expected_cable}m
                            </td>

                            <td className="p-3 text-xs font-medium text-gray-700 dark:text-zinc-100 whitespace-nowrap">
                              {log.actual_cable}m
                            </td>

                            <td className="p-3">
                              {pct !== null ? (
                                <div className="flex items-center gap-2 min-w-20">
                                  <div className="grow h-1.5 rounded-full bg-gray-200 dark:bg-zinc-600 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        pct >= 100
                                          ? 'bg-green-500'
                                          : pct >= 80
                                            ? 'bg-violet-500'
                                            : 'bg-amber-400'
                                      }`}
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] font-medium text-gray-700 dark:text-zinc-100 whitespace-nowrap">
                                    {pct}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>

                            <td className="p-3 text-center whitespace-nowrap">
                              {log.offline_mode ? (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                  Offline
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                  Online
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-[11px] text-gray-400 dark:text-zinc-500 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleTimeString('en-PH', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
