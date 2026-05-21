import { useState } from 'react'
import { useSearchStore } from '../stores/searchStore'
import { X, Plus } from 'lucide-react'

export function KeywordEditor() {
  const { keywords, addKeyword, removeKeyword } = useSearchStore()
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (input.trim()) {
      addKeyword(input.trim())
      setInput('')
    }
  }

  if (keywords.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono">
        AI Keywords <span className="text-foreground/15">— click to remove</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw) => (
          <button
            key={kw}
            onClick={() => removeKeyword(kw)}
            className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono
              bg-ubuntu-orange/15 text-ubuntu-orange border border-ubuntu-orange/20
              hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30
              transition-all duration-200"
          >
            {kw}
            <X size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}

        {/* Add keyword inline */}
        <div className="inline-flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="+ add"
            className="w-16 bg-transparent border-none text-xs font-mono text-foreground/40
              placeholder:text-foreground/15 focus:outline-none focus:text-foreground/60
              focus:w-28 transition-all duration-200"
          />
          {input && (
            <button
              onClick={handleAdd}
              className="p-0.5 text-ubuntu-orange hover:text-ubuntu-orange-hover transition-colors"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
