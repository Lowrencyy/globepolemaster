import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { getToken, SKYCABLE_API, API_BASE } from '../../lib/auth'

// ── Types ────────────────────────────────────────────────────────────────────

interface Span {
  id: number; span_code: string | null; strand_length: number | null
  number_of_runs: number | null; status: string
  from_pole?: { id: number; pole_code: string } | null
  to_pole?:   { id: number; pole_code: string } | null
}

interface TeardownReport {
  id: number; span_id: number; status: string; actual_cable: number | null
  notes: string | null; start_time: string | null; end_time: string | null
}

type PhotoSlot = {
  key: string
  label: string
  pole: 'from' | 'to' | 'span'
  icon: string
  color: string
}

const PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'from_before_photo',   label: 'From Pole — Before',  pole: 'from', icon: 'bx-camera',       color: '#f59e0b' },
  { key: 'from_after_photo',    label: 'From Pole — After',   pole: 'from', icon: 'bx-check-circle', color: '#10b981' },
  { key: 'from_pole_tag_photo', label: 'From Pole — Tag',     pole: 'from', icon: 'bx-purchase-tag', color: '#8b5cf6' },
  { key: 'to_before_photo',     label: 'To Pole — Before',    pole: 'to',   icon: 'bx-camera',       color: '#f59e0b' },
  { key: 'to_after_photo',      label: 'To Pole — After',     pole: 'to',   icon: 'bx-check-circle', color: '#10b981' },
  { key: 'to_pole_tag_photo',   label: 'To Pole — Tag',       pole: 'to',   icon: 'bx-purchase-tag', color: '#8b5cf6' },
  { key: 'bunching_photo',      label: 'Bunching Photo',      pole: 'span', icon: 'bx-git-merge',    color: '#3b82f6' },
]

const h = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
})

const imgUrl = (path: string | null) =>
  path ? `${API_BASE}/api/v1/files/${path}` : null

// ── PhotoCard ────────────────────────────────────────────────────────────────

