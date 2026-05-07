import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAdmin, canManageStatus, getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { slugify } from '../../lib/utils'
import PsgcCascade from '../../components/PsgcCascade'

type NodeStatus = 'pending' | 'in_progress' | 'completed'

type Area = {
  id: number
  name: string
  nodes_count?: number
}

type ReportType = 'full_report' | 'pole_report'

type Subcontractor = {
  id: number
  name: string
  company: string
  status: string
}

type Team = {
  id: number
  name: string
  subcontractor_id: number | null
  status: string
}

type Node = {
  id: number
  name: string
  label?: string
  full_label?: string
  area_id: number
  site_id?: number | null
  barangay_code?: string
  status: NodeStatus
  report_type?: ReportType | null
  area?: Area
  region?: string
  province?: string
  city?: string
  barangay_name?: string
  subcontractor_id?: number | null
  team_id?: number | null
  subcontractor?: Subcontractor | null
  team?: Team | null
}

type FormState = {
  name: string
  area_id: number | ''
  barangay_code: string
  region: string
  province: string
  city: string
  barangay_name: string
  _region: string
  _province: string
  _city: string
  _barangay: string
  status: NodeStatus | ''
  report_type: ReportType | ''
  subcontractor_id: number | ''
  team_id: number | ''
}

const reportTypeConfig: Record<ReportType, { label: string; badge: string }> = {
  full_report: {
    label: 'Full Report',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
  },
  pole_report: {
    label: 'Pole Report',
    badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20',
  },
}

const statusConfig: Record<NodeStatus, { label: string; dotColor: string; badge: string; activeBg: string }> = {
  pending: {
    label: 'Pending',
    dotColor: '#f59e0b',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20',
    activeBg: '#f59e0b',
  },
  in_progress: {
    label: 'Ongoing',
    dotColor: '#4f46e5',
    badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20',
    activeBg: '#4f46e5',
  },
  completed: {
    label: 'Completed',
    dotColor: '#10b981',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
    activeBg: '#10b981',
  },
}

