import { useEffect } from 'react'

export default function DirectMessages({ onClose }) {
  useEffect(() => {
    return () => {
      // cleanup if needed
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold tracking-tight">Direct Messages</h3>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer hover:bg-surface-container-high p-2 rounded-full">
            <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
          </button>
        </div>
        <p className="text-sm text-outline">This modal is not currently implemented.</p>
      </div>
    </div>
  )
}

