import { useState } from 'react'

interface SubconUser {
  id: number
  name: string
  email: string
  team: string
  role: string
  status: 'Active' | 'Inactive'
  joined: string
}

const TEAMS = ['Alpha Team', 'Bravo Team', 'Charlie Team', 'Delta Team']

const INITIAL_USERS: SubconUser[] = [
  { id: 1, name: 'Carlos Bautista', email: 'carlos@subcon.ph',  team: 'Alpha Team',   role: 'Technician', status: 'Active',   joined: '2026-01-11' },
  { id: 2, name: 'Liza Fernandez',  email: 'liza@subcon.ph',    team: 'Bravo Team',   role: 'Team Lead',  status: 'Active',   joined: '2026-01-16' },
  { id: 3, name: 'Mark Villanueva', email: 'mark@subcon.ph',    team: 'Charlie Team', role: 'Technician', status: 'Active',   joined: '2026-02-02' },
  { id: 4, name: 'Ana Domingo',     email: 'ana@subcon.ph',     team: 'Alpha Team',   role: 'Helper',     status: 'Inactive', joined: '2026-02-14' },
  { id: 5, name: 'Raffy Soriano',   email: 'raffy@subcon.ph',   team: 'Delta Team',   role: 'Technician', status: 'Active',   joined: '2026-03-01' },
]

const AVATAR_GRADIENTS = [
  'from-violet-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
  'from-cyan-500 to-blue-500',
]

const ROLE_BADGE: Record<string, string> = {
  'Team Lead':  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'Technician': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Helper':     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const inputCls = 'w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  )
}

export default function SubconUsers() {
  const [users, setUsers] = useState<SubconUser[]>(INITIAL_USERS)
  const [search, setSearch]   = useState('')
  const [teamFilter, setTeamFilter] = useState('All')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState({ name: '', email: '', team: '', role: 'Technician', status: 'Active' })

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
                        u.email.toLowerCase().includes(search.toLowerCase())
    const matchTeam   = teamFilter === 'All' || u.team === teamFilter
    return matchSearch && matchTeam
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const next: SubconUser = {
      id: Date.now(),
      name: form.name,
      email: form.email,
      team: form.team,
      role: form.role,
      status: form.status as SubconUser['status'],
      joined: new Date().toISOString().slice(0, 10),
    }
    setUsers(u => [next, ...u])
    setForm({ name: '', email: '', team: '', role: 'Technician', status: 'Active' })
    setModal(false)
  }

  const activeCount = users.filter(u => u.status === 'Active').length
  const teamCount   = new Set(users.map(u => u.team)).size

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-[18px] font-bold text-gray-800 dark:text-gray-100">Subcontractor Users</h4>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Field staff registered under subcontractor teams</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-violet-700 active:scale-95 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Users',    value: users.length,  color: 'text-violet-600 dark:text-violet-400',  bg: 'from-violet-50 to-white dark:from-violet-950/20 dark:to-zinc-900', border: 'border-violet-100' },
          { label: 'Active',         value: activeCount,   color: 'text-emerald-600 dark:text-emerald-400', bg: 'from-emerald-50 to-white dark:from-emerald-950/20 dark:to-zinc-900', border: 'border-emerald-100' },
          { label: 'Inactive',       value: users.length - activeCount, color: 'text-orange-500 dark:text-orange-400', bg: 'from-orange-50 to-white dark:from-orange-950/20 dark:to-zinc-900', border: 'border-orange-100' },
          { label: 'Teams Covered',  value: teamCount,     color: 'text-blue-600 dark:text-blue-400',       bg: 'from-blue-50 to-white dark:from-blue-950/20 dark:to-zinc-900', border: 'border-blue-100' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`rounded-3xl border ${border} dark:border-zinc-700 bg-gradient-to-br ${bg} p-5 shadow-sm`}>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="mt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-white shadow-sm dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
          <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">All Users</h2>
          <div className="flex items-center gap-2">
            {/* Team filter */}
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-400/30"
            >
              <option value="All">All Teams</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search users…"
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 pl-9 pr-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-400/30 w-48"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/50">
                <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">User</th>
                <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Email</th>
                <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Team</th>
                <th className="px-5 py-3 text-center text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Role</th>
                <th className="px-5 py-3 text-center text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500">No users found.</td></tr>
              )}
              {filtered.map((u, i) => (
                <tr key={u.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 shrink-0 rounded-2xl bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center text-white text-xs font-black shadow-sm`}>
                        {u.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-black text-zinc-800 dark:text-zinc-100">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">{u.email}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-xl bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300">{u.team}</span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ROLE_BADGE[u.role] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      u.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs font-medium text-zinc-400 dark:text-zinc-500">{u.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User modal */}
      {modal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModal(false)}>
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-50/60 to-white dark:from-zinc-900 dark:to-zinc-900 px-6 py-5">
              <div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Add Subcon User</h3>
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">Register a new field staff member</p>
              </div>
              <button onClick={() => setModal(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-bold text-base">×</button>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-4 p-6">
              <Field label="Full Name">
                <input required className={inputCls} placeholder="e.g. Jose Rizal"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Email Address">
                <input required className={inputCls} type="email" placeholder="user@email.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Team">
                  <select required className={inputCls} value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))}>
                    <option value="">Select team</option>
                    {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Role">
                  <select className={inputCls} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option>Technician</option>
                    <option>Team Lead</option>
                    <option>Helper</option>
                  </select>
                </Field>
              </div>
              <Field label="Status">
                <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </Field>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)} className="flex-1 rounded-2xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
                  Cancel
                </button>
                <button type="submit" className="flex-1 rounded-2xl bg-violet-600 py-2.5 text-sm font-black text-white hover:bg-violet-700 active:scale-95 transition">
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
