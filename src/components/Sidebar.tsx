import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const linkCls = "block py-2.5 px-6 text-sm font-medium text-gray-950 transition-all duration-150 ease-linear hover:text-violet-500 dark:text-gray-300 dark:hover:text-white"
const parentCls = `${linkCls} nav-menu`
const labelCls = "px-5 py-3 text-xs font-medium text-gray-500 cursor-default leading-[18px] group-data-[sidebar-size=sm]:hidden block"

const activeLinkCls  = "block py-2.5 px-6 text-sm font-medium transition-all duration-150 ease-linear text-violet-600 dark:text-violet-400 nav-menu"
const subCls         = "pl-[52.8px] pr-6 py-[6.4px] block text-[13.5px] font-medium text-gray-950 transition-all duration-150 ease-linear hover:text-violet-500 dark:text-gray-300 dark:hover:text-white"
const subActiveCls   = "pl-[52.8px] pr-6 py-[6.4px] block text-[13.5px] font-medium transition-all duration-150 ease-linear text-violet-600 dark:text-violet-400"

function useOpen(path: string, childPaths: string[]) {
  const childActive = childPaths.some(p => p !== '#' && path.startsWith(p))
  const [open, setOpen] = useState(childActive)
  useEffect(() => { if (childActive) setOpen(true) }, [childActive])
  const toggle = (e: React.MouseEvent) => { e.preventDefault(); setOpen(o => !o) }
  return { open, toggle, childActive }
}

