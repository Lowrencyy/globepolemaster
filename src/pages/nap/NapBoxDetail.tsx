import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getToken, GLOBE_API } from '../../lib/auth'

type PortStatus = 'active' | 'inactive' | 'free'
type NapBoxStatus = 'active' | 'inactive' | 'for_removal'
type PortCount = '8' | '12' | '16' | '32'

interface NapBarangay { code: string; name: string; city_code: string }
interface NapPole {
  id: number; pole_code: string; barangay_code: string
  lat: string; lng: string; globe_status: string | null
  barangay: NapBarangay
}
interface NapBox {
  id: number; pole_id: number; nap_code: string
  port_count: PortCount; status: NapBoxStatus
  deleted_at: string | null; created_at: string; updated_at: string
  pole?: NapPole
}
interface NapPort {
  id: number; nap_box_id: number; port_number: number
  status: PortStatus
  subscriber_id: string | null
  subscriber_name: string | null
  account_number: string | null
  surveyed_by: number | null; surveyed_at: string | null
  updated_by: number | null; created_at: string; updated_at: string
}

const PORT_COLOR: Record<PortStatus, { label: string; body: string; ferrule: string; glow: string; soft: string; text: string; dot: string }> = {
  active:   { label: 'Active',   body: '#dc2626', ferrule: '#fee2e2', glow: '0 0 10px 3px rgba(220,38,38,0.45)',  soft: 'bg-red-50 ring-red-100',        text: 'text-red-700',     dot: 'bg-red-500'     },
  inactive: { label: 'Inactive', body: '#d97706', ferrule: '#fef3c7', glow: '0 0 10px 3px rgba(217,119,6,0.40)',  soft: 'bg-amber-50 ring-amber-100',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  free:     { label: 'Free',     body: '#16a34a', ferrule: '#bbf7d0', glow: '0 0 10px 3px rgba(22,163,74,0.40)',  soft: 'bg-emerald-50 ring-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
}

const BOX_STATUS_BADGE: Record<NapBoxStatus, string> = {
  active:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/20',
  inactive:    'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-700/60 dark:text-zinc-300 dark:ring-zinc-600',
  for_removal: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-400 dark:ring-red-500/20',
}
const BOX_STATUS_LABEL: Record<NapBoxStatus, string> = {
  active: 'Active', inactive: 'Inactive', for_removal: 'For Removal',
}

const STATUS_CYCLE: Record<PortStatus, PortStatus> = {
  active: 'inactive',
  inactive: 'free',
  free: 'active',
}

function FiberPort({
  port, active, changed, onHover, onToggle,
}: {
  port: NapPort & { status: PortStatus }
  active: boolean; changed: boolean
  onHover: (p: NapPort | null) => void
  onToggle: (p: NapPort) => void
}) {
  const cfg = PORT_COLOR[port.status]
  return (
    <button
      type="button"
      title={`Port ${port.port_number} — ${cfg.label}. Click to change.`}
      onMouseEnter={() => onHover(port)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onToggle(port)}
      className="relative flex h-12 w-12 items-center justify-center rounded-md bg-[#101010] transition hover:-translate-y-0.5 active:scale-95"
      style={{ boxShadow: active ? `inset 0 0 0 1.5px rgba(255,255,255,0.35), ${cfg.glow}` : 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]">
        <div className="flex h-6 w-6 items-center justify-center rounded-[4px]" style={{ background: cfg.body, boxShadow: cfg.glow }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cfg.ferrule }} />
        </div>
      </div>
      <span className="absolute bottom-1 right-1.5 font-mono text-[8px] text-white/35">{port.port_number}</span>
      {changed && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#191919] bg-white" />}
    </button>
  )
}

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: string; accent: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">{label}</p>
            <p className="mt-2 truncate text-lg font-black text-slate-900 dark:text-zinc-100">{value}</p>
          </div>
          <i className={`${icon} text-lg text-slate-300 dark:text-zinc-600`} />
        </div>
      </div>
    </div>
  )
}

function PortCounter({ status, value }: { status: PortStatus; value: number }) {
  const cfg = PORT_COLOR[status]
  return (
    <div className={`rounded-2xl p-4 ring-1 ${cfg.soft}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{cfg.label}</p>
      </div>
      <p className={`mt-2 text-3xl font-black ${cfg.text}`}>{value}</p>
    </div>
  )
}

export default function NapBoxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [box, setBox]       = useState<NapBox | null>(null)
  const [ports, setPorts]   = useState<NapPort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [hovered, setHovered]   = useState<NapPort | null>(null)
  const [selected]              = useState<NapPort | null>(null)
  const [portStatuses, setPortStatuses] = useState<Record<number, PortStatus>>({})
  const [submitting, setSubmitting]     = useState(false)
  const [submitResult, setSubmitResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    const token = getToken()
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': '1',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`${GLOBE_API}/nap-boxes/${id}`, { headers }).then(r => r.json()),
      fetch(`${GLOBE_API}/nap-boxes/${id}/ports`, { headers }).then(r => r.json()),
    ])
      .then(([boxData, portsData]: [NapBox, NapPort[]]) => {
        setBox(boxData)
        setPorts(portsData)
        setPortStatuses(Object.fromEntries(portsData.map(p => [p.port_number, p.status])))
      })
      .catch(e => setError((e as Error).message ?? 'Failed to load NAP box'))
      .finally(() => setLoading(false))
  }, [id])

  const originalStatuses = useMemo(
    () => Object.fromEntries(ports.map(p => [p.port_number, p.status])),
    [ports]
  )

  const changedPorts = useMemo(
    () => Object.entries(portStatuses).filter(([num, st]) => originalStatuses[Number(num)] !== st),
    [portStatuses, originalStatuses]
  )

  const isDirty = changedPorts.length > 0

  const portsWithStatus = useMemo(
    () => ports.map(p => ({ ...p, status: portStatuses[p.port_number] ?? p.status })),
    [ports, portStatuses]
  )

  const counts = useMemo(() => ({
    active:   portsWithStatus.filter(p => p.status === 'active').length,
    inactive: portsWithStatus.filter(p => p.status === 'inactive').length,
    free:     portsWithStatus.filter(p => p.status === 'free').length,
  }), [portsWithStatus])

  const togglePort = (port: NapPort) => {
    setPortStatuses(prev => ({ ...prev, [port.port_number]: STATUS_CYCLE[prev[port.port_number] ?? port.status] }))
    setSubmitResult(null)
  }

  const handleSubmit = async () => {
    if (!box) return
    setSubmitting(true)
    setSubmitResult(null)
    const token = getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'ngrok-skip-browser-warning': '1',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    try {
      await Promise.all(
        changedPorts.map(([portNum, status]) =>
          fetch(`${GLOBE_API}/nap-boxes/${box.id}/ports/${portNum}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ status }),
          })
        )
      )
      setPorts(prev => prev.map(p => ({ ...p, status: portStatuses[p.port_number] ?? p.status })))
      setSubmitResult('success')
    } catch {
      setSubmitResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  const activePort = hovered ?? selected
  const totalPorts = box ? Number(box.port_count) : 0
  const cols = totalPorts <= 8 ? 4 : totalPorts <= 16 ? 8 : totalPorts <= 24 ? 12 : 16
  const row1 = portsWithStatus.slice(0, cols)
  const row2 = portsWithStatus.slice(cols)
  const usedCount = counts.active + counts.inactive
  const utilization = totalPorts > 0 ? Math.round((usedCount / totalPorts) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-400">
        <i className="bx bx-loader-alt bx-spin text-3xl mr-3" />Loading NAP box…
      </div>
    )
  }

  if (error || !box) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-red-500">
        <i className="bx bx-error text-4xl" />
        <p className="text-sm font-semibold">{error ?? 'NAP box not found'}</p>
        <button onClick={() => navigate('/nap/boxes')} className="mt-2 text-xs text-slate-500 underline">Back to list</button>
      </div>
    )
  }

  const overviewCards = [
    { label: 'Pole Code',    value: box.pole?.pole_code ?? '—',      icon: 'mdi mdi-anchor',         accent: 'from-violet-500 to-indigo-500' },
    { label: 'Port Count',   value: `${box.port_count}-port`,         icon: 'mdi mdi-chip',           accent: 'from-cyan-500 to-teal-500'    },
    { label: 'Barangay',     value: box.pole?.barangay?.name ?? '—', icon: 'mdi mdi-map-marker',     accent: 'from-pink-500 to-rose-500'    },
    { label: 'Latitude',     value: box.pole?.lat ?? '—',             icon: 'mdi mdi-crosshairs-gps', accent: 'from-emerald-500 to-teal-500' },
    { label: 'Longitude',    value: box.pole?.lng ?? '—',             icon: 'mdi mdi-crosshairs-gps', accent: 'from-sky-500 to-blue-500'     },
    { label: 'Utilization',  value: `${utilization}%`,                icon: 'mdi mdi-chart-line',     accent: 'from-amber-400 to-orange-500' },
  ]

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-4 px-0.5">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => navigate(-1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            <i className="mdi mdi-arrow-left text-lg" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-mono text-xl font-black text-slate-900 dark:text-zinc-100">{box.nap_code}</h4>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${BOX_STATUS_BADGE[box.status]}`}>{BOX_STATUS_LABEL[box.status]}</span>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-400 dark:text-zinc-500">
              {box.port_count}-port · Pole {box.pole?.pole_code ?? box.pole_id} · {box.pole?.barangay?.name ?? '—'}
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/nap/boxes')} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
          <i className="mdi mdi-view-grid-outline text-base" />All NAP Boxes
        </button>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {overviewCards.map(card => <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} accent={card.accent} />)}
      </div>

      <section className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5">
        <div className="flex flex-col gap-5">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">Port Summary</h3>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">Live port status count</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">{box.port_count}-port</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PortCounter status="active" value={counts.active} />
              <PortCounter status="inactive" value={counts.inactive} />
              <PortCounter status="free" value={counts.free} />
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-700">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-zinc-100">Fiber Panel View</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-400">Hover or select a port to inspect subscriber details</p>
              </div>
              <div className="flex items-center gap-4">
                {(['active', 'inactive', 'free'] as PortStatus[]).map(status => (
                  <span key={status} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PORT_COLOR[status].body }} />
                    {PORT_COLOR[status].label}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-6">
              <div className="rounded-[28px] border border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-6 dark:border-zinc-700 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
                <div className="mx-auto max-w-4xl">
                  <div className="rounded-[18px] bg-[#191919] p-6 shadow-[0_25px_70px_-25px_rgba(0,0,0,0.65)] ring-1 ring-black">
                    <div className="mb-5 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">{box.nap_code}</span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{box.port_count}-PORT</span>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex justify-center gap-4">
                        {row1.map(port => (
                          <FiberPort key={port.port_number} port={port} active={activePort?.port_number === port.port_number} changed={originalStatuses[port.port_number] !== portStatuses[port.port_number]} onHover={setHovered} onToggle={togglePort} />
                        ))}
                      </div>
                      {row2.length > 0 && (
                        <div className="flex justify-center gap-4">
                          {row2.map(port => (
                            <FiberPort key={port.port_number} port={port} active={activePort?.port_number === port.port_number} changed={originalStatuses[port.port_number] !== portStatuses[port.port_number]} onHover={setHovered} onToggle={togglePort} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-6">
                      <div className="mb-1.5 flex justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Utilization</span>
                        <span className="font-mono text-[10px] font-bold text-blue-200/80">{usedCount}/{totalPorts} ({utilization}%)</span>
                      </div>
                      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
                        {(['active', 'inactive'] as PortStatus[]).map(status => {
                          const cnt = status === 'active' ? counts.active : counts.inactive
                          const width = totalPorts > 0 ? (cnt / totalPorts) * 100 : 0
                          if (!width) return null
                          return <div key={status} className="h-full" style={{ width: `${width}%`, background: PORT_COLOR[status].body }} />
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-400 dark:bg-zinc-900 dark:text-zinc-500">
                    {activePort ? (
                      <span>
                        Port #{activePort.port_number} ·{' '}
                        <span className={PORT_COLOR[portStatuses[activePort.port_number] ?? activePort.status].text}>
                          {PORT_COLOR[portStatuses[activePort.port_number] ?? activePort.status].label}
                        </span>
                        {activePort.subscriber_name && ` · ${activePort.subscriber_name}`}
                        {activePort.account_number && ` · ${activePort.account_number}`}
                      </span>
                    ) : 'Click a port to toggle its status · Hover to inspect'}
                  </div>

                  {isDirty && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-500/20 dark:bg-violet-500/10">
                      <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-black text-white">{changedPorts.length}</span>
                          port{changedPorts.length > 1 ? 's' : ''} changed — ready to save
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setPortStatuses(Object.fromEntries(ports.map(p => [p.port_number, p.status]))); setSubmitResult(null) }} className="h-8 rounded-xl border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-600 transition hover:bg-violet-50 dark:border-violet-500/20 dark:bg-transparent dark:text-violet-300">Reset</button>
                        <button onClick={handleSubmit} disabled={submitting} className="h-8 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 disabled:opacity-60">{submitting ? 'Saving…' : 'Submit Changes'}</button>
                      </div>
                    </div>
                  )}
                  {submitResult === 'success' && (
                    <div className="mt-2 rounded-xl bg-emerald-50 px-4 py-2 text-center text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                      ✓ Port changes saved successfully.
                    </div>
                  )}
                  {submitResult === 'error' && (
                    <div className="mt-2 rounded-xl bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">
                      Failed to save. Check the API and try again.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-700">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">All Ports</h3>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">Subscriber and port state</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-zinc-700 dark:text-zinc-300">{ports.length} ports</span>
          </div>
          <div className="max-h-[760px] overflow-y-auto">
            {portsWithStatus.map(port => {
              const cfg = PORT_COLOR[port.status]
              const isActive = activePort?.port_number === port.port_number
              const isChanged = originalStatuses[port.port_number] !== portStatuses[port.port_number]
              return (
                <button
                  key={port.port_number}
                  type="button"
                  onClick={() => togglePort(port)}
                  onMouseEnter={() => setHovered(port)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 dark:border-zinc-700 ${isActive ? 'bg-blue-50/70 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-700/40'}`}
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xs font-semibold text-slate-400">{port.port_number}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cfg.body }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-800 dark:text-zinc-100">{port.subscriber_name ?? 'No subscriber'}</p>
                    <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{port.account_number ?? 'No account number'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${cfg.soft} ${cfg.text} ring-1`}>{cfg.label}</span>
                  {isChanged && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" title="Changed" />}
                </button>
              )
            })}
          </div>
        </aside>
      </section>
    </div>
  )
}
