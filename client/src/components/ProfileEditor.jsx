import { useState, useEffect } from 'react'
import { useActiveProfile, useSaveProfile } from '../hooks/useItems'
import { SparkleIcon, LoaderIcon } from '../icons'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

export function ProfileEditor() {
  const { data: profile, isLoading } = useActiveProfile()
  const saveMutation = useSaveProfile()

  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile?.rawInput) setText(profile.rawInput)
  }, [profile?.rawInput])

  const tooShort = text.trim().length < 5

  async function handleSave() {
    if (tooShort) return
    setSaved(false)
    try {
      await saveMutation.mutateAsync(text.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
    } catch {
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <SparkleIcon className="w-4 h-4 text-accent" />
          <h2 className="font-mono text-sm text-fg uppercase tracking-widest">My Profile</h2>
        </div>

        <p className="text-xs font-mono text-fg-2 leading-relaxed">
          Describe in plain words what you want the engine to bring you. The scheduler
          matches new content against this every cycle, and your stars/approvals refine it over time.
        </p>

        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-fg-2">
            What interests you
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Rust, async runtimes, systems design, WebAssembly. Not interested in: PHP, frontend frameworks."
            rows={6}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-sm text-xs text-fg placeholder-fg-2/50 font-mono resize-none focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={tooShort || saveMutation.isPending}
            className="px-4 py-2 rounded-sm text-xs font-mono bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {saveMutation.isPending ? <LoaderIcon className="w-3.5 h-3.5" /> : <SparkleIcon className="w-3.5 h-3.5" />}
            {saveMutation.isPending ? 'Saving…' : 'Save Profile'}
          </button>
          <button
            onClick={() => setText('')}
            disabled={saveMutation.isPending}
            className="px-4 py-2 rounded-sm text-xs font-mono text-fg-2 hover:text-fg hover:bg-surface-2 disabled:opacity-40 transition-colors"
          >
            Clear
          </button>
          {saved && <span className="text-[10px] font-mono text-green-500">✓ Saved</span>}
          {saveMutation.isError && (
            <span className="text-[10px] font-mono text-red-500/80">{saveMutation.error.message}</span>
          )}
        </div>

        <div className="border-t border-border pt-6 space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-fg-2">
            Extracted keywords
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs font-mono text-fg-2">
              <LoaderIcon className="w-3.5 h-3.5" /> Loading…
            </div>
          ) : profile?.keywords?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.keywords.map((kw, i) => (
                <span
                  key={`${kw}-${i}`}
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-surface-2 text-fg-2 border border-border"
                >
                  {kw}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs font-mono text-fg-2/60">No profile saved yet.</p>
          )}
          {profile?.updatedAt && (
            <p className="text-[10px] font-mono text-fg-2/60">Last saved: {formatDate(profile.updatedAt)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
