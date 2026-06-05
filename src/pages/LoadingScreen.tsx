import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHomeRoute } from '../lib/auth'

const LINE1 = 'TELCOVANTAGE'.split('')
const LINE2 = 'PHILIPPINES'.split('')

export default function LoadingScreen() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'intro' | 'explode'>('intro')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // After text animates in → trigger circle explosion
    timerRef.current = setTimeout(() => setPhase('explode'), 1600)
    return () => clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'explode') return
    timerRef.current = setTimeout(() => {
      navigate(getHomeRoute(), { replace: true })
    }, 950)
    return () => clearTimeout(timerRef.current)
  }, [phase, navigate])

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-white">

      {/* Green circle explosion */}
      <div
        className="absolute rounded-full"
        style={{
          width: 120, height: 120,
          background: '#0A5C3B',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          animation: phase === 'explode'
            ? 'circleExplode 0.9s cubic-bezier(.55,.0,.1,1) forwards'
            : 'none',
        }}
      />

      {/* Text content */}
      <div
        className="relative z-10 flex flex-col items-center"
        style={{
          animation: phase === 'explode'
            ? 'contentZoom 0.9s cubic-bezier(.55,.0,.1,1) forwards'
            : 'none',
        }}
      >
        {/* TELCOVANTAGE */}
        <div className="flex items-center justify-center gap-[1px] mb-1">
          {LINE1.map((char, i) => (
            <span
              key={i}
              className="letter-anim"
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: '#0A5C3B',
                letterSpacing: 3,
                animationDelay: `${0.15 + i * 0.045}s`,
              }}
            >
              {char}
            </span>
          ))}
        </div>

        {/* PHILIPPINES */}
        <div className="flex items-center justify-center gap-[1px]">
          {LINE2.map((char, i) => (
            <span
              key={i}
              className="letter-anim"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#202020',
                letterSpacing: 6,
                animationDelay: `${0.75 + i * 0.045}s`,
              }}
            >
              {char}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        /* Letter fade+slide up */
        .letter-anim {
          opacity: 0;
          display: inline-block;
          transform: translateY(14px) scale(0.9);
          animation: letterIn 0.28s cubic-bezier(.22,1,.36,1) forwards;
        }
        @keyframes letterIn {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Circle expands to fill screen */
        @keyframes circleExplode {
          0%   { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(30); opacity: 1; }
        }

        /* Text zooms + fades out as circle expands */
        @keyframes contentZoom {
          0%   { opacity: 1; transform: scale(1) translateY(0); }
          40%  { opacity: 1; }
          100% { opacity: 0; transform: scale(3.5) translateY(-20px); }
        }
      `}</style>
    </div>
  )
}
