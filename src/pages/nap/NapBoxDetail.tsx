import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

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

function makeSlots(
  total: number,
  used: number,
  overrides: { no: number; status: SlotStatus; sub?: string }[] = []
): Slot[] {
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const override = overrides.find((item) => item.no === n)

    if (override) {
      return {
        number: n,
        status: override.status,
        subscriber: override.sub,
      }
    }

    const occupied = n <= used

    return {
      number: n,
      status: occupied ? 'occupied' : 'available',
      subscriber: occupied ? `SUB-${String(n).padStart(3, '0')}` : undefined,
      account_no: occupied ? `ACC-${String(n * 7 + 1000).padStart(6, '0')}` : undefined,
    }
  })
}

const BOXES: NapBox[] = [
  {
    id: 'NAP-0001',
    tag: 'NTAG-001',
    type: '16-port',
    owner: 'Globe',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Makati',
    barangay: 'Sta. Cruz',
    pole_id: 'PL-8812',
    box_status: 'active',
    slots: makeSlots(16, 12, [
      { no: 7, status: 'reserved', sub: 'Reserved - Globe' },
      { no: 14, status: 'damaged' },
    ]),
  },
  {
    id: 'NAP-0002',
    tag: 'NTAG-002',
    type: '8-port',
    owner: 'Globe',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Makati',
    barangay: 'Bangkal',
    pole_id: 'PL-8801',
    box_status: 'active',
    slots: makeSlots(8, 5),
  },
  {
    id: 'NAP-0003',
    tag: 'NTAG-003',
    type: '24-port',
    owner: 'Meralco',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Makati',
    barangay: 'Palanan',
    pole_id: 'PL-7703',
    box_status: 'active',
    slots: makeSlots(24, 24),
  },
  {
    id: 'NAP-0004',
    tag: 'NTAG-004',
    type: '16-port',
    owner: 'PLDT',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Makati',
    barangay: 'Pio del Pilar',
    pole_id: 'PL-7654',
    box_status: 'inactive',
    slots: makeSlots(16, 0),
  },
  {
    id: 'NAP-0005',
    tag: 'NTAG-005',
    type: '8-port',
    owner: 'Globe',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Makati',
    barangay: 'Comembo',
    pole_id: 'PL-8790',
    box_status: 'damaged',
    slots: makeSlots(8, 3, [
      { no: 5, status: 'damaged' },
      { no: 6, status: 'damaged' },
    ]),
  },
  {
    id: 'NAP-0006',
    tag: 'NTAG-006',
    type: '16-port',
    owner: 'Converge',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Makati',
    barangay: 'Pembo',
    pole_id: 'PL-7621',
    box_status: 'active',
    slots: makeSlots(16, 9),
  },
  {
    id: 'NAP-0007',
    tag: 'NTAG-007',
    type: '24-port',
    owner: 'Globe',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Taguig',
    barangay: 'Ususan',
    pole_id: 'PL-6998',
    box_status: 'active',
    slots: makeSlots(24, 18),
  },
  {
    id: 'NAP-0008',
    tag: 'NTAG-008',
    type: '8-port',
    owner: 'Globe',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Taguig',
    barangay: 'Ibayo',
    pole_id: 'PL-6540',
    box_status: 'for_replacement',
    slots: makeSlots(8, 8),
  },
  {
    id: 'NAP-0009',
    tag: 'NTAG-009',
    type: '16-port',
    owner: 'PLDT',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Taguig',
    barangay: 'Central',
    pole_id: 'PL-5802',
    box_status: 'active',
    slots: makeSlots(16, 11),
  },
  {
    id: 'NAP-0010',
    tag: 'NTAG-010',
    type: '24-port',
    owner: 'Meralco',
    region: 'NCR',
    province: 'Metro Manila',
    city: 'Pasig',
    barangay: 'Ugong',
    pole_id: 'PL-5210',
    box_status: 'active',
    slots: makeSlots(24, 7),
  },
]

const SLOT_COLOR: Record<
  SlotStatus,
  {
    label: string
    body: string
    ferrule: string
    glow: string
    soft: string
    text: string
    dot: string
  }
