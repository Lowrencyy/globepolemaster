import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { isAdmin } from '../../lib/auth'
import PsgcCascade from '../../components/PsgcCascade'

type PoleStatus = 'audited' | 'in_progress' | 'not_audited' | 'pending' | 'completed'

type Pole = {
  id: string
  tag: string
  owner: string
  region: string
  province: string
  city: string
  barangay: string
  lat: string
  lng: string
  status: PoleStatus
  remarks: string
}

const initialPoles: Pole[] = [
  { id: 'PL-8812', tag: 'TAG-0012', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Sta. Cruz',     lat: '14.5547', lng: '121.0244', status: 'audited',     remarks: '' },
  { id: 'PL-8801', tag: 'TAG-0009', owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Bangkal',       lat: '14.5510', lng: '121.0190', status: 'in_progress', remarks: 'Partial audit' },
  { id: 'PL-7703', tag: 'TAG-0033', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Palanan',       lat: '14.5488', lng: '121.0201', status: 'not_audited', remarks: '' },
  { id: 'PL-7654', tag: 'TAG-0041', owner: 'PLDT',     region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Pio del Pilar', lat: '14.5501', lng: '121.0155', status: 'audited',     remarks: '' },
  { id: 'PL-8790', tag: 'TAG-0055', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Comembo',       lat: '14.5533', lng: '121.0222', status: 'pending',     remarks: 'Scheduled next week' },
  { id: 'PL-7621', tag: 'TAG-0062', owner: 'Converge', region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Pembo',         lat: '14.5499', lng: '121.0265', status: 'not_audited', remarks: '' },
  { id: 'PL-6998', tag: 'TAG-0078', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Ususan',        lat: '14.5321', lng: '121.0521', status: 'audited',     remarks: '' },
  { id: 'PL-6540', tag: 'TAG-0091', owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Ibayo',         lat: '14.5299', lng: '121.0488', status: 'in_progress', remarks: '' },
  { id: 'PL-5802', tag: 'TAG-0104', owner: 'PLDT',     region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Central',       lat: '14.5277', lng: '121.0501', status: 'completed',   remarks: 'Fully cleared' },
  { id: 'PL-5210', tag: 'TAG-0118', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Pasig',  barangay: 'Ugong',         lat: '14.5701', lng: '121.0712', status: 'not_audited', remarks: '' },
  { id: 'PL-4988', tag: 'TAG-0125', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Pasig',  barangay: 'Kapasigan',     lat: '14.5688', lng: '121.0699', status: 'pending',     remarks: '' },
  { id: 'PL-4421', tag: 'TAG-0139', owner: 'Converge', region: 'NCR', province: 'Metro Manila', city: 'Pasig',  barangay: 'Pineda',        lat: '14.5643', lng: '121.0655', status: 'audited',     remarks: '' },
]

const statusConfig: Record<PoleStatus, { label: string; dot: string; badge: string }> = {
  audited:     { label: 'Audited',     dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/20' },
  in_progress: { label: 'In Progress', dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/20' },
  not_audited: { label: 'Not Audited', dot: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-zinc-600/50 dark:text-zinc-400 dark:ring-zinc-500/30' },
  pending:     { label: 'Pending',     dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20' },
  completed:   { label: 'Completed',   dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-blue-500/20' },
}

const ownerConfig: Record<string, { badge: string }> = {
  Meralco:  { badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20' },
  Globe:    { badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/20' },
  PLDT:     { badge: 'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-500/15 dark:text-green-400 dark:ring-green-500/20' },
  Converge: { badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/20' },
}

const statuses: Array<'all' | PoleStatus> = ['all', 'audited', 'in_progress', 'not_audited', 'pending', 'completed']

const statCards = [
  { label: 'Total Poles', key: 'total',       icon: 'bx bx-map-pin',       accent: 'from-[#0072ff] to-[#00a6ff]', ring: 'ring-sky-200 dark:ring-sky-500/20' },
  { label: 'Audited',     key: 'audited',     icon: 'bx bx-check-circle',  accent: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
  { label: 'Not Audited', key: 'not_audited', icon: 'bx bx-error-circle',  accent: 'from-gray-400 to-gray-500', ring: 'ring-gray-200 dark:ring-zinc-500/20' },
  { label: 'In Progress', key: 'in_progress', icon: 'bx bx-loader-circle', accent: 'from-indigo-500 to-violet-500', ring: 'ring-indigo-200 dark:ring-indigo-500/20' },
  { label: 'Pending',     key: 'pending',     icon: 'bx bx-time',          accent: 'from-amber-400 to-orange-500', ring: 'ring-amber-200 dark:ring-amber-500/20' },
  { label: 'Completed',   key: 'completed',   icon: 'bx bx-badge-check',   accent: 'from-blue-500 to-cyan-500', ring: 'ring-blue-200 dark:ring-blue-500/20' },
] as const

const iCls =
  'h-[42px] w-full rounded-2xl border border-[#d8e6f8] bg-[#f7fbff] px-3.5 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100 dark:focus:border-[#4ea9ff] dark:focus:bg-[#162744] dark:focus:ring-[#4ea9ff]/15'

const sCls = `${iCls} appearance-none pr-10 cursor-pointer`
const tCls = `${iCls} h-auto py-3`
const fiCls =
  'h-9 w-full rounded-full border border-[#d8e6f8] bg-white px-4 text-xs font-medium text-slate-600 shadow-[0_6px_18px_-14px_rgba(10,67,150,0.35)] outline-none transition hover:border-[#8fc5ff] focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#15233c]/80 dark:text-slate-200 dark:hover:border-[#3f7dd9] dark:focus:border-[#4ea9ff]'

const fsCls = `${fiCls} appearance-none pr-8 cursor-pointer`
const lCls =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'

const primaryBtnCls =
  'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]'

const secondaryBtnCls =
  'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'

const dangerBtnCls =
  'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_28px_-16px_rgba(220,38,38,0.55)] transition hover:bg-red-700 active:scale-[0.99]'

const emptyPole = (): Pole => ({
  id: '',
  tag: '',
  owner: '',
  region: '',
  province: '',
  city: '',
  barangay: '',
  lat: '',
  lng: '',
  status: '' as PoleStatus,
  remarks: '',
})

function Chevron() {
  return (
    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400 dark:text-slate-400" />
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-2 flex items-center gap-3 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">{label}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-[#cfe2ff] via-[#e8f2ff] to-transparent dark:from-[#244a78] dark:via-[#1e3552] dark:to-transparent" />
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  icon,
  children,
  onClose,
  widthClass = 'max-w-2xl',
  danger = false,
}: {
  open: boolean
  title: string
  subtitle?: string
  icon?: string
  children: ReactNode
  onClose: () => void
  widthClass?: string
  danger?: boolean
}) {
  if (!open) return null

  if (danger) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[5px]" onClick={onClose} />
        <div className={`relative w-full ${widthClass} overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)] dark:border-zinc-700 dark:bg-zinc-900`}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-50 to-transparent dark:from-white/[0.03]" />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <i className="bx bx-x text-[22px]" />
          </button>

          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/70 dark:bg-red-500/10 dark:ring-red-500/10">
              <i className={`${icon ?? 'bx bx-trash'} translate-y-[1px] text-[26px] text-red-500 dark:text-red-400`} />
            </div>
          </div>

          <div className="text-center">
            <h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h5>
            {subtitle && (
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-zinc-400">{subtitle}</p>
            )}
          </div>

          <div className="mt-6">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={onClose} />

      <div
        className={`relative w-full ${widthClass} overflow-hidden rounded-[30px] border border-[#dbe8ff] bg-white shadow-[0_36px_100px_-34px_rgba(6,36,90,0.5)] dark:border-[#27436a] dark:bg-[#0f1728]`}
      >
        <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-[#0072ff]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 -top-10 h-44 w-44 rounded-full bg-[#5fd0ff]/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#d9ebff]/65 via-white/25 to-transparent dark:from-white/[0.06] dark:via-transparent dark:to-transparent" />

        <div className="relative overflow-hidden border-b border-white/20 bg-gradient-to-r from-[#0057d9] via-[#0072ff] to-[#00a6ff] px-6 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/30 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-white/10 to-transparent" />

          <div className="relative flex items-center gap-3.5">
            {icon && (
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/30 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_30px_-20px_rgba(0,39,127,0.85)] backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
                <i className={`${icon} relative translate-y-[1.5px] text-[19px]`} />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h5 className="text-sm font-bold tracking-[0.01em] text-white">{title}</h5>
              {subtitle && <p className="mt-0.5 text-xs text-white/80">{subtitle}</p>}
            </div>

            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            >
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

export default function AllPoles() {
  const admin = isAdmin()

  const [poles, setPoles] = useState<Pole[]>(initialPoles)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatus] = useState<'all' | PoleStatus>('all')
  const [ownerFilter, setOwner] = useState('all')
  const [page, setPage] = useState(1)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDelOpen, setIsDelOpen] = useState(false)
  const [formData, setFormData] = useState<Pole>(emptyPole())
  const [selected, setSelected] = useState<Pole | null>(null)

  const perPage = 8

  const stats = useMemo(() => ({
    total: poles.length,
    audited: poles.filter(p => p.status === 'audited').length,
    not_audited: poles.filter(p => p.status === 'not_audited').length,
    in_progress: poles.filter(p => p.status === 'in_progress').length,
    pending: poles.filter(p => p.status === 'pending').length,
    completed: poles.filter(p => p.status === 'completed').length,
  }), [poles])

  const filtered = poles.filter(p => {
    const q = search.toLowerCase()
    return (!q || [p.id, p.tag, p.city, p.barangay].some(v => v.toLowerCase().includes(q)))
      && (statusFilter === 'all' || p.status === statusFilter)
      && (ownerFilter === 'all' || p.owner === ownerFilter)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage)
  const owners = ['all', ...Array.from(new Set(poles.map(p => p.owner)))]

  const upd = (f: keyof Pole, v: string) => setFormData(prev => ({ ...prev, [f]: v }))

  const nextId = () => `PL-${String(poles.reduce((m, p) => Math.max(m, +(p.id.match(/\d+/)?.[0] ?? 0)), 0) + 1).padStart(4, '0')}`
  const nextTag = () => `TAG-${String(poles.reduce((m, p) => Math.max(m, +(p.tag.match(/\d+/)?.[0] ?? 0)), 0) + 1).padStart(4, '0')}`

  const close = () => {
    setIsAddOpen(false)
    setIsEditOpen(false)
    setIsDelOpen(false)
    setSelected(null)
    setFormData(emptyPole())
  }

  const handleAdd = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPoles(prev => [formData, ...prev])
    setPage(1)
    close()
  }

  const handleEdit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected) return
    setPoles(prev => prev.map(p => p.id === selected.id ? formData : p))
    close()
  }

  const handleDel = () => {
    if (!selected) return
    setPoles(prev => prev.filter(p => p.id !== selected.id))
    close()
  }

  const PoleForm = ({ mode }: { mode: 'add' | 'edit' }) => (
    <form onSubmit={mode === 'add' ? handleAdd : handleEdit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Basic Info" />

        <div>
          <label className={lCls}>Pole ID</label>
          <input value={formData.id} onChange={e => upd('id', e.target.value)} className={iCls} required />
        </div>

        <div>
          <label className={lCls}>Pole Tag</label>
          <input value={formData.tag} onChange={e => upd('tag', e.target.value)} className={iCls} required />
        </div>

        <div>
          <label className={lCls}>Owner</label>
          <div className="relative">
            <select value={formData.owner} onChange={e => upd('owner', e.target.value)} className={sCls} required>
              <option value="">Select Owner</option>
              {['Meralco', 'Globe', 'PLDT', 'Converge'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>

        <div>
          <label className={lCls}>Status</label>
          <div className="relative">
            <select value={formData.status} onChange={e => upd('status', e.target.value as PoleStatus)} className={sCls} required>
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
        <SectionDivider label="Location" />
        <PsgcCascade
          region={formData.region}
          province={formData.province}
          city={formData.city}
          barangay={formData.barangay}
          onChange={u => setFormData(prev => ({ ...prev, ...u }))}
          inputClass={sCls}
          labelClass={lCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionDivider label="Coordinates" />

        <div>
          <label className={lCls}>Latitude</label>
          <input value={formData.lat} onChange={e => upd('lat', e.target.value)} className={iCls} placeholder="14.5547" required />
        </div>

        <div>
          <label className={lCls}>Longitude</label>
          <input value={formData.lng} onChange={e => upd('lng', e.target.value)} className={iCls} placeholder="121.0244" required />
        </div>
      </div>

      <div>
        <label className={lCls}>Remarks</label>
        <textarea value={formData.remarks} onChange={e => upd('remarks', e.target.value)} rows={2} className={tCls} placeholder="Optional notes…" />
      </div>

      <div className="flex justify-end gap-2 border-t border-[#e4eefb] pt-4 dark:border-[#263d5f]">
        <button type="button" onClick={close} className={secondaryBtnCls}>
          Cancel
        </button>
        <button type="submit" className={primaryBtnCls}>
          {mode === 'add' ? 'Save Pole' : 'Update Pole'}
        </button>
      </div>
    </form>
  )

  return (
    <>
      <div className="mb-5 flex items-start justify-between px-0.5">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">All Poles</h4>
          <p className="mt-0.5 text-sm text-gray-400 dark:text-zinc-500">Pole Master View · Globe Telco 1</p>
        </div>

        <nav>
          <ol className="flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
            <li><a href="/dashboard" className="hover:text-[#0b6cff]">Dashboard</a></li>
            <li>/</li>
            <li className="text-gray-600 dark:text-zinc-300">All Poles</li>
          </ol>
        </nav>
      </div>

      <div className="mb-6 grid grid-cols-6 gap-5">
        {statCards.map(c => {
          const val = c.key === 'total' ? stats.total : stats[c.key as Exclude<keyof typeof stats, 'total'>]

          return (
            <div key={c.label} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
              <div className={`h-1 w-full bg-gradient-to-r ${c.accent}`} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{c.label}</p>
                    <p className="mt-2 text-[28px] font-extrabold leading-none text-gray-800 dark:text-gray-100">{val}</p>
                  </div>

                  <div className={`relative mt-3 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${c.accent} shadow-lg`}>
                    <div className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
                    <i className={`${c.icon} translate-y-[3px] text-[21px] text-white`} />
                  </div>
                </div>
              </div>
              <div className={`pointer-events-none absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-gradient-to-br ${c.accent} opacity-[0.06]`} />
            </div>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-zinc-700">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search ID, tag, area…"
              className={`${fiCls} pl-9`}
            />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => {
                setStatus(e.target.value as 'all' | PoleStatus)
                setPage(1)
              }}
              className={fsCls}
              style={{ minWidth: 150 }}
            >
              {statuses.map(s => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Statuses' : statusConfig[s].label}
                </option>
              ))}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
          </div>

          <div className="relative">
            <select
              value={ownerFilter}
              onChange={e => {
                setOwner(e.target.value)
                setPage(1)
              }}
              className={fsCls}
              style={{ minWidth: 140 }}
            >
              {owners.map(o => (
                <option key={o} value={o}>
                  {o === 'all' ? 'All Owners' : o}
                </option>
              ))}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
          </div>

          <span className="ml-auto text-xs font-medium text-gray-400 dark:text-zinc-500">
            {filtered.length} {filtered.length === 1 ? 'pole' : 'poles'}
          </span>

          <button
            onClick={() => {
              setFormData({ ...emptyPole(), id: nextId(), tag: nextTag() })
              setIsAddOpen(true)
            }}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]"
          >
            <i className="bx bx-plus translate-y-[1px] text-[18px]" />
            <span>Add Pole</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-zinc-700/40">
                {['Pole ID', 'Tag', 'Owner', 'Region', 'City', 'Barangay', 'Coordinates', 'Status', 'Remarks', 'Action'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50 dark:divide-zinc-700/50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-700">
                      <i className="bx bx-map-pin translate-y-[1px] text-2xl text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-400 dark:text-zinc-500">No poles found</p>
                  </td>
                </tr>
              ) : paginated.map(p => (
                <tr key={p.id} className="group transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-500/5">
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-xs font-semibold text-[#0b6cff] dark:text-sky-400">{p.id}</span>
                  </td>

                  <td className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-zinc-400">{p.tag}</td>

                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${(ownerConfig[p.owner] ?? ownerConfig.Meralco).badge}`}>
                      {p.owner}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-zinc-400">{p.region}</td>
                  <td className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-zinc-300">{p.city}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-zinc-400">{p.barangay}</td>

                  <td className="whitespace-nowrap px-4 py-3 text-center font-mono text-[11px] text-gray-400 dark:text-zinc-500">
                    {p.lat}, {p.lng}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusConfig[p.status]?.badge ?? ''}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusConfig[p.status]?.dot}`} />
                      {statusConfig[p.status]?.label ?? p.status}
                    </span>
                  </td>

                  <td className="max-w-[130px] truncate px-4 py-3 text-center text-xs text-gray-400 dark:text-zinc-500">
                    {p.remarks || '—'}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setSelected(p)
                          setFormData({ ...p })
                          setIsEditOpen(true)
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                        title="Edit"
                      >
                        <i className="bx bx-edit translate-y-[1px] text-sm" />
                      </button>

                      {admin && (
                        <button
                          onClick={() => {
                            setSelected(p)
                            setIsDelOpen(true)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          title="Delete"
                        >
                          <i className="bx bx-trash translate-y-[1px] text-sm" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-zinc-700">
            <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">
              Page {safePage} of {totalPages} · {filtered.length} total
            </span>

            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                ‹ Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 min-w-[32px] rounded-lg border text-xs font-semibold ${
                    n === safePage
                      ? 'border-[#0b6cff] bg-[#0b6cff] text-white'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700'
                  }`}
                >
                  {n}
                </button>
              ))}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={isAddOpen}
        title="Add New Pole"
        subtitle="Fill in all required fields to register a new pole."
        icon="bx bx-map-pin"
        onClose={close}
      >
        <PoleForm mode="add" />
      </Modal>

      <Modal
        open={isEditOpen}
        title="Edit Pole"
        subtitle={`Editing ${selected?.id ?? ''}`}
        icon="bx bx-edit"
        onClose={close}
      >
        <PoleForm mode="edit" />
      </Modal>

      <Modal
        open={isDelOpen}
        title="Delete Pole?"
        subtitle="This action cannot be undone. Please review the selected record before removing it permanently."
        icon="bx bx-trash"
        onClose={close}
        widthClass="max-w-md"
        danger
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/70">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Pole ID', selected?.id],
                ['Tag', selected?.tag],
                ['Owner', selected?.owner],
                ['Location', `${selected?.city ?? ''}, ${selected?.barangay ?? ''}`],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{k}</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-200">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-row gap-3 justify-center">
           
            <button onClick={handleDel} className={`${dangerBtnCls} flex-1`}>
              Yes, Delete
            </button>
             <button onClick={close} className={`${secondaryBtnCls} flex-1`}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}