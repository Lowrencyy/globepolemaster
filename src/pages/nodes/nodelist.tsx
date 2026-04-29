import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAdmin, canManageStatus, getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { slugify } from '../../lib/utils'
import PsgcCascade from '../../components/PsgcCascade'

type NodeStatus = 'pending' | 'in_progress' | 'completed'

type Area = { id: number; name: string; nodes_count?: number }

type Node = {
  id: number
  name: string
  label?: string
  full_label?: string
  area_id: number
  barangay_code?: string
  status: NodeStatus
  area?: Area
  // direct location columns (preferred)
  region?: string
  province?: string
  city?: string
  barangay_name?: string
}

type FormState = {
  name: string
  area_id: number | ''
  barangay_code: string
  region: string
  province: string
  city: string
  barangay_name: string
  // PsgcCascade display helpers
  _region: string
  _province: string
  _city: string
  _barangay: string
  status: NodeStatus | ''
}

const statusConfig: Record<NodeStatus, { label: string; dot: string; badge: string }> = {
  pending:     { label: 'Pending',     dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20' },
  in_progress: { label: 'Ongoing',     dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/20' },
  completed:   { label: 'Completed',   dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/20' },
}

const statCards = [
  { label: 'Total Nodes', key: 'total',       icon: 'bx bx-git-commit',    accent: 'from-[#0072ff] to-[#00a6ff]' },
  { label: 'Pending',     key: 'pending',      icon: 'bx bx-time',          accent: 'from-amber-400 to-orange-400' },
  { label: 'Ongoing',     key: 'in_progress',  icon: 'bx bx-loader-circle', accent: 'from-indigo-500 to-violet-500' },
  { label: 'Completed',   key: 'completed',    icon: 'bx bx-badge-check',   accent: 'from-emerald-500 to-teal-500' },
] as const

const statuses: Array<'all' | NodeStatus> = ['all', 'pending', 'in_progress', 'completed']

const iCls = 'h-[42px] w-full rounded-2xl border border-[#d8e6f8] bg-[#f7fbff] px-3.5 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100 dark:focus:border-[#4ea9ff] dark:focus:bg-[#162744] dark:focus:ring-[#4ea9ff]/15'
const sCls = `${iCls} appearance-none pr-10 cursor-pointer`
const fiCls = 'h-9 w-full rounded-full border border-[#d8e6f8] bg-white px-4 text-xs font-medium text-slate-600 shadow-[0_6px_18px_-14px_rgba(10,67,150,0.35)] outline-none transition hover:border-[#8fc5ff] focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#15233c]/80 dark:text-slate-200 dark:hover:border-[#3f7dd9] dark:focus:border-[#4ea9ff]'
const fsCls = `${fiCls} appearance-none pr-8 cursor-pointer`
const lCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'
const primaryBtnCls = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]'
const secondaryBtnCls = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
const dangerBtnCls = 'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_28px_-16px_rgba(220,38,38,0.55)] transition hover:bg-red-700 active:scale-[0.99]'

const emptyForm = (areaId: number | '' = ''): FormState => ({
  name: '', area_id: areaId, barangay_code: '',
  region: '', province: '', city: '', barangay_name: '',
  _region: '', _province: '', _city: '', _barangay: '',
  status: '',
})

function Chevron() {
  return <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-2 flex items-center gap-3 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">{label}</span>
      <div className="h-px flex-1 bg-linear-to-r from-[#cfe2ff] via-[#e8f2ff] to-transparent dark:from-[#244a78] dark:via-[#1e3552] dark:to-transparent" />
    </div>
  )
}

function Modal({
  open, title, subtitle, icon, children, onClose, widthClass = 'max-w-2xl', danger = false,
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

function StatusModal({ node, onClose, onSave }: { node: Node; onClose: () => void; onSave: (s: NodeStatus) => void }) {
  const [selected, setSelected] = useState<NodeStatus>(node.status)
  return (
    <Modal open title="Update Node Status" subtitle={`${node.full_label ?? node.name}`} icon="bx bx-transfer" onClose={onClose} widthClass="max-w-sm">
      <div className="flex flex-col gap-2.5">
        {(Object.keys(statusConfig) as NodeStatus[]).map(s => (
          <button key={s} onClick={() => setSelected(s)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
              selected === s
                ? 'border-[#0072ff] bg-[#e8f2ff] dark:border-[#4ea9ff] dark:bg-[#162744]'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800'
            }`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusConfig[s].dot}`} />
            <span className={selected === s ? 'font-semibold text-[#0072ff] dark:text-[#4ea9ff]' : 'text-slate-700 dark:text-zinc-200'}>
              {statusConfig[s].label}
            </span>
            {selected === s && <i className="bx bx-check ml-auto text-lg text-[#0072ff] dark:text-[#4ea9ff]" />}
          </button>
        ))}
        <div className="mt-2 flex gap-2 border-t border-[#e4eefb] pt-4 dark:border-[#263d5f]">
          <button onClick={onClose} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          <button onClick={() => onSave(selected)} className={`${primaryBtnCls} flex-1`}>Save Status</button>
        </div>
      </div>
    </Modal>
  )
}

export default function AllPoles({ areaId, siteId, siteSlug }: { areaId?: number; siteId?: number; siteSlug?: string } = {}) {
  const admin     = isAdmin()
  const canStatus = canManageStatus()
  const navigate  = useNavigate()

  const [nodes, setNodes]           = useState<Node[]>([])
  const [areas, setAreas]           = useState<Area[]>([])
  const [loading, setLoading]       = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError]     = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | NodeStatus>('all')
  const [page, setPage]             = useState(1)
  const [isAddOpen, setIsAddOpen]   = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDelOpen, setIsDelOpen]   = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [formData, setFormData]     = useState<FormState>(emptyForm(areaId))
  const [selected, setSelected]     = useState<Node | null>(null)

  const perPage = 50

  const nodesCacheKey = `nodelist_nodes_${areaId ?? 'all'}_${siteId ?? 'all'}`

  // ── Fetch areas ────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken()
    const hit = cacheGet<Area[]>('nodelist_areas')
    if (hit) setAreas(hit)
    fetch(`${SKYCABLE_API}/areas`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' },
    })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) { setAreas(data); cacheSet('nodelist_areas', data) } })
      .catch(() => {})
  }, [])

  // ── Fetch nodes ────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken()
    const hit = cacheGet<Node[]>(nodesCacheKey)
    if (hit) { setNodes(hit); setLoading(false) }
    const p = new URLSearchParams()
    if (areaId) p.set('area_id', String(areaId))
    if (siteId) p.set('site_id', String(siteId))
    const params = p.toString() ? `?${p}` : ''
    fetch(`${SKYCABLE_API}/nodes${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' },
    })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data ?? [])
        setNodes(list)
        cacheSet(nodesCacheKey, list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [areaId, siteId])

  const stats = useMemo(() => ({
    total:       nodes.length,
    pending:     nodes.filter(n => n.status === 'pending').length,
    in_progress: nodes.filter(n => n.status === 'in_progress').length,
    completed:   nodes.filter(n => n.status === 'completed').length,
  }), [nodes])

  const filtered = nodes.filter(n => {
    const q = search.toLowerCase()
    const label = (n.full_label ?? n.name ?? '').toLowerCase()
    const area  = (n.area?.name ?? '').toLowerCase()
    const city  = (n.barangay?.city?.name ?? '').toLowerCase()
    return (
      (!q || label.includes(q) || area.includes(q) || city.includes(q)) &&
      (statusFilter === 'all' || n.status === statusFilter)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  const close = () => {
    setIsAddOpen(false); setIsEditOpen(false); setIsDelOpen(false); setIsStatusOpen(false)
    setSelected(null); setFormData(emptyForm(areaId)); setAddError(null)
  }

  // ── Add node — POST to backend ─────────────────────────────────────────────
  const handleAdd = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)
    try {
      const token = getToken()
      const payload = {
        name:          formData.name,
        area_id:       formData.area_id,
        barangay_code: formData.barangay_code || null,
        status:        formData.status || 'pending',
        region:        formData.region,
        province:      formData.province,
        city:          formData.city,
        barangay_name: formData.barangay_name,
      }
      const res = await fetch(`${SKYCABLE_API}/nodes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const errMsg = (data.message as string | undefined) ?? (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed to add node'
        throw new Error(errMsg)
      }
      const newNode: Node = data.data ?? data
      setNodes(prev => { const next = [newNode, ...prev]; cacheSet(nodesCacheKey, next); return next })
      setPage(1)
      close()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAddLoading(false)
    }
  }

  const handleEdit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected) return
    setNodes(prev => { const next = prev.map(n => n.id === selected.id ? { ...n, name: formData.name, status: formData.status as NodeStatus } : n); cacheSet(nodesCacheKey, next); return next })
    close()
  }

  const handleDelete = () => {
    if (!selected) return
    setNodes(prev => { const next = prev.filter(n => n.id !== selected.id); cacheSet(nodesCacheKey, next); return next })
    close()
  }

  const handleStatusSave = (status: NodeStatus) => {
    if (!selected) return
    setNodes(prev => { const next = prev.map(n => n.id === selected.id ? { ...n, status } : n); cacheSet(nodesCacheKey, next); return next })
    close()
  }

  const renderNodeForm = (mode: 'add' | 'edit') => (
    <form onSubmit={mode === 'add' ? handleAdd : handleEdit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Basic Info" />

        <div className="col-span-2">
          <label className={lCls}>Node Name</label>
          <input
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            className={iCls} placeholder="e.g. Makati Central Node" required
          />
        </div>

        <div>
          <label className={lCls}>Area</label>
          <div className="relative">
            <select
              value={formData.area_id}
              onChange={e => setFormData(p => ({ ...p, area_id: Number(e.target.value) || '' }))}
              className={sCls} required
              disabled={!!areaId}
            >
              <option value="">Select Area</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <Chevron />
          </div>
        </div>

        <div>
          <label className={lCls}>Status</label>
          <div className="relative">
            <select
              value={formData.status}
              onChange={e => setFormData(p => ({ ...p, status: e.target.value as NodeStatus }))}
              className={sCls}
            >
              <option value="">Select Status</option>
              {statuses.filter(s => s !== 'all').map(s => (
                <option key={s} value={s}>{statusConfig[s].label}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Location (Barangay)" />
        <PsgcCascade
          region={formData._region}
          province={formData._province}
          city={formData._city}
          barangay={formData._barangay}
          onChange={u => setFormData(p => ({
            ...p,
            _region:       u.region        ?? p._region,
            _province:     u.province      ?? p._province,
            _city:         u.city          ?? p._city,
            _barangay:     u.barangay      ?? p._barangay,
            barangay_code: u.barangay_code ?? p.barangay_code,
            region:        u.region        ?? p.region,
            province:      u.province      ?? p.province,
            city:          u.city          ?? p.city,
            barangay_name: u.barangay      ?? p.barangay_name,
          }))}
          inputClass={sCls}
          labelClass={lCls}
        />
      </div>

      {addError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {addError}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4 dark:border-[#263d5f]">
        <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
        <button type="submit" disabled={addLoading} className={`${primaryBtnCls} disabled:opacity-60`}>
          {addLoading
            ? <span className="flex items-center gap-2"><i className="bx bx-loader-alt animate-spin text-base" /> Saving…</span>
            : mode === 'add' ? 'Save Node' : 'Update Node'
          }
        </button>
      </div>
    </form>
  )

  return (
    <>
      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {statCards.map(c => {
          const val = c.key === 'total' ? stats.total : stats[c.key as Exclude<keyof typeof stats, 'total'>]
          return (
            <div key={c.label} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
              <div className={`h-1 w-full bg-linear-to-r ${c.accent}`} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
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

      {/* ── Table Card ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-zinc-700">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search name, area, city…" className={`${fiCls} pl-9`} />
          </div>

          <div className="relative">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as 'all' | NodeStatus); setPage(1) }}
              className={fsCls} style={{ minWidth: 150 }}>
              {statuses.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : statusConfig[s].label}</option>
              ))}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
          </div>

          <span className="ml-auto text-xs font-medium text-gray-400 dark:text-zinc-500">
            {filtered.length} {filtered.length === 1 ? 'node' : 'nodes'}
          </span>

          <button
            onClick={() => { setFormData(emptyForm(areaId)); setIsAddOpen(true) }}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]"
          >
            <i className="bx bx-plus translate-y-px text-[18px]" />
            <span>Add Node</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                <th className="w-10 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4] dark:text-[#3f6190]">#</th>
                {[
                  { label: 'Node',               align: 'left'   },
                  { label: 'Area',               align: 'left'   },
                  { label: 'Region',             align: 'center' },
                  { label: 'Province',           align: 'center' },
                  { label: 'City / Municipality',align: 'center' },
                  { label: 'Barangay',           align: 'center' },
                  { label: 'Status',             align: 'center' },
                  { label: 'Actions',            align: 'center' },
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
                  <td colSpan={9} className="py-20 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f2ff] dark:bg-[#162744]">
                      <i className="bx bx-loader-alt animate-spin text-2xl text-[#0072ff] dark:text-[#4ea9ff]" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-400 dark:text-zinc-500">Loading nodes…</p>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f5ff] dark:bg-[#162035]">
                      <i className="bx bx-git-commit text-2xl text-[#9bb8dc] dark:text-[#3a5a82]" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400 dark:text-zinc-500">No nodes found</p>
                    <p className="mt-1 text-xs text-slate-300 dark:text-zinc-600">Try adjusting your search or filter.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((n, idx) => (
                  <tr key={n.id}
                    onClick={() => {
                      if (!areaId) return
                      const site = siteSlug ?? String(areaId)
                      const node = `${slugify(n.full_label ?? n.name)}-${n.id}`
                      navigate(`/sites/${site}/nodes/${node}`)
                    }}
                    className={`group border-b border-[#f0f5ff] transition-colors last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60 ${areaId ? 'cursor-pointer' : ''}`}>
                    {/* Row number */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-[11px] font-bold tabular-nums text-[#b0c8e8] dark:text-[#2e4d6e]">
                        {(safePage - 1) * perPage + idx + 1}
                      </span>
                    </td>

                    {/* Node name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8f2ff] dark:bg-[#162744]">
                          <i className="bx bx-git-commit translate-y-px text-sm text-[#0072ff] dark:text-[#4ea9ff]" />
                        </div>
                        <span className="font-mono text-[13px] font-bold text-[#0b6cff] dark:text-[#4ea9ff]">
                          {n.full_label ?? n.name}
                        </span>
                      </div>
                    </td>

                    {/* Area */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                        <i className="bx bx-map-pin text-xs text-slate-400 dark:text-zinc-500" />
                        {n.area?.name ?? '—'}
                      </span>
                    </td>

                    {/* Region */}
                    <td className="px-4 py-3.5 text-center text-xs text-slate-500 dark:text-zinc-400">
                      {n.region ?? '—'}
                    </td>

                    {/* Province */}
                    <td className="px-4 py-3.5 text-center text-xs text-slate-500 dark:text-zinc-400">
                      {n.province ?? '—'}
                    </td>

                    {/* City */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                        {n.city ?? '—'}
                      </span>
                    </td>

                    {/* Barangay */}
                    <td className="px-4 py-3.5 text-center text-xs text-slate-500 dark:text-zinc-400">
                      {n.barangay_name ?? '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${statusConfig[n.status]?.badge ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusConfig[n.status]?.dot ?? 'bg-gray-400'}`} />
                        {statusConfig[n.status]?.label ?? n.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {canStatus && (
                          <button
                            onClick={() => { setSelected(n); setIsStatusOpen(true) }}
                            title="Change Status"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-400">
                            <i className="bx bx-transfer translate-y-px text-sm" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelected(n)
                            setFormData({
                              ...emptyForm(n.area_id),
                              name:         n.name,
                              status:       n.status,
                              barangay_code: n.barangay_code ?? '',
                              region:        n.region ?? '',
                              province:      n.province ?? '',
                              city:          n.city ?? '',
                              barangay_name: n.barangay_name ?? '',
                              _region:       n.region ?? '',
                              _province:     n.province ?? '',
                              _city:         n.city ?? '',
                              _barangay:     n.barangay_name ?? '',
                            })
                            setIsEditOpen(true)
                          }}
                          title="Edit"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#e8f2ff] hover:text-[#0072ff] dark:hover:bg-[#162744] dark:hover:text-[#4ea9ff]">
                          <i className="bx bx-edit translate-y-px text-sm" />
                        </button>
                        <button
                          onClick={() => { setSelected(n); setIsDelOpen(true) }}
                          title="Delete"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400">
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
                  className={`h-8 min-w-[32px] rounded-lg border text-xs font-semibold ${n === safePage ? 'border-[#0b6cff] bg-[#0b6cff] text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
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

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <Modal open={isAddOpen} title="Add New Node" subtitle="Fill in all required fields to register a new node." icon="bx bx-git-commit" onClose={close}>
        {renderNodeForm('add')}
      </Modal>

      <Modal open={isEditOpen} title="Edit Node" subtitle={`Editing: ${selected?.full_label ?? selected?.name ?? ''}`} icon="bx bx-edit" onClose={close}>
        {renderNodeForm('edit')}
      </Modal>

      <Modal open={isDelOpen} title="Delete Node?" subtitle="This action cannot be undone." icon="bx bx-trash" onClose={close} widthClass="max-w-md" danger>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/70">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([['Node', selected?.full_label ?? selected?.name], ['Area', selected?.area?.name], ['City', selected?.barangay?.city?.name], ['Barangay', selected?.barangay?.name]] as [string, string | undefined][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{k}</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-200">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-row justify-center gap-3">
            <button onClick={handleDelete} className={`${dangerBtnCls} flex-1`}>Yes, Delete</button>
            <button onClick={close} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          </div>
        </div>
      </Modal>

      {isStatusOpen && selected && (
        <StatusModal node={selected} onClose={close} onSave={handleStatusSave} />
      )}
    </>
  )
}
