import { useHealthFull } from '../hooks/useItems'
import { SystemIcon, LoaderIcon, RefreshIcon } from '../icons'

const DOT = {
  ok: 'bg-green-500',
  healthy: 'bg-green-500',
  warning: 'bg-yellow-500',
  degraded: 'bg-yellow-500',
  error: 'bg-red-500',
  critical: 'bg-red-500',
  unknown: 'bg-fg-2/40',
}

function Dot({ status }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${DOT[status] || DOT.unknown}`} />
}

function moduleStatus(m) {
  return typeof m === 'string' ? m : m?.status || 'unknown'
}

export function SystemHealth() {
  const { data, isLoading, refetch, isFetching } = useHealthFull()

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-2 text-xs font-mono gap-2">
        <LoaderIcon className="w-4 h-4" /> Checking system…
      </div>
    )
  }

  const modules = data?.modules || {}

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SystemIcon className="w-4 h-4 text-accent" />
            <h2 className="font-mono text-sm text-fg uppercase tracking-widest">System</h2>
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-sm text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors"
            title="Refresh"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Dot status={data?.status} />
          <span className="text-xs font-mono text-fg uppercase tracking-wider">{data?.status || 'unknown'}</span>
          {data?.uptime != null && (
            <span className="text-[10px] font-mono text-fg-2/60">· up {data.uptime}s</span>
          )}
        </div>

        <div className="border border-border rounded-sm overflow-hidden">
          {Object.entries(modules).map(([name, m]) => {
            const status = moduleStatus(m)
            const detail = typeof m === 'object' && m
              ? [m.isRunning ? 'running' : null, m.currentStep, m.error].filter(Boolean).join(' · ')
              : null
            return (
              <div key={name} className="flex items-center justify-between px-3 py-2.5 border-b border-border last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <Dot status={status} />
                  <span className="text-xs font-mono text-fg">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {detail && <span className="text-[10px] font-mono text-fg-2/60 truncate max-w-[200px]">{detail}</span>}
                  <span className="text-[10px] font-mono text-fg-2 uppercase">{status}</span>
                </div>
              </div>
            )
          })}
        </div>

        {data?.checkedAt && (
          <p className="text-[10px] font-mono text-fg-2/50 mt-3">
            Checked {new Date(data.checkedAt).toLocaleTimeString()}{data.cached ? ' (cached)' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
