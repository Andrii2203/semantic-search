import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '../stores/uiStore'
import { useItemStats, useSync, useSyncStatus } from '../hooks/useItems'
import {
  InboxIcon, StarIcon, CheckCircleIcon, SkipIcon,
  SearchIcon, SparkleIcon, RefreshIcon, ChevronRightIcon, StatusDot,
} from '../icons'

function NavItem({ icon: Icon, label, view, count, collapsed }) {
  const { currentView, setView } = useUIStore()
  const active = currentView === view

  return (
    <button
      onClick={() => setView(view)}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-left text-sm transition-colors ${
        active
          ? 'bg-accent/10 text-accent'
          : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 font-mono truncate">{label}</span>
          {count != null && count > 0 && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              active ? 'bg-accent/20 text-accent' : 'bg-surface-2 text-fg-2'
            }`}>
              {count > 999 ? '999+' : count}
            </span>
          )}
        </>
      )}
    </button>
  )
}

function Divider() {
  return <div className="my-2 border-t border-border" />
}

function useHealth() {
  const [health, setHealth] = React.useState(null)
  React.useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {})
  }, [])
  return health
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { data: stats } = useItemStats()
  const health = useHealth()
  const qc = useQueryClient()

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(null)   // { saved, duration } shown after finish
  const [elapsed, setElapsed] = useState(0)
  const syncMutation = useSync()
  const { data: syncStatus } = useSyncStatus(isSyncing)

  // Elapsed timer while syncing
  useEffect(() => {
    if (!isSyncing) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [isSyncing])

  // When polling detects cycle finished → show result + refresh items
  useEffect(() => {
    if (isSyncing && syncStatus && !syncStatus.isRunning) {
      setIsSyncing(false)
      setSyncDone(syncStatus.lastResult || { saved: 0, duration: 0 })
      qc.invalidateQueries({ queryKey: ['items'] })
      // Hide result after 8s
      setTimeout(() => setSyncDone(null), 8000)
    }
  }, [syncStatus, isSyncing, qc])

  function handleSync() {
    setSyncDone(null)
    syncMutation.mutate(undefined, {
      onSuccess: () => setIsSyncing(true),
    })
  }

  const allOk = health?.status === 'healthy'

  return (
    <div className={`shrink-0 border-r border-border flex flex-col py-3 bg-surface transition-all duration-200 ${
      sidebarCollapsed ? 'w-12' : 'w-52'
    }`}>
      {/* Toggle button */}
      <div className={`px-2 mb-2 flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-sm text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${sidebarCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        <NavItem icon={InboxIcon}       label="Inbox"   view="inbox"   count={stats?.new}      collapsed={sidebarCollapsed} />
        <NavItem icon={StarIcon}        label="Starred" view="starred" count={stats?.starred}  collapsed={sidebarCollapsed} />
        <NavItem icon={CheckCircleIcon} label="Done"    view="done"    count={stats?.approved} collapsed={sidebarCollapsed} />
        <NavItem icon={SkipIcon}        label="Skipped" view="skipped" count={stats?.skipped}  collapsed={sidebarCollapsed} />
        <Divider />
        <NavItem icon={SearchIcon}      label="Search"  view="search"                          collapsed={sidebarCollapsed} />
        <NavItem icon={SparkleIcon}     label="My Profile" view="profile"                       collapsed={sidebarCollapsed} />
      </nav>

      <div className="px-2 pb-1 space-y-1">
        <Divider />

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={isSyncing || syncMutation.isPending}
          title={isSyncing ? 'Syncing — fetching from sources…' : 'Sync — fetch latest from sources'}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40 ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
        >
          <RefreshIcon className={`w-4 h-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          {!sidebarCollapsed && (
            <span className="font-mono truncate">{isSyncing ? 'Syncing…' : 'Sync'}</span>
          )}
        </button>

        {/* Sync progress panel */}
        {isSyncing && syncStatus?.currentStep && !sidebarCollapsed && (
          <div className="mx-1 px-2 py-2 rounded-sm bg-surface-2 border border-border space-y-1">
            <p className="text-[10px] font-mono text-fg-2 leading-snug">{syncStatus.currentStep}</p>
            <p className="text-[10px] font-mono text-fg-2/60">{elapsed}s elapsed</p>
          </div>
        )}

        {/* Sync result */}
        {syncDone && !isSyncing && !sidebarCollapsed && (
          <div className="mx-1 px-2 py-2 rounded-sm bg-surface-2 border border-border">
            <p className="text-[10px] font-mono text-green-500">
              ✓ {syncDone.saved > 0 ? `${syncDone.saved} new post${syncDone.saved !== 1 ? 's' : ''}` : 'No new posts'} · {Math.round((syncDone.duration || 0) / 1000)}s
            </p>
          </div>
        )}

        {/* Health status */}
        <div className={`px-3 py-2 flex items-center gap-2 text-[10px] font-mono text-fg-2 ${
          sidebarCollapsed ? 'justify-center' : ''
        }`}>
          <StatusDot status={allOk ? 'ok' : health ? 'degraded' : 'unknown'} />
          {!sidebarCollapsed && (
            <span className="uppercase tracking-wider">
              {allOk ? 'Systems OK' : health ? 'Issue detected' : 'Checking...'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
