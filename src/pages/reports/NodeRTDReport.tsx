import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

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

const BRAND = {
  blue: '#2E3791',
  blue2: '#4450C4',
  dark: '#1F276F',
  textDark: '#0D123F',
  soft: '#EEF1FF',
  softer: '#F7F8FF',
  panel: '#F4F6FF',
  border: '#D8DCFF',
  borderStrong: '#C9D0FF',
  muted: '#6B73A8',
  muted2: '#8E96C5',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  subcon_approved: 'Subcon Approved',
  backend_approved: 'Approved',
  rejected: 'Rejected',
}

const COMP_LABELS: Record<string, string> = {
  node: 'Node Box',
  amplifier: 'Amplifier',
  extender: 'Extender',
  tsc: 'TSC',
  powersupply: 'Power Supply',
  powersupply_case: 'PS Case',
}

function fmt(n: number | string | null | undefined, dec = 2) {
  return Number(n ?? 0)
    .toFixed(dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtDate(s: string | null) {
  if (!s) return '—'

  return new Date(s).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtTime(s: string | null) {
  if (!s) return '—'

  return new Date(s).toLocaleTimeString('en-PH', {
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

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function safeFileName(value: string) {
  return value
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

function statusStyle(status: string) {
  if (status === 'backend_approved') {
    return {
      bg: '#ecfdf5',
      text: '#047857',
      border: '#a7f3d0',
      dot: '#10b981',
    }
  }

  if (status === 'subcon_approved') {
    return {
      bg: BRAND.soft,
      text: BRAND.blue,
      border: BRAND.borderStrong,
      dot: BRAND.blue,
    }
  }

  if (status === 'submitted') {
    return {
      bg: '#f5f3ff',
      text: '#6d28d9',
      border: '#ddd6fe',
      dot: '#8b5cf6',
    }
  }

  if (status === 'rejected') {
    return {
      bg: '#fef2f2',
      text: '#b91c1c',
      border: '#fecaca',
      dot: '#ef4444',
    }
  }

  return {
    bg: '#fffbeb',
    text: '#b45309',
    border: '#fde68a',
    dot: '#f59e0b',
  }
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
    hasValue: expected > 0 || actual > 0,
    complete: expected > 0 && actual >= expected,
  }
}

export default function NodeRTDReport() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()

  const [node, setNode] = useState<NodeInfo | null>(() =>
    nodeId ? cacheGet<NodeInfo>(`rtd_info_${nodeId}`) : null
  )
  const [teardowns, setTeardowns] = useState<TeardownEntry[]>(() =>
    nodeId ? cacheGet<TeardownEntry[]>(`rtd_td_${nodeId}`) ?? [] : []
  )

  const [loading, setLoading] = useState(() => {
    if (!nodeId) return true
    return !cacheGet<NodeInfo>(`rtd_info_${nodeId}`) && !cacheGet<TeardownEntry[]>(`rtd_td_${nodeId}`)
  })

  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!nodeId) return

    let alive = true

    const hitNode = cacheGet<NodeInfo>(`rtd_info_${nodeId}`)
    const hitTd = cacheGet<TeardownEntry[]>(`rtd_td_${nodeId}`)
    const hasCache = Boolean(hitNode || hitTd)

    if (hitNode) setNode(hitNode)
    if (hitTd) setTeardowns(hitTd)

    if (hasCache) {
      setLoading(false)
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    Promise.all([
      fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=500`, {
        headers: authHeaders(),
      }).then(r => r.json()),
    ])
      .then(([nodeData, tdData]) => {
        if (!alive) return

        if (nodeData?.id) {
          setNode(nodeData)
          cacheSet(`rtd_info_${nodeId}`, nodeData)
        }

        const list: TeardownEntry[] = Array.isArray(tdData) ? tdData : tdData?.data ?? []

        setTeardowns(list)
        cacheSet(`rtd_td_${nodeId}`, list)
      })
      .catch(() => {})
      .finally(() => {
        if (!alive) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      alive = false
    }
  }, [nodeId])

  const all = teardowns

  const totalExp = useMemo(
    () => all.reduce((sum, item) => sum + Number(item.expected_cable ?? 0), 0),
    [all]
  )

  const totalAct = useMemo(
    () => all.reduce((sum, item) => sum + Number(item.actual_cable ?? 0), 0),
    [all]
  )

  const cablePct = totalExp > 0 ? Math.round((totalAct / totalExp) * 100) : 0
  const approvedCount = all.filter(item => item.status === 'backend_approved').length

  const compMap = useMemo(() => {
    const map: Record<string, { expected: number; actual: number; unit: string }> = {}

    all.forEach(td => {
      ;(td.span?.components ?? []).forEach(component => {
        if (component.component_type === 'cable') return

        if (!map[component.component_type]) {
          map[component.component_type] = {
            expected: 0,
            actual: 0,
            unit: component.unit,
          }
        }

        map[component.component_type].expected += Number(component.expected_count ?? 0)
        map[component.component_type].actual += Number(component.actual_count ?? 0)
      })
    })

    return map
  }, [all])

  const linemanMap = useMemo(() => {
    const map: Record<string, { teardowns: number; cable: number }> = {}

    all.forEach(td => {
      const key = td.lineman
        ? `${td.lineman.first_name} ${td.lineman.last_name}`
        : 'Unknown'

      if (!map[key]) {
        map[key] = {
          teardowns: 0,
          cable: 0,
        }
      }

      map[key].teardowns += 1
      map[key].cable += Number(td.actual_cable ?? 0)
    })

    return map
  }, [all])

  const nodeLabel = node?.full_label ?? node?.name ?? `Node #${nodeId}`

  function exportExcel() {
    const wb = XLSX.utils.book_new()

    const tdRows = [
      ['RTD Report — ' + nodeLabel],
      ['Area: ' + (node?.area?.name ?? '—')],
      ['Generated: ' + new Date().toLocaleString('en-PH')],
      [],
      [
        '#',
        'Date',
        'Span Code',
        'From Pole',
        'To Pole',
        'Span Length (m)',
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
        'Start Time',
        'End Time',
        'Duration',
        'Status',
      ],
      ...all.map((td, index) => {
        const cExp = Number(td.expected_cable ?? 0)
        const cAct = Number(td.actual_cable ?? 0)
        const pct = cExp > 0 ? Math.round((cAct / cExp) * 100) : 0

        return [
          index + 1,
          fmtDate(td.start_time),
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
          fmtTime(td.start_time),
          fmtTime(td.end_time),
          workDur(td.duration_minutes, td.start_time, td.end_time),
          STATUS_LABELS[td.status] ?? td.status,
        ]
      }),
      [],
      [
        '',
        '',
        '',
        '',
        'TOTALS',
        '',
        totalExp,
        totalAct,
        cablePct + '%',
      ],
    ]

    const ws1 = XLSX.utils.aoa_to_sheet(tdRows)

    ws1['!cols'] = [
      { wch: 4 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 8 },
      { wch: 14 },
      { wch: 10 },
      { wch: 18 },
      { wch: 22 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
    ]

    XLSX.utils.book_append_sheet(wb, ws1, 'Teardown Activities')

    const lmRows = [
      ['Per-Lineman Summary — ' + nodeLabel],
      [],
      ['Lineman', 'Teardowns', 'Total Collected (m)'],
      ...Object.entries(linemanMap).map(([name, data]) => [
        name,
        data.teardowns,
        Number(data.cable.toFixed(2)),
      ]),
      [],
      ['TOTAL', all.length, Number(totalAct.toFixed(2))],
    ]

    const ws2 = XLSX.utils.aoa_to_sheet(lmRows)
    ws2['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Per Lineman')

    const compRows = [
      ['Component Summary — ' + nodeLabel],
      [],
      ['Component', 'Expected', 'Collected', 'Unit', 'Status'],
      ...Object.entries(compMap).map(([type, data]) => [
        COMP_LABELS[type] ?? type,
        data.expected,
        data.actual,
        data.unit,
        data.actual >= data.expected ? 'Complete' : `Short ${data.expected - data.actual}`,
      ]),
    ]

    const ws3 = XLSX.utils.aoa_to_sheet(compRows)
    ws3['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Component Summary')

    XLSX.writeFile(wb, `RTD_${safeFileName(nodeLabel)}.xlsx`)
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-[28px] px-6 py-7"
        style={{
          background: `linear-gradient(135deg, #ffffff 0%, ${BRAND.softer} 40%, ${BRAND.soft} 100%)`,
          border: `1px solid ${BRAND.borderStrong}`,
          boxShadow: '0 24px 60px -38px rgba(46,55,145,0.38)',
        }}
      >
        <div
          className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'rgba(46,55,145,0.12)' }}
        />

        <div
          className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'rgba(68,80,196,0.12)' }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                backgroundColor: BRAND.soft,
                color: BRAND.blue,
                border: `1px solid ${BRAND.borderStrong}`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND.blue }} />
              RTD Report
            </span>

            <h2
              className="mt-3 text-3xl font-black tracking-[-0.05em]"
              style={{ color: BRAND.blue }}
            >
              {node?.name ?? `Node #${nodeId}`}
            </h2>

            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>
              {node?.full_label ?? 'All teardown activities for this node'}
              {node?.area?.name ? ` · ${node.area.name}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {refreshing && (
              <span
                className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:inline-flex"
                style={{
                  backgroundColor: BRAND.soft,
                  color: BRAND.blue,
                  border: `1px solid ${BRAND.borderStrong}`,
                }}
              >
                <i className="bx bx-refresh animate-spin text-sm" />
                Updating cache...
              </span>
            )}

            <button
              type="button"
              onClick={() => navigate('/reports/rtd')}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold"
              style={{
                background: '#ffffff',
                border: `1px solid ${BRAND.borderStrong}`,
                color: BRAND.dark,
              }}
            >
              <i className="bx bx-arrow-back text-base" />
              All Nodes
            </button>

            <button
              type="button"
              onClick={exportExcel}
              disabled={all.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background:
                  all.length === 0
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
                color: '#ffffff',
              }}
            >
              <i className="bx bx-download text-base" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div
        className="rounded-[24px] p-4"
        style={{
          background: BRAND.panel,
          border: `1px solid ${BRAND.border}`,
        }}
      >
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-[1080px] grid-cols-5 gap-4 xl:min-w-0">
            {[
              {
                label: 'Teardowns',
                value: all.length,
                icon: 'bx bx-list-check',
                accent: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
              },
              {
                label: 'Approved',
                value: approvedCount,
                icon: 'bx bx-check-circle',
                accent: 'linear-gradient(135deg, #059669, #0d9488)',
              },
              {
                label: 'Expected',
                value: `${fmt(totalExp)} m`,
                icon: 'bx bx-cable-car',
                accent: 'linear-gradient(135deg, #1F276F 0%, #2E3791 100%)',
              },
              {
                label: 'Collected',
                value: `${fmt(totalAct)} m`,
                icon: 'bx bx-package',
                accent: 'linear-gradient(135deg, #2E3791 0%, #5362D8 100%)',
              },
              {
                label: 'Recovery',
                value: `${cablePct}%`,
                icon: 'bx bx-trending-up',
                accent:
                  cablePct >= 90
                    ? 'linear-gradient(135deg, #059669, #0d9488)'
                    : cablePct >= 70
                      ? 'linear-gradient(135deg, #ea580c, #f59e0b)'
                      : 'linear-gradient(135deg, #e11d48, #be185d)',
              },
            ].map(card => (
              <div
                key={card.label}
                className="rounded-[20px] bg-white p-4"
                style={{
                  border: `1px solid ${BRAND.border}`,
                  boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-[10px] font-black uppercase tracking-[0.16em]"
                      style={{ color: BRAND.muted2 }}
                    >
                      {card.label}
                    </p>

                    <p
                      className="mt-2 truncate font-mono text-[24px] font-black leading-none"
                      style={{ color: BRAND.textDark }}
                    >
                      {card.value}
                    </p>
                  </div>

                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ background: card.accent }}
                  >
                    <i className={`${card.icon} text-[22px]`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main table */}
      <div
        className="overflow-hidden rounded-[20px] bg-white"
        style={{
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
        }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: BRAND.border }}
        >
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.16em]"
              style={{ color: BRAND.muted2 }}
            >
              Teardown Activities
            </p>

            <h3 className="mt-1 text-lg font-black" style={{ color: BRAND.textDark }}>
              {all.length} record{all.length !== 1 ? 's' : ''}
            </h3>
          </div>

          <span
            className="rounded-xl px-3 py-2 text-xs font-black"
            style={{
              backgroundColor: BRAND.softer,
              color: BRAND.muted,
              border: `1px solid ${BRAND.border}`,
            }}
          >
            Components included
          </span>
        </div>

        {loading && all.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div
                className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }}
              />
              <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>
                Loading RTD report...
              </p>
            </div>
          </div>
        ) : all.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{ color: BRAND.muted2 }}
          >
            <i className="bx bx-file-blank text-5xl" />
            <p className="mt-3 text-sm font-semibold">
              No teardown activity recorded for this node.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1580px] text-xs">
              <thead>
                <tr style={{ background: BRAND.blue }}>
                  {[
                    '#',
                    'Date',
                    'Span',
                    'From',
                    'To',
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
                  ].map(heading => (
                    <th
                      key={heading}
                      className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-white/80"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {all.map((td, index) => {
                  const cExp = Number(td.expected_cable ?? 0)
                  const cAct = Number(td.actual_cable ?? 0)
                  const pct = cExp > 0 ? Math.round((cAct / cExp) * 100) : 0
                  const status = statusStyle(td.status)

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
                      className="transition hover:bg-[#F8F9FF]"
                      style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : BRAND.softer,
                      }}
                    >
                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono text-xs font-bold" style={{ color: BRAND.muted2 }}>
                          {index + 1}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-semibold" style={{ color: BRAND.muted }}>
                          {fmtDate(td.start_time)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono text-[11px] font-black" style={{ color: BRAND.blue }}>
                          {td.span?.span_code ?? `#${td.id}`}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono font-bold" style={{ color: BRAND.textDark }}>
                          {td.span?.fromPole?.pole?.pole_code ?? '—'}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono font-bold" style={{ color: BRAND.textDark }}>
                          {td.span?.toPole?.pole?.pole_code ?? '—'}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono font-black" style={{ color: BRAND.textDark }}>
                          {fmt(td.span?.length_meters, 1)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono font-black" style={{ color: BRAND.textDark }}>
                          {fmt(cExp)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-mono font-black" style={{ color: BRAND.textDark }}>
                          {fmt(cAct)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black"
                          style={{
                            backgroundColor:
                              pct >= 90 ? '#ecfdf5' : pct >= 70 ? '#fffbeb' : '#fef2f2',
                            color: pct >= 90 ? '#047857' : pct >= 70 ? '#b45309' : '#b91c1c',
                          }}
                        >
                          {pct}%
                        </span>
                      </td>

                      {components.map(component => (
                        <td
                          key={component.label}
                          className="border-b px-3 py-3 text-center align-middle"
                          style={{ borderColor: '#ECEEFF' }}
                        >
                          {component.hasValue ? (
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black"
                              style={{
                                backgroundColor: component.complete ? '#ecfdf5' : '#fffbeb',
                                color: component.complete ? '#047857' : '#b45309',
                              }}
                              title={`${component.label}: ${component.actual}/${component.expected}`}
                            >
                              {component.actual}/{component.expected}
                            </span>
                          ) : (
                            <span style={{ color: BRAND.muted2 }}>—</span>
                          )}
                        </td>
                      ))}

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-semibold" style={{ color: BRAND.muted }}>
                          {td.team?.name ?? '—'}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-semibold" style={{ color: BRAND.muted }}>
                          {td.lineman
                            ? `${td.lineman.first_name} ${td.lineman.last_name}`
                            : '—'}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-semibold" style={{ color: BRAND.muted }}>
                          {fmtTime(td.start_time)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-semibold" style={{ color: BRAND.muted }}>
                          {fmtTime(td.end_time)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span className="font-semibold" style={{ color: BRAND.muted }}>
                          {workDur(td.duration_minutes, td.start_time, td.end_time)}
                        </span>
                      </td>

                      <td
                        className="border-b px-3 py-3 text-center align-middle"
                        style={{ borderColor: '#ECEEFF' }}
                      >
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
                          style={{
                            backgroundColor: status.bg,
                            color: status.text,
                            border: `1px solid ${status.border}`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: status.dot }}
                          />
                          {STATUS_LABELS[td.status] ?? td.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              <tfoot>
                <tr style={{ backgroundColor: BRAND.panel }}>
                  <td
                    colSpan={6}
                    className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em]"
                    style={{ color: BRAND.muted }}
                  >
                    Totals
                  </td>

                  <td className="px-3 py-3 text-center font-mono text-xs font-black" style={{ color: BRAND.textDark }}>
                    {fmt(totalExp)}
                  </td>

                  <td className="px-3 py-3 text-center font-mono text-xs font-black" style={{ color: BRAND.textDark }}>
                    {fmt(totalAct)}
                  </td>

                  <td className="px-3 py-3 text-center font-mono text-xs font-black" style={{ color: BRAND.textDark }}>
                    {cablePct}%
                  </td>

                  <td colSpan={12} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Bottom summaries */}
      <div className="grid gap-5 lg:grid-cols-2">
        {Object.keys(linemanMap).length > 0 && (
          <div
            className="overflow-hidden rounded-[20px] bg-white"
            style={{
              border: `1px solid ${BRAND.border}`,
              boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
            }}
          >
            <div className="border-b px-4 py-3" style={{ borderColor: BRAND.border }}>
              <p
                className="text-[10px] font-black uppercase tracking-[0.16em]"
                style={{ color: BRAND.muted2 }}
              >
                Per-Lineman Summary
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: BRAND.blue }}>
                    {['Lineman', 'Teardowns', 'Collected'].map(label => (
                      <th
                        key={label}
                        className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Object.entries(linemanMap).map(([name, data], index) => (
                    <tr
                      key={name}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : BRAND.softer,
                      }}
                    >
                      <td
                        className="border-b px-4 py-3 text-center font-bold"
                        style={{
                          borderColor: '#ECEEFF',
                          color: BRAND.textDark,
                        }}
                      >
                        {name}
                      </td>

                      <td
                        className="border-b px-4 py-3 text-center font-mono font-black"
                        style={{
                          borderColor: '#ECEEFF',
                          color: BRAND.textDark,
                        }}
                      >
                        {data.teardowns}
                      </td>

                      <td
                        className="border-b px-4 py-3 text-center font-mono font-black"
                        style={{
                          borderColor: '#ECEEFF',
                          color: BRAND.blue,
                        }}
                      >
                        {fmt(data.cable)} m
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr style={{ backgroundColor: BRAND.panel }}>
                    <td className="px-4 py-3 text-center font-black" style={{ color: BRAND.textDark }}>
                      TOTAL
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-black" style={{ color: BRAND.textDark }}>
                      {all.length}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-black" style={{ color: BRAND.blue }}>
                      {fmt(totalAct)} m
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {Object.keys(compMap).length > 0 && (
          <div
            className="overflow-hidden rounded-[20px] bg-white"
            style={{
              border: `1px solid ${BRAND.border}`,
              boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
            }}
          >
            <div className="border-b px-4 py-3" style={{ borderColor: BRAND.border }}>
              <p
                className="text-[10px] font-black uppercase tracking-[0.16em]"
                style={{ color: BRAND.muted2 }}
              >
                Component Summary
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: BRAND.blue }}>
                    {['Component', 'Expected', 'Collected', 'Status'].map(label => (
                      <th
                        key={label}
                        className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/80"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Object.entries(compMap).map(([type, data], index) => {
                    const complete = data.actual >= data.expected

                    return (
                      <tr
                        key={type}
                        style={{
                          backgroundColor: index % 2 === 0 ? '#ffffff' : BRAND.softer,
                        }}
                      >
                        <td
                          className="border-b px-4 py-3 text-center font-bold"
                          style={{
                            borderColor: '#ECEEFF',
                            color: BRAND.textDark,
                          }}
                        >
                          {COMP_LABELS[type] ?? type}
                        </td>

                        <td
                          className="border-b px-4 py-3 text-center font-mono font-black"
                          style={{
                            borderColor: '#ECEEFF',
                            color: BRAND.textDark,
                          }}
                        >
                          {data.expected} {data.unit}
                        </td>

                        <td
                          className="border-b px-4 py-3 text-center font-mono font-black"
                          style={{
                            borderColor: '#ECEEFF',
                            color: BRAND.textDark,
                          }}
                        >
                          {data.actual} {data.unit}
                        </td>

                        <td
                          className="border-b px-4 py-3 text-center"
                          style={{ borderColor: '#ECEEFF' }}
                        >
                          <span
                            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black"
                            style={{
                              backgroundColor: complete ? '#ecfdf5' : '#fffbeb',
                              color: complete ? '#047857' : '#b45309',
                            }}
                          >
                            {complete ? 'Complete' : `Short ${data.expected - data.actual}`}
                          </span>
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold" style={{ color: BRAND.muted2 }}>
          Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
        </p>

        <p
          className="text-[10px] font-black uppercase tracking-[0.16em]"
          style={{ color: BRAND.muted2 }}
        >
          Globe Telecom · Skycable Operations
        </p>
      </div>
    </div>
  )
}