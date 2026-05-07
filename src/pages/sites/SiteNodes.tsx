import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API, isAdmin } from '../../lib/auth'

interface Area {
  id: number
  name: string
  nodes_count?: number
}

interface Node {
  id: number
  name: string
  label: string | null
  full_label: string | null
  status: 'pending' | 'in_progress' | 'completed'
  report_type?: 'full_report' | 'pole_report' | null
  expected_cable: number | null
  actual_cable: number | null
  progress_percentage: number | null
  barangay?: { name: string; city?: { name: string } } | null
  subcontractor?: { name: string } | null
  team?: { name: string } | null
}

type NodeStatus  = 'pending' | 'in_progress' | 'completed'
type ReportType  = 'full_report' | 'pole_report'

interface NodeForm {
  name: string
  status: NodeStatus | ''
  report_type: ReportType | ''
}

const STATUS_CFG = {
  pending:     { label: 'Pending',     badge: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300',     bar: '#f59e0b', top: 'from-amber-400 to-orange-400' },
  in_progress: { label: 'In Progress', badge: 'border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-300', bar: '#6366f1', top: 'from-indigo-500 to-violet-500' },
  completed:   { label: 'Completed',   badge: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300', bar: '#10b981', top: 'from-emerald-500 to-teal-500' },
}

const emptyForm = (): NodeForm => ({ name: '', status: '', report_type: '' })

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
const selectCls = `${inputCls} cursor-pointer appearance-none`
const labelCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'

function h() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={e => e.stopPropagation()}>
        <div className="relative overflow-hidden border-b border-slate-100 bg-linear-to-r from-slate-950 via-blue-950 to-blue-800 px-6 py-5 dark:border-slate-800">
          <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {sub && <p className="mt-1 text-xs text-blue-100/75">{sub}</p>}
            </div>
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-lg font-bold text-white/75 transition hover:bg-white/20 hover:text-white">×</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function SiteNodes() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const admin = isAdmin()

  const [area, setArea]       = useState<Area | null>(null)
  const [nodes, setNodes]     = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<'all' | NodeStatus>('all')

  // CRUD state
  const [addOpen, setAddOpen]     = useState(false)
  const [editOpen, setEditOpen]   = useState(false)
  const [delOpen, setDelOpen]     = useState(false)
  const [selected, setSelected]   = useState<Node | null>(null)
  const [form, setForm]           = useState<NodeForm>(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState('')

  function loadData() {
    if (!siteId) return
    setLoading(true)
    Promise.all([
      fetch(`${SKYCABLE_API}/areas/${siteId}`, { headers: h() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/nodes?area_id=${siteId}&per_page=200`, { headers: h() }).then(r => r.json()),
    ]).then(([areaData, nodesData]) => {
      setArea(areaData?.data ?? areaData)
      setNodes(Array.isArray(nodesData) ? nodesData : (nodesData?.data ?? []))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [siteId])

  const counts = useMemo(() => ({
    total:       nodes.length,
    pending:     nodes.filter(n => n.status === 'pending').length,
    in_progress: nodes.filter(n => n.status === 'in_progress').length,
    completed:   nodes.filter(n => n.status === 'completed').length,
  }), [nodes])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? nodes : nodes.filter(n => n.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n =>
        n.name.toLowerCase().includes(q) ||
        (n.full_label ?? '').toLowerCase().includes(q) ||
        (n.barangay?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [nodes, filter, search])

  function closeAll() {
    setAddOpen(false); setEditOpen(false); setDelOpen(false)
    setSelected(null); setForm(emptyForm()); setFormErr('')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr('Node name is required.'); return }
    setSaving(true); setFormErr('')
    try {
      const res = await fetch(`${SKYCABLE_API}/nodes`, {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({
          area_id: Number(siteId),
          name: form.name.trim(),
          status: form.status || 'pending',
          report_type: form.report_type || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to add node')
      closeAll(); loadData()
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSaving(false) }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !form.name.trim()) { setFormErr('Node name is required.'); return }
    setSaving(true); setFormErr('')
    try {
      const res = await fetch(`${SKYCABLE_API}/nodes/${selected.id}`, {
        method: 'PATCH',
        headers: h(),
        body: JSON.stringify({
          name: form.name.trim(),
          status: form.status || undefined,
          report_type: form.report_type || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to update node')
      closeAll(); loadData()
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!selected) return
    setSaving(true)
    try {
      await fetch(`${SKYCABLE_API}/nodes/${selected.id}`, { method: 'DELETE', headers: h() })
      closeAll(); loadData()
    } catch { setFormErr('Failed to delete') } finally { setSaving(false) }
  }

  function openEdit(node: Node, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(node)
    setForm({ name: node.name, status: node.status, report_type: node.report_type ?? '' })
    setFormErr('')
    setEditOpen(true)
  }

  function openDel(node: Node, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(node)
    setDelOpen(true)
  }

  const summaryCards = [
    { label: 'Total Nodes',  value: counts.total,       note: 'All registered nodes',  tone: 'from-blue-600 to-sky-500',     soft: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',       icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
    { label: 'Pending',      value: counts.pending,     note: 'Awaiting teardown',     tone: 'from-amber-400 to-orange-400', soft: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'In Progress',  value: counts.in_progress, note: 'Currently active',      tone: 'from-indigo-500 to-violet-500',soft: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300', icon: 'M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0119 5' },
    { label: 'Completed',    value: counts.completed,   note: 'Finished nodes',        tone: 'from-emerald-500 to-teal-500', soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300', icon: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]

  function NodeFormFields() {
    return (
      <div className="flex flex-col gap-5 p-6">
        {formErr && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{formErr}</div>
        )}
        <div>
          <label className={labelCls}>Node Name *</label>
          <input required autoFocus className={inputCls} placeholder="e.g. Makati Central Node" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Status</label>
            <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as NodeStatus | '' }))}>
              <option value="">Select status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Report Type</label>
            <select className={selectCls} value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value as ReportType | '' }))}>
              <option value="">None</option>
              <option value="full_report">Full Report</option>
              <option value="pole_report">Pole Report</option>
            </select>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-linear-to-l from-blue-50 via-sky-50/60 to-transparent dark:from-blue-950/25 dark:via-sky-950/10" />
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <nav className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              <Link to="/sites" className="hover:text-blue-600 transition-colors">Sites</Link>
              <span>/</span>
              <span className="text-slate-600 dark:text-slate-300">{area?.name ?? '…'}</span>
            </nav>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              Area / Site
            </div>
            <h4 className="text-xl font-semibold text-slate-950 dark:text-slate-100">
              {loading ? '…' : (area?.name ?? 'Site Nodes')}
            </h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nodes, teardown progress, and cable recovery for this area.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {admin && (
              <button
                onClick={() => { setForm(emptyForm()); setFormErr(''); setAddOpen(true) }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                Add Node
              </button>
            )}
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryCards.map(card => (
          <article key={card.label} className="group relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${card.tone}`} />
            <div className={`pointer-events-none absolute -right-7 -top-7 h-20 w-20 rounded-full bg-linear-to-br ${card.tone} opacity-10 blur-xl`} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
                <h3 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{loading ? '—' : card.value}</h3>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{card.note}</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.soft}`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Node List */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">Node Registry</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Click a node to view poles, spans, and teardown details.</p>
          </div>
          {!loading && (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {filtered.length} {filtered.length === 1 ? 'Node' : 'Nodes'}
            </span>
          )}
        </div>

        {/* Filter + search */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="relative min-w-48 flex-1">
            <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes…" className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'pending', 'in_progress', 'completed'] as const).map(v => (
              <button key={v} onClick={() => setFilter(v)} className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${filter === v ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}>
                {v === 'all' ? 'All' : v === 'in_progress' ? 'In Progress' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-950/30">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No nodes found</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{search ? 'Try a different search term.' : 'No nodes match the selected filter.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(node => {
                const cfg = STATUS_CFG[node.status] ?? STATUS_CFG.pending
                const pct = Math.min(100, node.progress_percentage ?? 0)
                return (
                  <div key={node.id} onClick={() => navigate(`/sites/${siteId}/nodes/${node.id}`)} className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700">
                    <div className={`h-1 w-full bg-gradient-to-r ${cfg.top}`} />
                    <div className="p-5">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="mb-0.5 truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">{node.full_label ?? node.label ?? `Node #${node.id}`}</p>
                          <h3 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-400">{node.name}</h3>
                          {node.barangay?.name && (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                              {node.barangay.name}{node.barangay.city?.name && ` · ${node.barangay.city.name}`}
                            </p>
                          )}
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${cfg.badge}`}>{cfg.label}</span>
                      </div>

                      <div className="mb-3">
                        <div className="mb-1.5 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-500 dark:text-slate-400">Progress</span>
                          <span className="font-bold" style={{ color: cfg.bar }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.bar }} />
                        </div>
                      </div>

                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Expected</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-white">{node.expected_cable != null ? `${node.expected_cable.toLocaleString()}m` : '—'}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actual</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-white">{node.actual_cable != null ? `${node.actual_cable.toLocaleString()}m` : '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
                        <div className="flex flex-wrap gap-1.5">
                          {node.subcontractor?.name && (
                            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">{node.subcontractor.name}</span>
                          )}
                          {node.team?.name && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">{node.team.name}</span>
                          )}
                        </div>
                        {/* Edit / Delete — admin only */}
                        {admin ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={e => openEdit(node, e)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-700 dark:hover:text-blue-400" title="Edit">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onClick={e => openDel(node, e)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rose-700 dark:hover:text-rose-400" title="Delete">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </div>
                        ) : (
                          <svg className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500 dark:text-slate-600 dark:group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Add Modal */}
      {addOpen && (
        <Modal title="Add Node" sub={`Area: ${area?.name ?? ''}`} onClose={closeAll}>
          <form onSubmit={handleAdd}>
            <NodeFormFields />
            <div className="flex gap-2 border-t border-slate-100 px-6 pb-6 pt-0 dark:border-slate-800">
              <button type="button" onClick={closeAll} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Add Node'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editOpen && selected && (
        <Modal title="Edit Node" sub={selected.full_label ?? selected.name} onClose={closeAll}>
          <form onSubmit={handleEdit}>
            <NodeFormFields />
            <div className="flex gap-2 border-t border-slate-100 px-6 pb-6 pt-0 dark:border-slate-800">
              <button type="button" onClick={closeAll} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Update Node'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Modal */}
      {delOpen && selected && (
        <Modal title="Delete Node?" sub="This action cannot be undone." onClose={closeAll}>
          <div className="p-6">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Delete <strong className="font-semibold text-slate-900 dark:text-white">{selected.full_label ?? selected.name}</strong>?
            </p>
            {formErr && <p className="mt-2 text-xs text-rose-600">{formErr}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={closeAll} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cancel</button>
              <button onClick={handleDelete} disabled={saving} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 disabled:opacity-60">{saving ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
