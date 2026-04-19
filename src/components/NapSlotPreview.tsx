interface Slot {
  number: number
  status: 'occupied' | 'available' | 'reserved' | 'damaged'
  subscriber?: string
  account_no?: string
}

interface NapBoxInfo {
  id: string
  tag: string
  type: '8-port' | '16-port' | '24-port'
  owner: string
  city: string
  barangay: string
  status: string
  used_slots: number
  total_slots: number
  slots?: Slot[]
}

function generateSlots(box: NapBoxInfo): Slot[] {
  if (box.slots) return box.slots
  return Array.from({ length: box.total_slots }, (_, i) => ({
    number: i + 1,
    status: i < box.used_slots ? 'occupied' : 'available',
    subscriber: i < box.used_slots ? `SUB-${String(i + 1).padStart(3, '0')}` : undefined,
  }))
}

// SC/APC fiber connector visual per slot
function FiberPort({ slot, onHover, hovered }: {
  slot: Slot
  onHover: (s: Slot | null) => void
  hovered: Slot | null
}) {
  const isHovered = hovered?.number === slot.number

  const portStyle: Record<Slot['status'], { outer: string; inner: string; ferrule: string; glow: string }> = {
    occupied:  { outer: '#1a1a1a', inner: '#16a34a', ferrule: '#bbf7d0', glow: '0 0 8px 2px #16a34a99' },
    available: { outer: '#1a1a1a', inner: '#111827', ferrule: '#374151', glow: 'none' },
    reserved:  { outer: '#1a1a1a', inner: '#d97706', ferrule: '#fef3c7', glow: '0 0 8px 2px #d9770699' },
    damaged:   { outer: '#1a1a1a', inner: '#dc2626', ferrule: '#fee2e2', glow: '0 0 8px 2px #dc262699' },
  }

  const cfg = portStyle[slot.status]

  return (
    <div
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      title={`#${slot.number} – ${slot.status}${slot.subscriber ? ` – ${slot.subscriber}` : ''}`}
      style={{
        width: 38,
        height: 38,
        background: cfg.outer,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: isHovered ? `inset 0 0 0 1px #ffffff40, ${cfg.glow}` : 'inset 0 0 0 1px #ffffff15',
        transition: 'box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Port recess */}
      <div style={{
        width: 28,
        height: 28,
        background: '#0a0a0a',
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
      }}>
        {slot.status !== 'available' ? (
          // Connector body (SC-style square with ferrule)
          <div style={{
            width: 20,
            height: 20,
            background: cfg.inner,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: cfg.glow,
          }}>
            {/* Ferrule circle */}
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: cfg.ferrule,
              boxShadow: slot.status === 'occupied' ? '0 0 4px #bbf7d0' : 'none',
            }} />
          </div>
        ) : (
          // Empty hole
          <div style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#050505',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
          }} />
        )}
      </div>

      {/* Slot number label */}
      <div style={{
        position: 'absolute',
        bottom: 1,
        right: 3,
        fontSize: 8,
        color: '#ffffff50',
        fontFamily: 'monospace',
        lineHeight: 1,
      }}>
        {slot.number}
      </div>
    </div>
  )
}

const statusMeta = {
  occupied:  { label: 'Occupied',  bg: 'bg-green-500',  text: 'text-green-700',  light: 'bg-green-50',  ring: 'ring-green-200' },
  available: { label: 'Available', bg: 'bg-gray-400',   text: 'text-gray-600',   light: 'bg-gray-50',   ring: 'ring-gray-200' },
  reserved:  { label: 'Reserved',  bg: 'bg-amber-400',  text: 'text-amber-700',  light: 'bg-amber-50',  ring: 'ring-amber-200' },
  damaged:   { label: 'Damaged',   bg: 'bg-red-500',    text: 'text-red-700',    light: 'bg-red-50',    ring: 'ring-red-200' },
}

