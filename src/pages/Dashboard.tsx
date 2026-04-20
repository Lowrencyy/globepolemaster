import { useEffect, useState } from 'react'
import FieldCoverageMap from '../components/FieldCoverageMap'

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
  const [surveyTab, setSurveyTab] = useState<'all' | 'complete' | 'pending' | 'flagged'>('all')

  useEffect(() => {
    const timer = setTimeout(initCharts, 100)
    return () => clearTimeout(timer)
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
            <h4 className="text-[18px] font-medium text-gray-800 mb-1 dark:text-gray-100">Globe Telco 1 — Operations Dashboard</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">Pole Audit · NAP Visibility · Cable Teardown · Validation</p>
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

      {/* Row 3 — NAP Survey + Map */}
      <div className="grid grid-cols-12 gap-6 gap-y-0 2xl:gap-6 mt-4">

        {/* NAP Box Latest Survey View */}
        <div className="col-span-12 lg:col-span-8">
          <div className="card dark:bg-zinc-800 dark:border-zinc-600 card-h-100">
            <div className="nav-tabs border-b-tabs">
              <div className="flex pb-0 border-b card-body border-gray-50 dark:border-zinc-700 items-center">
                <div className="grow">
                  <h5 className="text-gray-800 text-15 dark:text-gray-100">NAP Box Latest Survey</h5>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Most recent pole survey submissions</p>
                </div>
                <ul className="flex nav" role="tablist">
                  {([['all','All'],['complete','Complete'],['pending','Pending'],['flagged','Flagged']] as const).map(([v, l]) => (
                    <li key={v} className="nav-item">
                      <a
                        onClick={() => setSurveyTab(v)}
                        className={`inline-block px-4 pb-3 font-medium dark:text-gray-100 cursor-pointer ${surveyTab === v ? 'active' : ''}`}
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="py-3">
                <div className="px-3" data-simplebar style={{ maxHeight: 352 }}>
                  <table className="table w-full">
                    <thead>
                      <tr className="border-b border-gray-50 dark:border-zinc-700">
                        {['NAP Box','Pole','Area','Surveyed By','Slots','Utilization','Date','Status'].map(h => (
                          <th key={h} className="p-3 text-left text-xs font-medium text-gray-600 dark:text-zinc-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSurveys.map(row => (
                        <tr key={row.id} className="border-b border-gray-50/60 dark:border-zinc-700/60 last:border-0">
                          <td className="p-3 font-mono font-medium text-violet-500 text-sm">{row.id}</td>
                          <td className="p-3 text-sm text-gray-700 dark:text-gray-100">{row.pole}</td>
                          <td className="p-3 text-xs text-gray-600 dark:text-zinc-100 max-w-35 truncate">{row.area}</td>
                          <td className="p-3 text-xs text-gray-600 dark:text-zinc-100 whitespace-nowrap">{row.surveyedBy}</td>
                          <td className="p-3">
                            <div className="flex gap-1 text-[10px] font-medium">
                              <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-500">{row.used}U</span>
                              <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">{row.free}F</span>
                              {row.inactive > 0 && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{row.inactive}X</span>}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2 min-w-20">
                              <div className="grow h-1.5 rounded-full bg-gray-200 dark:bg-zinc-600">
                                <div
                                  className={`h-1.5 rounded-full ${row.utilization >= 90 ? 'bg-red-500' : row.utilization >= 60 ? 'bg-violet-500' : 'bg-green-500'}`}
                                  style={{ width: `${row.utilization}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-medium text-gray-700 dark:text-zinc-100 whitespace-nowrap">{row.utilization}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-xs text-gray-600 dark:text-zinc-100 whitespace-nowrap">{row.date}</td>
                          <td className="p-3">
                            <span className={`text-[10px] py-[1px] px-2 rounded font-medium ${surveyBadge[row.status] ?? ''}`}>
                              {surveyLabel[row.status] ?? row.status}
                            </span>
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

        {/* Field Coverage Map */}
        <div className="col-span-12 lg:col-span-4">
          <div className="w-full card dark:bg-zinc-800 dark:border-zinc-600 card-h-100">
            <div className="card-body border-b border-gray-50 dark:border-zinc-700">
              <h5 className="text-gray-800 text-15 dark:text-gray-100">Field Coverage Map</h5>
            </div>
            <div className="rounded-b overflow-hidden" style={{ height: 380 }}>
              <FieldCoverageMap />
            </div>
          </div>
        </div>
      </div>

      {/* Row 4 — Validation Queue */}
      <div className="grid grid-cols-1 gap-6 gap-y-0 2xl:gap-6 mt-4 mb-3">
        <div className="card dark:bg-zinc-800 dark:border-zinc-600">
          <div className="nav-tabs border-b-tabs">
            <div className="flex pb-0 border-b card-body border-gray-50 dark:border-zinc-700">
              <h5 className="grow mr-2 text-gray-800 text-15 dark:text-gray-100">Validation Queue</h5>
              <span className="text-[10px] py-[1px] px-2 rounded font-medium bg-yellow-500/40 text-yellow-500 dark:bg-yellow-500/30 self-center">
                {validationQueue.length} pending
              </span>
            </div>
            <div className="py-3">
              <div className="px-3" data-simplebar style={{ maxHeight: 352 }}>
                <table className="table w-full">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-zinc-700">
                      {['Ticket','Submitted By','Pole','Span','Before','After','Pole Tag','GPS Map','Date','Action'].map(h => (
                        <th key={h} className="p-3 text-left text-xs font-medium text-gray-600 dark:text-zinc-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validationQueue.map(row => (
                      <tr key={row.id}>
                        <td className="p-3 font-medium text-violet-500 text-sm">{row.id}</td>
                        <td className="p-3 text-sm text-gray-700 dark:text-gray-100">{row.submittedBy}</td>
                        <td className="p-3 text-sm text-gray-700 dark:text-gray-100">{row.pole}</td>
                        <td className="p-3 text-sm text-gray-700 dark:text-gray-100">{row.span}</td>
                        {(['before','after','tag','gps'] as const).map(ev => (
                          <td key={ev} className="p-3 text-center">
                            {row.evidence[ev]
                              ? <i className="bx bx-check-circle text-green-500 text-lg"></i>
                              : <i className="bx bx-x-circle text-red-500 text-lg"></i>
                            }
                          </td>
                        ))}
                        <td className="p-3 text-xs text-gray-600 dark:text-zinc-100 whitespace-nowrap">{row.date}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <button className="px-2 py-1 text-xs rounded bg-green-500 text-white border-transparent btn hover:bg-green-600">Approve</button>
                            <button className="px-2 py-1 text-xs rounded bg-red-500 text-white border-transparent btn hover:bg-red-600">Reject</button>
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
    </>
  )
}