> = {
  occupied: {
    label: 'Occupied',
    body: '#dc2626',
    ferrule: '#fee2e2',
    glow: '0 0 10px 3px rgba(220,38,38,0.45)',
    soft: 'bg-red-50 ring-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  available: {
    label: 'Free',
    body: '#16a34a',
    ferrule: '#bbf7d0',
    glow: '0 0 10px 3px rgba(22,163,74,0.40)',
    soft: 'bg-emerald-50 ring-emerald-100',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  reserved: {
    label: 'Reserved',
    body: '#d97706',
    ferrule: '#fef3c7',
    glow: '0 0 10px 3px rgba(217,119,6,0.40)',
    soft: 'bg-amber-50 ring-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  damaged: {
    label: 'Damaged',
    body: '#ca8a04',
    ferrule: '#fef9c3',
    glow: '0 0 10px 3px rgba(202,138,4,0.40)',
    soft: 'bg-yellow-50 ring-yellow-100',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500',
  },
}

const BOX_STATUS_LABEL: Record<NapBox['box_status'], string> = {
  active: 'Active',
  inactive: 'Inactive',
  damaged: 'Damaged',
  for_replacement: 'For Replacement',
}

const BOX_STATUS_BADGE: Record<NapBox['box_status'], string> = {
  active:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/20',
  inactive:
    'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-700/60 dark:text-zinc-300 dark:ring-zinc-600',
  damaged:
    'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-400 dark:ring-red-500/20',
  for_replacement:
    'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/20',
}

function FiberPort({
  slot,
  active,
  onHover,
  onSelect,
}: {
  slot: Slot
  active: boolean
  onHover: (slot: Slot | null) => void
  onSelect: (slot: Slot) => void
}) {
  const cfg = SLOT_COLOR[slot.status]

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(slot)}
      className="relative flex h-12 w-12 items-center justify-center rounded-md bg-[#101010] transition hover:-translate-y-0.5"
      style={{
        boxShadow: active
          ? `inset 0 0 0 1.5px rgba(255,255,255,0.35), ${cfg.glow}`
          : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-[4px]"
          style={{
            background: cfg.body,
            boxShadow: cfg.glow,
          }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: cfg.ferrule }}
          />
        </div>
      </div>

      <span className="absolute bottom-1 right-1.5 font-mono text-[8px] text-white/35">
        {slot.number}
      </span>
    </button>
  )
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string | number
  icon: string
  accent: string
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
              {label}
            </p>
            <p className="mt-2 truncate text-lg font-black text-slate-900 dark:text-zinc-100">
              {value}
            </p>
          </div>
          <i className={`${icon} text-lg text-slate-300 dark:text-zinc-600`} />
        </div>
      </div>
    </div>
  )
}

