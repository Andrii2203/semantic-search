import { useState } from 'react'
import { useSources, useAddSource, useToggleSource, useDeleteSource } from '../hooks/useItems'
import { LoaderIcon, TrashIcon, StatusDot } from '../icons'

function SourceRow({ source, onToggle, onRemove }) {
  const name = source.label || source.url

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
      <StatusDot status={source.enabled ? 'ok' : 'unknown'} className="w-1.5 h-1.5" />

      <div className="flex-1 min-w-0">
        <div className="text-sm text-fg truncate">{name}</div>
        <div className="text-[10px] font-mono text-fg-2 truncate">
          {source.type === 'builtin' ? 'built in' : source.url}
        </div>
      </div>

      <button
        onClick={() => onToggle(source)}
        aria-label={`${source.enabled ? 'Switch off' : 'Switch on'} ${name}`}
        className="px-2 py-1 rounded-sm text-[10px] font-mono uppercase tracking-wider text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors"
      >
        {source.enabled ? 'On' : 'Off'}
      </button>

      {source.type !== 'builtin' && (
        <button
          onClick={() => onRemove(source)}
          aria-label={`Remove ${name}`}
          className="p-1 rounded-sm text-fg-2 hover:text-red-500 hover:bg-surface-2 transition-colors"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

export function SourcesPage() {
  const { data: sources, isLoading } = useSources()
  const addSource = useAddSource()
  const toggleSource = useToggleSource()
  const deleteSource = useDeleteSource()

  const [url, setUrl] = useState('')
  const [error, setError] = useState(null)

  async function handleAdd(event) {
    event.preventDefault()
    if (!url.trim()) return
    setError(null)
    try {
      await addSource.mutateAsync(url.trim())
      setUrl('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-sm text-fg font-semibold tracking-wide">Sources</h2>
          <p className="text-xs text-fg-2 leading-relaxed mt-2">
            Where the engine looks. Add any RSS or Atom feed: a blog, a news site, a YouTube channel,
            a subreddit. Switching a source off stops it from reaching your inbox without deleting it.
          </p>
        </div>

        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            id="feed-url"
            aria-label="Feed URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/feed.xml"
            className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg placeholder-fg-2/50 focus:outline-none focus:border-accent/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!url.trim() || addSource.isPending}
            className="px-3 py-2 rounded-sm text-xs bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {addSource.isPending && <LoaderIcon className="w-3 h-3" />}
            Add feed
          </button>
        </form>

        {error && <p className="text-xs text-red-500/80 font-mono">{error}</p>}

        <div className="border border-border rounded-md overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-fg-2 text-xs font-mono">
              <LoaderIcon className="w-4 h-4" /> Loading sources
            </div>
          )}

          {(sources || []).map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              onToggle={(target) =>
                toggleSource.mutate({ id: target.id, enabled: !target.enabled })
              }
              onRemove={(target) => deleteSource.mutate(target.id)}
            />
          ))}

          {!isLoading && (sources || []).length === 0 && (
            <p className="px-4 py-8 text-xs font-mono text-fg-2 text-center">No sources yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
