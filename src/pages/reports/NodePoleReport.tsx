import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'
import jsPDF from 'jspdf'

interface PoleImage {
  id: number
  pole_id: number
  pole_code: string
  image_type: string
  file_path: string
  inventory_type: string
}

interface PoleGroup {
  pole_code: string
  inventory_type: string
  before?: string | null
  after?: string | null
  pole_tag?: string | null
  justification?: string | null
}

interface NodeInfo {
  id: number
  name: string
  full_label?: string | null
  status: string
  area?: { id: number; name: string } | null
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

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function imgUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${API_BASE}/api/v1/files/${path}`
}

// ── Module-level image blob cache ─────────────────────────────────────────────
// Persists across SPA navigations so images only download once per session.
// Keys are full src URLs. Values are object URLs created from fetched blobs.
const _imgBlobCache   = new Map<string, string>()           // src → blobUrl
const _imgInFlight    = new Map<string, Promise<string | null>>() // src → in-flight promise

function fetchCachedBlob(src: string): Promise<string | null> {
  // Already cached — return immediately
  if (_imgBlobCache.has(src)) return Promise.resolve(_imgBlobCache.get(src)!)

  // Deduplicate concurrent requests for the same src
  const existing = _imgInFlight.get(src)
  if (existing) return existing

  const promise = fetch(src, {
    headers: {
      'ngrok-skip-browser-warning': '1',
      Authorization: `Bearer ${getToken()}`,
    },
  })
    .then(r => {
      if (!r.ok) return null
      return r.blob()
    })
    .then(blob => {
      if (!blob) return null
      const url = URL.createObjectURL(blob)
      _imgBlobCache.set(src, url)
      return url
    })
    .catch(() => null)
    .finally(() => _imgInFlight.delete(src))

  _imgInFlight.set(src, promise)
  return promise
}

function SafeImage({ src, alt, className, style, onClick }: {
  src: string | null
  alt?: string
  className?: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
}) {
  // Initialise from cache — if already downloaded, no loading state at all
  const [blobUrl, setBlobUrl] = useState<string | null>(() =>
    src ? (_imgBlobCache.get(src) ?? null) : null
  )
  const [loading, setLoading] = useState(() =>
    !!src && !_imgBlobCache.has(src)
  )

  useEffect(() => {
    if (!src) return
    // Already in cache — show immediately, skip fetch
    if (_imgBlobCache.has(src)) {
      setBlobUrl(_imgBlobCache.get(src)!)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetchCachedBlob(src).then(url => {
      if (!alive) return
      setBlobUrl(url)
      setLoading(false)
    })
    return () => { alive = false }
    // NOTE: do NOT revoke blob URLs here — they are owned by the module-level
    // cache and must stay valid for future renders of the same image.
  }, [src])

  if (!src) return null

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-100 animate-pulse`}>
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!blobUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-50 text-[11px] font-semibold text-zinc-400`}
        style={{ borderStyle: 'dashed', borderWidth: 1, borderColor: '#D8DCFF' }}>
        No Photo
      </div>
    )
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
    />
  )
}

export default function NodePoleReport() {
  const { nodeId: rawId } = useParams<{ nodeId: string }>()
  const nodeId = idFromSlug(rawId ?? '') || Number(rawId)
  const navigate = useNavigate()
  const printRef = useRef<HTMLDivElement>(null)

  const [node, setNode] = useState<NodeInfo | null>(() =>
    nodeId ? cacheGet<NodeInfo>(`pr_info_${nodeId}`) : null
  )
  const [rows, setRows] = useState<PoleGroup[]>(() =>
    nodeId ? cacheGet<PoleGroup[]>(`pr_rows_v3_${nodeId}`) ?? [] : []
  )
  const [loading, setLoading] = useState(() => !cacheGet<PoleGroup[]>(`pr_rows_v3_${nodeId}`))
  const [refreshing, setRefreshing] = useState(false)

  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null)

  useEffect(() => {
    if (!nodeId) return
    let alive = true

    const hitNode = cacheGet<NodeInfo>(`pr_info_${nodeId}`)
    const hitRows = cacheGet<PoleGroup[]>(`pr_rows_v4_${nodeId}`)

    if (hitNode) setNode(hitNode)
    if (hitRows && hitRows.length > 0) { setRows(hitRows); setLoading(false); setRefreshing(true) }
    else setLoading(true)

    async function loadImages() {
      const groups: Record<string, PoleGroup> = {}

      function addPhoto(key: string, poleCode: string, type: string, path: string | null | undefined) {
        if (!path) return
        if (!groups[key]) groups[key] = { pole_code: poleCode, inventory_type: 'skycable' }
        if (type === 'before'   && !groups[key].before)   groups[key].before   = path
        if (type === 'after'    && !groups[key].after)    groups[key].after    = path
        if (type === 'pole_tag' && !groups[key].pole_tag) groups[key].pole_tag = path
      }

      try {
        const nd = await fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() })
          .then(r => r.ok ? r.json() : null).catch(() => null)
        if (!alive) return
        if (nd?.id) { setNode(nd); cacheSet(`pr_info_${nodeId}`, nd) }
      } catch {}

      // Source 1: PoleTeardownImage records for this node
      try {
        const res = await fetch(`${API_BASE}/api/v1/teardown/node-images/${nodeId}`, { headers: authHeaders() })
        if (res.ok) {
          const rd = await res.json()
          const images: PoleImage[] = Array.isArray(rd) ? rd : (rd?.data ?? [])
          images.forEach(img => {
            const key = `${img.inventory_type ?? 'skycable'}_${img.pole_code}`
            addPhoto(key, img.pole_code, img.image_type, img.file_path)
          })
        }
      } catch {}

      // Source 2: Pole reports for this node
      try {
        const res = await fetch(`${SKYCABLE_API}/pole-reports?node_id=${nodeId}&per_page=200`, { headers: authHeaders() })
        if (res.ok) {
          const data = await res.json()
          const reports: any[] = Array.isArray(data) ? data : (data?.data ?? [])
          reports.forEach(report => {
            const poleCode = report.pole?.pole_code ?? `Pole#${report.pole_id}`
            const key = `skycable_${poleCode}`;
            (report.photos ?? []).forEach((p: any) => {
              addPhoto(key, poleCode, p.image_type, p.file_path)
            })
            if (!groups[key]) groups[key] = { pole_code: poleCode, inventory_type: 'skycable' }
            if (!groups[key].justification) {
              const parts = [report.notes?.trim(), report.landmark?.trim()].filter(Boolean)
              if (parts.length) groups[key].justification = parts.join(' · ')
            }
          })
        }
      } catch {}

      // Source 3: Fallback — span teardown photos (only if nothing found yet)
      if (Object.keys(groups).length === 0) {
        try {
          const res = await fetch(`${SKYCABLE_API}/teardowns?node_id=${nodeId}&per_page=500`, { headers: authHeaders() })
          if (res.ok) {
            const data = await res.json()
            const logs: any[] = Array.isArray(data) ? data : (data?.data ?? [])
            await Promise.all(logs.map(async (log) => {
              try {
                let detail = log
                if (!detail.photos?.length) {
                  const r = await fetch(`${SKYCABLE_API}/teardowns/${log.id}`, { headers: authHeaders() })
                  if (r.ok) detail = await r.json()
                }
                const photos: any[] = detail.photos ?? []
                const span     = detail.span ?? log.span
                const fromCode = span?.fromPole?.pole?.pole_code ?? span?.from_pole?.pole?.pole_code ?? `Log#${log.id}`
                const toCode   = span?.toPole?.pole?.pole_code   ?? span?.to_pole?.pole?.pole_code   ?? null
                photos.forEach((p: any) => {
                  const code = p.photo_type?.startsWith('to_') ? (toCode ?? fromCode) : fromCode
                  const key  = `skycable_${code}`
                  const type = p.photo_type?.includes('before') ? 'before' : p.photo_type?.includes('after') ? 'after' : p.photo_type?.includes('tag') ? 'pole_tag' : ''
                  addPhoto(key, code, type, p.image_path)
                })
              } catch {}
            }))
          }
        } catch {}
      }

      if (!alive) return
      const list = Object.values(groups)
      setRows(list)
      cacheSet(`pr_rows_v4_${nodeId}`, list)
      setLoading(false)
      setRefreshing(false)
    }
    loadImages()

    return () => { alive = false }
  }, [nodeId])

  // Inject print styles
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'npr-print-styles'
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        body > * { visibility: hidden !important; }
        #npr-printable { visibility: visible !important; position: fixed; inset: 0; z-index: 99999; background: #fff; overflow: auto; }
        #npr-printable * { visibility: visible !important; }
        .npr-pole-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8mm; }
        .npr-photos-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin: 3mm 0; }
        .npr-photo-box { border: 1px solid #C9D0FF; border-radius: 4mm; padding: 2mm; background: #fff; min-height: 55mm; display: flex; flex-direction: column; align-items: center; }
        .npr-photo-box img { width: 100%; max-height: 50mm; object-fit: contain; display: block; }
        .npr-photo-label { font-size: 7pt; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: .08em; color: #6B73A8; margin-top: 2mm; }
        .npr-no-photo { width: 100%; min-height: 50mm; display: flex; align-items: center; justify-content: center; border: 1px dashed #C9D0FF; border-radius: 3mm; font-size: 7pt; color: #8E96C5; font-style: italic; }
        .npr-pole-header { display: flex; align-items: center; gap: 4mm; padding: 2mm 3mm; background: #F4F6FF; border: 1px solid #D8DCFF; border-radius: 3mm; margin-bottom: 2mm; }
        .npr-pole-num { font-size: 9pt; font-weight: 900; color: #1F276F; font-family: monospace; }
        .npr-pole-code { font-size: 9pt; font-weight: 900; color: #2E3791; }
        .npr-just-box { border: 1px dashed #C9D0FF; border-radius: 3mm; padding: 2mm 3mm; font-size: 8pt; line-height: 1.5; color: #475569; background: #F7F8FF; min-height: 10mm; }
        .npr-just-label { font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: #8E96C5; margin-bottom: 1mm; }
        .npr-doc-header { display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 5mm; border: 1px solid #C9D0FF; border-radius: 2mm; overflow: hidden; }
        .npr-doc-hdr-left { background: #2E3791; color: #fff; padding: 3mm 5mm; font-size: 9pt; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; display: flex; align-items: center; flex: 0 0 44%; }
        .npr-doc-hdr-right { background: #fff; color: #0D123F; padding: 3mm 5mm; font-size: 9pt; font-weight: 800; display: flex; align-items: center; flex: 1; }
        .npr-gen-date { font-size: 7pt; color: #8E96C5; text-align: right; margin-bottom: 3mm; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('npr-print-styles')?.remove() }
  }, [])

  const [exporting, setExporting] = useState(false)

  function getImgNaturalSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 1, h: 1 })
      img.src = dataUrl
    })
  }

  async function fetchDataUrl(url: string): Promise<string | null> {
    try {
      // Reuse cached blob if already downloaded — avoids duplicate network calls during PDF export
      const blobUrl = await fetchCachedBlob(url)
      if (!blobUrl) return null
      const res = await fetch(blobUrl) // fetch from local blob: URL — instant, no network
      const blob = await res.blob()
      return new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  async function handleExportPDF() {
    if (rows.length === 0 || exporting) return
    setExporting(true)
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const PW = 210, PH = 297
      const ML = 7, MR = 7, MT = 7, MB = 10
      const innerW = PW - ML - MR   // 196mm

      // ── Column widths (total = innerW = 196mm) ──────────────────────
      const C_NUM   = 11   // Pic No.
      const C_TAG   = 22   // Pole Tag (code)
      const C_JUST  = 38   // Justification
      const C_PHOTO = (innerW - C_NUM - C_TAG - C_JUST) / 3

      const ROWS_PER_PAGE = 5
      const nodeLine = node ? `${node.name}${node.full_label ? ' — ' + node.full_label : ''}` : `Node #${nodeId}`
      const dateStr  = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

      // Column x positions
      const xNum   = ML
      const xTag   = ML + C_NUM
      const xBef   = xTag  + C_TAG
      const xAft   = xBef  + C_PHOTO
      const xPole  = xAft  + C_PHOTO
      const xJust  = xPole + C_PHOTO

      // ── Page header renderer ────────────────────────────────────────
      function drawPageHeader(startY: number): number {
        let y = startY

        // Top dark bar
        pdf.setFillColor(30, 40, 100)
        pdf.rect(ML, y, innerW, 9, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.text('POLE PICTURE — BEFORE & AFTER', ML + 3, y + 6)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7.5)
        pdf.text(dateStr, PW - MR - 3, y + 6, { align: 'right' })
        y += 9

        // Node info line
        pdf.setFillColor(220, 225, 255)
        pdf.rect(ML, y, innerW, 6, 'F')
        pdf.setTextColor(30, 40, 110)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`Node: ${nodeLine}`, ML + 3, y + 4.2)
        y += 6

        // Column header row
        pdf.setFillColor(240, 242, 250)
        pdf.setDrawColor(60, 60, 60)
        pdf.setLineWidth(0.5)
        pdf.rect(ML, y, innerW, 7, 'FD')

        // Inner column separators in header
        ;[xTag, xBef, xAft, xPole, xJust].forEach(x => {
          pdf.setDrawColor(60, 60, 60)
          pdf.setLineWidth(0.3)
          pdf.line(x, y, x, y + 7)
        })

        pdf.setTextColor(20, 20, 20)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'bold')
        const hdrs = ['Pic\nNo.', 'Pole Tag', 'Before', 'After', 'Pole Tag', 'Justification']
        const hxs  = [xNum + C_NUM/2, xTag + C_TAG/2, xBef + C_PHOTO/2, xAft + C_PHOTO/2, xPole + C_PHOTO/2, xJust + C_JUST/2]
        hdrs.forEach((h, i) => pdf.text(h, hxs[i], y + 4.5, { align: 'center' }))
        y += 7

        return y
      }

      // ── Photo helper — preserves natural aspect ratio (portrait stays portrait) ──
      function drawPhoto(
        dataUrl: string | null,
        px: number, py: number,
        pw: number, ph: number,
        naturalW = 1, naturalH = 1,
      ) {
        const maxW = pw - 2
        const maxH = ph - 2

        if (dataUrl) {
          try {
            // Scale to fit inside cell while keeping original proportions
            const ratio = naturalH / naturalW
            let dw = maxW
            let dh = dw * ratio
            if (dh > maxH) { dh = maxH; dw = dh / ratio }

            // Centre within cell
            const ox = px + 1 + (maxW - dw) / 2
            const oy = py + 1 + (maxH - dh) / 2

            pdf.addImage(dataUrl, 'JPEG', ox, oy, dw, dh, undefined, 'FAST')
          } catch {
            pdf.setFillColor(230, 232, 245)
            pdf.rect(px + 1, py + 1, maxW, maxH, 'F')
            pdf.setTextColor(160, 165, 200)
            pdf.setFontSize(6)
            pdf.text('No Photo', px + pw / 2, py + ph / 2, { align: 'center' })
          }
        } else {
          pdf.setFillColor(230, 232, 245)
          pdf.rect(px + 1, py + 1, maxW, maxH, 'F')
          pdf.setTextColor(160, 165, 200)
          pdf.setFontSize(6)
          pdf.text('No Photo', px + pw / 2, py + ph / 2, { align: 'center' })
        }
      }

      // ── Footer ──────────────────────────────────────────────────────
      function drawFooter(pageNum: number, totalPages: number) {
        pdf.setDrawColor(60, 60, 60)
        pdf.setLineWidth(0.3)
        pdf.line(ML, PH - MB + 1, PW - MR, PH - MB + 1)
        pdf.setTextColor(80, 80, 100)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        pdf.text('TelcoVantage Philippines', ML, PH - MB + 5)
        pdf.text(`Page ${pageNum} of ${totalPages}`, PW - MR, PH - MB + 5, { align: 'right' })
      }

      // ── Pre-fetch all photos + measure natural dimensions ───────────
      type PhotoEntry = { dataUrl: string | null; nw: number; nh: number }
      const allPhotos: PhotoEntry[][] = await Promise.all(
        rows.map(row => Promise.all(
          [row.before, row.after, row.pole_tag].map(async path => {
            if (!path) return { dataUrl: null, nw: 1, nh: 1 }
            const dataUrl = await fetchDataUrl(`${API_BASE}/api/v1/files/${path}`)
            if (!dataUrl) return { dataUrl: null, nw: 1, nh: 1 }
            const { w, h } = await getImgNaturalSize(dataUrl)
            return { dataUrl, nw: w, nh: h }
          })
        ))
      )

      const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE)

      // ── Render pages ─────────────────────────────────────────────────
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage()

        let y = drawPageHeader(MT)

        // Available height for rows on this page
        const availH = PH - y - MB - 6   // leave footer space
        const ROW_H  = availH / ROWS_PER_PAGE

        const pageRows = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)

        for (let ri = 0; ri < pageRows.length; ri++) {
          const row      = pageRows[ri]
          const globalI  = page * ROWS_PER_PAGE + ri
          const rowY     = y + ri * ROW_H
          // Outer row border (thick black)
          pdf.setDrawColor(40, 40, 40)
          pdf.setLineWidth(0.6)
          pdf.rect(ML, rowY, innerW, ROW_H, 'D')

          // Inner column dividers
          pdf.setLineWidth(0.3)
          ;[xTag, xBef, xAft, xPole, xJust].forEach(x => {
            pdf.line(x, rowY, x, rowY + ROW_H)
          })

          // Pic No.
          pdf.setTextColor(20, 20, 20)
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.text(String(globalI + 1), xNum + C_NUM / 2, rowY + ROW_H / 2 + 2, { align: 'center' })

          // Pole Tag code
          pdf.setFontSize(7)
          pdf.setFont('helvetica', 'bold')
          const code = row.pole_code ?? '—'
          pdf.text(code, xTag + C_TAG / 2, rowY + ROW_H / 2 + 1.5, { align: 'center', maxWidth: C_TAG - 2 })

          // Photos: Before / After / Pole Tag
          const photos = allPhotos[globalI] ?? []
          const photoXs = [xBef, xAft, xPole]
          const PAD = 1.5
          photoXs.forEach((px, ci) => {
            const p = photos[ci] ?? { dataUrl: null, nw: 1, nh: 1 }
            drawPhoto(p.dataUrl, px, rowY, C_PHOTO, ROW_H, p.nw, p.nh)
            // Photo label at bottom inside cell
            pdf.setTextColor(60, 60, 80)
            pdf.setFontSize(5.5)
            pdf.setFont('helvetica', 'bold')
            pdf.text(['BEFORE', 'AFTER', 'POLE TAG'][ci], px + C_PHOTO / 2, rowY + ROW_H - PAD, { align: 'center' })
          })

          // Justification
          if (row.justification) {
            pdf.setTextColor(40, 40, 60)
            pdf.setFontSize(6)
            pdf.setFont('helvetica', 'normal')
            pdf.text(row.justification, xJust + 2, rowY + 6, { maxWidth: C_JUST - 4 })
          }

        }

        drawFooter(page + 1, totalPages)
      }

      const safeName = (node?.name ?? `node-${nodeId}`).replace(/[^a-z0-9]/gi, '_').toLowerCase()
      pdf.save(`pole-report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setExporting(false)
    }
  }


  const withBefore = rows.filter(r => r.before).length
  const withAfter = rows.filter(r => r.after).length
  const complete = rows.filter(r => r.before && r.after).length

  return (
    <div className="flex flex-col gap-5 pb-10">

      {/* ── Header ── */}
      <div
        className="relative overflow-hidden rounded-[28px] px-6 py-7"
        style={{
          background: `linear-gradient(135deg, #ffffff 0%, ${BRAND.softer} 40%, ${BRAND.soft} 100%)`,
          border: `1px solid ${BRAND.borderStrong}`,
          boxShadow: '0 24px 60px -38px rgba(46,55,145,0.38)',
        }}
      >
        <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(46,55,145,0.12)' }} />
        <div className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(68,80,196,0.12)' }} />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ backgroundColor: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND.blue }} />
              Pole Report
            </span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]" style={{ color: BRAND.blue }}>
              {node?.name ?? `Node #${nodeId}`}
            </h2>
            <p className="mt-2 text-sm font-semibold" style={{ color: BRAND.muted }}>
              {node?.full_label ?? 'Pole picture before and after'}
              {node?.area?.name ? ` · ${node.area.name}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {refreshing && (
              <span className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:inline-flex"
                style={{ backgroundColor: BRAND.soft, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
                <i className="bx bx-refresh animate-spin text-sm" /> Updating cache...
              </span>
            )}
            <button
              type="button"
              onClick={() => navigate('/reports/pole-reports')}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold"
              style={{ background: '#ffffff', border: `1px solid ${BRAND.borderStrong}`, color: BRAND.dark }}
            >
              <i className="bx bx-arrow-back text-base" /> All Nodes
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={rows.length === 0 || exporting}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: rows.length === 0 || exporting ? '#94a3b8' : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
                color: '#ffffff',
                minWidth: 140,
              }}
            >
              {exporting
                ? <><i className="bx bx-loader-circle bx-spin text-base" /> Generating…</>
                : <><i className="bx bx-file-pdf text-base" /> Export PDF</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="rounded-[24px] p-4" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}` }}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Poles', value: rows.length, icon: 'bx bx-map-pin', accent: 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)' },
            { label: 'With Before', value: withBefore, icon: 'bx bx-camera', accent: 'linear-gradient(135deg, #1F276F 0%, #2E3791 100%)' },
            { label: 'With After', value: withAfter, icon: 'bx bx-image-check', accent: 'linear-gradient(135deg, #2E3791 0%, #5362D8 100%)' },
            { label: 'Complete', value: complete, icon: 'bx bx-check-circle', accent: complete === rows.length && rows.length > 0 ? 'linear-gradient(135deg, #059669, #0d9488)' : 'linear-gradient(135deg, #ea580c, #f59e0b)' },
          ].map(card => (
            <div key={card.label} className="rounded-[20px] bg-white p-4"
              style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>{card.label}</p>
                  <p className="mt-2 font-mono text-[28px] font-black leading-none" style={{ color: BRAND.textDark }}>{card.value}</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: card.accent }}>
                  <i className={`${card.icon} text-[22px]`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Photo table ── */}
      <div className="overflow-hidden rounded-[20px] bg-white"
        style={{ border: `1px solid ${BRAND.border}`, boxShadow: '0 12px 30px -24px rgba(46,55,145,0.35)' }}>

        {/* Doc header */}
        <div className="flex items-stretch overflow-hidden border-b" style={{ borderColor: BRAND.border }}>
          <div className="flex items-center px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white"
            style={{ background: `linear-gradient(180deg, ${BRAND.blue} 0%, ${BRAND.dark} 100%)`, flex: '0 0 auto' }}>
            Pole Picture — Before &amp; After
          </div>
          <div className="flex items-center px-5 py-3 text-sm font-bold" style={{ color: BRAND.textDark }}>
            Node: {node?.name ?? `#${nodeId}`}{node?.full_label ? ` — ${node.full_label}` : ''}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }} />
              <p className="mt-4 text-sm font-bold" style={{ color: BRAND.muted }}>Loading pole photos...</p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: BRAND.muted2 }}>
            <i className="bx bx-camera text-5xl" />
            <p className="mt-3 text-sm font-semibold">No pole photos found for this node yet.</p>
            <p className="mt-1 text-xs" style={{ color: BRAND.muted2 }}>Photos appear once field teams submit teardown logs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ width: 110 }} />
                <col />
                <col />
                <col />
                <col style={{ width: 200 }} />
              </colgroup>
              <thead>
                <tr style={{ background: BRAND.panel }}>
                  {['Pic #', 'Pole Tag', 'Before', 'After', 'Pole Pic', 'Justification'].map(h => (
                    <th key={h} className="border px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.12em]"
                      style={{ borderColor: BRAND.borderStrong, color: BRAND.textDark }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.inventory_type}_${row.pole_code}`} style={{ background: i % 2 === 0 ? '#ffffff' : BRAND.softer }}>

                    {/* Pic # — centered */}
                    <td className="border text-center align-middle" style={{ borderColor: BRAND.border }}>
                      <span className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>{i + 1}</span>
                    </td>

                    {/* Pole Tag — centered vertically & horizontally */}
                    <td className="border text-center align-middle" style={{ borderColor: BRAND.border }}>
                      <div className="flex h-full items-center justify-center">
                        <span className="inline-flex items-center justify-center rounded-xl px-2 py-1.5 text-xs font-black"
                          style={{ background: BRAND.softer, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
                          {row.pole_code ?? '—'}
                        </span>
                      </div>
                    </td>

                    {/* Photos — fixed height, label centered below */}
                    {([
                      { data: row.before,   label: 'BEFORE',   caption: `BEFORE — ${row.pole_code ?? 'N/A'}` },
                      { data: row.after,    label: 'AFTER',    caption: `AFTER — ${row.pole_code ?? 'N/A'}` },
                      { data: row.pole_tag, label: 'POLE TAG', caption: `POLE TAG — ${row.pole_code ?? 'N/A'}` },
                    ] as { data: string | null | undefined; label: string; caption: string }[]).map(({ data, label, caption }, ci) => (
                      <td key={ci} className="border p-0 text-center align-middle" style={{ borderColor: BRAND.border }}>
                        <div className="flex flex-col items-center" style={{ background: '#fff' }}>
                          {/* Image area — fixed height */}
                          <div className="flex h-[240px] w-full items-center justify-center p-1 border-b"
                            style={{ borderColor: '#dff2eb', background: '#fff' }}>
                            {imgUrl(data) ? (
                              <SafeImage
                                src={imgUrl(data)!}
                                alt={caption}
                                className="block max-h-[230px] w-auto max-w-full cursor-pointer rounded object-contain transition hover:scale-[1.02]"
                                onClick={() => setLightbox({ src: imgUrl(data)!, caption })}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center rounded border text-[11px] font-bold uppercase tracking-wider"
                                style={{ borderColor: BRAND.border, color: BRAND.muted2, background: BRAND.softer, borderStyle: 'dashed' }}>
                                No Photo
                              </div>
                            )}
                          </div>
                          {/* Label — centered below image */}
                          <div className="flex items-center justify-center py-1.5">
                            <span className="text-[10px] font-black uppercase tracking-[0.12em]"
                              style={{ color: BRAND.muted2 }}>{label}</span>
                          </div>
                        </div>
                      </td>
                    ))}

                    {/* Justification — centered */}
                    <td className="border text-center align-middle" style={{ borderColor: BRAND.border }}>
                      <div className="flex min-h-[280px] items-center justify-center p-3" style={{ background: '#fff' }}>
                        {row.justification ? (
                          <p className="text-xs leading-relaxed text-center" style={{ color: BRAND.textDark }}>{row.justification}</p>
                        ) : (
                          <span className="text-[10px] font-semibold" style={{ color: BRAND.muted2 }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t px-5 py-2.5"
          style={{ background: BRAND.softer, borderColor: BRAND.border }}>
          <p className="text-[9px] font-semibold" style={{ color: BRAND.muted2 }}>
            Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
          <p className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: BRAND.muted2 }}>
            TelcoVantage Philippines
          </p>
        </div>
      </div>

      {/* ── Print-only hidden layout ── */}
      <div id="npr-printable" ref={printRef} style={{ display: 'none' }}>
        <p className="npr-gen-date">
          Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
        </p>

        <div className="npr-doc-header">
          <div className="npr-doc-hdr-left">Pole Picture — Before &amp; After</div>
          <div className="npr-doc-hdr-right">
            Node: {node?.name ?? `#${nodeId}`}{node?.full_label ? ` — ${node.full_label}` : ''}
            {node?.area?.name ? ` · ${node.area.name}` : ''}
          </div>
        </div>

        {rows.map((row, i) => (
          <div key={`${row.inventory_type}_${row.pole_code}`} className="npr-pole-block">
            <div className="npr-pole-header">
              <span className="npr-pole-num">#{i + 1}</span>
              <span className="npr-pole-code">{row.pole_code ?? '—'}</span>
              <span style={{ fontSize: '7pt', marginLeft: 'auto', opacity: 0.7 }}>{row.inventory_type.toUpperCase()}</span>
            </div>

            <div className="npr-photos-row">
              {([
                { data: row.before, label: 'Before' },
                { data: row.after, label: 'After' },
                { data: row.pole_tag, label: 'Pole Pic' },
              ] as { data: PoleGroup['before']; label: string }[]).map(({ data, label }) => (
                <div key={label} className="npr-photo-box">
                  {imgUrl(data) ? (
                    <SafeImage src={imgUrl(data)!} alt={label} />
                  ) : (
                    <div className="npr-no-photo">No Photo</div>
                  )}
                  <div className="npr-photo-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 p-5"
          style={{ background: 'rgba(0,0,0,0.88)' }}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-xl border px-3 py-1.5 text-xs font-bold text-white"
            style={{ background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.22)' }}
            onClick={() => setLightbox(null)}
          >
            ✕ Close
          </button>
          <SafeImage
            src={lightbox.src}
            alt={lightbox.caption}
            className="max-h-[84vh] max-w-[94vw] rounded-xl object-contain bg-white p-1.5"
            style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.45)' }}
            onClick={e => (e as any).stopPropagation()}
          />
          <p className="max-w-lg text-center text-xs font-bold text-gray-300">{lightbox.caption}</p>
        </div>
      )}
    </div>
  )
}
