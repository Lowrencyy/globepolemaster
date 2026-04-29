import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { getToken, SKYCABLE_API } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

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

interface Span {
  id: number
  span_code?: string
  status: string
  actual_cable?: number | null
  from_pole?: {
    id: number
    sequence: number
    pole?: {
      id: number
      pole_code: string
      lat?: string | null
      lng?: string | null
    }
  }
  to_pole?: {
    id: number
    sequence: number
    pole?: {
      id: number
      pole_code: string
      lat?: string | null
      lng?: string | null
    }
  }
}

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

const BRAND = {
  blue: '#2E3791',
  blue2: '#4450C4',
  dark: '#1F276F',
  textDark: '#0D123F',
  soft: '#EEF1FF',
  softer: '#F7F8FF',
  panel: '#F4F6FF',
  border: '#D8DCFF',
  borderStrong: '#C9D0FF',
  muted: '#6B73A8',
  muted2: '#8E96C5',
}

const POLE_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: BRAND.blue,
  cleared: '#10b981',
}

const SPAN_COLOR: Record<string, string> = {
  pending: '#94a3b8',
  in_progress: BRAND.blue2,
  completed: '#10b981',
  cancelled: '#ef4444',
}

function makeCircleIcon(color: string, seq: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="12" fill="${color}" stroke="white" stroke-width="2.4"/>
    <text x="15" y="19" text-anchor="middle" font-size="10" font-weight="800" fill="white" font-family="monospace">${seq}</text>
  </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  })
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function safeFileName(value: string) {
  return value
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export default function NodeVicinityMap() {
  const { nodeId: rawId } = useParams<{ nodeId: string }>()
  const nodeId = idFromSlug(rawId ?? '') || Number(rawId)
  const navigate = useNavigate()

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInst = useRef<L.Map | null>(null)

  const [node, setNode] = useState<NodeInfo | null>(() =>
    nodeId ? cacheGet<NodeInfo>(`vic_info_${nodeId}`) : null
  )
  const [poles, setPoles] = useState<PoleRecord[]>(() =>
    nodeId ? cacheGet<PoleRecord[]>(`vic_poles_${nodeId}`) ?? [] : []
  )
  const [spans, setSpans] = useState<Span[]>(() =>
    nodeId ? cacheGet<Span[]>(`vic_spans_${nodeId}`) ?? [] : []
  )

  const [loading, setLoading] = useState(() => {
    if (!nodeId) return true
    return !cacheGet<PoleRecord[]>(`vic_poles_${nodeId}`) && !cacheGet<Span[]>(`vic_spans_${nodeId}`)
  })

  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [noGps, setNoGps] = useState(0)

  const withGpsCount = poles.filter(p => p.pole?.lat && p.pole?.lng).length
  const pct = Math.min(100, Math.round(node?.progress_percentage ?? 0))

  useEffect(() => {
    if (!nodeId) return

    let alive = true

    const hitNode = cacheGet<NodeInfo>(`vic_info_${nodeId}`)
    const hitPoles = cacheGet<PoleRecord[]>(`vic_poles_${nodeId}`)
    const hitSpans = cacheGet<Span[]>(`vic_spans_${nodeId}`)
    const hasCache = Boolean(hitNode || hitPoles || hitSpans)

    if (hitNode) setNode(hitNode)
    if (hitPoles) setPoles(hitPoles)
    if (hitSpans) setSpans(hitSpans)

    if (hasCache) {
      setLoading(false)
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    Promise.all([
      fetch(`${SKYCABLE_API}/nodes/${nodeId}`, {
        headers: authHeaders(),
      }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, {
        headers: authHeaders(),
      }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/nodes/${nodeId}/spans`, {
        headers: authHeaders(),
      }).then(r => r.json()),
    ])
      .then(([nd, pd, sd]) => {
        if (!alive) return

        if (nd?.id) {
          setNode(nd)
          cacheSet(`vic_info_${nodeId}`, nd)
        }

        const pList: PoleRecord[] = Array.isArray(pd) ? pd : pd?.data ?? []
        const sList: Span[] = Array.isArray(sd) ? sd : sd?.data ?? []

        setPoles(pList)
        setSpans(sList)

        cacheSet(`vic_poles_${nodeId}`, pList)
        cacheSet(`vic_spans_${nodeId}`, sList)
      })
      .catch(() => {})
      .finally(() => {
        if (!alive) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      alive = false
    }
  }, [nodeId])

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return

    mapInst.current = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19,
    }).addTo(mapInst.current)

    mapInst.current.setView([14.5995, 120.9842], 12)
  }, [])

  useEffect(() => {
    if (!mapInst.current || loading) return

    const map = mapInst.current
    const withGps = poles.filter(p => p.pole?.lat && p.pole?.lng)

    setNoGps(poles.length - withGps.length)

    map.eachLayer(layer => {
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer)
      }
    })

    if (withGps.length === 0) return

    spans.forEach(span => {
      const fLat = Number(span.from_pole?.pole?.lat)
      const fLng = Number(span.from_pole?.pole?.lng)
      const tLat = Number(span.to_pole?.pole?.lat)
      const tLng = Number(span.to_pole?.pole?.lng)

      if (!fLat || !fLng || !tLat || !tLng) return

      L.polyline(
        [
          [fLat, fLng],
          [tLat, tLng],
        ],
        {
          color: SPAN_COLOR[span.status] ?? '#94a3b8',
          weight: 4,
          opacity: 0.9,
          dashArray: span.status === 'completed' ? undefined : '8 5',
        }
      )
        .bindPopup(
          `<b>${span.span_code ?? `Span #${span.id}`}</b><br/>Status: ${
            span.status
          }${
            span.actual_cable != null
              ? `<br/>Collected: ${Number(span.actual_cable).toFixed(2)} m`
              : ''
          }`
        )
        .addTo(map)
    })

    withGps.forEach(p => {
      const lat = Number(p.pole!.lat)
      const lng = Number(p.pole!.lng)
      const color = POLE_COLOR[p.pole?.skycable_status ?? 'pending'] ?? '#f59e0b'

      L.marker([lat, lng], {
        icon: makeCircleIcon(color, p.sequence),
      })
        .bindPopup(
          `<b>${p.pole!.pole_code}</b><br/>Seq: ${p.sequence} · ${
            p.pole?.skycable_status ?? 'pending'
          }<br/><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small>`
        )
        .addTo(map)
    })

    const bounds = L.latLngBounds(
      withGps.map(p => [Number(p.pole!.lat), Number(p.pole!.lng)] as [number, number])
    )

    map.fitBounds(bounds, {
      padding: [50, 50],
    })

    setTimeout(() => map.invalidateSize(), 120)
  }, [loading, poles, spans])

  useEffect(() => {
    return () => {
      mapInst.current?.remove()
      mapInst.current = null
    }
  }, [])

  async function exportPDF() {
    const withGps = poles.filter(p => p.pole?.lat && p.pole?.lng)
    if (withGps.length === 0) return

    setExporting(true)

    try {
      if (mapInst.current && withGps.length > 0) {
        const bounds = L.latLngBounds(
          withGps.map(p => [Number(p.pole!.lat), Number(p.pole!.lng)] as [number, number])
        )
        mapInst.current.fitBounds(bounds, { padding: [50, 50] })
        mapInst.current.invalidateSize()
      }

      await new Promise(r => setTimeout(r, 2000))

      let mapImgData: string | null = null
      let mapCanvasW = 0
      let mapCanvasH = 0
      if (mapRef.current) {
        try {
          const mapCanvas = await html2canvas(mapRef.current, {
            useCORS: true,
            allowTaint: false,
            scale: 2,
            logging: false,
            imageTimeout: 15000,
            backgroundColor: '#e8edf2',
          })
          mapCanvasW = mapCanvas.width
          mapCanvasH = mapCanvas.height
          mapImgData = mapCanvas.toDataURL('image/jpeg', 0.92)
        } catch (e) {
          console.warn('Tile capture failed, falling back to blank map:', e)
        }
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210
      const M = 12
      let y = 0

      // Header (38mm)
      pdf.setFillColor(46, 55, 145)
      pdf.rect(0, 0, W, 38, 'F')

      pdf.setTextColor(238, 241, 255)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text('GLOBE TELECOM · SKYCABLE TEARDOWN', M, 12)

      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(20)
      pdf.text('Vicinity Map', M, 26)

      pdf.setTextColor(238, 241, 255)
      pdf.setFontSize(7)
      pdf.text('NODE', W - M, 12, { align: 'right' })

      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text(node?.name ?? `Node #${nodeId}`, W - M, 22, { align: 'right' })

      if (node?.full_label) {
        pdf.setFontSize(8)
        pdf.setFont('courier', 'bold')
        pdf.setTextColor(238, 241, 255)
        pdf.text(node.full_label, W - M, 30, { align: 'right' })
      }

      if (node?.area?.name) {
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(216, 220, 255)
        pdf.text(node.area.name, W - M, 36, { align: 'right' })
      }

      y = 38

      // Stats row (18mm)
      const statItems = [
        { label: 'TOTAL POLES', value: String(poles.length), r: 46, g: 55, b: 145 },
        { label: 'WITH GPS', value: String(withGps.length), r: 68, g: 80, b: 196 },
        { label: 'TOTAL SPANS', value: String(spans.length), r: 31, g: 39, b: 111 },
        {
          label: 'PROGRESS',
          value: `${pct}%`,
          r: pct >= 100 ? 16 : pct > 0 ? 46 : 245,
          g: pct >= 100 ? 185 : pct > 0 ? 55 : 158,
          b: pct >= 100 ? 129 : pct > 0 ? 145 : 11,
        },
      ]
      const statW = (W - M * 2) / statItems.length

      pdf.setDrawColor(229, 231, 235)
      pdf.setLineWidth(0.2)
      pdf.line(0, y + 18, W, y + 18)

      statItems.forEach((s, i) => {
        const sx = M + i * statW
        if (i > 0) pdf.line(sx, y, sx, y + 18)

        pdf.setFontSize(6)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(107, 114, 128)
        pdf.text(s.label, sx + statW / 2, y + 6, { align: 'center' })

        pdf.setFontSize(14)
        pdf.setTextColor(s.r, s.g, s.b)
        pdf.text(s.value, sx + statW / 2, y + 15, { align: 'center' })
      })

      y += 18

      // Map image — preserve aspect ratio, add left/right margin
      const imgW = W - M * 2
      const imgH =
        mapCanvasW > 0 && mapCanvasH > 0
          ? Math.round((mapCanvasH / mapCanvasW) * imgW)
          : 120

      if (mapImgData) {
        pdf.addImage(mapImgData, 'JPEG', M, y, imgW, imgH)
      } else {
        pdf.setFillColor(244, 246, 255)
        pdf.rect(M, y, imgW, imgH, 'F')
        pdf.setTextColor(107, 114, 128)
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.text('Map tiles unavailable', M + imgW / 2, y + imgH / 2, { align: 'center' })
      }

      // thin border around the map
      pdf.setDrawColor(216, 220, 255)
      pdf.setLineWidth(0.3)
      pdf.rect(M, y, imgW, imgH, 'S')

      y += imgH + 3

      // Legend (22mm)
      pdf.setFillColor(248, 249, 255)
      pdf.rect(0, y, W, 22, 'F')
      pdf.setDrawColor(229, 231, 235)
      pdf.setLineWidth(0.2)
      pdf.line(0, y, W, y)

      pdf.setFontSize(6)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(107, 114, 128)
      pdf.text('POLES:', M, y + 6)

      let lx = M + 14
      ;(
        [
          ['#f59e0b', 255, 159, 11, 'Pending'],
          [BRAND.blue, 46, 55, 145, 'In Progress'],
          ['#10b981', 16, 185, 129, 'Cleared'],
        ] as [string, number, number, number, string][]
      ).forEach(([, r, g, b, label]) => {
        pdf.setFillColor(r, g, b)
        pdf.circle(lx + 1.5, y + 5.5, 1.8, 'F')
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(55, 65, 81)
        pdf.text(label, lx + 5, y + 7)
        lx += 28
      })

      pdf.setFontSize(6)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(107, 114, 128)
      pdf.text('SPANS:', M, y + 17)

      lx = M + 14
      ;(
        [
          [148, 163, 184, 'Pending', true],
          [68, 80, 196, 'In Progress', true],
          [16, 185, 129, 'Completed', false],
        ] as [number, number, number, string, boolean][]
      ).forEach(([r, g, b, label, dashed]) => {
        pdf.setDrawColor(r, g, b)
        pdf.setLineWidth(0.7)
        if (dashed) {
          pdf.setLineDashPattern([1.5, 1], 0)
        } else {
          pdf.setLineDashPattern([], 0)
        }
        pdf.line(lx, y + 16, lx + 8, y + 16)
        pdf.setLineDashPattern([], 0)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(55, 65, 81)
        pdf.text(label, lx + 10, y + 18)
        lx += 32
      })

      y += 22

      // Footer (12mm)
      pdf.setFillColor(241, 245, 249)
      pdf.rect(0, y, W, 12, 'F')
      pdf.setDrawColor(229, 231, 235)
      pdf.setLineWidth(0.2)
      pdf.line(0, y, W, y)

      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(107, 114, 128)
      pdf.text(
        `Generated: ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}`,
        M,
        y + 7.5
      )

      pdf.setFont('helvetica', 'bold')
      pdf.text('Globe Telecom · Skycable Operations', W - M, y + 7.5, { align: 'right' })

      pdf.save(
        `VicinityMap_${safeFileName(node?.full_label ?? node?.name ?? String(nodeId))}.pdf`
      )
    } catch (error) {
      console.error(error)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-[28px] px-6 py-7"
        style={{
          background: `linear-gradient(135deg, #ffffff 0%, ${BRAND.softer} 40%, ${BRAND.soft} 100%)`,
          border: `1px solid ${BRAND.borderStrong}`,
          boxShadow: '0 24px 60px -38px rgba(46,55,145,0.38)',
        }}
      >
        <div
          className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'rgba(46,55,145,0.12)' }}
        />

        <div
          className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'rgba(68,80,196,0.12)' }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                backgroundColor: BRAND.soft,
                color: BRAND.blue,
                border: `1px solid ${BRAND.borderStrong}`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND.blue }} />
              Vicinity Map
            </span>

            <h2
              className="mt-3 text-3xl font-black tracking-[-0.05em]"
              style={{ color: BRAND.blue }}
            >
              {node?.name ?? `Node #${nodeId}`}
            </h2>

            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>
              {node?.full_label ?? 'Pole and span layout'}
              {node?.area?.name ? ` · ${node.area.name}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {refreshing && (
              <span
                className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:inline-flex"
                style={{
                  backgroundColor: BRAND.soft,
                  color: BRAND.blue,
                  border: `1px solid ${BRAND.borderStrong}`,
                }}
              >
                <i className="bx bx-refresh animate-spin text-sm" />
                Updating cache...
              </span>
            )}

            <button
              type="button"
              onClick={() => navigate('/reports/vicinity')}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold"
              style={{
                background: '#ffffff',
                border: `1px solid ${BRAND.borderStrong}`,
                color: BRAND.dark,
              }}
            >
              <i className="bx bx-arrow-back text-base" />
              All Nodes
            </button>

            <button
              type="button"
              onClick={exportPDF}
              disabled={exporting || withGpsCount === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background:
                  exporting || withGpsCount === 0
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
                color: '#ffffff',
              }}
            >
              {exporting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Exporting...
                </>
              ) : (
                <>
                  <i className="bx bx-file-pdf text-base" />
                  Export PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div
        className="rounded-[24px] p-4"
        style={{
          background: BRAND.panel,
          border: `1px solid ${BRAND.border}`,
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Total Poles',
              value: poles.length,
              icon: 'bx bx-map-pin',
              accent: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
            },
            {
              label: 'With GPS',
              value: withGpsCount,
              icon: 'bx bx-current-location',
              accent: 'linear-gradient(135deg, #1F276F 0%, #2E3791 100%)',
            },
            {
              label: 'Total Spans',
              value: spans.length,
              icon: 'bx bx-git-branch',
              accent: 'linear-gradient(135deg, #2E3791 0%, #5362D8 100%)',
            },
            {
              label: 'Progress',
              value: `${pct}%`,
              icon: 'bx bx-trending-up',
              accent:
                pct >= 100
                  ? 'linear-gradient(135deg, #059669, #0d9488)'
                  : pct > 0
                    ? 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)'
                    : 'linear-gradient(135deg, #ea580c, #f59e0b)',
            },
          ].map(card => (
            <div
              key={card.label}
              className="rounded-[20px] bg-white p-4"
              style={{
                border: `1px solid ${BRAND.border}`,
                boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className="text-[10px] font-black uppercase tracking-[0.16em]"
                    style={{ color: BRAND.muted2 }}
                  >
                    {card.label}
                  </p>

                  <p
                    className="mt-2 font-mono text-[28px] font-black leading-none"
                    style={{ color: BRAND.textDark }}
                  >
                    {card.value}
                  </p>
                </div>

                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                  style={{ background: card.accent }}
                >
                  <i className={`${card.icon} text-[22px]`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map card */}
      <div
        className="overflow-hidden rounded-[20px] bg-white"
        style={{
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: BRAND.border }}
        >
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.16em]"
              style={{ color: BRAND.muted2 }}
            >
              Pole & Span Layout
            </p>

            <h3 className="mt-1 text-lg font-black" style={{ color: BRAND.textDark }}>
              {node?.area?.name ?? 'Vicinity Map'}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {noGps > 0 && withGpsCount > 0 && (
              <span
                className="rounded-xl px-3 py-2 text-xs font-black"
                style={{
                  backgroundColor: '#fffbeb',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                }}
              >
                {noGps} missing GPS
              </span>
            )}

            <span
              className="rounded-xl px-3 py-2 text-xs font-black"
              style={{
                backgroundColor: BRAND.softer,
                color: BRAND.muted,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              {withGpsCount}/{poles.length} poles mapped
            </span>
          </div>
        </div>

        <div className="relative" style={{ height: 560 }}>
          <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
              <div className="text-center">
                <div
                  className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }}
                />
                <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>
                  Loading map...
                </p>
              </div>
            </div>
          )}

          {!loading && withGpsCount === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: BRAND.soft,
                  color: BRAND.blue,
                }}
              >
                <i className="bx bx-map-pin text-3xl" />
              </div>

              <p className="text-sm font-bold" style={{ color: BRAND.textDark }}>
                No GPS coordinates found
              </p>

              <p className="max-w-sm text-center text-xs font-semibold" style={{ color: BRAND.muted }}>
                Poles in this node do not have usable latitude and longitude coordinates yet.
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          className="flex flex-wrap gap-6 border-t px-5 py-3"
          style={{
            background: BRAND.softer,
            borderColor: BRAND.border,
          }}
        >
          <div>
            <p
              className="mb-2 text-[9px] font-black uppercase tracking-[0.16em]"
              style={{ color: BRAND.muted2 }}
            >
              Poles
            </p>

            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['#f59e0b', 'Pending'],
                  [BRAND.blue, 'In Progress'],
                  ['#10b981', 'Cleared'],
                ] as [string, string][]
              ).map(([color, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-full border-2 border-white shadow-sm"
                    style={{ background: color }}
                  />
                  <span className="text-[10px] font-bold" style={{ color: BRAND.muted }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p
              className="mb-2 text-[9px] font-black uppercase tracking-[0.16em]"
              style={{ color: BRAND.muted2 }}
            >
              Spans
            </p>

            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['#94a3b8', 'Pending', true],
                  [BRAND.blue2, 'In Progress', true],
                  ['#10b981', 'Completed', false],
                ] as [string, string, boolean][]
              ).map(([color, label, dashed]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <svg width="22" height="6">
                    <line
                      x1="0"
                      y1="3"
                      x2="22"
                      y2="3"
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray={dashed ? '5 3' : undefined}
                    />
                  </svg>

                  <span className="text-[10px] font-bold" style={{ color: BRAND.muted }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2.5"
          style={{
            background: BRAND.softer,
            borderColor: BRAND.border,
          }}
        >
          <p className="text-[9px] font-semibold" style={{ color: BRAND.muted2 }}>
            Generated:{' '}
            {new Date().toLocaleString('en-PH', {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </p>

          <p
            className="text-[9px] font-black uppercase tracking-[0.16em]"
            style={{ color: BRAND.muted2 }}
          >
            Globe Telecom · Skycable Operations
          </p>
        </div>
      </div>
    </div>
  )
}