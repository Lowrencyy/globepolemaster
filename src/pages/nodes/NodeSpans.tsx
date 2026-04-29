import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'

type SpanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
type SpanComponent = { component_type: string; expected_count: number }

type Span = {
  id: number
  span_code?: string
  strand_length?: number | null
  number_of_runs?: number | null
  actual_cable?: number | null
  status: SpanStatus
  components?: SpanComponent[]
  from_pole?: { id: number; sequence: number; pole?: { id: number; pole_code: string } }
  to_pole?:   { id: number; sequence: number; pole?: { id: number; pole_code: string } }
}

type PoleOption = {
  id: number
  sequence: number
  pole?: { id: number; pole_code: string; lat?: string | null; lng?: string | null; skycable_status?: string }
}
type NodeInfo = { id: number; name: string; full_label?: string; area?: { id: number; name: string } }

type SpanForm = {
  from_pole_id: number | ''
  to_pole_id: number | ''
  strand_length: string
  number_of_runs: string
  nodes_count: string
  amplifier: string
  extender: string
  tsc: string
  power_supply: string
  power_supply_case: string
}

type EditForm = SpanForm & { status: SpanStatus | '' }

const emptyForm = (): SpanForm => ({
  from_pole_id: '', to_pole_id: '',
  strand_length: '', number_of_runs: '',
  nodes_count: '', amplifier: '', extender: '',
  tsc: '', power_supply: '', power_supply_case: '',
})
const emptyEdit = (): EditForm => ({ ...emptyForm(), status: '' })

const generateSpanCode = () =>
  `SP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

const computeActual = (strand: string, runs: string) => {
  const s = parseFloat(strand), r = parseFloat(runs)
  return (!isNaN(s) && !isNaN(r) && s > 0 && r > 0) ? (s * r).toFixed(2) : ''
}

const statusCfg: Record<SpanStatus, { label: string; dot: string; badge: string }> = {
  pending:     { label: 'Pending',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  in_progress: { label: 'Ongoing',   dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  completed:   { label: 'Completed', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled:   { label: 'Cancelled', dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
}

const iCls = 'h-[40px] w-full rounded-xl border border-[#d8e6f8] bg-[#f7fbff] px-3 text-sm text-slate-800 outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100'
const iReadCls = 'h-[40px] w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 outline-none dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
const lCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'
const primaryBtn = 'h-10 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-700 active:scale-[0.99]'
const secondaryBtn = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
const dangerBtn = 'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }
}

function getComp(span: Span, type: string) {
  return span.components?.find(c => c.component_type === type)?.expected_count ?? null
}

/* ── Modal ─────────────────────────────────────────────────────── */
function Modal({ open, title, subtitle, icon, children, onClose, widthClass = 'max-w-lg', danger = false }: {
  open: boolean; title: string; subtitle?: string; icon?: string
  children: ReactNode; onClose: () => void; widthClass?: string; danger?: boolean
}) {
  if (!open) return null
  if (danger) return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[5px]" onClick={onClose} />
      <div className={`relative w-full ${widthClass} overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)] dark:border-zinc-700 dark:bg-zinc-900`}>
        <button onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100"><i className="bx bx-x text-[22px]" /></button>
        <div className="mb-4 flex justify-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/70"><i className={`${icon ?? 'bx bx-trash'} text-[26px] text-red-500`} /></div></div>
        <div className="text-center"><h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h5>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={onClose} />
      <div className={`relative w-full ${widthClass} rounded-[30px] border border-[#dbe8ff] bg-white shadow-[0_36px_100px_-34px_rgba(6,36,90,0.5)] dark:border-[#27436a] dark:bg-[#0f1728]`}>
        <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-[#0072ff]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 -top-10 h-44 w-44 rounded-full bg-[#5fd0ff]/20 blur-3xl" />
        <div className="relative overflow-hidden rounded-t-[30px] border-b border-white/20 bg-linear-to-r from-[#0057d9] via-[#0072ff] to-[#00a6ff] px-6 py-4">
          <div className="relative flex items-center gap-3.5">
            {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/30 bg-white/15 text-white"><i className={`${icon} text-[19px]`} /></div>}
            <div className="flex-1"><h5 className="text-sm font-bold text-white">{title}</h5>{subtitle && <p className="mt-0.5 text-xs text-white/80">{subtitle}</p>}</div>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20"><i className="bx bx-x text-[21px]" /></button>
          </div>
        </div>
        <div className="relative max-h-[80vh] overflow-y-auto bg-[linear-gradient(180deg,rgba(248,251,255,0.92),rgba(255,255,255,1))] p-6 dark:bg-[linear-gradient(180deg,rgba(15,23,40,0.98),rgba(15,23,40,1))]">{children}</div>
      </div>
    </div>
  )
}

/* ── Span Form Fields ───────────────────────────────────────────── */
function SpanFields({ form, onChange, actualCable }: {
  form: Omit<SpanForm, 'from_pole_id' | 'to_pole_id'>
  onChange: (f: keyof Omit<SpanForm, 'from_pole_id' | 'to_pole_id'>, v: string) => void
  actualCable: string
}) {
  const nf = (label: string, field: keyof typeof form, ph = '0') => (
    <div>
      <label className={lCls}>{label}</label>
      <input type="number" min="0" step="any" value={form[field]} onChange={e => onChange(field, e.target.value)} placeholder={ph} className={iCls} />
    </div>
  )
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Cable Measurement</p>
        <div className="grid grid-cols-3 gap-3">
          {nf('Strand Length (m)', 'strand_length', 'e.g. 100')}
          {nf('No. of Runs', 'number_of_runs', 'e.g. 2')}
          <div>
            <label className={lCls}>Actual Cable <span className="normal-case font-normal text-emerald-400">auto</span></label>
            <input readOnly value={actualCable} placeholder="0.00" className={iReadCls} />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Collectable Components</p>
        <div className="grid grid-cols-3 gap-3">
          {nf('Nodes', 'nodes_count')}
          {nf('Amplifier', 'amplifier')}
          {nf('Extender', 'extender')}
          {nf('TSC', 'tsc')}
          {nf('Power Supply', 'power_supply')}
          {nf('PS Case', 'power_supply_case')}
        </div>
      </div>
    </div>
  )
}

