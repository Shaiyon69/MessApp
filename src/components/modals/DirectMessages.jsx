import { useEffect } from 'react'

export default function DirectMessages({ onClose }) {
  useEffect(() => { return () => {} }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-2xl p-8 shadow-2xl relative w-full max-w-md max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold font-headline text-white tracking-tight">Direct Messages</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
          </button>
        </div>
        <p className="text-sm text-slate-400">Direct messages are managed directly from the left sidebar hub in this version.</p>
      </div>
    </div>
  )
}
