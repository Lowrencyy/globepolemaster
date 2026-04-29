import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import html2canvas from 'html2canvas'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'

interface NodeInfo {
  id: number
  name: string
  full_label?: string | null
  status: string
  area?: { id: number; name: string } | null
  expected_cable?: number
  actual_cable?: number
  progress_percentage?: number
}

interface PoleRecord {
  id: number
  sequence: number
  pole?: {
    id: number
    pole_code: string
    lat?: string | null
    lng?: string | null
    skycable_status?: string
  }
}

const POLE_COLOR: Record<string, string> = {
  pending:     '#f59e0b',
  in_progress: '#8b5cf6',
  cleared:     '#10b981',
}

function statusLabel(s: string) {
  if (s === 'cleared')     return 'Cleared'
  if (s === 'in_progress') return 'In Progress'
  return 'Pending'
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' }
}

export default function NodePolesList() {
  const { siteSlug = '', nodeSlug = '' } = useParams()
  const navigate  = useNavigate()
  const nodeId    = idFromSlug(nodeSlug) || Number(nodeSlug)
  const reportRef = useRef<HTMLDivElement>(null)

  const [node, setNode]         = useState<NodeInfo | null>(null)
  const [poles, setPoles]       = useState<PoleRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    if (!nodeId) return
    const hitNode  = cacheGet<NodeInfo>(`poles_info_${nodeId}`)
    const hitPoles = cacheGet<PoleRecord[]>(`poles_list_${nodeId}`)
    if (hitNode)  { setNode(hitNode) }
    if (hitPoles) { setPoles(hitPoles); setLoading(false) }

    Promise.all([
      fetch(`${SKYCABLE_API}/nodes/${nodeId}`,      { headers: authHeaders() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([nd, pd]) => {
      if (nd?.id) { setNode(nd); cacheSet(`poles_info_${nodeId}`, nd) }
      const list: PoleRecord[] = Array.isArray(pd) ? pd : (pd?.data ?? [])
      setPoles(list); cacheSet(`poles_list_${nodeId}`, list)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [nodeId])

  const filtered = search.trim()
    ? poles.filter(p => (p.pole?.pole_code ?? '').toLowerCase().includes(search.toLowerCase()))
    : poles

  const withGps  = poles.filter(p => p.pole?.lat && p.pole?.lng).length
  const cleared  = poles.filter(p => p.pole?.skycable_status === 'cleared').length
  const pct      = Math.min(100, Math.round(node?.progress_percentage ?? 0))

  // ── Export as portrait A4 image ──────────────────────────────────────────────
  async function exportImage() {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      })

      // A4 portrait at 150dpi: 1240 × 1754 px
      const A4_W = 1240
      const A4_H = 1754

      const out = document.createElement('canvas')
      out.width  = A4_W
      out.height = A4_H
      const ctx  = out.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, A4_W, A4_H)

      const scale = A4_W / canvas.width
      const drawH = Math.min(canvas.height * scale, A4_H)
      ctx.drawImage(canvas, 0, 0, A4_W, drawH)

      const link      = document.createElement('a')
      link.download   = `PolesList_${node?.full_label ?? node?.name ?? nodeId}.png`
      link.href       = out.toDataURL('image/png')
      link.click()
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/sites" className="hover:text-indigo-600 transition">Site List</Link>
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <Link to={`/sites/${siteSlug}`} className="hover:text-indigo-600 transition">
            {node?.area?.name ?? 'Site'}
          </Link>
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <Link to={`/sites/${siteSlug}/nodes/${nodeSlug}`} className="hover:text-indigo-600 transition">
            {node?.full_label ?? node?.name ?? 'Node'}
          </Link>
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-slate-900 dark:text-slate-100">Poles</span>
        </nav>

        <button onClick={exportImage} disabled={exporting || poles.length === 0}
          className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed">
          {exporting ? (
            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Exporting…</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Export Image
            </>
          )}
        </button>
      </div>

      {/* Search — not in export */}
      <div className="relative max-w-sm">
        <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pole code…"
          className="h-9 w-full rounded-full border border-[#d8e6f8] bg-white pl-9 pr-4 text-xs font-medium text-slate-600 outline-none transition hover:border-[#8fc5ff] focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#15233c]/80 dark:text-slate-200" />
      </div>

      {/* ── Exportable report card (portrait A4 ratio, max 794px) ── */}
      <div ref={reportRef} className="bg-white rounded-[20px] border border-zinc-200 shadow-sm overflow-hidden" style={{ maxWidth: 794 }}>

        {/* Dark header */}
        <div style={{ background: '#0c1f3d' }} className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300 mb-1">Globe Telecom · Skycable Teardown</p>
              <h2 className="text-2xl font-black text-white tracking-tight">Poles List</h2>
              <p className="mt-0.5 text-sm text-sky-200 font-semibold">Node Pole Inventory</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-sky-300 uppercase tracking-wider">Node</p>
              <p className="text-lg font-black text-white leading-tight">{node?.name ?? `Node #${nodeId}`}</p>
              {node?.full_label && <p className="text-xs font-mono text-sky-300">{node.full_label}</p>}
              {node?.area && <p className="text-xs text-sky-200 mt-0.5">{node.area.name}</p>}
            </div>
          </div>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-4 border-b border-zinc-200">
          {[
            { label: 'Total Poles', value: poles.length,  color: '#6366f1' },
            { label: 'With GPS',    value: withGps,       color: '#0ea5e9' },
            { label: 'Cleared',     value: cleared,       color: '#10b981' },
            { label: 'Progress',    value: `${pct}%`,     color: pct >= 100 ? '#10b981' : pct > 0 ? '#6366f1' : '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center justify-center gap-0.5 border-r border-zinc-200 last:border-r-0 py-3 px-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</p>
              <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="px-4 pt-3 pb-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
            {filtered.length} pole{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <p className="text-sm font-semibold">{search ? 'No poles match your search.' : 'No poles assigned to this node.'}</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ background: '#0c1f3d' }}>
                {['#', 'Seq', 'Pole Code', 'Latitude', 'Longitude', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-sky-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const st    = p.pole?.skycable_status ?? 'pending'
                const color = POLE_COLOR[st] ?? '#f59e0b'
                return (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}>
                    <td className="px-3 py-2 text-zinc-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-bold text-zinc-600 tabular-nums">{p.sequence}</td>
                    <td className="px-3 py-2 font-mono font-bold text-sky-600">{p.pole?.pole_code ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-zinc-500">
                      {p.pole?.lat ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-500">
                      {p.pole?.lng ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold bg-zinc-100 text-zinc-700">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        {statusLabel(st)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f4f8ff' }}>
                <td colSpan={2} className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider text-zinc-500">Totals</td>
                <td className="px-3 py-2 font-black text-zinc-700 text-[11px]">{filtered.length} poles</td>
                <td colSpan={2} className="px-3 py-2 text-[9px] font-semibold text-zinc-400">
                  {filtered.filter(p => p.pole?.lat && p.pole?.lng).length} with GPS coords
                </td>
                <td className="px-3 py-2 text-[9px] font-semibold text-emerald-600">
                  {filtered.filter(p => p.pole?.skycable_status === 'cleared').length} cleared
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Footer */}
        <div className="border-t border-zinc-200 px-5 py-2.5 flex items-center justify-between bg-zinc-50">
          <p className="text-[9px] text-zinc-400">Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}</p>
          <p className="text-[9px] text-zinc-400 font-semibold">Globe Telecom · Skycable Operations</p>
        </div>
      </div>
    </div>
  )
}
