import { API_BASE, getToken } from '../../lib/auth'

export const ADMIN_API = `${API_BASE}/api/v1/admin`

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TicketUser = {
  id: number
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email?: string | null
  company?: string | null
  role?: string | null
}

export type TicketAttachment = {
  id: number
  file_name: string
  file_path: string
  file_url?: string | null
}

export type TicketMessage = {
  id: number
  message: string
  created_at: string
  sender?: TicketUser | null
  attachments?: TicketAttachment[]
}

export type Ticket = {
  id: number
  ticket_number: string
  subject: string
  description: string
  company: string
  priority: TicketPriority
  status: TicketStatus
  created_at: string
  updated_at: string
  has_unread_for_current?: boolean
  last_activity_at?: string | null
  submittedBy?: TicketUser | null
  assignedTo?: TicketUser | null
  messages?: TicketMessage[]
  attachments?: TicketAttachment[]
}

export type AssigneeOption = {
  id: number
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email?: string | null
}

export type TicketSession = {
  id: number
  status: 'active' | 'ended' | 'expired'
  room_url: string
  launch_url?: string | null
  started_at?: string | null
  ended_at?: string | null
}

export function authHeaders(contentType = true): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${getToken()}`,
  }
}

export function statusBadge(status: string) {
  switch (status) {
    case 'open':
      return 'bg-emerald-500 text-white border-none shadow-md'
    case 'in_progress':
      return 'bg-indigo-600 text-white border-none shadow-md'
    case 'resolved':
      return 'bg-amber-500 text-white border-none shadow-md'
    case 'closed':
    default:
      return 'bg-slate-500 text-white border-none shadow-md'
  }
}

export function statusDot(status: string) {
  switch (status) {
    case 'open': return 'bg-emerald-500'
    case 'in_progress': return 'bg-indigo-500'
    case 'resolved': return 'bg-amber-500'
    default: return 'bg-slate-400'
  }
}

export function statusGradient(status: string) {
  switch (status) {
    case 'open': return 'from-emerald-500 to-teal-600'
    case 'in_progress': return 'from-indigo-500 to-violet-600'
    case 'resolved': return 'from-amber-500 to-orange-600'
    case 'closed':
    default: return 'from-slate-500 to-slate-700'
  }
}

export function priorityText(priority: string) {
  switch (priority) {
    case 'urgent': return 'text-rose-600 dark:text-rose-400'
    case 'high': return 'text-orange-600 dark:text-orange-400'
    case 'medium': return 'text-violet-600 dark:text-violet-400'
    case 'low':
    default: return 'text-slate-600 dark:text-slate-300'
  }
}

export function priorityBadge(priority: string) {
  switch (priority) {
    case 'urgent':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/40'
    case 'high':
      return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:ring-orange-900/40'
    case 'medium':
      return 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900/40'
    case 'low':
    default:
      return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
  }
}

export function displayName(user?: TicketUser | null) {
  if (!user) return 'Unknown user'
  return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || `User #${user.id}`
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function getInitials(user?: TicketUser | null) {
  const name = displayName(user)
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'NA'
}

export function renderAttachments(items?: TicketAttachment[]) {
  if (!items?.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((file) => {
        const href = file.file_url || file.file_path
        return (
          <a
            key={file.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <span>Attachment</span>
            <span className="max-w-[160px] truncate">{file.file_name}</span>
          </a>
        )
      })}
    </div>
  )
}
