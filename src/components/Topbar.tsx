import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../assets/images/logo.png'
import { removeToken, getUser } from '../lib/auth'

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

const notifications = [
  { id: 1, name: 'James Lemire', text: 'It will seem like simplified English.', time: '1 hour ago', avatar: '/assets/images/avatar-3.jpg' },
  { id: 2, name: 'Your order is placed', text: 'If several languages coalesce the grammar', time: '3 min ago', icon: 'bx bx-cart', iconBg: 'bg-violet-500' },
  { id: 3, name: 'Your item is shipped', text: 'If several languages coalesce the grammar', time: '3 min ago', icon: 'bx bx-badge-check', iconBg: 'bg-green-500' },
  { id: 4, name: 'Salena Layfield', text: 'As a skeptical Cambridge friend of mine occidental.', time: '1 hour ago', avatar: '/assets/images/avatar-6.jpg' },
]

export default function Topbar() {
  const navigate = useNavigate()
  const notif = useDropdown()
  const profile = useDropdown()
  const grid = useDropdown()
  const { initials, label } = getDisplayName(getUser())

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
            <button type="button" className="light-dark-mode text-xl px-3 h-[70px] text-gray-600 dark:text-gray-100 hidden sm:block">
              <i data-feather="moon" className="block w-5 h-5 dark:hidden"></i>
              <i data-feather="sun" className="hidden w-5 h-5 dark:block"></i>
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
                <button onClick={() => notif.setOpen(o => !o)}
                  className="btn border-0 h-[70px] px-4 text-gray-600 dark:text-gray-100">
                  <i data-feather="bell" className="w-5 h-5"></i>
                </button>
                <span className="absolute text-xs px-1 bg-red-500 text-white font-medium rounded-full left-6 top-2.5">5</span>
              </div>
              {notif.open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded shadow w-80 dark:bg-zinc-800 border border-gray-50 dark:border-gray-700">
                  <div className="grid grid-cols-12 p-4">
                    <div className="col-span-6"><h6 className="m-0 text-gray-700 dark:text-gray-100">Notifications</h6></div>
                    <div className="col-span-6 justify-self-end"><a href="#!" className="text-xs underline dark:text-gray-400">Unread (3)</a></div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {notifications.map(n => (
                      <a key={n.id} href="#!" className="flex px-4 py-2 hover:bg-gray-50/50 dark:hover:bg-zinc-700/50">
                        <div className="ltr:mr-3 rtl:ml-3 shrink-0">
                          {n.avatar
                            ? <img src={n.avatar} className="w-8 h-8 rounded-full" alt="" />
                            : <div className={`w-8 h-8 text-center rounded-full ${n.iconBg}`}><i className={`text-xl leading-relaxed text-white ${n.icon}`}></i></div>
                          }
                        </div>
                        <div className="flex-grow">
                          <h6 className="mb-1 text-sm text-gray-700 dark:text-gray-100">{n.name}</h6>
                          <p className="mb-0 text-gray-600 text-xs dark:text-gray-400">{n.text}</p>
                          <p className="mb-0 text-xs text-gray-500 dark:text-gray-400"><i className="mdi mdi-clock-outline"></i> {n.time}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-50 dark:border-zinc-600 text-center">
                    <a href="#" className="text-violet-500 text-sm"><i className="mr-1 mdi mdi-arrow-right-circle"></i> View More..</a>
                  </div>
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
