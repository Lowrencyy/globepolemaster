import { useEffect, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ChatWidget from './ChatWidget'

function syncDarkClass() {
  if (document.body.getAttribute('data-mode') === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  useEffect(() => {
    syncDarkClass()
    const observer = new MutationObserver(syncDarkClass)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const w = window as any

    const initAll = () => {
      if (w.feather) w.feather.replace()

      const sideMenu = document.getElementById('side-menu')
      if (sideMenu && w.MetisMenu) {
        // destroy previous instance to avoid duplicate handlers on StrictMode double-mount
        try { (sideMenu as any)._metisMenu?.dispose() } catch (_) {}
        const mm = new w.MetisMenu('#side-menu')
        ;(sideMenu as any)._metisMenu = mm
      }

      // re-run app.js sidebar collapse init
      const verticalBtn = document.getElementById('vertical-menu-btn')
      if (verticalBtn && !(verticalBtn as any)._initialized) {
        verticalBtn.addEventListener('click', () => {
          const size = document.body.getAttribute('data-sidebar-size')
          document.body.setAttribute('data-sidebar-size', size === 'sm' ? 'lg' : 'sm')
        })
        ;(verticalBtn as any)._initialized = true
      }
    }

    // defer so browser has fully painted the React DOM
    const timer = setTimeout(initAll, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <Sidebar />
      <Topbar />
      <div className="main-content group-data-[sidebar-size=sm]:ml-[70px] min-h-screen flex flex-col">
        <div className="page-content dark:bg-zinc-700 flex-1 pb-16">
          <div className="container-fluid px-[0.625rem]">
            {children}
          </div>
        </div>
        <footer className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white border-t footer border-gray-50 dark:bg-zinc-700 dark:border-zinc-600 dark:text-gray-200 z-10">
          <div className="grid grid-cols-2 text-gray-500 dark:text-zinc-100">
            <div className="grow">&copy; {new Date().getFullYear()} Telcovantage Philippines</div>
            <div className="hidden md:inline-block text-end">Design & Develop by <a href="#" className="underline text-violet-500">Telcovantage Developers</a></div>
          </div>
        </footer>
      </div>
      <ChatWidget />
    </>
  )
}
