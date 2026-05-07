import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface CableSlot {
  id: number
  slot_label: string
  occupied_by: 'skycable' | 'globe' | 'meralco' | 'others' | 'free'
  status: 'occupied' | 'pending_teardown' | 'free'
}

interface PolePhotos {
  before: string | null
  after: string | null
  pole_tag: string | null
}

interface PoleInfo {
  id: number
  pole_code: string
  lat?: string | null
  lng?: string | null
  skycable_status?: string
  barangay?: {
    name: string
    city?: { name: string; province?: { name: string } }
  }
  cable_slots: CableSlot[]
  photos?: PolePhotos
}

const SLOT_ORDER = ['C1', 'C2', 'C3', 'C4', 'C5', 'DA']

const OCCUPANT_META: Record<string, { label: string; color: string; bg: string; dot: string; ring: string }> = {
  skycable: { label: 'Skycable', color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-500/10',     dot: 'bg-blue-500',   ring: 'ring-blue-200 dark:ring-blue-500/20' },
  globe:    { label: 'Globe',    color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-50 dark:bg-green-500/10',   dot: 'bg-green-500',  ring: 'ring-green-200 dark:ring-green-500/20' },
  meralco:  { label: 'Meralco', color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-500/10', dot: 'bg-yellow-400', ring: 'ring-yellow-200 dark:ring-yellow-500/20' },
  others:   { label: 'Others',  color: 'text-slate-600 dark:text-slate-300',   bg: 'bg-slate-100 dark:bg-white/5',       dot: 'bg-slate-400',  ring: 'ring-slate-200 dark:ring-slate-500/20' },
  free:     { label: 'Free',    color: 'text-emerald-700 dark:text-emerald-300',bg: 'bg-emerald-50 dark:bg-emerald-500/10',dot: 'bg-emerald-400',ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
}

const POLE_STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  cleared:     { label: 'Completed',     dot: '#10b981', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20' },
  in_progress: { label: 'In Progress', dot: '#8b5cf6', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20' },
  pending:     { label: 'Pending',     dot: '#f59e0b', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20' },
}

function imgUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return path.startsWith('http') ? path : `${API_BASE}/api/v1/files/${path}`
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' }
}

/* ── Satellite map ───────────────────────────────────────────── */
function PoleMap({ lat, lng, poleCode }: { lat: number; lng: number; poleCode: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [lat, lng], zoom: 17,
      zoomControl: false, attributionControl: false, scrollWheelZoom: false,
    })
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const icon = L.divIcon({
      className: '',
      html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
               <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:pmpp 2s ease-in-out infinite;"></div>
               <div style="position:relative;width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.7);"></div>
             </div>
             <style>@keyframes pmpp{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.8);opacity:0}}</style>`,
      iconSize: [36, 36], iconAnchor: [18, 18],
    })
    L.marker([lat, lng], { icon })
      .addTo(map)
      .bindPopup(`<b style="font-family:monospace;font-size:12px">${poleCode}</b><br/><span style="font-size:10px;color:#64748b">${lat}, ${lng}</span>`,
        { closeButton: false, offset: [0, -14] })
      .openPopup()

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [lat, lng, poleCode])

  return <div ref={containerRef} className="h-60 w-full rounded-xl overflow-hidden" />
}

/* ── Photo card ──────────────────────────────────────────────── */
function PhotoCard({ src, label, icon }: { src: string | null | undefined; label: string; icon: string }) {
  const [lb, setLb] = useState(false)
  const url = imgUrl(src)

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <i className={`${icon} text-sm text-slate-400 dark:text-slate-500`} />
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</span>
        </div>
        <div className="relative flex-1 bg-slate-100 dark:bg-white/[0.03]" style={{ minHeight: 210 }}>
          {url ? (
            <img src={url} alt={label} onClick={() => setLb(true)}
              className="absolute inset-0 h-full w-full cursor-zoom-in object-cover transition hover:brightness-95"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 dark:text-slate-600">
              <i className="bx bx-image-alt text-4xl" />
              <p className="text-[10px] font-semibold uppercase tracking-wider">No Photo</p>
            </div>
          )}
        </div>
      </div>

      {lb && url && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={() => setLb(false)}>
          <img src={url} alt={label} className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLb(false)} className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white backdrop-blur transition hover:bg-white/20">×</button>
          <p className="absolute bottom-6 text-sm font-semibold text-white/70">{label}</p>
        </div>
      )}
    </>
  )
}

/* ── Main page ───────────────────────────────────────────────── */
export default function PoleDetail() {
  const { siteSlug = '', nodeSlug = '', poleCode = '' } = useParams()
  const [pole, setPole]       = useState<PoleInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!poleCode) return
    setLoading(true)
    fetch(`${SKYCABLE_API}/poles/code/${encodeURIComponent(poleCode)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d?.id) setPole(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [poleCode])

  const slots         = pole?.cable_slots ?? []
  const ordered       = SLOT_ORDER.map(l => slots.find(s => s.slot_label === l)).filter(Boolean) as CableSlot[]
  const extra         = slots.filter(s => !SLOT_ORDER.includes(s.slot_label))
  const allSlots      = [...ordered, ...extra]
  const psm           = POLE_STATUS[pole?.skycable_status ?? 'pending'] ?? POLE_STATUS.pending
  const locationParts = [pole?.barangay?.city?.province?.name, pole?.barangay?.city?.name, pole?.barangay?.name].filter(Boolean)
  const occupiedCount = allSlots.filter(s => s.occupied_by !== 'free').length
  const hasGps        = !!(pole?.lat && pole?.lng)
  const hasPhotos     = !!(pole?.photos?.before || pole?.photos?.after || pole?.photos?.pole_tag)

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to={`/${siteSlug}`} className="transition hover:text-blue-600 dark:hover:text-blue-400">Nodes</Link>
        <svg className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/${siteSlug}/${nodeSlug}/poles`} className="transition hover:text-blue-600 dark:hover:text-blue-400">Poles</Link>
        <svg className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
          {loading ? '…' : (pole?.pole_code ?? poleCode)}
        </span>
      </nav>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-32 text-sm text-slate-400">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500 dark:border-blue-500/10 dark:border-t-blue-400" />
          Loading pole…
        </div>
      ) : !pole ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <i className="bx bx-error-circle text-4xl" />
          <p className="text-sm font-semibold">Pole not found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">

          {/* ══ HEADER CARD ══════════════════════════════════════════════ */}
          <div className="relative overflow-hidden rounded-[26px] bg-[#071e3d] shadow-[0_20px_60px_-16px_rgba(7,30,61,0.6)]">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

            <div className="relative px-7 py-6">
              {/* Top row: identity + badges */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-400">
                    Globe Telecom · Skycable Teardown
                  </p>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                      <i className="bx bx-git-commit text-lg text-white" />
                    </div>
                    <div>
                      <h2 className="font-mono text-[28px] font-black leading-none tracking-tight text-white">
                        {pole.pole_code}
                      </h2>
                      {locationParts.length > 0 && (
                        <p className="mt-1 text-[13px] text-blue-200/70">{locationParts.join(' › ')}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-black ${psm.badge}`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: psm.dot }} />
                    {psm.label}
                  </span>
                  {hasGps && (
                    <a href={`https://maps.google.com/?q=${pole.lat},${pole.lng}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[11px] font-bold text-white/75 ring-1 ring-white/15 transition hover:bg-white/18 hover:text-white"
                    >
                      <i className="bx bx-map-pin text-sm" />
                      View on Maps
                    </a>
                  )}
                </div>
              </div>

              {/* Stats strip */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Slots',  value: String(allSlots.length) },
                  { label: 'Occupied',     value: String(occupiedCount) },
                  { label: 'Free',         value: String(allSlots.length - occupiedCount) },
                  { label: 'GPS',          value: hasGps ? 'Tagged' : 'No GPS' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-300/70">{item.label}</p>
                    <p className="mt-1 font-mono text-sm font-black text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Coordinates */}
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {[{ label: 'Latitude', value: pole.lat }, { label: 'Longitude', value: pole.lng }].map(c => (
                  <div key={c.label} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3.5 py-2 ring-1 ring-white/10">
                    <i className="bx bx-current-location text-sky-400 text-sm" />
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-blue-300/60">{c.label}</p>
                      <p className="font-mono text-[12px] font-black text-white">{c.value ?? '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══ CONTENT GRID ════════════════════════════════════════════ */}
          <div className="grid gap-5 lg:grid-cols-3">

            {/* Photos — left 2/3 */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <h3 className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                <span className="inline-block h-3.5 w-0.5 rounded-full bg-blue-400" />
                Teardown Photos
              </h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <PhotoCard src={pole.photos?.before}   label="Before"   icon="bx bx-image" />
                <PhotoCard src={pole.photos?.after}    label="After"    icon="bx bx-image-alt" />
                <PhotoCard src={pole.photos?.pole_tag} label="Pole Tag" icon="bx bx-purchase-tag" />
              </div>

              {/* No-photos empty state */}
              {!hasPhotos && (
                <div className="overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex flex-col items-center gap-1.5 py-5 text-center">
                    <i className="bx bx-camera-off text-2xl text-slate-300 dark:text-slate-600" />
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500">No teardown photos submitted yet.</p>
                  </div>
                  {hasGps ? (
                    <div className="px-4 pb-4">
                      <PoleMap lat={Number(pole.lat)} lng={Number(pole.lng)} poleCode={pole.pole_code} />
                      <p className="mt-2 text-center font-mono text-[11px] text-slate-400 dark:text-slate-500">{pole.lat}, {pole.lng}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 pb-6 text-slate-300 dark:text-slate-600">
                      <i className="bx bx-map-alt text-3xl" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider">No GPS coordinates tagged</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cable Slots — right 1/3 */}
            <div className="flex flex-col gap-4">
              <h3 className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                <span className="inline-block h-3.5 w-0.5 rounded-full bg-violet-400" />
                Cable Slots
              </h3>

              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
                {allSlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
                    <i className="bx bx-plug text-3xl" />
                    <p className="text-xs font-semibold">No slots configured</p>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="grid grid-cols-[40px_1fr_64px] border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Slot</span>
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Occupied By</span>
                      <span className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Status</span>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-slate-50 dark:divide-white/[0.06]">
                      {allSlots.map(slot => {
                        const occ       = OCCUPANT_META[slot.occupied_by] ?? OCCUPANT_META.free
                        const isPending = slot.status === 'pending_teardown'

                        return (
                          <div key={slot.id} className="grid grid-cols-[40px_1fr_64px] items-center px-4 py-3">
                            {/* Slot label */}
                            <span className="font-mono text-[12px] font-black text-slate-500 dark:text-slate-400">
                              {slot.slot_label}
                            </span>

                            {/* Occupant */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${occ.dot}`} />
                                <span className={`text-[12px] font-bold ${occ.color}`}>{occ.label}</span>
                              </div>
                              {isPending && (
                                <p className="text-[10px] font-semibold text-amber-500 dark:text-amber-400">Pending Teardown</p>
                              )}
                            </div>

                            {/* Status badge */}
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${occ.bg} ${occ.color} ${occ.ring}`}>
                                {slot.occupied_by === 'free' ? 'Free' : 'Used'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Legend */}
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Legend</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(OCCUPANT_META).map(([key, m]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{m.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
