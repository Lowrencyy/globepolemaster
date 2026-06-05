import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../assets/images/telcovantage-logo.png'
import { removeToken, getUser } from '../lib/auth'
import { useNotifications } from '../hooks/useNotifications'

function getDisplayName(user: Record<string, unknown> | null): { initials: string; label: string } {
  if (!user) return { initials: 'U', label: 'User' }
  const first = (user.first_name ?? user.firstname ?? user.name ?? '') as string
  const last  = (user.last_name  ?? user.lastname  ?? '') as string
  const full  = (user.name ?? '') as string

  if (first) {
    const lastInitial = last ? ` ${last.charAt(0).toUpperCase()}.` : ''
    const initials = (first.charAt(0) + (last ? last.charAt(0) : '')).toUpperCase()
    return { initials, label: `${first}${lastInitial}` }
  }
  if (full) {
    const parts = full.trim().split(/\s+/)
    const initials = parts.length > 1
      ? (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
      : parts[0].charAt(0).toUpperCase()
    const label = parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
      : parts[0]
    return { initials, label }
  }
  const email = (user.email ?? '') as string
  if (email) {
    const local = email.split('@')[0]
    return { initials: local.charAt(0).toUpperCase(), label: local }
  }
  return { initials: 'U', label: 'User' }
}

function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return { open, setOpen, ref }
}

