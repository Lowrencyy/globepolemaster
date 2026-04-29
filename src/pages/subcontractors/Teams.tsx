import { useMemo, useState, type FormEvent, type ReactNode } from 'react'

interface Team {
  id: number
  name: string
  lead: string
  description: string
  members: number
  status: 'Active' | 'Inactive'
  created_at: string
}

type TeamStatus = Team['status']

type TeamForm = {
  name: string
  lead: string
  description: string
  members: string
  status: TeamStatus
}

const INITIAL_TEAMS: Team[] = [
  {
    id: 1,
    name: 'Alpha Team',
    lead: 'Juan dela Cruz',
    description: 'Handles QC North area teardown',
    members: 4,
    status: 'Active',
    created_at: '2026-01-10',
  },
  {
    id: 2,
    name: 'Bravo Team',
    lead: 'Maria Santos',
    description: 'Assigned to Makati CBD pole spans',
    members: 3,
    status: 'Active',
    created_at: '2026-01-15',
  },
  {
    id: 3,
    name: 'Charlie Team',
    lead: 'Ramon Reyes',
    description: 'South Manila recovery operations',
    members: 5,
    status: 'Active',
    created_at: '2026-02-01',
  },
  {
    id: 4,
    name: 'Delta Team',
    lead: 'Sofia Mendoza',
    description: 'Pasig and Mandaluyong coverage',
    members: 3,
    status: 'Inactive',
    created_at: '2026-02-20',
  },
]

const AVATAR_GRADIENTS = [
  'from-blue-600 to-cyan-500',
  'from-emerald-600 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-violet-600 to-purple-500',
]

const emptyForm = (): TeamForm => ({
  name: '',
  lead: '',
  description: '',
  members: '',
  status: 'Active',
})

const inputCls =
  'h-10 w-full rounded-xl border border-[#d8e6f8] bg-[#f7fbff] px-3 text-sm text-slate-800 outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100 dark:placeholder:text-slate-500'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </label>
      {children}
    </div>
  )
}