const statCards = [
  { label: 'Total Nodes', key: 'total',      icon: 'bx bx-network-chart', accent: 'from-sky-500 to-blue-500',     ring: 'ring-sky-200 dark:ring-sky-500/20' },
  { label: 'Pending',     key: 'pending',    icon: 'bx bx-time-five',     accent: 'from-amber-400 to-orange-500', ring: 'ring-amber-200 dark:ring-amber-500/20' },
  { label: 'Ongoing',     key: 'in_progress',icon: 'bx bx-loader-circle', accent: 'from-violet-500 to-purple-500',ring: 'ring-violet-200 dark:ring-violet-500/20' },
  { label: 'Completed',   key: 'completed',  icon: 'bx bx-check-circle',  accent: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
] as const

const statuses: NodeStatus[] = ['pending', 'in_progress', 'completed']

const iCls =
  'h-[42px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-700/60 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:bg-zinc-700 dark:focus:ring-violet-500/10'
const sCls = `${iCls} appearance-none pr-10 cursor-pointer`
const lCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'

// Keep old aliases for backward compat in renderNodeForm
const inputCls = iCls
const selectCls = sCls
const labelCls = lCls

const primaryBtnCls =
  'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60'

const secondaryBtnCls =
  'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'

const dangerBtnCls =
  'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-700 active:scale-[0.99]'

const fiCls =
  'h-9 w-full rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-slate-200 dark:hover:border-zinc-500 dark:focus:border-violet-500'
const fsCls = `${fiCls} appearance-none pr-8 cursor-pointer`

const emptyForm = (areaId: number | '' = ''): FormState => ({
  name: '',
  area_id: areaId,
  barangay_code: '',
  region: '',
  province: '',
  city: '',
  barangay_name: '',
  _region: '',
  _province: '',
  _city: '',
  _barangay: '',
  status: '',
  report_type: '',
  subcontractor_id: '',
  team_id: '',
})

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function Chevron() {
  return <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <div className="h-px flex-1 bg-slate-100 dark:bg-zinc-700" />
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  widthClass = 'max-w-2xl',
  danger = false,
}: {
  open: boolean
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  widthClass?: string
  danger?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widthClass} max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-zinc-900`}>
        <div className={`rounded-t-3xl px-6 py-5 ${danger ? 'bg-gradient-to-r from-red-600 to-rose-600' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="mt-0.5 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white">
              <i className="bx bx-x text-xl leading-none" />
            </button>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function StatusModal({
  node,
  onClose,
  onSave,
}: {
  node: Node
  onClose: () => void
  onSave: (s: NodeStatus) => void
}) {
  const [selected, setSelected] = useState<NodeStatus>(node.status)

  return (
    <Modal open title="Update Node Status" subtitle={node.full_label ?? node.name} onClose={onClose} widthClass="max-w-sm">
      <div className="flex flex-col gap-2.5">
        {statuses.map(s => {
          const active = selected === s
          const cfg = statusConfig[s]
          return (
            <button
              key={s}
              onClick={() => setSelected(s)}
              style={active ? { borderColor: cfg.activeBg, background: `${cfg.activeBg}14` } : undefined}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                active
                  ? 'text-slate-900 dark:text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cfg.dotColor }} />
              <span>{cfg.label}</span>
              {active && <span className="ml-auto text-xs font-black" style={{ color: cfg.activeBg }}>Selected</span>}
            </button>
          )
        })}
        <div className="mt-2 flex gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <button onClick={onClose} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          <button onClick={() => onSave(selected)} className={`${primaryBtnCls} flex-1`}>Save Status</button>
        </div>
      </div>
    </Modal>
  )
}

export default function AllPoles({
  areaId,
  siteId,
  siteSlug,
}: {
  areaId?: number
  siteId?: number
  siteSlug?: string
} = {}) {
  const admin = isAdmin()
  const canStatus = canManageStatus()
  const navigate = useNavigate()

  const [nodes, setNodes] = useState<Node[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [formTeams, setFormTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<NodeStatus | ''>('')
  const [page, setPage] = useState(1)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDelOpen, setIsDelOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)

  const [formData, setFormData] = useState<FormState>(emptyForm(areaId))
  const [selected, setSelected] = useState<Node | null>(null)

  const perPage = 50
  const nodesCacheKey = `nodelist_nodes_${areaId ?? 'all'}_${siteId ?? 'all'}`

  useEffect(() => {
    const hit = cacheGet<Area[]>('nodelist_areas')
    if (hit) setAreas(hit)

    fetch(`${SKYCABLE_API}/areas`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAreas(data)
          cacheSet('nodelist_areas', data)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/admin/subcontractors?per_page=200`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: Subcontractor[] = Array.isArray(data) ? data : (data?.data ?? [])
        setSubcontractors(list.filter(s => s.status === 'active'))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!formData.subcontractor_id) {
      setFormTeams([])
      return
    }
    fetch(`${API_BASE}/api/v1/admin/teams?subcontractor_id=${formData.subcontractor_id}&per_page=200`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: Team[] = Array.isArray(data) ? data : (data?.data ?? [])
        setFormTeams(list.filter(t => t.status === 'active'))
      })
      .catch(() => {})
  }, [formData.subcontractor_id])

  useEffect(() => {
    const hit = cacheGet<Node[]>(nodesCacheKey)
    if (hit) {
      setNodes(hit)
      setLoading(false)
    }

    const p = new URLSearchParams()
    if (areaId) p.set('area_id', String(areaId))
    if (siteId) p.set('site_id', String(siteId))
    const params = p.toString() ? `?${p}` : ''

    fetch(`${SKYCABLE_API}/nodes${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data ?? [])
        setNodes(list)
        cacheSet(nodesCacheKey, list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [areaId, siteId, nodesCacheKey])

  const stats = useMemo(
    () => ({
      total: nodes.length,
      pending: nodes.filter(n => n.status === 'pending').length,
      in_progress: nodes.filter(n => n.status === 'in_progress').length,
      completed: nodes.filter(n => n.status === 'completed').length,
    }),
    [nodes]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return nodes.filter(n => {
      const label = (n.full_label ?? n.name ?? '').toLowerCase()
      const area = (n.area?.name ?? '').toLowerCase()
      const region = (n.region ?? '').toLowerCase()
      const province = (n.province ?? '').toLowerCase()
      const city = (n.city ?? '').toLowerCase()
      const barangay = (n.barangay_name ?? '').toLowerCase()
      const subcon = (n.subcontractor?.name ?? '').toLowerCase()

      const matchesSearch =
        !q ||
        label.includes(q) ||
        area.includes(q) ||
        region.includes(q) ||
        province.includes(q) ||
        city.includes(q) ||
        barangay.includes(q) ||
        subcon.includes(q)

      const matchesStatus = !statusFilter || n.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [nodes, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  const close = () => {
    setIsAddOpen(false)
    setIsEditOpen(false)
    setIsDelOpen(false)
    setIsStatusOpen(false)
    setSelected(null)
    setFormData(emptyForm(areaId))
    setAddError(null)
    setFormTeams([])
  }

  const handleAdd = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)

    try {
      const payload = {
        name: formData.name,
        area_id: formData.area_id,
        site_id: siteId ?? null,
        barangay_code: formData.barangay_code || null,
        status: formData.status || 'pending',
        report_type: formData.report_type || null,
        region: formData.region || null,
        province: formData.province || null,
        city: formData.city || null,
        barangay_name: formData.barangay_name || null,
        subcontractor_id: formData.subcontractor_id || null,
        team_id: formData.team_id || null,
      }

      const res = await fetch(`${SKYCABLE_API}/nodes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        const errMsg =
          (data.message as string | undefined) ??
          (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ??
          'Failed to add node'
        throw new Error(errMsg)
      }

      const newNode: Node = data.data ?? data

      setNodes(prev => {
        const next = [newNode, ...prev]
        cacheSet(nodesCacheKey, next)
        return next
      })

      setPage(1)
      close()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAddLoading(false)
    }
  }

  const handleEdit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected) return
    setAddLoading(true)
    setAddError(null)

    try {
      const payload = {
        name: formData.name,
        area_id: formData.area_id || undefined,
        site_id: selected.site_id ?? siteId ?? null,
        barangay_code: formData.barangay_code || null,
        status: formData.status || undefined,
        report_type: formData.report_type || null,
        region: formData.region || null,
        province: formData.province || null,
        city: formData.city || null,
        barangay_name: formData.barangay_name || null,
        subcontractor_id: formData.subcontractor_id || null,
        team_id: formData.team_id || null,
      }

      const res = await fetch(`${SKYCABLE_API}/nodes/${selected.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to update node')

      const updatedNode: Node = data.data ?? data

      setNodes(prev => {
        const next = prev.map(n => (n.id === selected.id ? { ...n, ...updatedNode } : n))
        cacheSet(nodesCacheKey, next)
        return next
      })

      close()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = () => {
    if (!selected) return
    setNodes(prev => {
      const next = prev.filter(n => n.id !== selected.id)
      cacheSet(nodesCacheKey, next)
      return next
    })
    close()
  }

  const handleStatusSave = (status: NodeStatus) => {
    if (!selected) return
    setNodes(prev => {
      const next = prev.map(n => (n.id === selected.id ? { ...n, status } : n))
      cacheSet(nodesCacheKey, next)
      return next
    })
    close()
  }

  const renderNodeForm = (mode: 'add' | 'edit') => (
    <form onSubmit={mode === 'add' ? handleAdd : handleEdit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Basic Info" />

        <div className="col-span-2">
          <label className={labelCls}>Node Name</label>
          <input
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            className={inputCls}
            placeholder="e.g. Makati Central Node"
            required
          />
        </div>

        <div>
          <label className={labelCls}>Area</label>
          <div className="relative">
            <select
              value={formData.area_id}
              onChange={e => setFormData(p => ({ ...p, area_id: Number(e.target.value) || '' }))}
              className={selectCls}
              required
              disabled={!!areaId}
            >
              <option value="">Select Area</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <div className="relative">
            <select
              value={formData.status}
              onChange={e => setFormData(p => ({ ...p, status: e.target.value as NodeStatus }))}
              className={selectCls}
            >
              <option value="">Select Status</option>
              {statuses.map(s => (
                <option key={s} value={s}>{statusConfig[s].label}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>

        <div>
          <label className={labelCls}>Report Type</label>
          <div className="relative">
            <select
              value={formData.report_type}
              onChange={e => setFormData(p => ({ ...p, report_type: e.target.value as ReportType | '' }))}
              className={selectCls}
            >
              <option value="">Select Report Type</option>
              <option value="full_report">Full Report</option>
              <option value="pole_report">Pole Report</option>
            </select>
            <Chevron />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Assignment" />

        <div>
          <label className={labelCls}>Subcontractor</label>
          <div className="relative">
            <select
              value={formData.subcontractor_id}
              onChange={e => setFormData(p => ({ ...p, subcontractor_id: e.target.value ? Number(e.target.value) : '', team_id: '' }))}
              className={selectCls}
            >
              <option value="">— No Subcontractor —</option>
              {subcontractors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>

        <div>
          <label className={labelCls}>Team</label>
          <div className="relative">
            <select
              value={formData.team_id}
              onChange={e => setFormData(p => ({ ...p, team_id: e.target.value ? Number(e.target.value) : '' }))}
              className={selectCls}
              disabled={!formData.subcontractor_id}
            >
              <option value="">— No Team —</option>
              {formTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <Chevron />
          </div>
          {formData.subcontractor_id && formTeams.length === 0 && (
            <p className="mt-1.5 text-[11px] text-slate-400">No active teams for this subcontractor.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Location" />

        <PsgcCascade
          region={formData._region}
          province={formData._province}
          city={formData._city}
          barangay={formData._barangay}
          onChange={u => setFormData(p => ({
            ...p,
            _region: u.region ?? p._region,
            _province: u.province ?? p._province,
            _city: u.city ?? p._city,
            _barangay: u.barangay ?? p._barangay,
            barangay_code: u.barangay_code ?? p.barangay_code,
            region: u.region ?? p.region,
            province: u.province ?? p.province,
            city: u.city ?? p.city,
            barangay_name: u.barangay ?? p.barangay_name,
          }))}
          inputClass={selectCls}
          labelClass={labelCls}
          required={mode === 'add'}
        />
      </div>

      {addError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {addError}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
        <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
        <button type="submit" disabled={addLoading} className={primaryBtnCls}>
          {addLoading ? 'Saving…' : mode === 'add' ? 'Save Node' : 'Update Node'}
        </button>
      </div>
    </form>
  )

  return (
    <>
      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map(c => {
          const val = stats[c.key as keyof typeof stats]
          return (
            <div key={c.key} className={`relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ${c.ring} flex flex-col justify-between p-4 min-h-[96px]`}>
              <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${c.accent}`} />
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-tight">{c.label}</p>
                <i className={`${c.icon} text-xl text-slate-300 dark:text-zinc-600 shrink-0`} />
              </div>
              <p className="text-[28px] font-bold leading-none text-slate-800 dark:text-zinc-100">{val}</p>
            </div>
          )
        })}
      </div>

      {/* Table Card */}
      <div className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-700">
          <div>
            <h4 className="text-base font-semibold text-slate-800 dark:text-zinc-100">Node Registry</h4>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">Manage all registered network nodes</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search node, area, subcontractor…"
                className={`${fiCls} pl-8 w-56`}
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value as NodeStatus | ''); setPage(1) }}
                className={`${fsCls} w-40`}
              >
                <option value="">All Statuses</option>
                {statuses.map(s => (
                  <option key={s} value={s}>{statusConfig[s].label}</option>
                ))}
              </select>
              <Chevron />
            </div>

            <span className="text-xs font-medium text-slate-400 dark:text-zinc-500">
              {filtered.length} {filtered.length === 1 ? 'node' : 'nodes'}
            </span>

            {admin && (
              <button
                onClick={() => { setFormData(emptyForm(areaId)); setIsAddOpen(true) }}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]"
              >
                <i className="bx bx-plus text-[18px]" />
                <span>Add Node</span>
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-zinc-700/40">
                {['Node', 'Area', 'Region', 'Province', 'City / Municipality', 'Barangay', 'Status', 'Rpt Type', 'Actions'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-700/50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-zinc-500">
                    <i className="bx bx-loader-circle bx-spin text-3xl block mb-2" />
                    Loading nodes…
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-zinc-500">
                    <i className="bx bx-network-chart text-3xl block mb-2" />
                    No nodes found
                  </td>
                </tr>
              ) : (
                paginated.map(n => {
                  const cfg = statusConfig[n.status] ?? statusConfig.pending
                  return (
                    <tr
                      key={n.id}
                      onClick={() => {
                        if (!areaId) return
                        const site = siteSlug ?? String(areaId)
                        const node = `${slugify(n.full_label ?? n.name)}-${n.id}`
                        navigate(`/${site}/${node}/poles`)
                      }}
                      className={`transition-colors hover:bg-slate-50/60 dark:hover:bg-zinc-700/30 ${areaId ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-[13px] font-semibold text-violet-600 dark:text-violet-400">
                          {n.full_label ?? n.name}
                        </p>
                        {n.subcontractor && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
                              {n.subcontractor.name}
                            </span>
                            {n.team && (
                              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-600 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20">
                                {n.team.name}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {n.area?.name ?? '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-zinc-400">{n.region ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-zinc-400">{n.province ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-slate-700 dark:text-zinc-300">{n.city ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-zinc-400">{n.barangay_name ?? '—'}</td>

                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dotColor }} />
                          {cfg.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        {n.report_type ? (
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${reportTypeConfig[n.report_type].badge}`}>
                            {reportTypeConfig[n.report_type].label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-zinc-600">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {canStatus && (
                            <button
                              onClick={() => { setSelected(n); setIsStatusOpen(true) }}
                              title="Status"
                              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-400"
                            >
                              <i className="bx bx-radio-circle-marked text-base" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelected(n)
                              setFormData({
                                ...emptyForm(n.area_id),
                                name: n.name,
                                status: n.status,
                                report_type: n.report_type ?? '',
                                barangay_code: n.barangay_code ?? '',
                                region: n.region ?? '',
                                province: n.province ?? '',
                                city: n.city ?? '',
                                barangay_name: n.barangay_name ?? '',
                                _region: n.region ?? '',
                                _province: n.province ?? '',
                                _city: n.city ?? '',
                                _barangay: n.barangay_name ?? '',
                                subcontractor_id: n.subcontractor_id ?? '',
                                team_id: n.team_id ?? '',
                              })
                              setIsEditOpen(true)
                            }}
                            title="Edit"
                            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-400"
                          >
                            <i className="bx bx-edit text-base" />
                          </button>
                          {admin && (
                            <button
                              onClick={() => { setSelected(n); setIsDelOpen(true) }}
                              title="Delete"
                              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            >
                              <i className="bx bx-trash text-base" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-zinc-700">
          <span className="text-xs text-slate-400 dark:text-zinc-500">
            Page {safePage} of {totalPages} · {filtered.length} nodes
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-7 w-7 rounded-lg text-xs font-medium transition ${
                    n === safePage ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-700'
                  }`}
                >{n}</button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >›</button>
            </div>
          )}
        </div>
      </div>

      <Modal open={isAddOpen} title="Add New Node" subtitle="Fill in all required fields to register a new node." onClose={close}>
        {renderNodeForm('add')}
      </Modal>

      <Modal open={isEditOpen} title="Edit Node" subtitle={`Editing: ${selected?.full_label ?? selected?.name ?? ''}`} onClose={close}>
        {renderNodeForm('edit')}
      </Modal>

      <Modal open={isDelOpen} title="Delete Node?" subtitle="This action cannot be undone." onClose={close} widthClass="max-w-md" danger>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([
                ['Node', selected?.full_label ?? selected?.name],
                ['Area', selected?.area?.name],
                ['City', selected?.city],
                ['Barangay', selected?.barangay_name],
              ] as [string, string | undefined][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{k}</dt>
                  <dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex gap-3">
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
