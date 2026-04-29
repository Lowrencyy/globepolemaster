import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, API_BASE } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'

const ADMIN_API = `${API_BASE}/api/v1/admin`

type SubconStatus = 'active' | 'inactive'
type Company = 'skycable' | 'globe'

type Subcontractor = {
  id: number
  name: string
  company: Company
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  address?: string | null
  status: SubconStatus
  teams?: { id: number; name: string }[]
  warehouses?: { id: number; name: string }[]
}

type CreateForm = {
  company: Company | ''
  name: string
  warehouse_name: string
  contact_phone: string
  contact_email: string
  address: string
  status: SubconStatus
}

const emptyForm = (): CreateForm => ({
  company: '',
  name: '',
  warehouse_name: '',
  contact_phone: '',
  contact_email: '',
  address: '',
  status: 'active',
})

const companyCfg: Record<
  Company,
  {
    label: string
    badge: string
    dot: string
    ring: string
    accent: string
  }
> = {
  skycable: {
    label: 'Skycable',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
    dot: 'bg-sky-500',
    ring: 'ring-sky-200 dark:ring-sky-500/20',
    accent: 'from-sky-500 to-blue-600',
  },
  globe: {
    label: 'Globe',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-200 dark:ring-emerald-500/20',
    accent: 'from-emerald-500 to-teal-600',
  },
}

const statusCfg: Record<
  SubconStatus,
  {
    label: string
    badge: string
    dot: string
  }
> = {
  active: {
    label: 'Active',
    badge:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  inactive: {
    label: 'Inactive',
    badge:
      'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-zinc-700 dark:text-zinc-400 dark:ring-zinc-600',
    dot: 'bg-slate-400',
  },
}

const CARD_ACCENTS = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
]

const inputCls =
  'h-11 w-full rounded-2xl border border-[#d8e6f8] bg-[#f7fbff] px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[#1683ff] focus:bg-white focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-[#4ea9ff] dark:focus:bg-[#162744]'

const labelCls =
  'mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500'

const primaryBtn =
  'h-11 rounded-2xl bg-sky-600 px-5 text-sm font-bold text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const secondaryBtn =
  'h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

function avatarLetter(name: string) {
  return name.trim()[0]?.toUpperCase() ?? '?'
}

