import { useRef, useState } from 'react'
import { useUploadFiles, useSearch } from '../hooks/useItems'
import { FileIcon, LoaderIcon, SparkleIcon } from '../icons'

function ResultRow({ doc, rank }) {
  const title = doc.item?.metadata?.title || doc.item?.metadata?.fileName || doc.item?.content?.slice(0, 60) || 'Untitled'
  const score = doc.rerankScore != null
    ? `${Math.round(doc.rerankScore * 100)}%`
    : doc.bestScore != null ? doc.bestScore.toFixed(3) : null
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
      <span className="text-[11px] text-fg-2 w-6 shrink-0">{rank}.</span>
      <span className="flex-1 text-sm text-fg truncate">{title}</span>
      {score && <span className="text-[11px] text-green-500 shrink-0">{score}</span>}
    </div>
  )
}

export function FilesMode() {
  const upload = useUploadFiles()
  const search = useSearch()
  const fileRef = useRef(null)

  const [query, setQuery] = useState('')
  const [wholeLibrary, setWholeLibrary] = useState(true)
  const [lastBatchId, setLastBatchId] = useState(null)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  async function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setError(null)
    try {
      const res = await upload.mutateAsync(files)
      setLastBatchId(res.batchId)
    } catch (err) {
      setError(err.message)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function runMatch(useAI) {
    if (!query.trim()) return
    setError(null)
    try {
      const res = await search.mutateAsync({
        query: query.trim(),
        collectionId: 'files',
        batchId: wholeLibrary ? undefined : lastBatchId,
        topN: useAI ? 20 : 50,
        useReranker: useAI,
        // Measured optimum for candidate matching (scripts/eval-match.js):
        // route default threshold 0.65 over-filters MiniLM scores, and MMR
        // diversity (0.5) pushes same-role candidates down. thr 0.3 + mmr 1.0
        // lifts nDCG@10 0.72 → 0.98. (Diversity stays ON for internet search.)
        threshold: 0.3,
        mmrLambda: 1.0,
      })
      setResults(res.results || [])
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <FileIcon className="w-4 h-4 text-accent" />
          <h2 className="text-sm text-fg font-semibold tracking-wide">Files</h2>
        </div>

        <p className="text-xs text-fg-2 leading-relaxed">
          Your private document library. Add PDFs (resumes, books, research), then describe what
          you're looking for and Match — the engine searches your whole library semantically.
        </p>

        {/* Add documents (optional) */}
        <div className="border border-border rounded-md p-4 space-y-2">
          <div className="text-xs text-fg-2 uppercase tracking-wider">Add documents (optional)</div>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="application/pdf" multiple onChange={handleUpload} className="hidden" id="file-input" />
            <label htmlFor="file-input" className="px-3 py-1.5 rounded-sm text-xs bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer transition-colors">
              {upload.isPending ? 'Uploading…' : 'Choose PDFs'}
            </label>
            {upload.data && (
              <span className="text-[11px] text-fg-2">
                +{upload.data.processed} added{upload.data.failed ? `, ${upload.data.failed} failed` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Match */}
        <div className="space-y-3">
          <label className="text-xs text-fg-2 uppercase tracking-wider">What are you looking for?</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. a senior Rust engineer with async experience, or a paper on diffusion models"
            rows={3}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-sm text-sm text-fg placeholder-fg-2/50 resize-none focus:outline-none focus:border-accent/50 transition-colors"
          />

          <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer">
            <input type="checkbox" checked={wholeLibrary} onChange={(e) => setWholeLibrary(e.target.checked)} className="accent-accent" />
            Search my whole library
            {!wholeLibrary && lastBatchId && <span className="text-fg-2/60">(otherwise: only the last upload)</span>}
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={() => runMatch(false)}
              disabled={!query.trim() || search.isPending}
              className="px-4 py-2 rounded-sm text-sm bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {search.isPending ? <LoaderIcon className="w-3.5 h-3.5" /> : null}
              Match — top 50
            </button>
            {results.length > 0 && (
              <button
                onClick={() => runMatch(true)}
                disabled={search.isPending}
                className="px-3 py-2 rounded-sm text-xs text-fg-2 hover:text-fg hover:bg-surface-2 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                title="Uses your AI key to re-rank to the best 20"
              >
                <SparkleIcon className="w-3.5 h-3.5" /> AI re-rank → top 20
              </button>
            )}
            {error && <span className="text-[11px] text-red-500/80">{error}</span>}
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="border border-border rounded-md overflow-hidden">
            {results.map((doc, i) => (
              <ResultRow key={doc.parentId ?? i} doc={doc} rank={i + 1} />
            ))}
          </div>
        )}
        {results.length === 0 && search.isSuccess && (
          <p className="text-xs text-fg-2/60">No matches. Add documents or broaden your query.</p>
        )}
      </div>
    </div>
  )
}
