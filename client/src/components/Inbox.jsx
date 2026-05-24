import { useEffect, useState } from 'react'

export function Inbox() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => {
    fetch('/api/items?collectionId=internet')
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items || [])
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch items', err)
        setItems([])
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="text-white/50 font-mono text-sm p-4">Loading inbox...</div>
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 flex flex-col gap-4">
      <h2 className="text-xl font-mono text-white/80 uppercase tracking-widest px-4 border-b border-white/10 pb-2">
        Incoming Items ({items.length})
      </h2>
      
      <div className="flex gap-4">
        {/* Item List */}
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[60vh] p-2 pr-4 custom-scrollbar">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className={`p-4 rounded-sm border cursor-pointer transition-colors ${
                selectedItem?.id === item.id 
                  ? 'border-ubuntu-orange bg-ubuntu-orange/10' 
                  : 'border-white/5 bg-black/20 hover:border-white/20'
              }`}
            >
              <div className="text-sm text-white/90 truncate mb-1">
                {item.metadata?.title || 'Untitled'}
              </div>
              <div className="text-xs text-white/40 truncate">
                {item.content.substring(0, 100)}...
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-white/30 text-sm font-mono text-center py-8">
              Inbox is empty. Run a scheduler cycle to fetch items.
            </div>
          )}
        </div>

        {/* Item Detail */}
        {selectedItem && (
          <div className="flex-1 bg-black/40 border border-white/10 p-6 rounded-sm overflow-y-auto max-h-[60vh] custom-scrollbar text-white/80 font-mono text-sm">
            <div className="mb-4 flex justify-between items-start">
              <h3 className="text-lg text-ubuntu-orange">{selectedItem.metadata?.title || 'Detail'}</h3>
              <button 
                onClick={() => setSelectedItem(null)}
                className="text-white/30 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-white/40">Source:</span> {selectedItem.source}
              </div>
              {selectedItem.metadata?.url && (
                <div>
                  <a href={selectedItem.metadata.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    View Original
                  </a>
                </div>
              )}
              <div className="bg-black/50 p-4 rounded-sm whitespace-pre-wrap border border-white/5 text-xs">
                {selectedItem.content}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