function PortCounter({
  status,
  value,
}: {
  status: SlotStatus
  value: number
}) {
  const cfg = SLOT_COLOR[status]

  return (
    <div className={`rounded-2xl p-4 ring-1 ${cfg.soft}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          {cfg.label}
        </p>
      </div>
      <p className={`mt-2 text-3xl font-black ${cfg.text}`}>{value}</p>
    </div>
  )
}

export default function NapBoxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const box = BOXES.find((item) => item.id === id) ?? BOXES[0]

  const [hovered, setHovered] = useState<Slot | null>(null)
  const [selected, setSelected] = useState<Slot | null>(null)

  const counts = useMemo(
    () => ({
      occupied: box.slots.filter((slot) => slot.status === 'occupied').length,
      available: box.slots.filter((slot) => slot.status === 'available').length,
      reserved: box.slots.filter((slot) => slot.status === 'reserved').length,
      damaged: box.slots.filter((slot) => slot.status === 'damaged').length,
    }),
    [box.slots]
  )

  const activeSlot = hovered ?? selected

  const cols = box.type === '8-port' ? 4 : box.type === '16-port' ? 8 : 12
  const row1 = box.slots.slice(0, cols)
  const row2 = box.slots.slice(cols)

  const usedCount = counts.occupied
  const utilization = Math.round((usedCount / box.slots.length) * 100)

  const overviewCards = [
    {
      label: 'Pole ID',
      value: box.pole_id,
      icon: 'mdi mdi-anchor',
      accent: 'from-violet-500 to-indigo-500',
    },
    {
      label: 'Owner',
      value: box.owner,
      icon: 'mdi mdi-office-building',
      accent: 'from-sky-500 to-blue-500',
    },
    {
      label: 'Type',
      value: box.type,
      icon: 'mdi mdi-chip',
      accent: 'from-cyan-500 to-teal-500',
    },
    {
      label: 'Location',
      value: `${box.barangay}, ${box.city}`,
      icon: 'mdi mdi-map-marker',
      accent: 'from-pink-500 to-rose-500',
    },
    {
      label: 'Total Slots',
      value: box.slots.length,
      icon: 'mdi mdi-database',
      accent: 'from-emerald-500 to-teal-500',
    },
    {
      label: 'Utilization',
      value: `${utilization}%`,
      icon: 'mdi mdi-chart-line',
      accent: 'from-amber-400 to-orange-500',
    },
  ]

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-0.5">
        <div className="flex min-w-0 items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <i className="mdi mdi-arrow-left text-lg" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-mono text-xl font-black text-slate-900 dark:text-zinc-100">
                {box.id}
              </h4>

              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${BOX_STATUS_BADGE[box.box_status]}`}>
                {BOX_STATUS_LABEL[box.box_status]}
              </span>

              <span className="text-sm font-black text-[#0b6cff]">{box.owner}</span>
            </div>

            <p className="mt-1 text-xs font-medium text-slate-400 dark:text-zinc-500">
              {box.tag} · {box.type} · Pole {box.pole_id} · {box.barangay}, {box.city}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/nap/boxes')}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <i className="mdi mdi-view-grid-outline text-base" />
          All NAP Boxes
        </button>
      </div>

      {/* Top cards */}
      <div className="grid grid-cols-6 gap-3">
        {overviewCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            accent={card.accent}
          />
        ))}
      </div>

      {/* Main content */}
      <section className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-5">
          {/* Slot summary above napbox */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                  Slot Summary
                </h3>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                  Live port status count
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">
                {box.type}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <PortCounter status="occupied" value={counts.occupied} />
              <PortCounter status="available" value={counts.available} />
              <PortCounter status="reserved" value={counts.reserved} />
              <PortCounter status="damaged" value={counts.damaged} />
            </div>
          </div>

          {/* Nap box panel */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-700">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-zinc-100">
                  Fiber Panel View
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  Hover or select a port to inspect subscriber details
                </p>
              </div>

              <div className="flex items-center gap-4">
                {(['occupied', 'available', 'reserved', 'damaged'] as SlotStatus[]).map((status) => (
                  <span
                    key={status}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: SLOT_COLOR[status].body }}
                    />
                    {SLOT_COLOR[status].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-6">
              <div className="rounded-[28px] border border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-6 dark:border-zinc-700 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
                <div className="mx-auto max-w-4xl">
                  <div className="rounded-[18px] bg-[#191919] p-6 shadow-[0_25px_70px_-25px_rgba(0,0,0,0.65)] ring-1 ring-black">
                    <div className="mb-5 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
                        {box.id}
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        {box.type.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <div className="flex justify-center gap-4">
                        {row1.map((slot) => (
                          <FiberPort
                            key={slot.number}
                            slot={slot}
                            active={activeSlot?.number === slot.number}
                            onHover={setHovered}
                            onSelect={setSelected}
                          />
                        ))}
                      </div>

                      {row2.length > 0 && (
                        <div className="flex justify-center gap-4">
                          {row2.map((slot) => (
                            <FiberPort
                              key={slot.number}
                              slot={slot}
                              active={activeSlot?.number === slot.number}
                              onHover={setHovered}
                              onSelect={setSelected}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-6">
                      <div className="mb-1.5 flex justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                          Utilization
                        </span>
                        <span className="font-mono text-[10px] font-bold text-blue-200/80">
                          {usedCount}/{box.slots.length} ({utilization}%)
                        </span>
                      </div>

                      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
                        {(['occupied', 'reserved', 'damaged'] as SlotStatus[]).map((status) => {
                          const statusCount =
                            status === 'occupied'
                              ? counts.occupied
                              : status === 'reserved'
                                ? counts.reserved
                                : counts.damaged

                          const width = (statusCount / box.slots.length) * 100

                          if (!width) return null

                          return (
                            <div
                              key={status}
                              className="h-full"
                              style={{
                                width: `${width}%`,
                                background: SLOT_COLOR[status].body,
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-400 dark:bg-zinc-900 dark:text-zinc-500">
                    {activeSlot ? (
                      <span>
                        Slot #{activeSlot.number} ·{' '}
                        <span className={SLOT_COLOR[activeSlot.status].text}>
                          {SLOT_COLOR[activeSlot.status].label}
                        </span>
                        {activeSlot.subscriber && ` · ${activeSlot.subscriber}`}
                        {activeSlot.account_no && ` · ${activeSlot.account_no}`}
                      </span>
                    ) : (
                      'Hover over a port to see subscriber details'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDENAV */}
        <aside className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-700">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                All Ports
              </h3>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                Subscriber and port state
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">
              {box.slots.length} ports
            </span>
          </div>

          <div className="max-h-[760px] overflow-y-auto">
            {box.slots.map((slot) => {
              const cfg = SLOT_COLOR[slot.status]
              const isActive = activeSlot?.number === slot.number

              return (
                <button
                  key={slot.number}
                  type="button"
                  onClick={() => setSelected(slot)}
                  onMouseEnter={() => setHovered(slot)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 dark:border-zinc-700 ${
                    isActive
                      ? 'bg-blue-50/70 dark:bg-blue-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-zinc-700/40'
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xs font-semibold text-slate-400">
                    {slot.number}
                  </span>

                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: cfg.body }}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-800 dark:text-zinc-100">
                      {slot.subscriber ?? 'No subscriber'}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                      {slot.account_no ?? 'No account number'}
                    </p>
                  </div>

                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${cfg.soft} ${cfg.text} ring-1`}>
                    {cfg.label}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>
      </section>
    </div>
  )
}