import { useUIStore } from '../stores/uiStore'
import { useItemsInfinite, useSearch } from '../hooks/useItems'
import { SearchIcon, LoaderIcon, RefreshIcon } from '../icons'

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diffH = (Date.now() - d) / 3_600_000
  if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`
  if (diffH < 24) return `${Math.floor(diffH)}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

const SOURCE_LABEL = { hn: 'HN', reddit: 'Reddit', djinni: 'Djinni' }

function ItemRow({ item, selected, onClick }) {
  const title = item.metadata?.title || item.content?.slice(0, 60) || 'Untitled'
  const preview = item.content?.slice(0, 90) || ''
  const hnScore = item.metadata?.score
  const author  = item.metadata?.author

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-border transition-colors cursor-pointer border-l-2 ${
        selected ? 'bg-accent/8 border-l-accent' : 'hover:bg-surface-2 border-l-transparent'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-accent/80">
          {SOURCE_LABEL[item.source] ?? item.source}
        </span>
        <span className="text-[10px] text-fg-2 shrink-0">{formatTime(item.created_at)}</span>
      </div>
      <div className="text-sm text-fg truncate mb-1">{title}</div>
      <div className="flex items-center gap-2 text-[10px] font-mono text-fg-2">
        {hnScore != null && <span>⬆ {hnScore}</span>}
        {author && <span className="truncate">{author}</span>}
        {!hnScore && !author && <span className="truncate">{preview}</span>}
      </div>
    </button>
  )
}

function SearchResultRow({ doc, selected, onClick }) {
  const title = doc.item?.metadata?.title || doc.item?.content?.slice(0, 60) || 'Untitled'
  const score = doc.score != null ? `${Math.round(doc.score * 100)}%` : null

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-border transition-colors cursor-pointer border-l-2 ${
        selected ? 'bg-accent/8 border-l-accent' : 'hover:bg-surface-2 border-l-transparent'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-accent/80">
          {SOURCE_LABEL[doc.item?.source] ?? doc.item?.source}
        </span>
        {score && <span className="text-[10px] font-mono text-green-500 shrink-0">{score}</span>}
      </div>
      <div className="text-sm text-fg truncate">{title}</div>
    </button>
  )
}

function SearchBar({ onSearch, isSearching }) {
  const { searchQuery, setSearchQuery } = useUIStore()

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSearch() }
  }

  return (
    <div className="p-3 border-b border-border">
      <div className="relative">
        <textarea
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you're looking for… (Enter to search)"
          rows={3}
          className="w-full px-3 py-2 pr-8 bg-surface-2 border border-border rounded-sm text-xs text-fg placeholder-fg-2/60 font-mono resize-none focus:outline-none focus:border-accent/50 transition-colors"
        />
        <button
          onClick={onSearch}
          disabled={!searchQuery.trim() || isSearching}
          className="absolute right-2 bottom-2 text-fg-2 hover:text-accent disabled:opacity-30 transition-colors"
        >
          {isSearching ? <LoaderIcon className="w-3.5 h-3.5" /> : <SearchIcon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

export function ItemList() {
  const {
    currentView, selectedItemId, setSelectedItemId,
    searchResults, isSearching, setIsSearching,
    setSearchResults, setSearchStats, setSearchError, searchQuery,
  } = useUIStore()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useItemsInfinite(currentView)
  const searchMutation = useSearch()
  const isSearch = currentView === 'search'

  const allItems = isSearch
    ? searchResults
    : (data?.pages ?? []).flatMap((p) => p.items)

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setSearchError(null)
    try {
      const result = await searchMutation.mutateAsync({ query: searchQuery, collectionId: 'internet' })
      setSearchResults(result.results || [])
      setSearchStats(result.stats || null)
    } catch (err) {
      setSearchError(err.message)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">
      {isSearch && <SearchBar onSearch={handleSearch} isSearching={isSearching} />}

      <div className="flex-1 overflow-y-auto">
        {isLoading && !isSearch && (
          <div className="flex items-center justify-center py-12 gap-2 text-fg-2 text-xs font-mono">
            <LoaderIcon className="w-4 h-4" /> Loading...
          </div>
        )}

        {isError && !isSearch && (
          <p className="px-4 py-12 text-xs font-mono text-red-500/70 text-center">
            {error?.message || 'Failed to load'}
          </p>
        )}

        {!isLoading && allItems.length === 0 && (
          <p className="px-4 py-12 text-xs font-mono text-fg-2 text-center">
            {isSearch ? 'Enter a query to search' : 'Nothing here yet'}
          </p>
        )}

        {isSearch
          ? allItems.map((doc, i) => (
              <SearchResultRow
                key={doc.item?.id ?? i}
                doc={doc}
                selected={selectedItemId === (doc.item?.id ?? i)}
                onClick={() => setSelectedItemId(doc.item?.id ?? i)}
              />
            ))
          : allItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                onClick={() => setSelectedItemId(item.id)}
              />
            ))}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-xs font-mono text-fg-2 hover:text-fg flex items-center justify-center gap-2 transition-colors border-t border-border"
          >
            {isFetchingNextPage ? <LoaderIcon className="w-3 h-3" /> : <RefreshIcon className="w-3 h-3" />}
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  )
}
