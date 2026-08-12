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

export function useItemStats() {
  return useQuery({
    queryKey: ['items', 'stats'],
    queryFn: () => apiFetch('/api/items/stats'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

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

export function useGenerateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}/generate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

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

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

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

export function useActiveProfile() {
  return useQuery({
    queryKey: ['profile', 'active'],
    queryFn: () => apiFetch('/api/profiles/active').then((d) => d.profile),
    staleTime: 30_000,
  })
}

export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rawInput) =>
      apiFetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/api/settings').then((d) => d.settings),
    staleTime: 30_000,
  })
}

export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) =>
      apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function useResetSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/api/settings/reset', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

function newBatchId() {
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function uploadOneFile(file, batchId) {
  const fd = new FormData()
  fd.append('files', file)
  fd.append('batchId', batchId)

  const res = await fetch('/api/upload', { method: 'POST', body: fd })
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

export function useUploadFiles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ files, onProgress }) => {
      const batchId = newBatchId()
      const items = []
      const errors = []

      for (const file of files) {
        const res = await uploadOneFile(file, batchId)
        items.push(...(res.items || []))
        errors.push(...(res.errors || []))
        onProgress?.(items.length + errors.length, files.length)
      }

      return { batchId, processed: items.length, failed: errors.length, items, errors }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useHealthFull() {
  return useQuery({
    queryKey: ['health', 'full'],
    queryFn: () => apiFetch('/api/health/full'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => apiFetch('/api/sources').then((d) => d.sources),
    staleTime: 30_000,
  })
}

export function useAddSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url) =>
      apiFetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, label: url }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}

export function useToggleSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }) =>
      apiFetch(`/api/sources/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}

export function useDeleteSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/sources/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}
