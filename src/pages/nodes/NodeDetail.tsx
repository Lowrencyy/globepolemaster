import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { idFromSlug } from '../../lib/utils'

type NodeInfo = {
  id: number
  name: string
  full_label?: string
  status: 'pending' | 'in_progress' | 'completed'
  region?: string
  province?: string
  city?: string
  barangay_name?: string
  area?: { id: number; name: string }
}

type PoleRecord = {
  id: number
  sequence: number
  pole?: {
    id: number
    pole_code: string
    lat?: string | null
    lng?: string | null
  }
}

type FormState = {
  pole_code: string
  lat: string
  lng: string
}

type SpanFormState = {
  from_pole_id: number | ''
  to_pole_id: number | ''
  span_code: string
  length_meters: string
}

const emptySpanForm = (): SpanFormState => ({ from_pole_id: '', to_pole_id: '', span_code: '', length_meters: '' })

const statusConfig = {
  pending:     { label: 'Pending',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  in_progress: { label: 'Ongoing',   dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  completed:   { label: 'Completed', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
}

const iCls = 'h-[42px] w-full rounded-2xl border border-[#d8e6f8] bg-[#f7fbff] px-3.5 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100 dark:focus:border-[#4ea9ff] dark:focus:bg-[#162744] dark:focus:ring-[#4ea9ff]/15'
const lCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'
const primaryBtnCls = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]'
const secondaryBtnCls = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
const dangerBtnCls = 'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_28px_-16px_rgba(220,38,38,0.55)] transition hover:bg-red-700 active:scale-[0.99]'

const emptyForm = (): FormState => ({ pole_code: '', lat: '', lng: '' })

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
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[5px]" onClick={onClose} />
        <div className={`relative w-full ${widthClass} overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)] dark:border-zinc-700 dark:bg-zinc-900`}>
          <button onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
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
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white">
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

export default function NodeDetail() {
  const { siteSlug = '', nodeSlug = '' } = useParams()
  const navigate = useNavigate()
  const siteId = idFromSlug(siteSlug) || Number(siteSlug)
  const nodeId = idFromSlug(nodeSlug) || Number(nodeSlug)

  const [node, setNode]       = useState<NodeInfo | null>(null)
  const [poles, setPoles]     = useState<PoleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [nodeLoading, setNodeLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)

  const [isAddOpen, setIsAddOpen]       = useState(false)
  const [isEditOpen, setIsEditOpen]     = useState(false)
  const [isDelOpen, setIsDelOpen]       = useState(false)
  const [isSpanOpen, setIsSpanOpen]     = useState(false)
  const [selected, setSelected]         = useState<PoleRecord | null>(null)
  const [formData, setFormData]         = useState<FormState>(emptyForm())
  const [spanForm, setSpanForm]         = useState<SpanFormState>(emptySpanForm())
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState<string | null>(null)
  const [spanError, setSpanError]       = useState<string | null>(null)

  const perPage = 50

  useEffect(() => {
    if (!nodeId) return
    fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setNode(data))
      .catch(() => {})
      .finally(() => setNodeLoading(false))
  }, [nodeId])

  function loadPoles() {
    if (!nodeId) return
    fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setPoles(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadPoles() }, [nodeId])

  const filtered = poles.filter(p => {
    const q = search.toLowerCase()
    return !q || (p.pole?.pole_code ?? '').toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  const nodeStatus = node?.status ?? 'pending'
  const sc = statusConfig[nodeStatus] ?? statusConfig.pending

  const close = () => {
    setIsAddOpen(false); setIsEditOpen(false); setIsDelOpen(false); setIsSpanOpen(false)
    setSelected(null); setFormData(emptyForm()); setFormError(null)
    setSpanForm(emptySpanForm()); setSpanError(null)
  }

  const handleAddSpan = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true); setSpanError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/spans`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          node_id:       nodeId,
          from_pole_id:  spanForm.from_pole_id,
          to_pole_id:    spanForm.to_pole_id,
          span_code:     spanForm.span_code || null,
          length_meters: spanForm.length_meters ? Number(spanForm.length_meters) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = (data.message as string | undefined) ??
          (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed to add span'
        throw new Error(msg)
      }
      close()
    } catch (err) {
      setSpanError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true); setFormError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/poles`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          pole_code: formData.pole_code.trim(),
          lat:       formData.lat || null,
          lng:       formData.lng || null,
          node_id:   nodeId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = (data.message as string | undefined) ??
          (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed to add pole'
        throw new Error(msg)
      }
      close()
      setLoading(true)
      loadPoles()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected?.pole) return
    setSaving(true); setFormError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/poles/${selected.pole.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          pole_code: formData.pole_code.trim(),
          lat:       formData.lat || null,
          lng:       formData.lng || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = (data.message as string | undefined) ??
          (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed to update pole'
        throw new Error(msg)
      }
      close()
      setLoading(true)
      loadPoles()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected?.pole) return
    setSaving(true); setFormError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/poles/${selected.pole.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete pole')
      close()
      setPoles(prev => prev.filter(p => p.id !== selected.id))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const renderForm = (mode: 'add' | 'edit') => (
    <form onSubmit={mode === 'add' ? handleAdd : handleEdit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={lCls}>Pole Code</label>
          <input
            required
            value={formData.pole_code}
            onChange={e => setFormData(p => ({ ...p, pole_code: e.target.value }))}
            placeholder="e.g. SKY-00123"
            className={iCls}
          />
        </div>
        <div>
          <label className={lCls}>Latitude</label>
          <input
            type="number" step="any"
            value={formData.lat}
            onChange={e => setFormData(p => ({ ...p, lat: e.target.value }))}
            placeholder="e.g. 14.5995"
            className={iCls}
          />
        </div>
        <div>
          <label className={lCls}>Longitude</label>
          <input
            type="number" step="any"
            value={formData.lng}
            onChange={e => setFormData(p => ({ ...p, lng: e.target.value }))}
            placeholder="e.g. 120.9842"
            className={iCls}
          />
        </div>
      </div>

      {formError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {formError}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4 dark:border-[#263d5f]">
        <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
        <button type="submit" disabled={saving} className={`${primaryBtnCls} disabled:opacity-60`}>
          {saving
            ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin text-base" /> Saving…</span>
            : mode === 'add' ? 'Add Pole' : 'Save Changes'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/sites" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
          Site List
        </Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/sites/${siteSlug}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
          {nodeLoading ? '…' : (node?.area?.name ?? 'Site')}
        </Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {nodeLoading ? '…' : (node?.full_label ?? node?.name ?? 'Node')}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">
            {nodeLoading ? '…' : (node?.full_label ?? node?.name)} — Poles
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            {node?.area?.name && <span>{node.area.name}</span>}
            {node?.province  && <><span>·</span><span>{node.province}</span></>}
            {node?.city      && <><span>·</span><span>{node.city}</span></>}
            {node && (
              <>
                <span>·</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(`/sites/${siteSlug}`)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Nodes
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
          <div className="h-1 w-full bg-linear-to-r from-[#0072ff] to-[#00a6ff]" />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Total Poles</p>
            <p className="mt-2 text-[28px] font-extrabold leading-none text-gray-800 dark:text-gray-100">{poles.length}</p>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
          <div className="h-1 w-full bg-linear-to-r from-emerald-500 to-teal-500" />
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">With Coordinates</p>
            <p className="mt-2 text-[28px] font-extrabold leading-none text-gray-800 dark:text-gray-100">
              {poles.filter(p => p.pole?.lat && p.pole?.lng).length}
            </p>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-zinc-700">
          <div className="relative min-w-45 max-w-xs flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search pole code…"
              className="h-9 w-full rounded-full border border-[#d8e6f8] bg-white pl-9 pr-4 text-xs font-medium text-slate-600 outline-none transition hover:border-[#8fc5ff] focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#15233c]/80 dark:text-slate-200"
            />
          </div>
          <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">
            {filtered.length} {filtered.length === 1 ? 'pole' : 'poles'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setSpanForm(emptySpanForm()); setIsSpanOpen(true) }}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-700 active:scale-[0.99]"
            >
              <i className="bx bx-git-branch translate-y-px text-[18px]" />
              Add Span
            </button>
            <button
              onClick={() => { setFormData(emptyForm()); setIsAddOpen(true) }}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]"
            >
              <i className="bx bx-plus translate-y-px text-[18px]" />
              Add Pole
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                <th className="w-10 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4] dark:text-[#3f6190]">#</th>
                {[
                  { label: 'Seq',         align: 'center' },
                  { label: 'Pole Code',   align: 'left'   },
                  { label: 'Coordinates', align: 'center' },
                  { label: 'Actions',     align: 'center' },
                ].map(h => (
                  <th key={h.label}
                    className={`whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4] dark:text-[#3f6190] text-${h.align}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f2ff] dark:bg-[#162744]">
                      <i className="bx bx-loader-alt animate-spin text-2xl text-[#0072ff] dark:text-[#4ea9ff]" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-400 dark:text-zinc-500">Loading poles…</p>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f5ff] dark:bg-[#162035]">
                      <i className="bx bx-map-pin text-2xl text-[#9bb8dc] dark:text-[#3a5a82]" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400 dark:text-zinc-500">No poles assigned to this node</p>
                  </td>
                </tr>
              ) : (
                paginated.map((p, idx) => (
                  <tr key={p.id} className="border-b border-[#f0f5ff] transition-colors last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60">
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-[11px] font-bold tabular-nums text-[#b0c8e8] dark:text-[#2e4d6e]">
                        {(safePage - 1) * perPage + idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8f2ff] text-xs font-bold text-[#0072ff] dark:bg-[#162744] dark:text-[#4ea9ff]">
                        {p.sequence}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8f2ff] dark:bg-[#162744]">
                          <i className="bx bx-map-pin translate-y-px text-sm text-[#0072ff] dark:text-[#4ea9ff]" />
                        </div>
                        <span className="font-mono text-[13px] font-bold text-[#0b6cff] dark:text-[#4ea9ff]">
                          {p.pole?.pole_code ?? `Pole #${p.id}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-400 dark:text-zinc-500">
                      {p.pole?.lat && p.pole?.lng
                        ? `${p.pole.lat}, ${p.pole.lng}`
                        : <span className="text-slate-300 dark:text-zinc-600">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setSelected(p)
                            setFormData({
                              pole_code: p.pole?.pole_code ?? '',
                              lat:       p.pole?.lat ?? '',
                              lng:       p.pole?.lng ?? '',
                            })
                            setIsEditOpen(true)
                          }}
                          title="Edit"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#e8f2ff] hover:text-[#0072ff] dark:hover:bg-[#162744] dark:hover:text-[#4ea9ff]"
                        >
                          <i className="bx bx-edit translate-y-px text-sm" />
                        </button>
                        <button
                          onClick={() => { setSelected(p); setIsDelOpen(true) }}
                          title="Delete"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          <i className="bx bx-trash translate-y-px text-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-zinc-700">
            <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">
              Page {safePage} of {totalPages} · {filtered.length} total
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700">
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`h-8 min-w-8 rounded-lg border text-xs font-semibold ${n === safePage ? 'border-[#0b6cff] bg-[#0b6cff] text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700">
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={isSpanOpen} title="Add Span" subtitle={`Node: ${node?.full_label ?? node?.name ?? ''}`} icon="bx bx-git-branch" onClose={close}>
        <form onSubmit={handleAddSpan} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>From Pole</label>
              <div className="relative">
                <select
                  required
                  value={spanForm.from_pole_id}
                  onChange={e => setSpanForm(p => ({ ...p, from_pole_id: Number(e.target.value) || '' }))}
                  className={`${iCls} appearance-none pr-10 cursor-pointer`}
                >
                  <option value="">Select pole</option>
                  {poles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.pole?.pole_code ?? `Pole #${p.id}`} (Seq {p.sequence})
                    </option>
                  ))}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
              </div>
            </div>
            <div>
              <label className={lCls}>To Pole</label>
              <div className="relative">
                <select
                  required
                  value={spanForm.to_pole_id}
                  onChange={e => setSpanForm(p => ({ ...p, to_pole_id: Number(e.target.value) || '' }))}
                  className={`${iCls} appearance-none pr-10 cursor-pointer`}
                >
                  <option value="">Select pole</option>
                  {poles.filter(p => p.id !== spanForm.from_pole_id).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.pole?.pole_code ?? `Pole #${p.id}`} (Seq {p.sequence})
                    </option>
                  ))}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
              </div>
            </div>
            <div>
              <label className={lCls}>Span Code <span className="normal-case text-slate-300">(optional)</span></label>
              <input
                value={spanForm.span_code}
                onChange={e => setSpanForm(p => ({ ...p, span_code: e.target.value }))}
                placeholder="e.g. SP-001"
                className={iCls}
              />
            </div>
            <div>
              <label className={lCls}>Length (meters) <span className="normal-case text-slate-300">(optional)</span></label>
              <input
                type="number" step="any" min="0"
                value={spanForm.length_meters}
                onChange={e => setSpanForm(p => ({ ...p, length_meters: e.target.value }))}
                placeholder="e.g. 50"
                className={iCls}
              />
            </div>
          </div>

          {spanError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {spanError}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4 dark:border-[#263d5f]">
            <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
            <button type="submit" disabled={saving} className={`${primaryBtnCls} disabled:opacity-60`}>
              {saving
                ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin text-base" /> Saving…</span>
                : 'Add Span'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={isAddOpen} title="Add Pole" subtitle={`Node: ${node?.full_label ?? node?.name ?? ''}`} icon="bx bx-map-pin" onClose={close}>
        {renderForm('add')}
      </Modal>

      <Modal open={isEditOpen} title="Edit Pole" subtitle={`Editing: ${selected?.pole?.pole_code ?? ''}`} icon="bx bx-edit" onClose={close}>
        {renderForm('edit')}
      </Modal>

      <Modal open={isDelOpen} title="Delete Pole?" subtitle="This action cannot be undone." icon="bx bx-trash" onClose={close} widthClass="max-w-md" danger>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/70">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([
                ['Pole Code', selected?.pole?.pole_code],
                ['Sequence',  String(selected?.sequence ?? '')],
                ['Lat',       selected?.pole?.lat ?? '—'],
                ['Lng',       selected?.pole?.lng ?? '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{k}</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-200">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
          {formError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {formError}
            </div>
          )}
          <div className="flex flex-row justify-center gap-3">
            <button onClick={handleDelete} disabled={saving} className={`${dangerBtnCls} flex-1 disabled:opacity-60`}>
              {saving ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button onClick={close} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
