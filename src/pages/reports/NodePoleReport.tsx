import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug } from '../../lib/utils'

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

function SafeImage({ src, alt, className, style, onClick }: {
  src: string | null
  alt?: string
  className?: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!src) return
    let alive = true
    setLoading(true)

    fetch(src, {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
      .then(r => r.blob())
      .then(blob => {
        if (!alive) return
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [src])

  if (!src) return null

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-100 animate-pulse`}>
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <img
      src={blobUrl || ''}
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
    nodeId ? cacheGet<PoleGroup[]>(`pr_rows_v2_${nodeId}`) ?? [] : []
  )
  const [loading, setLoading] = useState(() => !cacheGet<PoleGroup[]>(`pr_rows_v2_${nodeId}`))
  const [refreshing, setRefreshing] = useState(false)

  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null)

  useEffect(() => {
    if (!nodeId) return
    let alive = true

    const hitNode = cacheGet<NodeInfo>(`pr_info_${nodeId}`)
    const hitRows = cacheGet<PoleGroup[]>(`pr_rows_v2_${nodeId}`)

    if (hitNode) setNode(hitNode)
    if (hitRows) setRows(hitRows)
    if (hitNode || hitRows) { setLoading(false); setRefreshing(true) }
    else setLoading(true)

    Promise.all([
      fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${SKYCABLE_API}/teardown/node-images/${nodeId}`, { headers: authHeaders() }).then(r => r.json()),
    ])
      .then(([nd, rd]) => {
        if (!alive) return
        if (nd?.id) { setNode(nd); cacheSet(`pr_info_${nodeId}`, nd) }
        
        const images: PoleImage[] = Array.isArray(rd) ? rd : (rd?.data ?? [])
        
        // Group images by pole_code + inventory_type
        const groups: Record<string, PoleGroup> = {}
        images.forEach(img => {
          const key = `${img.inventory_type}_${img.pole_code}`
          if (!groups[key]) {
            groups[key] = {
              pole_code: img.pole_code,
              inventory_type: img.inventory_type,
            }
          }
          if (img.image_type === 'before') groups[key].before = img.file_path
          if (img.image_type === 'after') groups[key].after = img.file_path
          if (img.image_type === 'pole_tag') groups[key].pole_tag = img.file_path
        })

        const list = Object.values(groups)
        setRows(list)
        cacheSet(`pr_rows_v2_${nodeId}`, list)
      })
      .catch(() => {})
      .finally(() => { if (!alive) return; setLoading(false); setRefreshing(false) })

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

  function handlePrint() {
    window.print()
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
              onClick={handlePrint}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: rows.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #2E3791 0%, #4450C4 100%)',
                color: '#ffffff',
              }}
            >
              <i className="bx bx-file-pdf text-base" /> Export PDF
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
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <colgroup>
                <col style={{ width: 60 }} />
                <col style={{ width: 110 }} />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr style={{ background: BRAND.panel }}>
                  {['Pic #', 'Pole Tag', 'Before', 'After', 'Pole Pic'].map(h => (
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
                    <td className="border px-2 py-2 text-center align-top" style={{ borderColor: BRAND.border }}>
                      <span className="font-mono text-sm font-black" style={{ color: BRAND.textDark }}>{i + 1}</span>
                    </td>

                    <td className="border px-2 py-3 text-center align-top" style={{ borderColor: BRAND.border }}>
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center justify-center rounded-xl px-2 py-1.5 text-xs font-black"
                          style={{ background: BRAND.softer, color: BRAND.blue, border: `1px solid ${BRAND.borderStrong}` }}>
                          {row.pole_code ?? '—'}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${row.inventory_type === 'globe' ? 'text-red-500' : 'text-blue-500'}`}>
                          {row.inventory_type}
                        </span>
                      </div>
                    </td>

                    {([
                      { data: row.before, caption: `BEFORE — ${row.pole_code ?? 'N/A'}` },
                      { data: row.after, caption: `AFTER — ${row.pole_code ?? 'N/A'}` },
                      { data: row.pole_tag, caption: `POLE PIC — ${row.pole_code ?? 'N/A'}` },
                    ] as { data: string | null | undefined; caption: string }[]).map(({ data, caption }, ci) => (
                      <td key={ci} className="border p-1 text-center align-top" style={{ borderColor: BRAND.border }}>
                        <div className="flex min-h-[280px] items-center justify-center rounded-lg border p-1"
                          style={{ borderColor: '#8fc9b4', background: '#fff' }}>
                          {imgUrl(data) ? (
                            <SafeImage
                              src={imgUrl(data)!}
                              alt={caption}
                              className="block max-h-[270px] w-auto max-w-full cursor-pointer rounded object-contain transition hover:scale-[1.02]"
                              style={{ border: '1px solid #dff2eb' }}
                              onClick={() => setLightbox({ src: imgUrl(data)!, caption })}
                            />
                          ) : (
                            <div className="flex w-full min-h-[270px] items-center justify-center rounded border text-[11px] font-bold uppercase tracking-wider"
                              style={{ borderColor: BRAND.border, color: BRAND.muted2, background: BRAND.softer, borderStyle: 'dashed' }}>
                              No Photo
                            </div>
                          )}
                        </div>
                      </td>
                    ))}
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
            Globe Telecom · Skycable Operations
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
              ] as { data: PoleRow['before']; label: string }[]).map(({ data, label }) => (
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
