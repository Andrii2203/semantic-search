import { useSearchStore } from '../stores/searchStore'
import { Zap, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export function SearchControls() {
  const {
    mode, setMode,
    bm25Weight, semanticWeight, setWeights,
    threshold, setThreshold,
    useReranker, setUseReranker,
  } = useSearchStore()

  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono">
          Search Mode
        </div>
        <div className="flex bg-foreground/5 rounded-sm overflow-hidden border border-foreground/10">
          <button
            onClick={() => setMode('sequential')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono transition-all ${
              mode === 'sequential'
                ? 'bg-ubuntu-orange text-white'
                : 'text-foreground/40 hover:text-foreground/60'
            }`}
          >
            <Zap size={12} />
            Sequential
          </button>
          <button
            onClick={() => setMode('parallel')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono transition-all ${
              mode === 'parallel'
                ? 'bg-ubuntu-orange text-white'
                : 'text-foreground/40 hover:text-foreground/60'
            }`}
          >
            <Layers size={12} />
            Parallel
          </button>
        </div>
      </div>

      {/* Advanced Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-foreground/20 font-mono hover:text-foreground/40 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Advanced Settings
      </button>

      {expanded && (
        <div className="space-y-3 pl-2 border-l border-foreground/5 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Weights (only for parallel) */}
          {mode === 'parallel' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-foreground/30">
                <span>BM25: {bm25Weight.toFixed(1)}</span>
                <span>Semantic: {semanticWeight.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0" max="1" step="0.1"
                value={bm25Weight}
                onChange={(e) => {
                  const bm25 = parseFloat(e.target.value)
                  setWeights(bm25, +(1 - bm25).toFixed(1))
                }}
                className="w-full h-1 bg-foreground/10 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ubuntu-orange"
              />
            </div>
          )}

          {/* Threshold */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-foreground/30">Threshold</span>
            <input
              type="number"
              min="0" max="1" step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value) || 0.65)}
              className="w-16 bg-foreground/5 border border-foreground/10 rounded-sm px-2 py-1
                text-[11px] font-mono text-foreground/60 text-right focus:outline-none focus:border-ubuntu-orange/50"
            />
          </div>

          {/* Reranker toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[10px] font-mono text-foreground/30">AI Reranker</span>
            <div
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${
                useReranker ? 'bg-ubuntu-orange' : 'bg-foreground/10'
              }`}
              onClick={() => setUseReranker(!useReranker)}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                useReranker ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
          </label>
        </div>
      )}
    </div>
  )
}
