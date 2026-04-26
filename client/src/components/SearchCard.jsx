import { useState, useEffect } from 'react'
import { Input } from './ui/input'
import { MagneticButton } from './MagneticButton'

export function SearchCard() {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [fallbackData, setFallbackData] = useState(null)

  useEffect(() => {
    // Завантажуємо дані для "автозаповнення" або підказок
    fetch('/src/data/job_hunter.json')
      .then(res => res.json())
      .then(data => setFallbackData(data))
      .catch(err => console.log('No fallback data found'))
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) return
    setIsSearching(true)

    console.log('--- Terminal Search Initialized ---')
    console.log(`Query: ${query}`)

    // Емуляція пошуку (згодом підключимо Express)
    setTimeout(() => {
      setIsSearching(false)
      console.log('Search completed. 0 results (backend not connected yet)')
    }, 1500)
  }

  return (
    <div className="max-w-3xl w-full mx-auto mt-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      {/* WINDOW CONTAINER */}
      <div className="rounded-lg shadow-2xl overflow-hidden ring-1 ring-foreground/10 flex flex-col moon-glow">

        {/* REAL TERMINAL HEADER (TOP BAR) */}
        <div className="bg-ubuntu-header h-9 flex items-center px-4 relative shrink-0">
          {/* TERMINAL DOTS */}
          <div className="flex gap-2 z-10">
            <div className="w-3 h-3 rounded-full bg-[#df382c] shadow-inner" />
            <div className="w-3 h-3 rounded-full bg-[#efb73e] shadow-inner" />
            <div className="w-3 h-3 rounded-full bg-[#2da44e] shadow-inner" />
          </div>
        </div>

        {/* TERMINAL CONTENT AREA */}
        <div className="bg-ubuntu-aubergine p-8 font-mono space-y-6">

          {/* INPUT PROMPT LINE */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 group">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="bg-transparent border-none text-foreground text-lg p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/10 w-full"
                placeholder="enter search query..."
                autoFocus
              />
            </div>
          </div>

          {/* ACTION BUTTON */}
          <div className="pt-6 border-t border-foreground/5">
            <MagneticButton
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full bg-ubuntu-orange text-white font-bold py-4 rounded-sm hover:bg-ubuntu-orange-hover transition-all active:scale-95 shadow-lg shadow-orange-950/20 disabled:opacity-50 disabled:cursor-wait uppercase tracking-widest text-sm"
            >
              {isSearching ? 'Executing Query...' : 'Execute Search'}
            </MagneticButton>
          </div>
        </div>
      </div>

      {/* FOOTER HINT */}
      <div className="mt-6 text-center text-foreground/20 text-[10px] font-mono uppercase tracking-[0.3em]">
        v1.0.4-stable | build: 2026.04.25
      </div>
    </div>
  )
}
