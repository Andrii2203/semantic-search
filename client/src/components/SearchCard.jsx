import { useSearchStore } from '../stores/searchStore'
import { Input } from './ui/input'
import { MagneticButton } from './MagneticButton'
import { KeywordEditor } from './KeywordEditor'
import { SearchControls } from './SearchControls'
import { ResultCard } from './ResultCard'
import { FileUploader } from './FileUploader'
import { Search, Loader2 } from 'lucide-react'

export function SearchCard() {
  const {
    query, setQuery,
    isSearching, search,
    results, stats, error,
    clearResults,
  } = useSearchStore()

  const handleSearch = async () => {
    if (!query.trim()) return
    await search()
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
          {/* Title */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-mono text-foreground/30 uppercase tracking-widest">
              Universal Matching Engine
            </span>
          </div>
        </div>

        {/* TERMINAL CONTENT AREA */}
        <div className="bg-ubuntu-aubergine p-8 font-mono space-y-6">

          {/* INPUT PROMPT LINE */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 group">
              <Search size={16} className="text-ubuntu-orange shrink-0" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="bg-transparent border-none text-foreground text-lg p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/10 w-full"
                placeholder="describe what you're looking for..."
                autoFocus
              />
            </div>
          </div>

          {/* KEYWORDS (shown after search) */}
          <KeywordEditor />

          {/* SEARCH CONTROLS */}
          <SearchControls />

          {/* FILE UPLOADER */}
          <FileUploader />

          {/* ACTION BUTTON */}
          <div className="pt-6 border-t border-foreground/5">
            <MagneticButton
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="w-full bg-ubuntu-orange text-white font-bold py-4 rounded-sm hover:bg-ubuntu-orange-hover transition-all active:scale-95 shadow-lg shadow-orange-950/20 disabled:opacity-50 disabled:cursor-wait uppercase tracking-widest text-sm"
            >
              {isSearching ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Searching...
                </span>
              ) : (
                'Execute Search'
              )}
            </MagneticButton>
          </div>

          {/* ERROR */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm animate-in fade-in duration-200">
              <p className="text-xs font-mono text-red-400">{error}</p>
            </div>
          )}

          {/* STATS */}
          {stats && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-mono text-foreground/20 uppercase tracking-wider animate-in fade-in duration-300">
              <span>mode: {stats.mode}</span>
              <span>chunks: {stats.totalChunks}</span>
              <span>docs: {stats.totalDocuments}</span>
              <span>bm25: {stats.bm25Results}</span>
              <span>semantic: {stats.semanticResults}</span>
              <span>{stats.duration}ms</span>
            </div>
          )}

          {/* RESULTS */}
          {results.length > 0 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono">
                  Results ({results.length})
                </div>
                <button
                  onClick={clearResults}
                  className="text-[10px] font-mono text-foreground/15 hover:text-foreground/30 uppercase tracking-widest transition-colors"
                >
                  Clear
                </button>
              </div>
              {results.map((doc, i) => (
                <ResultCard key={doc.parentId || i} doc={doc} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FOOTER HINT */}
      <div className="mt-6 text-center text-foreground/20 text-[10px] font-mono uppercase tracking-[0.3em]">
        v2.0.0-ume | Universal Matching Engine | build: 2026.05.09
      </div>
    </div>
  )
}
