import { create } from 'zustand'

export const useUIStore = create((set) => ({
  sidebarCollapsed: true,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  currentView: 'inbox',
  setView: (view) => set({ currentView: view, selectedItemId: null }),

  selectedItemId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),

  isAuthenticated: false,
  passwordRequired: false,
  showLockScreen: false,
  setAuth: (isAuthenticated, passwordRequired) => set({ isAuthenticated, passwordRequired }),
  setShowLockScreen: (show) => set({ showLockScreen: show }),

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

  generatedComment: null,
  setGeneratedComment: (comment) => set({ generatedComment: comment }),
  explanation: null,
  setExplanation: (text) => set({ explanation: text }),
}))
