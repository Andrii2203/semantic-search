import { create } from 'zustand'

export const useSearchStore = create((set, get) => ({
  query: '',
  keywords: [],
  results: [],
  stats: null,
  profile: null,
  isSearching: false,
  error: null,

  mode: 'sequential',
  bm25Weight: 0.4,
  semanticWeight: 0.6,
  threshold: 0.65,
  maxBm25Results: 100,
  topN: 20,
  useReranker: false,

  chunkingStrategy: 'semantic',
  chunkSize: 200,
  overlap: 50,

  setQuery: (query) => set({ query }),

  setKeywords: (keywords) => set({ keywords }),
  addKeyword: (keyword) => {
    if (!keyword.trim()) return
    const { keywords } = get()
    if (!keywords.includes(keyword.trim())) {
      set({ keywords: [...keywords, keyword.trim()] })
    }
  },
  removeKeyword: (keyword) => {
    set({ keywords: get().keywords.filter((k) => k !== keyword) })
  },

  setMode: (mode) => set({ mode }),
  setWeights: (bm25, semantic) => set({ bm25Weight: bm25, semanticWeight: semantic }),
  setThreshold: (threshold) => set({ threshold }),
  setUseReranker: (useReranker) => set({ useReranker }),

  setChunkingStrategy: (strategy) => set({ chunkingStrategy: strategy }),
  setChunkSize: (size) => set({ chunkSize: size }),
  setOverlap: (overlap) => set({ overlap }),

  search: async () => {
    const state = get()
    if (!state.query.trim()) return

    set({ isSearching: true, error: null })

    try {
      const body = {
        query: state.query,
        mode: state.mode,
        threshold: state.threshold,
        maxBm25Results: state.maxBm25Results,
        topN: state.topN,
        useReranker: state.useReranker,
        weights: { bm25: state.bm25Weight, semantic: state.semanticWeight },
      }
      if (state.keywords.length > 0) {
        body.keywords = state.keywords
      }

      const res = await fetch(`/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Search failed')
      }

      const data = await res.json()
      set({
        results: data.results || [],
        stats: data.stats || null,
        profile: data.profile || null,
        keywords: data.profile?.keywords || state.keywords,
        isSearching: false,
      })
    } catch (err) {
      set({ error: err.message, isSearching: false })
    }
  },

  fetchChunkingConfig: async () => {
    try {
      const res = await fetch(`/api/config/chunking`)
      if (res.ok) {
        const data = await res.json()
        set({
          chunkingStrategy: data.strategy || 'semantic',
          chunkSize: data.chunk_size || 200,
          overlap: data.overlap || 50,
        })
      }
    } catch {
    }
  },

  saveChunkingConfig: async () => {
    const { chunkingStrategy, chunkSize, overlap } = get()
    try {
      await fetch(`/api/config/chunking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: chunkingStrategy, chunkSize, overlap }),
      })
    } catch {
    }
  },

  explainResult: async (itemId) => {
    const { query, profile } = get()
    try {
      const res = await fetch(`/api/search/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          query,
          profileId: profile?.id,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        return data.explanation
      }
    } catch {
      return 'Explanation unavailable.'
    }
  },

  clearResults: () => set({ results: [], stats: null, error: null }),
}))
