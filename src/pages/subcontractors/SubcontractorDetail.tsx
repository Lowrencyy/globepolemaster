import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getToken, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

const ADMIN_API = `${API_BASE}/api/v1/admin`
const SKYCABLE_API = `${API_BASE}/api/v1/skycable`

type UserStatus = 'active' | 'inactive' | 'on_hold'
type Tab = 'users' | 'teams' | 'warehouse'

type StaffUser = {
  id: number; full_name: string; first_name: string; last_name: string
  email: string; role: string; status: UserStatus
  cellphone?: string | null; last_login?: string | null
  team_id?: number | null
}

type Team = {
  id: number; name: string; status?: string
  members?: { id: number; full_name: string; pivot?: { role?: string } }[]
}

type WarehouseStock = { id: number; item_type: string; quantity: number; unit?: string | null }

type Warehouse = {
  id: number; name: string; type?: string; status?: string; sqm?: number | null
  stocks?: WarehouseStock[]
}

type SubcontractorDetail = {
  id: number; name: string; company: string; status: string
  contact_name?: string | null; contact_phone?: string | null
  contact_email?: string | null; address?: string | null
  teams?: Team[]; warehouses?: Warehouse[]
}

type UserForm = {
  first_name: string; last_name: string; email: string
  role: string; cellphone: string; team_id: number | ''; status: UserStatus
}

type TeamForm = { name: string; status: string }

const emptyUserForm = (): UserForm => ({
  first_name: '', last_name: '', email: '', role: 'lineman',
  cellphone: '', team_id: '', status: 'active',
})
const emptyTeamForm = (): TeamForm => ({ name: '', status: 'active' })

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

const USER_ROLES = ['lineman', 'team_lead', 'helper', 'supervisor', 'field_staff']

const iCls = 'h-10 w-full rounded-xl border border-[#d8e6f8] bg-[#f7fbff] px-3 text-sm text-slate-800 outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100'
const lCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'
const primaryBtn = 'h-10 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-md shadow-sky-500/30 transition hover:bg-sky-700 disabled:opacity-60'
const violetBtn  = 'h-10 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition hover:bg-violet-700 disabled:opacity-60'
const secondaryBtn = 'h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className={lCls}>{label}</label>{children}</div>
}

