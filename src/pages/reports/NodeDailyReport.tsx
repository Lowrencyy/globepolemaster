import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  offline_mode: boolean
  notes: string | null
  team: { name: string } | null
  lineman: { first_name: string; last_name: string } | null
  span: {
    id: number
    span_code: string | null
    length_meters: number | string
    status: string
    fromPole?: { pole: { pole_code: string } | null } | null
    toPole?: { pole: { pole_code: string } | null } | null
    components: SpanComponent[]
  } | null
}

interface NodeInfo {
  id: number
  name: string
  full_label: string | null
  status: string
  expected_cable: number
  actual_cable: number
  progress_percentage: number
  area: { id: number; name: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | string | null | undefined, dec = 2) {
  return Number(n ?? 0)
    .toFixed(dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtTime(s: string | null) {
  if (!s) return '—'

  return new Date(s).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function fmtDateTime(s: string | null) {
  if (!s) return '—'

  return new Date(s).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function workDur(mins: number | null, start: string | null, end: string | null) {
  const m =
    mins ??
    (start && end
      ? Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000))
      : null)

  if (!m) return '—'

  const h = Math.floor(m / 60)
  const rm = m % 60

  return h > 0 ? `${h}h ${rm}m` : `${rm}m`
}

function safeFileName(value: string) {
  return value
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

function getComponentCount(
  components: SpanComponent[] | undefined,
  type: string,
  field: 'expected_count' | 'actual_count' = 'actual_count'
) {
  const component = components?.find(c => c.component_type === type)
  return Number(component?.[field] ?? 0)
}

function componentCell(
  components: SpanComponent[] | undefined,
  type: string,
  label: string
) {
  const expected = getComponentCount(components, type, 'expected_count')
  const actual = getComponentCount(components, type, 'actual_count')

  return {
    label,
    expected,
    actual,
    complete: expected > 0 && actual >= expected,
    hasValue: expected > 0 || actual > 0,
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  subcon_approved: 'Subcon Approved',
  backend_approved: 'Approved',
  rejected: 'Rejected',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NodeDailyReport() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const printRef = useRef<HTMLDivElement>(null)

  const nodeCacheKey = `node_dr_info_${nodeId}`
  const tdCacheKey = `node_dr_td_${nodeId}`

  const cachedNode = useMemo(() => cacheGet<NodeInfo>(nodeCacheKey), [nodeCacheKey])
  const cachedTeardowns = useMemo(() => cacheGet<TeardownEntry[]>(tdCacheKey), [tdCacheKey])

  const [node, setNode] = useState<NodeInfo | null>(cachedNode ?? null)
  const [teardowns, setTeardowns] = useState<TeardownEntry[]>(cachedTeardowns ?? [])
  const [loading, setLoading] = useState(!cachedNode && !cachedTeardowns)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasCachedData = Boolean(cachedNode || cachedTeardowns)

  useEffect(() => {
    let alive = true

    const headers = {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/json',
      'ngrok-skip-browser-warning': '1',
    }

    async function loadReport() {
      if (hasCachedData) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const [nodeData, tdData] = await Promise.all([
          fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers }).then(r => r.json()),
          fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=500`, { headers }).then(r =>
            r.json()
          ),
        ])

        if (!alive) return

        if (nodeData?.id) {
          setNode(nodeData)
          cacheSet(nodeCacheKey, nodeData)
        }

        const list: TeardownEntry[] = Array.isArray(tdData) ? tdData : tdData?.data ?? []

        setTeardowns(list)
        cacheSet(tdCacheKey, list)
      } catch {
        if (!alive) return

        if (!hasCachedData) {
          setError('Failed to load report data')
        }
      } finally {
        if (!alive) return

        setLoading(false)
        setRefreshing(false)
      }
    }

    loadReport()

    return () => {
      alive = false
    }
  }, [nodeId, nodeCacheKey, tdCacheKey, hasCachedData])

  const reportRows = useMemo(() => teardowns, [teardowns])

  const totalCableExp = useMemo(
    () => reportRows.reduce((sum, td) => sum + Number(td.expected_cable ?? 0), 0),
    [reportRows]
  )

  const totalCableAct = useMemo(
    () => reportRows.reduce((sum, td) => sum + Number(td.actual_cable ?? 0), 0),
    [reportRows]
  )

  const cablePct = totalCableExp > 0 ? Math.round((totalCableAct / totalCableExp) * 100) : 0
  const approvedCount = reportRows.filter(td => td.status === 'backend_approved').length

  const nodeTotal = reportRows.reduce(
    (sum, td) => sum + getComponentCount(td.span?.components, 'node'),
    0
  )

  const ampTotal = reportRows.reduce(
    (sum, td) => sum + getComponentCount(td.span?.components, 'amplifier'),
    0
  )

  const extenderTotal = reportRows.reduce(
    (sum, td) => sum + getComponentCount(td.span?.components, 'extender'),
    0
  )

  const tscTotal = reportRows.reduce(
    (sum, td) => sum + getComponentCount(td.span?.components, 'tsc'),
    0
  )

  const psTotal = reportRows.reduce(
    (sum, td) => sum + getComponentCount(td.span?.components, 'powersupply'),
    0
  )

  const psCaseTotal = reportRows.reduce(
    (sum, td) => sum + getComponentCount(td.span?.components, 'powersupply_case'),
    0
  )

  const nodeLabel = node?.full_label ?? node?.name ?? `Node #${nodeId}`
  const generatedAt = new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  function exportExcel() {
    const wb = XLSX.utils.book_new()

    const rows = [
      ['Node Report — ' + nodeLabel],
      ['Area: ' + (node?.area?.name ?? '—')],
      ['Scope: All teardown rows for this node'],
      ['Exported Rows: ' + reportRows.length],
      ['Generated: ' + new Date().toLocaleString('en-PH')],
      [],
      [
        '#',
        'Span Code',
        'From Pole',
        'To Pole',
        'Length (m)',
        'Expected Cable (m)',
        'Collected Cable (m)',
        'Recovery %',
        'Node Box',
        'Amplifier',
        'Extender',
        'TSC',
        'Power Supply',
        'PS Case',
        'Team',
        'Lineman',
        'Start Date/Time',
        'End Date/Time',
        'Duration',
        'Status',
      ],
      ...reportRows.map((td, index) => {
        const cExp = Number(td.expected_cable ?? 0)
        const cAct = Number(td.actual_cable ?? 0)
        const pct = cExp > 0 ? Math.round((cAct / cExp) * 100) : 0

        return [
          index + 1,
          td.span?.span_code ?? `#${td.id}`,
          td.span?.fromPole?.pole?.pole_code ?? '—',
          td.span?.toPole?.pole?.pole_code ?? '—',
          Number(td.span?.length_meters ?? 0),
          cExp,
          cAct,
          pct + '%',
          getComponentCount(td.span?.components, 'node'),
          getComponentCount(td.span?.components, 'amplifier'),
          getComponentCount(td.span?.components, 'extender'),
          getComponentCount(td.span?.components, 'tsc'),
          getComponentCount(td.span?.components, 'powersupply'),
          getComponentCount(td.span?.components, 'powersupply_case'),
          td.team?.name ?? '—',
          td.lineman ? `${td.lineman.first_name} ${td.lineman.last_name}` : '—',
          fmtDateTime(td.start_time),
          fmtDateTime(td.end_time),
          workDur(td.duration_minutes, td.start_time, td.end_time),
          STATUS_LABELS[td.status] ?? td.status,
        ]
      }),
      [],
      [
        '',
        '',
        '',
        'TOTALS',
        '',
        totalCableExp,
        totalCableAct,
        cablePct + '%',
        nodeTotal,
        ampTotal,
        extenderTotal,
        tscTotal,
        psTotal,
        psCaseTotal,
      ],
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws['!cols'] = [
      { wch: 4 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 8 },
      { wch: 14 },
      { wch: 10 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 18 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Node Report')
    XLSX.writeFile(wb, `Node_Report_${safeFileName(nodeLabel)}_all_rows.xlsx`)
  }

  if (loading && !node && teardowns.length === 0) {
    return (
      <div className="flex items-center justify-center py-28">
        <div className="text-center">
          <div className="relative mx-auto h-14 w-14">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            <div className="absolute inset-3 rounded-full bg-sky-500/10" />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-400">Loading node report...</p>
        </div>
      </div>
    )
  }

  if (error && !node && teardowns.length === 0) {
    return (
      <div className="flex items-center justify-center py-28">
        <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-center dark:border-red-500/20 dark:bg-red-500/10">
          <i className="bx bx-error-circle text-3xl text-red-500" />
          <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #daily-report-print, #daily-report-print * { visibility: visible !important; }
          #daily-report-print {
            position: fixed;
            inset: 0;
            padding: 10mm 12mm;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .no-print { display: none !important; }
          .report-table th, .report-table td { font-size: 8pt !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="flex flex-col gap-5 pb-12">
        {/* Top visible action bar */}
        <div
          className="no-print sticky top-0 z-30 rounded-[28px] border border-white/70 bg-white/90 p-3 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/[0.04] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/90 dark:ring-white/10"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            border: '1px solid rgba(226, 232, 240, 0.9)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/dailyreports')}
              className="inline-flex h-12 items-center gap-2 rounded-2xl px-4 text-sm font-bold shadow-sm transition hover:-translate-y-px"
              style={{
                backgroundColor: '#ffffff',
                color: '#334155',
                border: '1px solid #e2e8f0',
                outline: 'none',
              }}
            >
              <i className="bx bx-arrow-back text-lg" style={{ color: '#334155' }} />
              <span style={{ color: '#334155', fontWeight: 800 }}>All Nodes</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {refreshing && (
                <div
                  className="hidden items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold sm:flex"
                  style={{
                    backgroundColor: '#eff6ff',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                  }}
                >
                  <i className="bx bx-refresh animate-spin text-sm" />
                  <span>Updating cache...</span>
                </div>
              )}

              <div
                className="rounded-2xl px-4 py-2 text-xs font-black"
                style={{
                  backgroundColor: '#f8fafc',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                }}
              >
                {reportRows.length} row{reportRows.length !== 1 ? 's' : ''}
              </div>

              <button
                type="button"
                onClick={exportExcel}
                disabled={reportRows.length === 0}
                title="Download Excel file for all teardown rows of this node"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    reportRows.length === 0
                      ? '#94a3b8'
                      : 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                  color: '#ffffff',
                  border: '0',
                  outline: 'none',
                  minWidth: '190px',
                  boxShadow: '0 18px 36px -18px rgba(5,150,105,0.85)',
                }}
              >
                <i className="bx bx-download text-xl" style={{ color: '#ffffff' }} />
                <span style={{ color: '#ffffff', fontWeight: 900 }}>
                  Export as Excel
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Report */}
        <div
          id="daily-report-print"
          ref={printRef}
          className="overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.6)] ring-1 ring-slate-950/[0.04] dark:border-white/10 dark:bg-zinc-900 dark:ring-white/10"
        >
          {/* Header */}
          <div className="relative overflow-hidden bg-[#10243d] px-6 py-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.45),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.32),transparent_30%)]" />
            <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl" />

            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur-xl">
                  <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/40 to-transparent" />
                  <i className="bx bx-file text-[28px]" />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">
                    Globe Telecom · Skycable Teardown
                  </p>

                  <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-white">
                    Node Report
                  </h1>

                  <p className="mt-1 text-sm font-semibold text-sky-100/85">
                    All teardown records and collectable components for this node
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-right backdrop-blur-xl">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
                  Node
                </p>

                <p className="mt-1 text-xl font-black tracking-[-0.03em] text-white">
                  {node?.name ?? `Node #${nodeId}`}
                </p>

                {node?.full_label && (
                  <p className="mt-0.5 font-mono text-xs text-sky-200">{node.full_label}</p>
                )}

                {node?.area && (
                  <p className="mt-0.5 text-xs font-semibold text-sky-100/75">{node.area.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Premium cards row */}
          <div className="no-print overflow-x-auto border-b border-slate-200 bg-slate-50/70 px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-zinc-800 dark:bg-zinc-950/40">
            <div className="grid min-w-[1180px] grid-cols-6 gap-3 lg:min-w-0">
              {[
                {
                  label: 'Total Records',
                  value: reportRows.length,
                  icon: 'bx bx-list-check',
                  accent: 'from-indigo-500 to-violet-600',
                  helper: 'all rows',
                },
                {
                  label: 'Approved',
                  value: approvedCount,
                  icon: 'bx bx-check-shield',
                  accent: 'from-emerald-500 to-teal-600',
                  helper: 'backend approved',
                },
                {
                  label: 'Cable Expected',
                  value: `${fmt(totalCableExp)} m`,
                  icon: 'bx bx-cable-car',
                  accent: 'from-blue-500 to-sky-600',
                  helper: 'target cable',
                },
                {
                  label: 'Cable Collected',
                  value: `${fmt(totalCableAct)} m`,
                  icon: 'bx bx-package',
                  accent: 'from-cyan-500 to-blue-600',
                  helper: 'actual cable',
                },
                {
                  label: 'Recovery Rate',
                  value: `${cablePct}%`,
                  icon: 'bx bx-trending-up',
                  accent:
                    cablePct >= 90
                      ? 'from-emerald-500 to-teal-600'
                      : cablePct >= 70
                        ? 'from-amber-500 to-orange-500'
                        : 'from-red-500 to-rose-600',
                  helper: 'collection ratio',
                },
                {
                  label: 'Components',
                  value: nodeTotal + ampTotal + extenderTotal + tscTotal + psTotal + psCaseTotal,
                  icon: 'bx bx-cube',
                  accent: 'from-violet-500 to-purple-600',
                  helper: 'collected items',
                },
              ].map(card => (
                <div
                  key={card.label}
                  className="group relative overflow-hidden rounded-[24px] border border-white/70 bg-white p-[1px] shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/[0.04] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-40px_rgba(14,116,144,0.65)] dark:border-white/10 dark:bg-zinc-900 dark:ring-white/10"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-20`} />
                  <div className="absolute inset-[1px] rounded-[23px] bg-gradient-to-br from-white via-slate-50 to-white dark:from-zinc-900 dark:via-slate-950 dark:to-zinc-900" />
                  <div
                    className={`absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${card.accent} opacity-20 blur-2xl transition group-hover:scale-125 group-hover:opacity-30`}
                  />

                  <div className="relative flex min-h-[128px] items-start justify-between gap-3 rounded-[23px] p-5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        {card.label}
                      </p>

                      <p className="mt-3 truncate font-mono text-[26px] font-black leading-none tracking-[-0.06em] text-slate-900 dark:text-white">
                        {card.value}
                      </p>

                      <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${card.accent}`} />
                        {card.helper}
                      </div>
                    </div>

                    <div
                      className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.8)]`}
                    >
                      <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/45 to-transparent" />
                      <i className={`${card.icon} relative text-[22px]`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table title */}
          <div className="px-5 pt-5 pb-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
                  Teardown Activities
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-zinc-400">
                  Cable recovery and collectable components are shown in one table.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  {reportRows.length} record{reportRows.length !== 1 ? 's' : ''}
                </div>

                <div className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400">
                  Components included
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          {reportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-zinc-400 dark:text-zinc-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-zinc-800">
                <i className="bx bx-file-blank text-4xl" />
              </div>
              <p className="text-sm font-semibold">No teardown activity found for this node.</p>
            </div>
          ) : (
            <div className="px-5 pb-5">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <div className="overflow-x-auto">
                  <table className="report-table w-full min-w-[1660px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-[#10243d]">
                        {[
                          '#',
                          'Span Code',
                          'From Pole',
                          'To Pole',
                          'Length',
                          'Expected',
                          'Collected',
                          'Recovery',
                          'Node',
                          'Amp',
                          'Ext',
                          'TSC',
                          'PS',
                          'PS Case',
                          'Team',
                          'Lineman',
                          'Start',
                          'End',
                          'Duration',
                          'Status',
                        ].map((heading, index) => (
                          <th
                            key={heading}
                            className={`border-b border-white/10 px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.14em] text-white/90 ${
                              index === 0 ? 'rounded-tl-[23px]' : ''
                            } ${index === 19 ? 'rounded-tr-[23px]' : ''}`}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {reportRows.map((td, index) => {
                        const cExp = Number(td.expected_cable ?? 0)
                        const cAct = Number(td.actual_cable ?? 0)
                        const pct = cExp > 0 ? Math.round((cAct / cExp) * 100) : 0
                        const from = td.span?.fromPole?.pole?.pole_code ?? '—'
                        const to = td.span?.toPole?.pole?.pole_code ?? '—'
                        const span = td.span?.span_code ?? `#${td.id}`

                        const components = [
                          componentCell(td.span?.components, 'node', 'Node'),
                          componentCell(td.span?.components, 'amplifier', 'Amp'),
                          componentCell(td.span?.components, 'extender', 'Ext'),
                          componentCell(td.span?.components, 'tsc', 'TSC'),
                          componentCell(td.span?.components, 'powersupply', 'PS'),
                          componentCell(td.span?.components, 'powersupply_case', 'PS Case'),
                        ]

                        return (
                          <tr
                            key={td.id}
                            className="group transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-sky-50/70 dark:odd:bg-zinc-900 dark:even:bg-zinc-800/35 dark:hover:bg-sky-500/5"
                          >
                            <td className="border-b border-slate-100 px-3 py-3 text-center font-mono text-[11px] font-black text-slate-400 dark:border-zinc-800 dark:text-zinc-500">
                              {index + 1}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 dark:border-zinc-800">
                              <span className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-2.5 py-1 font-mono text-[11px] font-black text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20">
                                <i className="bx bx-git-branch text-xs" />
                                {span}
                              </span>
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 font-mono text-[11px] font-bold text-slate-700 dark:border-zinc-800 dark:text-zinc-200">
                              {from}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 font-mono text-[11px] font-bold text-slate-700 dark:border-zinc-800 dark:text-zinc-200">
                              {to}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center font-semibold text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
                              {fmt(td.span?.length_meters, 1)} m
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center font-semibold text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
                              {fmt(cExp)} m
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center font-black text-slate-800 dark:border-zinc-800 dark:text-zinc-100">
                              {fmt(cAct)} m
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center dark:border-zinc-800">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${
                                  pct >= 90
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                    : pct >= 70
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                      : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                                }`}
                              >
                                {pct}%
                              </span>
                            </td>

                            {components.map(component => (
                              <td
                                key={component.label}
                                className="border-b border-slate-100 px-3 py-3 text-center dark:border-zinc-800"
                              >
                                {component.hasValue ? (
                                  <span
                                    className={`inline-flex min-w-10 justify-center rounded-full px-2.5 py-1 text-[11px] font-black ${
                                      component.complete
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                        : 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400'
                                    }`}
                                    title={`${component.label}: ${component.actual}/${component.expected}`}
                                  >
                                    {component.actual}/{component.expected}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                            ))}

                            <td className="border-b border-slate-100 px-3 py-3 text-slate-600 dark:border-zinc-800 dark:text-zinc-300">
                              {td.team?.name ?? '—'}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-slate-600 dark:border-zinc-800 dark:text-zinc-300">
                              {td.lineman
                                ? `${td.lineman.first_name} ${td.lineman.last_name}`
                                : '—'}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center font-medium text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
                              {fmtTime(td.start_time)}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center font-medium text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
                              {fmtTime(td.end_time)}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 text-center font-bold text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
                              {workDur(td.duration_minutes, td.start_time, td.end_time)}
                            </td>

                            <td className="border-b border-slate-100 px-3 py-3 dark:border-zinc-800">
                              <StatusBadge status={td.status} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-zinc-800">
                        <td
                          colSpan={5}
                          className="px-3 py-3 text-right text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 dark:text-zinc-300"
                        >
                          Totals
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {fmt(totalCableExp)} m
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-900 dark:text-white">
                          {fmt(totalCableAct)} m
                        </td>

                        <td
                          className="px-3 py-3 text-center font-black"
                          style={{
                            color: cablePct >= 90 ? '#10b981' : cablePct >= 70 ? '#f59e0b' : '#ef4444',
                          }}
                        >
                          {cablePct}%
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {nodeTotal}
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {ampTotal}
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {extenderTotal}
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {tscTotal}
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {psTotal}
                        </td>

                        <td className="px-3 py-3 text-center font-black text-slate-700 dark:text-zinc-200">
                          {psCaseTotal}
                        </td>

                        <td colSpan={6} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-6 py-4 dark:border-zinc-800">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500">
              Generated: {generatedAt}
            </p>

            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
              Globe Telecom · Skycable Operations
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    backend_approved:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
    subcon_approved:
      'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20',
    submitted:
      'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20',
    rejected:
      'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20',
    pending:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ${
        map[status] ?? map.pending
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}