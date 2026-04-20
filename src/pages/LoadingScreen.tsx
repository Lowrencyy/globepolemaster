import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../assets/images/logo.png'

const STEPS = [
  'Authenticating credentials…',
  'Loading user permissions…',
  'Fetching pole inventory…',
  'Syncing field data…',
  'Preparing dashboard…',
]

export default function LoadingScreen() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const [stepIdx, setStepIdx]   = useState(0)
  const [fadeOut, setFadeOut]   = useState(false)

  useEffect(() => {
    const totalMs   = 2800
    const tickMs    = 30
    const increment = 100 / (totalMs / tickMs)

    const ticker = setInterval(() => {
      setProgress(p => {
        const next = Math.min(p + increment, 100)
        setStepIdx(Math.min(Math.floor((next / 100) * STEPS.length), STEPS.length - 1))
        return next
      })
    }, tickMs)

    const done = setTimeout(() => {
      clearInterval(ticker)
      setProgress(100)
      setFadeOut(true)
      setTimeout(() => navigate('/dashboard', { replace: true }), 500)
    }, totalMs)

    return () => { clearInterval(ticker); clearTimeout(done) }
  }, [navigate])

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)' }}
    >
      {/* Animated background rings */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[1, 2, 3].map(i => (
          <div key={i} className="absolute rounded-full border border-white/5"
            style={{
              width:  `${i * 300}px`,
              height: `${i * 300}px`,
              top:  '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: `pulse ${2 + i * 0.8}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

   

      {/* Spinner */}
      <div className="relative z-10 mb-8">
        <svg className="w-12 h-12 animate-spin" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
          <path d="M24 4 a20 20 0 0 1 20 20" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-violet-400 animate-pulse" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 w-72 mb-4">
        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
              boxShadow: '0 0 10px #a78bfa88',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-white/30 font-mono">
          <span>{Math.round(progress)}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Step label */}
      <p className="relative z-10 text-sm text-white/60 font-medium tracking-wide min-h-[20px]">
        {STEPS[stepIdx]}
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.1; transform: translate(-50%, -50%) scale(1.05); }
        }
      `}</style>
    </div>
  )
}
