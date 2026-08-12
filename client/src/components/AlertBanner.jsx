import { useState } from 'react'
import { useHealthFull } from '../hooks/useItems'
import { useUIStore } from '../stores/uiStore'
import { AlertIcon, CloseIcon } from '../icons'

function moduleStatus(m) {
  return typeof m === 'string' ? m : m?.status || 'unknown'
}

export function AlertBanner() {
  const { data } = useHealthFull()
  const { setView } = useUIStore()
  const [dismissed, setDismissed] = useState(false)

  const status = data?.status
  if (dismissed || !status || status === 'healthy') return null

  const bad = Object.entries(data.modules || {})
    .filter(([, m]) => ['warning', 'error'].includes(moduleStatus(m)))
    .map(([name]) => name)

  const critical = status === 'critical'

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-xs font-mono border-b ${
      critical ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
    }`}>
      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 truncate">
        {critical ? 'Critical: ' : 'Warning: '}
        {bad.length ? bad.join(', ') : 'system'} {bad.length === 1 ? 'has' : 'have'} issues
      </span>
      <button onClick={() => setView('system')} className="underline hover:no-underline shrink-0">Fix</button>
      <button onClick={() => setDismissed(true)} className="shrink-0 hover:opacity-70" title="Dismiss">
        <CloseIcon className="w-3 h-3" />
      </button>
    </div>
  )
}