const TYPE_META: Record<string, { icon: string; bg: string }> = {
  pull_out_new:       { icon: 'bx bx-package',       bg: 'bg-amber-500'  },
  pull_out_approved:  { icon: 'bx bx-check-circle',  bg: 'bg-green-500'  },
  pull_out_rejected:  { icon: 'bx bx-x-circle',      bg: 'bg-red-500'    },
  driver_arrived:     { icon: 'bx bx-truck',          bg: 'bg-blue-500'   },
  delivery_accepted:  { icon: 'bx bx-badge-check',   bg: 'bg-green-600'  },
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Topbar() {
  const navigate = useNavigate()
  const notif = useDropdown()
  const profile = useDropdown()
  const grid = useDropdown()
  const { initials, label } = getDisplayName(getUser())
  const { notifications, unreadCount, loading, listLoaded, markRead, markAllRead, loadList } = useNotifications()

  const [themeMode, setThemeMode] = useState(() => {
    return sessionStorage.getItem("data-layout-mode") || document.body.getAttribute('data-mode') || 'light'
  })

  useEffect(() => {
    document.body.setAttribute('data-mode', themeMode)
    sessionStorage.setItem('data-layout-mode', themeMode)
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [themeMode])

  const toggleTheme = () => {
    setThemeMode(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-10 flex items-center bg-white dark:bg-zinc-800 print:hidden dark:border-zinc-700 ltr:pr-6 rtl:pl-6">
      <div className="flex justify-between w-full">

        {/* Brand + hamburger */}
        <div className="flex items-center topbar-brand">
          <div className="hidden lg:flex navbar-brand items-center justify-center shrink px-6 h-[70px] ltr:border-r rtl:border-l bg-[#fbfaff] border-gray-50 dark:border-zinc-700 dark:bg-zinc-800 shadow-none">
            <a href="#" className="flex items-center">
              <img src={logoImg} alt="Logo" className="h-20 w-auto object-contain mx-auto" />
            </a>
          </div>
          <button type="button" id="vertical-menu-btn"
            className="border-b border-[#e9e9ef] dark:border-zinc-600 dark:lg:border-transparent lg:border-transparent text-gray-800 dark:text-white h-[70px] px-4 ltr:-ml-[52px] rtl:-mr-14 py-1 vertical-menu-btn">
            <i className="fa fa-fw fa-bars"></i>
          </button>
        </div>

        {/* Right side */}
        <div className="flex justify-between w-full items-center border-b border-[#e9e9ef] dark:border-zinc-600 ltr:pl-6 rtl:pr-6">

          {/* Search */}
          <form className="hidden app-search xl:block">
            <div className="relative inline-block">
              <input type="text" className="pl-4 pr-[40px] border-0 rounded bg-[#f8f9fa] dark:bg-[#363a38] focus:ring-0 text-13 dark:text-gray-100 max-w-[223px]" placeholder="Search..." />
              <button className="py-1.5 px-2.5 w-9 h-[34px] text-white bg-violet-500 inline-block absolute ltr:right-1 top-1 rounded" type="button">
                <i className="align-middle bx bx-search-alt"></i>
              </button>
            </div>
          </form>

          <div className="flex items-center gap-1">

            {/* Dark mode */}
            <button type="button" onClick={toggleTheme} className="light-dark-mode text-xl px-3 h-[70px] text-gray-600 dark:text-gray-100 hidden sm:block">
              <i className={`bx ${themeMode === 'light' ? 'bx-moon' : 'bx-sun'} text-[22px]`}></i>
            </button>

            {/* Grid / Apps dropdown */}
            <div className="relative hidden sm:block" ref={grid.ref}>
              <button onClick={() => grid.setOpen(o => !o)}
                className="btn border-0 h-[70px] text-xl px-3 text-gray-600 dark:text-gray-100">
                <i data-feather="grid" className="w-5 h-5"></i>
              </button>
              {grid.open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-50 rounded shadow w-72 dark:bg-zinc-700 dark:border-zinc-600 dark:text-gray-300">
                  <div className="p-2 grid grid-cols-3">
                    {[
                      { label: 'GitHub', icon: 'bxl-github' },
                      { label: 'Bitbucket', icon: 'bxl-bitbucket' },
                      { label: 'Dribbble', icon: 'bxl-dribbble' },
                      { label: 'Dropbox', icon: 'bxl-dropbox' },
                      { label: 'Slack', icon: 'bxl-slack' },
                      { label: 'Mail', icon: 'bx-envelope' },
                    ].map(app => (
                      <a key={app.label} href="#" className="py-4 text-center hover:bg-gray-50/50 dark:hover:bg-zinc-600/50 dark:hover:text-gray-50 rounded">
                        <i className={`bx ${app.icon} text-2xl block mb-1`}></i>
                        <span className="text-xs">{app.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative" ref={notif.ref}>
              <div className="relative">
                <button onClick={() => { notif.setOpen(o => !o); if (!notif.open) loadList() }}
                  className="btn border-0 h-[70px] px-4 text-gray-600 dark:text-gray-100">
                  <i data-feather="bell" className="w-5 h-5"></i>
                </button>
                {unreadCount > 0 && (
                  <span className="absolute text-xs px-1 min-w-[18px] text-center bg-red-500 text-white font-medium rounded-full left-6 top-2.5">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              {notif.open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded shadow w-80 dark:bg-zinc-800 border border-gray-50 dark:border-gray-700">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-zinc-700">
                    <h6 className="m-0 text-sm font-semibold text-gray-700 dark:text-gray-100">
                      Notifications {unreadCount > 0 && <span className="ml-1 text-xs font-bold text-red-500">({unreadCount} new)</span>}
                    </h6>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-violet-500 hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {loading && !listLoaded ? (
                      <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
                        <i className="bx bx-loader-alt animate-spin text-2xl block mb-1"></i>
                        Loading…
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
                        <i className="bx bx-bell-off text-2xl block mb-1"></i>
                        No notifications yet
                      </div>
                    ) : notifications.map(n => {
                      const meta = TYPE_META[n.type] ?? { icon: 'bx bx-bell', bg: 'bg-gray-400' }
                      const isUnread = !n.read_at
                      return (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`w-full flex text-left px-4 py-3 hover:bg-gray-50/80 dark:hover:bg-zinc-700/50 transition-colors ${isUnread ? 'bg-violet-50/60 dark:bg-violet-900/10' : ''}`}
                        >
                          <div className="ltr:mr-3 rtl:ml-3 shrink-0">
                            <div className={`w-8 h-8 flex items-center justify-center rounded-full ${meta.bg}`}>
                              <i className={`text-base text-white ${meta.icon}`}></i>
                            </div>
                          </div>
                          <div className="flex-grow min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-xs font-semibold truncate ${isUnread ? 'text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                                {n.title}
                              </p>
                              {isUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-violet-500 mt-1"></span>}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              <i className="mdi mdi-clock-outline mr-0.5"></i>{timeAgo(n.created_at)}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {notifications.length > 0 && (
                    <div className="p-2 border-t border-gray-50 dark:border-zinc-700 text-center">
                      <span className="text-gray-400 text-xs">Showing last {notifications.length} notifications</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="relative" ref={profile.ref}>
              <button onClick={() => profile.setOpen(o => !o)}
                className="flex items-center px-3 py-2 h-[70px] border-x border-gray-50 bg-gray-50/30 dark:bg-zinc-700 dark:border-zinc-600 dark:text-gray-100">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-600 text-white text-sm font-semibold ltr:xl:mr-2 rtl:xl:ml-2 shrink-0">
                  {initials}
                </div>
                <span className="hidden font-medium xl:block">{label}</span>
                <i className="hidden align-bottom mdi mdi-chevron-down xl:block ml-1"></i>
              </button>
              {profile.open && (
                <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white rounded shadow border border-gray-50 dark:bg-zinc-800 dark:border-zinc-600">
                  <a href="#" className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-zinc-700">
                    <i className="mr-2 mdi mdi-face-man text-base"></i> Profile
                  </a>
                  <a href="#" className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-zinc-700">
                    <i className="mr-2 mdi mdi-lock text-base"></i> Lock Screen
                  </a>
                  <hr className="border-gray-100 dark:border-zinc-600" />
                  <button onClick={() => { removeToken(); navigate('/login') }}
                    className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-zinc-700">
                    <i className="mr-2 mdi mdi-logout text-base"></i> Logout
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </nav>
  )
}
