import { useState, useEffect, useRef } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { getUser, removeToken } from '../lib/auth'

const linkCls = "block py-2.5 px-6 text-sm font-medium text-gray-950 transition-all duration-150 ease-linear hover:text-violet-500 dark:text-gray-300 dark:hover:text-white"
const parentCls = `${linkCls} nav-menu`
const labelCls = "px-5 py-3 text-xs font-medium text-gray-500 cursor-default leading-[18px] group-data-[sidebar-size=sm]:hidden block"

const activeLinkCls  = "block py-2.5 px-6 text-sm font-medium transition-all duration-150 ease-linear text-violet-600 dark:text-violet-400 nav-menu"
const subCls         = "pl-[52.8px] pr-6 py-[6.4px] block text-[13.5px] font-medium text-gray-950 transition-all duration-150 ease-linear hover:text-violet-500 dark:text-gray-300 dark:hover:text-white"
const subActiveCls   = "pl-[52.8px] pr-6 py-[6.4px] block text-[13.5px] font-medium transition-all duration-150 ease-linear text-violet-600 dark:text-violet-400"

// ── Hardcoded demo data ────────────────────────────────────────────────────
const DEMO_TEAMS = [
  { id: 1, name: 'Alpha Team', lead: 'Juan dela Cruz', members: 4 },
  { id: 2, name: 'Bravo Team', lead: 'Maria Santos',  members: 3 },
  { id: 3, name: 'Charlie Team', lead: 'Ramon Reyes', members: 5 },
]

const DEMO_SUBCON_USERS = [
  { id: 1, name: 'Carlos Bautista', team: 'Alpha Team',   role: 'Technician' },
  { id: 2, name: 'Liza Fernandez',  team: 'Bravo Team',   role: 'Team Lead'  },
  { id: 3, name: 'Mark Villanueva', team: 'Charlie Team', role: 'Technician' },
]

// ── Reusable Modal shell ───────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-50/60 to-white dark:from-zinc-900 dark:to-zinc-900 px-6 py-5">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs font-medium text-zinc-400 dark:text-zinc-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-bold text-base">×</button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Shared field component ─────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition"

