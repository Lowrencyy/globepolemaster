import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API, isAdmin } from '../../lib/auth'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Types ────────────────────────────────────────────────────────────────────

interface Node {
  id: number; name: string; label: string | null; full_label: string | null
  status: string; expected_cable: number | null
  barangay?: { name: string; city?: { name: string } } | null
  subcontractor?: { name: string } | null
}

interface Pole {
  id: number; pole_code: string; lat: string | null; lng: string | null
  skycable_status: 'pending' | 'in_progress' | 'cleared'
  barangay?: { name: string } | null
  sequence?: number | null
  photos?: { before?: string | null; after?: string | null; pole_tag?: string | null }
}

interface Span {
  id: number; span_code: string | null; strand_length: number | null
  number_of_runs: number | null; actual_cable: number | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  from_pole?: { id: number; pole?: { id: number; pole_code: string } | null } | null
  to_pole?:   { id: number; pole?: { id: number; pole_code: string } | null } | null
}

interface SpanForm {
  from_pole_id: string; to_pole_id: string; span_code: string
  strand_length: string; number_of_runs: string
  nodes_count: string; amplifier: string; extender: string; tsc: string
}

const POLE_STATUS_CFG = {
  pending:     { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    dot: '#f59e0b' },
  in_progress: { label: 'Active',   cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',  dot: '#8b5cf6' },
  cleared:     { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: '#10b981' },
}

const SPAN_STATUS_CFG = {
  pending:     { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  in_progress: { label: 'Ongoing',   cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  completed:   { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled:   { label: 'Cancelled', cls: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
}

const h = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
  'Content-Type': 'application/json',
})

const emptySpanForm = (): SpanForm => ({
  from_pole_id: '', to_pole_id: '', span_code: '',
  strand_length: '', number_of_runs: '1',
  nodes_count: '0', amplifier: '0', extender: '0', tsc: '0',
})

// ── Canvas Pole Picker ───────────────────────────────────────────────────────

interface Transform { scale: number; originX: number; originY: number }

function toCanvas(lat: number, lng: number, t: Transform) {
  return { x: t.originX + lng * t.scale, y: t.originY - lat * t.scale }
}

function computeFit(poles: Pole[], w: number, h: number): Transform | null {
  const gps = poles.filter(p => p.lat && p.lng)
  if (!gps.length) return null
  const lats = gps.map(p => Number(p.lat))
  const lngs = gps.map(p => Number(p.lng))
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const dLng = (maxLng - minLng) || 0.001
  const dLat = (maxLat - minLat) || 0.001
  const pad = 72
  const scale = Math.min((w - pad * 2) / dLng, (h - pad * 2) / dLat)
  return {
    scale,
    originX: w / 2 - ((minLng + maxLng) / 2) * scale,
    originY: h / 2 + ((minLat + maxLat) / 2) * scale,
  }
}

function PoleCanvas({
  poles, spans, onPairSelected, savedPairs,
}: {
  poles: Pole[]
  spans: Span[]
  onPairSelected: (from: Pole, to: Pole) => void
  savedPairs: Array<{ from: number; to: number }>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tRef      = useRef<Transform>({ scale: 1, originX: 0, originY: 0 })
  const hovRef    = useRef<number | null>(null)
  const fromRef   = useRef<number | null>(null)
  const toRef     = useRef<number | null>(null)

  const gpsPoles = useMemo(() => poles.filter(p => p.lat && p.lng), [poles])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const t = tRef.current
    const dark = document.documentElement.classList.contains('dark')

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = dark ? '#080f1b' : '#eef4f9'
    ctx.fillRect(0, 0, W, H)

    if (!gpsPoles.length) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 13px ui-sans-serif,sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No GPS coordinates assigned to poles in this node.', W / 2, H / 2)
      return
    }

    // Existing spans — dashed gray
    ctx.save()
    ctx.setLineDash([5, 3])
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    spans.forEach(s => {
      const fp = gpsPoles.find(p => p.id === s.from_pole?.id)
      const tp = gpsPoles.find(p => p.id === s.to_pole?.id)
      if (!fp || !tp) return
      const fc = toCanvas(Number(fp.lat), Number(fp.lng), t)
      const tc = toCanvas(Number(tp.lat), Number(tp.lng), t)
      ctx.beginPath(); ctx.moveTo(fc.x, fc.y); ctx.lineTo(tc.x, tc.y); ctx.stroke()
    })
    ctx.restore()

    // Newly saved spans this session — solid blue
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2.5
    savedPairs.forEach(s => {
      const fp = gpsPoles.find(p => p.id === s.from)
      const tp = gpsPoles.find(p => p.id === s.to)
      if (!fp || !tp) return
      const fc = toCanvas(Number(fp.lat), Number(fp.lng), t)
      const tc = toCanvas(Number(tp.lat), Number(tp.lng), t)
      ctx.beginPath(); ctx.moveTo(fc.x, fc.y); ctx.lineTo(tc.x, tc.y); ctx.stroke()
    })
    ctx.restore()

    // Preview line while picking
    const fromId = fromRef.current, toId = toRef.current
    if (fromId && toId) {
      const fp = gpsPoles.find(p => p.id === fromId)
      const tp = gpsPoles.find(p => p.id === toId)
      if (fp && tp) {
        ctx.save()
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2
        const fc = toCanvas(Number(fp.lat), Number(fp.lng), t)
        const tc = toCanvas(Number(tp.lat), Number(tp.lng), t)
        ctx.beginPath(); ctx.moveTo(fc.x, fc.y); ctx.lineTo(tc.x, tc.y); ctx.stroke()
        ctx.restore()
      }
    }

    // Poles
    const hovId = hovRef.current
    gpsPoles.forEach(p => {
      const { x, y } = toCanvas(Number(p.lat), Number(p.lng), t)
      const r = Math.max(4.5, Math.min(9.5, t.scale * 4_000_000))
      const statusFill = p.skycable_status === 'cleared' ? '#22c55e' : p.skycable_status === 'in_progress' ? '#8b5cf6' : '#f59e0b'
      let fill = statusFill
      if      (p.id === fromId) fill = '#2563eb'
      else if (p.id === toId)   fill = '#f97316'
      else if (p.id === hovId)  fill = '#8b5cf6'

      ctx.save()
      if (p.id === hovId || p.id === fromId || p.id === toId) {
        ctx.shadowColor = fill; ctx.shadowBlur = 12
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = fill; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      ctx.restore()

      if (t.scale > 100_000) {
        const fs = Math.min(11, Math.max(7, t.scale * 0.000_04))
        ctx.font = `700 ${fs}px ui-monospace,monospace`
        ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a'
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText(p.pole_code, x, y - r - 3)
      }
    })
  }, [gpsPoles, spans, savedPairs])

  const nearest = useCallback((mx: number, my: number): Pole | null => {
    let best: Pole | null = null
    let bestD = Infinity
    gpsPoles.forEach(p => {
      const { x, y } = toCanvas(Number(p.lat), Number(p.lng), tRef.current)
      const d = Math.hypot(mx - x, my - y)
      if (d < bestD) { bestD = d; best = p }
    })
    return bestD < 22 ? best : null
  }, [gpsPoles])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    canvas.width  = rect.width
    canvas.height = rect.height
    const fit = computeFit(gpsPoles, rect.width, rect.height)
    if (fit) tRef.current = fit
    draw()
  }, [gpsPoles, draw])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(() => resize())
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement)
    return () => ro.disconnect()
  }, [resize])

  useEffect(() => { draw() }, [draw])

  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const draggingRef = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: tRef.current.originX, oy: tRef.current.originY }
    draggingRef.current = false
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top

    if (panRef.current) {
      const dx = e.clientX - panRef.current.sx
      const dy = e.clientY - panRef.current.sy
      if (!draggingRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) draggingRef.current = true
      if (draggingRef.current) {
        tRef.current = { ...tRef.current, originX: panRef.current.ox + dx, originY: panRef.current.oy + dy }
        draw(); return
      }
    }

    const hov = nearest(mx, my)
    const newHovId = hov ? hov.id : null
    if (newHovId !== hovRef.current) {
      hovRef.current = newHovId
      canvas.style.cursor = newHovId ? 'pointer' : 'grab'
      draw()
    }
  }, [nearest, draw])

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const wasDrag = draggingRef.current
    panRef.current = null; draggingRef.current = false
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = hovRef.current ? 'pointer' : 'grab'
    if (e.button !== 0 || wasDrag) return

    const pole = gpsPoles.find(p => p.id === hovRef.current)
    if (!pole) return

    if (!fromRef.current) {
      fromRef.current = pole.id
      draw()
    } else if (!toRef.current && pole.id !== fromRef.current) {
      toRef.current = pole.id
      draw()
      const from = gpsPoles.find(p => p.id === fromRef.current)!
      const to   = pole
      fromRef.current = null; toRef.current = null
      onPairSelected(from, to)
    }
  }, [gpsPoles, draw, onPairSelected])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const f = e.deltaY < 0 ? 1.13 : 1 / 1.13
    tRef.current = {
      scale:   tRef.current.scale   * f,
      originX: mx - (mx - tRef.current.originX) * f,
      originY: my + (tRef.current.originY - my) * f,
    }
    draw()
  }, [draw])

  const onMouseLeave = useCallback(() => {
    panRef.current = null; draggingRef.current = false
    if (hovRef.current !== null) { hovRef.current = null; draw() }
  }, [draw])

  return (
    <div className="relative overflow-hidden bg-[#eef4f9] dark:bg-[#080f1b] w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-grab"
        style={{ touchAction: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel}
      />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur px-3 py-2 text-[11px] font-semibold shadow border border-slate-200/50 dark:border-zinc-700/50">
        {[
          { color: '#2563eb', label: 'From' },
          { color: '#f97316', label: 'To' },
          { color: '#22c55e', label: 'Cleared' },
          { color: '#f59e0b', label: 'Pending' },
          { color: '#8b5cf6', label: 'Active' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
            <span className="text-slate-600 dark:text-slate-400">{l.label}</span>
          </span>
        ))}
      </div>
      {/* Instruction badge */}
      <div className="absolute top-3 right-3 rounded-xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur px-3 py-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 shadow border border-slate-200/50 dark:border-zinc-700/50">
        Click a pole to set <span className="text-blue-600 font-bold">From</span>, then click another for <span className="text-orange-500 font-bold">To</span>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NodePolesSpans() {
  const { siteId, nodeId } = useParams<{ siteId: string; nodeId: string }>()
  const navigate = useNavigate()
  const admin = isAdmin()

  const [node, setNode]         = useState<Node | null>(null)
  const [poles, setPoles]       = useState<Pole[]>([])
  const [spans, setSpans]       = useState<Span[]>([])
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<'poles' | 'spans'>('poles')
  const [poleSearch, setPoleSearch] = useState('')
  const [savedPairs, setSavedPairs] = useState<Array<{ from: number; to: number }>>([])
  const [canvasModal, setCanvasModal] = useState(false)

  // Vicinity map
  const vicinityMapRef = useRef<HTMLDivElement>(null)
  const vicinityMapObj = useRef<L.Map | null>(null)

  // Span modal
  const [spanModal, setSpanModal]   = useState(false)
  const [editSpan, setEditSpan]     = useState<Span | null>(null)
  const [spanForm, setSpanForm]     = useState<SpanForm>(emptySpanForm())
  const [savingSpan, setSavingSpan] = useState(false)
  const [spanError, setSpanError]   = useState<string | null>(null)
  const [delSpan, setDelSpan]       = useState<Span | null>(null)

  // Add Pole modal
  const [poleModal, setPoleModal]   = useState(false)
  const [poleTab, setPoleTab]       = useState<'new' | 'existing'>('new')
  const [poleCode, setPoleCode]     = useState('')
  const [poleLat, setPoleLat]       = useState('')
  const [poleLng, setPoleLng]       = useState('')
  const [poleSeq, setPoleSeq]       = useState('')
  const [savingPole, setSavingPole] = useState(false)
  const [poleError, setPoleError]   = useState<string | null>(null)
  // Existing pole search
  const [poleSearch2, setPoleSearch2]       = useState('')
  const [allSystemPoles, setAllSystemPoles] = useState<Array<{ id: number; pole_code: string; lat: string | null; lng: string | null }>>([])
  const [searching, setSearching]           = useState(false)
  const [attachingId, setAttachingId]       = useState<number | null>(null)

  const searchResults = poleSearch2.trim().length >= 2
    ? allSystemPoles.filter(p => p.pole_code.toLowerCase().includes(poleSearch2.toLowerCase()))
    : []

  const load = async () => {
    if (!nodeId) return
    setLoading(true)
    try {
      const [nodeRes, polesRes, spansRes] = await Promise.all([
        fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: h() }),
        fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: h() }),
        fetch(`${SKYCABLE_API}/spans?node_id=${nodeId}&per_page=100`, { headers: h() }),
      ])
      const [nodeData, polesData, spansData] = await Promise.all([nodeRes.json(), polesRes.json(), spansRes.json()])
      setNode(nodeData?.data ?? nodeData)
      const rawPoles = Array.isArray(polesData) ? polesData : (polesData?.data ?? [])
      setPoles(rawPoles.map((p: any) => ({
        id:              p.id,
        pole_code:       p.pole?.pole_code ?? `#${p.id}`,
        lat:             p.pole?.lat   ?? null,
        lng:             p.pole?.lng   ?? null,
        skycable_status: p.pole?.skycable_status ?? 'pending',
        barangay:        p.pole?.barangay ?? null,
        sequence:        p.sequence ?? null,
        photos:          p.pole?.photos ?? null,
      })))
      setSpans(Array.isArray(spansData) ? spansData : (spansData?.data ?? []))
    } catch { /* keep empty */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [nodeId])

  // Vicinity map — initialise when spans tab is visible and data loaded
  useEffect(() => {
    if (activeTab !== 'spans' || !vicinityMapRef.current) return
    if (vicinityMapObj.current) { vicinityMapObj.current.remove(); vicinityMapObj.current = null }

    const gpsPoles = poles.filter(p => p.lat && p.lng)
    if (gpsPoles.length === 0) return

    const map = L.map(vicinityMapRef.current, { zoomControl: true, attributionControl: false })
    vicinityMapObj.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map)

    const STATUS_COLOR: Record<string, string> = {
      pending: '#f59e0b', in_progress: '#8b5cf6', cleared: '#10b981',
    }

    // Draw span connection lines first (below markers)
    spans.forEach(span => {
      const fp = poles.find(p => p.id === span.from_pole?.id)
      const tp = poles.find(p => p.id === span.to_pole?.id)
      if (!fp?.lat || !fp?.lng || !tp?.lat || !tp?.lng) return
      L.polyline([[Number(fp.lat), Number(fp.lng)], [Number(tp.lat), Number(tp.lng)]], {
        color: '#6366f1', weight: 3, opacity: 0.85, dashArray: '8 5',
      }).bindTooltip(
        `<div style="background:#1e1b4b;color:#a5b4fc;font-weight:700;font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid #4338ca40">${span.span_code ?? `SPAN-${span.id}`}</div>`,
        { permanent: false, direction: 'center', className: 'span-length-tooltip' }
      ).addTo(map)
    })

    // Draw pole markers on top
    gpsPoles.forEach(p => {
      const color = STATUS_COLOR[p.skycable_status] ?? '#6b7280'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.85);box-shadow:0 0 8px ${color}88"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      L.marker([Number(p.lat), Number(p.lng)], { icon })
        .bindPopup(`<div style="min-width:130px;font-family:monospace"><div style="font-size:12px;font-weight:900;color:#1e293b">${p.pole_code}</div><div style="font-size:10px;color:${color};font-weight:700;margin-top:3px">${p.skycable_status.replace(/_/g,' ')}</div></div>`)
        .addTo(map)
    })

    setTimeout(() => {
      map.invalidateSize()
      const bounds = L.latLngBounds(gpsPoles.map(p => [Number(p.lat), Number(p.lng)]))
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 })
    }, 120)

    return () => { map.remove(); vicinityMapObj.current = null }
  }, [activeTab, poles, spans])

  const filteredPoles = useMemo(() => {
    const q = poleSearch.toLowerCase()
    if (!q) return poles
    return poles.filter(p =>
      p.pole_code.toLowerCase().includes(q) ||
      (p.barangay?.name ?? '').toLowerCase().includes(q)
    )
  }, [poles, poleSearch])

  // ── Span CRUD ───────────────────────────────────────────────────────────────

  const openAddSpan = (fromPole?: Pole, toPole?: Pole) => {
    setEditSpan(null)
    setSpanForm({
      ...emptySpanForm(),
      from_pole_id: fromPole ? String(fromPole.id) : '',
      to_pole_id:   toPole   ? String(toPole.id)   : '',
    })
    setSpanError(null)
    setSpanModal(true)
  }

  const openEditSpan = (span: Span) => {
    setEditSpan(span)
    setSpanForm({
      from_pole_id: span.from_pole ? String(span.from_pole.id) : '',
      to_pole_id:   span.to_pole   ? String(span.to_pole.id)   : '',
      span_code:    span.span_code ?? '',
      strand_length: String(span.strand_length ?? ''),
      number_of_runs: String(span.number_of_runs ?? 1),
      nodes_count: '0', amplifier: '0', extender: '0', tsc: '0',
    })
    setSpanError(null)
    setSpanModal(true)
  }

  const saveSpan = async () => {
    if (!spanForm.from_pole_id || !spanForm.to_pole_id) { setSpanError('Select both poles.'); return }
    if (spanForm.from_pole_id === spanForm.to_pole_id) { setSpanError('From and To poles must be different.'); return }
    setSavingSpan(true); setSpanError(null)
    try {
      const body: Record<string, unknown> = {
        node_id:        Number(nodeId),
        from_pole_id:   Number(spanForm.from_pole_id),
        to_pole_id:     Number(spanForm.to_pole_id),
        span_code:      spanForm.span_code || undefined,
        strand_length:  spanForm.strand_length ? Number(spanForm.strand_length) : undefined,
        number_of_runs: Number(spanForm.number_of_runs) || 1,
        nodes_count:    Number(spanForm.nodes_count),
        amplifier:      Number(spanForm.amplifier),
        extender:       Number(spanForm.extender),
        tsc:            Number(spanForm.tsc),
      }
      const url  = editSpan ? `${SKYCABLE_API}/spans/${editSpan.id}` : `${SKYCABLE_API}/spans`
      const method = editSpan ? 'PUT' : 'POST'
      const res  = await fetch(url, { method, headers: h(), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to save span')
      if (!editSpan && spanForm.from_pole_id && spanForm.to_pole_id) {
        setSavedPairs(prev => [...prev, { from: Number(spanForm.from_pole_id), to: Number(spanForm.to_pole_id) }])
      }
      setSpanModal(false)
      load()
    } catch (e: any) {
      setSpanError(e.message)
    } finally { setSavingSpan(false) }
  }

  const confirmDeleteSpan = async () => {
    if (!delSpan) return
    await fetch(`${SKYCABLE_API}/spans/${delSpan.id}`, { method: 'DELETE', headers: h() })
    setDelSpan(null)
    load()
  }

  // ── Pole CRUD ────────────────────────────────────────────────────────────────

  const openPoleModal = () => {
    setPoleCode(''); setPoleLat(''); setPoleLng(''); setPoleSeq('')
    setPoleError(null); setPoleTab('new')
    setPoleSearch2(''); setAllSystemPoles([])
    setPoleModal(true)
  }

  const saveNewPole = async () => {
    if (!poleCode.trim()) { setPoleError('Pole code is required.'); return }
    setSavingPole(true); setPoleError(null)
    try {
      const body: Record<string, unknown> = {
        pole_code: poleCode.trim().toUpperCase(),
        node_id: Number(nodeId),
      }
      if (poleLat) body.lat = poleLat
      if (poleLng) body.lng = poleLng
      if (poleSeq) body.sequence = Number(poleSeq)
      const res  = await fetch(`${SKYCABLE_API}/poles`, { method: 'POST', headers: h(), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to create pole')
      setPoleModal(false)
      load()
    } catch (e: any) {
      setPoleError(e.message)
    } finally { setSavingPole(false) }
  }

  const loadAllSystemPoles = async () => {
    if (allSystemPoles.length > 0) return
    setSearching(true)
    try {
      const res  = await fetch(`${SKYCABLE_API}/poles/all`, { headers: h() })
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      setAllSystemPoles(list.map((p: any) => ({ id: p.id, pole_code: p.pole_code, lat: p.lat ?? null, lng: p.lng ?? null })))
    } catch { /* keep empty */ }
    finally { setSearching(false) }
  }

  const searchExistingPoles = (q: string) => { setPoleSearch2(q) }

  const attachExistingPole = async (poleId: number) => {
    setAttachingId(poleId)
    try {
      const res  = await fetch(`${SKYCABLE_API}/nodes/${nodeId}/import-poles`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({ poles: [poleId] }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Failed to attach pole') }
      setPoleModal(false)
      load()
    } catch (e: any) {
      setPoleError(e.message)
    } finally { setAttachingId(null) }
  }

  // ── Computed span cable ──────────────────────────────────────────────────────
  const spanCable = useMemo(() => {
    const len = parseFloat(spanForm.strand_length)
    const runs = parseInt(spanForm.number_of_runs) || 1
    if (!isNaN(len)) return (len * runs).toFixed(1)
    return '—'
  }, [spanForm.strand_length, spanForm.number_of_runs])

  // ── Stats ───────────────────────────────────────────────────────────────────
  const poleStats = useMemo(() => ({
    total:    poles.length,
    pending:  poles.filter(p => p.skycable_status === 'pending').length,
    active:   poles.filter(p => p.skycable_status === 'in_progress').length,
    cleared:  poles.filter(p => p.skycable_status === 'cleared').length,
  }), [poles])

  const spanStats = useMemo(() => ({
    total:    spans.length,
    pending:  spans.filter(s => s.status === 'pending').length,
    ongoing:  spans.filter(s => s.status === 'in_progress').length,
    done:     spans.filter(s => s.status === 'completed').length,
  }), [spans])

  // ── Shared CSS ────────────────────────────────────────────────────────────────
  const fiCls = 'h-9 w-full rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-600 dark:bg-zinc-800 dark:text-slate-200 dark:hover:border-zinc-500 dark:focus:border-violet-500'
  const thCls = 'whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500'
  const tdCls = 'px-4 py-3 text-sm text-slate-700 dark:text-zinc-300'

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500">Loading…</p>
      </div>
    </div>
  )

  // Active stat cards swap based on tab
  const poleStatCards = [
    { label: 'Total Poles', value: poleStats.total,   icon: 'bx bx-current-location', accent: 'from-sky-500 to-blue-500',      ring: 'ring-sky-200 dark:ring-sky-500/20' },
    { label: 'Pending',     value: poleStats.pending,  icon: 'bx bx-time-five',         accent: 'from-amber-400 to-orange-500',  ring: 'ring-amber-200 dark:ring-amber-500/20' },
    { label: 'Active',      value: poleStats.active,   icon: 'bx bx-loader-circle',     accent: 'from-violet-500 to-purple-500', ring: 'ring-violet-200 dark:ring-violet-500/20' },
    { label: 'Cleared',     value: poleStats.cleared,  icon: 'bx bx-check-circle',      accent: 'from-emerald-500 to-teal-500',  ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
  ]
  const spanStatCards = [
    { label: 'Total Spans', value: spanStats.total,   icon: 'bx bx-git-branch',        accent: 'from-sky-500 to-blue-500',      ring: 'ring-sky-200 dark:ring-sky-500/20' },
    { label: 'Pending',     value: spanStats.pending,  icon: 'bx bx-time-five',         accent: 'from-amber-400 to-orange-500',  ring: 'ring-amber-200 dark:ring-amber-500/20' },
    { label: 'Ongoing',     value: spanStats.ongoing,  icon: 'bx bx-loader-circle',     accent: 'from-violet-500 to-purple-500', ring: 'ring-violet-200 dark:ring-violet-500/20' },
    { label: 'Completed',   value: spanStats.done,     icon: 'bx bx-check-circle',      accent: 'from-emerald-500 to-teal-500',  ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
  ]
  const activeStatCards = activeTab === 'poles' ? poleStatCards : spanStatCards

  return (
    <div className="space-y-6 pb-10">

      {/* ── Page header ── */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <nav className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <Link to="/sites" className="hover:text-violet-600 transition-colors">Sites</Link>
              <span>/</span>
              <Link to={`/sites/${siteId}/nodes`} className="hover:text-violet-600 transition-colors">Nodes</Link>
              <span>/</span>
              <span className="text-slate-600 dark:text-zinc-200">{node?.name ?? '…'}</span>
            </nav>
            <h1 className="text-xl font-black tracking-tight text-slate-800 dark:text-zinc-100">
              {node?.full_label ?? node?.name ?? `Node #${nodeId}`}
            </h1>
            {node?.barangay?.name && (
              <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-1">
                <i className="bx bx-map-pin" />{node.barangay.name}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {admin && (
              <>
                <button onClick={openPoleModal} className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]">
                  <i className="bx bx-current-location text-sm" />Add Pole
                </button>
                <button onClick={() => openAddSpan()} className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-slate-800 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 active:scale-[0.99] dark:bg-zinc-700 dark:hover:bg-zinc-600">
                  <i className="bx bx-git-branch text-sm" />Add Span
                </button>
                {admin && (
                  <button onClick={() => setCanvasModal(true)} className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    <i className="bx bx-map-alt text-sm" />Map
                  </button>
                )}
              </>
            )}
            <button onClick={() => navigate(-1)} className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {activeStatCards.map(c => (
          <div key={c.label} className={`relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ${c.ring} flex flex-col justify-between p-4 min-h-[96px]`}>
            <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r ${c.accent}`} />
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-tight">{c.label}</p>
              <i className={`${c.icon} text-xl text-slate-300 dark:text-zinc-600 shrink-0`} />
            </div>
            <p className="text-[28px] font-bold leading-none text-slate-800 dark:text-zinc-100">{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-zinc-800 w-fit">
        {(['poles', 'spans'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-white text-violet-700 shadow-sm dark:bg-zinc-700 dark:text-violet-300'
                : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {tab === 'poles' ? `Poles (${poleStats.total})` : `Spans (${spanStats.total})`}
          </button>
        ))}
      </div>

      {/* ══ POLES TABLE ══ */}
      {activeTab === 'poles' && (
        <div className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-700">
            <div>
              <h4 className="text-base font-semibold text-slate-800 dark:text-zinc-100">Poles</h4>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">All poles enrolled in this node</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                <input
                  value={poleSearch} onChange={e => setPoleSearch(e.target.value)}
                  placeholder="Search poles…"
                  className={`${fiCls} pl-8 w-48`}
                />
              </div>
              <span className="text-xs font-medium text-slate-400 dark:text-zinc-500">
                {filteredPoles.length} {filteredPoles.length === 1 ? 'pole' : 'poles'}
              </span>
              {admin && (
                <button onClick={openPoleModal} className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]">
                  <i className="bx bx-plus text-base" />Add Pole
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-zinc-700/40">
                  {['Seq', 'Pole Code', 'Barangay', 'GPS', 'Photos', 'Spans', 'Status', 'Actions'].map(col => (
                    <th key={col} className={`${thCls} ${col === 'Pole Code' || col === 'Barangay' ? 'text-left' : 'text-center'}`}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-zinc-700/50">
                {filteredPoles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center text-slate-400 dark:text-zinc-500">
                      <i className="bx bx-current-location text-3xl block mb-2" />
                      No poles found
                    </td>
                  </tr>
                ) : filteredPoles.map(pole => {
                  const pcfg = POLE_STATUS_CFG[pole.skycable_status] ?? POLE_STATUS_CFG.pending
                  const poleSpanCount = spans.filter(s => s.from_pole?.id === pole.id || s.to_pole?.id === pole.id).length
                  return (
                    <tr key={pole.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-zinc-700/30">
                      <td className={`${tdCls} text-center`}>
                        <span className="rounded-lg bg-slate-100 dark:bg-zinc-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-500 dark:text-zinc-300">
                          {pole.sequence ?? '—'}
                        </span>
                      </td>
                      <td className={tdCls}>
                        <p className="font-mono text-[13px] font-semibold text-violet-600 dark:text-violet-400">{pole.pole_code}</p>
                      </td>
                      <td className={`${tdCls} text-slate-500 dark:text-zinc-400`}>
                        {pole.barangay?.name ?? <span className="text-slate-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className={`${tdCls} text-center`}>
                        {pole.lat && pole.lng ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                            <i className="bx bx-map-pin" />{parseFloat(pole.lat).toFixed(4)}, {parseFloat(pole.lng).toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-zinc-600">No GPS</span>
                        )}
                      </td>
                      <td className={`${tdCls} text-center`}>
                        <div className="inline-flex gap-1">
                          {(['before', 'after', 'pole_tag'] as const).map(type => (
                            <span key={type} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${pole.photos?.[type] ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-400 dark:bg-zinc-700 dark:text-zinc-500'}`}>
                              {type === 'pole_tag' ? 'Tag' : type === 'before' ? 'Bfr' : 'Aft'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={`${tdCls} text-center`}>
                        <button onClick={() => openAddSpan(pole)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-colors dark:bg-zinc-700 dark:text-zinc-300">
                          <i className="bx bx-git-branch text-xs" />{poleSpanCount}
                        </button>
                      </td>
                      <td className={`${tdCls} text-center`}>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${pcfg.cls}`}>
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: pcfg.dot }} />
                          {pcfg.label}
                        </span>
                      </td>
                      <td className={`${tdCls} text-center`}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/sites/${siteId}/nodes/${nodeId}/teardown?poleId=${pole.id}`)}
                            title="Teardown"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                          >
                            <i className="bx bx-camera text-base" />
                          </button>
                          <button
                            onClick={() => openAddSpan(pole)}
                            title="Add span from this pole"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-700 transition-colors dark:hover:bg-violet-500/10 dark:hover:text-violet-400"
                          >
                            <i className="bx bx-git-branch text-base" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ SPANS TAB ══ */}
      {activeTab === 'spans' && (
        <>
        {/* Vicinity map */}
        <div className="overflow-hidden rounded-3xl bg-[#0d1117] shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
              <span className="text-sm font-bold text-white/80">Vicinity Map</span>
              <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] font-semibold text-white/40">
                {poles.filter(p => p.lat && p.lng).length} poles with GPS · {spans.length} spans
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-white/30">
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded-full bg-indigo-500 opacity-80" style={{ backgroundImage: 'repeating-linear-gradient(90deg,transparent,transparent 3px,#0d1117 3px,#0d1117 5px)' }} />Span</span>
              {[{ c: '#f59e0b', l: 'Pending' }, { c: '#8b5cf6', l: 'Active' }, { c: '#10b981', l: 'Cleared' }].map(({ c, l }) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
            </div>
          </div>
          {poles.filter(p => p.lat && p.lng).length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center gap-2 text-white/20">
              <i className="bx bx-map-alt text-4xl" />
              <p className="text-xs font-semibold">No GPS coordinates on poles</p>
            </div>
          ) : (
            <div ref={vicinityMapRef} className="h-[340px] w-full" />
          )}
        </div>

        {/* Spans table card */}
        <div className="rounded-3xl bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-100 dark:ring-zinc-700 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-700">
            <div>
              <h4 className="text-base font-semibold text-slate-800 dark:text-zinc-100">Spans</h4>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">Cable spans between poles in this node</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-400 dark:text-zinc-500">{spans.length} {spans.length === 1 ? 'span' : 'spans'}</span>
              {admin && (
                <button onClick={() => openAddSpan()} className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-700 active:scale-[0.99]">
                  <i className="bx bx-plus text-base" />Add Span
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-zinc-700/40">
                  {['Span Code', 'From Pole', 'To Pole', 'Strand (m)', 'Runs', 'Cable (m)', 'Actual (m)', 'Status', 'Actions'].map(col => (
                    <th key={col} className={`${thCls} ${['Span Code', 'From Pole', 'To Pole'].includes(col) ? 'text-left' : 'text-center'}`}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-zinc-700/50">
                {spans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-14 text-center text-slate-400 dark:text-zinc-500">
                      <i className="bx bx-git-branch text-3xl block mb-2" />
                      No spans declared yet
                    </td>
                  </tr>
                ) : spans.map(span => {
                  const scfg = SPAN_STATUS_CFG[span.status] ?? SPAN_STATUS_CFG.pending
                  const expCable = span.strand_length && span.number_of_runs
                    ? (span.strand_length * span.number_of_runs).toFixed(1)
                    : '—'
                  return (
                    <tr key={span.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-zinc-700/30">
                      <td className={tdCls}>
                        <p className="font-mono text-[13px] font-semibold text-violet-600 dark:text-violet-400">
                          {span.span_code ?? `SPAN-${span.id}`}
                        </p>
                      </td>
                      <td className={tdCls}>
                        <span className="rounded-lg bg-slate-100 dark:bg-zinc-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 dark:text-zinc-300">
                          {span.from_pole?.pole?.pole_code ?? '?'}
                        </span>
                      </td>
                      <td className={tdCls}>
                        <span className="rounded-lg bg-slate-100 dark:bg-zinc-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 dark:text-zinc-300">
                          {span.to_pole?.pole?.pole_code ?? '?'}
                        </span>
                      </td>
                      <td className={`${tdCls} text-center font-mono text-slate-500`}>{span.strand_length ?? '—'}</td>
                      <td className={`${tdCls} text-center text-slate-500`}>{span.number_of_runs ?? '—'}</td>
                      <td className={`${tdCls} text-center font-semibold text-slate-700 dark:text-zinc-200`}>{expCable}</td>
                      <td className={`${tdCls} text-center font-semibold text-slate-700 dark:text-zinc-200`}>{span.actual_cable?.toFixed(1) ?? '—'}</td>
                      <td className={`${tdCls} text-center`}>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${scfg.cls}`}>
                          {scfg.label}
                        </span>
                      </td>
                      <td className={`${tdCls} text-center`}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/sites/${siteId}/nodes/${nodeId}/teardown?spanId=${span.id}`)}
                            title="Start Teardown"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                          >
                            <i className="bx bx-camera text-base" />
                          </button>
                          {admin && (
                            <>
                              <button onClick={() => openEditSpan(span)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-zinc-700 dark:hover:text-zinc-200">
                                <i className="bx bx-edit text-base" />
                              </button>
                              <button onClick={() => setDelSpan(span)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors dark:hover:bg-red-500/10 dark:hover:text-red-400">
                                <i className="bx bx-trash text-base" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* ══ Add Pole Modal ══ */}
      {poleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl dark:bg-zinc-900 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white">Add Pole to Node</h3>
                  <p className="text-sm text-white/60">Register a new pole or attach an existing one</p>
                </div>
                <button onClick={() => setPoleModal(false)} className="h-8 w-8 rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors">
                  <i className="bx bx-x text-lg" />
                </button>
              </div>
              {/* Tabs */}
              <div className="mt-4 flex gap-1 rounded-xl bg-black/20 p-1">
                {(['new', 'existing'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setPoleTab(t); setPoleError(null); if (t === 'existing') loadAllSystemPoles() }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${poleTab === t ? 'bg-white text-[#00704A]' : 'text-white/70 hover:text-white'}`}
                  >
                    {t === 'new' ? 'Create New Pole' : 'Attach Existing'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {poleError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {poleError}
                </div>
              )}

              {poleTab === 'new' ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Pole Code *</label>
                    <input
                      value={poleCode}
                      onChange={e => setPoleCode(e.target.value)}
                      placeholder="e.g. PL-0001"
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm uppercase outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Latitude</label>
                      <input
                        type="number" step="any"
                        value={poleLat}
                        onChange={e => setPoleLat(e.target.value)}
                        placeholder="14.5995"
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Longitude</label>
                      <input
                        type="number" step="any"
                        value={poleLng}
                        onChange={e => setPoleLng(e.target.value)}
                        placeholder="120.9842"
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Sequence (optional)</label>
                    <input
                      type="number" min="1"
                      value={poleSeq}
                      onChange={e => setPoleSeq(e.target.value)}
                      placeholder="Auto-assigned if blank"
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setPoleModal(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                      Cancel
                    </button>
                    <button onClick={saveNewPole} disabled={savingPole} className="flex-1 rounded-2xl bg-[#00704A] py-3 text-sm font-bold text-white hover:bg-[#005C3D] disabled:opacity-60 transition-colors">
                      {savingPole ? 'Saving…' : 'Add Pole'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative">
                    <i className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={poleSearch2}
                      onChange={e => searchExistingPoles(e.target.value)}
                      placeholder="Search by pole code…"
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                    {searching && <i className="bx bx-loader-alt animate-spin absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />}
                  </div>

                  {poleSearch2.length < 2 && (
                    <p className="text-center text-xs text-slate-400">Type at least 2 characters to search</p>
                  )}

                  {searchResults.length > 0 && (
                    <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-zinc-700">
                      {searchResults.map(p => {
                        const alreadyIn = poles.some(ep => ep.pole_code === p.pole_code)
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-sm font-bold text-slate-800 dark:text-white">{p.pole_code}</p>
                              {p.lat && p.lng && (
                                <p className="text-[11px] text-slate-400 font-mono">{parseFloat(p.lat).toFixed(5)}, {parseFloat(p.lng).toFixed(5)}</p>
                              )}
                            </div>
                            {alreadyIn ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Already in node</span>
                            ) : (
                              <button
                                onClick={() => attachExistingPole(p.id)}
                                disabled={attachingId === p.id}
                                className="shrink-0 rounded-xl bg-[#00704A] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#005C3D] disabled:opacity-60 transition-colors"
                              >
                                {attachingId === p.id ? '…' : 'Attach'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {poleSearch2.length >= 2 && !searching && searchResults.length === 0 && (
                    <p className="text-center text-xs text-slate-400">No poles found for "{poleSearch2}"</p>
                  )}

                  <div className="pt-2">
                    <button onClick={() => setPoleModal(false)} className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Canvas Map Modal ══ */}
      {canvasModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center gap-4 px-5 py-4 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 shadow-sm">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center">
              <i className="bx bx-map-alt text-[#00704A] text-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black text-slate-800 dark:text-white">Pole Map — {node?.name}</h3>
              <div className="flex items-center gap-4 mt-0.5">
                <span className="text-xs font-semibold text-slate-500">
                  Step&nbsp;①&nbsp;Click <span className="text-blue-600 font-bold">FROM</span> pole &nbsp;→&nbsp;
                  Step&nbsp;②&nbsp;Click <span className="text-orange-500 font-bold">TO</span> pole
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 font-semibold">
              <span className="hidden sm:flex items-center gap-1.5"><kbd className="rounded bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px]">drag</kbd>pan</span>
              <span className="hidden sm:flex items-center gap-1.5"><kbd className="rounded bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px]">scroll</kbd>zoom</span>
            </div>
            <button
              onClick={() => setCanvasModal(false)}
              className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <i className="bx bx-x text-xl" />
            </button>
          </div>

          {/* Canvas + Sidebar */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Canvas */}
            <div className="flex-1 min-w-0">
              <PoleCanvas
                poles={poles}
                spans={spans}
                onPairSelected={(from, to) => {
                  setCanvasModal(false)
                  openAddSpan(from, to)
                }}
                savedPairs={savedPairs}
              />
            </div>

            {/* Sidebar */}
            <div className="hidden lg:flex w-72 shrink-0 flex-col bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-700 overflow-y-auto">
              {/* Legend */}
              <div className="px-4 py-4 border-b border-slate-100 dark:border-zinc-800">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Legend</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { color: '#2563eb', label: 'From' },
                    { color: '#f97316', label: 'To' },
                    { color: '#22c55e', label: 'Cleared' },
                    { color: '#f59e0b', label: 'Pending' },
                    { color: '#8b5cf6', label: 'Active' },
                    { color: '#94a3b8', label: 'Existing span' },
                    { color: '#3b82f6', label: 'New span' },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-zinc-800 rounded-full px-2.5 py-1">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="px-4 py-4 border-b border-slate-100 dark:border-zinc-800">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Summary</p>
                <div className="space-y-2">
                  {[
                    { label: 'Total poles', value: poles.length },
                    { label: 'With GPS',    value: poles.filter(p => p.lat && p.lng).length },
                    { label: 'Existing spans', value: spans.length },
                  ].map(s => (
                    <div key={s.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{s.label}</span>
                      <span className="font-black text-slate-800 dark:text-white font-mono">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Poles directory */}
              <div className="px-4 py-4 flex-1 min-h-0 flex flex-col">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Poles Directory</p>
                <div className="space-y-1 overflow-y-auto flex-1 pr-1">
                  {poles.map(p => {
                    const cfg = POLE_STATUS_CFG[p.skycable_status] ?? POLE_STATUS_CFG.pending
                    return (
                      <div key={p.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                        <span className="flex-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{p.pole_code}</span>
                        {p.lat && p.lng
                          ? <span className="text-[10px] text-emerald-600 font-semibold">GPS ✓</span>
                          : <span className="text-[10px] text-slate-400">No GPS</span>
                        }
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add/Edit Span Modal ══ */}
      {spanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur p-4">
          <div className="w-full max-w-lg rounded-[28px] bg-white shadow-2xl dark:bg-zinc-900 overflow-hidden">
            {/* Modal header */}
            <div className="bg-gradient-to-r from-[#005C3D] to-[#00704A] px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white">{editSpan ? 'Edit Span' : 'Declare New Span'}</h3>
                  <p className="text-sm text-white/60">Connect two poles with a cable span</p>
                </div>
                <button onClick={() => setSpanModal(false)} className="h-8 w-8 rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors">
                  <i className="bx bx-x text-lg" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {spanError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-600">
                  {spanError}
                </div>
              )}

              {/* From / To poles */}
              <div className="grid grid-cols-2 gap-3">
                {(['from_pole_id', 'to_pole_id'] as const).map(key => (
                  <div key={key}>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {key === 'from_pole_id' ? 'From Pole *' : 'To Pole *'}
                    </label>
                    <select
                      value={spanForm[key]}
                      onChange={e => setSpanForm(f => ({ ...f, [key]: e.target.value }))}
                      className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      <option value="">Select pole…</option>
                      {poles.map(p => (
                        <option key={p.id} value={p.id}>{p.pole_code}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Span code */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Span Code</label>
                <input
                  value={spanForm.span_code}
                  onChange={e => setSpanForm(f => ({ ...f, span_code: e.target.value }))}
                  placeholder="e.g. SP-001 (optional)"
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              {/* Strand length + runs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Strand Length (m)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={spanForm.strand_length}
                    onChange={e => setSpanForm(f => ({ ...f, strand_length: e.target.value }))}
                    placeholder="0.00"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Runs</label>
                  <input
                    type="number" min="1"
                    value={spanForm.number_of_runs}
                    onChange={e => setSpanForm(f => ({ ...f, number_of_runs: e.target.value }))}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              </div>

              {spanForm.strand_length && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Expected Cable</span>
                  <span className="text-lg font-black text-emerald-700">{spanCable}m</span>
                </div>
              )}

              {/* Collectibles */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Expected Collectibles</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['nodes_count', 'amplifier', 'extender', 'tsc'] as const).map(k => (
                    <div key={k}>
                      <label className="mb-1 block text-center text-[10px] font-semibold text-slate-400 capitalize">{k === 'nodes_count' ? 'Nodes' : k}</label>
                      <input
                        type="number" min="0"
                        value={spanForm[k]}
                        onChange={e => setSpanForm(f => ({ ...f, [k]: e.target.value }))}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-sm outline-none focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setSpanModal(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  Cancel
                </button>
                <button onClick={saveSpan} disabled={savingSpan} className="flex-1 rounded-2xl bg-[#00704A] py-3 text-sm font-bold text-white hover:bg-[#005C3D] disabled:opacity-60 transition-colors">
                  {savingSpan ? 'Saving…' : editSpan ? 'Update Span' : 'Declare Span'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Delete Span Confirm ══ */}
      {delSpan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur p-4">
          <div className="w-full max-w-sm rounded-[24px] bg-white shadow-2xl p-6 dark:bg-zinc-900">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <i className="bx bx-trash text-2xl text-red-500" />
            </div>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">Delete Span?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete <strong className="font-mono">{delSpan.span_code ?? `SPAN-${delSpan.id}`}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDelSpan(null)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors dark:border-zinc-700">Cancel</button>
              <button onClick={confirmDeleteSpan} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
