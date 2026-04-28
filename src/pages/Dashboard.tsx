import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FieldCoverageMap from '../components/FieldCoverageMap'
import { getToken, API_BASE } from '../lib/auth'

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
      tooltip: { fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: () => '' } }, marker: { show: false } },
    })
    c.render()
    ;(el as any)._apexChart = c
  }

  mini('#mini-chart1', [2, 10, 18, 22, 36, 15, 47, 75, 65, 19, 14, 2, 47, 42, 15])
  mini('#mini-chart2', [15, 42, 47, 2, 14, 19, 65, 75, 47, 15, 42, 47, 2, 14, 12])
  mini('#mini-chart3', [47, 15, 2, 67, 22, 20, 36, 60, 60, 30, 50, 11, 12, 3, 8])
  mini('#mini-chart4', [12, 14, 2, 47, 42, 15, 47, 75, 65, 19, 14, 2, 47, 42, 15])

  // NAP Slot Distribution — donut
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

  // Span Teardown Overview — bar chart
  const spanEl = document.querySelector('#span-teardown-chart')
  if (spanEl) {
    ;(spanEl as any)._apexChart?.destroy()
    const c = new AC(spanEl, {
      series: [
        { name: 'Completed', data: [14, 22, 18, 30, 25, 40, 35, 28, 42, 38, 50, 44] },
        { name: 'Pending',   data: [8, 12, 9, 15, 18, 10, 20, 14, 16, 22, 12, 18] },
      ],
      chart: { type: 'bar', height: 250, stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { columnWidth: '45%', borderRadius: 2 } },
      colors: ['#5156be', '#f46a6a'],
      fill: { opacity: 1 },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'bottom' },
      yaxis: { labels: { formatter: (y: number) => y.toFixed(0) } },
      xaxis: { categories: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] },
    })
    c.render()
    ;(spanEl as any)._apexChart = c
  }

  // Validation Progress — radial
  const valEl = document.querySelector('#validation-progress-chart')
  if (valEl) {
    ;(valEl as any)._apexChart?.destroy()
    const c = new AC(valEl, {
      chart: { height: 270, type: 'radialBar', offsetY: -10 },
      plotOptions: {
        radialBar: {
          startAngle: -130, endAngle: 130,
          dataLabels: { name: { show: false }, value: { offsetY: 10, fontSize: '18px', formatter: (v: number) => v + '%' } },
        },
      },
      colors: ['#5156be'],
      fill: { type: 'gradient', gradient: { shade: 'dark', type: 'horizontal', gradientToColors: ['#34c38f'], shadeIntensity: 0.15, inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [20, 60] } },
      stroke: { dashArray: 4 },
      legend: { show: false },
      series: [72],
      labels: ['Approved'],
    })
    c.render()
    ;(valEl as any)._apexChart = c
  }
}


interface DashTdLog {
  id: number
  status: string
  team: string | null
  submitted_by: string | null
  created_at: string
  pole_span: {
    span_code: string
    from_pole: { pole_code: string } | null
    to_pole:   { pole_code: string } | null
  } | null
  node: { node_id: string; city: string | null } | null
}

function tdTimeAgo(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (isNaN(diff) || diff < 1) return 'just now'
  if (diff < 60)   return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return `${Math.floor(diff / 1440)}d ago`
}