function formatTeamId(id: number) {
  return id > 9999 ? String(id) : String(id).padStart(3, '0')
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>(INITIAL_TEAMS)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<TeamForm>(emptyForm())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return teams

    return teams.filter(
      team =>
        team.name.toLowerCase().includes(q) ||
        team.lead.toLowerCase().includes(q) ||
        team.description.toLowerCase().includes(q)
    )
  }, [search, teams])

  const totalMembers = useMemo(
    () => teams.reduce((sum, team) => sum + team.members, 0),
    [teams]
  )

  const activeCount = useMemo(
    () => teams.filter(team => team.status === 'Active').length,
    [teams]
  )

  function openModal() {
    setForm(emptyForm())
    setModal(true)
  }

  function closeModal() {
    setModal(false)
    setForm(emptyForm())
  }

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const next: Team = {
      id: Date.now(),
      name: form.name.trim(),
      lead: form.lead.trim(),
      description: form.description.trim(),
      members: Number(form.members) || 0,
      status: form.status,
      created_at: new Date().toISOString().slice(0, 10),
    }

    setTeams(prev => [next, ...prev])
    closeModal()
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-[18px] font-bold text-slate-900 dark:text-slate-100">
            Teams
          </h4>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage field teams and their assignments
          </p>
        </div>

        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/30 transition hover:bg-sky-700"
        >
          <i className="bx bx-plus text-base" />
          Add Team
        </button>
      </div>

      {/* Stats cards - always 4 in one row */}
      <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[760px] grid-cols-4 gap-4 lg:min-w-0">
          {[
            {
              label: 'Total Teams',
              value: teams.length,
              accent: 'from-[#0072ff] to-[#00a6ff]',
              icon: 'bx bx-group',
            },
            {
              label: 'Active',
              value: activeCount,
              accent: 'from-emerald-500 to-teal-500',
              icon: 'bx bx-check-circle',
            },
            {
              label: 'Inactive',
              value: teams.length - activeCount,
              accent: 'from-slate-400 to-slate-500',
              icon: 'bx bx-pause-circle',
            },
            {
              label: 'Total Members',
              value: totalMembers,
              accent: 'from-violet-500 to-purple-500',
              icon: 'bx bx-user',
            },
          ].map(card => (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-[1px] shadow-[0_18px_50px_-28px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/[0.04] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-34px_rgba(14,116,144,0.65)] dark:border-white/10 dark:bg-zinc-900/80 dark:ring-white/10"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-20 transition duration-300 group-hover:opacity-30`}
              />

              <div className="absolute inset-[1px] rounded-[23px] bg-gradient-to-br from-white via-slate-50 to-white dark:from-zinc-900 dark:via-slate-950 dark:to-zinc-900" />

              <div
                className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${card.accent} opacity-20 blur-2xl transition duration-300 group-hover:scale-125 group-hover:opacity-30`}
              />

              <div className="relative flex min-h-[118px] items-start justify-between gap-4 rounded-[23px] p-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    {card.label}
                  </p>

                  <p className="mt-3 font-mono text-[34px] font-black leading-none tracking-[-0.06em] text-slate-900 dark:text-white">
                    {card.value}
                  </p>

                  <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${card.accent}`}
                    />
                    Team overview
                  </div>
                </div>

                <div
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.8)]`}
                >
                  <div className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/45 to-transparent" />
                  <i className={`${card.icon} relative translate-y-px text-[23px]`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        {/* Table header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              All Teams
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {filtered.length} {filtered.length === 1 ? 'team' : 'teams'} shown
            </p>
          </div>

          <div className="relative min-w-[220px] max-w-sm flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams..."
              className="h-9 w-full rounded-full border border-[#d8e6f8] bg-white pl-9 pr-4 text-xs text-slate-600 outline-none transition focus:border-[#1683ff] focus:ring-2 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-700/50">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Team Lead
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Description
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Members
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Created
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-zinc-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-700">
                      <i className="bx bx-group text-2xl text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
                      No teams found.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((team, index) => (
                  <tr
                    key={team.id}
                    className="group transition-colors hover:bg-slate-50 dark:hover:bg-zinc-700/40"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${
                            AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]
                          } text-sm font-bold text-white shadow-sm`}
                        >
                          {team.name.charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <span className="font-semibold text-slate-900 transition-colors group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
                            {team.name}
                          </span>
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            ID: {formatTeamId(team.id)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <i className="bx bx-user-circle text-slate-300 dark:text-slate-600" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {team.lead}
                        </span>
                      </div>
                    </td>

                    <td className="max-w-[250px] truncate px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {team.description || '—'}
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-sm font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                        <i className="bx bx-user text-xs" />
                        {team.members}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                          team.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400'
                        }`}
                      >
                        <i
                          className={`bx ${
                            team.status === 'Active'
                              ? 'bx-check-circle'
                              : 'bx-pause-circle'
                          } text-xs`}
                        />
                        {team.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(team.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Team modal */}
      {modal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]"
            onClick={closeModal}
          />

          <div className="relative w-full max-w-lg rounded-[30px] border border-[#dbe8ff] bg-white shadow-[0_36px_100px_-34px_rgba(6,36,90,0.5)] dark:border-[#27436a] dark:bg-[#0f1728]">
            <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-[#0072ff]/15 blur-3xl" />

            <div className="relative overflow-hidden rounded-t-[30px] border-b border-white/20 bg-gradient-to-r from-[#0057d9] via-[#0072ff] to-[#00a6ff] px-6 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/30 bg-white/15">
                  <i className="bx bx-group text-[19px] text-white" />
                </div>

                <div className="flex-1">
                  <h5 className="text-sm font-bold text-white">Add Team</h5>
                  <p className="mt-0.5 text-xs text-white/80">
                    Fill in the team details below
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20"
                >
                  <i className="bx bx-x text-[21px]" />
                </button>
              </div>
            </div>

            <form
              onSubmit={handleAdd}
              className="relative max-h-[75vh] space-y-4 overflow-y-auto bg-gradient-to-b from-[#f8fbff]/92 to-white p-6 dark:from-[#0f1728] dark:to-[#0f1728]"
            >
              <Field label="Team Name">
                <input
                  required
                  className={inputCls}
                  placeholder="e.g. Echo Team"
                  value={form.name}
                  onChange={e =>
                    setForm(prev => ({ ...prev, name: e.target.value }))
                  }
                />
              </Field>

              <Field label="Team Lead">
                <input
                  required
                  className={inputCls}
                  placeholder="Full name"
                  value={form.lead}
                  onChange={e =>
                    setForm(prev => ({ ...prev, lead: e.target.value }))
                  }
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="No. of Members">
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.members}
                    onChange={e =>
                      setForm(prev => ({ ...prev, members: e.target.value }))
                    }
                  />
                </Field>

                <Field label="Status">
                  <div className="relative">
                    <select
                      className={`${inputCls} cursor-pointer appearance-none pr-8`}
                      value={form.status}
                      onChange={e =>
                        setForm(prev => ({
                          ...prev,
                          status: e.target.value as TeamStatus,
                        }))
                      }
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  className={`${inputCls} min-h-24 resize-none py-3`}
                  rows={3}
                  placeholder="What does this team handle?"
                  value={form.description}
                  onChange={e =>
                    setForm(prev => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </Field>

              <div className="flex gap-2 border-t border-[#e4eefb] pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="h-10 flex-1 rounded-2xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-md shadow-sky-500/30 transition hover:bg-sky-700"
                >
                  Save Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}