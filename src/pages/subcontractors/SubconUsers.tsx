import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import { getToken, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

const ADMIN_API = `${API_BASE}/api/v1/admin`

type UserStatus = 'active' | 'inactive' | 'on_hold'

type SubconUser = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  email: string
  role: string
  status: UserStatus
  cellphone?: string | null
  last_login?: string | null
  subcontractor_id?: number | null
  team_id?: number | null
  subcontractor?: { id: number; name: string } | null
  team?: { id: number; name: string } | null
}

type Subcontractor = { id: number; name: string; company: string }
type Team = { id: number; name: string; subcontractor_id?: number | null }

type CreateForm = {
  first_name: string
  last_name: string
  email: string
  role: string
  cellphone: string
  subcontractor_id: number | ''
  team_id: number | ''
  status: UserStatus
}

const emptyForm = (): CreateForm => ({
  first_name: '', last_name: '', email: '', role: 'lineman',
  cellphone: '', subcontractor_id: '', team_id: '', status: 'active',
})

const ROLES = ['lineman', 'team_lead', 'helper', 'supervisor', 'field_staff']

const statusCfg: Record<UserStatus, { label: string; badge: string; dot: string }> = {
  active:   { label: 'Active',   badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  inactive: { label: 'Inactive', badge: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',      dot: 'bg-slate-400' },
  on_hold:  { label: 'On Hold',  badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-400' },
}

const roleBadge: Record<string, string> = {
  team_lead:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  lineman:    'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  helper:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  supervisor: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  field_staff:'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600', 'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600', 'from-cyan-500 to-sky-600',
]

const iCls = 'h-10 w-full rounded-xl border border-[#d8e6f8] bg-[#f7fbff] px-3 text-sm text-slate-800 outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100'
const lCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'
const primaryBtn = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition hover:bg-violet-700 disabled:opacity-60'
const secondaryBtn = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className={lCls}>{label}</label>{children}</div>
}

function avatarInitials(u: SubconUser) {
  return `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '?'
}

/* ── Temp Password Banner ──────────────────────────────────────────────────── */
function TempPassBanner({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-2xl dark:border-violet-800 dark:bg-zinc-900">
        <div className="bg-gradient-to-r from-violet-500 to-purple-500 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/20"><i className="bx bx-check text-white text-xl" /></div>
            <div>
              <p className="text-sm font-bold text-white">Subcon Account Created</p>
              <p className="text-xs text-white/80">{name}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-xs text-slate-500 mb-2">Share this temporary password. The user will be prompted to change it on first login.</p>
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-900/20">
            <i className="bx bx-key text-violet-600 text-lg" />
            <span className="flex-1 font-mono text-base font-bold tracking-widest text-violet-700 dark:text-violet-400">{password}</span>
            <button onClick={() => navigator.clipboard?.writeText(password)}
              className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-600 hover:bg-violet-50">
              Copy
            </button>
          </div>
          <button onClick={onClose} className={`${primaryBtn} mt-4 w-full`}>Done</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function SubconUsers() {
  const [users, setUsers]             = useState<SubconUser[]>([])
  const [subcons, setSubcons]         = useState<Subcontractor[]>([])
  const [teams, setTeams]             = useState<Team[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  const [search, setSearch]           = useState('')
  const [subconFilter, setSubconFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all')

  const [isAddOpen, setIsAddOpen]     = useState(false)
  const [addForm, setAddForm]         = useState<CreateForm>(emptyForm())
  const [addError, setAddError]       = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)

  const [tempPass, setTempPass]       = useState<{ name: string; password: string } | null>(null)
  const [resettingId, setResettingId] = useState<number | null>(null)

  useEffect(() => {
    const hSubcons = cacheGet<Subcontractor[]>('subconusers_subcons')
    if (hSubcons) setSubcons(hSubcons)
    fetch(`${ADMIN_API}/subcontractors?per_page=100`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { const list = Array.isArray(d) ? d : (d.data ?? []); setSubcons(list); cacheSet('subconusers_subcons', list) }).catch(() => {})
    const hTeams = cacheGet<Team[]>('subconusers_teams')
    if (hTeams) setTeams(hTeams)
    fetch(`${ADMIN_API}/teams?per_page=100`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { const list = Array.isArray(d) ? d : (d.data ?? []); setTeams(list); cacheSet('subconusers_teams', list) }).catch(() => {})
  }, [])

  function load() {
    const cacheKey = `subconusers_${subconFilter}_${statusFilter}`
    const hit = cacheGet<SubconUser[]>(cacheKey)
    if (hit) { setUsers(hit); setLoading(false) } else setLoading(true)
    setError(null)
    const p = new URLSearchParams({ per_page: '100' })
    if (subconFilter !== 'all') p.set('subcontractor_id', String(subconFilter))
    if (statusFilter !== 'all') p.set('status', statusFilter)
    fetch(`${ADMIN_API}/users?${p}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const arr: SubconUser[] = Array.isArray(d) ? d : (d.data ?? [])
        const filtered = arr.filter(u => u.subcontractor_id != null)
        setUsers(filtered)
        cacheSet(cacheKey, filtered)
      })
      .catch(err => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [subconFilter, statusFilter])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q)
  })

  const counts = {
    total:    users.length,
    active:   users.filter(u => u.status === 'active').length,
    inactive: users.filter(u => u.status !== 'active').length,
  }

  const filteredTeams = addForm.subcontractor_id
    ? teams.filter(t => t.subcontractor_id === addForm.subcontractor_id)
    : teams

  async function handleAdd(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setAddError(null)
    try {
      const payload: Record<string, unknown> = {
        company:          'skycable',
        role:             addForm.role,
        first_name:       addForm.first_name,
        last_name:        addForm.last_name,
        email:            addForm.email,
        status:           addForm.status,
        subcontractor_id: addForm.subcontractor_id || undefined,
        team_id:          addForm.team_id || undefined,
      }
      if (addForm.cellphone) payload.cellphone = addForm.cellphone

      const res  = await fetch(`${ADMIN_API}/users`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.message ?? (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed'
        throw new Error(msg)
      }
      setIsAddOpen(false)
      setAddForm(emptyForm())
      setTempPass({ name: data.user.full_name, password: data.temp_password })
      load()
    } catch (err) { setAddError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleStatusToggle(u: SubconUser) {
    const next: UserStatus = u.status === 'active' ? 'inactive' : 'active'
    const res = await fetch(`${ADMIN_API}/users/${u.id}/status`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: next }),
    })
    if (res.ok) setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: next } : x))
  }

  async function handleResetPassword(u: SubconUser) {
    setResettingId(u.id)
    const res  = await fetch(`${ADMIN_API}/users/${u.id}/reset-password`, { method: 'POST', headers: authHeaders() })
    const data = await res.json()
    setResettingId(null)
    if (res.ok) setTempPass({ name: u.full_name, password: data.temp_password })
  }

  const subconName = (id: number | null | undefined) => subcons.find(s => s.id === id)?.name ?? `Subcon #${id}`
  const teamName   = (id: number | null | undefined) => teams.find(t => t.id === id)?.name ?? `Team #${id}`

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-[18px] font-bold text-slate-900 dark:text-slate-100">Subcontractor Users</h4>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Field staff registered under subcontractor teams</p>
        </div>
        <button onClick={() => { setAddForm(emptyForm()); setAddError(null); setIsAddOpen(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-500/30 hover:bg-violet-700 transition">
          <i className="bx bx-plus text-base" /> Add Field Staff
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Staff',  value: counts.total,    accent: 'from-violet-500 to-purple-500' },
          { label: 'Active',       value: counts.active,   accent: 'from-emerald-500 to-teal-500'  },
          { label: 'Inactive',     value: counts.inactive, accent: 'from-slate-400 to-slate-500'   },
        ].map(c => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
            <div className={`h-1 w-full bg-gradient-to-r ${c.accent}`} />
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{c.label}</p>
              <p className="mt-2 text-[28px] font-extrabold leading-none text-gray-800 dark:text-gray-100">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-900 dark:ring-zinc-700">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-zinc-700">
          <div className="relative flex-1 min-w-[200px]">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, role…"
              className="h-9 w-full rounded-full border border-[#d8e6f8] bg-white pl-9 pr-4 text-xs text-slate-600 outline-none focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10" />
          </div>
          <div className="relative">
            <select value={subconFilter === 'all' ? 'all' : subconFilter} onChange={e => setSubconFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-9 appearance-none rounded-full border border-[#d8e6f8] bg-white pl-3 pr-8 text-xs text-slate-600 outline-none">
              <option value="all">All Subcontractors</option>
              {subcons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-9 appearance-none rounded-full border border-[#d8e6f8] bg-white pl-3 pr-8 text-xs text-slate-600 outline-none">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_hold">On Hold</option>
            </select>
            <i className="bx bx-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          </div>
          <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50">
            <i className="bx bx-refresh text-base" />
          </button>
          <span className="text-xs text-slate-400">{filtered.length} staff</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                {['#', 'Staff', 'Email', 'Subcontractor', 'Team', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-16 text-center">
                  <i className="bx bx-loader-alt animate-spin text-2xl text-violet-500" />
                  <p className="mt-2 text-sm text-slate-400">Loading…</p>
                </td></tr>
              ) : error ? (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-red-500">
                  <i className="bx bx-error-circle text-2xl" /><br />{error}
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center">
                  <i className="bx bx-group text-3xl text-slate-300" />
                  <p className="mt-2 text-sm text-slate-400">No field staff found</p>
                </td></tr>
              ) : filtered.map((u, idx) => {
                const sc  = statusCfg[u.status] ?? statusCfg.inactive
                const rb  = roleBadge[u.role] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                const avC = AVATAR_COLORS[u.id % AVATAR_COLORS.length]
                return (
                  <tr key={u.id} className="border-b border-[#f0f5ff] last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60 transition">
                    <td className="px-4 py-3 text-[11px] font-bold tabular-nums text-[#b0c8e8]">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avC} text-[11px] font-black text-white`}>
                          {avatarInitials(u)}
                        </div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">{u.full_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                        {u.subcontractor?.name ?? (u.subcontractor_id ? subconName(u.subcontractor_id) : '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {u.team?.name ?? (u.team_id ? teamName(u.team_id) : '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${rb}`}>
                        {u.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleStatusToggle(u)} title={u.status === 'active' ? 'Deactivate' : 'Activate'}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg transition hover:scale-110 ${u.status === 'active' ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
                          <i className={`bx ${u.status === 'active' ? 'bx-toggle-right' : 'bx-toggle-left'} text-xl`} />
                        </button>
                        <button onClick={() => handleResetPassword(u)} disabled={resettingId === u.id} title="Reset password"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-amber-50 hover:text-amber-600">
                          {resettingId === u.id
                            ? <i className="bx bx-loader-alt animate-spin text-sm" />
                            : <i className="bx bx-key text-sm" />}
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

      {/* Temp password banner */}
      {tempPass && <TempPassBanner name={tempPass.name} password={tempPass.password} onClose={() => setTempPass(null)} />}

      {/* Add Field Staff Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={() => setIsAddOpen(false)} />
          <div className="relative w-full max-w-lg rounded-[30px] border border-[#e8d8ff] bg-white shadow-[0_36px_100px_-34px_rgba(80,20,120,0.4)] dark:border-[#3a2060] dark:bg-[#0f1728]">
            <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
            <div className="relative overflow-hidden rounded-t-[30px] border-b border-white/20 bg-gradient-to-r from-violet-600 via-purple-600 to-violet-500 px-6 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/30 bg-white/15"><i className="bx bx-hard-hat text-white text-[19px]" /></div>
                <div className="flex-1">
                  <h5 className="text-sm font-bold text-white">Add Field Staff</h5>
                  <p className="mt-0.5 text-xs text-white/80">Register subcontractor field member</p>
                </div>
                <button onClick={() => setIsAddOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20">
                  <i className="bx bx-x text-[21px]" />
                </button>
              </div>
            </div>

            <form onSubmit={handleAdd} className="relative max-h-[75vh] overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-[#fdf8ff]/95 to-white dark:from-[#0f1728] dark:to-[#0f1728]">
              <div className="grid grid-cols-2 gap-4">
                <F label="First Name">
                  <input required value={addForm.first_name} onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))}
                    placeholder="Juan" className={iCls} />
                </F>
                <F label="Last Name">
                  <input required value={addForm.last_name} onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))}
                    placeholder="Dela Cruz" className={iCls} />
                </F>
              </div>
              <F label="Email Address">
                <input required type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="juan@example.com" className={iCls} />
              </F>
              <F label="Subcontractor">
                <div className="relative">
                  <select required value={addForm.subcontractor_id} onChange={e => setAddForm(p => ({ ...p, subcontractor_id: Number(e.target.value) || '', team_id: '' }))}
                    className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                    <option value="">Select subcontractor</option>
                    {subcons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </F>
              <div className="grid grid-cols-2 gap-4">
                <F label="Team">
                  <div className="relative">
                    <select value={addForm.team_id} onChange={e => setAddForm(p => ({ ...p, team_id: Number(e.target.value) || '' }))}
                      className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                      <option value="">{addForm.subcontractor_id ? 'Select team' : 'Choose subcontractor first'}</option>
                      {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </F>
                <F label="Role">
                  <div className="relative">
                    <select value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
                      className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                      {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                    </select>
                    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <F label="Cellphone">
                  <input value={addForm.cellphone} onChange={e => setAddForm(p => ({ ...p, cellphone: e.target.value }))}
                    placeholder="09XXXXXXXXX" className={iCls} />
                </F>
                <F label="Status">
                  <div className="relative">
                    <select value={addForm.status} onChange={e => setAddForm(p => ({ ...p, status: e.target.value as UserStatus }))}
                      className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </F>
              </div>

              {addError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{addError}</div>}

              <div className="flex gap-2 border-t border-[#e4eefb] pt-4">
                <button type="button" onClick={() => setIsAddOpen(false)} className={`${secondaryBtn} flex-1`}>Cancel</button>
                <button type="submit" disabled={saving} className={`${primaryBtn} flex-1`}>
                  {saving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Creating…</span> : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
