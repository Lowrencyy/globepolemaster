import { useState, useEffect, useRef } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { getUser, removeToken, isAdmin, isExecutive, isClient, isSubconSide, canAccessWarehouse, isTelcoVantage } from '../lib/auth'

const linkCls = "block py-2.5 px-6 text-sm font-medium text-gray-950 transition-all duration-150 ease-linear hover:text-violet-500 dark:text-gray-300 dark:hover:text-white"
const parentCls = `${linkCls} nav-menu`
const labelCls = "px-5 py-3 text-xs font-medium text-gray-500 cursor-default leading-[18px] group-data-[sidebar-size=sm]:hidden block"

const activeLinkCls  = "block py-2.5 px-6 text-sm font-medium transition-all duration-150 ease-linear text-violet-600 dark:text-violet-400 nav-menu"
const subCls         = "pl-[52.8px] pr-6 py-[6.4px] block text-[13.5px] font-medium text-gray-950 transition-all duration-150 ease-linear hover:text-violet-500 dark:text-gray-300 dark:hover:text-white"
const subActiveCls   = "pl-[52.8px] pr-6 py-[6.4px] block text-[13.5px] font-medium transition-all duration-150 ease-linear text-violet-600 dark:text-violet-400"


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
  const { pathname, search } = useLocation()

  // Role flags — computed once per render
  const admin     = isAdmin()
  const executive = isExecutive()
  const client    = isClient()
  const subcon    = isSubconSide()
  const internal  = isTelcoVantage()   // admin or executive
  const warehouse = canAccessWarehouse()

  const poleMaster   = useOpen(pathname, ['/poles/all', '/poles/map'])
  const napInventory = useOpen(pathname, ['/nap/boxes', '/nap/slot-status'])
  const auditRpts    = useOpen(pathname, ['/polereports/poleAudit', '/reports/teardown-logs', '/dailyreports', '/reports/daily', '/reports/rtd', '/reports/vicinity', '/reports/pole-reports'])
  const usersMgmt    = useOpen(pathname, ['/users'])

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

  // Client users have no sidebar — they get a standalone dashboard page
  if (client) return null

  return (
    <div className="fixed bottom-0 z-10 h-screen ltr:border-r rtl:border-l vertical-menu rtl:right-0 ltr:left-0 top-[70px] bg-slate-50 border-gray-50 print:hidden dark:bg-zinc-800 dark:border-neutral-700 flex flex-col">
      <div data-simplebar className="flex-1 overflow-y-auto">
        <div className="metismenu pb-4 pt-2.5" id="sidebar-menu">
          <ul id="side-menu">

            {/* ── MAIN — internal team only ── */}
            {internal && (
              <>
                <li className={labelCls}>Main</li>
                <li className={pathname === '/dashboard' ? 'mm-active' : ''}>
                  <Link to="/dashboard" className={pathname === '/dashboard' ? activeLinkCls : linkCls}>
                    <i data-feather="home" />
                    <span> Dashboard</span>
                  </Link>
                </li>
              </>
            )}

            {/* ── SUBCON HOME ── */}
            {subcon && (
              <li className={pathname === '/subcon-dashboard' ? 'mm-active' : ''}>
                <Link to="/subcon-dashboard" className={pathname === '/subcon-dashboard' ? activeLinkCls : linkCls}>
                  <i data-feather="home" />
                  <span> My Dashboard</span>
                </Link>
              </li>
            )}

            {/* ── OPERATIONS — all non-client roles ── */}
            <li className={labelCls}>Operations</li>

            {internal && (
              <li className={pathname === '/field/live' ? 'mm-active' : ''}>
                <Link to="/field/live" className={pathname === '/field/live' ? activeLinkCls : linkCls}>
                  <i data-feather="radio" />
                  <span>Live Onsite Map</span>
                </Link>
              </li>
            )}

            <li className={pathname === '/sites' ? 'mm-active' : ''}>
              <Link to="/sites" className={pathname === '/sites' ? activeLinkCls : linkCls}>
                <i data-feather="git-commit" />
                <span>Node List</span>
              </Link>
            </li>

            {internal && (
              <li className={pathname === '/spans' ? 'mm-active' : ''}>
                <Link to="/spans" className={pathname === '/spans' ? activeLinkCls : linkCls}>
                  <i data-feather="git-branch" />
                  <span>Span List</span>
                </Link>
              </li>
            )}

            {/* Pole Master — internal only */}
            {internal && (
              <li className={poleMaster.open ? 'mm-active' : ''}>
                <a href="javascript:void(0);" onClick={poleMaster.toggle} aria-expanded={poleMaster.open} className={poleMaster.childActive ? activeLinkCls : parentCls}>
                  <i data-feather="anchor" />
                  <span>Pole Master</span>
                </a>
                <ul style={{ display: poleMaster.open ? 'block' : 'none' }}>
                  {sub('/poles/all', 'All Poles')}
                  {sub('/poles/map', 'Pole Map View')}
                </ul>
              </li>
            )}

            {/* NAP Inventory — internal only */}
            {internal && (
              <li className={napInventory.open ? 'mm-active' : ''}>
                <a href="javascript:void(0);" onClick={napInventory.toggle} aria-expanded={napInventory.open} className={napInventory.childActive ? activeLinkCls : parentCls}>
                  <i data-feather="server" />
                  <span>NAP Inventory</span>
                </a>
                <ul style={{ display: napInventory.open ? 'block' : 'none' }}>
                  {sub('/nap/boxes', 'NAP Boxes')}
                  {sub('/nap/slot-status', 'Slot Status')}
                </ul>
              </li>
            )}

            {/* Warehouse — PM, admin, executive, warehouse incharge */}
            {warehouse && (
              <>
                <li className={labelCls}>Warehouse</li>
                <li className={pathname === '/warehouse/inventory' && !search.includes('tab=deliveries') ? 'mm-active' : ''}>
                  <Link to="/warehouse/inventory" className={pathname === '/warehouse/inventory' && !search.includes('tab=deliveries') ? activeLinkCls : linkCls}>
                    <i data-feather="package" />
                    <span>Material Inventory</span>
                  </Link>
                </li>
                <li className={pathname === '/warehouse/inventory' && search.includes('tab=deliveries') ? 'mm-active' : ''}>
                  <Link to="/warehouse/inventory?tab=deliveries" className={pathname === '/warehouse/inventory' && search.includes('tab=deliveries') ? activeLinkCls : linkCls}>
                    <i data-feather="truck" />
                    <span>Delivery Tracker</span>
                  </Link>
                </li>
              </>
            )}

            {/* ── REPORTS — internal + subcon (filtered) ── */}
            <li className={labelCls}>Reports</li>

            <li className={pathname.startsWith('/reports/teardown-logs') ? 'mm-active' : ''}>
              <Link to="/reports/teardown-logs" className={pathname.startsWith('/reports/teardown-logs') ? activeLinkCls : linkCls}>
                <i data-feather="clipboard" />
                <span>Teardown Logs</span>
              </Link>
            </li>

            {internal && (
              <li className={auditRpts.open ? 'mm-active' : ''}>
                <a href="javascript:void(0);" onClick={auditRpts.toggle} aria-expanded={auditRpts.open} className={auditRpts.childActive ? activeLinkCls : parentCls}>
                  <i data-feather="bar-chart-2" />
                  <span>Audit Reports</span>
                </a>
                <ul style={{ display: auditRpts.open ? 'block' : 'none' }}>
                  {sub('/polereports/poleAudit', 'Pole Audit Summary')}
                  {sub('/dailyreports', 'Daily Reports')}
                  {sub('/reports/rtd', 'RTD Reports')}
                  {sub('/reports/vicinity', 'Vicinity Maps')}
                  {sub('/reports/pole-reports', 'Pole Reports')}
                </ul>
              </li>
            )}

            {/* ── USERS & SUBCON — admin full, executive subcon only ── */}
            {(admin || executive) && (
              <>
                <li className={labelCls}>Teams</li>
                <li className={pathname.startsWith('/subcontractors') ? 'mm-active' : ''}>
                  <Link to="/subcontractors" className={pathname.startsWith('/subcontractors') ? activeLinkCls : linkCls}>
                    <i data-feather="briefcase" />
                    <span>Subcontractors</span>
                  </Link>
                </li>
              </>
            )}

            {/* System users — admin only */}
            {admin && (
              <>
                <li className={labelCls}>System</li>
                <li className={usersMgmt.open ? 'mm-active' : ''}>
                  <a href="javascript:void(0);" onClick={usersMgmt.toggle} aria-expanded={usersMgmt.open} className={usersMgmt.childActive ? activeLinkCls : parentCls}>
                    <i data-feather="users" />
                    <span>User Management</span>
                  </a>
                  <ul style={{ display: usersMgmt.open ? 'block' : 'none' }}>
                    {sub('/users', 'All Users')}
                  </ul>
                </li>
                <li>
                  <a href="#" className={linkCls}>
                    <i data-feather="settings" />
                    <span>System Settings</span>
                  </a>
                </li>
              </>
            )}

          </ul>
        </div>
      </div>
      <UserDropdown />
    </div>
  )
}
