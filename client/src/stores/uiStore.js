import { create } from 'zustand'

export const useUIStore = create((set) => ({
  // ── Layout ────────────────────────────────────────────────────
  sidebarCollapsed: true,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // ── Navigation ────────────────────────────────────────────────
  // 'inbox' | 'starred' | 'done' | 'skipped' | 'search'
  currentView: 'inbox',
  setView: (view) => set({ currentView: view, selectedItemId: null }),

  // ── Item selection ────────────────────────────────────────────
  selectedItemId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),

  // ── Auth ──────────────────────────────────────────────────────
  isAuthenticated: false,
  passwordRequired: false,
  showLockScreen: false,
  setAuth: (isAuthenticated, passwordRequired) => set({ isAuthenticated, passwordRequired }),
  setShowLockScreen: (show) => set({ showLockScreen: show }),

  // ── Search view state ─────────────────────────────────────────
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  searchStats: null,
  setSearchStats: (stats) => set({ searchStats: stats }),
  isSearching: false,
  setIsSearching: (v) => set({ isSearching: v }),
  searchError: null,
  setSearchError: (err) => set({ searchError: err }),

  // ── Reading pane ──────────────────────────────────────────────
  generatedComment: null,
  setGeneratedComment: (comment) => set({ generatedComment: comment }),
  explanation: null,
  setExplanation: (text) => set({ explanation: text }),
}))
