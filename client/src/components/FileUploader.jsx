import { useCallback, useState } from 'react'
import { Upload, FileText, X } from 'lucide-react'

const API_BASE = 'http://localhost:3000'

export function FileUploader() {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
    )
    setFiles((prev) => [...prev, ...dropped])
  }, [])

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files)
    setFiles((prev) => [...prev, ...selected])
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setResult(null)

    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      setResult(data)
      if (data.success) setFiles([])
    } catch (err) {
      setResult({ success: false, error: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono">
        Data Input
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        className={`relative border border-dashed rounded-sm p-6 text-center transition-all duration-200 cursor-pointer
          ${dragOver
            ? 'border-ubuntu-orange bg-ubuntu-orange/5'
            : 'border-foreground/10 hover:border-foreground/20'
          }`}
        onClick={() => document.getElementById('file-input').click()}
      >
        <Upload size={20} className="mx-auto mb-2 text-foreground/20" />
        <p className="text-[11px] font-mono text-foreground/25">
          Drop PDF files here or click to browse
        </p>
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 bg-foreground/[0.03] rounded-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={12} className="text-foreground/20 shrink-0" />
                <span className="text-[11px] font-mono text-foreground/40 truncate">{f.name}</span>
              </div>
              <button onClick={() => removeFile(i)} className="text-foreground/15 hover:text-red-400 transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full mt-2 py-2 bg-ubuntu-orange/10 border border-ubuntu-orange/20 text-ubuntu-orange
              text-[11px] font-mono uppercase tracking-widest rounded-sm
              hover:bg-ubuntu-orange/20 transition-all disabled:opacity-50"
          >
            {uploading ? `Uploading ${files.length} file(s)...` : `Upload ${files.length} file(s)`}
          </button>
        </div>
      )}

      {/* Result feedback */}
      {result && (
        <div className={`p-2 rounded-sm text-[10px] font-mono ${
          result.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {result.success
            ? `✓ ${result.processed} processed, ${result.failed || 0} failed`
            : `✗ ${result.error || 'Upload failed'}`
          }
        </div>
      )}
    </div>
  )
}
