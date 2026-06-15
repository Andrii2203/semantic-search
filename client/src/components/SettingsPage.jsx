import { useState } from 'react'
import { useSettings, useUpdateSetting, useResetSettings } from '../hooks/useItems'
import { GearIcon, LoaderIcon } from '../icons'

function Row({ label, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border">
      <div className="min-w-0">
        <div className="text-xs font-mono text-fg">{label}</div>
        {hint && <div className="text-[10px] font-mono text-fg-2/70 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full transition-colors relative ${value ? 'bg-accent' : 'bg-surface-2 border border-border'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-bg transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-accent/80 mb-1">{title}</h3>
      <div>{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const update = useUpdateSetting()
  const reset = useResetSettings()
  const [apiKeyInput, setApiKeyInput] = useState('')

  const s = settings || {}
  const set = (key, value) => update.mutate({ key, value })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-2 text-xs font-mono gap-2">
        <LoaderIcon className="w-4 h-4" /> Loading settings…
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <GearIcon className="w-4 h-4 text-accent" />
          <h2 className="font-mono text-sm text-fg uppercase tracking-widest">Settings</h2>
        </div>

        <Section title="Search">
          <Row label="Similarity threshold" hint={`${(s.searchThreshold ?? 0.35).toFixed(2)} — lower = more results`}>
            <input
              type="range" min="0" max="1" step="0.05"
              defaultValue={s.searchThreshold ?? 0.35}
              onMouseUp={(e) => set('searchThreshold', Number(e.target.value))}
              onTouchEnd={(e) => set('searchThreshold', Number(e.target.value))}
              className="w-32 accent-accent"
            />
          </Row>
          <Row label="Search mode">
            <select
              value={s.searchMode ?? 'sequential'}
              onChange={(e) => set('searchMode', e.target.value)}
              className="bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg px-2 py-1"
            >
              <option value="sequential">sequential</option>
              <option value="parallel">parallel</option>
            </select>
          </Row>
          <Row label="Top N results">
            <input
              type="number" min="1" max="100"
              defaultValue={s.topN ?? 20}
              onBlur={(e) => set('topN', Number(e.target.value))}
              className="w-20 bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg px-2 py-1"
            />
          </Row>
        </Section>

        <Section title="Scheduler">
          <Row label="Cron enabled" hint="Automatic fetch cycles">
            <Toggle value={s.cronEnabled ?? true} onChange={(v) => set('cronEnabled', v)} />
          </Row>
          <Row label="Cron schedule" hint="e.g. */30 * * * *">
            <input
              type="text"
              defaultValue={s.cronSchedule ?? '*/30 * * * *'}
              onBlur={(e) => set('cronSchedule', e.target.value)}
              className="w-32 bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg px-2 py-1"
            />
          </Row>
        </Section>

        <Section title="AI">
          <Row label="Groq API key" hint={s.groqApiKey ? 'Configured (set-only)' : 'Not set'}>
            <div className="flex gap-1">
              <input
                type="password"
                placeholder="gsk_…"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-32 bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg px-2 py-1"
              />
              <button
                onClick={() => { if (apiKeyInput) { set('groqApiKey', apiKeyInput); setApiKeyInput('') } }}
                disabled={!apiKeyInput}
                className="px-2 py-1 rounded-sm text-[10px] font-mono bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
              >
                Set
              </button>
            </div>
          </Row>
          <Row label="Groq model">
            <input
              type="text"
              defaultValue={s.groqModel ?? ''}
              placeholder="llama-3.1-70b-versatile"
              onBlur={(e) => set('groqModel', e.target.value)}
              className="w-44 bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg px-2 py-1"
            />
          </Row>
          <Row label="HyDE query expansion" hint="Paid · Groq per search">
            <Toggle value={s.useHyde ?? false} onChange={(v) => set('useHyde', v)} />
          </Row>
        </Section>

        <Section title="Chunking">
          <Row label="Strategy">
            <select
              value={s.chunkingStrategy ?? 'semantic'}
              onChange={(e) => set('chunkingStrategy', e.target.value)}
              className="bg-surface-2 border border-border rounded-sm text-xs font-mono text-fg px-2 py-1"
            >
              <option value="fixed">fixed</option>
              <option value="semantic">semantic</option>
              <option value="hierarchical">hierarchical</option>
            </select>
          </Row>
        </Section>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="px-4 py-2 rounded-sm text-xs font-mono text-fg-2 hover:text-fg hover:bg-surface-2 disabled:opacity-40 transition-colors"
          >
            Reset to defaults
          </button>
          {update.isError && <span className="text-[10px] font-mono text-red-500/80">{update.error.message}</span>}
        </div>
      </div>
    </div>
  )
}
