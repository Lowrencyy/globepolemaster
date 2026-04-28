import { useParams, useNavigate, Link } from 'react-router-dom'
import AllPoles from '../nodes/nodelist'

const REGION_LABELS: Record<string, string> = {
  'north-luzon': 'North Luzon',
  'south-luzon': 'South Luzon',
  'ncr':         'NCR',
  'visayas':     'Visayas',
  'mindanao':    'Mindanao',
}

export default function NodeDetail() {
  const { regionSlug = '', nodeId = '' } = useParams()
  const navigate = useNavigate()

  const regionLabel = REGION_LABELS[regionSlug] ?? regionSlug

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
        <Link to={`/sites/${regionSlug}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
          {regionLabel}
        </Link>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{nodeId}</span>
      </nav>

      {/* Back button */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">
            Node <span className="font-mono text-indigo-600 dark:text-indigo-400">{nodeId}</span>
          </h4>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Poles registered under this node</p>
        </div>
        <button
          onClick={() => navigate(`/sites/${regionSlug}`)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to {regionLabel}
        </button>
      </div>

      {/* Nodelist (AllPoles) view */}
      <AllPoles />
    </div>
  )
}
