import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/Sidebar'
import { ItemList } from './components/ItemList'
import { ProfileEditor } from './components/ProfileEditor'
import { SettingsPage } from './components/SettingsPage'
import { SystemHealth } from './components/SystemHealth'
import { AlertBanner } from './components/AlertBanner'
import { ReadingPane } from './components/ReadingPane'
import { LockScreen } from './components/LockScreen'
import { HealthFooter } from './components/HealthFooter'
import { DebugLogger } from './components/DebugLogger'
import { SunIcon, MoonIcon } from './icons'
import { useUIStore } from './stores/uiStore'
import { useAuthStatus } from './hooks/useItems'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className="p-1.5 rounded-sm text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors"
    >
      {theme === 'dark' ? <SunIcon className="w-3.5 h-3.5" /> : <MoonIcon className="w-3.5 h-3.5" />}
    </button>
  )
}

function AuthGuard({ children }) {
  const { data, isLoading } = useAuthStatus()
  const { setAuth, showLockScreen, setShowLockScreen } = useUIStore()

  useEffect(() => {
    if (data) {
      setAuth(data.authenticated, true)
      if (!data.authenticated) {
        setShowLockScreen(true)
      }
    }
  }, [data, setAuth, setShowLockScreen])

  if (isLoading) return null

  return (
    <>
      {children}
      {showLockScreen && (
        <LockScreen
          onSuccess={() => {
            setAuth(true, true)
            setShowLockScreen(false)
            queryClient.invalidateQueries()
          }}
        />
      )}
    </>
  )
}

function GmailLayout() {
  const { selectedItemId, currentView } = useUIStore()

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      {/* Top bar */}
      <header className="h-11 shrink-0 border-b border-border flex items-center px-4 gap-3 bg-surface">
        <span className="font-mono text-xs text-accent uppercase tracking-widest flex-1">
          Universal Matching Engine
        </span>
        <ThemeToggle />
      </header>

      <AlertBanner />

      {/* Body: STATE A — no item selected → list fills width
               STATE B — item selected   → reading pane fills width */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {currentView === 'settings' ? (
          <ErrorBoundary>
            <SettingsPage />
          </ErrorBoundary>
        ) : currentView === 'system' ? (
          <ErrorBoundary>
            <SystemHealth />
          </ErrorBoundary>
        ) : currentView === 'profile' ? (
          <ErrorBoundary>
            <ProfileEditor />
          </ErrorBoundary>
        ) : selectedItemId ? (
          <ErrorBoundary>
            <ReadingPane />
          </ErrorBoundary>
        ) : (
          <ItemList />
        )}
      </div>

      <HealthFooter />
      <DebugLogger />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ErrorBoundary>
          <AuthGuard>
            <GmailLayout />
          </AuthGuard>
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
