import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'


type SlotStatus = 'occupied' | 'available' | 'reserved' | 'damaged'
interface Slot { number: number; status: SlotStatus; subscriber?: string; account_no?: string }
interface NapBox {
  id: string; tag: string; type: '8-port' | '16-port' | '24-port'; owner: string
  region: string; province: string; city: string; barangay: string
  pole_id: string; box_status: 'active' | 'inactive' | 'damaged' | 'for_replacement'
  slots: Slot[]
}

function makeSlots(total: number, used: number, overrides: { no: number; status: SlotStatus; sub?: string }[] = []): Slot[] {
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const ov = overrides.find(o => o.no === n)
    if (ov) return { number: n, status: ov.status, subscriber: ov.sub }
    const occ = n <= used
    return { number: n, status: occ ? 'occupied' : 'available', subscriber: occ ? `SUB-${String(n).padStart(3,'0')}` : undefined, account_no: occ ? `ACC-${String(n * 7 + 1000).padStart(6,'0')}` : undefined }
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

const SLOT_COLOR: Record<SlotStatus, { chassis: string; body: string; ferrule: string; glow: string; label: string; pill: string; bg: string }> = {
  occupied:  { chassis: '#450a0a', body: '#dc2626', ferrule: '#fee2e2', glow: '0 0 10px 4px #dc262688', label: 'Occupied',  pill: 'bg-red-100 text-red-700 ring-1 ring-red-200',    bg: 'bg-red-50 dark:bg-red-500/10' },
  available: { chassis: '#14532d', body: '#16a34a', ferrule: '#bbf7d0', glow: '0 0 10px 4px #16a34a88', label: 'Free',      pill: 'bg-green-100 text-green-700 ring-1 ring-green-200', bg: 'bg-green-50 dark:bg-green-500/10' },
  reserved:  { chassis: '#451a03', body: '#d97706', ferrule: '#fef3c7', glow: '0 0 10px 4px #d9770688', label: 'Reserved',  pill: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  damaged:   { chassis: '#422006', body: '#ca8a04', ferrule: '#fef9c3', glow: '0 0 10px 4px #ca8a0488', label: 'Damaged',   pill: 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
}

const BOX_STATUS: Record<NapBox['box_status'], { label: string; cls: string }> = {
  active:          { label: 'Active',          cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
  inactive:        { label: 'Inactive',        cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200' },
  damaged:         { label: 'Damaged',         cls: 'bg-red-100 text-red-700 ring-1 ring-red-200' },
  for_replacement: { label: 'For Replacement', cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
}

const OWNER_COLOR: Record<string, string> = {
  Globe: 'text-sky-600', Meralco: 'text-amber-600', PLDT: 'text-green-600', Converge: 'text-rose-600',
}

function FiberPort({ slot, hovered, onHover, size = 52 }: { slot: Slot; hovered: Slot | null; onHover: (s: Slot | null) => void; size?: number }) {
  const cfg   = SLOT_COLOR[slot.status]
  const isHov = hovered?.number === slot.number
  const fs    = Math.round(size * 0.22)
  const bs    = Math.round(size * 0.48)
  const fer   = Math.round(size * 0.22)

  return (
    <div
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      style={{
        width: size, height: size, background: '#0f0f0f', borderRadius: 5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        boxShadow: isHov ? `inset 0 0 0 1.5px #ffffff50, ${cfg.glow}` : 'inset 0 0 0 1px #ffffff10',
        transition: 'box-shadow 0.12s', cursor: 'pointer', position: 'relative',
      }}
    >
      <div style={{ width: bs, height: bs, borderRadius: 3, background: cfg.chassis, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.7)' }}>
        <div style={{ width: Math.round(bs * 0.68), height: Math.round(bs * 0.68), borderRadius: 2, background: cfg.body, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
          <div style={{ width: fer, height: fer, borderRadius: '50%', background: cfg.ferrule, opacity: 0.9 }} />
        </div>
      </div>
      <span style={{ fontSize: fs, color: '#ffffff60', fontFamily: 'monospace', fontWeight: 700, lineHeight: 1 }}>{slot.number}</span>
    </div>
  )
}

export default function NapBoxDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const box = BOXES.find(b => b.id === id)

  if (!box) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <i className="bx bx-error-circle text-5xl text-slate-300 dark:text-zinc-600" />
      <p className="text-slate-500 dark:text-zinc-400 font-medium">NAP Box <span className="font-mono font-bold">{id}</span> not found.</p>
      <button onClick={() => navigate(-1)} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition">Go Back</button>
    </div>
  )

  const [hovered, setHovered] = useState<Slot | null>(null)

  const counts = {
    occupied:  box.slots.filter(s => s.status === 'occupied').length,
    available: box.slots.filter(s => s.status === 'available').length,
    reserved:  box.slots.filter(s => s.status === 'reserved').length,
    damaged:   box.slots.filter(s => s.status === 'damaged').length,
  }
  const utilPct = Math.round((counts.occupied / box.slots.length) * 100)

  const bs = BOX_STATUS[box.box_status]

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* ── Back + Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-700 transition shadow-sm">
            <i className="bx bx-arrow-back text-lg" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xl font-bold font-mono text-slate-800 dark:text-zinc-100">{box.id}</h4>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${bs.cls}`}>{bs.label}</span>
              <span className={`text-sm font-bold ${OWNER_COLOR[box.owner] ?? 'text-slate-600'}`}>{box.owner}</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{box.tag} · {box.type} · Pole {box.pole_id} · {box.barangay}, {box.city}</p>
          </div>
        </div>
      </div>

      {/* ── Info Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          { icon: 'bx bx-anchor',      label: 'Pole ID',       value: box.pole_id,       accent: 'from-violet-500 to-indigo-500' },
          { icon: 'bx bx-buildings',   label: 'Owner',         value: box.owner,          accent: 'from-sky-500 to-blue-500' },
          { icon: 'bx bx-chip',        label: 'Type',          value: box.type,           accent: 'from-teal-500 to-cyan-500' },
          { icon: 'bx bx-map-pin',     label: 'Location',      value: `${box.barangay}, ${box.city}`, accent: 'from-pink-500 to-rose-500' },
          { icon: 'bx bx-data',        label: 'Total Slots',   value: String(box.slots.length), accent: 'from-emerald-500 to-green-500' },
          { icon: 'bx bx-line-chart',  label: 'Utilization',   value: `${utilPct}%`,      accent: utilPct >= 90 ? 'from-red-500 to-rose-500' : utilPct >= 60 ? 'from-amber-500 to-orange-500' : 'from-emerald-500 to-teal-500' },
        ] as const).map(c => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 p-4 min-h-[86px] flex flex-col justify-between">
            <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${c.accent}`} />
            <div className="flex items-start justify-between gap-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{c.label}</p>
              <i className={`${c.icon} text-lg text-slate-200 dark:text-zinc-700`} />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate">{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main content: panel + detail ── */}
      <div className="flex flex-col xl:flex-row gap-5">

        {/* Fiber Panel */}
        <div className="flex-1 rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-700 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Fiber Panel View</p>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Hover a port to see details</p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap">
              {(Object.keys(SLOT_COLOR) as SlotStatus[]).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: SLOT_COLOR[s].body }} />
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">{SLOT_COLOR[s].label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 flex flex-col items-center gap-6">
            {/* Chassis */}
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '20px 24px', width: '100%', maxWidth: 680, boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7), 0 4px 20px rgba(0,0,0,0.4)' }}>
              {/* Label bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ color: '#ffffff80', fontSize: 10, fontFamily: 'monospace', letterSpacing: 2 }}>{box.id}</span>
                <span style={{ color: '#ffffff50', fontSize: 10, fontFamily: 'monospace' }}>{box.type.toUpperCase()}</span>
              </div>
              {/* Ports grid */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${box.slots.length <= 8 ? 4 : box.slots.length <= 16 ? 8 : 12}, 1fr)`, gap: 8 }}>
                {box.slots.map(slot => (
                  <FiberPort key={slot.number} slot={slot} hovered={hovered} onHover={setHovered} size={52} />
                ))}
              </div>
              {/* Utilization bar */}
              <div style={{ marginTop: 20 }}>
                <div style={{ height: 4, borderRadius: 2, background: '#333', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${utilPct}%`, background: utilPct >= 90 ? '#dc2626' : utilPct >= 60 ? '#d97706' : '#16a34a', transition: 'width 0.5s', borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ color: '#ffffff50', fontSize: 10, fontFamily: 'monospace' }}>UTILIZATION</span>
                  <span style={{ color: '#ffffff80', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{counts.occupied}/{box.slots.length} ({utilPct}%)</span>
                </div>
              </div>
            </div>

            {/* Tooltip / hover detail */}
            <div className={`w-full max-w-[680px] rounded-2xl p-4 transition-all ${hovered ? SLOT_COLOR[hovered.status].bg : 'bg-slate-50 dark:bg-zinc-700/30'}`}>
              {hovered ? (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: SLOT_COLOR[hovered.status].body }} />
                    <span className="text-sm font-bold text-slate-800 dark:text-zinc-100">Port {hovered.number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SLOT_COLOR[hovered.status].pill}`}>{SLOT_COLOR[hovered.status].label}</span>
                  </div>
                  {hovered.subscriber && <span className="text-xs font-medium text-slate-600 dark:text-zinc-300">Subscriber: <span className="font-mono font-bold">{hovered.subscriber}</span></span>}
                  {hovered.account_no && <span className="text-xs font-medium text-slate-600 dark:text-zinc-300">Account: <span className="font-mono font-bold">{hovered.account_no}</span></span>}
                  {!hovered.subscriber && <span className="text-xs text-slate-400 dark:text-zinc-500 italic">No subscriber assigned</span>}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-zinc-500 text-center">Hover over a port to see subscriber details</p>
              )}
            </div>
          </div>
        </div>

        {/* Slot count summary + table */}
        <div className="xl:w-72 flex flex-col gap-4">
          {/* Slot count pills */}
          <div className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 p-4 grid grid-cols-2 gap-3">
            {(Object.keys(counts) as SlotStatus[]).map(s => (
              <div key={s} className={`rounded-2xl p-3 flex flex-col gap-1 ${SLOT_COLOR[s].bg}`}>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SLOT_COLOR[s].body }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">{SLOT_COLOR[s].label}</span>
                </div>
                <span className="text-2xl font-bold text-slate-800 dark:text-zinc-100">{counts[s]}</span>
              </div>
            ))}
          </div>

          {/* Slot detail list */}
          <div className="flex-1 rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-700">
              <p className="text-xs font-bold text-slate-700 dark:text-zinc-200">All Ports</p>
            </div>
            <div className="overflow-y-auto max-h-80 divide-y divide-slate-50 dark:divide-zinc-700/50">
              {box.slots.map(slot => {
                const cfg = SLOT_COLOR[slot.status]
                return (
                  <div key={slot.number} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-700/30 transition">
                    <span className="text-[11px] font-mono font-bold text-slate-400 dark:text-zinc-500 w-5 shrink-0">{slot.number}</span>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: cfg.body }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-slate-700 dark:text-zinc-200 truncate">
                        {slot.subscriber ?? <span className="text-slate-300 dark:text-zinc-600 font-normal italic">—</span>}
                      </p>
                      {slot.account_no && <p className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">{slot.account_no}</p>}
                    </div>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cfg.pill}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
