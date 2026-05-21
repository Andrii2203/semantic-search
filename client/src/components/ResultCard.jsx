import { useState } from 'react'
import { useSearchStore } from '../stores/searchStore'
import { ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'

export function ResultCard({ doc }) {
  const { explainResult } = useSearchStore()
  const [explanation, setExplanation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const item = doc.item || {}
  const meta = item.metadata || {}
  const score = doc.bestScore ? (doc.bestScore * 100).toFixed(1) : '—'
  const rerank = doc.rerankScore ? (doc.rerankScore * 100).toFixed(1) : null

  const handleExplain = async () => {
    if (explanation) {
      setExplanation(null)
      return
    }
    setLoading(true)
    const text = await explainResult(item.id)
    setExplanation(text)
    setLoading(false)
  }

  return (
    <div className="group border border-foreground/5 rounded-sm bg-foreground/[0.02] hover:bg-foreground/[0.04] transition-all duration-300">
      {/* Header */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono text-foreground/80 truncate">
              {meta.title || meta.fileName || item.id || 'Untitled'}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/25">
                {item.source || 'unknown'}
              </span>
              <span className="text-[10px] font-mono text-foreground/25">•</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/25">
                {item.type || 'document'}
              </span>
            </div>
          </div>

          {/* Scores */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className={`text-sm font-mono font-bold ${
                doc.bestScore >= 0.8 ? 'text-green-400' :
                doc.bestScore >= 0.6 ? 'text-yellow-400' : 'text-foreground/40'
              }`}>
                {score}%
              </div>
              {rerank && (
                <div className="text-[9px] font-mono text-purple-400/60">
                  rerank: {rerank}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content preview */}
        <p className="text-xs font-mono text-foreground/30 line-clamp-2 leading-relaxed">
          {(item.content || '').slice(0, 200)}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleExplain}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest
              text-foreground/20 hover:text-ubuntu-orange transition-colors disabled:opacity-50"
          >
            <MessageCircle size={11} />
            {loading ? 'Analyzing...' : explanation ? 'Hide' : 'Why this match?'}
          </button>

          {doc.matchedChunks?.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest
                text-foreground/20 hover:text-foreground/40 transition-colors"
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {doc.matchedChunks.length} chunks
            </button>
          )}
        </div>
      </div>

      {/* Explanation (lazy loaded) */}
      {explanation && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 bg-ubuntu-orange/5 border border-ubuntu-orange/10 rounded-sm">
            <p className="text-xs font-mono text-foreground/50 leading-relaxed whitespace-pre-wrap">
              {explanation}
            </p>
          </div>
        </div>
      )}

      {/* Expanded chunks */}
      {expanded && doc.matchedChunks && (
        <div className="px-4 pb-4 space-y-2 animate-in fade-in duration-200">
          {doc.matchedChunks.map((chunk, i) => (
            <div key={chunk.id || i} className="pl-3 border-l border-foreground/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-mono text-foreground/20">
                  chunk {chunk.chunkIndex ?? i}
                </span>
                <span className="text-[9px] font-mono text-ubuntu-orange/40">
                  {(chunk.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-[11px] font-mono text-foreground/25 line-clamp-2">
                {chunk.content?.slice(0, 150)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
