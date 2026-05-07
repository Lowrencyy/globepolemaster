import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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

type PoleStatus = 'pending' | 'in_progress' | 'cleared'
type StatusFilter = 'all' | PoleStatus

interface PoleForm {
  sequence: string
  pole_code: string
  lat: string
  lng: string
  skycable_status: PoleStatus
}

const EMPTY_FORM: PoleForm = {
  sequence: '',
  pole_code: '',
  lat: '',
  lng: '',
  skycable_status: 'pending',
}

const STATUS_META: Record<
  PoleStatus,
  {
    label: string
    dot: string
    badge: string
    chip: string
  }
> = {
  pending: {
    label: 'Pending',
    dot: 'bg-amber-400',
    badge:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20',
    chip: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
  in_progress: {
    label: 'In Progress',
    dot: 'bg-blue-500',
    badge:
      'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20',
    chip: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  cleared: {
    label: 'Cleared',
    dot: 'bg-emerald-500',
    badge:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
    chip:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
}

const statCards = [
  {
    label: 'Total Poles',
    key: 'total',
    icon: 'bx bx-git-commit',
    accent: 'from-blue-600 to-sky-400',
    note: 'All assigned pole records',
  },
  {
    label: 'With GPS',
    key: 'withGps',
    icon: 'bx bx-map-pin',
    accent: 'from-cyan-500 to-blue-500',
    note: 'Poles with coordinates',
  },
  {
    label: 'Pending',
    key: 'pending',
    icon: 'bx bx-time-five',
    accent: 'from-amber-400 to-orange-500',
    note: 'Waiting for clearing',
  },
  {
    label: 'Cleared',
    key: 'cleared',
    icon: 'bx bx-check-shield',
    accent: 'from-emerald-500 to-teal-400',
    note: 'Completed records',
  },
] as const

const filterTabs: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'cleared', label: 'Cleared' },
]

const inputCls =
  'h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/10'

const modalInputCls =
  'h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:bg-zinc-900 dark:focus:ring-blue-400/10'

const labelCls =
  'mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500'

const primaryBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600'

const secondaryBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300'

const dangerBtn =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400'

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function statusLabel(status?: string) {
  if (status === 'cleared') return 'Cleared'
  if (status === 'in_progress') return 'In Progress'
  return 'Pending'
}

function getStatusMeta(status?: string) {
  if (status === 'cleared') return STATUS_META.cleared
  if (status === 'in_progress') return STATUS_META.in_progress
  return STATUS_META.pending
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-slate-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M19.228 5.79 18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .563c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-1 flex items-center gap-3 pt-1 sm:col-span-2">
      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-zinc-500">{label}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-blue-100 via-slate-100 to-transparent dark:from-blue-500/20 dark:via-zinc-700 dark:to-transparent" />
    </div>
  )
}

