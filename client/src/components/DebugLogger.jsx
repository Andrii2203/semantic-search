import { useEffect, useState, useRef } from 'react'

export function DebugLogger() {
  const [logs, setLogs] = useState(() => {
    // Завантажуємо логи з пам'яті при старті
    const saved = sessionStorage.getItem('debug_logs')
    return saved ? JSON.parse(saved) : []
  })
  const [isOpen, setIsOpen] = useState(true)
  const scrollRef = useRef(null)

  // Збереження в пам'ять при кожній зміні логів
  useEffect(() => {
    sessionStorage.setItem('debug_logs', JSON.stringify(logs))
    // Авто-прокрутка вниз
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    const addLog = (type, message) => {
      const newLog = {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        type,
        message
      }
      setLogs(prev => [...prev, newLog].slice(-50)) // Тримаємо останні 50 подій
    }

    const handleClick = (e) => {
      const target = e.target
      addLog('CLICK', `${target.tagName} ${target.innerText?.slice(0, 20) || ''} (id: ${target.id || 'none'})`)
    }

    const handleKeyDown = (e) => {
      addLog('KEY', `Pressed: ${e.key}`)
    }

    window.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const clearLogs = () => {
    setLogs([])
    sessionStorage.removeItem('debug_logs')
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-slate-800 p-2 rounded-full border border-slate-700 shadow-xl hover:bg-slate-700 z-50"
      >
        👁️ Open Logs
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-slate-950/90 border border-slate-800 rounded-xl shadow-2xl flex flex-col z-50 backdrop-blur-md overflow-hidden">
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Event Journal</span>
        <div className="flex gap-2">
          <button onClick={clearLogs} className="text-[10px] text-red-400 hover:text-red-300">Clear</button>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]"
      >
        {logs.length === 0 && (
          <div className="text-slate-600 text-center mt-10 italic">Waiting for events...</div>
        )}
        {logs.map(log => (
          <div key={log.id} className="border-b border-slate-900/50 pb-1">
            <span className="text-slate-600">[{log.time}]</span>{' '}
            <span className={log.type === 'CLICK' ? 'text-emerald-400' : 'text-sky-400'}>
              {log.type}
            </span>:{' '}
            <span className="text-slate-300">{log.message}</span>
          </div>
        ))}
      </div>

      <div className="p-1 bg-slate-900/50 text-[9px] text-center text-slate-700">
        Persists on Refresh (F5)
      </div>
    </div>
  )
}