function exportCSV(subcons: Subcontractor[]) {
  const header = ['ID', 'Name', 'Company', 'Status', 'Contact', 'Phone', 'Email', 'Address']
  const lines = subcons.map(s => [
    s.id, s.name, s.company, s.status,
    s.contact_name ?? '', s.contact_phone ?? '', s.contact_email ?? '', s.address ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'subcontractors.csv'; a.click()
  URL.revokeObjectURL(url)
}

function warehouseLabel(subcon: Subcontractor) {
  const warehouses = subcon.warehouses ?? []
  if (warehouses.length === 0) return 'No warehouse'
  if (warehouses.length === 1) return warehouses[0].name
  return `${warehouses.length} warehouses`
}

export default function Subcontractors() {
  const navigate = useNavigate()

  const [subcons, setSubcons] = useState<Subcontractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<Company | 'all'>('all')

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<CreateForm>(emptyForm())
  const [addError, setAddError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [successName, setSuccessName] = useState<string | null>(null)
  const [successWarehouse, setSuccessWarehouse] = useState<string | null>(null)

  function load() {
    const cacheKey = `subcons_${companyFilter}`
    const hit = cacheGet<Subcontractor[]>(cacheKey)
    if (hit) { setSubcons(hit); setLoading(false) } else setLoading(true)
    setError(null)

    const params = new URLSearchParams({ per_page: '100' })

    if (companyFilter !== 'all') {
      params.set('company', companyFilter)
    }

    fetch(`${ADMIN_API}/subcontractors?${params}`, { headers: authHeaders() })
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.data ?? []
        setSubcons(list)
        cacheSet(cacheKey, list)
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load subcontractors')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return subcons

    return subcons.filter(
      subcon =>
        subcon.name.toLowerCase().includes(q) ||
        (subcon.contact_phone ?? '').toLowerCase().includes(q) ||
        (subcon.contact_email ?? '').toLowerCase().includes(q) ||
        (subcon.address ?? '').toLowerCase().includes(q) ||
        (subcon.warehouses ?? []).some(warehouse => warehouse.name.toLowerCase().includes(q))
    )
  }, [search, subcons])

  const counts = useMemo(
    () => ({
      total: subcons.length,
      active: subcons.filter(subcon => subcon.status === 'active').length,
      inactive: subcons.filter(subcon => subcon.status === 'inactive').length,
      warehouses: subcons.reduce((sum, subcon) => sum + (subcon.warehouses ?? []).length, 0),
    }),
    [subcons]
  )

  function openAddModal() {
    setAddForm(emptyForm())
    setAddError(null)
    setIsAddOpen(true)
  }

  function closeAddModal() {
    setIsAddOpen(false)
    setAddForm(emptyForm())
    setAddError(null)
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setSaving(true)
    setAddError(null)

    try {
      const payload: Record<string, unknown> = {
        company: addForm.company,
        name: addForm.name.trim(),
        warehouse_name: addForm.warehouse_name.trim(),
        contact_phone: addForm.contact_phone.trim(),
        contact_email: addForm.contact_email.trim(),
        address: addForm.address.trim(),
        status: addForm.status,
      }

      const res = await fetch(`${ADMIN_API}/subcontractors`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        const msg =
          data.message ??
          (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ??
          'Failed to create subcontractor'

        throw new Error(msg)
      }

      setSuccessName(data.name ?? addForm.name)
      setSuccessWarehouse(data.warehouse?.name ?? addForm.warehouse_name)
      closeAddModal()
      load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Premium header */}
      <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-white/80 p-[1px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.65)] ring-1 ring-slate-950/[0.04] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 dark:ring-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/18 via-blue-500/8 to-cyan-400/16" />
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-5 rounded-[29px] bg-gradient-to-br from-white via-slate-50 to-white p-6 dark:from-zinc-900 dark:via-slate-950 dark:to-zinc-900">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-[0_18px_42px_-20px_rgba(2,132,199,0.9)]">
              <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/40 to-transparent" />
              <i className="bx bx-buildings relative text-[27px]" />
            </div>

            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Subcontractor Registry
              </div>

              <h4 className="mt-2 text-[22px] font-black tracking-[-0.04em] text-slate-950 dark:text-white">
                Subcontractors
              </h4>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manage subcon profiles, contact details, assigned teams, and warehouses.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={() => exportCSV(filtered)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <i className="bx bx-download text-[16px]" />
                Export
              </button>
            )}
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 px-5 text-sm font-black text-white shadow-[0_18px_36px_-18px_rgba(2,132,199,0.85)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_44px_-22px_rgba(2,132,199,0.95)]"
            >
              <i className="bx bx-plus text-[19px]" />
              Add Subcontractor
            </button>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[760px] grid-cols-4 gap-4 lg:min-w-0">
          {[
            {
              label: 'Total Subcons',
              value: counts.total,
              icon: 'bx bx-buildings',
              accent: 'from-[#0072ff] to-[#00a6ff]',
            },
            {
              label: 'Active',
              value: counts.active,
              icon: 'bx bx-check-circle',
              accent: 'from-emerald-500 to-teal-500',
            },
            {
              label: 'Inactive',
              value: counts.inactive,
              icon: 'bx bx-pause-circle',
              accent: 'from-slate-400 to-slate-500',
            },
            {
              label: 'Warehouses',
              value: counts.warehouses,
              icon: 'bx bx-store',
              accent: 'from-violet-500 to-purple-500',
            },
          ].map(card => (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-[1px] shadow-[0_18px_50px_-28px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/[0.04] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-34px_rgba(14,116,144,0.65)] dark:border-white/10 dark:bg-zinc-900/80 dark:ring-white/10"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-20`} />
              <div className="absolute inset-[1px] rounded-[23px] bg-gradient-to-br from-white via-slate-50 to-white dark:from-zinc-900 dark:via-slate-950 dark:to-zinc-900" />
              <div
                className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${card.accent} opacity-20 blur-2xl transition duration-300 group-hover:scale-125 group-hover:opacity-30`}
              />

              <div className="relative flex min-h-[118px] items-start justify-between gap-4 rounded-[23px] p-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    {card.label}
                  </p>

                  <p className="mt-3 font-mono text-[34px] font-black leading-none tracking-[-0.06em] text-slate-900 dark:text-white">
                    {card.value}
                  </p>

                  <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${card.accent}`} />
                    Live summary
                  </div>
                </div>

                <div
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.8)]`}
                >
                  <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/45 to-transparent" />
                  <i className={`${card.icon} relative translate-y-px text-[23px]`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-white/70 bg-white/75 p-3 shadow-sm ring-1 ring-slate-950/[0.04] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/75 dark:ring-white/10">
        <div className="relative min-w-[240px] flex-1">
          <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, address, CP number, email, warehouse..."
            className="h-11 w-full rounded-2xl border border-[#d8e6f8] bg-white pl-11 pr-4 text-sm text-slate-600 outline-none transition focus:border-[#1683ff] focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100"
          />
        </div>

        <div className="relative">
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value as Company | 'all')}
            className="h-11 cursor-pointer appearance-none rounded-2xl border border-[#d8e6f8] bg-white pl-4 pr-10 text-sm font-semibold text-slate-600 outline-none transition focus:border-[#1683ff] focus:ring-4 focus:ring-[#1683ff]/10 dark:border-[#29456e] dark:bg-[#11203a]/70 dark:text-slate-100"
          >
            <option value="all">All Companies</option>
            <option value="skycable">Skycable</option>
            <option value="globe">Globe</option>
          </select>
          <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
        </div>

        <button
          type="button"
          onClick={load}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-sky-600 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          <i className="bx bx-refresh text-lg" />
        </button>

        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
          {filtered.length} shown
        </span>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex h-56 items-center justify-center rounded-[28px] border border-slate-100 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-500/10">
              <i className="bx bx-loader-alt animate-spin text-3xl text-sky-500" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-400">Loading subcontractors...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-[28px] border border-red-100 bg-red-50 text-red-500 dark:border-red-500/20 dark:bg-red-500/10">
          <i className="bx bx-error-circle text-3xl" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-[28px] border border-slate-100 bg-white text-slate-400 dark:border-zinc-700 dark:bg-zinc-900">
          <i className="bx bx-buildings text-4xl" />
          <p className="text-sm font-semibold">No subcontractors found</p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-2 rounded-full bg-sky-50 px-4 py-2 text-xs font-black text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400"
          >
            Add one now
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((subcon, index) => {
            const company = companyCfg[subcon.company] ?? companyCfg.skycable
            const status = statusCfg[subcon.status] ?? statusCfg.inactive
            const accent = CARD_ACCENTS[index % CARD_ACCENTS.length]

            return (
              <button
                key={subcon.id}
                type="button"
                onClick={() => navigate(`/subcontractors/${subcon.id}`)}
                className="group relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-[1px] text-left shadow-[0_18px_50px_-32px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/[0.04] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-38px_rgba(14,116,144,0.65)] dark:border-white/10 dark:bg-zinc-900/80 dark:ring-white/10"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-14 transition group-hover:opacity-20`} />
                <div className="absolute inset-[1px] rounded-[27px] bg-gradient-to-br from-white via-slate-50 to-white dark:from-zinc-900 dark:via-slate-950 dark:to-zinc-900" />
                <div className={`absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-3xl`} />

                <div className="relative rounded-[27px] p-5">
                  <div className="flex items-start gap-4">
                    <div
                      className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${accent} text-xl font-black text-white shadow-[0_18px_36px_-20px_rgba(15,23,42,0.85)]`}
                    >
                      <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/45 to-transparent" />
                      <i className="bx bx-buildings relative text-[24px]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-black tracking-[-0.02em] text-slate-900 transition group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
                        {subcon.name}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${company.badge} ${company.ring}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${company.dot}`} />
                          {company.label}
                        </span>

                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ${status.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </div>
                    </div>

                    <i className="bx bx-chevron-right mt-2 text-2xl text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
                  </div>

                  <div className="mt-5 space-y-2.5 text-sm">
                    <div className="flex items-start gap-2.5 text-slate-500 dark:text-slate-400">
                      <i className="bx bx-map-pin mt-0.5 text-base text-slate-300 dark:text-zinc-600" />
                      <span className="line-clamp-1">{subcon.address || 'No address provided'}</span>
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
                      <i className="bx bx-phone text-base text-slate-300 dark:text-zinc-600" />
                      <span>{subcon.contact_phone || 'No CP number'}</span>
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
                      <i className="bx bx-envelope text-base text-slate-300 dark:text-zinc-600" />
                      <span className="truncate">{subcon.contact_email || 'No email address'}</span>
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
                      <i className="bx bx-store text-base text-slate-300 dark:text-zinc-600" />
                      <span className="truncate">{warehouseLabel(subcon)}</span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-4 border-t border-slate-100 pt-4 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                      <i className="bx bx-group text-sm text-slate-300" />
                      {(subcon.teams ?? []).length} team{(subcon.teams ?? []).length !== 1 ? 's' : ''}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                      <i className="bx bx-store text-sm text-slate-300" />
                      {(subcon.warehouses ?? []).length} warehouse{(subcon.warehouses ?? []).length !== 1 ? 's' : ''}
                    </div>

                    <div className="ml-auto font-mono text-[10px] font-black text-slate-300">
                      #{subcon.id}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Success notice */}
      {successName && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[30px] border border-emerald-200 bg-white shadow-2xl dark:border-emerald-500/20 dark:bg-zinc-900">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20">
                <i className="bx bx-check-circle text-3xl text-white" />
              </div>

              <p className="text-base font-black text-white">{successName}</p>
              <p className="mt-1 text-xs font-semibold text-white/80">Subcontractor created</p>
            </div>

            <div className="p-5 text-center">
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-left dark:border-emerald-800/30 dark:bg-emerald-900/10">
                <i className="bx bx-store mt-0.5 shrink-0 text-lg text-emerald-500" />
                <p className="text-xs leading-5 text-emerald-700 dark:text-emerald-400">
                  Warehouse <strong>{successWarehouse || 'New warehouse'}</strong> has been included in this subcontractor setup.
                </p>
              </div>

              <button type="button" onClick={() => setSuccessName(null)} className={`${primaryBtn} w-full`}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subcontractor Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[6px]" onClick={closeAddModal} />

          <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#dbe8ff] bg-white shadow-[0_36px_100px_-34px_rgba(6,36,90,0.5)] dark:border-[#27436a] dark:bg-[#0f1728]">
            <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-[#0072ff]/15 blur-3xl" />
            <div className="pointer-events-none absolute -right-14 -top-10 h-44 w-44 rounded-full bg-[#5fd0ff]/20 blur-3xl" />

            <div className="relative overflow-hidden border-b border-white/20 bg-gradient-to-r from-[#0057d9] via-[#0072ff] to-[#00a6ff] px-6 py-5">
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/30 to-transparent" />

              <div className="relative flex items-center gap-3.5">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white/15 text-white backdrop-blur-xl">
                  <div className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
                  <i className="bx bx-buildings relative text-[23px]" />
                </div>

                <div className="min-w-0 flex-1">
                  <h5 className="text-base font-black text-white">Add Subcontractor</h5>
                  <p className="mt-0.5 text-xs font-medium text-white/80">
                    Create subcon profile with contact details and warehouse name.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAddModal}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  <i className="bx bx-x text-[21px]" />
                </button>
              </div>
            </div>

            <form
              onSubmit={handleAdd}
              className="relative max-h-[75vh] space-y-5 overflow-y-auto bg-gradient-to-b from-[#f8fbff]/92 to-white p-6 dark:from-[#0f1728] dark:to-[#0f1728]"
            >
              <div className="rounded-[26px] border border-sky-100 bg-sky-50/70 p-4 dark:border-sky-500/15 dark:bg-sky-500/5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/20">
                    <i className="bx bx-id-card text-xl" />
                  </div>

                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                      Subcontractor Details
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Required details: subcontractor name, address, CP number, email, and warehouse name.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Company">
                  <div className="relative">
                    <select
                      required
                      value={addForm.company}
                      onChange={e => setAddForm(prev => ({ ...prev, company: e.target.value as Company }))}
                      className={`${inputCls} cursor-pointer appearance-none pr-10`}
                    >
                      <option value="">Select company</option>
                      <option value="skycable">Skycable</option>
                      <option value="globe">Globe</option>
                    </select>
                    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </Field>

                <Field label="Status">
                  <div className="relative">
                    <select
                      value={addForm.status}
                      onChange={e => setAddForm(prev => ({ ...prev, status: e.target.value as SubconStatus }))}
                      className={`${inputCls} cursor-pointer appearance-none pr-10`}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </Field>
              </div>

              <Field label="Subcontractor Name">
                <div className="relative">
                  <i className="bx bx-buildings absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    required
                    value={addForm.name}
                    onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. ABC Field Services Inc."
                    className={`${inputCls} pl-10`}
                  />
                </div>
              </Field>

              <Field label="Warehouse Name">
                <div className="relative">
                  <i className="bx bx-store absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    required
                    value={addForm.warehouse_name}
                    onChange={e => setAddForm(prev => ({ ...prev, warehouse_name: e.target.value }))}
                    placeholder="e.g. ABC Main Warehouse"
                    className={`${inputCls} pl-10`}
                  />
                </div>
              </Field>

              <Field label="Address">
                <div className="relative">
                  <i className="bx bx-map-pin absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    required
                    value={addForm.address}
                    onChange={e => setAddForm(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Street, barangay, city"
                    className={`${inputCls} pl-10`}
                  />
                </div>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="CP Number">
                  <div className="relative">
                    <i className="bx bx-phone absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input
                      required
                      value={addForm.contact_phone}
                      onChange={e => setAddForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                      placeholder="09XXXXXXXXX"
                      className={`${inputCls} pl-10`}
                    />
                  </div>
                </Field>

                <Field label="Email">
                  <div className="relative">
                    <i className="bx bx-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input
                      required
                      type="email"
                      value={addForm.contact_email}
                      onChange={e => setAddForm(prev => ({ ...prev, contact_email: e.target.value }))}
                      placeholder="contact@company.com"
                      className={`${inputCls} pl-10`}
                    />
                  </div>
                </Field>
              </div>

              {addError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {addError}
                </div>
              )}

              <div className="flex gap-2 border-t border-[#e4eefb] pt-5 dark:border-[#1e3352]">
                <button type="button" onClick={closeAddModal} className={`${secondaryBtn} flex-1`}>
                  Cancel
                </button>

                <button type="submit" disabled={saving} className={`${primaryBtn} flex-1`}>
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="bx bx-loader-alt animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Create Subcontractor'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}