function PhotoCard({
  slot, file, preview, onChange, disabled,
}: {
  slot: PhotoSlot
  file: File | null
  preview: string | null
  onChange: (key: string, file: File | null) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: slot.color + '20' }}>
          <i className={`bx ${slot.icon} text-sm`} style={{ color: slot.color }} />
        </div>
        <span className="text-xs font-bold text-slate-700 dark:text-white leading-tight">{slot.label}</span>
        {file && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-200">
            ✓ Ready
          </span>
        )}
      </div>

      {/* Preview area */}
      <div
        className="relative flex-1 min-h-36 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center justify-center"
        onClick={() => !disabled && ref.current?.click()}
      >
        {preview ? (
          <>
            <img src={preview} alt={slot.label} className="h-full w-full object-cover absolute inset-0" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center">
              <div className="opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center gap-1 text-white">
                <i className="bx bx-refresh text-2xl" />
                <span className="text-xs font-bold">Replace</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 px-3 text-center">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: slot.color + '15' }}>
              <i className="bx bx-upload text-xl" style={{ color: slot.color }} />
            </div>
            <p className="text-xs font-semibold text-slate-400">Tap to upload</p>
            <p className="text-[10px] text-slate-300">JPG, PNG • max 10MB</p>
          </div>
        )}
      </div>

      {/* Remove */}
      {file && (
        <button
          onClick={() => onChange(slot.key, null)}
          className="border-t border-slate-100 py-2 text-center text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors dark:border-zinc-800 dark:hover:bg-red-900/10"
        >
          Remove photo
        </button>
      )}

      <input
        ref={ref} type="file" accept="image/*" capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0] ?? null
          onChange(slot.key, f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TeardownSubmit() {
  const { siteId, nodeId } = useParams<{ siteId: string; nodeId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const initialSpanId = searchParams.get('spanId')

  const [spans, setSpans]             = useState<Span[]>([])
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null)
  const [report, setReport]           = useState<TeardownReport | null>(null)
  const [loadingSpans, setLoadingSpans] = useState(true)
  const [starting, setStarting]       = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)

  // Form fields
  const [actualCable, setActualCable] = useState('')
  const [notes, setNotes]             = useState('')
  const [endTime, setEndTime]         = useState(() => new Date().toISOString().slice(0, 16))

  // Photos: key → File
  const [photos, setPhotos] = useState<Record<string, File | null>>({})
  const [previews, setPreviews] = useState<Record<string, string | null>>({})

  const handlePhotoChange = useCallback((key: string, file: File | null) => {
    setPhotos(prev => ({ ...prev, [key]: file }))
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviews(prev => ({ ...prev, [key]: url }))
    } else {
      setPreviews(prev => ({ ...prev, [key]: null }))
    }
  }, [])

  // Load spans
  useEffect(() => {
    if (!nodeId) return
    setLoadingSpans(true)
    fetch(`${SKYCABLE_API}/spans?node_id=${nodeId}&per_page=100`, { headers: h() })
      .then(r => r.json())
      .then(data => {
        const list: Span[] = Array.isArray(data) ? data : (data?.data ?? [])
        setSpans(list)
        if (initialSpanId) {
          const found = list.find(s => String(s.id) === initialSpanId)
          if (found) setSelectedSpan(found)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSpans(false))
  }, [nodeId, initialSpanId])

  // Start teardown (creates report in pending state)
  const startTeardown = async () => {
    if (!selectedSpan) return
    setStarting(true); setError(null)
    try {
      const res = await fetch(`${SKYCABLE_API}/teardowns/start`, {
        method: 'POST',
        headers: { ...h(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          span_id:    selectedSpan.id,
          start_time: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to start teardown')
      setReport(data)
    } catch (e: any) {
      setError(e.message)
    } finally { setStarting(false) }
  }

  // Submit teardown (with photos)
  const submitTeardown = async () => {
    if (!report) return
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('end_time',     endTime)
      fd.append('actual_cable', actualCable || '0')
      if (notes) fd.append('notes', notes)

      PHOTO_SLOTS.forEach(slot => {
        const file = photos[slot.key]
        if (file) fd.append(slot.key, file, file.name)
      })

      const res = await fetch(`${SKYCABLE_API}/teardowns/${report.id}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          Accept: 'application/json',
          'ngrok-skip-browser-warning': '1',
          // no Content-Type — let browser set multipart boundary
        },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to submit teardown')
      setSuccess(true)
    } catch (e: any) {
      setError(e.message)
    } finally { setSubmitting(false) }
  }

  const photoCount  = Object.values(photos).filter(Boolean).length
  const requiredDone = photos['from_before_photo'] && photos['from_after_photo'] &&
                       photos['to_before_photo']   && photos['to_after_photo']

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4FBF8] dark:bg-zinc-950 p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[32px] bg-gradient-to-br from-[#00704A] to-[#18A26B] shadow-2xl shadow-emerald-900/30">
          <i className="bx bx-check text-5xl text-white" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Submitted!</h2>
        <p className="text-slate-500 mb-2">Teardown for <strong className="font-mono">{selectedSpan?.span_code ?? `SPAN-${selectedSpan?.id}`}</strong> has been submitted for review.</p>
        <p className="text-sm text-slate-400 mb-8">Awaiting subcontractor approval.</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate(`/sites/${siteId}/nodes/${nodeId}`)}
            className="w-full rounded-2xl bg-[#00704A] py-3.5 text-sm font-bold text-white hover:bg-[#005C3D] transition-colors"
          >
            Back to Node
          </button>
          <button
            onClick={() => { setSuccess(false); setReport(null); setPhotos({}); setPreviews({}); setSelectedSpan(null) }}
            className="w-full rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors dark:border-zinc-700 dark:text-zinc-300"
          >
            New Teardown
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F4FBF8] dark:bg-zinc-950">

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1a0a2e] via-[#2d1654] to-[#3b1f6e] px-6 pb-8 pt-7 shadow-2xl">
        <div className="pointer-events-none absolute -right-20 -top-10 h-56 w-56 rounded-full bg-violet-400/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-40 w-64 rounded-full bg-indigo-400/10 blur-3xl" />

        <nav className="mb-4 flex items-center gap-2 text-xs font-medium text-white/50">
          <Link to="/sites" className="hover:text-white transition-colors">Sites</Link>
          <span>/</span>
          <Link to={`/sites/${siteId}/nodes`} className="hover:text-white transition-colors">Nodes</Link>
          <span>/</span>
          <Link to={`/sites/${siteId}/nodes/${nodeId}`} className="hover:text-white transition-colors">Poles & Spans</Link>
          <span>/</span>
          <span className="text-white">Teardown</span>
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-400/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-violet-200">
              <i className="bx bx-camera text-xs" />
              Teardown Submission
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white drop-shadow">
              {report ? (selectedSpan?.span_code ?? `SPAN-${selectedSpan?.id}`) : 'New Teardown'}
            </h1>
            {selectedSpan && (
              <p className="mt-1 text-sm text-white/50 font-mono">
                {selectedSpan.from_pole?.pole_code} → {selectedSpan.to_pole?.pole_code}
              </p>
            )}
          </div>
          <button onClick={() => navigate(-1)} className="shrink-0 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors">
            ← Back
          </button>
        </div>

        {/* Progress steps */}
        <div className="mt-6 flex items-center gap-3">
          {[
            { n: 1, label: 'Select Span',   done: !!selectedSpan },
            { n: 2, label: 'Start',          done: !!report },
            { n: 3, label: 'Upload Photos',  done: photoCount > 0 },
            { n: 4, label: 'Submit',         done: success },
          ].map((step, i, arr) => (
            <div key={step.n} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition-all ${
                step.done ? 'bg-emerald-400 text-white' : 'bg-white/10 text-white/50'
              }`}>
                {step.done ? <i className="bx bx-check text-sm" /> : step.n}
              </div>
              <span className={`text-xs font-semibold ${step.done ? 'text-white' : 'text-white/40'}`}>
                {step.label}
              </span>
              {i < arr.length - 1 && <div className="h-px w-4 bg-white/20" />}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-start gap-3">
            <i className="bx bx-error-circle text-xl text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Something went wrong</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><i className="bx bx-x text-lg" /></button>
          </div>
        )}

        {/* ── Step 1: Select Span ── */}
        <section className="rounded-[24px] bg-white border border-slate-100 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black ${selectedSpan ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {selectedSpan ? <i className="bx bx-check" /> : '1'}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">Select Span</h3>
                <p className="text-xs text-slate-400">Choose the cable span to tear down</p>
              </div>
            </div>
            {selectedSpan && !report && (
              <button onClick={() => setSelectedSpan(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">Change</button>
            )}
          </div>

          <div className="p-5">
            {loadingSpans ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-7 w-7 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
              </div>
            ) : selectedSpan ? (
              <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <i className="bx bx-git-branch text-[#00704A] text-lg" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black font-mono text-slate-800 text-sm">{selectedSpan.span_code ?? `SPAN-${selectedSpan.id}`}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {selectedSpan.from_pole?.pole_code} → {selectedSpan.to_pole?.pole_code}
                  </p>
                  {selectedSpan.strand_length && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedSpan.strand_length}m × {selectedSpan.number_of_runs ?? 1} runs
                      = {((selectedSpan.strand_length) * (selectedSpan.number_of_runs ?? 1)).toFixed(0)}m expected
                    </p>
                  )}
                </div>
                <i className="bx bx-check-circle text-emerald-500 text-xl shrink-0" />
              </div>
            ) : spans.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <i className="bx bx-git-branch text-4xl text-slate-300" />
                <p className="text-sm font-bold text-slate-500">No spans declared</p>
                <p className="text-xs text-slate-400">Go back to declare spans for this node first.</p>
                <button onClick={() => navigate(`/sites/${siteId}/nodes/${nodeId}`)} className="mt-2 rounded-xl bg-[#00704A] px-4 py-2 text-xs font-bold text-white">
                  Go to Node →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {spans.map(span => (
                  <button
                    key={span.id}
                    onClick={() => setSelectedSpan(span)}
                    className="w-full text-left rounded-2xl border border-slate-200 bg-white px-4 py-3.5 hover:border-[#00704A] hover:bg-emerald-50/50 transition-all group dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors shrink-0 dark:bg-zinc-700">
                        <i className="bx bx-git-branch text-slate-400 group-hover:text-[#00704A] transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black font-mono text-sm text-slate-800 dark:text-white">{span.span_code ?? `SPAN-${span.id}`}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{span.from_pole?.pole_code} → {span.to_pole?.pole_code}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200 capitalize">
                        {span.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Step 2: Start Teardown ── */}
        {selectedSpan && !report && (
          <section className="rounded-[24px] bg-white border border-slate-100 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-black text-violet-600">2</div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">Start Teardown</h3>
                <p className="text-xs text-slate-400">This logs the start time on the server</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Ready to begin teardown for <strong className="font-mono">{selectedSpan.span_code ?? `SPAN-${selectedSpan.id}`}</strong>?
              </p>
              <button
                onClick={startTeardown}
                disabled={starting}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 transition-all"
              >
                {starting ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Starting…</>
                ) : (
                  <><i className="bx bx-play-circle text-lg" /> Start Teardown Now</>
                )}
              </button>
            </div>
          </section>
        )}

        {/* ── Step 3: Upload Photos ── */}
        {report && (
          <>
            <section className="rounded-[24px] bg-white border border-slate-100 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black ${photoCount > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-violet-100 text-violet-600'}`}>
                    {photoCount > 0 ? <i className="bx bx-check" /> : '3'}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white">Photo Documentation</h3>
                    <p className="text-xs text-slate-400">{photoCount}/{PHOTO_SLOTS.length} photos uploaded</p>
                  </div>
                </div>
                {/* Progress mini bar */}
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(photoCount / PHOTO_SLOTS.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-500">{Math.round((photoCount / PHOTO_SLOTS.length) * 100)}%</span>
                </div>
              </div>

              <div className="p-5">
                {/* From pole photos */}
                <p className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <span className="h-5 w-5 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 font-mono text-[10px]">A</span>
                  From Pole — <span className="font-mono text-slate-600 dark:text-slate-300">{selectedSpan?.from_pole?.pole_code}</span>
                </p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {PHOTO_SLOTS.filter(s => s.pole === 'from').map(slot => (
                    <PhotoCard key={slot.key} slot={slot} file={photos[slot.key] ?? null} preview={previews[slot.key] ?? null} onChange={handlePhotoChange} />
                  ))}
                </div>

                {/* To pole photos */}
                <p className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <span className="h-5 w-5 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 font-mono text-[10px]">B</span>
                  To Pole — <span className="font-mono text-slate-600 dark:text-slate-300">{selectedSpan?.to_pole?.pole_code}</span>
                </p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {PHOTO_SLOTS.filter(s => s.pole === 'to').map(slot => (
                    <PhotoCard key={slot.key} slot={slot} file={photos[slot.key] ?? null} preview={previews[slot.key] ?? null} onChange={handlePhotoChange} />
                  ))}
                </div>

                {/* Bunching */}
                <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Span — Bunching</p>
                <div className="grid grid-cols-3 gap-3">
                  {PHOTO_SLOTS.filter(s => s.pole === 'span').map(slot => (
                    <PhotoCard key={slot.key} slot={slot} file={photos[slot.key] ?? null} preview={previews[slot.key] ?? null} onChange={handlePhotoChange} />
                  ))}
                </div>
              </div>
            </section>

            {/* ── Step 4: Finalize & Submit ── */}
            <section className="rounded-[24px] bg-white border border-slate-100 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black ${requiredDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>4</div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">Finalize & Submit</h3>
                  <p className="text-xs text-slate-400">Enter cable recovered and submit for review</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Actual Cable Collected (m)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={actualCable}
                      onChange={e => setActualCable(e.target.value)}
                      placeholder="0.00"
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">End Time</label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                </div>

                {selectedSpan?.strand_length && actualCable && (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 dark:bg-zinc-800 dark:border-zinc-700">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Collection Rate</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden dark:bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#00704A] to-[#18A26B] transition-all"
                          style={{ width: `${Math.min(100, (parseFloat(actualCable) / (selectedSpan.strand_length * (selectedSpan.number_of_runs ?? 1))) * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className="text-base font-black text-[#00704A]">
                        {Math.min(100, Math.round((parseFloat(actualCable) / (selectedSpan.strand_length * (selectedSpan.number_of_runs ?? 1))) * 100))}%
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Notes (optional)</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any issues or additional remarks…"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white resize-none"
                  />
                </div>

                {!requiredDone && (
                  <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <i className="bx bx-info-circle text-amber-500 text-lg shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">
                      Required: Before & After photos for both From and To poles.
                    </p>
                  </div>
                )}

                <button
                  onClick={submitTeardown}
                  disabled={submitting || !requiredDone}
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#005C3D] to-[#00704A] py-4 text-sm font-bold text-white shadow-xl shadow-emerald-900/25 hover:from-[#003D2B] hover:to-[#005C3D] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Submitting…</>
                  ) : (
                    <><i className="bx bx-send text-lg" /> Submit Teardown Report</>
                  )}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
