import { useEffect, useState } from 'react'
import { StatusDot } from '../icons'

export function HealthFooter() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {})
  }, [])

  if (!health) return null

  const modules = health.modules || {}
  const pairs = Object.entries(modules)

  return (
    <div className="h-8 shrink-0 border-t border-border bg-surface flex items-center px-4 gap-4 text-[10px] font-mono text-fg-2">
      <div className="flex items-center gap-1.5">
        <StatusDot status={health.status} />
        <span className="uppercase tracking-wider">{health.status}</span>
      </div>

      {pairs.length > 0 && (
        <div className="flex items-center gap-3 border-l border-border pl-3">
          {pairs.map(([key, val]) => (
            <span key={key} className="flex items-center gap-1">
              <StatusDot status={val === 'ok' ? 'ok' : 'error'} className="w-1.5 h-1.5" />
              <span className="uppercase">{key}</span>
            </span>
          ))}
        </div>
      )}

      <span className="ml-auto text-fg-2/60">{health.uptime}s</span>
    </div>
  )
}
