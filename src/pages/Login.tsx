import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../assets/images/logo.png'
import { apiLogin, saveToken, saveUser } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiLogin(email, password)
      const token = data.token ?? data.access_token ?? ''
      if (token) saveToken(token)
      if (data.user) saveUser(data.user)
      console.log('[auth] login response:', data)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-fluid">
      <div className="h-screen md:overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12">

          {/* Left panel */}
          <div className="relative z-50 col-span-12 md:col-span-5 lg:col-span-4 xl:col-span-3">
            <div className="w-full p-10 bg-white xl:p-12 dark:bg-zinc-800">
              <div className="flex h-[90vh] flex-col">

                <div className="mx-auto mb-12">
                  <a href="/">
                    <img src={logoImg} alt="Logo" className="h-12 w-auto object-contain" />
                  </a>
                </div>

                <div className="my-auto">
                  <div className="text-center mb-6">
                    <h5 className="font-medium text-gray-700 dark:text-gray-100">Welcome Back!</h5>
                    <p className="mt-2 text-gray-500 dark:text-gray-100/60">Sign in to continue to the dashboard.</p>
                  </div>

                  {error && (
                    <div className="mb-4 px-4 py-3 rounded bg-red-50 border border-red-200 text-red-600 text-sm dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="pt-2">
                    <div className="mb-4">
                      <label className="block mb-2 font-medium text-gray-700 dark:text-gray-100">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        className="w-full py-1.5 border-gray-50 rounded bg-gray-50/30 dark:bg-zinc-700/50 dark:border-zinc-600 dark:text-gray-100 focus:ring focus:ring-violet-500/20 focus:border-violet-100 text-13"
                        placeholder="Enter email"
                      />
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between mb-2">
                        <label className="font-medium text-gray-600 dark:text-gray-100">Password</label>
                        <a href="#" className="text-gray-500 dark:text-gray-100 text-sm">Forgot password?</a>
                      </div>
                      <div className="flex">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          className="w-full py-1.5 border-gray-50 rounded ltr:rounded-r-none bg-gray-50/30 text-13 dark:bg-zinc-700/50 dark:border-zinc-600 dark:text-gray-100 focus:ring focus:ring-violet-500/20 focus:border-violet-100"
                          placeholder="Enter password"
                        />
                        <button type="button" onClick={() => setShowPassword(s => !s)}
                          className="px-4 border border-gray-50 bg-gray-50 rounded-r border-l-0 dark:bg-zinc-700 dark:border-zinc-600 dark:text-gray-100">
                          <i className={`mdi ${showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'}`}></i>
                        </button>
                      </div>
                    </div>

                    <div className="mb-6 flex items-center gap-2">
                      <input type="checkbox" id="remember" defaultChecked
                        className="w-4 h-4 border border-gray-300 rounded cursor-pointer focus:ring-offset-0" />
                      <label htmlFor="remember" className="font-medium text-gray-600 dark:text-gray-100">Remember me</label>
                    </div>

                    <button type="submit" disabled={loading}
                      className="w-full py-2 text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-60 rounded shadow-md shadow-violet-200 dark:shadow-zinc-600 transition-colors flex items-center justify-center gap-2">
                      {loading && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                      {loading ? 'Signing in...' : 'Log In'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="hidden md:block col-span-7 lg:col-span-8 xl:col-span-9">
            <div className="h-screen bg-cover bg-center relative p-5" style={{ backgroundImage: "url('/assets/images/auth-bg.jpg')" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/70"></div>
              <div className="relative z-10 flex items-center justify-center h-full">
                <div className="text-center px-8">
                  <h2 className="text-6xl font-extrabold mb-6 text-white drop-shadow-lg">Welcome to the Dashboard</h2>
                  <p className="text-2xl font-semibold text-white drop-shadow-md">Sign in to access your account and manage everything from one place.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
