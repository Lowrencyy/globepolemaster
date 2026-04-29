import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getToken, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

const ADMIN_API = `${API_BASE}/api/v1/admin`

type Team = {
  id: number
  name: string
  status?: string
  members?: { id: number; full_name: string; pivot?: { role?: string } }[]
}

type Subcontractor = {
  id: number
  name: string
  company: string
  teams?: Team[]
}

type TeamForm = { name: string; status: string }

const ACCENTS = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
]

const iCls = 'h-10 w-full rounded-xl border border-[#d8e6f8] bg-[#f7fbff] px-3 text-sm text-slate-800 outline-none transition focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100'

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

export default function SubcontractorTeams() {
  const { id } = useParams<{ id: string }>()
  const subconId = Number(id)
  const navigate = useNavigate()

  const [subcon, setSubcon] = useState<Subcontractor | null>(null)
  const [loading, setLoading] = useState(true)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [teamForm, setTeamForm] = useState<TeamForm>({ name: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function load() {
    const hit = cacheGet<Subcontractor>(`subconteams_${subconId}`)
    if (hit) { setSubcon(hit); setLoading(false) } else setLoading(true)
    fetch(`${ADMIN_API}/subcontractors/${subconId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setSubcon(d); cacheSet(`subconteams_${subconId}`, d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [subconId])

  async function handleAddTeam(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setAddError(null)
    try {
      const payload = {
        name: teamForm.name.trim(),
        status: teamForm.status,
        subcontractor_id: subconId,
        company: subcon?.company ?? 'globe',
      }
      const res = await fetch(`${ADMIN_API}/teams`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to create team')
      setIsAddOpen(false)
      setTeamForm({ name: '', status: 'active' })
      load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const teams = subcon?.teams ?? []

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
        <span className="font-semibold text-slate-900 dark:text-slate-100">Teams</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-[1px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/[0.04] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/15 via-blue-500/8 to-cyan-400/12" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 rounded-[27px] bg-gradient-to-br from-white via-slate-50 to-white p-6 dark:from-zinc-900 dark:via-slate-950 dark:to-zinc-900">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/30">
              <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/40 to-transparent" />
              <i className="bx bx-shield relative text-[26px]" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
                {subcon?.name ?? '—'}
              </p>
              <h4 className="mt-0.5 text-[22px] font-black tracking-[-0.04em] text-slate-950 dark:text-white">
                Teams
              </h4>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {teams.length} team{teams.length !== 1 ? 's' : ''} registered
              </p>
            </div>
          </div>

          <button
            onClick={() => { setAddError(null); setTeamForm({ name: '', status: 'active' }); setIsAddOpen(true) }}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-sky-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-sky-500/40"
          >
            <i className="bx bx-plus text-lg" /> Add Team
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Teams', value: teams.length, accent: 'from-sky-500 to-blue-600', icon: 'bx bx-shield' },
          { label: 'Active', value: teams.filter(t => t.status === 'active').length, accent: 'from-emerald-500 to-teal-500', icon: 'bx bx-check-circle' },
          { label: 'Total Members', value: teams.reduce((s, t) => s + (t.members ?? []).length, 0), accent: 'from-violet-500 to-purple-600', icon: 'bx bx-group' },
        ].map(c => (
          <div key={c.label} className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/80 p-[1px] shadow-md ring-1 ring-slate-950/[0.04] dark:border-white/10 dark:bg-zinc-900/80">
            <div className={`absolute inset-0 bg-gradient-to-br ${c.accent} opacity-15`} />
            <div className="absolute inset-[1px] rounded-[21px] bg-white dark:bg-zinc-900" />
            <div className="relative flex items-center justify-between gap-3 rounded-[21px] p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{c.label}</p>
                <p className="mt-1.5 font-mono text-3xl font-black leading-none tracking-tight text-slate-900 dark:text-white">{c.value}</p>
              </div>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-white shadow-md`}>
                <i className={`${c.icon} text-xl`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Teams grid */}
      {loading ? (
        <div className="flex h-56 items-center justify-center rounded-[24px] border border-slate-100 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <i className="bx bx-loader-alt animate-spin text-3xl text-sky-500" />
        </div>
      ) : teams.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-[24px] border border-slate-100 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-500/10">
            <i className="bx bx-shield text-2xl text-sky-400" />
          </div>
          <p className="text-sm font-semibold text-slate-400">No teams yet</p>
          <button
            onClick={() => setIsAddOpen(true)}
            className="rounded-full bg-sky-50 px-4 py-1.5 text-xs font-black text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400"
          >
            Create first team
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((t, idx) => {
            const accent = ACCENTS[idx % ACCENTS.length]
            const members = t.members ?? []
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/subcontractors/${subconId}/teams/${t.id}`)}
                className="group relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-[1px] text-left shadow-md ring-1 ring-slate-950/[0.04] transition duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-zinc-900/80"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-10 transition group-hover:opacity-20`} />
                <div className="absolute inset-[1px] rounded-[23px] bg-gradient-to-br from-white to-slate-50 dark:from-zinc-900 dark:to-slate-950" />
                <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-2xl`} />

                <div className="relative rounded-[23px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${accent} text-white shadow-md`}>
                      <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/40 to-transparent" />
                      <i className="bx bx-shield relative text-[22px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-black tracking-tight text-slate-900 transition group-hover:text-sky-600 dark:text-white">
                        {t.name}
                      </p>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${t.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {t.status ?? 'active'}
                      </span>
                    </div>
                    <i className="bx bx-chevron-right mt-1 text-xl text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-zinc-800">
                    <i className="bx bx-group text-slate-300" />
                    <span className="text-xs font-semibold text-slate-500">
                      {members.length} member{members.length !== 1 ? 's' : ''}
                    </span>
                    {members.length > 0 && (
                      <div className="ml-auto flex -space-x-1.5">
                        {members.slice(0, 4).map((m, i) => (
                          <div
                            key={m.id}
                            title={m.full_name}
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-black text-white dark:border-zinc-900 ${ACCENTS[i % ACCENTS.length].split(' ')[0]} bg-gradient-to-br ${ACCENTS[i % ACCENTS.length]}`}
                          >
                            {m.full_name?.[0]?.toUpperCase()}
                          </div>
                        ))}
                        {members.length > 4 && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[9px] font-black text-slate-600 dark:border-zinc-900 dark:bg-zinc-700 dark:text-zinc-300">
                            +{members.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Add Team Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={() => setIsAddOpen(false)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-[#dbe8ff] bg-white shadow-2xl dark:border-[#27436a] dark:bg-[#0f1728]">
            <div className="bg-gradient-to-r from-[#0057d9] to-[#0072ff] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/30 bg-white/15">
                  <i className="bx bx-shield text-white" />
                </div>
                <div className="flex-1">
                  <h5 className="text-sm font-bold text-white">New Team</h5>
                  <p className="text-xs text-white/70">Under {subcon?.name}</p>
                </div>
                <button onClick={() => setIsAddOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 hover:bg-white/20">
                  <i className="bx bx-x text-xl" />
                </button>
              </div>
            </div>
            <form onSubmit={handleAddTeam} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Team Name</label>
                <input
                  required
                  value={teamForm.name}
                  onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Alpha Team"
                  className={iCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</label>
                <div className="relative">
                  <select
                    value={teamForm.status}
                    onChange={e => setTeamForm(p => ({ ...p, status: e.target.value }))}
                    className={`${iCls} appearance-none pr-8 cursor-pointer`}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              {addError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{addError}</div>
              )}
              <div className="flex gap-2 border-t border-slate-100 pt-4 dark:border-zinc-700">
                <button type="button" onClick={() => setIsAddOpen(false)} className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="h-10 flex-1 rounded-2xl bg-sky-600 text-sm font-semibold text-white shadow-md shadow-sky-500/30 transition hover:bg-sky-700 disabled:opacity-60">
                  {saving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Saving…</span> : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