export default function NapSlotPreview({ box, onClose }: { box: NapBoxInfo; onClose: () => void }) {
  const slots = generateSlots(box)
  const cols  = box.type === '8-port' ? 4 : box.type === '16-port' ? 8 : 12
  const rows  = [slots.slice(0, cols), slots.slice(cols)]

  const counts = {
    occupied:  slots.filter(s => s.status === 'occupied').length,
    available: slots.filter(s => s.status === 'available').length,
    reserved:  slots.filter(s => s.status === 'reserved').length,
    damaged:   slots.filter(s => s.status === 'damaged').length,
  }

  const [hovered, setHovered] = React.useState<Slot | null>(null)

  return (
    <div className="flex flex-col gap-5">

      {/* Box meta */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Type',     value: box.type },
          { label: 'Owner',    value: box.owner },
          { label: 'Location', value: `${box.barangay}, ${box.city}` },
        ].map(m => (
          <div key={m.label} className="rounded-2xl bg-slate-50 dark:bg-zinc-700/50 py-2 px-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{m.label}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 truncate">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Physical panel */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-2">Panel View</p>

        {/* Chassis */}
        <div style={{
          background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
          borderRadius: 10,
          padding: '12px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          {/* Top rail */}
          <div style={{ height: 4, background: '#333', borderRadius: 2, marginBottom: 10 }} />

          {/* Slot rows */}
          <div className="flex flex-col gap-2">
            {rows.map((row, ri) => (
              <div key={ri} className="flex gap-1.5 justify-center">
                {row.map(slot => (
                  <FiberPort key={slot.number} slot={slot} onHover={setHovered} hovered={hovered} />
                ))}
              </div>
            ))}
          </div>

          {/* Bottom rail */}
          <div style={{ height: 4, background: '#333', borderRadius: 2, marginTop: 10 }} />

          {/* Chassis label */}
          <div className="flex items-center justify-between mt-2 px-1">
            <span style={{ fontSize: 9, color: '#ffffff30', fontFamily: 'monospace', letterSpacing: 2 }}>
              {box.id} · {box.tag}
            </span>
            <span style={{ fontSize: 9, color: '#ffffff30', fontFamily: 'monospace' }}>
              {box.type.toUpperCase()} SC/APC
            </span>
          </div>
        </div>

        {/* Hover tooltip */}
        <div className="mt-2 h-8 flex items-center">
          {hovered ? (
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusMeta[hovered.status].light} ${statusMeta[hovered.status].text} ${statusMeta[hovered.status].ring}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusMeta[hovered.status].bg}`} />
              Slot #{hovered.number} — {statusMeta[hovered.status].label}
              {hovered.subscriber && <span className="opacity-60">· {hovered.subscriber}</span>}
            </div>
          ) : (
            <p className="text-[11px] text-slate-300 dark:text-zinc-600 italic">Hover over a port to inspect</p>
          )}
        </div>
      </div>

      {/* Utilization bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Utilization</p>
          <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
            {counts.occupied} / {slots.length} slots used
          </span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden flex">
          {(['occupied', 'reserved', 'damaged'] as const).map(k => {
            const pct = (counts[k] / slots.length) * 100
            if (!pct) return null
            const colors = { occupied: 'bg-green-500', reserved: 'bg-amber-400', damaged: 'bg-red-500' }
            return <div key={k} className={`h-full ${colors[k]} transition-all`} style={{ width: `${pct}%` }} />
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([k, v]) => (
          <div key={k} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${statusMeta[k].light} ${statusMeta[k].text} ${statusMeta[k].ring}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta[k].bg}`} />
            {v} {statusMeta[k].label}
          </div>
        ))}
      </div>

      {/* Slot detail list */}
      {slots.some(s => s.status === 'occupied' || s.status === 'reserved') && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">Slot Details</p>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {slots.filter(s => s.status !== 'available').map(s => (
              <div key={s.number} className={`rounded-xl px-3 py-2 ring-1 ${statusMeta[s.status].light} ${statusMeta[s.status].ring}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusMeta[s.status].bg}`} />
                  <span className={`text-[10px] font-bold ${statusMeta[s.status].text}`}>Slot #{s.number}</span>
                </div>
                {s.subscriber && <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">{s.subscriber}</p>}
                {s.account_no && <p className="text-[9px] font-mono text-slate-400 dark:text-zinc-500">{s.account_no}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1 border-t border-slate-100 dark:border-zinc-700">
        <button onClick={onClose}
          className="h-9 rounded-xl border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 text-sm font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition">
          Close
        </button>
      </div>
    </div>
  )
}

// Need React for useState
import React from 'react'
