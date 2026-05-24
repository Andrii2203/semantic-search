import { useEffect, useState } from 'react'

export function HealthFooter() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Failed to fetch health', err))
  }, [])

  if (!health) return null

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-500'
      case 'degraded': return 'text-yellow-500'
      default: return 'text-red-500'
    }
  }

  return (
    <div className="fixed bottom-0 left-0 w-full bg-black/40 backdrop-blur-md border-t border-white/5 p-2 flex items-center justify-between text-xs font-mono text-white/50 z-50 px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <svg className={`w-3 h-3 ${getStatusColor(health.status)}`} fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" />
          </svg>
          <span className="uppercase tracking-wider">System: {health.status}</span>
        </div>
        
        {health.modules && (
          <div className="flex items-center gap-3 border-l border-white/10 pl-3">
            <span className={health.modules.db === 'ok' ? 'text-green-400' : 'text-red-400'}>DB: {health.modules.db}</span>
            <span className={health.modules.embedding === 'ok' ? 'text-green-400' : 'text-red-400'}>EMBED: {health.modules.embedding}</span>
            <span className={health.modules.groq === 'ok' ? 'text-green-400' : 'text-red-400'}>GROQ: {health.modules.groq}</span>
          </div>
        )}
      </div>
      <div>
        <span>UPTIME: {health.uptime}s</span>
      </div>
    </div>
  )
}
