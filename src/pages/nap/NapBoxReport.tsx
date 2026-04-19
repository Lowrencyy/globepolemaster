import { useMemo, useState } from 'react'

type SlotStatus = 'occupied' | 'available' | 'reserved' | 'damaged'
type NapStatus  = 'active' | 'inactive' | 'damaged' | 'for_replacement'

interface Slot { number: number; status: SlotStatus; subscriber?: string; account_no?: string }
interface NapReport {
  id: string; tag: string; pole_id: string; type: '8-port' | '16-port' | '24-port'
  owner: string; city: string; barangay: string; address: string
  status: NapStatus; installed_date: string; last_updated: string; encoder: string
  slots: Slot[]
}

const makeSlots = (total: number, used: number, overrides: Partial<Slot>[] = []): Slot[] =>
  Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const ov = overrides.find(p => p.number === n)
    if (ov) return { number: n, status: ov.status ?? 'available', subscriber: ov.subscriber, account_no: ov.account_no }
    return { number: n, status: n <= used ? 'occupied' : 'available',
      subscriber: n <= used ? `SUB-${String(n).padStart(3,'0')}` : undefined,
      account_no: n <= used ? `ACC-${String(n*7+1000).padStart(6,'0')}` : undefined }
  })

const DATA: NapReport[] = [
  { id:'NAP-0001', tag:'NTAG-001', pole_id:'PL-8812', type:'16-port', owner:'Globe',    city:'Makati', barangay:'Sta. Cruz',     address:'123 Ayala Ave., Sta. Cruz, Makati',        status:'active',   installed_date:'2023-06-15', last_updated:'2025-04-10', encoder:'Juan D.',  slots: makeSlots(16,12,[{number:7,status:'reserved',subscriber:'Reserved - Globe'},{number:14,status:'damaged'}]) },
  { id:'NAP-0002', tag:'NTAG-002', pole_id:'PL-8801', type:'8-port',  owner:'Globe',    city:'Makati', barangay:'Bangkal',       address:'45 JP Rizal St., Bangkal, Makati',         status:'active',   installed_date:'2023-09-20', last_updated:'2025-03-28', encoder:'Maria S.', slots: makeSlots(8,5) },
  { id:'NAP-0003', tag:'NTAG-003', pole_id:'PL-7703', type:'24-port', owner:'Meralco',  city:'Makati', barangay:'Palanan',       address:'89 Malugay St., Palanan, Makati',          status:'active',   installed_date:'2022-11-05', last_updated:'2025-04-18', encoder:'Pedro R.', slots: makeSlots(24,24) },
  { id:'NAP-0005', tag:'NTAG-005', pole_id:'PL-8790', type:'8-port',  owner:'Globe',    city:'Makati', barangay:'Comembo',       address:'17 Comembo Ave., Comembo, Makati',         status:'damaged',  installed_date:'2024-01-12', last_updated:'2025-02-03', encoder:'Ana L.',   slots: makeSlots(8,3,[{number:5,status:'damaged'},{number:6,status:'damaged'}]) },
  { id:'NAP-0006', tag:'NTAG-006', pole_id:'PL-7621', type:'16-port', owner:'Converge', city:'Makati', barangay:'Pembo',         address:'22 Pembo St., Pembo, Makati',              status:'active',   installed_date:'2023-03-18', last_updated:'2025-04-01', encoder:'Carlo M.', slots: makeSlots(16,9) },
  { id:'NAP-0007', tag:'NTAG-007', pole_id:'PL-6998', type:'24-port', owner:'Globe',    city:'Taguig', barangay:'Ususan',        address:'10 Ususan Rd., Ususan, Taguig',            status:'active',   installed_date:'2022-08-22', last_updated:'2025-03-15', encoder:'Lea B.',   slots: makeSlots(24,18) },
]

const SLOT_COLOR: Record<SlotStatus, { body: string; ferrule: string; glow: string; label: string; dot: string; pill: string }> = {
  occupied:  { body:'#dc2626', ferrule:'#fee2e2', glow:'0 0 6px 2px #dc262677', label:'Occupied',  dot:'bg-red-500',    pill:'bg-red-50 text-red-700 ring-red-200' },
  available: { body:'#16a34a', ferrule:'#bbf7d0', glow:'0 0 6px 2px #16a34a77', label:'Free',      dot:'bg-green-500',  pill:'bg-green-50 text-green-700 ring-green-200' },
  reserved:  { body:'#d97706', ferrule:'#fef3c7', glow:'0 0 6px 2px #d9770677', label:'Reserved',  dot:'bg-amber-400',  pill:'bg-amber-50 text-amber-700 ring-amber-200' },
  damaged:   { body:'#ca8a04', ferrule:'#fef9c3', glow:'0 0 6px 2px #ca8a0477', label:'Damaged',   dot:'bg-yellow-400', pill:'bg-yellow-50 text-yellow-700 ring-yellow-200' },
}

