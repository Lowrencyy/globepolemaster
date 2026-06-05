import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { apiChangePassword, clearPasswordResetFlag, getToken, getUser, mustChangePassword } from '../lib/auth'
import logoImg from '../assets/images/telcovantage-logo.png'

export default function ChangePassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!getToken()) return <Navigate to="/login" replace />
  if (!mustChangePassword()) return <Navigate to="/loading" replace />

  const user = getUser()
  const name = String(user?.full_name ?? user?.first_name ?? 'User')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!password.trim()) {
      setError('Please enter a new password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await apiChangePassword(password, confirmPassword)
      clearPasswordResetFlag()
      navigate('/loading', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-12">
        <div className="relative col-span-12 overflow-hidden bg-[radial-gradient(circle_at_top,#16a34a22,transparent_40%),linear-gradient(180deg,#ffffff_0%,#f4f7fb_100%)] px-4 py-8 sm:px-6 lg:col-span-5 lg:px-10 xl:px-14">
          <div className="pointer-events-none absolute -left-10 top-28 h-60 w-60 rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-100/70 blur-2xl" />

          <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col">
            <div className="mb-10">
              <img src={logoImg} alt="TelcoVantage" className="h-16 w-auto object-contain" />
            </div>

            <div className="my-auto">
              <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-emerald-100 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <i className="mdi mdi-lock-reset text-2xl"></i>
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Secure Access</p>
                  <p className="text-xs text-slate-500">First-time password update required</p>
                </div>
              </div>

              <div className="mb-8">
                <h1 className="text-3xl font-black leading-tight text-slate-900 sm:text-4xl">
                  Change Your Password
                </h1>
                <p className="mt-4 max-w-lg text-sm leading-7 text-slate-500 sm:text-[15px]">
                  {name}, your account was created with a temporary password. Set a new secure password
                  to continue to the TelcoVantage Globe dashboard.
                </p>
              </div>

              <div className="rounded-[30px] border border-white/70 bg-white/78 p-6 shadow-[0_28px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8">
                {error && (
                  <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">New Password</label>
                    <div className="group flex items-center rounded-2xl border border-slate-200 bg-slate-50/80 px-4 transition focus-within:border-emerald-400 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]">
                      <span className="pr-3 text-slate-400">
                        <i className="mdi mdi-lock-outline text-xl"></i>
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-transparent py-4 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                        placeholder="Minimum 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="pl-3 text-xs font-extrabold tracking-[0.14em] text-emerald-700 transition hover:text-emerald-800"
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Confirm Password</label>
                    <div className="group flex items-center rounded-2xl border border-slate-200 bg-slate-50/80 px-4 transition focus-within:border-emerald-400 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]">
                      <span className="pr-3 text-slate-400">
                        <i className="mdi mdi-shield-lock-outline text-xl"></i>
                      </span>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full bg-transparent py-4 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                        placeholder="Re-enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(v => !v)}
                        className="pl-3 text-xs font-extrabold tracking-[0.14em] text-emerald-700 transition hover:text-emerald-800"
                      >
                        {showConfirmPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password Rules</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Use at least 8 characters and choose something only you know.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-500 px-4 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_35px_rgba(5,150,105,0.32)] transition hover:scale-[1.01] hover:shadow-[0_20px_40px_rgba(5,150,105,0.36)] disabled:scale-100 disabled:opacity-60"
                  >
                    {loading && (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8z" />
                      </svg>
                    )}
                    {loading ? 'Updating...' : 'Set New Password'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block lg:col-span-7 xl:col-span-7">
          <div
            className="h-screen bg-cover bg-center"
            style={{ backgroundImage: "url('/assets/images/auth-bg.jpg')" }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(3,18,15,0.76),rgba(8,63,47,0.46),rgba(0,0,0,0.7))]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%)]" />

            <div className="relative z-10 flex h-full items-end p-12 xl:p-16">
              <div className="max-w-2xl">
                <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-white/90 backdrop-blur-md">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]"></span>
                  <span className="text-xs font-bold uppercase tracking-[0.3em]">Account Security</span>
                </div>

                <h2 className="text-5xl font-black leading-[1.05] text-white drop-shadow-[0_10px_40px_rgba(0,0,0,0.35)] xl:text-6xl">
                  Secure your
                  <br />
                  TelcoVantage
                  <br />
                  workspace
                </h2>

                <p className="mt-6 max-w-xl text-lg leading-8 text-white/80">
                  One quick password update keeps your Globe dashboard, field operations,
                  teardown logs, and warehouse workflows protected from the start.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
