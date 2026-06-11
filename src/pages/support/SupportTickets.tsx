import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ADMIN_API,
  authHeaders,
  displayName,
  getInitials,
  priorityBadge,
  priorityText,
  statusBadge,
  statusGradient,
  type Ticket,
  type TicketStatus,
} from './support-shared'

export default function SupportTickets() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all')

  async function loadTickets(silent = false) {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`${ADMIN_API}/support/tickets${params.toString() ? `?${params}` : ''}`, {
        headers: authHeaders(false),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load tickets')
      setTickets(Array.isArray(data?.data) ? data.data : [])
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load tickets')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
    // Live refresh — keep the inbox (unread, new tickets) current.
    const timer = setInterval(() => loadTickets(true), 8000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tickets
    return tickets.filter((ticket) =>
      [ticket.ticket_number, ticket.subject, ticket.company, displayName(ticket.submittedBy)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [tickets, search])

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800/80 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Support Tickets</h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">Tap a card to open the conversation.</p>
          </div>
          <span className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-300">
            {loading ? '…' : `${filtered.length} ticket${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-64 flex-1">
            <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, subject, ticket #"
              className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700/80 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-200/50 p-1 dark:bg-slate-800/50">
            {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((value) => {
              const active = statusFilter === value
              const names: Record<string, string> = { all: 'All', open: 'Open', in_progress: 'Active', resolved: 'Resolved', closed: 'Closed' }
              return (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {names[value]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* card grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-3xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-24 text-center dark:border-slate-800 dark:bg-slate-950/20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 20l1.4-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Tickets Found</h3>
          <p className="mt-1 max-w-sm text-sm font-medium text-slate-500 dark:text-slate-400">
            {search ? 'No support ticket matches the current search filter.' : 'There are no tickets in this queue state right now.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((ticket) => {
            const unread = !!ticket.has_unread_for_current
            return (
              <div
                key={ticket.id}
                onClick={() => navigate(`/support/tickets/${ticket.id}`)}
                className="group relative flex w-full cursor-pointer flex-col justify-between rounded-3xl border border-slate-100 bg-white p-2.5 pb-4 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800/80 dark:bg-slate-900"
              >
                {/* hero */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-50 dark:border-slate-800">
                  <div className={`flex h-28 items-center justify-center bg-gradient-to-br ${statusGradient(ticket.status)}`}>
                    <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-xl" />
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-xl font-black text-white ring-1 ring-white/30 backdrop-blur-sm">
                      {getInitials(ticket.submittedBy)}
                    </div>
                  </div>

                  <div className={`absolute right-2.5 top-2.5 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-md ${statusBadge(ticket.status)}`}>
                    {ticket.status.replace('_', ' ')}
                  </div>
                  {unread && (
                    <div className="absolute left-2.5 top-2.5 rounded-md bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600 shadow-md">
                      ● Unread
                    </div>
                  )}

                  <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/45 px-3 py-1.5 shadow-lg backdrop-blur-md">
                    <span className="truncate text-xs font-bold tracking-wide text-white">{ticket.ticket_number}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${priorityBadge(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </div>
                </div>

                {/* body */}
                <div className="flex flex-1 flex-col px-3.5 pt-4">
                  <h3 className="truncate text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400" title={ticket.subject}>
                    {ticket.subject}
                  </h3>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                    {displayName(ticket.submittedBy)} · {ticket.company}
                  </p>

                  <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {ticket.description}
                  </p>

                  {/* stat row */}
                  <div className="mt-4 grid grid-cols-3 rounded-2xl border border-slate-100/80 bg-slate-50/80 p-2.5 text-center dark:border-slate-800/60 dark:bg-slate-950/30">
                    <div className="border-r border-slate-200/60 last:border-none dark:border-slate-800/80">
                      <span className={`block text-sm font-black uppercase ${priorityText(ticket.priority)}`}>{ticket.priority}</span>
                      <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">PRIORITY</span>
                    </div>
                    <div className="border-r border-slate-200/60 last:border-none dark:border-slate-800/80">
                      <span className="block truncate px-1 text-sm font-black text-blue-600 dark:text-blue-400">{ticket.company}</span>
                      <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">COMPANY</span>
                    </div>
                    <div>
                      <span className="block text-sm font-black text-violet-600 dark:text-violet-400">
                        {new Date(ticket.last_activity_at ?? ticket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-slate-400">ACTIVITY</span>
                    </div>
                  </div>

                  {/* footer */}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800/80">
                    <span
                      className={`truncate rounded-md px-2 py-0.5 text-[9px] font-bold ${
                        ticket.assignedTo
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                      title={ticket.assignedTo ? `Assigned: ${displayName(ticket.assignedTo)}` : 'Unassigned'}
                    >
                      {ticket.assignedTo ? displayName(ticket.assignedTo) : 'Unassigned'}
                    </span>
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  )
}