/* ── Sitemap ────────────────────────────────────────────────────── */
const COLS = 8, CELL_W = 112, CELL_H = 88, R = 22

function polePos(idx: number) {
  return { x: 56 + (idx % COLS) * CELL_W, y: 48 + Math.floor(idx / COLS) * CELL_H }
}

function Sitemap({ poles, spans, fromPole, toPole, onPoleClick, search }: {
  poles: PoleOption[]
  spans: Span[]
  fromPole: PoleOption | null
  toPole: PoleOption | null
  onPoleClick: (p: PoleOption) => void
  search: string
}) {
  const rows = Math.ceil(poles.length / COLS)
  const svgW = Math.max(COLS * CELL_W + 40, 600)
  const svgH = rows * CELL_H + 40

  const posMap = new Map<number, { x: number; y: number }>()
  poles.forEach((p, i) => posMap.set(p.id, polePos(i)))

  const q = search.toLowerCase()

  return (
    <div className="overflow-auto" style={{ maxHeight: 480 }}>
      <svg width={svgW} height={svgH} className="select-none" style={{ minWidth: svgW }}>
        {/* Span lines */}
        {spans.map(s => {
          const fp = posMap.get(s.from_pole?.id ?? -1)
          const tp = posMap.get(s.to_pole?.id ?? -1)
          if (!fp || !tp) return null
          const sc = statusCfg[s.status] ?? statusCfg.pending
          const color = s.status === 'completed' ? '#10b981' : s.status === 'in_progress' ? '#8b5cf6' : '#94a3b8'
          return (
            <g key={s.id}>
              <line x1={fp.x} y1={fp.y} x2={tp.x} y2={tp.y} stroke={color} strokeWidth={2.5} strokeDasharray={s.status === 'pending' ? '6 4' : undefined} opacity={0.7} />
              <text x={(fp.x + tp.x) / 2} y={(fp.y + tp.y) / 2 - 5} textAnchor="middle" fontSize={9} fill={color} fontWeight={700}>{s.span_code ?? ''}</text>
            </g>
          )
        })}

        {/* Pole nodes */}
        {poles.map((p, i) => {
          const { x, y } = polePos(i)
          const code = p.pole?.pole_code ?? `P${p.id}`
          const isFrom = fromPole?.id === p.id
          const isTo   = toPole?.id === p.id
          const hasGps = !!(p.pole?.lat && p.pole?.lng)
          const status = p.pole?.skycable_status
          const isCleared = status === 'cleared'
          const dimmed = q && !code.toLowerCase().includes(q)

          let fill = '#e2e8f0', stroke = '#94a3b8', textFill = '#475569'
          if (isFrom)  { fill = '#2563eb'; stroke = '#1d4ed8'; textFill = '#fff' }
          else if (isTo) { fill = '#f97316'; stroke = '#ea580c'; textFill = '#fff' }
          else if (isCleared) { fill = '#d1fae5'; stroke = '#10b981'; textFill = '#065f46' }

          return (
            <g key={p.id} style={{ cursor: 'pointer', opacity: dimmed ? 0.25 : 1 }} onClick={() => onPoleClick(p)}>
              {/* GPS indicator ring */}
              {hasGps && !isFrom && !isTo && (
                <circle cx={x} cy={y} r={R + 5} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.5} />
              )}
              {/* Main circle */}
              <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={isFrom || isTo ? 2.5 : 1.5} />
              {/* Status dot */}
              {!isFrom && !isTo && (
                <circle cx={x + R - 4} cy={y - R + 4} r={4.5}
                  fill={isCleared ? '#10b981' : '#f59e0b'}
                  stroke="#fff" strokeWidth={1} />
              )}
              {/* Pole code label */}
              <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={code.length > 7 ? 7.5 : 9} fontWeight={700} fill={textFill} fontFamily="monospace">
                {code.length > 9 ? code.slice(-7) : code}
              </text>
              {/* Step badge */}
              {(isFrom || isTo) && (
                <text x={x} y={y + R + 11} textAnchor="middle" fontSize={8} fontWeight={800}
                  fill={isFrom ? '#2563eb' : '#f97316'}>
                  {isFrom ? 'FROM' : 'TO'}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── Bottom Sheet ───────────────────────────────────────────────── */
function BottomSheet({ open, fromPole, toPole, form, onChange, onSubmit, onClose, saving, error }: {
  open: boolean
  fromPole: PoleOption | null
  toPole: PoleOption | null
  form: Omit<SpanForm, 'from_pole_id' | 'to_pole_id'>
  onChange: (f: keyof Omit<SpanForm, 'from_pole_id' | 'to_pole_id'>, v: string) => void
  onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  return (
    <div className={`fixed inset-0 z-[998] flex items-end justify-center transition-all duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-2xl rounded-t-[24px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.18)] dark:bg-zinc-900 transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-slate-200 dark:bg-zinc-700" /></div>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-zinc-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/15">
            <i className="bx bx-git-branch text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Declare Span</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold">
              <span className="text-emerald-600 dark:text-emerald-400 font-mono">{fromPole?.pole?.pole_code ?? '—'}</span>
              <span className="text-slate-300">→</span>
              <span className="text-orange-500 font-mono">{toPole?.pole?.pole_code ?? '—'}</span>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="px-5 py-4">
          <SpanFields form={form} onChange={onChange} actualCable={computeActual(form.strand_length, form.number_of_runs)} />
          {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
            <button type="submit" disabled={saving} className={`${primaryBtn} disabled:opacity-60`}>
              {saving ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Saving…</span> : 'Add Span'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════════ */
export default function NodeSpans() {
  const { siteSlug = '', nodeSlug = '' } = useParams()
  const nodeId = idFromSlug(nodeSlug) || Number(nodeSlug)

  const [node, setNode]     = useState<NodeInfo | null>(null)
  const [spans, setSpans]   = useState<Span[]>([])
  const [poles, setPoles]   = useState<PoleOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [polesLoading, setPolesLoading] = useState(false)
  const [polesError, setPolesError]     = useState<string | null>(null)

  const [viewMode, setViewMode]     = useState<'list' | 'map'>('map')
  const [mapSearch, setMapSearch]   = useState('')
  const [mapFrom, setMapFrom]       = useState<PoleOption | null>(null)
  const [mapTo, setMapTo]           = useState<PoleOption | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [sheetForm, setSheetForm]   = useState<Omit<SpanForm, 'from_pole_id' | 'to_pole_id'>>((() => {
    const { from_pole_id: _f, to_pole_id: _t, ...rest } = emptyForm()
    return rest
  })())

  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SpanStatus>('all')

  const [isAddOpen, setIsAddOpen]   = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDelOpen, setIsDelOpen]   = useState(false)
  const [selected, setSelected]     = useState<Span | null>(null)
  const [addForm, setAddForm]       = useState<SpanForm>(emptyForm())
  const [editForm, setEditForm]     = useState<EditForm>(emptyEdit())
  const [saving, setSaving]         = useState(false)
  const [addError, setAddError]     = useState<string | null>(null)
  const [editError, setEditError]   = useState<string | null>(null)
  const [delError, setDelError]     = useState<string | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)

  useEffect(() => {
    if (!nodeId) return
    const hit = cacheGet<NodeInfo>(`nodespans_${nodeId}_info`)
    if (hit) setNode(hit)
    fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setNode(d); cacheSet(`nodespans_${nodeId}_info`, d) }).catch(() => {})
  }, [nodeId])

  useEffect(() => {
    if (!nodeId) return
    const hit = cacheGet<PoleOption[]>(`nodespans_${nodeId}_poles`)
    if (hit) setPoles(hit)
    else { setPolesLoading(true); setPolesError(null) }
    fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) { setPoles(d); cacheSet(`nodespans_${nodeId}_poles`, d) } else { setPolesError(d?.message ?? 'Unexpected response'); setPoles([]) } })
      .catch(err => setPolesError(err?.message ?? 'Failed to load poles'))
      .finally(() => setPolesLoading(false))
  }, [nodeId])

  function loadSpans() {
    if (!nodeId) return
    const hit = cacheGet<Span[]>(`nodespans_${nodeId}_spans`)
    if (hit) { setSpans(hit); setLoading(false) }
    else setLoading(true)
    fetch(`${SKYCABLE_API}/spans?node_id=${nodeId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : (d.data ?? []); setSpans(list); cacheSet(`nodespans_${nodeId}_spans`, list) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadSpans() }, [nodeId])

  const filtered = spans.filter(s => {
    const q = search.toLowerCase()
    const matchQ = !q || (s.span_code ?? '').toLowerCase().includes(q) ||
      (s.from_pole?.pole?.pole_code ?? '').toLowerCase().includes(q) ||
      (s.to_pole?.pole?.pole_code ?? '').toLowerCase().includes(q)
    return matchQ && (statusFilter === 'all' || s.status === statusFilter)
  })

  const counts = {
    total:       spans.length,
    pending:     spans.filter(s => s.status === 'pending').length,
    in_progress: spans.filter(s => s.status === 'in_progress').length,
    completed:   spans.filter(s => s.status === 'completed').length,
  }

  /* ── Map pole click ── */
  function handleMapPoleClick(p: PoleOption) {
    if (!mapFrom) {
      setMapFrom(p); setMapTo(null)
    } else if (mapFrom.id === p.id) {
      setMapFrom(null)
    } else if (!mapTo) {
      setMapTo(p)
      const { from_pole_id: _f, to_pole_id: _t, ...rest } = emptyForm()
      setSheetForm(rest)
      setSheetError(null)
      setIsSheetOpen(true)
    } else {
      setMapFrom(p); setMapTo(null); setIsSheetOpen(false)
    }
  }

  function mcClear() {
    setMapFrom(null); setMapTo(null); setIsSheetOpen(false); setSheetError(null)
  }

  /* ── Submission ── */
  async function submitSpan(payload: object): Promise<Span | null> {
    const spanCode = generateSpanCode()
    const res = await fetch(`${SKYCABLE_API}/spans`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ span_code: spanCode, ...payload }),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = (data.message as string | undefined) ??
        (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed to add span'
      throw new Error(msg)
    }
    return data as Span
  }

  async function handleSheetSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!mapFrom || !mapTo) return
    setSaving(true); setSheetError(null)
    try {
      const actual = computeActual(sheetForm.strand_length, sheetForm.number_of_runs)
      await submitSpan({
        node_id: nodeId, from_pole_id: mapFrom.id, to_pole_id: mapTo.id,
        strand_length:     sheetForm.strand_length     ? Number(sheetForm.strand_length)     : null,
        number_of_runs:    sheetForm.number_of_runs    ? Number(sheetForm.number_of_runs)    : null,
        actual_cable:      actual                      ? Number(actual)                      : null,
        nodes_count:       sheetForm.nodes_count       ? Number(sheetForm.nodes_count)       : null,
        amplifier:         sheetForm.amplifier         ? Number(sheetForm.amplifier)         : null,
        extender:          sheetForm.extender          ? Number(sheetForm.extender)          : null,
        tsc:               sheetForm.tsc               ? Number(sheetForm.tsc)               : null,
        power_supply:      sheetForm.power_supply      ? Number(sheetForm.power_supply)      : null,
        power_supply_case: sheetForm.power_supply_case ? Number(sheetForm.power_supply_case) : null,
      })
      mcClear(); loadSpans()
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSaving(false) }
  }

  async function handleManualAdd(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setAddError(null)
    try {
      const actual = computeActual(addForm.strand_length, addForm.number_of_runs)
      await submitSpan({
        node_id: nodeId, from_pole_id: addForm.from_pole_id, to_pole_id: addForm.to_pole_id,
        strand_length:     addForm.strand_length     ? Number(addForm.strand_length)     : null,
        number_of_runs:    addForm.number_of_runs    ? Number(addForm.number_of_runs)    : null,
        actual_cable:      actual                    ? Number(actual)                    : null,
        nodes_count:       addForm.nodes_count       ? Number(addForm.nodes_count)       : null,
        amplifier:         addForm.amplifier         ? Number(addForm.amplifier)         : null,
        extender:          addForm.extender          ? Number(addForm.extender)          : null,
        tsc:               addForm.tsc               ? Number(addForm.tsc)               : null,
        power_supply:      addForm.power_supply      ? Number(addForm.power_supply)      : null,
        power_supply_case: addForm.power_supply_case ? Number(addForm.power_supply_case) : null,
      })
      setIsAddOpen(false); setAddForm(emptyForm()); loadSpans()
    } catch (err) { setAddError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleEdit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selected) return
    setSaving(true); setEditError(null)
    try {
      const actual = computeActual(editForm.strand_length, editForm.number_of_runs)
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          strand_length:     editForm.strand_length     ? Number(editForm.strand_length)     : null,
          number_of_runs:    editForm.number_of_runs    ? Number(editForm.number_of_runs)    : null,
          actual_cable:      actual                     ? Number(actual)                     : null,
          nodes_count:       editForm.nodes_count       ? Number(editForm.nodes_count)       : null,
          amplifier:         editForm.amplifier         ? Number(editForm.amplifier)         : null,
          extender:          editForm.extender          ? Number(editForm.extender)          : null,
          tsc:               editForm.tsc               ? Number(editForm.tsc)               : null,
          power_supply:      editForm.power_supply      ? Number(editForm.power_supply)      : null,
          power_supply_case: editForm.power_supply_case ? Number(editForm.power_supply_case) : null,
          status:            editForm.status            || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to update')
      setIsEditOpen(false); setSelected(null); loadSpans()
    } catch (err) { setEditError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!selected) return
    setSaving(true); setDelError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Failed to delete')
      setIsDelOpen(false); setSelected(null)
      setSpans(prev => prev.filter(s => s.id !== selected.id))
    } catch (err) { setDelError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  const poleLabel = (p: PoleOption) => p.pole?.pole_code ?? `Pole #${p.id}`
  const dash = <span className="text-slate-300 dark:text-zinc-600">—</span>
  const n = (v: number | null | undefined) => v != null ? v : dash

  /* ── Map step indicator ── */
  const mapStep = !mapFrom ? 1 : !mapTo ? 2 : 3

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/sites" className="hover:text-indigo-600 transition">Site List</Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <Link to={`/sites/${siteSlug}`} className="hover:text-indigo-600 transition">{node?.area?.name ?? 'Site'}</Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <Link to={`/sites/${siteSlug}/nodes/${nodeSlug}`} className="hover:text-indigo-600 transition">{node?.full_label ?? node?.name ?? 'Node'}</Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <span className="font-semibold text-slate-900 dark:text-slate-100">Spans</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">{node?.full_label ?? node?.name ?? '…'} — Spans</h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Click two poles on the sitemap to declare a span</p>
        </div>
        <Link to={`/sites/${siteSlug}/nodes/${nodeSlug}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Poles
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {([
          { label: 'Total Spans', count: counts.total,       accent: 'from-[#0072ff] to-[#00a6ff]' },
          { label: 'Pending',     count: counts.pending,     accent: 'from-amber-400 to-orange-400' },
          { label: 'Ongoing',     count: counts.in_progress, accent: 'from-indigo-500 to-violet-500' },
          { label: 'Completed',   count: counts.completed,   accent: 'from-emerald-500 to-teal-500' },
        ] as const).map(c => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
            <div className={`h-1 w-full bg-linear-to-r ${c.accent}`} />
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{c.label}</p>
              <p className="mt-2 text-[28px] font-extrabold leading-none text-gray-800 dark:text-gray-100">{c.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Span Connector Card (Map mode) */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        {/* Map toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3 dark:border-zinc-700 dark:from-zinc-800/80 dark:to-zinc-800">
          {/* View tabs */}
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-zinc-700 dark:bg-zinc-900">
            {(['map', 'list'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${viewMode === m ? 'bg-white text-slate-800 shadow-sm dark:bg-zinc-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-500'}`}>
                <i className={`bx ${m === 'map' ? 'bx-layout' : 'bx-list-ul'} text-sm`} />
                {m === 'map' ? 'Sitemap' : 'List'}
              </button>
            ))}
          </div>

          {/* Steps (map mode) */}
          {viewMode === 'map' && (
            <div className="flex items-center gap-2">
              {[{ n: 1, label: '① FROM pole' }, { n: 2, label: '② TO pole' }, { n: 3, label: '③ Fill details' }].map(s => (
                <span key={s.n} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${mapStep === s.n ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-200' : mapStep > s.n ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'}`}>
                  {mapStep > s.n ? <i className="bx bx-check mr-0.5" /> : null}{s.label}
                </span>
              ))}
            </div>
          )}

          {/* Selection display (map mode) */}
          {viewMode === 'map' && (mapFrom || mapTo) && (
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${mapFrom ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {mapFrom ? (mapFrom.pole?.pole_code ?? `P${mapFrom.id}`) : 'Not selected'}
              </span>
              <i className="bx bx-right-arrow-alt text-slate-300" />
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${mapTo ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                {mapTo ? (mapTo.pole?.pole_code ?? `P${mapTo.id}`) : 'Not selected'}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {viewMode === 'map' && mapFrom && (
              <button onClick={mcClear} className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                <i className="bx bx-x" /> Clear
              </button>
            )}
            <button onClick={() => { setAddForm(emptyForm()); setIsAddOpen(true) }}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-md shadow-violet-500/30 hover:bg-violet-700">
              <i className="bx bx-edit text-sm" /> Manual
            </button>
            {viewMode === 'list' && (
              <button onClick={() => { setAddForm(emptyForm()); setIsAddOpen(true) }}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white shadow-md shadow-sky-500/30 hover:bg-sky-700">
                <i className="bx bx-plus text-sm" /> Add Span
              </button>
            )}
          </div>
        </div>

        {/* Map + Sidebar layout */}
        {viewMode === 'map' && (
          <div className="flex" style={{ minHeight: 360 }}>
            {/* SVG sitemap area */}
            <div className="flex-1 overflow-hidden border-r border-slate-100 bg-[#f4f8ff] dark:border-zinc-700 dark:bg-[#0b1323]">
              {polesLoading ? (
                <div className="flex h-60 items-center justify-center">
                  <i className="bx bx-loader-alt animate-spin text-2xl text-sky-500" />
                </div>
              ) : polesError ? (
                <div className="flex h-60 flex-col items-center justify-center gap-2 text-sm text-red-500">
                  <i className="bx bx-error-circle text-2xl" />
                  {polesError}
                </div>
              ) : poles.length === 0 ? (
                <div className="flex h-60 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                  <i className="bx bx-map-pin text-2xl" />
                  No poles on this node yet
                </div>
              ) : (
                <Sitemap
                  poles={poles}
                  spans={spans}
                  fromPole={mapFrom}
                  toPole={mapTo}
                  onPoleClick={handleMapPoleClick}
                  search={mapSearch}
                />
              )}
            </div>

            {/* Sidebar */}
            <div className="w-[260px] shrink-0 overflow-y-auto" style={{ maxHeight: 480 }}>
              {/* Legend */}
              <div className="border-b border-slate-100 px-4 py-3 dark:border-zinc-700">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Legend</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { color: '#2563eb', label: 'FROM' },
                    { color: '#f97316', label: 'TO' },
                    { color: '#10b981', label: 'Completed' },
                    { color: '#f59e0b', label: 'Pending' },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="border-b border-slate-100 px-4 py-3 dark:border-zinc-700">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Summary</p>
                <div className="space-y-1.5 text-xs font-medium text-slate-500">
                  <div className="flex justify-between"><span>Total Poles</span><span className="font-bold text-slate-700">{poles.length}</span></div>
                  <div className="flex justify-between"><span>Total Spans</span><span className="font-bold text-slate-700">{spans.length}</span></div>
                  <div className="flex justify-between"><span>Completed</span><span className="font-bold text-emerald-600">{spans.filter(s => s.status === 'completed').length}</span></div>
                </div>
              </div>

              {/* Poles directory */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Poles Directory</p>
                <div className="relative mb-2">
                  <i className="bx bx-search absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input value={mapSearch} onChange={e => setMapSearch(e.target.value)}
                    placeholder="Search pole…"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-3 text-xs text-slate-600 outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300" />
                </div>
                <div className="max-h-[220px] space-y-0.5 overflow-y-auto pr-1">
                  {poles.filter(p => !mapSearch || (p.pole?.pole_code ?? '').toLowerCase().includes(mapSearch.toLowerCase())).map(p => {
                    const isFrom = mapFrom?.id === p.id
                    const isTo   = mapTo?.id === p.id
                    const isCleared = p.pole?.skycable_status === 'cleared'
                    return (
                      <button key={p.id} onClick={() => handleMapPoleClick(p)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition ${isFrom ? 'bg-blue-50 text-blue-700' : isTo ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: isFrom ? '#2563eb' : isTo ? '#f97316' : isCleared ? '#10b981' : '#f59e0b' }} />
                        <span className="font-mono">{p.pole?.pole_code ?? `P${p.id}`}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* List mode: search + table */}
        {viewMode === 'list' && (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-zinc-700">
              <div className="relative min-w-[200px] flex-1">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search span or pole…"
                  className="h-9 w-full rounded-full border border-[#d8e6f8] bg-white pl-9 pr-4 text-xs text-slate-600 outline-none focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10" />
              </div>
              <div className="relative">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="h-9 appearance-none rounded-full border border-[#d8e6f8] bg-white pl-3 pr-8 text-xs text-slate-600 outline-none">
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              </div>
              <span className="text-xs text-gray-400">{filtered.length} spans</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                    <th colSpan={7} className="border-r border-[#e8f0fb] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-[#8aa8d4]">Cable Measurement</th>
                    <th colSpan={6} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-[#8aa8d4]">Collectable Components</th>
                    <th className="px-3 py-2" /><th className="px-3 py-2" />
                  </tr>
                  <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                    {['#','Span ID','From','To','Strand','Runs','Actual Cable','Nodes','Amp','Ext','TSC','PS','PS Case','Status','Actions'].map(h => (
                      <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={15} className="py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f2ff]">
                        <i className="bx bx-loader-alt animate-spin text-2xl text-[#0072ff]" />
                      </div>
                      <p className="mt-3 text-sm text-slate-400">Loading…</p>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={15} className="py-16 text-center">
                      <i className="bx bx-git-branch text-3xl text-slate-300" />
                      <p className="mt-2 text-sm text-slate-400">No spans found</p>
                    </td></tr>
                  ) : filtered.map((s, idx) => {
                    const sc = statusCfg[s.status] ?? statusCfg.pending
                    return (
                      <tr key={s.id} className="border-b border-[#f0f5ff] last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60">
                        <td className="px-3 py-3 text-[11px] font-bold tabular-nums text-[#b0c8e8]">{idx + 1}</td>
                        <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-500">{s.span_code ?? dash}</td>
                        <td className="px-3 py-3 font-mono text-xs text-[#0b6cff]">{s.from_pole?.pole?.pole_code ?? dash}</td>
                        <td className="px-3 py-3 font-mono text-xs text-[#0b6cff]">{s.to_pole?.pole?.pole_code ?? dash}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{s.strand_length != null ? `${s.strand_length}m` : dash}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(s.number_of_runs)}</td>
                        <td className="px-3 py-3 text-xs tabular-nums font-semibold text-emerald-600">{s.actual_cable != null ? `${s.actual_cable}m` : dash}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(getComp(s, 'node'))}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(getComp(s, 'amplifier'))}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(getComp(s, 'extender'))}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(getComp(s, 'tsc'))}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(getComp(s, 'powersupply'))}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{n(getComp(s, 'powersupply_case'))}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{sc.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => {
                              setSelected(s)
                              const gc = (type: string) => { const v = getComp(s, type); return v != null ? String(v) : '' }
                              setEditForm({
                                from_pole_id: s.from_pole?.id ?? '', to_pole_id: s.to_pole?.id ?? '',
                                strand_length:     s.strand_length  != null ? String(s.strand_length)  : '',
                                number_of_runs:    s.number_of_runs != null ? String(s.number_of_runs) : '',
                                nodes_count:       gc('node'), amplifier: gc('amplifier'), extender: gc('extender'),
                                tsc: gc('tsc'), power_supply: gc('powersupply'), power_supply_case: gc('powersupply_case'),
                                status: s.status,
                              })
                              setIsEditOpen(true)
                            }} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-[#e8f2ff] hover:text-[#0072ff]">
                              <i className="bx bx-edit text-sm" />
                            </button>
                            <button onClick={() => { setSelected(s); setIsDelOpen(true) }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                              <i className="bx bx-trash text-sm" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Bottom Sheet (map mode span form) */}
      <BottomSheet
        open={isSheetOpen}
        fromPole={mapFrom}
        toPole={mapTo}
        form={sheetForm}
        onChange={(f, v) => setSheetForm(p => ({ ...p, [f]: v }))}
        onSubmit={handleSheetSubmit}
        onClose={() => setIsSheetOpen(false)}
        saving={saving}
        error={sheetError}
      />

      {/* Manual Add Modal */}
      <Modal open={isAddOpen} title="Add Span" subtitle={`Node: ${node?.full_label ?? node?.name ?? ''}`} icon="bx bx-git-branch" onClose={() => setIsAddOpen(false)} widthClass="max-w-xl">
        <form onSubmit={handleManualAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>From Pole</label>
              <div className="relative">
                <select required value={addForm.from_pole_id}
                  onChange={e => setAddForm(p => ({ ...p, from_pole_id: Number(e.target.value) || '' }))}
                  className={`${iCls} appearance-none pr-10 cursor-pointer`}>
                  <option value="">{polesLoading ? 'Loading…' : poles.length === 0 ? 'No poles' : 'Select pole'}</option>
                  {poles.map(p => <option key={p.id} value={p.id}>{poleLabel(p)}</option>)}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className={lCls}>To Pole</label>
              <div className="relative">
                <select required value={addForm.to_pole_id}
                  onChange={e => setAddForm(p => ({ ...p, to_pole_id: Number(e.target.value) || '' }))}
                  className={`${iCls} appearance-none pr-10 cursor-pointer`}>
                  <option value="">{polesLoading ? 'Loading…' : poles.length === 0 ? 'No poles' : 'Select pole'}</option>
                  {poles.filter(p => p.id !== addForm.from_pole_id).map(p => <option key={p.id} value={p.id}>{poleLabel(p)}</option>)}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            {polesError && <p className="col-span-2 text-xs text-red-500">{polesError}</p>}
          </div>
          <SpanFields
            form={addForm}
            onChange={(f, v) => setAddForm(p => ({ ...p, [f]: v }))}
            actualCable={computeActual(addForm.strand_length, addForm.number_of_runs)}
          />
          {addError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{addError}</div>}
          <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4">
            <button type="button" onClick={() => setIsAddOpen(false)} className={secondaryBtn}>Cancel</button>
            <button type="submit" disabled={saving} className={`${primaryBtn} disabled:opacity-60`}>
              {saving ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Saving…</span> : 'Add Span'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={isEditOpen} title="Edit Span" subtitle={`ID: ${selected?.span_code ?? `#${selected?.id}`}`} icon="bx bx-edit" onClose={() => setIsEditOpen(false)} widthClass="max-w-xl">
        <form onSubmit={handleEdit} className="space-y-4">
          <SpanFields
            form={editForm}
            onChange={(f, v) => setEditForm(p => ({ ...p, [f]: v }))}
            actualCable={computeActual(editForm.strand_length, editForm.number_of_runs)}
          />
          <div>
            <label className={lCls}>Status</label>
            <div className="relative">
              <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as SpanStatus }))}
                className={`${iCls} appearance-none pr-10 cursor-pointer`}>
                <option value="">— unchanged —</option>
                <option value="pending">Pending</option>
                <option value="in_progress">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          {editError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{editError}</div>}
          <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4">
            <button type="button" onClick={() => setIsEditOpen(false)} className={secondaryBtn}>Cancel</button>
            <button type="submit" disabled={saving} className={`${primaryBtn} disabled:opacity-60`}>
              {saving ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Saving…</span> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal open={isDelOpen} title="Delete Span?" subtitle="This cannot be undone." icon="bx bx-trash" onClose={() => setIsDelOpen(false)} widthClass="max-w-md" danger>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([['Span ID', selected?.span_code ?? '—'], ['From', selected?.from_pole?.pole?.pole_code ?? '—'], ['To', selected?.to_pole?.pole?.pole_code ?? '—'], ['Status', statusCfg[selected?.status ?? 'pending']?.label ?? '—']] as [string,string][]).map(([k,v]) => (
                <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt><dd className="mt-1 font-medium text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </div>
          {delError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{delError}</div>}
          <div className="flex gap-3">
            <button onClick={handleDelete} disabled={saving} className={`${dangerBtn} flex-1 disabled:opacity-60`}>{saving ? 'Deleting…' : 'Yes, Delete'}</button>
            <button onClick={() => setIsDelOpen(false)} className={`${secondaryBtn} flex-1`}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