function initials(u: StaffUser) {
  return `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '?'
}

/* ── Temp Password Banner ─────────────────────────────────────────── */
function TempPassBanner({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-2xl dark:bg-zinc-900">
        <div className="bg-gradient-to-r from-violet-500 to-purple-500 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/20"><i className="bx bx-check text-white text-xl" /></div>
            <div><p className="text-sm font-bold text-white">Account Created</p><p className="text-xs text-white/80">{name}</p></div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-xs text-slate-500 mb-2">Temporary password — user must change this on first login.</p>
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
            <i className="bx bx-key text-violet-600 text-lg" />
            <span className="flex-1 font-mono text-base font-bold tracking-widest text-violet-700">{password}</span>
            <button onClick={() => navigator.clipboard?.writeText(password)}
              className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-600 hover:bg-violet-50">Copy</button>
          </div>
          <button onClick={onClose} className={`${violetBtn} mt-4 w-full`}>Done</button>
        </div>
      </div>
    </div>
  )
}

/* ── Add User Modal ────────────────────────────────────────────────── */
function AddUserModal({ teams, onSubmit, onClose, saving, error }: {
  teams: Team[]; onSubmit: (f: UserForm) => void; onClose: () => void; saving: boolean; error: string | null
}) {
  const [form, setForm] = useState<UserForm>(emptyUserForm())
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-[30px] border border-[#e8d8ff] bg-white shadow-[0_36px_100px_-34px_rgba(80,20,120,0.4)] dark:border-[#3a2060] dark:bg-[#0f1728]">
        <div className="overflow-hidden rounded-t-[30px] border-b border-white/20 bg-gradient-to-r from-violet-600 to-purple-500 px-6 py-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/30 bg-white/15"><i className="bx bx-hard-hat text-white text-[19px]" /></div>
            <div className="flex-1"><h5 className="text-sm font-bold text-white">Add Staff Member</h5><p className="text-xs text-white/80">Register under this subcontractor</p></div>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20"><i className="bx bx-x text-[21px]" /></button>
          </div>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="max-h-[70vh] overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-[#fdf8ff]/95 to-white dark:from-[#0f1728] dark:to-[#0f1728]">
          <div className="grid grid-cols-2 gap-4">
            <F label="First Name"><input required value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Juan" className={iCls} /></F>
            <F label="Last Name"><input required value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Dela Cruz" className={iCls} /></F>
          </div>
          <F label="Email"><input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="juan@example.com" className={iCls} /></F>
          <div className="grid grid-cols-2 gap-4">
            <F label="Team">
              <div className="relative">
                <select value={form.team_id} onChange={e => setForm(p => ({ ...p, team_id: Number(e.target.value) || '' }))} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                  <option value="">No team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </F>
            <F label="Role">
              <div className="relative">
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                  {USER_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="Cellphone"><input value={form.cellphone} onChange={e => setForm(p => ({ ...p, cellphone: e.target.value }))} placeholder="09XXXXXXXXX" className={iCls} /></F>
            <F label="Status">
              <div className="relative">
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as UserStatus }))} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </F>
          </div>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex gap-2 border-t border-[#e4eefb] pt-4">
            <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${violetBtn} flex-1`}>
              {saving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Creating…</span> : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function SubcontractorDetail() {
  const { id } = useParams<{ id: string }>()
  const subconId = Number(id)
  const navigate = useNavigate()

  const [subcon, setSubcon]     = useState<SubcontractorDetail | null>(null)
  const [subconLoading, setSubconLoading] = useState(true)

  const [users, setUsers]       = useState<StaffUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const [tab, setTab]           = useState<Tab>('users')

  const [isAddUserOpen, setIsAddUserOpen]   = useState(false)
  const [isAddTeamOpen, setIsAddTeamOpen]   = useState(false)
  const [addUserError, setAddUserError]     = useState<string | null>(null)
  const [addTeamError, setAddTeamError]     = useState<string | null>(null)
  const [teamForm, setTeamForm]             = useState<TeamForm>(emptyTeamForm())
  const [saving, setSaving]                 = useState(false)
  const [tempPass, setTempPass]             = useState<{ name: string; password: string } | null>(null)
  const [resettingId, setResettingId]       = useState<number | null>(null)

  useEffect(() => {
    if (!subconId) return
    const hit = cacheGet<SubcontractorDetail>(`subcondetail_${subconId}`)
    if (hit) { setSubcon(hit); setSubconLoading(false) }
    else setSubconLoading(true)
    fetch(`${ADMIN_API}/subcontractors/${subconId}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setSubcon(d); cacheSet(`subcondetail_${subconId}`, d) }).catch(() => {}).finally(() => setSubconLoading(false))
  }, [subconId])

  function loadUsers() {
    if (!subconId) return
    const hit = cacheGet<StaffUser[]>(`subcondetail_${subconId}_users`)
    if (hit) { setUsers(hit); setUsersLoading(false) }
    else setUsersLoading(true)
    fetch(`${ADMIN_API}/users?subcontractor_id=${subconId}&per_page=100`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : (d.data ?? []); setUsers(list); cacheSet(`subcondetail_${subconId}_users`, list) })
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }

  useEffect(() => { if (tab === 'users') loadUsers() }, [tab, subconId])

  async function handleAddUser(form: UserForm) {
    setSaving(true); setAddUserError(null)
    try {
      const payload: Record<string, unknown> = {
        company: subcon?.company ?? 'skycable',
        role: form.role,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        status: form.status,
        subcontractor_id: subconId,
      }
      if (form.team_id) payload.team_id = form.team_id
      if (form.cellphone) payload.cellphone = form.cellphone

      const res  = await fetch(`${ADMIN_API}/users`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.message ?? (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ?? 'Failed'
        throw new Error(msg)
      }
      setIsAddUserOpen(false)
      setTempPass({ name: data.user.full_name, password: data.temp_password })
      loadUsers()
    } catch (err) { setAddUserError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleAddTeam(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setAddTeamError(null)
    try {
      const payload = { name: teamForm.name, status: teamForm.status, subcontractor_id: subconId, company: subcon?.company ?? 'skycable' }
      const res  = await fetch(`${ADMIN_API}/teams`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed')
      setIsAddTeamOpen(false)
      setTeamForm(emptyTeamForm())
      fetch(`${ADMIN_API}/subcontractors/${subconId}`, { headers: authHeaders() })
        .then(r => r.json()).then(d => { setSubcon(d); cacheSet(`subcondetail_${subconId}`, d) }).catch(() => {})
    } catch (err) { setAddTeamError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleStatusToggle(u: StaffUser) {
    const next: UserStatus = u.status === 'active' ? 'inactive' : 'active'
    const res = await fetch(`${ADMIN_API}/users/${u.id}/status`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: next }),
    })
    if (res.ok) setUsers(prev => {
      const updated = prev.map(x => x.id === u.id ? { ...x, status: next } : x)
      cacheSet(`subcondetail_${subconId}_users`, updated)
      return updated
    })
  }

  async function handleResetPassword(u: StaffUser) {
    setResettingId(u.id)
    const res  = await fetch(`${ADMIN_API}/users/${u.id}/reset-password`, { method: 'POST', headers: authHeaders() })
    const data = await res.json()
    setResettingId(null)
    if (res.ok) setTempPass({ name: u.full_name, password: data.temp_password })
  }

  const teams    = subcon?.teams ?? []
  const warehouses = subcon?.warehouses ?? []

  if (subconLoading) return (
    <div className="flex h-60 items-center justify-center"><i className="bx bx-loader-alt animate-spin text-3xl text-sky-500" /></div>
  )

  if (!subcon) return (
    <div className="flex h-60 flex-col items-center justify-center gap-2 text-slate-400">
      <i className="bx bx-error-circle text-3xl" />
      <p className="text-sm">Subcontractor not found</p>
      <Link to="/subcontractors" className="text-xs font-semibold text-sky-600 hover:underline">← Back to list</Link>
    </div>
  )

  const companyCfg: Record<string, { label: string; badge: string; dot: string }> = {
    skycable: { label: 'Skycable', badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    globe:    { label: 'Globe',    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  }
  const cc = companyCfg[subcon.company] ?? { label: subcon.company, badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200', dot: 'bg-slate-400' }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/subcontractors" className="hover:text-sky-600 transition">Subcontractors</Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{subcon.name}</span>
      </nav>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        <div className="h-1.5 w-full bg-gradient-to-r from-sky-500 to-blue-600" />
        <div className="flex flex-wrap items-start gap-5 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-2xl font-black text-white shadow-md shadow-sky-500/30">
            {subcon.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">{subcon.name}</h4>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cc.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cc.dot}`} />{cc.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${subcon.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
                {subcon.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
              {subcon.contact_name  && <span className="flex items-center gap-1.5"><i className="bx bx-user text-slate-300" />{subcon.contact_name}</span>}
              {subcon.contact_phone && <span className="flex items-center gap-1.5"><i className="bx bx-phone text-slate-300" />{subcon.contact_phone}</span>}
              {subcon.contact_email && <span className="flex items-center gap-1.5"><i className="bx bx-envelope text-slate-300" />{subcon.contact_email}</span>}
              {subcon.address       && <span className="flex items-center gap-1.5"><i className="bx bx-map-pin text-slate-300" />{subcon.address}</span>}
            </div>
          </div>
          {/* Quick stats + action buttons */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{users.length || '—'}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Staff</p>
              </div>
              <div className="h-8 w-px bg-slate-100 dark:bg-zinc-700" />
              <div className="text-center">
                <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{teams.length}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Teams</p>
              </div>
              <div className="h-8 w-px bg-slate-100 dark:bg-zinc-700" />
              <div className="text-center">
                <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{warehouses.length}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Warehouses</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/subcontractors/${subconId}/teams`)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-500/30 transition hover:bg-sky-700"
              >
                <i className="bx bx-shield text-sm" /> View Teams
              </button>
              <button
                onClick={() => { setAddUserError(null); setIsAddUserOpen(true) }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-violet-500/30 transition hover:bg-violet-700"
              >
                <i className="bx bx-plus text-sm" /> Add Staff
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-900 dark:ring-zinc-700">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 dark:border-zinc-700">
          <div className="flex gap-1">
            {([
              { key: 'users',     label: 'Staff / Users',  icon: 'bx-group' },
              { key: 'teams',     label: 'Teams',          icon: 'bx-shield' },
              { key: 'warehouse', label: 'Warehouse',      icon: 'bx-store' },
            ] as { key: Tab; label: string; icon: string }[]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-xs font-bold transition ${tab === t.key ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <i className={`bx ${t.icon} text-sm`} />{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Users Tab ─────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                  {['#', 'Staff Member', 'Email', 'Team', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={8} className="py-14 text-center">
                    <i className="bx bx-loader-alt animate-spin text-2xl text-violet-500" />
                    <p className="mt-2 text-sm text-slate-400">Loading staff…</p>
                  </td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={8} className="py-14 text-center">
                    <i className="bx bx-group text-3xl text-slate-300" />
                    <p className="mt-2 text-sm text-slate-400">No staff yet</p>
                    <button onClick={() => setIsAddUserOpen(true)} className="mt-2 text-xs font-semibold text-violet-600 hover:underline">Add first member</button>
                  </td></tr>
                ) : users.map((u, idx) => {
                  const sc  = statusCfg[u.status] ?? statusCfg.inactive
                  const rb  = roleBadge[u.role] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                  const avC = AVATAR_COLORS[u.id % AVATAR_COLORS.length]
                  const teamName = teams.find(t => t.id === u.team_id)?.name
                  return (
                    <tr key={u.id} className="border-b border-[#f0f5ff] last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60 transition">
                      <td className="px-4 py-3 text-[11px] font-bold tabular-nums text-[#b0c8e8]">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avC} text-[11px] font-black text-white`}>{initials(u)}</div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{u.full_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {teamName ?? '—'}
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
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleStatusToggle(u)} title={u.status === 'active' ? 'Deactivate' : 'Activate'}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${u.status === 'active' ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
                            <i className={`bx ${u.status === 'active' ? 'bx-toggle-right' : 'bx-toggle-left'} text-xl`} />
                          </button>
                          <button onClick={() => handleResetPassword(u)} disabled={resettingId === u.id} title="Reset password"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-amber-50 hover:text-amber-600">
                            {resettingId === u.id ? <i className="bx bx-loader-alt animate-spin text-sm" /> : <i className="bx bx-key text-sm" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Teams Tab ─────────────────────────────────────────────── */}
        {tab === 'teams' && (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-500/10">
              <i className="bx bx-shield text-2xl text-sky-500" />
            </div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {teams.length} team{teams.length !== 1 ? 's' : ''} under this subcontractor
            </p>
            <button
              onClick={() => navigate(`/subcontractors/${subconId}/teams`)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-500/30 transition hover:bg-sky-700"
            >
              <i className="bx bx-shield" /> View Teams
            </button>
          </div>
        )}

        {/* ── Warehouse Tab ──────────────────────────────────────────── */}
        {tab === 'warehouse' && (
          <div className="p-5">
            {warehouses.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
                <i className="bx bx-store text-3xl" />
                <p className="text-sm">No warehouse found</p>
                <p className="text-xs text-slate-400">Warehouse is auto-created when subcontractor is added</p>
              </div>
            ) : (
              <div className="space-y-4">
                {warehouses.map(w => (
                  <div key={w.id} className="overflow-hidden rounded-xl border border-slate-100 dark:border-zinc-700">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                      <div className="flex items-center gap-2.5">
                        <i className="bx bx-store text-sky-500" />
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{w.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        {w.sqm && <span>{w.sqm} sqm</span>}
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${w.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {w.status ?? 'active'}
                        </span>
                      </div>
                    </div>
                    {(w.stocks ?? []).length === 0 ? (
                      <div className="flex h-28 items-center justify-center text-sm text-slate-400">
                        <i className="bx bx-package mr-2 text-slate-300" /> No stock yet
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                              {['Item Type', 'Quantity', 'Unit'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4]">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(w.stocks ?? []).map(s => (
                              <tr key={s.id} className="border-b border-[#f0f5ff] last:border-0">
                                <td className="px-4 py-3">
                                  <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 capitalize">{s.item_type.replace(/_/g, ' ')}</span>
                                </td>
                                <td className="px-4 py-3 font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.quantity}</td>
                                <td className="px-4 py-3 text-xs text-slate-400">{s.unit ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddUserOpen && (
        <AddUserModal
          teams={teams}
          onSubmit={handleAddUser}
          onClose={() => setIsAddUserOpen(false)}
          saving={saving}
          error={addUserError}
        />
      )}

      {/* Add Team Modal */}
      {isAddTeamOpen && (
        <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={() => setIsAddTeamOpen(false)} />
          <div className="relative w-full max-w-sm rounded-[28px] border border-[#dbe8ff] bg-white shadow-2xl dark:border-[#27436a] dark:bg-[#0f1728]">
            <div className="overflow-hidden rounded-t-[28px] border-b border-white/20 bg-linear-to-r from-[#0057d9] to-[#0072ff] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/30 bg-white/15"><i className="bx bx-shield text-white" /></div>
                <div className="flex-1"><h5 className="text-sm font-bold text-white">New Team</h5><p className="text-xs text-white/70">Under {subcon.name}</p></div>
                <button onClick={() => setIsAddTeamOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20"><i className="bx bx-x" /></button>
              </div>
            </div>
            <form onSubmit={handleAddTeam} className="p-5 space-y-4 bg-linear-to-b from-[#f8fbff]/95 to-white dark:from-[#0f1728] dark:to-[#0f1728]">
              <F label="Team Name">
                <input required value={teamForm.name} onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Alpha Team" className={iCls} />
              </F>
              <F label="Status">
                <div className="relative">
                  <select value={teamForm.status} onChange={e => setTeamForm(p => ({ ...p, status: e.target.value }))} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </F>
              {addTeamError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{addTeamError}</div>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsAddTeamOpen(false)} className={`${secondaryBtn} flex-1`}>Cancel</button>
                <button type="submit" disabled={saving} className={`${primaryBtn} flex-1`}>
                  {saving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Saving…</span> : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temp password banner */}
      {tempPass && <TempPassBanner name={tempPass.name} password={tempPass.password} onClose={() => setTempPass(null)} />}
    </div>
  )
}
