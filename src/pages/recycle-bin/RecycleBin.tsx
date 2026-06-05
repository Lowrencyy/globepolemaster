import { useEffect, useMemo, useState } from 'react'
import { API_BASE, getToken } from '../../lib/auth'

const SKYCABLE_API = `${API_BASE}/api/v1/skycable`

const H = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  })

const RETAIN_DAYS = 30

type TrashedItem = {
  id: number
  name: string
  full_label?: string | null
  deleted_at: string
  status?: string | null
  subcontractor?: { id: number; name: string } | null
  team?: { id: number; name: string } | null
  area?: { id: number; name: string } | null
  itemType: 'node' | 'site'
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function daysLeft(iso: string): number {
  return Math.max(0, RETAIN_DAYS - daysAgo(iso))
}

function urgencyColor(left: number) {
  if (left <= 3) return { text: '#ef4444', bg: '#fef2f2', ring: '#fecaca', label: 'Expiring Soon' }
  if (left <= 7) return { text: '#f59e0b', bg: '#fffbeb', ring: '#fde68a', label: 'Expiring' }
  return { text: '#10b981', bg: '#f0fdf4', ring: '#bbf7d0', label: `${left}d left` }
}

// ── Confirm modal ──────────────────────────────────────────────────────────────
function ConfirmModal({ title, subtitle, body, confirmLabel, danger, onConfirm, onClose, loading }:
  { title: string; subtitle: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200/60 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${danger ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
              <i className={`bx ${danger ? 'bx-trash text-rose-600' : 'bx-revision text-green-600'} text-xl`} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">{title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">{body}</p>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={loading}
              className="flex-1 h-10 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition disabled:opacity-50">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={loading}
              className={`flex-1 h-10 rounded-2xl text-sm font-black text-white transition disabled:opacity-50 ${
                danger
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-[0_12px_24px_-12px_rgba(225,29,72,0.7)]'
                  : 'bg-green-600 hover:bg-green-700 shadow-[0_12px_24px_-12px_rgba(22,163,74,0.7)]'
              }`}>
              {loading ? (danger ? 'Deleting…' : 'Restoring…') : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Item row ────────────────────────────────────────────────────────────────────
function ItemRow({ item, selected, onSelect, onRestore, onDelete }:
  { item: TrashedItem; selected: boolean; onSelect: () => void; onRestore: () => void; onDelete: () => void }) {
  const left = daysLeft(item.deleted_at)
  const urg = urgencyColor(left)
  const ago = daysAgo(item.deleted_at)
  const deletedDate = new Date(item.deleted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const displayName = item.full_label ?? item.name

  return (
    <div className={`group flex items-center gap-4 px-5 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 transition-colors ${selected ? 'bg-rose-50/40 dark:bg-rose-950/10' : 'hover:bg-slate-50/60 dark:hover:bg-zinc-800/30'}`}>
      {/* Checkbox */}
      <button onClick={onSelect}
        className={`shrink-0 h-5 w-5 rounded-md border-2 transition flex items-center justify-center ${
          selected ? 'bg-rose-600 border-rose-600' : 'border-slate-300 dark:border-zinc-600 hover:border-rose-400'
        }`}>
        {selected && <i className="bx bx-check text-white text-xs" />}
      </button>

      {/* Type icon */}
      <div className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-xl ${
        item.itemType === 'node'
          ? 'bg-indigo-100 dark:bg-indigo-900/30'
          : 'bg-amber-100 dark:bg-amber-900/30'
      }`}>
        <i className={`bx ${item.itemType === 'node' ? 'bx-broadcast text-indigo-600 dark:text-indigo-400' : 'bx-map text-amber-600 dark:text-amber-400'} text-base`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${
            item.itemType === 'node'
              ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>{item.itemType}</span>
          <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{displayName}</p>
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">#{item.id}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
          {item.area && <span><i className="bx bx-map-pin mr-0.5" />{item.area.name}</span>}
          {item.subcontractor && <span><i className="bx bx-briefcase mr-0.5" />{item.subcontractor.name}</span>}
          <span><i className="bx bx-trash mr-0.5" />Deleted {ago === 0 ? 'today' : `${ago}d ago`} · {deletedDate}</span>
        </div>
      </div>

      {/* Expiry badge */}
      <div className="shrink-0 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1"
          style={{ borderColor: urg.ring, backgroundColor: urg.bg }}>
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: urg.text }} />
          <span className="text-[10px] font-black" style={{ color: urg.text }}>
            {left === 0 ? 'Expires today' : left <= 7 ? urg.label : `${left}d left`}
          </span>
        </div>
        <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">of {RETAIN_DAYS}d</p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2">
        <button onClick={onRestore}
          className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 text-xs font-black text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition">
          <i className="bx bx-revision text-sm" /> Restore
        </button>
        <button onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-xs font-black text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition">
          <i className="bx bx-trash text-sm" /> Delete
        </button>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────────
export default function RecycleBin() {
  const [items, setItems]               = useState<TrashedItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [tab, setTab]                   = useState<'all' | 'node' | 'site'>('all')
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [actionItem, setActionItem]     = useState<TrashedItem | null>(null)
  const [actionType, setActionType]     = useState<'restore' | 'delete' | null>(null)
  const [bulkAction, setBulkAction]     = useState<'restore' | 'delete' | null>(null)
  const [acting, setActing]             = useState(false)
  const [lastSynced, setLastSynced]     = useState<number | null>(null)
  const [syncText, setSyncText]         = useState('Never')

  useEffect(() => {
    function tick() {
      if (!lastSynced) { setSyncText('Never'); return }
      const s = Math.floor((Date.now() - lastSynced) / 1000)
      setSyncText(s < 60 ? 'Just now' : `${Math.floor(s / 60)}m ago`)
    }
    tick()
    const t = setInterval(tick, 15000)
    return () => clearInterval(t)
  }, [lastSynced])

  async function fetchTrashed<T>(url: string, fallback: string): Promise<T[]> {
    let res = await fetch(url, { headers: H() })
    if (!res.ok) res = await fetch(fallback, { headers: H() })
    if (!res.ok) return []
    const d = await res.json().catch(() => null)
    return Array.isArray(d) ? d : (d?.data ?? [])
  }

  async function load() {
    setLoading(true); setError(''); setSelected(new Set())
    try {
      const [rawNodes, rawSites] = await Promise.all([
        fetchTrashed<any>(
          `${SKYCABLE_API}/nodes/trashed`,
          `${SKYCABLE_API}/nodes?trashed=1&per_page=500`
        ),
        fetchTrashed<any>(
          `${SKYCABLE_API}/areas/trashed`,
          `${SKYCABLE_API}/areas?trashed=1&per_page=500`
        ),
      ])
      const nodes: TrashedItem[] = rawNodes.map((n: any) => ({ ...n, itemType: 'node' as const }))
      const sites: TrashedItem[] = rawSites.map((s: any) => ({ ...s, itemType: 'site' as const }))
      setItems([...nodes, ...sites].sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()))
      setLastSynced(Date.now())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load recycle bin.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = tab === 'all' ? items : items.filter(i => i.itemType === tab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.full_label ?? '').toLowerCase().includes(q) ||
        (i.subcontractor?.name ?? '').toLowerCase().includes(q) ||
        (i.area?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [items, tab, search])

  const key = (i: TrashedItem) => `${i.itemType}-${i.id}`

  function toggleSelect(i: TrashedItem) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key(i)) ? next.delete(key(i)) : next.add(key(i))
      return next
    })
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(key)))
  }

  const selectedItems = useMemo(() => items.filter(i => selected.has(key(i))), [items, selected])

  async function callRestore(item: TrashedItem) {
    const ep = item.itemType === 'node' ? 'nodes' : 'areas'
    let res = await fetch(`${SKYCABLE_API}/${ep}/${item.id}/restore`, { method: 'POST', headers: H() })
    if (!res.ok) res = await fetch(`${SKYCABLE_API}/${ep}/${item.id}/recover`, { method: 'POST', headers: H() })
    if (!res.ok) throw new Error(`Restore failed (HTTP ${res.status})`)
  }

  async function callDelete(item: TrashedItem) {
    const ep = item.itemType === 'node' ? 'nodes' : 'areas'
    let res = await fetch(`${SKYCABLE_API}/${ep}/${item.id}/force-delete`, { method: 'DELETE', headers: H() })
    if (res.status === 404) res = await fetch(`${SKYCABLE_API}/${ep}/${item.id}?force=true`, { method: 'DELETE', headers: H() })
    if (!res.ok && res.status !== 204) {
      const b = await res.json().catch(() => ({}))
      throw new Error(b?.message ?? `Delete failed (HTTP ${res.status})`)
    }
  }

  async function confirmSingle() {
    if (!actionItem || !actionType) return
    setActing(true)
    try {
      if (actionType === 'restore') await callRestore(actionItem)
      else await callDelete(actionItem)
      setActionItem(null); setActionType(null)
      await load()
    } catch (e: any) { setError(e?.message ?? 'Action failed') }
    finally { setActing(false) }
  }

  async function confirmBulk() {
    if (!bulkAction || selectedItems.length === 0) return
    setActing(true)
    try {
      await Promise.all(selectedItems.map(i => bulkAction === 'restore' ? callRestore(i) : callDelete(i)))
      setBulkAction(null)
      await load()
    } catch (e: any) { setError(e?.message ?? 'Bulk action failed') }
    finally { setActing(false) }
  }

  const stats = useMemo(() => {
    const nodes = items.filter(i => i.itemType === 'node').length
    const sites = items.filter(i => i.itemType === 'site').length
    const expiring = items.filter(i => daysLeft(i.deleted_at) <= 7).length
    return { total: items.length, nodes, sites, expiring }
  }, [items])

  return (
    <div className="min-h-screen pb-12 text-slate-950 dark:text-white"
      style={{ background: 'radial-gradient(circle at top left, rgba(225,29,72,0.08), transparent 34%), linear-gradient(180deg,#fdf8f8 0%,#fef2f2 100%)' }}>

      {/* BG blobs */}
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[380px] overflow-hidden">
        <div className="absolute left-1/2 top-[-180px] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-rose-500/12 blur-3xl" />
        <div className="absolute right-[-120px] top-20 h-72 w-72 rounded-full bg-red-300/15 blur-3xl" />
      </div>

      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/80 p-5 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.9)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85 sm:p-6">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(225,29,72,0.10),_transparent_45%)] lg:block" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                <span className="font-bold text-slate-500">System</span>
                <i className="bx bx-chevron-right text-sm" />
                <span className="font-bold text-slate-600 dark:text-slate-300">Recycle Bin</span>
              </nav>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 shadow-[0_12px_28px_-8px_rgba(225,29,72,0.6)]">
                  <i className="bx bx-trash text-white text-xl" />
                </div>
                <h1 className="text-3xl font-black tracking-tight">Recycle Bin</h1>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-900/30">
                  {RETAIN_DAYS}-day retention
                </span>
                {stats.expiring > 0 && (
                  <span className="animate-pulse rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-900/30">
                    {stats.expiring} expiring soon
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 font-medium max-w-lg">
                Deleted sites and nodes are kept here for {RETAIN_DAYS} days before being permanently removed. You can restore or permanently delete them at any time.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/50 backdrop-blur-md border border-slate-200 px-3 py-1.5 shadow text-xs select-none dark:bg-zinc-900/50 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200 dark:border-zinc-800">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span className="font-bold text-slate-600 dark:text-zinc-300">Synced: {syncText}</span>
              </div>
              <button onClick={load} disabled={loading}
                className="flex h-6 w-6 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-zinc-800 disabled:opacity-40">
                <i className={`bx bx-refresh text-lg ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Items', value: stats.total, icon: 'bx-trash', color: '#ef4444' },
            { label: 'Expiring ≤7d', value: stats.expiring, icon: 'bx-alarm-exclamation', color: '#f59e0b' },
            { label: 'Nodes', value: stats.nodes, icon: 'bx-broadcast', color: '#6366f1' },
            { label: 'Sites', value: stats.sites, icon: 'bx-map', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-3.5 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
              <div className="pointer-events-none absolute inset-0" style={{ background: `${s.color}06` }} />
              <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ backgroundColor: s.color }} />
              <div className="relative pl-1">
                <div className="flex items-start justify-between gap-1 mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{s.label}</p>
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: s.color + '18' }}>
                    <i className={`bx ${s.icon} text-xs`} style={{ color: s.color }} />
                  </div>
                </div>
                <p className="text-2xl font-black font-mono leading-none" style={{ color: s.color }}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 px-5 py-3">
            <i className="bx bx-error-circle text-rose-500 text-lg" />
            <span className="text-sm font-bold text-rose-700 dark:text-rose-400 flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-xs text-rose-500 hover:text-rose-700 font-black">✕</button>
          </div>
        )}

        {/* ── Main card ────────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-800/20">
            {/* Tabs */}
            <div className="inline-flex rounded-2xl bg-slate-100 dark:bg-zinc-800 p-1 text-xs font-black">
              {([
                { v: 'all', label: 'All', count: stats.total },
                { v: 'node', label: 'Nodes', count: stats.nodes },
                { v: 'site', label: 'Sites', count: stats.sites },
              ] as const).map(t => (
                <button key={t.v} onClick={() => setTab(t.v)}
                  className={`inline-flex items-center gap-1.5 h-8 rounded-xl px-3.5 transition ${
                    tab === t.v
                      ? 'bg-white text-rose-700 shadow-sm dark:bg-zinc-700 dark:text-rose-300'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'
                  }`}>
                  {t.label}
                  <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${tab === t.v ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' : 'bg-slate-200 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-48 max-w-sm">
              <i className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
              <input type="text" placeholder="Search deleted items…" value={search} onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl bg-white pl-9 pr-4 text-xs font-medium outline-none border border-slate-200/80 transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white dark:focus:border-rose-500" />
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-5 py-3 bg-rose-50/80 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-900/30">
              <span className="text-xs font-black text-rose-700 dark:text-rose-400">{selected.size} selected</span>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setBulkAction('restore')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 text-xs font-black text-green-700 dark:text-green-400 hover:bg-green-100 transition">
                  <i className="bx bx-revision" /> Restore All
                </button>
                <button onClick={() => setBulkAction('delete')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 text-xs font-black text-rose-700 dark:text-rose-400 hover:bg-rose-100 transition">
                  <i className="bx bx-trash" /> Delete All
                </button>
                <button onClick={() => setSelected(new Set())}
                  className="text-xs font-black text-slate-400 hover:text-slate-600 transition px-2">Clear</button>
              </div>
            </div>
          )}

          {/* Select all bar */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/20 dark:bg-zinc-800/10">
              <button onClick={selectAll}
                className="text-[11px] font-black text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition flex items-center gap-1.5">
                <span className={`h-4 w-4 rounded border-2 flex items-center justify-center transition ${
                  selected.size === filtered.length && filtered.length > 0
                    ? 'bg-rose-600 border-rose-600'
                    : 'border-slate-300 dark:border-zinc-600'
                }`}>
                  {selected.size === filtered.length && filtered.length > 0 && <i className="bx bx-check text-white text-[10px]" />}
                </span>
                {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-rose-500 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-slate-100 dark:bg-zinc-800 mb-4">
                <i className="bx bx-trash text-4xl text-slate-300 dark:text-zinc-600" />
              </div>
              <p className="text-sm font-black text-slate-500 dark:text-slate-400">Recycle bin is empty</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs font-medium">
                {search ? 'No items match your search.' : 'No deleted sites or nodes found.'}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map(item => (
                <ItemRow key={key(item)} item={item}
                  selected={selected.has(key(item))}
                  onSelect={() => toggleSelect(item)}
                  onRestore={() => { setActionItem(item); setActionType('restore') }}
                  onDelete={() => { setActionItem(item); setActionType('delete') }}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          {!loading && items.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/20 dark:bg-zinc-800/10">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                Items auto-purge after <b className="text-slate-600 dark:text-slate-300">{RETAIN_DAYS} days</b> from deletion.
              </p>
              {items.length > 0 && (
                <button onClick={() => { setSelected(new Set(items.map(key))); setBulkAction('delete') }}
                  className="text-[11px] font-black text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 transition">
                  Empty Recycle Bin ({items.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Single item confirm */}
      {actionItem && actionType && (
        <ConfirmModal
          title={actionType === 'restore' ? 'Restore Item?' : 'Permanently Delete?'}
          subtitle={actionItem.full_label ?? actionItem.name}
          body={actionType === 'restore'
            ? `"${actionItem.full_label ?? actionItem.name}" will be restored and become active again.`
            : `"${actionItem.full_label ?? actionItem.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel={actionType === 'restore' ? 'Yes, Restore' : 'Yes, Delete Permanently'}
          danger={actionType === 'delete'}
          loading={acting}
          onConfirm={confirmSingle}
          onClose={() => { setActionItem(null); setActionType(null) }}
        />
      )}

      {/* Bulk confirm */}
      {bulkAction && (
        <ConfirmModal
          title={bulkAction === 'restore' ? `Restore ${selectedItems.length} Items?` : `Delete ${selectedItems.length} Items Permanently?`}
          subtitle="Bulk action"
          body={bulkAction === 'restore'
            ? `${selectedItems.length} item(s) will be restored and become active again.`
            : `${selectedItems.length} item(s) will be permanently deleted. This cannot be undone.`}
          confirmLabel={bulkAction === 'restore' ? 'Restore All' : 'Delete All Permanently'}
          danger={bulkAction === 'delete'}
          loading={acting}
          onConfirm={confirmBulk}
          onClose={() => setBulkAction(null)}
        />
      )}
    </div>
  )
}
