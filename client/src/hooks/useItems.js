import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '../stores/uiStore'

const VIEW_STATUS = {
  inbox: 'new',
  starred: 'starred',
  done: 'approved',
  skipped: 'skipped',
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts)
  if (res.status === 401) {
    useUIStore.getState().setShowLockScreen(true)
    throw new Error('UNAUTHORIZED')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Items list (infinite / cursor-based) ──────────────────────

export function useItemsInfinite(view) {
  const status = VIEW_STATUS[view]
  return useInfiniteQuery({
    queryKey: ['items', view],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ collectionId: 'internet', limit: '50' })
      if (status) params.set('status', status)
      if (pageParam) params.set('cursor', pageParam)
      return apiFetch(`/api/items?${params}`)
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    enabled: view !== 'search',
    staleTime: 30_000,
  })
}

// ── Sidebar counts ────────────────────────────────────────────

export function useItemStats() {
  return useQuery({
    queryKey: ['items', 'stats'],
    queryFn: () => apiFetch('/api/items/stats'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

// ── Auth status ───────────────────────────────────────────────

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/auth/status')
      return res.json()
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })
}

// ── Status mutations ──────────────────────────────────────────

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }) =>
      apiFetch(`/api/items/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// ── Generate comment ──────────────────────────────────────────

export function useGenerateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}/generate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// ── Explain match ─────────────────────────────────────────────

export function useExplain() {
  return useMutation({
    mutationFn: ({ itemId, query }) =>
      apiFetch('/api/search/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, query }),
      }).then((d) => d.explanation),
  })
}

// ── Search ────────────────────────────────────────────────────

export function useSearch() {
  return useMutation({
    mutationFn: (body) =>
      apiFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  })
}

// ── Delete item ───────────────────────────────────────────────

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// ── Manual sync ───────────────────────────────────────────────

export function useSync() {
  return useMutation({
    mutationFn: () => apiFetch('/api/sync', { method: 'POST' }),
  })
}

export function useSyncStatus(enabled) {
  return useQuery({
    queryKey: ['sync', 'status'],
    queryFn: () => apiFetch('/api/sync/status'),
    enabled,
    refetchInterval: enabled ? 2000 : false,
    staleTime: 0,
  })
}

// ── Save profile ──────────────────────────────────────────────

export function useSaveProfile() {
  return useMutation({
    mutationFn: (body) =>
      apiFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, saveProfile: true }),
      }),
  })
}
