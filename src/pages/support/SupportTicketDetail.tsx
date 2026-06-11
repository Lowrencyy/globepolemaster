import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ADMIN_API,
  authHeaders,
  displayName,
  formatDate,
  getInitials,
  priorityBadge,
  renderAttachments,
  statusBadge,
  type AssigneeOption,
  type Ticket,
  type TicketSession,
  type TicketStatus,
} from './support-shared'

export default function SupportTicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const id = ticketId ? Number(ticketId) : null

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [replying, setReplying] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [session, setSession] = useState<TicketSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionFrameUrl, setSessionFrameUrl] = useState<string | null>(null)
  const [assignees, setAssignees] = useState<AssigneeOption[]>([])
  const [selectedAssignee, setSelectedAssignee] = useState<string>('')
  const [assigning, setAssigning] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // `silent` skips the loading spinner + error toast so background polling
  // doesn't flash the UI or clobber an in-progress assignee selection.
  async function loadTicketDetail(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/tickets/${id}`, { headers: authHeaders(false) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load ticket details')
      setTicket({ ...data, messages: Array.isArray(data?.messages) ? data.messages : [] })
      if (!silent) setSelectedAssignee(data?.assignedTo?.id ? String(data.assignedTo.id) : '')
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load ticket details')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function loadSession() {
    if (!id) return
    setSessionLoading(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/tickets/${id}/session`, { headers: authHeaders(false) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load support session')
      setSession(data?.session ?? null)
      if ((data?.session?.status ?? '') !== 'active') setSessionFrameUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support session')
    } finally {
      setSessionLoading(false)
    }
  }

  async function loadAssignees() {
    try {
      const params = new URLSearchParams({ company: 'telcovantage', status: 'active', per_page: '100' })
      const res = await fetch(`${ADMIN_API}/users?${params.toString()}`, { headers: authHeaders(false) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load support assignees')
      setAssignees(Array.isArray(data?.data) ? data.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support assignees')
    }
  }

  useEffect(() => {
    loadTicketDetail()
    loadSession()
    loadAssignees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Live refresh — poll the conversation every 5s so replies coming from the
  // mobile app show up without a manual refresh.
  useEffect(() => {
    if (!id) return
    const timer = setInterval(() => loadTicketDetail(true), 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Keep the latest message in view when the thread grows.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket?.messages?.length])

  const ticketClosed = ticket ? ['closed', 'resolved'].includes(ticket.status) : false

  async function handleReply() {
    if (!ticket || !reply.trim() || replying || ticketClosed) return
    setReplying(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/tickets/${ticket.id}/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: reply.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to send reply')
      setReply('')
      await loadTicketDetail(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply')
    } finally {
      setReplying(false)
    }
  }

  async function handleStatusChange(nextStatus: TicketStatus) {
    if (!ticket || ticket.status === nextStatus || savingStatus) return
    setSavingStatus(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/tickets/${ticket.id}/status`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to update ticket status')
      setTicket((prev) => (prev ? { ...prev, status: data.status } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket status')
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleStartOrJoinSession() {
    if (!ticket || sessionBusy || ticketClosed) return
    setSessionBusy(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/tickets/${ticket.id}/session`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to start support session')
      setSession(data.session)
      setSessionFrameUrl(data?.session?.launch_url ?? null)
      await loadTicketDetail(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start support session')
    } finally {
      setSessionBusy(false)
    }
  }

  async function handleAssign() {
    if (!ticket || !selectedAssignee || assigning) return
    setAssigning(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/tickets/${ticket.id}/assign`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ assigned_to: Number(selectedAssignee) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to assign ticket')
      await loadTicketDetail(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign ticket')
    } finally {
      setAssigning(false)
    }
  }

  async function handleEndSession() {
    if (!session || sessionBusy) return
    setSessionBusy(true)
    try {
      const res = await fetch(`${ADMIN_API}/support/ticket-sessions/${session.id}/end`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to end support session')
      setSession(data.session)
      setSessionFrameUrl(null)
      await loadTicketDetail(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end support session')
    } finally {
      setSessionBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-50/60 shadow-sm dark:border-slate-800 dark:bg-slate-950/30">
      {!ticket || loading ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {error ? (
            <>
              <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
              <button onClick={() => navigate('/support/tickets')} className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700">
                Back to inbox
              </button>
            </>
          ) : (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-indigo-500 shadow-sm dark:bg-slate-900 dark:text-indigo-400">
                <svg className="h-8 w-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 20l1.4-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Opening conversation…</p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* header / toolbar */}
          <header className="border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/support/tickets')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Back to inbox"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">
                {getInitials(ticket.submittedBy)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-black tracking-tight text-slate-900 dark:text-white">{ticket.subject}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusBadge(ticket.status)}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                  <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase sm:inline ${priorityBadge(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </div>
                <p className="truncate text-xs font-medium text-slate-400">
                  {displayName(ticket.submittedBy)} · <span className="text-blue-500 dark:text-blue-400">{ticket.company}</span> · {ticket.ticket_number}
                </p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                {session?.status === 'active' ? (
                  <>
                    <button onClick={handleStartOrJoinSession} disabled={sessionBusy} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      {sessionBusy ? '…' : 'Join'}
                    </button>
                    <button onClick={handleEndSession} disabled={sessionBusy} className="rounded-full bg-rose-100 px-3.5 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-200 disabled:opacity-60 dark:bg-rose-950/40 dark:text-rose-300">
                      End
                    </button>
                  </>
                ) : (
                  <button onClick={handleStartOrJoinSession} disabled={sessionBusy || sessionLoading || ticketClosed} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    {sessionBusy ? '…' : sessionLoading ? 'Checking…' : 'Start call'}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                disabled={savingStatus}
                className="h-9 rounded-full border border-slate-200/80 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>

              <div className="flex items-center gap-1.5">
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="h-9 max-w-[180px] rounded-full border border-slate-200/80 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="">Assign to…</option>
                  {assignees.map((user) => (
                    <option key={user.id} value={user.id}>{displayName(user)}</option>
                  ))}
                </select>
                <button onClick={handleAssign} disabled={!selectedAssignee || assigning} className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {assigning ? '…' : 'Assign'}
                </button>
              </div>

              {ticket.assignedTo ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {displayName(ticket.assignedTo)}
                </span>
              ) : null}
            </div>
          </header>

          {/* live video room */}
          {sessionFrameUrl ? (
            <div className="border-b border-slate-100 bg-slate-950 dark:border-slate-800/80">
              <div className="flex items-center justify-between px-4 py-2 text-white">
                <p className="flex items-center gap-2 text-xs font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Live support room</p>
                <button onClick={() => window.open(sessionFrameUrl, '_blank', 'noopener,noreferrer')} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/20">
                  Open fullscreen
                </button>
              </div>
              <iframe
                src={sessionFrameUrl}
                title="Support Session"
                className="h-[360px] w-full border-0"
                allow="camera; microphone; display-capture; autoplay; fullscreen"
              />
            </div>
          ) : null}

          {/* messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="flex justify-start">
              <div className="max-w-[80%]">
                <div className="rounded-3xl rounded-tl-md border border-slate-200/80 bg-white px-4 py-3 text-slate-800 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100">
                  <p className="text-[11px] font-bold text-slate-400">{displayName(ticket.submittedBy)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{ticket.description}</p>
                  {renderAttachments(ticket.attachments)}
                </div>
                <p className="mt-1 px-2 text-[10px] font-semibold text-slate-400">{formatDate(ticket.created_at)}</p>
              </div>
            </div>

            {(ticket.messages ?? []).map((message) => {
              const fromInternal = String(message.sender?.company ?? '').toLowerCase() === 'telcovantage'
              return (
                <div key={message.id} className={`flex ${fromInternal ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    <div className={`px-4 py-3 text-sm font-medium shadow-sm ${
                      fromInternal
                        ? 'rounded-3xl rounded-tr-md bg-indigo-600 text-white'
                        : 'rounded-3xl rounded-tl-md border border-slate-200/80 bg-white text-slate-800 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100'
                    }`}>
                      <p className={`text-[11px] font-bold ${fromInternal ? 'text-indigo-200' : 'text-slate-400'}`}>{displayName(message.sender)}</p>
                      <p className="mt-1 whitespace-pre-wrap">{message.message}</p>
                      {renderAttachments(message.attachments)}
                    </div>
                    <p className={`mt-1 px-2 text-[10px] font-semibold text-slate-400 ${fromInternal ? 'text-right' : 'text-left'}`}>{formatDate(message.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* composer */}
          <div className="border-t border-slate-100 bg-white px-3 py-3 dark:border-slate-800/80 dark:bg-slate-900 sm:px-4">
            {ticketClosed ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                This thread is {ticket.status}. Reopen the ticket to continue the conversation.
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply() } }}
                  rows={1}
                  placeholder="Type a message…  (Enter to send, Shift+Enter for new line)"
                  className="max-h-40 min-h-[44px] flex-1 resize-none rounded-3xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700/80 dark:bg-slate-950 dark:text-white"
                />
                <button
                  onClick={handleReply}
                  disabled={!reply.trim() || replying}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Send"
                >
                  {replying ? (
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" /></svg>
                  )}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-lg dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}
