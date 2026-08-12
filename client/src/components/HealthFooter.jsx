import { StatusDot } from '../icons'
import { useHealthFull } from '../hooks/useItems'

function moduleStatus(module) {
  return typeof module === 'string' ? module : module?.status || 'unknown'
}

function moduleTooltip(name, module) {
  const status = moduleStatus(module)
  const error = typeof module === 'object' ? module?.error : null
  return error ? `${name}: ${error}` : `${name}: ${status}`
}

export function HealthFooter() {
  const { data: health } = useHealthFull()

  if (!health) return null

  const pairs = Object.entries(health.modules || {})

  return (
    <div className="h-8 shrink-0 border-t border-border bg-surface flex items-center px-4 gap-4 text-[10px] font-mono text-fg-2">
      <div className="flex items-center gap-1.5">
        <StatusDot status={health.status} />
        <span className="uppercase tracking-wider">{health.status}</span>
      </div>

      {pairs.length > 0 && (
        <div className="flex items-center gap-3 border-l border-border pl-3">
          {pairs.map(([name, module]) => (
            <span key={name} className="flex items-center gap-1" title={moduleTooltip(name, module)}>
              <StatusDot status={moduleStatus(module) === 'ok' ? 'ok' : 'error'} className="w-1.5 h-1.5" />
              <span className="uppercase">{name}</span>
            </span>
          ))}
        </div>
      )}

      <span className="ml-auto text-fg-2/60">{health.uptime}s</span>
    </div>
  )
}