const napSurveys = [
  { id: 'NAP-0021', pole: 'PL-8812', area: 'Brgy. Sta. Cruz, Makati', surveyedBy: 'J. Santos', total: 12, used: 9, free: 2, inactive: 1, utilization: 75, status: 'complete',  date: 'Apr 17, 2026' },
  { id: 'NAP-0019', pole: 'PL-7703', area: 'Brgy. Palanan, Makati',   surveyedBy: 'R. Cruz',   total: 8,  used: 5, free: 3, inactive: 0, utilization: 63, status: 'complete',  date: 'Apr 16, 2026' },
  { id: 'NAP-0018', pole: 'PL-8801', area: 'Brgy. Bangkal, Makati',   surveyedBy: 'M. Reyes',  total: 16, used: 14,free: 1, inactive: 1, utilization: 88, status: 'flagged',   date: 'Apr 15, 2026' },
  { id: 'NAP-0016', pole: 'PL-7654', area: 'Brgy. Pio del Pilar, Makati', surveyedBy: 'A. Dela Cruz', total: 12, used: 6, free: 6, inactive: 0, utilization: 50, status: 'pending', date: 'Apr 14, 2026' },
  { id: 'NAP-0015', pole: 'PL-8790', area: 'Brgy. Comembo, Makati',  surveyedBy: 'J. Santos', total: 8,  used: 4, free: 3, inactive: 1, utilization: 50, status: 'complete',  date: 'Apr 13, 2026' },
  { id: 'NAP-0013', pole: 'PL-7621', area: 'Brgy. Pembo, Makati',    surveyedBy: 'R. Cruz',   total: 16, used: 16,free: 0, inactive: 0, utilization: 100,status: 'flagged',   date: 'Apr 12, 2026' },
]

const validationQueue = [
  { id: 'TD-0041', submittedBy: 'J. Santos', pole: 'PL-8812', span: 'SP-1032', evidence: { before: true, after: true, tag: true, gps: true }, date: 'Apr 17, 2026' },
  { id: 'TD-0035', submittedBy: 'R. Cruz', pole: 'PL-7210', span: 'SP-0901', evidence: { before: true, after: true, tag: false, gps: true }, date: 'Apr 16, 2026' },
  { id: 'TD-0033', submittedBy: 'M. Reyes', pole: 'PL-6998', span: 'SP-0875', evidence: { before: true, after: false, tag: true, gps: true }, date: 'Apr 15, 2026' },
  { id: 'TD-0029', submittedBy: 'A. Dela Cruz', pole: 'PL-6540', span: 'SP-0820', evidence: { before: true, after: true, tag: true, gps: false }, date: 'Apr 14, 2026' },
]

const surveyBadge: Record<string, string> = {
  complete: 'bg-green-500/40 text-green-500 dark:bg-green-500/30',
  pending:  'bg-yellow-500/40 text-yellow-500 dark:bg-yellow-500/30',
  flagged:  'bg-red-500/40 text-red-500 dark:bg-red-500/30',
}

const surveyLabel: Record<string, string> = {
  complete: 'Complete',
  pending:  'Pending',
  flagged:  'Flagged',
}