const BOX_STATUS: Record<NapStatus, { label: string; color: string }> = {
  active:          { label:'Active',          color:'text-emerald-600' },
  inactive:        { label:'Inactive',        color:'text-gray-500' },
  damaged:         { label:'Damaged',         color:'text-red-600' },
  for_replacement: { label:'For Replacement', color:'text-amber-600' },
}

// ── Fiber port ───────────────────────────────────────────────────────────────
function Port({ slot, hov, onHov }: { slot: Slot; hov: Slot|null; onHov:(s:Slot|null)=>void }) {
  const c = SLOT_COLOR[slot.status]
  const active = hov?.number === slot.number
  return (
    <div onMouseEnter={()=>onHov(slot)} onMouseLeave={()=>onHov(null)}
      style={{ width:32, height:32, background:'#111', borderRadius:3,
        display:'flex', alignItems:'center', justifyContent:'center', cursor:'default', position:'relative',
        boxShadow: active ? `inset 0 0 0 1.5px #ffffff44, ${c.glow}` : 'inset 0 0 0 1px #ffffff0f',
        transition:'box-shadow 0.1s' }}>
      <div style={{ width:22, height:22, background:'#060606', borderRadius:2,
        display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 2px 3px rgba(0,0,0,0.9)' }}>
        <div style={{ width:15, height:15, background:c.body, borderRadius:2,
          display:'flex', alignItems:'center', justifyContent:'center', boxShadow:c.glow }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:c.ferrule }} />
        </div>
      </div>
      <span style={{ position:'absolute', bottom:1, right:2, fontSize:6, color:'#ffffff33', fontFamily:'monospace' }}>{slot.number}</span>
    </div>
  )
}

// ── Report card ──────────────────────────────────────────────────────────────
function ReportCard({ box }: { box: NapReport }) {
  const [hov, setHov] = useState<Slot|null>(null)
  const cols = box.type === '8-port' ? 4 : box.type === '16-port' ? 8 : 12
  const rows = [box.slots.slice(0, cols), box.slots.slice(cols)]

  const occ  = box.slots.filter(s=>s.status==='occupied').length
  const free = box.slots.filter(s=>s.status==='available').length
  const res  = box.slots.filter(s=>s.status==='reserved').length
  const dmg  = box.slots.filter(s=>s.status==='damaged').length
  const pct  = Math.round((occ / box.slots.length)*100)
  const bs   = BOX_STATUS[box.status]

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-800 ring-1 ring-slate-100 dark:ring-zinc-700 shadow-sm overflow-hidden">

      {/* Header — minimal */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-50 dark:border-zinc-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-800 dark:text-zinc-100">{box.id}</span>
            <span className={`text-[11px] font-semibold ${bs.color}`}>{bs.label}</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
            <i className="mdi mdi-map-marker mr-0.5" />{box.barangay}, {box.city}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="rounded-full bg-slate-100 dark:bg-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-300">{box.type}</span>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1">{box.owner}</p>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">

        {/* Physical panel */}
        <div style={{ background:'linear-gradient(180deg,#1e1e1e 0%,#141414 100%)', borderRadius:7,
          padding:'8px 12px', boxShadow:'0 3px 16px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div style={{ height:2, background:'#2a2a2a', borderRadius:2, marginBottom:7 }} />
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1 justify-center">
              {rows[0].map(s=><Port key={s.number} slot={s} hov={hov} onHov={setHov}/>)}
            </div>
            {rows[1].length > 0 && (
              <div className="flex gap-1 justify-center">
                {rows[1].map(s=><Port key={s.number} slot={s} hov={hov} onHov={setHov}/>)}
              </div>
            )}
          </div>
          <div style={{ height:2, background:'#2a2a2a', borderRadius:2, marginTop:7 }} />
        </div>

        {/* Hover info */}
        <div className="h-5 flex items-center">
          {hov ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SLOT_COLOR[hov.status].pill}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{background:SLOT_COLOR[hov.status].body}}/>
              #{hov.number} · {SLOT_COLOR[hov.status].label}
              {hov.subscriber && <span className="opacity-60">{hov.subscriber}</span>}
            </span>
          ) : (
            <span className="text-[10px] text-slate-300 dark:text-zinc-600 italic">Hover a port</span>
          )}
        </div>

        {/* Utilization */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Utilization</span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{occ}/{box.slots.length} · {pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden flex">
            {occ > 0 && <div className="h-full" style={{width:`${(occ/box.slots.length)*100}%`, background:'#dc2626'}}/>}
            {res > 0 && <div className="h-full" style={{width:`${(res/box.slots.length)*100}%`, background:'#d97706'}}/>}
            {dmg > 0 && <div className="h-full" style={{width:`${(dmg/box.slots.length)*100}%`, background:'#ca8a04'}}/>}
          </div>
        </div>

        {/* Slot counts */}
        <div className="flex flex-wrap gap-1.5">
          {([['occupied',occ],['available',free],['reserved',res],['damaged',dmg]] as [SlotStatus,number][]).map(([k,v])=>(
            <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SLOT_COLOR[k].pill}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{background:SLOT_COLOR[k].body}}/>{v} {SLOT_COLOR[k].label}
            </span>
          ))}
        </div>

        {/* Meta */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-50 dark:border-zinc-700 text-[10px]">
          {[['Pole',box.pole_id],['Encoder',box.encoder],['Updated',box.last_updated]].map(([k,v])=>(
            <div key={k}>
              <p className="text-slate-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">{k}</p>
              <p className="font-semibold text-slate-600 dark:text-zinc-300 truncate">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function NapBoxReport() {
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState<NapStatus|'all'>('all')
  const [filterOwner, setFilterOwner]   = useState('all')

  const owners = ['all', ...Array.from(new Set(DATA.map(b=>b.owner)))]

  const filtered = useMemo(()=>DATA.filter(b=>{
    const q = search.toLowerCase()
    const mQ = !q || b.id.toLowerCase().includes(q) || b.pole_id.toLowerCase().includes(q) || b.city.toLowerCase().includes(q)
    const mS = filterStatus==='all' || b.status===filterStatus
    const mO = filterOwner==='all'  || b.owner===filterOwner
    return mQ && mS && mO
  }),[search,filterStatus,filterOwner])

  const totSlots = DATA.reduce((s,b)=>s+b.slots.length,0)
  const totOcc   = DATA.reduce((s,b)=>s+b.slots.filter(sl=>sl.status==='occupied').length,0)
  const totFree  = DATA.reduce((s,b)=>s+b.slots.filter(sl=>sl.status==='available').length,0)
  const totDmg   = DATA.reduce((s,b)=>s+b.slots.filter(sl=>sl.status==='damaged').length,0)

  const selCls = "h-8 rounded-full border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 pr-7 text-xs font-medium text-slate-600 dark:text-zinc-300 appearance-none outline-none cursor-pointer"

  return (
    <>
      {/* Page title + stats */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-lg font-bold text-slate-800 dark:text-zinc-100">NAP Box Report</h4>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Slot-level inventory per NAP box</p>
        </div>

        {/* Inline mini stats */}
        <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-800 ring-1 ring-slate-100 dark:ring-zinc-700 shadow-sm px-5 py-2.5">
          {[
            { label:'Total Slots', value:totSlots, color:'text-slate-800 dark:text-zinc-100' },
            { label:'Occupied',    value:totOcc,   color:'text-red-600' },
            { label:'Free',        value:totFree,  color:'text-green-600' },
            { label:'Damaged',     value:totDmg,   color:'text-yellow-600' },
            { label:'Utilization', value:`${Math.round((totOcc/totSlots)*100)}%`, color:'text-violet-600' },
          ].map((s,i,arr)=>(
            <div key={s.label} className={`text-center ${i < arr.length-1 ? 'pr-3 border-r border-slate-100 dark:border-zinc-700' : ''}`}>
              <p className={`text-lg font-bold leading-none ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <i className="mdi mdi-magnify absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search NAP box, city…"
            className="h-8 rounded-full border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 pl-8 pr-4 text-xs text-slate-600 dark:text-zinc-300 outline-none w-44"/>
        </div>
        <div className="relative">
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as typeof filterStatus)} className={`${selCls} w-36`}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="damaged">Damaged</option>
            <option value="for_replacement">For Replacement</option>
          </select>
          <i className="mdi mdi-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm"/>
        </div>
        <div className="relative">
          <select value={filterOwner} onChange={e=>setFilterOwner(e.target.value)} className={`${selCls} w-32`}>
            {owners.map(o=><option key={o} value={o}>{o==='all'?'All Owners':o}</option>)}
          </select>
          <i className="mdi mdi-chevron-down pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm"/>
        </div>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-800 ring-1 ring-slate-100 dark:ring-zinc-700 px-4 py-1.5">
          {(['occupied','available','reserved','damaged'] as SlotStatus[]).map(s=>(
            <span key={s} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-sm" style={{background:SLOT_COLOR[s].body}}/>
              {SLOT_COLOR[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-400 dark:text-zinc-500">
          <i className="mdi mdi-server-off text-4xl block mb-2"/>No results.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(b=><ReportCard key={b.id} box={b}/>)}
        </div>
      )}
    </>
  )
}
