import { useState } from 'react'
import { LockIcon, LoaderIcon } from '../icons'

export function LockScreen({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        onSuccess()
      } else {
        setError('Invalid password')
        setPassword('')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90">
      <div className="w-full max-w-sm mx-4 p-8 bg-surface border border-border rounded-sm shadow-lg">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 flex items-center justify-center rounded-sm border border-accent/30 bg-accent/8">
            <LockIcon className="w-5 h-5 text-accent" />
          </div>

          <div className="text-center">
            <h2 className="font-mono text-sm text-fg uppercase tracking-widest">Internet Mode</h2>
            <p className="text-fg-2 text-xs mt-1">Session required</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full px-3 py-2 bg-bg border border-border rounded-sm text-sm text-fg placeholder-fg-2/50 font-mono focus:outline-none focus:border-accent/50 transition-colors"
            />

            {error && <p className="text-red-500 text-xs font-mono text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono uppercase tracking-widest rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && <LoaderIcon className="w-3 h-3" />}
              {loading ? 'Authenticating…' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