export default function NodePolesList() {
  const { siteSlug = '', nodeSlug = '' } = useParams()
  const navigate = useNavigate()
  const nodeId = idFromSlug(nodeSlug) || Number(nodeSlug)
  const reportRef = useRef<HTMLDivElement>(null)

  const [node, setNode] = useState<NodeInfo | null>(null)
  const [poles, setPoles] = useState<PoleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [showModal, setShowModal] = useState(false)
  const [editingPole, setEditingPole] = useState<PoleRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form, setForm] = useState<PoleForm>(EMPTY_FORM)

  async function loadData(showSpinner = true) {
    if (!nodeId) return
    if (showSpinner) setLoading(true)

    try {
      const [nd, pd] = await Promise.all([
        fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() }).then(r => r.json()),
      ])

      if (nd?.id) {
        setNode(nd)
        cacheSet(`poles_info_${nodeId}`, nd)
      }

      const list: PoleRecord[] = Array.isArray(pd) ? pd : pd?.data ?? []
      setPoles(list)
      cacheSet(`poles_list_${nodeId}`, list)
    } catch (err) {
      console.error(err)
      alert('Failed to load poles. Please try again.')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  useEffect(() => {
    if (!nodeId) return

    const hitNode = cacheGet<NodeInfo>(`poles_info_${nodeId}`)
    const hitPoles = cacheGet<PoleRecord[]>(`poles_list_${nodeId}`)

    if (hitNode) setNode(hitNode)

    if (hitPoles) {
      setPoles(hitPoles)
      setLoading(false)
      loadData(false)
    } else {
      loadData(true)
    }
  }, [nodeId])

  const stats = useMemo(() => {
    const total = poles.length
    const withGps = poles.filter(p => p.pole?.lat && p.pole?.lng).length
    const cleared = poles.filter(p => p.pole?.skycable_status === 'cleared').length
    const inProgress = poles.filter(p => p.pole?.skycable_status === 'in_progress').length
    const pending = Math.max(0, total - cleared - inProgress)
    const pctFromApi = Math.round(node?.progress_percentage ?? 0)
    const pctFromRows = total ? Math.round((cleared / total) * 100) : 0
    const pct = Math.min(100, Math.max(0, pctFromApi || pctFromRows))

    return { total, withGps, cleared, inProgress, pending, pct }
  }, [node?.progress_percentage, poles])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return poles.filter(item => {
      const code = item.pole?.pole_code?.toLowerCase() ?? ''
      const status = (item.pole?.skycable_status ?? 'pending') as PoleStatus
      const matchesSearch = term ? code.includes(term) : true
      const matchesStatus = statusFilter === 'all' ? true : status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [poles, search, statusFilter])

  function countForFilter(key: StatusFilter) {
    if (key === 'all') return stats.total
    if (key === 'pending') return stats.pending
    if (key === 'in_progress') return stats.inProgress
    return stats.cleared
  }

  function openCreateModal() {
    setEditingPole(null)
    setForm({ ...EMPTY_FORM, sequence: String((poles[poles.length - 1]?.sequence ?? poles.length) + 1) })
    setShowModal(true)
  }

  function openEditModal(item: PoleRecord) {
    setEditingPole(item)
    setForm({
      sequence: String(item.sequence ?? ''),
      pole_code: item.pole?.pole_code ?? '',
      lat: item.pole?.lat ?? '',
      lng: item.pole?.lng ?? '',
      skycable_status: (item.pole?.skycable_status as PoleStatus) ?? 'pending',
    })
    setShowModal(true)
  }

  function closeModal() {
    if (saving) return
    setShowModal(false)
    setEditingPole(null)
    setForm(EMPTY_FORM)
  }

  async function handleSavePole() {
    if (!nodeId) return

    if (!form.sequence.trim()) {
      alert('Sequence is required.')
      return
    }

    if (!form.pole_code.trim()) {
      alert('Pole code is required.')
      return
    }

    setSaving(true)

    try {
      const payload = {
        sequence: Number(form.sequence),
        pole_code: form.pole_code.trim(),
        lat: form.lat.trim() || null,
        lng: form.lng.trim() || null,
        skycable_status: form.skycable_status,
      }

      const isEdit = !!editingPole
      const url = isEdit
        ? `${SKYCABLE_API}/nodes/${nodeId}/poles/${editingPole?.id}`
        : `${SKYCABLE_API}/nodes/${nodeId}/poles`

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Failed to save pole')

      setShowModal(false)
      setEditingPole(null)
      setForm(EMPTY_FORM)
      await loadData(true)
    } catch (err) {
      console.error(err)
      alert('Failed to save pole. Please check your API endpoint or payload fields.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePole(id: number) {
    if (!nodeId) return

    const ok = window.confirm('Delete this pole record?')
    if (!ok) return

    setDeletingId(id)

    try {
      const res = await fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })

      if (!res.ok) throw new Error('Failed to delete pole')

      await loadData(true)
    } catch (err) {
      console.error(err)
      alert('Failed to delete pole. Please check your API endpoint.')
    } finally {
      setDeletingId(null)
    }
  }

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

      const A4_W = 1240
      const A4_H = 1754

      const out = document.createElement('canvas')
      out.width = A4_W
      out.height = A4_H

      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, A4_W, A4_H)

      const scale = A4_W / canvas.width
      const drawH = Math.min(canvas.height * scale, A4_H)
      ctx.drawImage(canvas, 0, 0, A4_W, drawH)

      const link = document.createElement('a')
      link.download = `PolesList_${node?.full_label ?? node?.name ?? nodeId}.png`
      link.href = out.toDataURL('image/png')
      link.click()
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const generatedDate = new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative p-5 lg:p-6">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400 dark:text-zinc-500">
            <Link to={`/${siteSlug}`} className="transition hover:text-blue-600 dark:hover:text-blue-300">
              {node?.area?.name ?? 'Nodes'}
            </Link>
            <ChevronRightIcon />
            <span className="truncate text-slate-600 dark:text-zinc-300">
              {node?.full_label ?? node?.name ?? 'Node'}
            </span>
          </div>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Skycable Teardown
              </div>

              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Node Pole Inventory
              </h1>

              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500 dark:text-zinc-400">
                Manage pole records, GPS coordinates, teardown progress, and clearing status in one organized view.
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="w-full min-w-[230px] rounded-3xl border border-slate-100 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/50 xl:w-[260px]">
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                  <span>Progress</span>
                  <span className="text-blue-600 dark:text-blue-300">{stats.pct}%</span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all" style={{ width: `${stats.pct}%` }} />
                </div>

                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-zinc-500">
                  {stats.cleared} cleared out of {stats.total} total poles
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                <button type="button" onClick={() => navigate(`/${siteSlug}`)} className={secondaryBtn}>
                  <i className="bx bx-arrow-back text-lg" />
                  Back
                </button>

                <button type="button" onClick={() => loadData(true)} className={secondaryBtn} disabled={loading}>
                  {loading ? (
                    <>
                      <i className="bx bx-loader-alt animate-spin text-lg" />
                      Refreshing
                    </>
                  ) : (
                    <>
                      <i className="bx bx-refresh text-lg" />
                      Refresh
                    </>
                  )}
                </button>

                <button type="button" onClick={exportImage} className={secondaryBtn} disabled={exporting || poles.length === 0}>
                  {exporting ? (
                    <>
                      <i className="bx bx-loader-alt animate-spin text-lg" />
                      Exporting
                    </>
                  ) : (
                    <>
                      <DownloadIcon />
                      Export
                    </>
                  )}
                </button>

                <button type="button" onClick={openCreateModal} className={primaryBtn}>
                  <PlusIcon />
                  Add Pole
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(c => {
          const val = stats[c.key as keyof typeof stats]

          return (
            <div
              key={c.label}
              className="group relative overflow-hidden rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-950/5 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:shadow-black/20"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.accent}`} />
              <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-r ${c.accent} opacity-10 blur-2xl`} />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">{c.label}</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">{val}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-zinc-500">
                    {c.key === 'withGps'
                      ? `${stats.total ? Math.round((stats.withGps / stats.total) * 100) : 0}% geotagged`
                      : c.key === 'cleared'
                        ? `${stats.pct}% completed`
                        : c.note}
                  </p>
                </div>

                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r ${c.accent} text-white shadow-lg transition group-hover:scale-105`}>
                  <i className={`${c.icon} text-2xl`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main Card */}
      <div className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {/* Toolbar */}
        <div className="border-b border-slate-100 p-4 dark:border-zinc-700/80">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-md">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </div>

              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search pole code..."
                className={`${inputCls} pl-11`}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
              <div className="flex flex-wrap items-center gap-2">
                {filterTabs.map(tab => {
                  const active = statusFilter === tab.key

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatusFilter(tab.key)}
                      className={[
                        'inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-black transition active:scale-[0.98]',
                        active
                          ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300',
                      ].join(' ')}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-[10px]',
                          active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400',
                        ].join(' ')}
                      >
                        {countForFilter(tab.key)}
                      </span>
                    </button>
                  )
                })}
              </div>

              <button type="button" onClick={openCreateModal} className={primaryBtn}>
                <PlusIcon />
                Add Pole
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-400 dark:text-zinc-500">
            <span>
              Showing <b className="text-slate-700 dark:text-zinc-200">{filtered.length}</b> of{' '}
              <b className="text-slate-700 dark:text-zinc-200">{stats.total}</b> poles
            </span>

            <span>
              GPS tagged: <b className="text-blue-600 dark:text-blue-300">{filtered.filter(p => p.pole?.lat && p.pole?.lng).length}</b>
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-sm">
            <colgroup>
              <col style={{ width: 72 }} />
              <col />
              <col style={{ width: 200 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">Seq</th>
                <th className="px-4 py-2 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">Pole Details</th>
                <th className="px-4 py-2 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">GPS Coordinates</th>
                <th className="px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">Status</th>
                <th className="px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 dark:bg-blue-500/10">
                      <i className="bx bx-loader-alt animate-spin text-3xl text-blue-600 dark:text-blue-300" />
                    </div>
                    <p className="mt-4 text-sm font-bold text-slate-500 dark:text-zinc-400">Loading pole records...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 dark:bg-zinc-800">
                      <i className="bx bx-search-alt text-3xl text-slate-300 dark:text-zinc-600" />
                    </div>

                    <p className="mt-4 text-sm font-black text-slate-600 dark:text-zinc-300">
                      {search || statusFilter !== 'all' ? 'No poles found' : 'No poles assigned yet'}
                    </p>

                    <p className="mt-1 text-xs font-medium text-slate-400 dark:text-zinc-500">
                      {search || statusFilter !== 'all'
                        ? 'Try changing your search keyword or status filter.'
                        : 'Create your first pole record for this node.'}
                    </p>

                    {!search && statusFilter === 'all' && (
                      <button type="button" onClick={openCreateModal} className={`${primaryBtn} mt-5`}>
                        <PlusIcon />
                        Add Pole
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(p => {
                  const meta = getStatusMeta(p.pole?.skycable_status)
                  const hasGps = !!(p.pole?.lat && p.pole?.lng)

                  return (
                    <tr
                      key={p.id}
                      onClick={() => p.pole?.id && navigate(`/${siteSlug}/${nodeSlug}/${encodeURIComponent(p.pole.pole_code)}`)}
                      className="group cursor-pointer"
                    >
                      <td className="rounded-l-3xl border-y border-l border-slate-100 bg-white px-4 py-4 align-middle shadow-sm transition group-hover:border-blue-100 group-hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:group-hover:border-blue-500/20 dark:group-hover:bg-blue-500/5">
                        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-2xl bg-slate-100 px-3 text-xs font-black tabular-nums text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {p.sequence}
                        </span>
                      </td>

                      <td className="border-y border-slate-100 bg-white px-4 py-4 align-middle shadow-sm transition group-hover:border-blue-100 group-hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:group-hover:border-blue-500/20 dark:group-hover:bg-blue-500/5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                            <i className="bx bx-git-commit text-xl" />
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-black text-blue-700 dark:text-blue-300">
                              {p.pole?.pole_code ?? '—'}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-zinc-500">Seq #{p.sequence}</p>
                          </div>
                        </div>
                      </td>

                      <td className="border-y border-slate-100 bg-white px-4 py-4 align-middle shadow-sm transition group-hover:border-blue-100 group-hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:group-hover:border-blue-500/20 dark:group-hover:bg-blue-500/5">
                        {hasGps ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-600 dark:text-zinc-300">
                              <span className="w-8 text-slate-400 dark:text-zinc-500">Lat</span>
                              <span>{p.pole?.lat}</span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-600 dark:text-zinc-300">
                              <span className="w-8 text-slate-400 dark:text-zinc-500">Lng</span>
                              <span>{p.pole?.lng}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
                            <i className="bx bx-map-pin" />
                            No GPS
                          </span>
                        )}
                      </td>

                      <td className="border-y border-slate-100 bg-white px-4 py-4 text-center align-middle shadow-sm transition group-hover:border-blue-100 group-hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:group-hover:border-blue-500/20 dark:group-hover:bg-blue-500/5">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${meta.badge}`}>
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          {statusLabel(p.pole?.skycable_status)}
                        </span>
                      </td>

                      <td
                        className="rounded-r-3xl border-y border-r border-slate-100 bg-white px-4 py-4 align-middle shadow-sm transition group-hover:border-blue-100 group-hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:group-hover:border-blue-500/20 dark:group-hover:bg-blue-500/5"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Edit"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                          >
                            <EditIcon />
                          </button>

                          <button type="button" onClick={() => handleDeletePole(p.id)} disabled={deletingId === p.id} title="Delete" className={dangerBtn}>
                            {deletingId === p.id ? <i className="bx bx-loader-alt animate-spin text-lg" /> : <TrashIcon />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden Export Report */}
      <div className="pointer-events-none fixed -left-[99999px] top-0 opacity-100">
        <div ref={reportRef} className="w-[920px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
          <div className="relative overflow-hidden bg-[#071b36] px-6 py-6 text-white">
            <div className="absolute -right-12 -top-14 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute -bottom-16 left-20 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl" />

            <div className="relative flex items-start justify-between gap-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">Globe Telecom · Skycable Teardown</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">Poles List</h2>
                <p className="mt-1 text-sm font-semibold text-sky-100/75">Export-ready node pole inventory report</p>
              </div>

              <div className="min-w-[190px] rounded-3xl border border-white/20 bg-white/10 p-4 text-right backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Node</p>
                <p className="mt-1 text-xl font-black leading-tight text-white">{node?.name ?? `Node #${nodeId}`}</p>
                {node?.full_label && <p className="mt-1 font-mono text-xs font-bold text-sky-200">{node.full_label}</p>}
                {node?.area && <p className="mt-1 text-xs font-semibold text-sky-100/70">{node.area.name}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 border-b border-slate-200 bg-white">
            <div className="border-r border-slate-200 px-4 py-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Total Poles</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-blue-600">{stats.total}</p>
            </div>

            <div className="border-r border-slate-200 px-4 py-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">With GPS</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-sky-600">{stats.withGps}</p>
            </div>

            <div className="border-r border-slate-200 px-4 py-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Cleared</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-emerald-600">{stats.cleared}</p>
            </div>

            <div className="px-4 py-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Progress</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-blue-600">{stats.pct}%</p>
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-4">
            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              <span>Overall Clearing Progress</span>
              <span>{stats.pct}%</span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${stats.pct}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-6 pb-3 pt-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Pole Records</p>
              <p className="mt-1 text-sm font-bold text-slate-700">
                Showing {filtered.length} of {stats.total} pole{stats.total !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              {filtered.filter(p => p.pole?.lat && p.pole?.lng).length} GPS tagged
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="overflow-hidden rounded-3xl border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#071b36] text-left">
                    {['Seq', 'Pole Code', 'Latitude', 'Longitude', 'Status'].map(head => (
                      <th key={head} className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-sky-100">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">
                        No poles found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map(item => {
                      const meta = getStatusMeta(item.pole?.skycable_status)

                      return (
                        <tr key={item.id} className="border-b border-slate-100 last:border-b-0 even:bg-slate-50/70">
                          <td className="px-4 py-3 font-black tabular-nums text-slate-700">{item.sequence}</td>
                          <td className="px-4 py-3 font-mono text-[11px] font-black text-sky-700">{item.pole?.pole_code ?? '—'}</td>
                          <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-500">{item.pole?.lat ?? '—'}</td>
                          <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-500">{item.pole?.lng ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${meta.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              {statusLabel(item.pole?.skycable_status)}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>

                <tfoot>
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Totals</td>
                    <td className="px-4 py-3 text-[11px] font-black text-slate-700">{filtered.length} poles</td>
                    <td colSpan={2} className="px-4 py-3 text-[10px] font-bold text-slate-500">
                      {filtered.filter(p => p.pole?.lat && p.pole?.lng).length} with GPS coords
                    </td>
                    <td className="px-4 py-3 text-[10px] font-black text-emerald-600">
                      {filtered.filter(p => p.pole?.skycable_status === 'cleared').length} cleared
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-3">
            <p className="text-[10px] font-semibold text-slate-400">Generated: {generatedDate}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Globe Telecom · Skycable Operations</p>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" onClick={closeModal} />

          <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/20 bg-white shadow-[0_30px_100px_-30px_rgba(15,23,42,0.6)] dark:border-zinc-700 dark:bg-zinc-900">
            <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 top-10 h-44 w-44 rounded-full bg-cyan-400/15 blur-3xl" />

            <div className="relative border-b border-slate-100 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 px-6 py-5 text-white dark:border-zinc-700">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 backdrop-blur">
                  <i className={`${editingPole ? 'bx bx-edit' : 'bx bx-git-commit'} text-2xl`} />
                </div>

                <div className="min-w-0 flex-1">
                  <h5 className="text-lg font-black tracking-tight">{editingPole ? 'Edit Pole Record' : 'Add New Pole'}</h5>
                  <p className="mt-0.5 text-sm font-medium text-white/75">
                    {editingPole ? 'Update pole information and clearing status.' : 'Create a new pole assignment for this node.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <i className="bx bx-x text-2xl" />
                </button>
              </div>
            </div>

            <div className="relative p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SectionDivider label="Pole Details" />

                <div>
                  <label className={labelCls}>Sequence</label>
                  <input
                    value={form.sequence}
                    onChange={e => setForm(v => ({ ...v, sequence: e.target.value }))}
                    inputMode="numeric"
                    placeholder="1"
                    className={modalInputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Pole Code</label>
                  <input
                    value={form.pole_code}
                    onChange={e => setForm(v => ({ ...v, pole_code: e.target.value }))}
                    placeholder="Pole code"
                    className={`${modalInputCls} font-mono`}
                  />
                </div>

                <SectionDivider label="GPS Coordinates" />

                <div>
                  <label className={labelCls}>Latitude</label>
                  <input
                    value={form.lat}
                    onChange={e => setForm(v => ({ ...v, lat: e.target.value }))}
                    placeholder="14.5995"
                    className={`${modalInputCls} font-mono`}
                  />
                </div>

                <div>
                  <label className={labelCls}>Longitude</label>
                  <input
                    value={form.lng}
                    onChange={e => setForm(v => ({ ...v, lng: e.target.value }))}
                    placeholder="120.9842"
                    className={`${modalInputCls} font-mono`}
                  />
                </div>

                <SectionDivider label="Clearing Status" />

                <div className="sm:col-span-2">
                  <label className={labelCls}>Status</label>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(['pending', 'in_progress', 'cleared'] as PoleStatus[]).map(status => {
                      const meta = STATUS_META[status]
                      const active = form.skycable_status === status

                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setForm(v => ({ ...v, skycable_status: status }))}
                          className={[
                            'flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-black transition active:scale-[0.98]',
                            active
                              ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                              : `${meta.chip} hover:brightness-[0.98]`,
                          ].join(' ')}
                        >
                          <span className={`h-2 w-2 rounded-full ${active ? 'bg-white' : meta.dot}`} />
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-zinc-700">
                <button type="button" onClick={closeModal} disabled={saving} className={secondaryBtn}>
                  Cancel
                </button>

                <button type="button" onClick={handleSavePole} disabled={saving} className={primaryBtn}>
                  {saving ? (
                    <>
                      <i className="bx bx-loader-alt animate-spin text-lg" />
                      Saving...
                    </>
                  ) : editingPole ? (
                    <>
                      <i className="bx bx-save text-lg" />
                      Update Pole
                    </>
                  ) : (
                    <>
                      <PlusIcon />
                      Save Pole
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}