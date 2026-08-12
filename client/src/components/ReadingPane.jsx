import { useState, useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useItemsInfinite, useUpdateStatus, useGenerateComment, useExplain, useDeleteItem } from '../hooks/useItems'
import {
  SparkleIcon, CopyIcon, CheckCircleIcon, SkipIcon,
  StarIcon, QuestionIcon, ExternalLinkIcon, LoaderIcon,
  TrashIcon, ArrowLeftIcon,
} from '../icons'

function ActionButton({ onClick, icon: Icon, label, disabled, variant = 'default', title }) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed border'
  const variants = {
    default:  'border-border text-fg-2 hover:border-fg-2/50 hover:text-fg',
    primary:  'border-accent/50 text-accent hover:bg-accent/10',
    success:  'border-green-600/40 text-green-600 dark:text-green-400 hover:bg-green-500/10',
    danger:   'border-red-500/30 text-red-500/80 hover:bg-red-500/10',
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function EmptyPane() {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg">
      <p className="text-fg-2 font-mono text-xs uppercase tracking-widest">Select an item</p>
    </div>
  )
}

function useSelectedItem(selectedId, currentView, searchResults) {
  const isSearch = currentView === 'search'
  const { data } = useItemsInfinite(currentView)

  return useMemo(() => {
    if (!selectedId) return null
    if (isSearch) {
      const doc = searchResults.find((d) => d.item?.id === selectedId)
      return doc?.item ?? null
    }
    const allItems = (data?.pages ?? []).flatMap((p) => p.items)
    return allItems.find((it) => it.id === selectedId) ?? null
  }, [selectedId, isSearch, searchResults, data])
}

export function ReadingPane() {
  const {
    selectedItemId, setSelectedItemId,
    currentView, searchResults, searchQuery,
    generatedComment, setGeneratedComment,
    explanation, setExplanation,
  } = useUIStore()

  const item = useSelectedItem(selectedItemId, currentView, searchResults)

  const updateStatus     = useUpdateStatus()
  const generateMutation = useGenerateComment()
  const explainMutation  = useExplain()
  const deleteMutation   = useDeleteItem()

  const [copied, setCopied]         = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExplaining, setIsExplaining] = useState(false)

  const [lastItemId, setLastItemId] = useState(null)
  if (selectedItemId !== lastItemId) {
    setLastItemId(selectedItemId)
    setCopied(false)
    setGeneratedComment(item?.response || null)
    setExplanation(null)
  }

  if (!item) return <EmptyPane />

  const title = item.metadata?.title || 'Untitled'
  const url   = item.metadata?.url

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      const result = await generateMutation.mutateAsync(item.id)
      setGeneratedComment(result.comment)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedComment || item.content).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleExplain() {
    setIsExplaining(true)
    try {
      const result = await explainMutation.mutateAsync({ itemId: item.id, query: searchQuery })
      setExplanation(result)
    } catch {
      setExplanation('Explanation unavailable.')
    } finally {
      setIsExplaining(false)
    }
  }

  function handleStatus(action) {
    updateStatus.mutate({ id: item.id, action })
    setSelectedItemId(null)
  }

  async function handleDelete() {
    await deleteMutation.mutateAsync(item.id)
    setSelectedItemId(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-bg">
      <div className="px-4 py-3 border-b border-border bg-surface flex items-center gap-3">
        <button
          onClick={() => setSelectedItemId(null)}
          className="flex items-center gap-1.5 text-xs font-mono text-fg-2 hover:text-fg transition-colors shrink-0"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm text-fg font-medium truncate">{title}</h2>
          <div className="flex items-center gap-3 text-[10px] font-mono text-fg-2 mt-0.5">
            <span className="uppercase tracking-wider">{item.source}</span>
            {item.metadata?.author && <span>{item.metadata.author}</span>}
            {item.metadata?.score != null && <span>⬆ {item.metadata.score}</span>}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-accent transition-colors"
              >
                View original <ExternalLinkIcon />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {generatedComment && (
          <div className="bg-accent/6 border border-accent/25 rounded-sm p-4">
            <div className="text-[10px] font-mono text-accent/70 uppercase tracking-widest mb-2">AI Response</div>
            <p className="text-sm text-fg whitespace-pre-wrap leading-relaxed">{generatedComment}</p>
          </div>
        )}

        {explanation && (
          <div className="bg-surface border border-border rounded-sm p-4">
            <div className="text-[10px] font-mono text-fg-2 uppercase tracking-widest mb-2">Why this match?</div>
            <p className="text-sm text-fg leading-relaxed">{explanation}</p>
          </div>
        )}

        <div className="text-xs text-fg-2 leading-relaxed font-mono whitespace-pre-wrap bg-surface rounded-sm p-4 border border-border">
          {item.content}
        </div>
      </div>

      <div className="px-6 py-3 border-t border-border bg-surface flex flex-wrap items-center gap-2">
        <ActionButton
          icon={isGenerating ? LoaderIcon : SparkleIcon}
          label={generatedComment ? 'Regenerate' : 'Generate'}
          onClick={handleGenerate}
          disabled={isGenerating}
          variant="primary"
          title="Generate AI comment"
        />
        <ActionButton
          icon={CopyIcon}
          label={copied ? 'Copied!' : 'Copy'}
          onClick={handleCopy}
          variant="default"
          title="Copy to clipboard"
        />
        <div className="flex-1" />
        <ActionButton
          icon={CheckCircleIcon}
          label="Approve"
          onClick={() => handleStatus('approve')}
          disabled={item.status === 'approved'}
          variant="success"
        />
        <ActionButton
          icon={SkipIcon}
          label="Skip"
          onClick={() => handleStatus('skip')}
          disabled={item.status === 'skipped'}
          variant="danger"
        />
        <ActionButton
          icon={StarIcon}
          label="Star"
          onClick={() => handleStatus('star')}
          disabled={item.status === 'starred'}
          variant="default"
        />
        <ActionButton
          icon={isExplaining ? LoaderIcon : QuestionIcon}
          label="Why?"
          onClick={handleExplain}
          disabled={isExplaining}
          variant="default"
          title="Why does this match?"
        />
        <ActionButton
          icon={deleteMutation.isPending ? LoaderIcon : TrashIcon}
          label="Delete"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          variant="danger"
          title="Delete item permanently"
        />
      </div>
    </div>
  )
}
