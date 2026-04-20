import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PsgcCascade from '../../components/PsgcCascade'

type SlotStatus = 'occupied' | 'available' | 'reserved' | 'damaged'

interface Slot {
  number: number
  status: SlotStatus
  subscriber?: string
  account_no?: string
}

interface NapBox {
  id: string
  tag: string
  type: '8-port' | '16-port' | '24-port'
  owner: string
  region: string
  province: string
  city: string
  barangay: string
  pole_id: string
  box_status: 'active' | 'inactive' | 'damaged' | 'for_replacement'
  slots: Slot[]
}

function makeSlots(total: number, used: number, overrides: { no: number; status: SlotStatus; sub?: string }[] = []): Slot[] {
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const ov = overrides.find(o => o.no === n)
    if (ov) return { number: n, status: ov.status, subscriber: ov.sub }
    const occ = n <= used
    return {
      number: n,
      status: occ ? 'occupied' : 'available',
      subscriber: occ ? `SUB-${String(n).padStart(3, '0')}` : undefined,
      account_no: occ ? `ACC-${String(n * 7 + 1000).padStart(6, '0')}` : undefined,
    }
  })
}

const BOXES: NapBox[] = [
  { id: 'NAP-0001', tag: 'NTAG-001', type: '16-port', owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Sta. Cruz',     pole_id: 'PL-8812', box_status: 'active',          slots: makeSlots(16, 12, [{ no: 7, status: 'reserved', sub: 'Reserved - Globe' }, { no: 14, status: 'damaged' }]) },
  { id: 'NAP-0002', tag: 'NTAG-002', type: '8-port',  owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Bangkal',       pole_id: 'PL-8801', box_status: 'active',          slots: makeSlots(8, 5) },
  { id: 'NAP-0003', tag: 'NTAG-003', type: '24-port', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Palanan',       pole_id: 'PL-7703', box_status: 'active',          slots: makeSlots(24, 24) },
  { id: 'NAP-0004', tag: 'NTAG-004', type: '16-port', owner: 'PLDT',     region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Pio del Pilar', pole_id: 'PL-7654', box_status: 'inactive',        slots: makeSlots(16, 0) },
  { id: 'NAP-0005', tag: 'NTAG-005', type: '8-port',  owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Comembo',       pole_id: 'PL-8790', box_status: 'damaged',         slots: makeSlots(8, 3, [{ no: 5, status: 'damaged' }, { no: 6, status: 'damaged' }]) },
  { id: 'NAP-0006', tag: 'NTAG-006', type: '16-port', owner: 'Converge', region: 'NCR', province: 'Metro Manila', city: 'Makati', barangay: 'Pembo',         pole_id: 'PL-7621', box_status: 'active',          slots: makeSlots(16, 9) },
  { id: 'NAP-0007', tag: 'NTAG-007', type: '24-port', owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Ususan',        pole_id: 'PL-6998', box_status: 'active',          slots: makeSlots(24, 18) },
  { id: 'NAP-0008', tag: 'NTAG-008', type: '8-port',  owner: 'Globe',    region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Ibayo',         pole_id: 'PL-6540', box_status: 'for_replacement', slots: makeSlots(8, 8) },
  { id: 'NAP-0009', tag: 'NTAG-009', type: '16-port', owner: 'PLDT',     region: 'NCR', province: 'Metro Manila', city: 'Taguig', barangay: 'Central',       pole_id: 'PL-5802', box_status: 'active',          slots: makeSlots(16, 11) },
  { id: 'NAP-0010', tag: 'NTAG-010', type: '24-port', owner: 'Meralco',  region: 'NCR', province: 'Metro Manila', city: 'Pasig',  barangay: 'Ugong',         pole_id: 'PL-5210', box_status: 'active',          slots: makeSlots(24, 7) },
]

// ── Slot color config ────────────────────────────────────────────────────────
const SLOT_COLOR: Record<SlotStatus, { chassis: string; body: string; ferrule: string; glow: string; label: string; pill: string }> = {
  occupied:  { chassis: '#450a0a', body: '#dc2626', ferrule: '#fee2e2', glow: '0 0 8px 3px #dc262688', label: 'Occupied',  pill: 'bg-red-100 text-red-700 ring-red-200' },
  available: { chassis: '#14532d', body: '#16a34a', ferrule: '#bbf7d0', glow: '0 0 8px 3px #16a34a88', label: 'Free',      pill: 'bg-green-100 text-green-700 ring-green-200' },
  reserved:  { chassis: '#451a03', body: '#d97706', ferrule: '#fef3c7', glow: '0 0 8px 3px #d9770688', label: 'Reserved',  pill: 'bg-amber-100 text-amber-700 ring-amber-200' },
  damaged:   { chassis: '#422006', body: '#ca8a04', ferrule: '#fef9c3', glow: '0 0 8px 3px #ca8a0488', label: 'Damaged',   pill: 'bg-yellow-100 text-yellow-700 ring-yellow-200' },
}

const BOX_STATUS_LABEL: Record<NapBox['box_status'], string> = {
  active: 'Active', inactive: 'Inactive', damaged: 'Damaged', for_replacement: 'For Replacement',
}

// ── Single fiber port ────────────────────────────────────────────────────────
function FiberPort({ slot, hovered, onHover }: { slot: Slot; hovered: Slot | null; onHover: (s: Slot | null) => void }) {
  const cfg = SLOT_COLOR[slot.status]
  const isHov = hovered?.number === slot.number
  return (
    <div
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      style={{
        width: 36, height: 36, background: '#111', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: isHov ? `inset 0 0 0 1.5px #ffffff50, ${cfg.glow}` : 'inset 0 0 0 1px #ffffff10',
        transition: 'box-shadow 0.12s', cursor: 'default', position: 'relative',
      }}
    >
      <div style={{ width: 26, height: 26, background: '#060606', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9)' }}>
        <div style={{ width: 18, height: 18, background: cfg.body, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: cfg.glow }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.ferrule }} />
        </div>
      </div>
      <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#ffffff40', fontFamily: 'monospace' }}>{slot.number}</span>
    </div>
  )
}

// ── NAP Box panel card ───────────────────────────────────────────────────────
function NapPanelCard({ box }: { box: NapBox }) {
  const [hovered, setHovered] = useState<Slot | null>(null)
  const navigate = useNavigate()

  const cols = box.type === '8-port' ? 4 : box.type === '16-port' ? 8 : 12
  const row1 = box.slots.slice(0, cols)
  const row2 = box.slots.slice(cols)

  const counts = {
    occupied:  box.slots.filter(s => s.status === 'occupied').length,
    available: box.slots.filter(s => s.status === 'available').length,
    reserved:  box.slots.filter(s => s.status === 'reserved').length,
    damaged:   box.slots.filter(s => s.status === 'damaged').length,
  }
  const utilPct = Math.round((counts.occupied / box.slots.length) * 100)

  return (
    <div onClick={() => navigate(`/nap/boxes/${box.id}`)} className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden cursor-pointer hover:ring-violet-400 dark:hover:ring-violet-500 transition-shadow hover:shadow-lg hover:shadow-violet-500/10">

      {/* Card header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 dark:from-zinc-900 dark:to-zinc-800 px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/nap/boxes/${box.id}`)} className="font-mono text-sm font-bold text-white hover:text-violet-300 transition underline-offset-2 hover:underline">{box.id}</button>
              <span className="text-white/40 text-xs">{box.tag}</span>
            </div>
            <p className="text-white/50 text-[11px] mt-0.5">
              <i className="mdi mdi-map-marker mr-1" />{box.barangay}, {box.city} · Pole: {box.pole_id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">{box.type}</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: box.box_status === 'active' ? '#16a34a20' : '#dc262620', color: box.box_status === 'active' ? '#4ade80' : '#f87171' }}>
            {BOX_STATUS_LABEL[box.box_status]}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Physical panel */}
        <div style={{ background: 'linear-gradient(180deg,#222 0%,#161616 100%)', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          <div style={{ height: 3, background: '#2a2a2a', borderRadius: 2, marginBottom: 8 }} />
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 justify-center">
              {row1.map(s => <FiberPort key={s.number} slot={s} hovered={hovered} onHover={setHovered} />)}
            </div>
            {row2.length > 0 && (
              <div className="flex gap-1.5 justify-center">
                {row2.map(s => <FiberPort key={s.number} slot={s} hovered={hovered} onHover={setHovered} />)}
              </div>
            )}
          </div>
          <div style={{ height: 3, background: '#2a2a2a', borderRadius: 2, marginTop: 8, marginBottom: 4 }} />
          <div className="flex justify-between px-0.5">
            <span style={{ fontSize: 8, color: '#ffffff25', fontFamily: 'monospace', letterSpacing: 1 }}>{box.id} · SC/APC</span>
            <span style={{ fontSize: 8, color: '#ffffff25', fontFamily: 'monospace' }}>{box.owner.toUpperCase()}</span>
          </div>
        </div>

        {/* Hover tooltip */}
        <div className="h-6 flex items-center">
          {hovered ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${SLOT_COLOR[hovered.status].pill}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SLOT_COLOR[hovered.status].body }} />
              Slot #{hovered.number} — {SLOT_COLOR[hovered.status].label}
              {hovered.subscriber && <span className="opacity-60 ml-1">{hovered.subscriber}</span>}
            </span>
          ) : (
            <span className="text-[11px] text-slate-300 dark:text-zinc-600 italic">Hover a port to inspect</span>
          )}
        </div>

        {/* Utilization bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Utilization</span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{counts.occupied}/{box.slots.length} ({utilPct}%)</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden flex">
            {(['occupied','reserved','damaged'] as const).map(k => {
              const pct = (counts[k] / box.slots.length) * 100
              if (!pct) return null
              return <div key={k} className="h-full transition-all" style={{ width: `${pct}%`, background: SLOT_COLOR[k].body }} />
            })}
          </div>
        </div>

        {/* Slot counts */}
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(counts) as [keyof typeof counts, number][]).map(([k, v]) => (
            <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SLOT_COLOR[k].pill}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SLOT_COLOR[k].body }} />
              {v} {SLOT_COLOR[k].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SlotStatus() {
  const [filterOwner, setFilterOwner]         = useState('all')
  const [filterBoxStatus, setFilterBoxStatus] = useState('all')
  const [search, setSearch]                   = useState('')
  const [loc, setLoc] = useState({ region: '', province: '', city: '', barangay: '' })

  const owners = ['all', ...Array.from(new Set(BOXES.map(b => b.owner)))]

  const filtered = useMemo(() => BOXES.filter(b => {
    const q = search.toLowerCase()
    const matchQ = !q || b.id.toLowerCase().includes(q) || b.city.toLowerCase().includes(q) || b.barangay.toLowerCase().includes(q) || b.pole_id.toLowerCase().includes(q)
    const matchO = filterOwner === 'all' || b.owner === filterOwner
    const matchS = filterBoxStatus === 'all' || b.box_status === filterBoxStatus
    const matchR = !loc.region   || b.region   === loc.region
    const matchP = !loc.province || b.province === loc.province
    const matchC = !loc.city     || b.city     === loc.city
    const matchB = !loc.barangay || b.barangay === loc.barangay
    return matchQ && matchO && matchS && matchR && matchP && matchC && matchB
  }), [search, filterOwner, filterBoxStatus, loc])

  const totalSlots = BOXES.reduce((s, b) => s + b.slots.length, 0)
  const occupied   = BOXES.reduce((s, b) => s + b.slots.filter(sl => sl.status === 'occupied').length, 0)
  const available  = BOXES.reduce((s, b) => s + b.slots.filter(sl => sl.status === 'available').length, 0)
  const damaged    = BOXES.reduce((s, b) => s + b.slots.filter(sl => sl.status === 'damaged').length, 0)
  const reserved   = BOXES.reduce((s, b) => s + b.slots.filter(sl => sl.status === 'reserved').length, 0)

  const statCards = [
    { label: 'Total Slots',  value: totalSlots, icon: 'mdi mdi-grid',           accent: 'from-violet-500 to-indigo-500', ring: 'ring-violet-200 dark:ring-violet-500/20' },
    { label: 'Occupied',     value: occupied,   icon: 'mdi mdi-check-circle',   accent: 'from-red-500 to-rose-400',      ring: 'ring-red-200 dark:ring-red-500/20' },
    { label: 'Free Slots',   value: available,  icon: 'mdi mdi-circle-outline', accent: 'from-green-500 to-emerald-400', ring: 'ring-green-200 dark:ring-green-500/20' },
    { label: 'Reserved',     value: reserved,   icon: 'mdi mdi-clock-outline',  accent: 'from-amber-400 to-orange-400',  ring: 'ring-amber-200 dark:ring-amber-500/20' },
    { label: 'Damaged',      value: damaged,    icon: 'mdi mdi-alert-circle',   accent: 'from-yellow-400 to-yellow-300', ring: 'ring-yellow-200 dark:ring-yellow-500/20' },
    { label: 'Utilization',  value: `${Math.round((occupied / totalSlots) * 100)}%`, icon: 'mdi mdi-percent', accent: 'from-pink-500 to-rose-400', ring: 'ring-pink-200 dark:ring-pink-500/20' },
  ]

  const selCls = "h-9 rounded-full border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 pr-8 text-xs font-medium text-slate-600 dark:text-zinc-300 appearance-none outline-none cursor-pointer transition hover:border-violet-300"

  return (
    <>
      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-6 gap-3">
        {statCards.map(c => (
          <div key={c.label} className={`relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ${c.ring} p-4`}>
            <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${c.accent}`} />
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-tight">{c.label}</p>
              <i className={`${c.icon} text-lg text-slate-300 dark:text-zinc-600`} />
            </div>
            <p className="text-[26px] font-bold leading-none text-slate-800 dark:text-zinc-100">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Legend + Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Legend */}
        <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 px-4 py-2">
          {(['occupied','available','reserved','damaged'] as SlotStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
              <span className="h-3 w-3 rounded-sm" style={{ background: SLOT_COLOR[s].body }} />
              {SLOT_COLOR[s].label}
            </span>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <i className="mdi mdi-magnify absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NAP box, pole ID…"
              className="h-9 rounded-full border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 pl-8 pr-4 text-xs font-medium text-slate-600 dark:text-zinc-300 outline-none transition hover:border-violet-300 focus:border-violet-400 w-48" />
          </div>

          <div className="relative">
            <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className={`${selCls} w-36`}>
              {owners.map(o => <option key={o} value={o}>{o === 'all' ? 'All Owners' : o}</option>)}
            </select>
            <i className="mdi mdi-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          </div>

          <div className="relative">
            <select value={filterBoxStatus} onChange={e => setFilterBoxStatus(e.target.value)} className={`${selCls} w-40`}>
              <option value="all">All Box Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="damaged">Damaged</option>
              <option value="for_replacement">For Replacement</option>
            </select>
            <i className="mdi mdi-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          </div>

          <span className="text-xs font-medium text-slate-400 dark:text-zinc-500">{filtered.length} NAP {filtered.length === 1 ? 'box' : 'boxes'}</span>
        </div>
      </div>

      {/* Location filter row */}
      <div className="mb-5 rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <i className="mdi mdi-map-marker text-violet-500 text-base" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Filter by Location</span>
          {(loc.region || loc.province || loc.city || loc.barangay) && (
            <button
              onClick={() => setLoc({ region: '', province: '', city: '', barangay: '' })}
              className="ml-auto text-[11px] font-semibold text-violet-500 hover:text-violet-700 flex items-center gap-1"
            >
              <i className="mdi mdi-close-circle text-sm" /> Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <PsgcCascade
            region={loc.region}
            province={loc.province}
            city={loc.city}
            barangay={loc.barangay}
            onChange={u => setLoc(prev => ({ ...prev, ...u }))}
            inputClass="h-8 w-full rounded-full border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 text-xs font-medium text-slate-600 dark:text-zinc-300 appearance-none outline-none cursor-pointer transition hover:border-violet-300 focus:border-violet-400"
            labelClass="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500"
          />
        </div>
      </div>

      {/* Panel grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-400 dark:text-zinc-500">
          <i className="mdi mdi-server-off text-4xl block mb-2" />
          No NAP boxes match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(b => <NapPanelCard key={b.id} box={b} />)}
        </div>
      )}
    </>
  )
}
