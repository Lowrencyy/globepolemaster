import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import AllPoles from '../nodes/nodelist'
import { SKYCABLE_API, getToken } from '../../lib/auth'
import { cacheGet, cacheSet } from '../../lib/cache'
import { idFromSlug, slugify } from '../../lib/utils'

type Site = {
  id: number
  name: string
  address?: string
  area?: { id: number; name: string }
}

export default function SiteDetail() {
  const { siteSlug = '' } = useParams()
  const navigate = useNavigate()

  const siteId = idFromSlug(siteSlug) || Number(siteSlug)

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!siteId) return
    const hit = cacheGet<Site>(`sitedetail_${siteId}`)
    if (hit) { setSite(hit); setLoading(false) }
    const token = getToken()
    fetch(`${SKYCABLE_API}/areas/${siteId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
    })
      .then(r => r.json())
      .then((data: Site) => { setSite(data); cacheSet(`sitedetail_${siteId}`, data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [siteId])

  const siteFullSlug = site ? `${slugify(site.name)}-${site.id}` : siteSlug

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/sites" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
          Site List
        </Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {loading ? '…' : (site?.name ?? 'Site')}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">
            {loading ? '…' : site?.name} — Nodes
          </h4>
          {site?.area && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {site.area.name}{site.address ? ` · ${site.address}` : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/sites')}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Site List
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">
          Loading site…
        </div>
      ) : (
        <AllPoles areaId={siteId} siteSlug={siteFullSlug} />
      )}
    </div>
  )
}
