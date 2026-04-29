import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getToken, API_BASE } from '../../lib/auth'

const ADMIN_API = `${API_BASE}/api/v1/admin`

type Member = {
  id: number
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  role?: string | null
  status?: string | null
  pivot?: { role?: string }
}

type Team = {
  id: number
  name: string
  status?: string
  subcontractor_id?: number
  company?: string
  members?: Member[]
}

type Subcontractor = {
  id: number
  name: string
  company: string
}

type AddMemberForm = {
  first_name: string
  last_name: string
  email: string
  role: string
  cellphone: string
  status: 'active' | 'inactive'
}

const USER_ROLES = ['lineman', 'team_lead', 'helper', 'supervisor', 'field_staff']

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-sky-600',
]

const ACCENT_COLORS = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
]

const roleBadge: Record<string, string> = {
  team_lead:   'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  lineman:     'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  helper:      'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  supervisor:  'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  field_staff: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
}

const iCls = 'h-10 w-full rounded-xl border border-[#d8e6f8] bg-[#f7fbff] px-3 text-sm text-slate-800 outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100'
const lCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400'

function emptyForm(): AddMemberForm {
  return { first_name: '', last_name: '', email: '', role: 'lineman', cellphone: '', status: 'active' }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function roleLabel(role?: string) {
  if (!role) return '—'
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

type TempPassBannerProps = { name: string; password: string; onClose: () => void }
function TempPassBanner({ name, password, onClose }: TempPassBannerProps) {
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-2xl dark:bg-zinc-900">
        <div className="bg-linear-to-r from-violet-500 to-purple-500 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/20">
              <i className="bx bx-check text-white text-xl" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Account Created</p>
              <p className="text-xs text-white/80">{name}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-xs text-slate-500 mb-2">Temporary password — user must change on first login.</p>
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
            <i className="bx bx-key text-violet-600 text-lg" />
            <span className="flex-1 font-mono text-base font-bold tracking-widest text-violet-700">{password}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(password)}
              className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-600 hover:bg-violet-50"
            >
              Copy
            </button>
          </div>
          <button onClick={onClose} className="mt-4 h-10 w-full rounded-2xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TeamDetail() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>()
  const subconId  = Number(id)
  const teamIdNum = Number(teamId)

  const [team, setTeam]       = useState<Team | null>(null)
  const [subcon, setSubcon]   = useState<Subcontractor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [isAddOpen, setIsAddOpen]   = useState(false)
  const [addTab, setAddTab]         = useState<'select' | 'create'>('select')
  const [form, setForm]             = useState<AddMemberForm>(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [addError, setAddError]     = useState<string | null>(null)
  const [tempPass, setTempPass]     = useState<{ name: string; password: string } | null>(null)

  // Select-existing state
  const [userSearch, setUserSearch]       = useState('')
  const [userResults, setUserResults]     = useState<Member[]>([])
  const [userLoading, setUserLoading]     = useState(false)
  const [selectedUser, setSelectedUser]   = useState<Member | null>(null)
  const [selectRole, setSelectRole]       = useState('lineman')

  // Edit member state
  const [editMember, setEditMember]       = useState<Member | null>(null)
  const [editRole, setEditRole]           = useState('lineman')
  const [editSaving, setEditSaving]       = useState(false)
  const [editError, setEditError]         = useState<string | null>(null)

  // Delete member state
  const [deleteMember, setDeleteMember]   = useState<Member | null>(null)
  const [deleting, setDeleting]           = useState(false)

  function unwrap(d: unknown) {
    if (d && typeof d === 'object' && 'data' in d) return (d as { data: unknown }).data
    return d
  }

  function resolveName(u: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined, fallbackFirst: string, fallbackLast: string): string {
    if (u?.full_name) return u.full_name
    const parts = [u?.first_name, u?.last_name].filter(Boolean).join(' ')
    if (parts) return parts
    return `${fallbackFirst} ${fallbackLast}`
  }

  function loadTeam() {
    fetch(`${ADMIN_API}/teams/${teamIdNum}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setTeam(unwrap(d) as Team))
      .catch(() => {})
  }

  useEffect(() => {
    if (!teamIdNum) return
    setLoading(true)
    Promise.all([
      fetch(`${ADMIN_API}/teams/${teamIdNum}`, { headers: authHeaders() }).then(r => r.json()),
      subconId
        ? fetch(`${ADMIN_API}/subcontractors/${subconId}`, { headers: authHeaders() }).then(r => r.json())
        : Promise.resolve(null),
    ])
      .then(([rawTeam, rawSubcon]) => {
        console.log('[TeamDetail] rawTeam:', rawTeam, 'rawSubcon:', rawSubcon)
        const teamData = unwrap(rawTeam) as Team
        console.log('[TeamDetail] teamData:', teamData)
        if (!teamData || typeof teamData !== 'object' || !('id' in teamData)) {
          setError('Team not found or API returned unexpected format')
          return
        }
        setTeam(teamData)
        if (rawSubcon) setSubcon(unwrap(rawSubcon) as Subcontractor)
      })
      .catch(err => setError(err?.message ?? 'Failed to load team'))
      .finally(() => setLoading(false))
  }, [teamIdNum, subconId])

  function openAddMember() {
    setForm(emptyForm())
    setAddError(null)
    setAddTab('select')
    setUserSearch('')
    setUserResults([])
    setSelectedUser(null)
    setSelectRole('lineman')
    setIsAddOpen(true)
  }

  async function searchUsers(q: string) {
    setUserSearch(q)
    if (q.trim().length < 2) { setUserResults([]); return }
    setUserLoading(true)
    try {
      const res = await fetch(`${ADMIN_API}/users?company=globe&search=${encodeURIComponent(q)}`, { headers: authHeaders() })
      const raw = await res.json()
      const list = raw?.data ?? raw
      setUserResults(Array.isArray(list) ? list : (list?.data ?? []))
    } catch { setUserResults([]) }
    finally { setUserLoading(false) }
  }

  async function handleSelectExisting() {
    if (!selectedUser) return
    setSaving(true)
    setAddError(null)
    try {
      const res = await fetch(`${ADMIN_API}/teams/${teamIdNum}/members`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_id: selectedUser.id, role: selectRole }),
      })
      const raw = await res.json()
      if (!res.ok) {
        const msg = raw.message ?? raw.error ?? `Server error ${res.status}`
        throw new Error(msg)
      }
      const newMember: Member = { ...selectedUser, role: selectRole }
      setTeam(prev => prev ? { ...prev, members: [...(prev.members ?? []), newMember] } : prev)
      setIsAddOpen(false)
      loadTeam()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setAddError(null)
    try {
      // Step 1 — create the user account
      const userPayload = {
        company:          'globe',
        subcontractor_id: subconId || undefined,
        team_id:          teamIdNum,
        first_name:       form.first_name.trim(),
        last_name:        form.last_name.trim(),
        email:            form.email.trim(),
        role:             form.role,
        status:           form.status,
        ...(form.cellphone.trim() ? { cellphone: form.cellphone.trim() } : {}),
      }
      const userRes = await fetch(`${ADMIN_API}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(userPayload),
      })
      const userRaw = await userRes.json()
      console.log('[AddMember] create user status:', userRes.status, userRaw)

      if (!userRes.ok) {
        const msg = userRaw.message
          ?? userRaw.error
          ?? (Object.values(userRaw.errors ?? {}) as string[][])?.[0]?.[0]
          ?? `Server error ${userRes.status}`
        throw new Error(msg)
      }

      const bodyData = userRaw?.data ?? userRaw
      const createdUser = bodyData?.user ?? bodyData
      const userId: number | undefined = createdUser?.id
      const tempPassword: string = userRaw?.temp_password ?? userRaw?.data?.temp_password ?? ''
      const fullName = resolveName(createdUser, form.first_name, form.last_name)
      console.log('[AddMember] createdUser:', createdUser, 'userId:', userId, 'tempPassword:', tempPassword)

      // Step 2 — add user to team pivot table
      if (userId) {
        const pivotRes = await fetch(`${ADMIN_API}/teams/${teamIdNum}/members`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ user_id: userId, role: form.role }),
        })
        console.log('[AddMember] pivot status:', pivotRes.status)
      }

      // Optimistic update — show the new member immediately
      const newMember: Member = {
        id:        userId ?? Date.now(),
        full_name: fullName,
        email:     createdUser?.email ?? form.email.trim(),
        role:      createdUser?.role  ?? form.role,
        status:    createdUser?.status ?? form.status,
      }
      setTeam(prev => prev ? { ...prev, members: [...(prev.members ?? []), newMember] } : prev)

      setIsAddOpen(false)
      setTempPass({ name: fullName, password: tempPassword })
      loadTeam()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditMember() {
    if (!editMember) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`${ADMIN_API}/users/${editMember.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ role: editRole }),
      })
      const raw = await res.json()
      if (!res.ok) throw new Error(raw.message ?? raw.error ?? `Server error ${res.status}`)
      setTeam(prev => prev ? {
        ...prev,
        members: (prev.members ?? []).map(m => m.id === editMember.id ? { ...m, role: editRole } : m),
      } : prev)
      setEditMember(null)
      loadTeam()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDeleteMember() {
    if (!deleteMember) return
    setDeleting(true)
    try {
      const res = await fetch(`${ADMIN_API}/teams/${teamIdNum}/members`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ user_id: deleteMember.id }),
      })
      if (!res.ok) {
        const raw = await res.json()
        throw new Error(raw.message ?? `Server error ${res.status}`)
      }
      setTeam(prev => prev ? {
        ...prev,
        members: (prev.members ?? []).filter(m => m.id !== deleteMember.id),
      } : prev)
      setDeleteMember(null)
      loadTeam()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex h-60 items-center justify-center">
      <i className="bx bx-loader-alt animate-spin text-3xl text-sky-500" />
    </div>
  )

  if (error || !team) return (
    <div className="flex h-60 flex-col items-center justify-center gap-2 text-slate-400">
      <i className="bx bx-error-circle text-3xl" />
      <p className="text-sm">{error ?? 'Team not found'}</p>
      <Link to={`/subcontractors/${subconId}/teams`} className="text-xs font-semibold text-sky-600 hover:underline">
        ← Back to teams
      </Link>
    </div>
  )

  const members = team.members ?? []
  const accent  = ACCENT_COLORS[teamIdNum % ACCENT_COLORS.length]

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/subcontractors" className="hover:text-sky-600 transition">Subcontractors</Link>
        <i className="bx bx-chevron-right text-slate-300" />
        <Link to={`/subcontractors/${subconId}`} className="hover:text-sky-600 transition">
          {subcon?.name ?? 'Subcontractor'}
        </Link>
        <i className="bx bx-chevron-right text-slate-300" />
        <Link to={`/subcontractors/${subconId}/teams`} className="hover:text-sky-600 transition">Teams</Link>
        <i className="bx bx-chevron-right text-slate-300" />
        <span className="font-semibold text-slate-900 dark:text-slate-100">{team.name}</span>
      </nav>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        <div className={`h-1.5 w-full bg-linear-to-r ${accent}`} />
        <div className="flex flex-wrap items-center justify-between gap-5 p-6">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${accent} text-white shadow-md`}>
              <i className="bx bx-shield text-2xl" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">{team.name}</h4>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${team.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${team.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {team.status === 'active' ? 'Active' : team.status ?? 'Active'}
                </span>
              </div>
              {subcon && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <i className="bx bx-buildings text-slate-300" />
                  {subcon.name}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{members.length}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Members</p>
            </div>
            <div className="h-8 w-px bg-slate-100 dark:bg-zinc-700" />
            <div className="text-center">
              <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                {members.filter(m => m.status === 'active').length || members.length}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active</p>
            </div>
            <div className="h-8 w-px bg-slate-100 dark:bg-zinc-700" />
            <button
              onClick={openAddMember}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-500/30 transition hover:bg-violet-700"
            >
              <i className="bx bx-user-plus text-base" /> Add Member
            </button>
          </div>
        </div>
      </div>

      {/* Members table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-900 dark:ring-zinc-700">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-zinc-700">
          <div>
            <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100">Team Members</h5>
            <p className="mt-0.5 text-xs text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={openAddMember}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
          >
            <i className="bx bx-plus" /> Add Member
          </button>
        </div>

        {members.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-zinc-800">
              <i className="bx bx-group text-2xl text-slate-300" />
            </div>
            <p className="text-sm">No members in this team yet</p>
            <button
              onClick={openAddMember}
              className="rounded-full bg-violet-50 px-4 py-1.5 text-xs font-black text-violet-600 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-400"
            >
              Add first member
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8f0fb] bg-[#f4f8ff] dark:border-[#1e3352] dark:bg-[#111d30]">
                  {['#', 'Member', 'Email', 'Role', 'Status', ''].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-[#8aa8d4]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => {
                  const avColor = AVATAR_COLORS[m.id % AVATAR_COLORS.length]
                  const rb      = roleBadge[m.role ?? ''] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                  return (
                    <tr key={m.id} className="border-b border-[#f0f5ff] last:border-0 hover:bg-[#f5f9ff] dark:border-[#19304d]/60 dark:hover:bg-[#0f1e33]/60 transition">
                      <td className="px-4 py-3 text-[11px] font-bold tabular-nums text-[#b0c8e8]">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${avColor} text-[11px] font-black text-white`}>
                            {initials(m.full_name)}
                          </div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {m.full_name ?? [m.first_name, m.last_name].filter(Boolean).join(' ') ?? '—'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{m.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        {m.role ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${rb}`}>
                            {roleLabel(m.role)}
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${m.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {m.status === 'active' ? 'Active' : m.status ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditMember(m); setEditRole(m.role ?? 'lineman'); setEditError(null) }}
                            className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-100 transition dark:bg-sky-500/10 dark:text-sky-400"
                          >
                            <i className="bx bx-edit-alt text-sm" /> Edit
                          </button>
                          <button
                            onClick={() => setDeleteMember(m)}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-100 transition dark:bg-red-500/10 dark:text-red-400"
                          >
                            <i className="bx bx-trash text-sm" /> Remove
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
      </div>

      {/* Add Member Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={() => setIsAddOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[30px] border border-[#e8d8ff] bg-white shadow-2xl dark:border-[#3a2060] dark:bg-[#0f1728]">

            {/* Header */}
            <div className="bg-linear-to-r from-violet-600 to-purple-500 px-6 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/30 bg-white/15">
                  <i className="bx bx-group text-white text-lg" />
                </div>
                <div className="flex-1">
                  <h5 className="text-sm font-bold text-white">Add Member to {team.name}</h5>
                  <p className="text-xs text-white/75">Select an existing user or create a new account</p>
                </div>
                <button onClick={() => setIsAddOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20">
                  <i className="bx bx-x text-[21px]" />
                </button>
              </div>

              {/* Tabs */}
              <div className="mt-4 flex gap-1 rounded-xl bg-white/10 p-1">
                {(['select', 'create'] as const).map(t => (
                  <button key={t} type="button" onClick={() => { setAddTab(t); setAddError(null) }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${addTab === t ? 'bg-white text-violet-700' : 'text-white/80 hover:bg-white/10'}`}>
                    {t === 'select' ? '🔍  Select Existing' : '➕  Create New'}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-6">
              {addError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{addError}</div>
              )}

              {/* ── SELECT EXISTING TAB ── */}
              {addTab === 'select' && (
                <div className="space-y-4">
                  <div>
                    <label className={lCls}>Search User</label>
                    <input
                      value={userSearch}
                      onChange={e => searchUsers(e.target.value)}
                      placeholder="Type name or email (min 2 chars)…"
                      className={iCls}
                    />
                  </div>

                  {/* Results list */}
                  {userLoading && (
                    <div className="flex justify-center py-4">
                      <i className="bx bx-loader-alt animate-spin text-violet-500 text-xl" />
                    </div>
                  )}
                  {!userLoading && userResults.length > 0 && (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-xl border border-slate-100 dark:border-zinc-700 p-1">
                      {userResults.map(u => {
                        const name = resolveName(u, u.first_name ?? '', u.last_name ?? '')
                        const isSelected = selectedUser?.id === u.id
                        return (
                          <button key={u.id} type="button" onClick={() => setSelectedUser(u)}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${isSelected ? 'bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-700/40'}`}>
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white bg-linear-to-br ${AVATAR_COLORS[u.id % AVATAR_COLORS.length]}`}>
                              {initials(u.full_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{name}</p>
                              <p className="text-xs text-slate-400 truncate">{u.email ?? ''}</p>
                            </div>
                            {isSelected && <i className="bx bx-check-circle text-violet-600 text-lg" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {!userLoading && userSearch.length >= 2 && userResults.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-3">No users found</p>
                  )}

                  {/* Selected user + role */}
                  {selectedUser && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-500/10 px-4 py-3 space-y-3">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                        Selected: {resolveName(selectedUser, selectedUser.first_name ?? '', selectedUser.last_name ?? '')}
                      </p>
                      <div>
                        <label className={lCls}>Role in this team</label>
                        <div className="relative">
                          <select value={selectRole} onChange={e => setSelectRole(e.target.value)} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                            {USER_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                          </select>
                          <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 border-t border-slate-100 pt-4 dark:border-zinc-700">
                    <button type="button" onClick={() => setIsAddOpen(false)} className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      Cancel
                    </button>
                    <button type="button" onClick={handleSelectExisting} disabled={!selectedUser || saving}
                      className="h-10 flex-1 rounded-2xl bg-violet-600 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition hover:bg-violet-700 disabled:opacity-50">
                      {saving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Adding…</span> : 'Add to Team'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── CREATE NEW TAB ── */}
              {addTab === 'create' && (
                <form onSubmit={handleAddMember} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lCls}>First Name</label>
                      <input required value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Juan" className={iCls} />
                    </div>
                    <div>
                      <label className={lCls}>Last Name</label>
                      <input required value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Dela Cruz" className={iCls} />
                    </div>
                  </div>
                  <div>
                    <label className={lCls}>Email</label>
                    <input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="juan@example.com" className={iCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lCls}>Role</label>
                      <div className="relative">
                        <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                          {USER_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                        </select>
                        <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                    <div>
                      <label className={lCls}>Status</label>
                      <div className="relative">
                        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as 'active' | 'inactive' }))} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={lCls}>Cellphone</label>
                    <input value={form.cellphone} onChange={e => setForm(p => ({ ...p, cellphone: e.target.value }))} placeholder="09XXXXXXXXX" className={iCls} />
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 pt-4 dark:border-zinc-700">
                    <button type="button" onClick={() => setIsAddOpen(false)} className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className="h-10 flex-1 rounded-2xl bg-violet-600 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition hover:bg-violet-700 disabled:opacity-60">
                      {saving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Creating…</span> : 'Create Account'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Member Modal ── */}
      {editMember && (
        <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={() => setEditMember(null)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-[#e8d8ff] bg-white shadow-2xl dark:border-[#3a2060] dark:bg-[#0f1728]">
            <div className="bg-linear-to-r from-sky-500 to-blue-600 px-6 py-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/30 bg-white/15">
                <i className="bx bx-edit text-white text-lg" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Edit Member</p>
                <p className="text-xs text-white/75 truncate">
                  {resolveName(editMember, editMember.first_name ?? '', editMember.last_name ?? '')}
                </p>
              </div>
              <button onClick={() => setEditMember(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20">
                <i className="bx bx-x text-lg" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={lCls}>Role in this team</label>
                <div className="relative">
                  <select value={editRole} onChange={e => setEditRole(e.target.value)} className={`${iCls} appearance-none pr-8 cursor-pointer`}>
                    {USER_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                  <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              {editError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{editError}</div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditMember(null)} className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  Cancel
                </button>
                <button type="button" onClick={handleEditMember} disabled={editSaving} className="h-10 flex-1 rounded-2xl bg-sky-600 text-sm font-semibold text-white shadow-md shadow-sky-500/30 hover:bg-sky-700 transition disabled:opacity-60">
                  {editSaving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Saving…</span> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteMember && (
        <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={() => setDeleteMember(null)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-red-200 bg-white shadow-2xl dark:border-red-900/50 dark:bg-[#0f1728]">
            <div className="p-6 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10">
                <i className="bx bx-trash text-2xl text-red-500" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">Remove Member?</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                  <span className="font-semibold text-slate-700 dark:text-zinc-200">
                    {resolveName(deleteMember, deleteMember.first_name ?? '', deleteMember.last_name ?? '')}
                  </span>{' '}
                  will be removed from <span className="font-semibold">{team.name}</span>.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setDeleteMember(null)} className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  Cancel
                </button>
                <button type="button" onClick={handleDeleteMember} disabled={deleting} className="h-10 flex-1 rounded-2xl bg-red-500 text-sm font-semibold text-white shadow-md shadow-red-500/30 hover:bg-red-600 transition disabled:opacity-60">
                  {deleting ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Removing…</span> : 'Yes, Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tempPass && (
        <TempPassBanner
          name={tempPass.name}
          password={tempPass.password}
          onClose={() => setTempPass(null)}
        />
      )}
    </div>
  )
}
