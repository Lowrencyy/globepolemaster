import { useEffect, useRef, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { getToken, API_BASE } from '../../lib/auth'
import telcoImg from '../../assets/images/telco.png'

const SKYCABLE_API = `${API_BASE}/api/v1/skycable`
const ADMIN_API    = `${API_BASE}/api/v1/admin`

// ── Equipment package volumes (L×W×H → m³) ───────────────────────────────
const EQUIP: Record<string, { unitVolume: number; label: string; dims: string }> = {
  amplifier:    { unitVolume: 0.0054,  label: 'Amplifier',      dims: '250×180×120 mm' },
  node:         { unitVolume: 0.0131,  label: 'Node',   dims: '350×250×150 mm' },
  extender:     { unitVolume: 0.0216,  label: 'Amplifier', dims: '400×300×180 mm' },
  tsc:          { unitVolume: 0.76,    label: 'TSC',            dims: '—' },
  powersupply:  { unitVolume: 0.003,   label: 'Power Supply',   dims: '200×150×100 mm' },
  power_supply: { unitVolume: 0.003,   label: 'Power Supply',   dims: '200×150×100 mm' },
  psu:          { unitVolume: 0.003,   label: 'Power Supply',   dims: '200×150×100 mm' },
  ps_housing:   { unitVolume: 0.009,   label: 'PS Housing',     dims: '300×200×150 mm' },
  psu_case:     { unitVolume: 0.009,   label: 'PSU Case',       dims: '300×200×150 mm' },
}

function eqInfo(t: string) { return EQUIP[String(t).toLowerCase()] ?? null }

function getStoredH(id: number): number {
  const v = localStorage.getItem(`wh_h_${id}`)
  return v ? (parseFloat(v) || 3) : 3
}
function saveStoredH(id: number, h: number) {
  localStorage.setItem(`wh_h_${id}`, String(h))
}

// ── Types ──────────────────────────────────────────────────────────────────
type StockEntry = {
  item_type: string
  quantity: number
  unit?: string | null
  node_id?: number | null
  node?: { id: number; name: string; full_label?: string } | null
}

type Warehouse = {
  id: number
  name: string
  type?: string | null
  sqm?: number | null
  status: 'active' | 'inactive'
  lat?: number | null
  lng?: number | null
  subcontractor_id: number
  subcontractor?: { id: number; name: string }
  stocks?: StockEntry[]
}

type Subcontractor = { id: number; name: string }

type NodeItem = {
  id: number
  name: string
  full_label?: string
  area?: { id: number; name: string } | null
  site?: { id: number; name: string } | null
}

type WForm = {
  name: string; sqm: string; usable_height: string
  status: 'active' | 'inactive'; type: string
  subcontractor_id: string; lat: number | null; lng: number | null
}

function emptyForm(): WForm {
  return { name: '', sqm: '', usable_height: '3', status: 'active', type: '', subcontractor_id: '', lat: null, lng: null }
}

function whPct(wh: Warehouse) {
  const cap = (wh.sqm ?? 0) * getStoredH(wh.id)
  if (cap <= 0) return 0
  const occ = (wh.stocks ?? []).reduce((a, s) => {
    const info = eqInfo(s.item_type)
    return a + (info && info.unitVolume > 0 ? s.quantity * info.unitVolume : 0)
  }, 0)
  return Math.min(100, (occ / cap) * 100)
}

// ── Map picker ─────────────────────────────────────────────────────────────
function MapPicker({ lat, lng, onChange }: {
  lat: number | null; lng: number | null; onChange: (la: number, ln: number) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mrkRef = useRef<any>(null)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    function init() {
      if (!divRef.current || mapRef.current) return
      const L = (window as any).L
      if (!L) return
      const center: [number, number] = lat && lng ? [lat, lng] : [14.58, 121.0]
      const map = L.map(divRef.current).setView(center, lat && lng ? 15 : 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map)
      if (lat && lng) mrkRef.current = L.marker([lat, lng]).addTo(map)
      map.on('click', (e: any) => {
        const { lat: la, lng: ln } = e.latlng
        if (mrkRef.current) mrkRef.current.setLatLng([la, ln])
        else mrkRef.current = L.marker([la, ln]).addTo(map)
        onChange(la, ln)
      })
      mapRef.current = map
      timers.push(setTimeout(() => map.invalidateSize(), 100))
      timers.push(setTimeout(() => map.invalidateSize(), 400))
    }
    function tryInit() {
      if ((window as any).L) { timers.push(setTimeout(init, 80)) }
      else if (!document.getElementById('leaflet-css')) {
        const css = document.createElement('link')
        css.id = 'leaflet-css'; css.rel = 'stylesheet'
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(css)
        const js = document.createElement('script')
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        js.onload = () => timers.push(setTimeout(init, 80))
        document.head.appendChild(js)
      } else {
        const poll = setInterval(() => { if ((window as any).L) { clearInterval(poll); timers.push(setTimeout(init, 80)) } }, 100)
        timers.push(poll as any)
      }
    }
    tryInit()
    return () => {
      timers.forEach(clearTimeout)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; mrkRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div style={{ borderRadius: 12, overflow: 'hidden', height: 200 }}>
        <div ref={divRef} style={{ height: '100%', width: '100%', position: 'relative' }} />
      </div>
      {lat && lng
        ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">📍 {lat.toFixed(6)}, {lng.toFixed(6)}</p>
        : <p className="mt-1 text-xs text-gray-400">Click map to drop a pin</p>}
    </div>
  )
}

// ── Form helpers ───────────────────────────────────────────────────────────
const iCls = 'h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-medium outline-none border border-slate-200/80 transition-all focus:border-green-400 focus:bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-white dark:focus:border-indigo-500'
const iClsSelect = iCls + ' pr-8'

function FL({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function CapHint({ sqm, height }: { sqm: string; height: string }) {
  const cap = (Number(sqm) || 0) * (parseFloat(height) || 0)
  if (cap <= 0) return null
  return (
    <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40">
      <i className="bx bx-cube text-green-600 dark:text-green-400 text-sm" />
      <span className="text-xs text-green-700 dark:text-green-300">Total Capacity: <b className="font-black">{cap.toFixed(1)} m³</b></span>
    </div>
  )
}

// ── Add modal ──────────────────────────────────────────────────────────────
function AddModal({ subs, onClose, onSaved }: {
  subs: Subcontractor[]
  onClose: () => void
  onSaved: (id?: number, h?: number) => void
}) {
  const [form, setForm] = useState<WForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof WForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!form.subcontractor_id) { setErr('Select a subcontractor.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`${SKYCABLE_API}/warehouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({
          name: form.name.trim(), subcontractor_id: Number(form.subcontractor_id),
          type: form.type.trim() || undefined, sqm: form.sqm ? Number(form.sqm) : undefined,
          status: form.status, lat: form.lat ?? undefined, lng: form.lng ?? undefined,
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.message ?? `HTTP ${res.status}`) }
      const created = await res.json().catch(() => null)
      const newId = created?.id ?? created?.data?.id
      onSaved(newId, parseFloat(form.usable_height) || 3)
      onClose()
    } catch (e: any) { setErr(e?.message ?? 'Failed to create.') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200/60 dark:border-zinc-800">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-600 text-white shadow-[0_8px_20px_-8px_rgba(22,163,74,0.7)]">
              <i className="bx bx-plus text-xl" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">New Warehouse</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Define location and storage capacity</p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 px-3 py-2.5">
              <i className="bx bx-error-circle text-rose-500 text-sm" />
              <span className="text-sm text-rose-700 dark:text-rose-400">{err}</span>
            </div>
          )}
          <FL label="Subcontractor *">
            <select className={iClsSelect} value={form.subcontractor_id} onChange={e => set('subcontractor_id', e.target.value)} required>
              <option value="">— select —</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FL>
          <FL label="Warehouse Name *">
            <input className={iCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Cubao Warehouse" required />
          </FL>
          <div className="grid grid-cols-2 gap-3">
            <FL label="Type"><input className={iCls} value={form.type} onChange={e => set('type', e.target.value)} placeholder="main, staging…" /></FL>
            <FL label="Status">
              <select className={iClsSelect} value={form.status} onChange={e => set('status', e.target.value as any)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FL>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-700 p-4 space-y-3 bg-slate-50/60 dark:bg-zinc-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <i className="bx bx-cube text-sm" /> Capacity Setup
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FL label="Floor Area (sqm) *">
                <input type="number" min="0" step="0.1" className={iCls} value={form.sqm} onChange={e => set('sqm', e.target.value)} placeholder="60" required />
              </FL>
              <FL label="Usable Height (m) *">
                <input type="number" min="0.1" max="50" step="0.1" className={iCls} value={form.usable_height} onChange={e => set('usable_height', e.target.value)} placeholder="3" required />
              </FL>
            </div>
            <CapHint sqm={form.sqm} height={form.usable_height} />
          </div>

          <FL label="Location (click map)">
            <MapPicker lat={form.lat} lng={form.lng} onChange={(la, ln) => { set('lat', la); set('lng', ln) }} />
          </FL>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 h-10 rounded-2xl bg-green-600 text-sm font-black text-white shadow-[0_18px_35px_-18px_rgba(22,163,74,0.85)] hover:bg-green-700 hover:-translate-y-0.5 disabled:opacity-60 transition">
              {saving ? 'Creating…' : 'Create Warehouse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({ wh, onClose, onSaved }: {
  wh: Warehouse; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<WForm>({
    name: wh.name, sqm: wh.sqm != null ? String(wh.sqm) : '',
    usable_height: String(getStoredH(wh.id)), status: wh.status,
    type: wh.type ?? '', subcontractor_id: String(wh.subcontractor_id),
    lat: wh.lat ?? null, lng: wh.lng ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof WForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch(`${SKYCABLE_API}/warehouses/${wh.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({
          name: form.name.trim(), type: form.type.trim() || undefined,
          sqm: form.sqm ? Number(form.sqm) : null, status: form.status,
          lat: form.lat, lng: form.lng,
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.message ?? `HTTP ${res.status}`) }
      const h = parseFloat(form.usable_height)
      if (h > 0) saveStoredH(wh.id, h)
      onSaved(); onClose()
    } catch (e: any) { setErr(e?.message ?? 'Failed to update.') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200/60 dark:border-zinc-800">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-[0_8px_20px_-8px_rgba(245,158,11,0.7)]">
              <i className="bx bx-edit text-lg" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Edit Warehouse</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">{wh.name}</p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 px-3 py-2.5">
              <i className="bx bx-error-circle text-rose-500 text-sm" />
              <span className="text-sm text-rose-700 dark:text-rose-400">{err}</span>
            </div>
          )}
          <FL label="Warehouse Name *">
            <input className={iCls} value={form.name} onChange={e => set('name', e.target.value)} required />
          </FL>
          <div className="grid grid-cols-2 gap-3">
            <FL label="Type"><input className={iCls} value={form.type} onChange={e => set('type', e.target.value)} placeholder="main, staging…" /></FL>
            <FL label="Status">
              <select className={iClsSelect} value={form.status} onChange={e => set('status', e.target.value as any)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FL>
          </div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-700 p-4 space-y-3 bg-slate-50/60 dark:bg-zinc-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <i className="bx bx-cube text-sm" /> Capacity Setup
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FL label="Floor Area (sqm)">
                <input type="number" min="0" step="0.1" className={iCls} value={form.sqm} onChange={e => set('sqm', e.target.value)} placeholder="60" />
              </FL>
              <FL label="Usable Height (m)">
                <input type="number" min="0.1" max="50" step="0.1" className={iCls} value={form.usable_height} onChange={e => set('usable_height', e.target.value)} placeholder="3" />
              </FL>
            </div>
            <CapHint sqm={form.sqm} height={form.usable_height} />
          </div>
          <FL label="Location (click map to change)">
            <MapPicker lat={form.lat} lng={form.lng} onChange={(la, ln) => { set('lat', la); set('lng', ln) }} />
          </FL>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 h-10 rounded-2xl bg-amber-500 text-sm font-black text-white shadow-[0_18px_35px_-18px_rgba(245,158,11,0.7)] hover:bg-amber-600 hover:-translate-y-0.5 disabled:opacity-60 transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── Stat card ──────────────────────────────────────────────────────────────
function Stat({ label, icon, value, unit, color }: { label: string; icon: string; value: string; unit: string; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-3.5 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
      {/* Subtle color wash */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `${color}07` }} />
      {/* Left accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ backgroundColor: color }} />
      <div className="relative pl-1">
        <div className="flex items-start justify-between gap-1 mb-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 leading-tight">{label}</p>
          <div className="flex h-6 w-6 items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: color + '18' }}>
            <i className={`bx ${icon} text-xs`} style={{ color }} />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-black font-mono leading-none" style={{ color }}>{value}</span>
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 leading-none">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ── Warehouse card thumbnail (static satellite tile, no Leaflet) ─────────────
const TILE_PX = 256
function latLngToTile(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z)
  const xFrac = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { xFrac, yFrac, tileX: Math.floor(xFrac), tileY: Math.floor(yFrac) }
}

function WarehouseCardMap({ lat, lng, name }: { lat: number | null; lng: number | null; name: string }) {
  const CARD_H = 130
  const zoom   = 15
  if (!lat || !lng) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
        <img src={telcoImg} alt="Telcovantage" className="w-full object-contain p-4 opacity-40" style={{ height: CARD_H }} />
      </div>
    )
  }
  const { xFrac, yFrac, tileX, tileY } = latLngToTile(lat, lng, zoom)
  const W     = 280
  const scale = Math.max(W / TILE_PX, CARD_H / TILE_PX)
  const imgW  = TILE_PX * scale
  const imgH  = TILE_PX * scale
  const offX  = W / 2 - (xFrac - tileX) * imgW
  const offY  = CARD_H / 2 - (yFrac - tileY) * imgH
  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ height: CARD_H, background: '#1a1a2e' }}>
      {[-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => (
        <img key={`${dx}-${dy}`} src={`https://mt1.google.com/vt/lyrs=s&x=${tileX+dx}&y=${tileY+dy}&z=${zoom}`}
          alt="" draggable={false}
          style={{ position: 'absolute', left: offX + dx * imgW, top: offY + dy * imgH, width: imgW, height: imgH, userSelect: 'none' }} />
      )))}
      {/* Marker dot */}
      <div style={{ position: 'absolute', left: W / 2 - 6, top: CARD_H / 2 - 6, width: 12, height: 12,
        borderRadius: '50%', background: '#10b981', border: '2px solid #fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)', zIndex: 2 }} />
      {/* Label */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '3px 8px', zIndex: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{name}</span>
      </div>
    </div>
  )
}

// ── Warehouse location map ───────────────────────────────────────────────────
function WarehouseMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    function init() {
      if (!divRef.current || mapRef.current) return
      const L = (window as any).L
      if (!L) { timers.push(setTimeout(init, 300)); return }
      const map = L.map(divRef.current, { zoomControl: true, scrollWheelZoom: false })
        .setView([lat, lng], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#10b981;border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      L.marker([lat, lng], { icon }).addTo(map).bindPopup(`<b>${name}</b>`).openPopup()
      mapRef.current = map
    }
    timers.push(setTimeout(init, 50))
    return () => { timers.forEach(clearTimeout); mapRef.current?.remove(); mapRef.current = null }
  }, [lat, lng, name])

  return <div ref={divRef} style={{ height: 220 }} className="w-full" />
}

// ── Warehouse detail (right panel) ─────────────────────────────────────────
function WhDetail({ wh, onEdit }: { wh: Warehouse; onEdit: () => void }) {
  const [height, setHeight] = useState(String(getStoredH(wh.id)))
  const [_editH, setEditH] = useState(false)
  const [tempH, setTempH] = useState(height)
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)

  useEffect(() => {
    setNodes([])
    setNodesLoading(true)
    fetch(`${SKYCABLE_API}/nodes?subcontractor_id=${wh.subcontractor_id}&per_page=200`, {
      headers: { Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': '1' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setNodes(Array.isArray(d) ? d : (d.data ?? [])) })
      .catch(() => {})
      .finally(() => setNodesLoading(false))
  }, [wh.subcontractor_id])

  useEffect(() => {
    const h = String(getStoredH(wh.id))
    setHeight(h); setTempH(h); setEditH(false)
  }, [wh.id])

  const sqm = wh.sqm ?? 0
  const h = parseFloat(height) || 3
  const totalCap = sqm * h

  const rows = useMemo(() => (wh.stocks ?? []).map(s => {
    const info = eqInfo(s.item_type)
    const totalVol = info && info.unitVolume > 0 ? s.quantity * info.unitVolume : null
    return { ...s, info, totalVol }
  }), [wh.stocks])

  // warehouse-level material totals by normalised type key
  const warehouseTypeTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    ;(wh.stocks ?? []).forEach(s => {
      const key = String(s.item_type ?? '').toLowerCase()
      const normalised =
        key === 'psu' || key === 'power_supply' ? 'powersupply' :
        key === 'psu_case' || key === 'ps_housing' ? 'powersupply_case' : key
      totals[normalised] = (totals[normalised] ?? 0) + s.quantity
    })
    return totals
  }, [wh.stocks])

  const hasAnyStock = Object.values(warehouseTypeTotals).some(v => v > 0)

  // per-node stock contribution (kept for share bar only)
  const nodeStocks = useMemo(() => {
    const map = new Map<number, { qty: number; vol: number }>()
    ;(wh.stocks ?? []).forEach(s => {
      if (s.node_id == null) return
      const info = eqInfo(s.item_type)
      const vol = info ? s.quantity * info.unitVolume : 0
      const prev = map.get(s.node_id) ?? { qty: 0, vol: 0 }
      map.set(s.node_id, { qty: prev.qty + s.quantity, vol: prev.vol + vol })
    })
    return map
  }, [wh.stocks])


  const occupiedVol = rows.reduce((a, r) => a + (r.totalVol ?? 0), 0)
  const availableVol = Math.max(0, totalCap - occupiedVol)
  const pct = totalCap > 0 ? (occupiedVol / totalCap) * 100 : 0
  const overCap = totalCap > 0 && occupiedVol > totalCap
  const nearCap = pct >= 90 && !overCap
  const fillColor = pct >= 91 ? '#ef4444' : pct >= 71 ? '#f59e0b' : '#10b981'

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4 pb-10">

        {/* Detail header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Selected Warehouse
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white truncate">{wh.name}</h2>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black ring-1 ${
                wh.status === 'active'
                  ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-900/30'
                  : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-zinc-700 dark:text-slate-400 dark:ring-zinc-600'
              }`}>{wh.status}</span>
            </div>
            <p className="text-sm font-bold text-slate-500 dark:text-zinc-400 mt-1 flex flex-wrap gap-x-2">
              <span>{wh.subcontractor?.name ?? `Subcon #${wh.subcontractor_id}`}</span>
              {wh.type && <span className="capitalize">· {wh.type}</span>}
              {wh.lat != null && wh.lng != null && <span className="font-mono text-xs">· {wh.lat.toFixed(5)}, {wh.lng.toFixed(5)}</span>}
            </p>
          </div>
          <button onClick={onEdit}
            className="shrink-0 inline-flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-xs font-black text-slate-600 dark:text-slate-300 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] hover:border-amber-300 hover:text-amber-600 transition">
            <i className="bx bx-edit text-base" /> Edit
          </button>
        </div>

        {/* Storage card — scale bar + key numbers */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
          {/* Top strip */}
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${fillColor}88 0%, ${fillColor} 100%)` }} />

          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Storage Utilization</p>
                <p className="text-4xl font-black font-mono leading-none" style={{ color: fillColor }}>
                  {totalCap > 0 ? `${pct.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: fillColor + '40', backgroundColor: fillColor + '12' }}>
                  <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: fillColor }} />
                  <span className="text-xs font-black tracking-wider" style={{ color: fillColor }}>
                    {pct >= 91 ? 'CRITICAL' : pct >= 71 ? 'NEAR FULL' : totalCap > 0 ? 'OK' : 'NO SETUP'}
                  </span>
                </div>
                {totalCap > 0 && (
                  <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    {occupiedVol.toFixed(3)} / {totalCap.toFixed(1)} m³
                  </p>
                )}
              </div>
            </div>

            {/* Bar */}
            <div className="relative h-8 rounded-2xl overflow-hidden bg-slate-100 dark:bg-zinc-800 mb-4">
              <div className="absolute left-0 top-0 h-full" style={{ width: '70%', background: 'rgba(16,185,129,0.10)' }} />
              <div className="absolute top-0 h-full" style={{ left: '70%', width: '20%', background: 'rgba(245,158,11,0.10)' }} />
              <div className="absolute top-0 h-full" style={{ left: '90%', width: '10%', background: 'rgba(239,68,68,0.10)' }} />
              <div className="absolute left-0 top-0 h-full transition-all duration-700 ease-out rounded-2xl"
                style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${fillColor}99, ${fillColor})` }} />
              {/* Divider lines */}
              <div className="absolute top-0 bottom-0 w-px" style={{ left: '70%', background: 'rgba(245,158,11,0.5)' }} />
              <div className="absolute top-0 bottom-0 w-px" style={{ left: '90%', background: 'rgba(239,68,68,0.5)' }} />
              {/* Zone labels inside bar */}
              <div className="absolute top-0 h-full flex items-center px-1.5" style={{ left: '70%' }}>
                <span className="text-[9px] font-black" style={{ color: '#f59e0b' }}>71%</span>
              </div>
              <div className="absolute top-0 h-full flex items-center px-1.5" style={{ left: '90%' }}>
                <span className="text-[9px] font-black" style={{ color: '#ef4444' }}>91%</span>
              </div>
              {/* Current pct label */}
              {pct > 6 && (
                <div className="absolute left-3 top-0 h-full flex items-center">
                  <span className="text-xs font-black text-white drop-shadow">{pct.toFixed(1)}%</span>
                </div>
              )}
            </div>

            {/* Zone legend + volume stats in one row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-4 text-[10px]">
                {([
                  { color: '#10b981', label: 'Safe', range: '0–70%' },
                  { color: '#f59e0b', label: 'Near Full', range: '71–90%' },
                  { color: '#ef4444', label: 'Critical', range: '91–100%' },
                ] as const).map(z => (
                  <span key={z.label} className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: z.color, opacity: 0.8 }} />
                    <span className="text-slate-500 dark:text-slate-400">{z.label} <b className="text-slate-600 dark:text-slate-300">{z.range}</b></span>
                  </span>
                ))}
              </div>
              {totalCap > 0 && (
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-slate-400">Free: <b className="text-green-600 dark:text-green-400">{availableVol.toFixed(2)} m³</b></span>
                  <span className="text-slate-300 dark:text-zinc-600">|</span>
                  <span className="text-slate-400">Cap: <b className="text-slate-600 dark:text-slate-300">{totalCap.toFixed(1)} m³</b></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stat widgets */}
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Total Capacity" icon="bx-cube" value={totalCap > 0 ? totalCap.toFixed(1) : '—'} unit="m³" color="#0ea5e9" />
          <Stat label="Occupied" icon="bx-box" value={occupiedVol > 0 ? occupiedVol.toFixed(3) : '0'} unit="m³" color={fillColor} />
          <Stat label="Available" icon="bx-check-shield" value={totalCap > 0 ? availableVol.toFixed(3) : '—'} unit="m³" color="#10b981" />
          <Stat label="Utilization" icon="bx-trending-up" value={totalCap > 0 ? `${pct.toFixed(1)}%` : '—'} unit="of capacity" color={fillColor} />
        </div>

        {/* Warehouse location map */}
        {wh.lat != null && wh.lng != null && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-zinc-800">
              <i className="bx bx-map-pin text-slate-400 text-sm" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Warehouse Location</p>
              <span className="ml-auto text-[10px] font-mono text-slate-400">{wh.lat.toFixed(5)}, {wh.lng.toFixed(5)}</span>
            </div>
            <WarehouseMap lat={wh.lat} lng={wh.lng} name={wh.name} />
          </div>
        )}

        {/* Assigned Nodes */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-zinc-800">
            <i className="bx bx-sitemap text-slate-400 dark:text-slate-500 text-sm" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Assigned Nodes
            </p>
            <span className="ml-auto rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
              {nodesLoading ? '…' : nodes.length}
            </span>
          </div>
          {nodesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <i className="bx bx-network-chart text-3xl text-slate-200 dark:text-zinc-700" />
              <p className="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">No nodes assigned</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
              {nodes.map(n => {
                const MAT = [
                  { key: 'cable',       label: 'Cable', cls: 'border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20', val: 'text-emerald-600 dark:text-emerald-400' },
                  { key: 'node',        label: 'Node',  cls: 'border-blue-100 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20',             val: 'text-blue-600 dark:text-blue-400'       },
                  { key: 'amplifier',   label: 'Amp',   cls: 'border-violet-100 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20',     val: 'text-violet-600 dark:text-violet-400'   },
                  { key: 'extender',    label: 'Ext',   cls: 'border-teal-100 bg-teal-50/70 dark:border-teal-900/40 dark:bg-teal-950/20',             val: 'text-teal-600 dark:text-teal-400'       },
                  { key: 'tsc',         label: 'TSC',   cls: 'border-amber-100 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20',         val: 'text-amber-600 dark:text-amber-400'     },
                  { key: 'powersupply', label: 'PSU',   cls: 'border-red-100 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/20',                 val: 'text-red-500 dark:text-red-400'         },
                ]
                return (
                  <article key={n.id} className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/30 p-3.5 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl dark:hover:border-blue-500">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-sky-400 opacity-0 transition group-hover:opacity-100" />

                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100 leading-tight">
                          {n.full_label ?? n.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-400 truncate">
                          {n.area?.name ?? `#${n.id}`}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                        View
                        <svg className="h-3 w-3 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>

                    {/* Map thumbnail */}
                    <div className="mt-3">
                      <WarehouseCardMap lat={wh.lat ?? null} lng={wh.lng ?? null} name={n.full_label ?? n.name} />
                    </div>

                    {/* Material stat boxes */}
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {MAT.map(t => {
                        const qty = warehouseTypeTotals[t.key] ?? 0
                        if (qty === 0) return null
                        return (
                          <div key={t.key} className={`rounded-xl border px-1.5 py-2 text-center ${t.cls}`}>
                            <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-400">{t.label}</p>
                            <p className={`mt-1 text-sm font-bold ${t.val}`}>{qty.toLocaleString()}</p>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                )
              })}
            </div>
          )
          }
        </div>

        {/* Warnings */}
        {overCap && (
          <div className="flex items-start gap-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 px-4 py-3">
            <i className="bx bx-error text-rose-500 text-xl shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-rose-700 dark:text-rose-400">Over Capacity!</p>
              <p className="text-xs text-rose-600/80 dark:text-rose-400/70 mt-0.5">
                Inventory exceeds capacity by <b>{(occupiedVol - totalCap).toFixed(3)} m³</b>. Reduce inventory or increase warehouse dimensions.
              </p>
            </div>
          </div>
        )}
        {nearCap && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-4 py-3">
            <i className="bx bx-error-circle text-amber-500 text-xl shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-amber-700 dark:text-amber-400">Approaching Capacity</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                Utilization at <b>{pct.toFixed(1)}%</b>. Only <b>{availableVol.toFixed(3)} m³</b> remaining.
              </p>
            </div>
          </div>
        )}

        {/* Inventory cards */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <i className="bx bx-list-ul text-slate-400 dark:text-slate-500 text-sm" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Inventory · Volume Breakdown</p>
            </div>
            {occupiedVol > 0 && (
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black ring-1"
                style={{ color: fillColor, backgroundColor: fillColor + '15', borderColor: fillColor + '40' }}>
                {occupiedVol.toFixed(4)} m³ occupied
              </span>
            )}
          </div>
          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <i className="bx bx-package text-4xl text-slate-200 dark:text-zinc-700" />
              <p className="mt-2 text-sm font-bold text-slate-400 dark:text-slate-500">No inventory data</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-6 gap-2">
              {rows.map((r, i) => {
                const name = r.info?.label ?? r.item_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                return (
                  <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800/50 p-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">{name}</p>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: fillColor + '18' }}>
                        <i className="bx bx-cube text-[10px]" style={{ color: fillColor }} />
                      </div>
                    </div>
                    <p className="text-xl font-black font-mono leading-none text-slate-800 dark:text-slate-100">
                      {r.quantity.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                      {r.unit ?? 'pcs'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Warehouses() {
  const [warehouses, setWarehouses]     = useState<Warehouse[]>([])
  const [subs, setSubs]                 = useState<Subcontractor[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const [addOpen, setAddOpen]           = useState(false)
  const [editingWh, setEditingWh]       = useState<Warehouse | null>(null)
  const [isOnline, setIsOnline]         = useState(navigator.onLine)
  const [syncing, setSyncing]           = useState(false)
  const [lastSynced, setLastSynced]     = useState<number | null>(null)
  const [syncText, setSyncText]         = useState('Never')

  useEffect(() => {
    function updateText() {
      if (!lastSynced) { setSyncText('Never'); return }
      const secs = Math.floor((Date.now() - lastSynced) / 1000)
      setSyncText(secs < 60 ? 'Just now' : `${Math.floor(secs / 60)}m ago`)
    }
    updateText()
    const t = setInterval(updateText, 15000)
    return () => clearInterval(t)
  }, [lastSynced])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [whRes, subRes] = await Promise.all([
        fetch(`${SKYCABLE_API}/warehouses`, { headers: { Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': '1' } }),
        fetch(`${ADMIN_API}/subcontractors?per_page=200`, { headers: { Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': '1' } }),
      ])
      if (!whRes.ok) throw new Error(`HTTP ${whRes.status}`)
      const wd = await whRes.json()
      const list: Warehouse[] = Array.isArray(wd) ? wd : (wd.data ?? [])
      setWarehouses(list)
      setSelectedId(prev => prev ?? (list[0]?.id ?? null))
      setLastSynced(Date.now())
      if (subRes.ok) {
        const sd = await subRes.json()
        setSubs(Array.isArray(sd) ? sd : (sd.data ?? []))
      }
    } catch (e: any) { setError(e?.message ?? 'Failed to load.') }
    finally { setLoading(false) }
  }

  function handleSync() {
    if (syncing || !isOnline) return
    setSyncing(true)
    load(true).finally(() => setSyncing(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => warehouses.filter(w => {
    const q = search.toLowerCase()
    const ms = !q || w.name.toLowerCase().includes(q) || (w.subcontractor?.name ?? '').toLowerCase().includes(q) || (w.type ?? '').toLowerCase().includes(q)
    const mf = filterStatus === 'all' || w.status === filterStatus
    return ms && mf
  }), [warehouses, search, filterStatus])

  const selected = warehouses.find(w => w.id === selectedId) ?? null

  const alertCounts = useMemo(() => {
    let overCap = 0, nearCap = 0
    warehouses.forEach(wh => {
      const p = whPct(wh)
      if ((wh.sqm ?? 0) > 0) {
        if (p > 100) overCap++
        else if (p >= 90) nearCap++
      }
    })
    return { overCap, nearCap }
  }, [warehouses])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,74,0.14),_transparent_34%),linear-gradient(180deg,#f8faf9_0%,#eef4ef_100%)] pb-12 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">

        {/* Background blobs */}
        <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[380px] overflow-hidden">
          <div className="absolute left-1/2 top-[-180px] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-green-500/20 blur-3xl" />
          <div className="absolute right-[-120px] top-20 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        </div>

        {/* ── Header Hero ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/80 p-5 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.9)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85 sm:p-6">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.22),_transparent_45%)] lg:block" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                <span className="font-bold text-slate-500">Warehouse Operations</span>
                <i className="bx bx-chevron-right text-sm" />
                <span className="font-bold text-slate-600 dark:text-slate-300">Capacity &amp; Occupancy</span>
              </nav>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-3xl font-black tracking-tight">Warehouse Capacity</h1>
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-black text-green-600 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-900/30">
                  Volume tracking
                </span>
                {alertCounts.overCap > 0 && (
                  <span className="animate-pulse rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-900/30">
                    {alertCounts.overCap} over capacity
                  </span>
                )}
                {alertCounts.nearCap > 0 && (
                  <span className="animate-pulse rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-900/30">
                    {alertCounts.nearCap} near capacity
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Online / Synced indicator */}
              <div className="flex items-center gap-2 rounded-2xl bg-white/50 backdrop-blur-md border border-slate-200 px-3 py-1.5 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] text-xs select-none dark:bg-zinc-900/50 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200 dark:border-zinc-800">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </span>
                  <span className="font-bold text-slate-600 dark:text-zinc-300">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 font-medium">
                  <i className="bx bx-time-five text-sm" />
                  <span>Synced:</span>
                  <span className="font-black text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 leading-none dark:bg-zinc-800 dark:text-zinc-300">
                    {syncText}
                  </span>
                </div>
                <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-zinc-800">
                  <button type="button" onClick={handleSync} disabled={syncing || !isOnline}
                    className={`flex h-6 w-6 items-center justify-center rounded-xl text-slate-500 transition-all ${syncing ? 'animate-spin' : 'hover:bg-slate-100 hover:text-violet-500 dark:hover:bg-zinc-800'} disabled:opacity-50`}>
                    <i className="bx bx-refresh text-lg" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] bg-white p-4 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] border border-slate-200/60 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="inline-flex rounded-2xl bg-slate-100 p-1 text-xs font-black dark:bg-zinc-950">
            {(['all', 'active', 'inactive'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-4 capitalize transition ${
                  filterStatus === s
                    ? 'bg-white text-green-700 shadow-sm dark:bg-zinc-800 dark:text-green-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                {s === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                {s === 'inactive' && <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
                {s}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:w-72 sm:flex-initial">
            <i className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
            <input type="text" placeholder="Search warehouses, subcontractors…" value={search} onChange={e => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl bg-slate-50 pl-10 pr-4 text-xs font-medium outline-none border border-slate-200/80 transition-all focus:border-green-400 focus:bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:focus:border-indigo-500 dark:text-white dark:placeholder-zinc-500" />
          </div>
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 px-5 py-4">
            <i className="bx bx-error-circle text-rose-500 text-xl" />
            <span className="text-sm font-bold text-rose-700 dark:text-rose-400 flex-1">{error}</span>
            <button onClick={() => load()} className="text-xs font-black text-rose-600 dark:text-rose-400 hover:underline">Retry</button>
          </div>
        )}

        {/* ── Main content ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-green-600 border-t-transparent" />
          </div>
        ) : (
          <div className="flex gap-4" style={{ minHeight: 560 }}>

            {/* Left: Warehouse list */}
            <div className="w-72 xl:w-80 shrink-0 flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 shrink-0 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {filtered.length} warehouse{filtered.length !== 1 ? 's' : ''}
                </p>
                <button onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-green-600 px-3 py-1.5 text-xs font-black text-white shadow-[0_8px_20px_-8px_rgba(22,163,74,0.7)] transition hover:-translate-y-0.5 hover:bg-green-700">
                  <i className="bx bx-plus text-sm" /> New
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <i className="bx bx-buildings text-4xl text-slate-200 dark:text-zinc-700 mb-2" />
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No warehouses found</p>
                  </div>
                ) : filtered.map(wh => {
                  const pct = whPct(wh)
                  const barColor = pct >= 91 ? '#ef4444' : pct >= 71 ? '#f59e0b' : '#10b981'
                  const isSelected = wh.id === selectedId
                  const cap = (wh.sqm ?? 0) * getStoredH(wh.id)
                  const statusLabel = pct >= 91 ? 'Critical' : pct >= 71 ? 'Near Full' : cap > 0 ? 'Operational' : 'No Setup'
                  return (
                    <button key={wh.id} onClick={() => setSelectedId(wh.id)}
                      className={`w-full text-left rounded-2xl mt-2 border transition-all duration-200 overflow-hidden ${
                        isSelected
                          ? 'border-green-400/60 bg-green-50 dark:bg-green-900/15 shadow-[0_4px_20px_-4px_rgba(22,163,74,0.25)]'
                          : 'border-slate-200/70 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/40 hover:border-slate-300 dark:hover:border-zinc-600 hover:shadow-sm'
                      }`}
                    >
                      <div className="h-1 w-full" style={{ backgroundColor: wh.status === 'active' ? barColor : '#cbd5e1' }} />
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-black truncate leading-snug ${isSelected ? 'text-green-700 dark:text-green-400' : 'text-slate-800 dark:text-white'}`}>
                              {wh.name}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {wh.subcontractor?.name ?? `Subcon #${wh.subcontractor_id}`}
                            </p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className="text-base font-black font-mono leading-none" style={{ color: barColor }}>{pct.toFixed(0)}%</span>
                            <span className="text-[9px] font-bold" style={{ color: barColor }}>{statusLabel}</span>
                          </div>
                        </div>
                        <div className="relative h-2 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden mb-2">
                          <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {wh.type && <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded-md">{wh.type}</span>}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${wh.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{wh.status}</span>
                          </div>
                          <span className="text-[9px] font-mono text-slate-400">{cap > 0 ? `${cap.toFixed(0)} m³` : '— m³'}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: Detail */}
            <div className="flex-1 min-w-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
              {selected ? (
                <WhDetail key={selected.id} wh={selected} onEdit={() => setEditingWh(selected)} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-slate-100 dark:bg-zinc-800 mb-4 shadow-inner">
                    <i className="bx bx-buildings text-4xl text-slate-300 dark:text-zinc-600" />
                  </div>
                  <p className="text-sm font-black text-slate-500 dark:text-slate-400">Select a warehouse</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs font-medium">
                    Click a warehouse from the list to view its volume-based capacity and occupancy.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Modals */}
      {addOpen && (
        <AddModal subs={subs} onClose={() => setAddOpen(false)}
          onSaved={(id, h) => { if (id && h) saveStoredH(id, h); load() }} />
      )}
      {editingWh && (
        <EditModal wh={editingWh} onClose={() => setEditingWh(null)} onSaved={() => load()} />
      )}
    </div>
  )
}
