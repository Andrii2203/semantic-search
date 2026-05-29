import { Component } from 'react'
import { AlertIcon, RefreshIcon } from '../icons'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        componentStack: info.componentStack,
      }),
    }).catch(() => {})
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 bg-bg text-fg-2 font-mono">
        <AlertIcon className="w-8 h-8 text-red-500/70" />
        <div className="text-center space-y-1.5">
          <p className="text-fg text-sm uppercase tracking-widest">Something went wrong</p>
          <p className="text-xs text-fg-2 max-w-xs break-words">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
        </div>
        <button
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
          className="flex items-center gap-2 px-4 py-2 text-xs border border-border rounded-sm hover:border-accent/40 hover:text-accent transition-colors"
        >
          <RefreshIcon className="w-3 h-3" />
          Reload
        </button>
      </div>
    )
  }
}
