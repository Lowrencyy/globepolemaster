import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAdmin } from '../../lib/auth'
import PsgcCascade from '../../components/PsgcCascade'

type NapStatus = 'active' | 'inactive' | 'damaged' | 'for_replacement'
type NapType   = '8-port' | '16-port' | '24-port'

type NapBox = {
  id: string
  tag: string
  pole_id: string
  type: NapType
  total_slots: number
  used_slots: number
  owner: string
  region: string
  province: string
  city: string
  barangay: string
  lat: string
  lng: string
  status: NapStatus
  remarks: string
}

const initialBoxes: NapBox[] = [
  { id: 'NAP-0001', tag: 'NTAG-001', pole_id: 'PL-8812', type: '16-port', total_slots: 16, used_slots: 12, owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Sta. Cruz',     lat: '14.5547', lng: '121.0244', status: 'active',          remarks: '' },
  { id: 'NAP-0002', tag: 'NTAG-002', pole_id: 'PL-8801', type: '8-port',  total_slots: 8,  used_slots: 5,  owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Bangkal',       lat: '14.5510', lng: '121.0190', status: 'active',          remarks: '' },
  { id: 'NAP-0003', tag: 'NTAG-003', pole_id: 'PL-7703', type: '24-port', total_slots: 24, used_slots: 24, owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Palanan',       lat: '14.5488', lng: '121.0201', status: 'active',          remarks: 'Full capacity' },
  { id: 'NAP-0004', tag: 'NTAG-004', pole_id: 'PL-7654', type: '16-port', total_slots: 16, used_slots: 0,  owner: 'PLDT',     region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Pio del Pilar', lat: '14.5501', lng: '121.0155', status: 'inactive',        remarks: 'Not yet activated' },
  { id: 'NAP-0005', tag: 'NTAG-005', pole_id: 'PL-8790', type: '8-port',  total_slots: 8,  used_slots: 3,  owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Comembo',       lat: '14.5533', lng: '121.0222', status: 'damaged',         remarks: 'Cover broken' },
  { id: 'NAP-0006', tag: 'NTAG-006', pole_id: 'PL-7621', type: '16-port', total_slots: 16, used_slots: 9,  owner: 'Converge', region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Pembo',         lat: '14.5499', lng: '121.0265', status: 'active',          remarks: '' },
  { id: 'NAP-0007', tag: 'NTAG-007', pole_id: 'PL-6998', type: '24-port', total_slots: 24, used_slots: 18, owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Ususan',        lat: '14.5321', lng: '121.0521', status: 'active',          remarks: '' },
  { id: 'NAP-0008', tag: 'NTAG-008', pole_id: 'PL-6540', type: '8-port',  total_slots: 8,  used_slots: 8,  owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Ibayo',         lat: '14.5299', lng: '121.0488', status: 'for_replacement', remarks: 'Scheduled for swap' },
  { id: 'NAP-0009', tag: 'NTAG-009', pole_id: 'PL-5802', type: '16-port', total_slots: 16, used_slots: 11, owner: 'PLDT',     region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Central',       lat: '14.5277', lng: '121.0501', status: 'active',          remarks: '' },
  { id: 'NAP-0010', tag: 'NTAG-010', pole_id: 'PL-5210', type: '24-port', total_slots: 24, used_slots: 7,  owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Pasig',  barangay: 'Ugong',         lat: '14.5701', lng: '121.0712', status: 'active',          remarks: '' },
]

const statusConfig: Record<NapStatus, { label: string; dot: string; badge: string }> = {
  active:          { label: 'Active',          dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/20' },
  inactive:        { label: 'Inactive',        dot: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-zinc-600/50 dark:text-zinc-400 dark:ring-zinc-500/30' },
  damaged:         { label: 'Damaged',         dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-400 dark:ring-red-500/20' },
  for_replacement: { label: 'For Replacement', dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20' },
}

const ownerConfig: Record<string, { badge: string }> = {
  Meralco:  { badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20' },
  Globe:    { badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/20' },
  PLDT:     { badge: 'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-500/15 dark:text-green-400 dark:ring-green-500/20' },
  Converge: { badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/20' },
}

const napTypes: NapType[] = ['8-port', '16-port', '24-port']
const statuses: Array<'all' | NapStatus> = ['all', 'active', 'inactive', 'damaged', 'for_replacement']

const statCards = [
  { label: 'Total NAP Boxes', key: 'total',           icon: 'bx bx-server',       accent: 'from-sky-500 to-blue-500',       ring: 'ring-sky-200 dark:ring-sky-500/20' },
  { label: 'Active',          key: 'active',           icon: 'bx bx-check-circle', accent: 'from-emerald-500 to-teal-500',   ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
  { label: 'Inactive',        key: 'inactive',         icon: 'bx bx-minus-circle', accent: 'from-gray-400 to-gray-500',      ring: 'ring-gray-200 dark:ring-zinc-500/20' },
  { label: 'Damaged',         key: 'damaged',          icon: 'bx bx-error-circle', accent: 'from-red-500 to-rose-500',       ring: 'ring-red-200 dark:ring-red-500/20' },
  { label: 'For Replacement', key: 'for_replacement',  icon: 'bx bx-transfer',     accent: 'from-amber-400 to-orange-500',   ring: 'ring-amber-200 dark:ring-amber-500/20' },
  { label: 'Full Capacity',   key: 'full',             icon: 'bx bx-data',         accent: 'from-violet-500 to-purple-500',  ring: 'ring-violet-200 dark:ring-violet-500/20' },
] as const

const iCls =
  'h-[42px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-700/60 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:bg-zinc-700 dark:focus:ring-violet-500/10'
const sCls = `${iCls} appearance-none pr-10 cursor-pointer`
const tCls = `${iCls} h-auto py-3`
const fiCls =
  'h-9 w-full rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-slate-200 dark:hover:border-zinc-500 dark:focus:border-violet-500'
const fsCls = `${fiCls} appearance-none pr-8 cursor-pointer`
const lCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'
const primaryBtnCls = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]'
const secondaryBtnCls = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
const dangerBtnCls = 'h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-700 active:scale-[0.99]'

const emptyBox = (): NapBox => ({
  id: '', tag: '', pole_id: '', type: '16-port', total_slots: 16, used_slots: 0,
  owner: '', region: '', province: '', city: '', barangay: '',
  lat: '', lng: '', status: '' as NapStatus, remarks: '',
})

let _seq = initialBoxes.length + 1
const nextId  = () => `NAP-${String(_seq).padStart(4, '0')}`
const nextTag = () => { const t = `NTAG-${String(_seq).padStart(3, '0')}`; _seq++; return t }

function Chevron() {
  return <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-400" />
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">{label}</span>
      <div className="h-px flex-1 bg-slate-100 dark:bg-zinc-700" />
    </div>
  )
}

interface ModalProps { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; danger?: boolean; width?: string }
function Modal({ open, onClose, title, subtitle, children, danger, width = 'max-w-2xl' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-zinc-900`}>
        <div className={`rounded-t-3xl px-6 py-5 ${danger ? 'bg-gradient-to-r from-red-600 to-rose-600' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="mt-0.5 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white transition">
              <i className="bx bx-x text-xl leading-none" />
            </button>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

interface FormProps { data: NapBox; onChange: (d: NapBox) => void; onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void; close: () => void; mode: 'add' | 'edit' }
function NapForm({ data, onChange, onSubmit, close, mode }: FormProps) {
  const upd = (k: keyof NapBox, v: string | number) => onChange({ ...data, [k]: v })
  const typeSlots: Record<NapType, number> = { '8-port': 8, '16-port': 16, '24-port': 24 }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <SectionDivider label="Box Info" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lCls}>NAP Box ID</label>
          <input value={data.id} onChange={e => upd('id', e.target.value)} className={iCls} placeholder="NAP-0001" required />
        </div>
        <div>
          <label className={lCls}>Tag</label>
          <input value={data.tag} onChange={e => upd('tag', e.target.value)} className={iCls} placeholder="NTAG-001" required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lCls}>Attached Pole ID</label>
          <input value={data.pole_id} onChange={e => upd('pole_id', e.target.value)} className={iCls} placeholder="PL-8812" />
        </div>
        <div>
          <label className={lCls}>Owner</label>
          <div className="relative">
            <select value={data.owner} onChange={e => upd('owner', e.target.value)} className={sCls} required>
              <option value="">Select Owner</option>
              {['Globe', 'Meralco', 'PLDT', 'Converge'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <Chevron />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={lCls}>Type</label>
          <div className="relative">
            <select value={data.type} onChange={e => {
              const t = e.target.value as NapType
              upd('type', t)
              onChange({ ...data, type: t, total_slots: typeSlots[t] })
            }} className={sCls} required>
              <option value="">Select Type</option>
              {napTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Chevron />
          </div>
        </div>
        <div>
          <label className={lCls}>Total Slots</label>
          <input type="number" value={data.total_slots} onChange={e => upd('total_slots', Number(e.target.value))} className={iCls} min={1} required />
        </div>
        <div>
          <label className={lCls}>Used Slots</label>
          <input type="number" value={data.used_slots} onChange={e => upd('used_slots', Number(e.target.value))} className={iCls} min={0} max={data.total_slots} required />
        </div>
      </div>

      <div>
        <label className={lCls}>Status</label>
        <div className="relative">
          <select value={data.status} onChange={e => upd('status', e.target.value)} className={sCls} required>
            <option value="">Select Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="damaged">Damaged</option>
            <option value="for_replacement">For Replacement</option>
          </select>
          <Chevron />
        </div>
      </div>

      <SectionDivider label="Location" />
      <PsgcCascade
        region={data.region} province={data.province} city={data.city} barangay={data.barangay}
        onChange={u => onChange({ ...data, ...u })}
        inputClass={sCls}
        labelClass={lCls}
      />

      <SectionDivider label="Coordinates" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lCls}>Latitude</label>
          <input value={data.lat} onChange={e => upd('lat', e.target.value)} className={iCls} placeholder="14.5547" />
        </div>
        <div>
          <label className={lCls}>Longitude</label>
          <input value={data.lng} onChange={e => upd('lng', e.target.value)} className={iCls} placeholder="121.0244" />
        </div>
      </div>

      <div>
        <label className={lCls}>Remarks</label>
        <textarea value={data.remarks} onChange={e => upd('remarks', e.target.value)} rows={2} className={tCls} placeholder="Optional notes…" />
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-zinc-700">
        <button type="button" onClick={close} className={secondaryBtnCls}>Cancel</button>
        <button type="submit" className={primaryBtnCls}>
          {mode === 'add' ? 'Save NAP Box' : 'Update NAP Box'}
        </button>
      </div>
    </form>
  )
}

export default function AllNapBoxes() {
  const admin = isAdmin()
  const navigate = useNavigate()
  const [boxes, setBoxes]         = useState<NapBox[]>(initialBoxes)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | NapStatus>('all')
  const [filterOwner, setFilterOwner]   = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editBox, setEditBox]     = useState<NapBox | null>(null)
  const [delBox, setDelBox]       = useState<NapBox | null>(null)
  const [formData, setFormData]   = useState<NapBox>(emptyBox())

  const counts = useMemo(() => ({
    total:           boxes.length,
    active:          boxes.filter(b => b.status === 'active').length,
    inactive:        boxes.filter(b => b.status === 'inactive').length,
    damaged:         boxes.filter(b => b.status === 'damaged').length,
    for_replacement: boxes.filter(b => b.status === 'for_replacement').length,
    full:            boxes.filter(b => b.used_slots >= b.total_slots).length,
  }), [boxes])

  const filtered = useMemo(() => boxes.filter(b => {
    const q = search.toLowerCase()
    const matchQ = !q || b.id.toLowerCase().includes(q) || b.tag.toLowerCase().includes(q) ||
      b.pole_id.toLowerCase().includes(q) || b.city.toLowerCase().includes(q) || b.barangay.toLowerCase().includes(q)
    const matchS = filterStatus === 'all' || b.status === filterStatus
    const matchO = filterOwner === 'all'  || b.owner === filterOwner
    return matchQ && matchS && matchO
  }), [boxes, search, filterStatus, filterOwner])

  const owners = useMemo(() => ['all', ...Array.from(new Set(boxes.map(b => b.owner)))], [boxes])

  const close = () => { setIsAddOpen(false); setEditBox(null); setDelBox(null) }

  const handleAdd = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBoxes(prev => [...prev, formData])
    close()
  }

  const handleEdit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBoxes(prev => prev.map(b => b.id === formData.id ? formData : b))
    close()
  }

  const handleDel = () => {
    if (!delBox) return
    setBoxes(prev => prev.filter(b => b.id !== delBox.id))
    close()
  }

  const utilPct = (b: NapBox) => b.total_slots > 0 ? Math.round((b.used_slots / b.total_slots) * 100) : 0
  const utilColor = (pct: number) =>
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'

  return (
    <>
      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(c => (
          <div key={c.key} className={`relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ${c.ring} flex flex-col justify-between p-4 min-h-[96px]`}>
            <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${c.accent}`} />
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-tight">{c.label}</p>
              <i className={`${c.icon} text-xl text-slate-300 dark:text-zinc-600 shrink-0`} />
            </div>
            <p className="text-[28px] font-bold leading-none text-slate-800 dark:text-zinc-100">
              {counts[c.key as keyof typeof counts]}
            </p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-zinc-700">
          <div>
            <h4 className="text-base font-semibold text-slate-800 dark:text-zinc-100">NAP Boxes</h4>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Manage all NAP box inventory</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className={`${fiCls} pl-8 w-44`}
              />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className={`${fsCls} w-40`}>
                {statuses.map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All Statuses' : statusConfig[s].label}</option>
                ))}
              </select>
              <Chevron />
            </div>

            {/* Owner filter */}
            <div className="relative">
              <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className={`${fsCls} w-36`}>
                {owners.map(o => <option key={o} value={o}>{o === 'all' ? 'All Owners' : o}</option>)}
              </select>
              <Chevron />
            </div>

            <span className="text-xs font-medium text-slate-400 dark:text-zinc-500">
              {filtered.length} {filtered.length === 1 ? 'box' : 'boxes'}
            </span>

            <button
              onClick={() => { setFormData({ ...emptyBox(), id: nextId(), tag: nextTag() }); setIsAddOpen(true) }}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]"
            >
              <i className="bx bx-plus text-[18px]" />
              <span>Add NAP Box</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-zinc-700/40">
                {['NAP Box ID', 'Tag', 'Pole ID', 'Type', 'Owner', 'Location', 'Utilization', 'Status', 'Remarks', 'Action'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-700/50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 dark:text-zinc-500">
                    <i className="bx bx-server text-3xl block mb-2" />
                    No NAP boxes found
                  </td>
                </tr>
              )}
              {filtered.map(b => {
                const pct = utilPct(b)
                const sc  = statusConfig[b.status] ?? statusConfig.inactive
                const oc  = ownerConfig[b.owner]
                return (
                  <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => navigate(`/nap/boxes/${b.id}`)}
                        className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline underline-offset-2 transition"
                        title="View full detail"
                      >
                        {b.id}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-zinc-400">{b.tag}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-violet-600 dark:text-violet-400">{b.pole_id || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">{b.type}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {oc
                        ? <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${oc.badge}`}>{b.owner}</span>
                        : <span className="text-xs text-slate-400">{b.owner || '—'}</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-zinc-400">
                      {b.city ? `${b.city}, ${b.barangay}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1 min-w-[80px]">
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden">
                          <div className={`h-full rounded-full ${utilColor(pct)} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{b.used_slots}/{b.total_slots} ({pct}%)</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-400 dark:text-zinc-500 max-w-[120px] truncate">{b.remarks || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => { setFormData({ ...b }); setEditBox(b) }}
                          title="Edit"
                          className="rounded-xl p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-400 transition"
                        >
                          <i className="bx bx-edit text-base" />
                        </button>
                        {admin && (
                          <button
                            onClick={() => setDelBox(b)}
                            title="Delete"
                            className="rounded-xl p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition"
                          >
                            <i className="bx bx-trash text-base" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination placeholder */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-zinc-700">
          <span className="text-xs text-slate-400 dark:text-zinc-500">Showing {filtered.length} of {boxes.length} records</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3].map(n => (
              <button key={n} className={`h-7 w-7 rounded-lg text-xs font-medium transition ${n === 1 ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      <Modal open={isAddOpen} onClose={close} title="Add NAP Box" subtitle="Register a new NAP box to the inventory">
        <NapForm data={formData} onChange={setFormData} onSubmit={handleAdd} close={close} mode="add" />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editBox} onClose={close} title="Edit NAP Box" subtitle={`Editing ${editBox?.id}`}>
        <NapForm data={formData} onChange={setFormData} onSubmit={handleEdit} close={close} mode="edit" />
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!delBox} onClose={close} title="Delete NAP Box?" subtitle="This action cannot be undone." danger width="max-w-sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-zinc-300 text-center">
            You are about to delete <span className="font-semibold text-slate-800 dark:text-zinc-100">{delBox?.id}</span>.
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-zinc-800 p-4 text-sm">
            {([['NAP Box ID', delBox?.id], ['Tag', delBox?.tag], ['Pole ID', delBox?.pole_id], ['Location', `${delBox?.city ?? ''}, ${delBox?.barangay ?? ''}`]] as [string, string | undefined][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{k}</dt>
                <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-row gap-3 justify-center">
            <button onClick={handleDel} className={`${dangerBtnCls} flex-1`}>Yes, Delete</button>
            <button onClick={close} className={`${secondaryBtnCls} flex-1`}>Cancel</button>
          </div>
        </div>
      </Modal>

    </>
  )
}
