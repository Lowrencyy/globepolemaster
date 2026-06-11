import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHomeRoute } from '../lib/auth'
import logoImg from '../assets/images/telco-mainlogo.png'

export default function LoadingScreen() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'intro' | 'outro'>('intro')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    timerRef.current = setTimeout(() => setPhase('outro'), 2350)
    return () => clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'outro') return
    timerRef.current = setTimeout(() => {
      navigate(getHomeRoute(), { replace: true })
    }, 1320)
    return () => clearTimeout(timerRef.current)
  }, [phase, navigate])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#fbfffd]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(219,242,235,0.42),_transparent_46%),radial-gradient(circle_at_bottom,_rgba(233,244,239,0.82),_transparent_55%)]" />

      <div className="relative flex h-full items-center justify-center px-6">
        <div
          className="relative z-10 flex flex-col items-center"
          style={{
            animation: phase === 'outro'
              ? 'contentOutro 1.32s cubic-bezier(.32,.72,0,1) forwards'
              : 'none',
          }}
        >
          <div className="relative mb-[-8px] flex h-[290px] w-[290px] items-center justify-center overflow-hidden sm:h-[340px] sm:w-[340px]">
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.36),_rgba(255,255,255,0)_72%)]" />
            <div className="logo-shine-mask absolute inset-0">
              <div className="logo-shine" />
            </div>
            <img
              src={logoImg}
              alt="TelcoVantage"
              className="logo-enter relative z-10 h-[235px] w-[235px] object-contain sm:h-[270px] sm:w-[270px]"
            />
          </div>

          <div className="title-enter text-center text-[32px] font-black tracking-[-0.04em] text-[#18392f] sm:text-[40px]">
            TELCOVANTAGE POLE MASTER V2.0
          </div>
          <div className="subtitle-enter mt-1 text-center text-[18px] font-extrabold tracking-[-0.02em] text-[#72867f] sm:text-[21px]">
            Powered By : Telcovantage Developers
          </div>
        </div>
      </div>

      <style>{`
        .logo-enter {
          opacity: 0;
          transform: scale(0.82);
          animation: logoEnter 0.95s cubic-bezier(.16,1,.3,1) 0.08s forwards;
        }

        .title-enter {
          opacity: 0;
          transform: scale(0.94);
          animation: textEnter 0.62s cubic-bezier(.16,1,.3,1) 0.48s forwards;
        }

        .subtitle-enter {
          opacity: 0;
          transform: scale(0.96);
          animation: textEnter 0.54s cubic-bezier(.16,1,.3,1) 0.72s forwards;
        }

        .logo-shine-mask {
          overflow: hidden;
        }

        .logo-shine {
          position: absolute;
          top: 36px;
          left: 58px;
          right: 58px;
          height: 150px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255,255,255,0.28), rgba(255,255,255,0.06) 68%, rgba(255,255,255,0) 100%);
          animation: shinePulse 1.8s ease-in-out infinite;
        }

        @keyframes logoEnter {
          0% { opacity: 0; transform: scale(0.82); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes textEnter {
          0% { opacity: 0; transform: scale(0.94); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes shinePulse {
          0% { opacity: 0.14; transform: scale(0.94); }
          50% { opacity: 0.3; transform: scale(1.02); }
          100% { opacity: 0.14; transform: scale(0.94); }
        }

        @keyframes contentOutro {
          0% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0px);
          }
          100% {
            opacity: 0;
            transform: scale(2.92);
            filter: blur(2px);
          }
        }
      `}</style>
    </div>
  )
}