export default function Dashboard() {
  const navigate = useNavigate()
  const [surveyTab, setSurveyTab] = useState<'all' | 'complete' | 'pending' | 'flagged'>('all')
  const [tdLogs, setTdLogs]           = useState<DashTdLog[]>([])
  const [tdLogsLoading, setTdLogsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(initCharts, 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/teardown-logs`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
    })
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
        setTdLogs(arr.slice(0, 8))
      })
      .catch(() => {})
      .finally(() => setTdLogsLoading(false))
  }, [])

  const filteredSurveys = surveyTab === 'all'
    ? napSurveys
    : napSurveys.filter(s => s.status === surveyTab)

  return (
    <>
      {/* Page title */}
      <div className="grid grid-cols-1 pb-6">
        <div className="md:flex items-center justify-between px-[2px]">
          <div>
            <h4 className="text-[18px] font-medium text-gray-800 mb-1 dark:text-gray-100">Good Morning</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">Mark Laurence</p>
          </div>
          <nav className="flex" aria-label="breadcrumb">
            <ol className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <li><a href="#" className="hover:text-violet-500">Globe Telco 1</a></li>
              <li><span className="mx-1">/</span></li>
              <li className="text-gray-700 dark:text-gray-100">Dashboard</li>
            </ol>
          </nav>
        </div>
      </div>

      {/* Row 1 — 4 mini stat cards (same structure as Minia) */}
      <div className="grid grid-cols-1 gap-6 gap-y-0 2xl:gap-6 md:grid-cols-2 2xl:grid-cols-4">
        {[
          { label: 'Total Naps', value: '1,248', badge: '+12 this week', badgeColor: 'bg-green-500/40 text-green-500 dark:bg-green-500/30', chartId: 'mini-chart1' },
          { label: 'Active Subscriber', value: '874', badge: '70.0% complete', badgeColor: 'bg-green-500/40 text-green-500 dark:bg-green-500/30', chartId: 'mini-chart2' },
          { label: 'Inactive Subscriber', value: '58', badge: '+5 new cases', badgeColor: 'bg-red-500/40 text-red-500 dark:bg-red-500/30', chartId: 'mini-chart3' },
          { label: 'Pending For Teardown', value: '23', badge: 'Needs review', badgeColor: 'bg-yellow-500/40 text-yellow-500 dark:bg-yellow-500/30', chartId: 'mini-chart4' },
        ].map(card => (
          <div key={card.chartId} className="card dark:bg-zinc-800 dark:border-zinc-600">
            <div className="card-body">
              <div>
                <div className="grid items-center grid-cols-12 gap-6">
                  <div className="col-span-6">
                    <span className="text-gray-700 dark:text-zinc-100">{card.label}</span>
                    <h4 className="my-4 font-medium text-gray-800 text-21 dark:text-gray-100">{card.value}</h4>
                  </div>
                  <div className="col-span-6">
                    <div id={card.chartId} className="mb-2 apex-charts"></div>
                  </div>
                </div>
              </div>
              <div className="flex items-center mt-1">
                <span className={`text-[10px] py-[1px] px-1 rounded font-medium ${card.badgeColor}`}>{card.badge}</span>
                <span className="ltr:ml-1.5 rtl:mr-1.5 text-gray-700 text-13 dark:text-zinc-100">Since last week</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 — NAP Slot Distribution + Teardown Overview + Validation Progress */}
      <div className="grid grid-cols-1 gap-6 gap-y-0 2xl:gap-6 lg:grid-cols-12 mt-4">

        {/* NAP Slot Distribution */}
        <div className="col-span-12 2xl:col-span-5">
          <div className="card dark:bg-zinc-800 dark:border-zinc-600 card-h-100">
            <div className="card-body h-full flex flex-col justify-center">
              <div className="flex flex-wrap items-center mb-3">
                <h5 className="mr-2 font-medium text-gray-800 text-15 dark:text-gray-100">NAP Slot Distribution</h5>
                <div className="flex gap-1 ltr:ml-auto rtl:mr-auto">
                  {['ALL','1M','6M','1Y'].map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      className={`px-2 py-1 font-medium border-transparent btn text-[12.25px] ${i === 1 ? 'bg-violet-50/50 text-violet-500 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-gray-50/50 text-gray-500 dark:bg-gray-500/10 dark:text-zinc-100'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-12 2xl:gap-6 justify-items-stretch">
                <div className="flex items-center justify-center col-span-12 md:col-span-6">
                  <div id="nap-slot-chart" className="apex-charts"></div>
                </div>

                <div className="col-span-12 md:col-span-6 flex items-center">
                  <div className="w-full space-y-4 md:text-left">
                    {[
                      { label: 'Active', val: '342 slots', sub: 'In use', dot: 'text-violet-500' },
                      { label: 'Inactive', val: '187 slots', sub: 'Disconnected', dot: 'text-red-400' },
                      { label: 'Free', val: '95 slots', sub: 'Available', dot: 'text-yellow-500' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-3"
                      >
                        <div className="flex items-center text-gray-800 dark:text-zinc-100">
                          <i className={`mr-2 mdi mdi-circle text-10 ${item.dot}`}></i>
                          <span>{item.label}</span>
                        </div>

                        <div className="text-gray-800 dark:text-gray-100">
                          <span className="font-semibold">{item.val}</span>
                          <span className="ml-1 font-normal text-gray-700 dark:text-zinc-100 text-14">
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
        <div className="col-span-12 2xl:col-span-7">
          <div className="grid grid-cols-12 2xl:gap-6">

            {/* Span Teardown Overview */}
            <div className="col-span-12 2xl:col-span-8">
              <div className="card dark:bg-zinc-800 dark:border-zinc-600 card-h-100">
                <div className="card-body">
                  <div className="flex flex-wrap items-center mb-6">
                    <h5 className="mr-2 text-gray-800 text-15 dark:text-gray-100">Span Teardown Overview</h5>
                    <div className="ltr:ml-auto rtl:mr-auto">
                      <select className="py-0 form-select form-select-sm ltr:pl-4 rtl:pr-4 border-gray-50 bg-gray-50/20 dark:border-zinc-600 dark:text-gray-100 dark:bg-zinc-700">
                        {['2026','2025','2024'].map(y => <option key={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div id="span-teardown-chart" className="apex-charts flex justify-center"></div>
                </div>
              </div>
            </div>

            {/* Validation Progress */}
            <div className="col-span-12 2xl:col-span-4">
              <div className="card dark:bg-zinc-800 dark:border-zinc-600 card-h-100">
                <div className="card-body">
                  <h5 className="mb-4 text-gray-800 text-15 dark:text-gray-100 text-center">Total Audit Poles</h5>
                  <div id="validation-progress-chart" className="apex-charts"></div>
                  <div className="mt-4 space-y-3">
                    {[
                      { label: 'Approved', val: '72%', dot: 'text-violet-500' },
                      { label: 'Pending', val: '18%', dot: 'text-yellow-500' },
                      { label: 'Rejected', val: '10%', dot: 'text-red-500' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center">
                        <i className={`mr-2 align-middle mdi mdi-circle text-10 ${s.dot}`}></i>
                        <span className="grow text-gray-700 dark:text-zinc-100 text-13">{s.label}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-100 text-13">{s.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 — Field Coverage Map + Teardown Logs Preview */}
      <div className="grid grid-cols-12 gap-6 gap-y-0 2xl:gap-6 mt-4">

        {/* Field Coverage Map */}
        <div className="col-span-12 lg:col-span-8">
          <div className="w-full card dark:bg-zinc-800 dark:border-zinc-600" style={{ height: 380 }}>
            <div className="card-body border-b border-gray-50 dark:border-zinc-700 py-2.5">
              <h5 className="text-gray-800 text-15 dark:text-gray-100">Field Coverage Map</h5>
            </div>
            <div className="rounded-b overflow-hidden" style={{ height: 335 }}>
              <FieldCoverageMap />
            </div>
          </div>
        </div>

        {/* Teardown Logs Preview */}
        <div className="col-span-12 lg:col-span-4">
          <div className="card dark:bg-zinc-800 dark:border-zinc-600 card-h-100" style={{ height: 380 }}>
            <div className="card-body border-b border-gray-50 dark:border-zinc-700 py-2.5 flex items-center justify-between">
              <div>
                <h5 className="text-gray-800 text-15 dark:text-gray-100">Teardown Logs</h5>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Live field activity</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {tdLogsLoading && (
                <div className="flex items-center justify-center py-10">
                  <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!tdLogsLoading && tdLogs.length === 0 && (
                <p className="text-center py-10 text-xs text-gray-400 dark:text-zinc-500">No teardown logs found.</p>
              )}
              {!tdLogsLoading && tdLogs.map((log, i) => {
                const from      = String(log?.pole_span?.from_pole?.pole_code ?? '—')
                const to        = String(log?.pole_span?.to_pole?.pole_code   ?? '—')
                const node      = String(log?.node?.node_id ?? '')
                const submitter = String(log?.submitted_by ?? '')
                const team      = String(log?.team ?? '')
                const timeAgo   = tdTimeAgo(log?.created_at)
                const uploaded  = log?.created_at
                  ? new Date(log.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
                  : ''
                return (
                  <div
                    key={i}
                    onClick={() => navigate(`/reports/teardown-logs/${log.id}`)}
                    className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/40 transition-colors ${i < tdLogs.length - 1 ? 'border-b border-gray-50 dark:border-zinc-700/60' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <p className="text-[13px] font-bold text-gray-800 dark:text-zinc-100 truncate">
                          {from} <span className="text-gray-400 dark:text-zinc-500 font-normal mx-0.5">→</span> {to}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-red-500 shrink-0">{timeAgo}</span>
                    </div>
                    {node !== '' && (
                      <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 pl-4 truncate">{node}</p>
                    )}
                    {submitter !== '' && (
                      <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 pl-4 truncate">by {submitter}</p>
                    )}
                    {team !== '' && (
                      <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 pl-4 truncate">{team}</p>
                    )}
                    {uploaded !== '' && (
                      <p className="text-[10px] text-red-400 pl-4 mt-0.5">{uploaded}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Row 4 — NAP Survey + Validation Queue side by side */}
      <div className="grid grid-cols-12 gap-6 gap-y-0 2xl:gap-6 mt-4 mb-3">

        {/* NAP Box Latest Survey */}
        <div className="col-span-12 lg:col-span-6">
          <div className="card dark:bg-zinc-800 dark:border-zinc-600" style={{ height: 460 }}>
            <div className="nav-tabs border-b-tabs">
              <div className="flex pb-0 border-b card-body border-gray-50 dark:border-zinc-700 items-center">
                <div className="grow">
                  <h5 className="text-gray-800 text-15 dark:text-gray-100">NAP Box Latest Survey</h5>
                </div>
                <ul className="flex nav" role="tablist">
                  {([['all','All'],['complete','Complete'],['pending','Pending'],['flagged','Flagged']] as const).map(([v, l]) => (
                    <li key={v} className="nav-item">
                      <a onClick={() => setSurveyTab(v)}
                        className={`inline-block px-3 pb-3 font-medium dark:text-gray-100 cursor-pointer ${surveyTab === v ? 'active' : ''}`}>
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="py-2">
                <div className="px-3" data-simplebar style={{ maxHeight: 390 }}>
                  <table className="table w-full">
                    <thead>
                      <tr className="border-b border-gray-50 dark:border-zinc-700">
                        {['NAP Box','Pole','Surveyed By','Slot Recovery','Date','Status'].map(h => (
                          <th key={h} className="p-3 text-left text-xs font-medium text-gray-600 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSurveys.map(row => {
                        const slotColor = row.utilization >= 90 ? '#ef4444' : row.utilization >= 60 ? '#8b5cf6' : '#22c55e'
                        const slotStatus = row.utilization >= 90 ? 'Full' : row.inactive > 0 ? 'Partial' : 'OK'
                        const slotStatusCls = row.utilization >= 90
                          ? 'bg-red-500/15 text-red-500'
                          : row.inactive > 0
                            ? 'bg-yellow-500/15 text-yellow-500'
                            : 'bg-green-500/15 text-green-600'
                        return (
                          <tr
                            key={row.id}
                            onClick={() => navigate(`/nap/boxes/${row.id}`)}
                            className="border-b border-gray-50/60 dark:border-zinc-700/60 last:border-0 cursor-pointer hover:bg-violet-50/60 dark:hover:bg-violet-500/5 transition-colors group"
                          >
                            <td className="p-3">
                              <span className="font-mono font-semibold text-violet-500 text-[12px] group-hover:underline">{row.id}</span>
                              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">{row.area}</p>
                            </td>
                            <td className="p-3 text-sm font-medium text-gray-700 dark:text-gray-100 whitespace-nowrap">{row.pole}</td>
                            <td className="p-3 text-xs text-gray-500 dark:text-zinc-400 whitespace-nowrap">{row.surveyedBy}</td>
                            <td className="p-3 min-w-[160px]">
                              {/* Slot recovery — styled like backend teardown component rows */}
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold text-gray-700 dark:text-zinc-200">
                                  {row.used} <span className="font-normal text-gray-400">/ {row.total} slots used</span>
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${slotStatusCls}`}>{slotStatus}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-zinc-600 overflow-hidden mb-1">
                                <div className="h-full rounded-full transition-all" style={{ width: `${row.utilization}%`, background: slotColor }} />
                              </div>
                              <div className="flex gap-2 text-[10px] text-gray-400 dark:text-zinc-500">
                                <span><span className="font-semibold text-green-500">{row.free}</span> free</span>
                                {row.inactive > 0 && <span><span className="font-semibold text-red-400">{row.inactive}</span> inactive</span>}
                                <span className="ml-auto font-medium" style={{ color: slotColor }}>{row.utilization}%</span>
                              </div>
                            </td>
                            <td className="p-3 text-xs text-gray-500 dark:text-zinc-400 whitespace-nowrap">{row.date}</td>
                            <td className="p-3">
                              <span className={`text-[10px] py-[1px] px-2 rounded font-medium ${surveyBadge[row.status] ?? ''}`}>
                                {surveyLabel[row.status] ?? row.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Validation Queue */}
        <div className="col-span-12 lg:col-span-6">
          <div className="card dark:bg-zinc-800 dark:border-zinc-600" style={{ height: 460 }}>
            <div className="nav-tabs border-b-tabs">
              <div className="flex pb-0 border-b card-body border-gray-50 dark:border-zinc-700 items-center">
                <h5 className="grow mr-2 text-gray-800 text-15 dark:text-gray-100">Validation Queue</h5>
                <span className="text-[10px] py-[1px] px-2 rounded font-medium bg-yellow-500/40 text-yellow-500 dark:bg-yellow-500/30">
                  {validationQueue.length} pending
                </span>
              </div>
              <div className="py-2">
                <div className="px-3" data-simplebar style={{ maxHeight: 360 }}>
                  <table className="table w-full">
                    <thead>
                      <tr className="border-b border-gray-50 dark:border-zinc-700">
                        {['Ticket','By','Pole','Before','After','Tag','GPS','Date',''].map(h => (
                          <th key={h} className="p-2 text-left text-xs font-medium text-gray-600 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validationQueue.map(row => (
                        <tr key={row.id} className="border-b border-gray-50/60 dark:border-zinc-700/60 last:border-0">
                          <td className="p-2 font-mono font-semibold text-violet-500 text-[11px] whitespace-nowrap">{row.id}</td>
                          <td className="p-2 text-xs text-gray-600 dark:text-zinc-300 whitespace-nowrap">{row.submittedBy}</td>
                          <td className="p-2 text-xs text-gray-600 dark:text-zinc-300 whitespace-nowrap">{row.pole}</td>
                          {(['before','after','tag','gps'] as const).map(ev => (
                            <td key={ev} className="p-2 text-center">
                              {row.evidence[ev]
                                ? <i className="bx bx-check-circle text-green-500 text-base"></i>
                                : <i className="bx bx-x-circle text-red-400 text-base"></i>
                              }
                            </td>
                          ))}
                          <td className="p-2 text-[10px] text-gray-500 dark:text-zinc-400 whitespace-nowrap">{row.date}</td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <button className="px-1.5 py-0.5 text-[10px] rounded bg-green-500 text-white border-transparent btn hover:bg-green-600">✓</button>
                              <button className="px-1.5 py-0.5 text-[10px] rounded bg-red-500 text-white border-transparent btn hover:bg-red-600">✕</button>
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
    </>
  )
}