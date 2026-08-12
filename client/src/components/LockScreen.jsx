import { useState } from 'react'
import { LockIcon, LoaderIcon } from '../icons'

export function LockScreen({ onSuccess }) {
  const [mode, setMode]       = useState('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  function switchMode(m) {
    setMode(m)
    setError(null)
    setEmail('')
    setPassword('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        onSuccess()
      } else {
        setError(data?.error?.message || (mode === 'login' ? 'Invalid email or password' : 'Registration failed'))
        setPassword('')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90">
      <div className="w-full max-w-sm mx-4 p-8 bg-surface border border-border rounded-sm shadow-lg">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 flex items-center justify-center rounded-sm border border-accent/30 bg-accent/8">
            <LockIcon className="w-5 h-5 text-accent" />
          </div>

          <div className="text-center">
            <h2 className="font-mono text-sm text-fg uppercase tracking-widest">Internet Mode</h2>
            <p className="text-fg-2 text-xs mt-1">{isLogin ? 'Sign in to your account' : 'Create an account'}</p>
          </div>

          <div className="flex w-full border border-border rounded-sm overflow-hidden text-xs font-mono">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-1.5 transition-colors ${isLogin ? 'bg-accent text-white' : 'text-fg-2 hover:text-fg hover:bg-surface-2'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-1.5 transition-colors ${!isLogin ? 'bg-accent text-white' : 'text-fg-2 hover:text-fg hover:bg-surface-2'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              required
              className="w-full px-3 py-2 bg-bg border border-border rounded-sm text-sm text-fg placeholder-fg-2/50 font-mono focus:outline-none focus:border-accent/50 transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? 'Password' : 'Password (min 8 chars)'}
              required
              className="w-full px-3 py-2 bg-bg border border-border rounded-sm text-sm text-fg placeholder-fg-2/50 font-mono focus:outline-none focus:border-accent/50 transition-colors"
            />

            {error && <p className="text-red-500 text-xs font-mono text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono uppercase tracking-widest rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && <LoaderIcon className="w-3 h-3" />}
              {loading ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign in' : 'Create account')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