// ── Teams Modal ────────────────────────────────────────────────────────────
function TeamsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'list' | 'add'>('list')
  const [form, setForm] = useState({ name: '', lead: '', description: '' })

  const avatarColors = ['from-violet-500 to-blue-500', 'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500']

  return (
    <Modal title="Subcontractor Teams" subtitle="Manage field teams and their assignments" onClose={onClose}>
      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-1">
        {(['list', 'add'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-xs font-black tracking-wide transition ${
              tab === t
                ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}>
            {t === 'list' ? '▤  View Teams' : '＋  Add Team'}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="flex flex-col gap-3">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 mb-1">
            {[
              { label: 'Total Teams', value: DEMO_TEAMS.length, color: 'text-violet-600 dark:text-violet-400' },
              { label: 'Total Members', value: DEMO_TEAMS.reduce((s, t) => s + t.members, 0), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Active', value: DEMO_TEAMS.length, color: 'text-blue-600 dark:text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-3 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {DEMO_TEAMS.map((t, i) => (
            <div key={t.id} className="group flex items-center gap-4 rounded-2xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 px-4 py-4 shadow-sm hover:shadow-md hover:-translate-y-px transition">
              {/* Team avatar */}
              <div className={`h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-sm font-black shadow-sm`}>
                {t.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-zinc-800 dark:text-zinc-100">{t.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  <span className="font-semibold text-zinc-500 dark:text-zinc-400">Lead:</span> {t.lead}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-violet-600 dark:text-violet-400">{t.members}</p>
                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">members</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'add' && (
        <form className="flex flex-col gap-4" onSubmit={e => e.preventDefault()}>
          <Field label="Team Name">
            <input className={inputCls} placeholder="e.g. Delta Team"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Team Lead">
            <input className={inputCls} placeholder="Full name of the team lead"
              value={form.lead} onChange={e => setForm(f => ({ ...f, lead: e.target.value }))} />
          </Field>
          <Field label="Description (optional)">
            <textarea className={inputCls + ' resize-none'} rows={3} placeholder="What does this team handle?"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Field>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => setTab('list')} className="flex-1 rounded-2xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
              Cancel
            </button>
            <button type="submit" className="flex-1 rounded-2xl bg-violet-600 py-2.5 text-sm font-black text-white hover:bg-violet-700 active:scale-95 transition">
              Save Team
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Subcon Users Modal ─────────────────────────────────────────────────────
function SubconUsersModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'list' | 'add'>('list')
  const [form, setForm] = useState({ name: '', email: '', team: '', role: '' })

  const roleColor: Record<string, string> = {
    'Technician': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'Team Lead':  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  }
  const avatarColors = ['from-violet-500 to-blue-500', 'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500']

  return (
    <Modal title="Subcontractor Users" subtitle="Field staff registered under subcontractors" onClose={onClose}>
      <div className="flex gap-1 mb-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-1">
        {(['list', 'add'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-xs font-black tracking-wide transition ${
              tab === t
                ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}>
            {t === 'list' ? '▤  View Users' : '＋  Add User'}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="flex flex-col gap-3">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-1">
            {[
              { label: 'Total Users', value: DEMO_SUBCON_USERS.length, color: 'text-violet-600 dark:text-violet-400' },
              { label: 'Teams Covered', value: new Set(DEMO_SUBCON_USERS.map(u => u.team)).size, color: 'text-emerald-600 dark:text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl border border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-3 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {DEMO_SUBCON_USERS.map((u, i) => (
            <div key={u.id} className="flex items-center gap-4 rounded-2xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 px-4 py-4 shadow-sm hover:shadow-md hover:-translate-y-px transition">
              <div className={`h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-xs font-black shadow-sm`}>
                {u.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-zinc-800 dark:text-zinc-100 truncate">{u.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{u.team}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${roleColor[u.role] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                {u.role}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'add' && (
        <form className="flex flex-col gap-4" onSubmit={e => e.preventDefault()}>
          <Field label="Full Name">
            <input className={inputCls} placeholder="e.g. Jose Rizal"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email Address">
            <input className={inputCls} type="email" placeholder="user@email.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Team">
              <select className={inputCls}
                value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))}>
                <option value="">Select team</option>
                {DEMO_TEAMS.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Role">
              <select className={inputCls}
                value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="">Select role</option>
                <option>Team Lead</option>
                <option>Technician</option>
                <option>Helper</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => setTab('list')} className="flex-1 rounded-2xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
              Cancel
            </button>
            <button type="submit" className="flex-1 rounded-2xl bg-violet-600 py-2.5 text-sm font-black text-white hover:bg-violet-700 active:scale-95 transition">
              Save User
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Sidebar helpers ────────────────────────────────────────────────────────
function useOpen(path: string, childPaths: string[]) {
  const childActive = childPaths.some(p => p !== '#' && path.startsWith(p))
  const [open, setOpen] = useState(childActive)
  useEffect(() => { if (childActive) setOpen(true) }, [childActive])
  const toggle = (e: React.MouseEvent) => { e.preventDefault(); setOpen(o => !o) }
  return { open, toggle, childActive }
}

function UserDropdown() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const user = getUser()

  const name  = String(user?.name  ?? user?.username ?? user?.email ?? 'User')
  const email = String(user?.email ?? '')
  const role  = String(user?.role  ?? user?.role_name ?? user?.user_role ?? 'Field Staff')
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function logout() {
    removeToken()
    navigate('/login')
  }

  return (
    <div ref={ref} className="relative border-t border-gray-100 dark:border-zinc-700 p-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-violet-50 dark:hover:bg-zinc-700/60 group"
      >
        {/* Avatar */}
        <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white text-xs font-black shadow-sm">
          {initials}
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0 text-left group-data-[sidebar-size=sm]:hidden">
          <p className="text-[13px] font-bold text-gray-800 dark:text-zinc-100 truncate leading-tight">{name}</p>
          <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 truncate capitalize">{role}</p>
        </div>

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-zinc-500 transition-transform group-data-[sidebar-size=sm]:hidden ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl overflow-hidden z-50">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-700 bg-gradient-to-r from-violet-50/60 to-white dark:from-zinc-800 dark:to-zinc-800">
            <p className="text-[13px] font-black text-gray-800 dark:text-zinc-100 truncate">{name}</p>
            {email && <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate mt-0.5">{email}</p>}
            <span className="mt-1.5 inline-block rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400 capitalize">{role}</span>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              My Profile
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-zinc-700 py-1">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { pathname } = useLocation()

  const poleMaster   = useOpen(pathname, ['/poles/all', '/poles/map'])
  const napInventory = useOpen(pathname, ['/nap/boxes', '/nap/slot-status'])
  const auditRpts    = useOpen(pathname, ['/polereports/poleAudit', '/reports/teardown-logs'])
  const usersMgmt    = useOpen(pathname, ['/users'])
  const subcon       = useOpen(pathname, ['/subcontractors/teams', '/subcontractors/users'])
  const sub = (href: string, label: string) => {
    const isActive = href !== '#' && pathname.startsWith(href)
    const cls = isActive ? subActiveCls : subCls
    return (
      <li key={label} className={isActive ? 'mm-active' : ''}>
        {href === '#'
          ? <a href="#" className={cls}>{label}</a>
          : <Link to={href} className={cls}>
              {isActive && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 align-middle" />}
              {label}
            </Link>
        }
      </li>
    )
  }

  return (
    <div className="fixed bottom-0 z-10 h-screen ltr:border-r rtl:border-l vertical-menu rtl:right-0 ltr:left-0 top-[70px] bg-slate-50 border-gray-50 print:hidden dark:bg-zinc-800 dark:border-neutral-700 flex flex-col">
      <div data-simplebar className="flex-1 overflow-y-auto">
        <div className="metismenu pb-4 pt-2.5" id="sidebar-menu">
          <ul id="side-menu">

            {/* ── MAIN ── */}
            <li className={labelCls}>Main</li>
            <li className={pathname === '/dashboard' ? 'mm-active' : ''}>
              <Link to="/dashboard" className={pathname === '/dashboard' ? activeLinkCls : linkCls}>
                <i data-feather="home"></i>
                <span> Dashboard</span>
              </Link>
            </li>

            {/* ── GLOBE ── */}
            <li className={labelCls}>Globe</li>

            {/* Live Onsite Map */}
            <li className={pathname === '/field/live' ? 'mm-active' : ''}>
              <Link to="/field/live" className={pathname === '/field/live' ? activeLinkCls : linkCls}>
                <i data-feather="radio"></i>
                <span>Live Onsite Map</span>
              </Link>
            </li>

            {/* Live Teardown Logs */}
            <li className={pathname.startsWith('/reports/teardown-logs') ? 'mm-active' : ''}>
              <Link to="/reports/teardown-logs" className={pathname.startsWith('/reports/teardown-logs') ? activeLinkCls : linkCls}>
                <i data-feather="clipboard"></i>
                <span>Live Teardown Logs</span>
              </Link>
            </li>

            {/* Area Management */}
            <li>
              <a href="#" className={linkCls}>
                <i data-feather="map-pin"></i>
                <span>Area Management</span>
              </a>
            </li>

            {/* Node Management */}
            <li className={pathname === '/sites' ? 'mm-active' : ''}>
              <Link to="/sites" className={pathname === '/sites' ? activeLinkCls : linkCls}>
                <i data-feather="git-commit"></i>
                <span>Node List</span>
              </Link>
            </li>

            {/* Span List */}
            <li className={pathname === '/spans' ? 'mm-active' : ''}>
              <Link to="/spans" className={pathname === '/spans' ? activeLinkCls : linkCls}>
                <i data-feather="git-branch"></i>
                <span>Span List</span>
              </Link>
            </li>

            {/* Pole Master */}
            <li className={poleMaster.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={poleMaster.toggle} aria-expanded={poleMaster.open} className={poleMaster.childActive ? activeLinkCls : parentCls}>
                <i data-feather="anchor"></i>
                <span>Pole Master</span>
              </a>
              <ul style={{ display: poleMaster.open ? 'block' : 'none' }}>
                {sub('/poles/all', 'All Poles')}
               
                {sub('/poles/map', 'Pole Map View')}
              </ul>
            </li>

            {/* NAP Inventory */}
            <li className={napInventory.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={napInventory.toggle} aria-expanded={napInventory.open} className={napInventory.childActive ? activeLinkCls : parentCls}>
                <i data-feather="server"></i>
                <span>NAP Inventory</span>
              </a>
              <ul style={{ display: napInventory.open ? 'block' : 'none' }}>
                {sub('/nap/boxes',       'NAP Boxes')}
                {sub('/nap/slot-status', 'Slot Status')}
              </ul>
            </li>


            {/* Teardown Management */}
            <li>
              <a href="#" className={linkCls}>
                <i data-feather="git-commit"></i>
                <span>Teardown Management</span>
              </a>
            </li>

            {/* Subscriber Lookup */}
            <li>
              <a href="#" className={linkCls}>
                <i data-feather="users"></i>
                <span>Subscriber Lookup</span>
              </a>
            </li>

            {/* Cable Teardown */}
            <li>
              <a href="#" className={linkCls}>
                <i data-feather="scissors"></i>
                <span>Cable Teardown</span>
              </a>
            </li>

            {/* Validation Queue */}
            <li>
              <a href="#" className={linkCls}>
                <i data-feather="check-square"></i>
                <span>Validation Queue</span>
              </a>
            </li>

            {/* ── REPORTS ── */}
            <li className={labelCls}>Reports</li>

            <li className={auditRpts.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={auditRpts.toggle} aria-expanded={auditRpts.open} className={auditRpts.childActive ? activeLinkCls : parentCls}>
                <i data-feather="bar-chart-2"></i>
                <span>Audit Reports</span>
              </a>
              <ul style={{ display: auditRpts.open ? 'block' : 'none' }}>
                {sub('/polereports/poleAudit', 'Pole Audit Summary')}
                {sub('/reports/teardown-logs', 'Teardown Logs')}
                {sub('#', 'NAP Utilization')}
                {sub('#', 'Span Teardown Report')}
                {sub('#', 'Validation Summary')}
              </ul>
            </li>

            {/* ── USERS ── */}
            <li className={labelCls}>Users Management</li>

            <li className={usersMgmt.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={usersMgmt.toggle} aria-expanded={usersMgmt.open} className={usersMgmt.childActive ? activeLinkCls : parentCls}>
                <i data-feather="users"></i>
                <span>Users</span>
              </a>
              <ul style={{ display: usersMgmt.open ? 'block' : 'none' }}>
                {sub('/users', 'All Users')}
                {sub('#', 'Roles & Permissions')}
              </ul>
            </li>

            {/* Subcontractors */}
            <li className={subcon.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={subcon.toggle} aria-expanded={subcon.open} className={subcon.childActive ? activeLinkCls : parentCls}>
                <i data-feather="briefcase"></i>
                <span>Subcontractors</span>
              </a>
              <ul style={{ display: subcon.open ? 'block' : 'none' }}>
                {sub('/subcontractors/teams', 'Teams')}
                {sub('/subcontractors/users', 'Subcon Users')}
              </ul>
            </li>

            <li>
              <a href="#" className={linkCls}>
                <i data-feather="eye"></i>
                <span>Pole Owner Preview</span>
              </a>
            </li>

            {/* ── SETTINGS ── */}
            <li className={labelCls}>Settings</li>

            <li>
              <a href="#" className={linkCls}>
                <i data-feather="settings"></i>
                <span>System Settings</span>
              </a>
            </li>

            <li>
              <a href="#" className={linkCls}>
                <i data-feather="shield"></i>
                <span>User Management</span>
              </a>
            </li>

          </ul>
        </div>
      </div>
      <UserDropdown />

    </div>
  )
}
