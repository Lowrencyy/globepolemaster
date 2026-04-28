import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { getToken, SKYCABLE_API } from '../../lib/auth'

type SpanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

type Span = {
  id: number
  span_code?: string
  length_meters?: number | null
  status: SpanStatus
  node?: { id: number; name: string; full_label?: string; area?: { id: number; name: string } }
  from_pole?: { id: number; sequence: number; pole?: { id: number; pole_code: string } }
  to_pole?: { id: number; sequence: number; pole?: { id: number; pole_code: string } }
}

type EditForm = {
  span_code: string
  length_meters: string
  status: SpanStatus | ''
}

const statusConfig: Record<SpanStatus, { label: string; dot: string; badge: string }> = {
  pending:     { label: 'Pending',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20' },
  in_progress: { label: 'Ongoing',   dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/20' },
  completed:   { label: 'Completed', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/20' },
  cancelled:   { label: 'Cancelled', dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:ring-slate-500/20' },
}

const statCards = [
  { label: 'Total Spans', key: 'total',      icon: 'bx bx-git-branch',    accent: 'from-[#0072ff] to-[#00a6ff]' },
  { label: 'Pending',     key: 'pending',    icon: 'bx bx-time',          accent: 'from-amber-400 to-orange-400' },
  { label: 'Ongoing',     key: 'in_progress',icon: 'bx bx-loader-circle', accent: 'from-indigo-500 to-violet-500' },
  { label: 'Completed',   key: 'completed',  icon: 'bx bx-badge-check',   accent: 'from-emerald-500 to-teal-500' },
] as const

const statuses: Array<'all' | SpanStatus> = ['all', 'pending', 'in_progress', 'completed', 'cancelled']

const iCls = 'h-[42px] w-full rounded-2xl border border-[#d8e6f8] bg-[#f7fbff] px-3.5 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100 dark:focus:border-[#4ea9ff] dark:focus:bg-[#162744] dark:focus:ring-[#4ea9ff]/15'
const sCls = `${iCls} appearance-none pr-10 cursor-pointer`
const fiCls = 'h-9 w-full rounded-full border border-[#d8e6f8] bg-white px-4 text-xs font-medium text-slate-600 outline-none transition hover:border-[#8fc5ff] focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#15233c]/80 dark:text-slate-200'
const fsCls = `${fiCls} appearance-none pr-8 cursor-pointer`
const lCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'
const primaryBtnCls = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]'
const secondaryBtnCls = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
const dangerBtnCls = 'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_28px_-16px_rgba(220,38,38,0.55)] transition hover:bg-red-700 active:scale-[0.99]'

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function Modal({
  open, title, subtitle, icon, children, onClose, widthClass = 'max-w-lg', danger = false,
}: {
  open: boolean; title: string; subtitle?: string; icon?: string
  children: ReactNode; onClose: () => void; widthClass?: string; danger?: boolean
}) {
  if (!open) return null
  if (danger) {
    return (
      <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[5px]" onClick={onClose} />
        <div className={`relative w-full ${widthClass} overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)] dark:border-zinc-700 dark:bg-zinc-900`}>
          <button onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-zinc-800">
            <i className="bx bx-x text-[22px]" />
          </button>
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/70 dark:bg-red-500/10 dark:ring-red-500/10">
              <i className={`${icon ?? 'bx bx-trash'} translate-y-px text-[26px] text-red-500 dark:text-red-400`} />
            </div>
          </div>
          <div className="text-center">
            <h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h5>
            {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={onClose} />
      <div className={`relative w-full ${widthClass} overflow-hidden rounded-[30px] border border-[#dbe8ff] bg-white shadow-[0_36px_100px_-34px_rgba(6,36,90,0.5)] dark:border-[#27436a] dark:bg-[#0f1728]`}>
        <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-[#0072ff]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 -top-10 h-44 w-44 rounded-full bg-[#5fd0ff]/20 blur-3xl" />
        <div className="relative overflow-hidden border-b border-white/20 bg-linear-to-r from-[#0057d9] via-[#0072ff] to-[#00a6ff] px-6 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-linear-to-b from-white/30 to-transparent" />
          <div className="relative flex items-center gap-3.5">
            {icon && (
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/30 bg-white/15 text-white backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-full bg-linear-to-b from-white/35 to-transparent" />
                <i className={`${icon} relative translate-y-px text-[19px]`} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h5 className="text-sm font-bold tracking-[0.01em] text-white">{title}</h5>
              {subtitle && <p className="mt-0.5 text-xs text-white/80">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white">
              <i className="bx bx-x text-[21px]" />
            </button>
          </div>
        </div>
        <div className="relative bg-[linear-gradient(180deg,rgba(248,251,255,0.92),rgba(255,255,255,1))] p-6 dark:bg-[linear-gradient(180deg,rgba(15,23,40,0.98),rgba(15,23,40,1))]">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function SpanList() {
  const [spans, setSpans]     = useState<Span[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SpanStatus>('all')
  const [page, setPage]       = useState(1)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDelOpen, setIsDelOpen]   = useState(false)
  const [selected, setSelected]     = useState<Span | null>(null)
  const [editForm, setEditForm]     = useState<EditForm>({ span_code: '', length_meters: '', status: '' })
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  const perPage = 50

  useEffect(() => {
    fetch(`${SKYCABLE_API}/spans?per_page=500`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setSpans(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => ({
    total:       spans.length,
    pending:     spans.filter(s => s.status === 'pending').length,
    in_progress: spans.filter(s => s.status === 'in_progress').length,
    completed:   spans.filter(s => s.status === 'completed').length,
  }), [spans])

  const filtered = spans.filter(s => {
    const q = search.toLowerCase()
    return (
      (!q ||
        (s.span_code ?? '').toLowerCase().includes(q) ||
        (s.node?.full_label ?? s.node?.name ?? '').toLowerCase().includes(q) ||
        (s.node?.area?.name ?? '').toLowerCase().includes(q) ||
        (s.from_pole?.pole?.pole_code ?? '').toLowerCase().includes(q) ||
        (s.to_pole?.pole?.pole_code ?? '').toLowerCase().includes(q)
      ) &&
      (statusFilter === 'all' || s.status === statusFilter)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  const close = () => {
    setIsEditOpen(false); setIsDelOpen(false)
    setSelected(null); setEditForm({ span_code: '', length_meters: '', status: '' })
    setFormError(null)
  }

  const handleEdit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected) return
    setSaving(true); setFormError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          span_code:     editForm.span_code || null,
          length_meters: editForm.length_meters ? Number(editForm.length_meters) : null,
          status:        editForm.status || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = (data.message as string | undefined) ??
          (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed to update'
        throw new Error(msg)
      }
      setSpans(prev => prev.map(s => s.id === selected.id
        ? { ...s, span_code: editForm.span_code || undefined, length_meters: editForm.length_meters ? Number(editForm.length_meters) : null, status: editForm.status as SpanStatus }
        : s
      ))
      close()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    setSaving(true); setFormError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete span')
      setSpans(prev => prev.filter(s => s.id !== selected.id))
      close()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mb-5 flex items-start justify-between px-0.5">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Span List</h4>
          <p className="mt-0.5 text-sm text-gray-400 dark:text-zinc-500">Cable span connections between poles · All Nodes</p>
        </div>
        <nav>
          <ol className="flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
            <li><a href="/dashboard" className="hover:text-[#0b6cff]">Dashboard</a></li>
            <li>/</li>
            <li className="text-gray-600 dark:text-zinc-300">Spans</li>
          </ol>
        </nav>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {statCards.map(c => {
          const val = c.key === 'total' ? stats.total : stats[c.key as Exclude<keyof typeof stats, 'total'>]
          return (
            <div key={c.label} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
              <div className={`h-1 w-full bg-linear-to-r ${c.accent}`} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{c.label}</p>
                    <p className="mt-2 text-[28px] font-extrabold leading-none text-gray-800 dark:text-gray-100">{val}</p>
                  </div>
                  <div className={`relative mt-3 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-r ${c.accent} shadow-lg`}>
                    <div className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-full bg-linear-to-b from-white/35 to-transparent" />
                    <i className={`${c.icon} translate-y-px text-[21px] text-white`} />
                  </div>
                </div>
              </div>
              <div className={`pointer-events-none absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-linear-to-r ${c.accent} opacity-[0.06]`} />
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-zinc-700">
          <div className="relative min-w-45 max-w-xs flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search span code, node, pole…" className={`${fiCls} pl-9`} />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as 'all' | SpanStatus); setPage(1) }}
              className={fsCls} style={{ minWidth: 160 }}>
              {statuses.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : statusConfig[s].label}</option>
              ))}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
          </div>
          <span className="ml-auto text-xs font-medium text-gray-400 dark:text-zinc-500">
            {filtered.length} {filtered.length === 1 ? 'span' : 'spans'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                <th className="w-10 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4] dark:text-[#3f6190]">#</th>
                {[
                  { label: 'Span Code',  align: 'left'   },
                  { label: 'From Pole',  align: 'center' },
                  { label: 'To Pole',    align: 'center' },
                  { label: 'Node',       align: 'left'   },
                  { label: 'Area',       align: 'center' },
                  { label: 'Length (m)', align: 'center' },
                  { label: 'Status',     align: 'center' },
                  { label: 'Actions',    align: 'center' },
                ].map(h => (
                  <th key={h.label} className={`whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4] dark:text-[#3f6190] text-${h.align}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f2ff] dark:bg-[#162744]">
                    <i className="bx bx-loader-alt animate-spin text-2xl text-[#0072ff] dark:text-[#4ea9ff]" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-400 dark:text-zinc-500">Loading spans…</p>
                </td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f5ff] dark:bg-[#162035]">
                    <i className="bx bx-git-branch text-2xl text-[#9bb8dc] dark:text-[#3a5a82]" />
                  </div>
                  <p className="text-sm font-semibold text-slate-400 dark:text-zinc-500">No spans found</p>
                </td></tr>
              ) : paginated.map((s, idx) => (
                <tr key={s.id} className="border-b border-[#f0f5ff] transition-colors last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60">
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-[11px] font-bold tabular-nums text-[#b0c8e8] dark:text-[#2e4d6e]">{(safePage - 1) * perPage + idx + 1}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8f2ff] dark:bg-[#162744]">
                        <i className="bx bx-git-branch translate-y-px text-sm text-[#0072ff] dark:text-[#4ea9ff]" />
                      </div>
                      <span className="font-mono text-[13px] font-bold text-[#0b6cff] dark:text-[#4ea9ff]">
                        {s.span_code ?? <span className="font-normal text-slate-300 dark:text-zinc-600">—</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold text-slate-600 dark:text-zinc-300">
                    {s.from_pole?.pole?.pole_code ?? `#${s.from_pole?.id ?? '—'}`}
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold text-slate-600 dark:text-zinc-300">
                    {s.to_pole?.pole?.pole_code ?? `#${s.to_pole?.id ?? '—'}`}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-zinc-300">
                    {s.node?.full_label ?? s.node?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {s.node?.area?.name
                      ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                          <i className="bx bx-map-pin text-xs text-slate-400" />
                          {s.node.area.name}
                        </span>
                      : <span className="text-slate-300 dark:text-zinc-600">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs font-medium text-slate-500 dark:text-zinc-400">
                    {s.length_meters != null ? `${s.length_meters} m` : <span className="text-slate-300 dark:text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${statusConfig[s.status]?.badge ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusConfig[s.status]?.dot ?? 'bg-gray-400'}`} />
                      {statusConfig[s.status]?.label ?? s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setSelected(s)
                          setEditForm({ span_code: s.span_code ?? '', length_meters: s.length_meters != null ? String(s.length_meters) : '', status: s.status })
                          setIsEditOpen(true)
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#e8f2ff] hover:text-[#0072ff] dark:hover:bg-[#162744] dark:hover:text-[#4ea9ff]">
                        <i className="bx bx-edit translate-y-px text-sm" />
                      </button>
                      <button
                        onClick={() => { setSelected(s); setIsDelOpen(true) }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                        <i className="bx bx-trash translate-y-px text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-zinc-700">
            <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">Page {safePage} of {totalPages} · {filtered.length} total</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700">‹ Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`h-8 min-w-8 rounded-lg border text-xs font-semibold ${n === safePage ? 'border-[#0b6cff] bg-[#0b6cff] text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700">Next ›</button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={isEditOpen} title="Edit Span" subtitle={`Editing: ${selected?.span_code ?? `Span #${selected?.id}`}`} icon="bx bx-edit" onClose={close}>
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={lCls}>Span Code <span className="normal-case text-slate-300">(optional)</span></label>
              <input value={editForm.span_code} onChange={e => setEditForm(p => ({ ...p, span_code: e.target.value }))} placeholder="e.g. SP-001" className={iCls} />
            </div>
            <div>
              <label className={lCls}>Length (meters)</label>
              <input type="number" step="any" min="0" value={editForm.length_meters} onChange={e => setEditForm(p => ({ ...p, length_meters: e.target.value }))} placeholder="e.g. 50" className={iCls} />
            </div>
            <div>
              <label className={lCls}>Status</label>
              <div className="relative">
                <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as SpanStatus }))} className={sCls}>
                  {statuses.filter(s => s !== 'all').map(s => (
                    <option key={s} value={s}>{statusConfig[s].label}</option>
                  ))}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
              </div>
            </div>
          </div>
          {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{formError}</div>}
          <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4 dark:border-[#263d5f]">
            <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
            <button type="submit" disabled={saving} className={`${primaryBtnCls} disabled:opacity-60`}>
              {saving ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin text-base" /> Saving…</span> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={isDelOpen} title="Delete Span?" subtitle="This action cannot be undone." icon="bx bx-trash" onClose={close} widthClass="max-w-md" danger>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/70">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([
                ['Span Code', selected?.span_code ?? '—'],
                ['Status',    selected ? (statusConfig[selected.status]?.label ?? selected.status) : '—'],
                ['From Pole', selected?.from_pole?.pole?.pole_code ?? '—'],
                ['To Pole',   selected?.to_pole?.pole?.pole_code ?? '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{k}</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-200">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{formError}</div>}
          <div className="flex gap-3">
            <button onClick={handleDelete} disabled={saving} className={`${dangerBtnCls} flex-1 disabled:opacity-60`}>{saving ? 'Deleting…' : 'Yes, Delete'}</button>
            <button onClick={close} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