export default function Sidebar() {
  const { pathname } = useLocation()

  const poleMaster   = useOpen(pathname, ['/poles/all', '/poles/map'])
  const napInventory = useOpen(pathname, ['/nap/boxes', '/nap/report', '/nap/slot-status'])
  const spanMgmt     = useOpen(pathname, [])
  const subscriber   = useOpen(pathname, [])
  const teardown     = useOpen(pathname, [])
  const validation   = useOpen(pathname, [])
  const auditRpts    = useOpen(pathname, ['/polereports/poleAudit'])
  const ownerPrev    = useOpen(pathname, [])
  const areaMgmt     = useOpen(pathname, [])

  const sub = (href: string, label: string) => {
    const isActive = href !== '#' && pathname.startsWith(href)
    return (
      <li key={label} className={isActive ? 'mm-active' : ''}>
        <a href={href} className={isActive ? subActiveCls : subCls}>
          {isActive && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 align-middle" />}
          {label}
        </a>
      </li>
    )
  }

  return (
    <div className="fixed bottom-0 z-10 h-screen ltr:border-r rtl:border-l vertical-menu rtl:right-0 ltr:left-0 top-[70px] bg-slate-50 border-gray-50 print:hidden dark:bg-zinc-800 dark:border-neutral-700">
      <div data-simplebar className="h-full">
        <div className="metismenu pb-10 pt-2.5" id="sidebar-menu">
          <ul id="side-menu">

            {/* ── MAIN ── */}
            <li className={labelCls}>Main</li>
            <li className={pathname === '/dashboard' ? 'mm-active' : ''}>
              <a href="/dashboard" className={pathname === '/dashboard' ? activeLinkCls : linkCls}>
                <i data-feather="home"></i>
                <span> Dashboard</span>
              </a>
            </li>

            {/* ── GLOBE ── */}
            <li className={labelCls}>Globe</li>

            {/* Live Teardown Map */}
            <li className={pathname === '/field/live' ? 'mm-active' : ''}>
              <a href="/field/live" className={pathname === '/field/live' ? activeLinkCls : linkCls}>
                <i data-feather="activity"></i>
                <span>Live Teardown Map</span>
              </a>
            </li>

            {/* Area Management */}
            <li className={areaMgmt.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={areaMgmt.toggle} aria-expanded={areaMgmt.open} className={parentCls}>
                <i data-feather="map-pin"></i>
                <span>Area Management</span>
              </a>
              <ul style={{ display: areaMgmt.open ? 'block' : 'none' }}>
                {sub('#', 'Regions')}
                {sub('#', 'Provinces')}
                {sub('#', 'Cities / Municipalities')}
                {sub('#', 'Barangays')}
              </ul>
            </li>

            {/* Pole Master */}
            <li className={poleMaster.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={poleMaster.toggle} aria-expanded={poleMaster.open} className={poleMaster.childActive ? activeLinkCls : parentCls}>
                <i data-feather="anchor"></i>
                <span>Pole Master</span>
              </a>
              <ul style={{ display: poleMaster.open ? 'block' : 'none' }}>
                {sub('/poles/all', 'All Poles')}
                {sub('#', 'Pole Search')}
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
                {sub('/nap/boxes',  'NAP Boxes')}
                {sub('/nap/report', 'NAP Box Report')}
                {sub('/nap/slot-status', 'Slot Status')}
              </ul>
            </li>

            {/* Span Management */}
            <li className={spanMgmt.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={spanMgmt.toggle} aria-expanded={spanMgmt.open} className={parentCls}>
                <i data-feather="git-commit"></i>
                <span>Span Management</span>
              </a>
              <ul style={{ display: spanMgmt.open ? 'block' : 'none' }}>
                {sub('#', 'All Spans')}
                {sub('#', 'Span per Pole')}
              </ul>
            </li>

            {/* Subscriber Lookup */}
            <li className={subscriber.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={subscriber.toggle} aria-expanded={subscriber.open} className={parentCls}>
                <i data-feather="users"></i>
                <span>Subscriber Lookup</span>
              </a>
              <ul style={{ display: subscriber.open ? 'block' : 'none' }}>
                {sub('#', 'Account Search')}
                {sub('#', 'Account Details')}
              </ul>
            </li>

            {/* Cable Teardown */}
            <li className={teardown.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={teardown.toggle} aria-expanded={teardown.open} className={parentCls}>
                <i data-feather="scissors"></i>
                <span>Cable Teardown</span>
              </a>
              <ul style={{ display: teardown.open ? 'block' : 'none' }}>
                {sub('#', 'All Tickets')}
                {sub('#', 'New Teardown')}
                {sub('#', 'Draft / Submitted')}
                {sub('#', 'Completed')}
              </ul>
            </li>

            {/* Validation Queue */}
            <li className={validation.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={validation.toggle} aria-expanded={validation.open} className={parentCls}>
                <i data-feather="check-square"></i>
                <span>Validation Queue</span>
              </a>
              <ul style={{ display: validation.open ? 'block' : 'none' }}>
                {sub('#', 'For Validation')}
                {sub('#', 'Approved')}
                {sub('#', 'Rejected')}
              </ul>
            </li>

            {/* ── REPORTS ── */}
            <li className={labelCls}>Reports</li>

            <li className={auditRpts.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={auditRpts.toggle} aria-expanded={auditRpts.open} className={parentCls}>
                <i data-feather="bar-chart-2"></i>
                <span>Audit Reports</span>
              </a>
              <ul style={{ display: auditRpts.open ? 'block' : 'none' }}>
                {sub('/polereports/poleAudit', 'Pole Audit Summary')}
                {sub('#', 'NAP Utilization')}
                {sub('#', 'Span Teardown Report')}
                {sub('#', 'Validation Summary')}
              </ul>
            </li>

            <li className={ownerPrev.open ? 'mm-active' : ''}>
              <a href="javascript:void(0);" onClick={ownerPrev.toggle} aria-expanded={ownerPrev.open} className={parentCls}>
                <i data-feather="eye"></i>
                <span>Pole Owner Preview</span>
              </a>
              <ul style={{ display: ownerPrev.open ? 'block' : 'none' }}>
                {sub('#', 'Safe Validation View')}
                {sub('#', 'Evidence Preview')}
              </ul>
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
    </div>
  )
}
