import { useRef, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'

export default function ServerActionPopout({ onClose, action }) {
  const popoutRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoutRef.current && !popoutRef.current.contains(event.target)) onClose()
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <div ref={popoutRef} className="absolute left-20 md:left-24 bottom-6 w-[280px] bg-[#111214] rounded-2xl border border-[#23252a] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden z-50 animate-slide-right flex flex-col p-6 text-center items-center">
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md p-1">
        <X size={16} />
      </button>
      
      <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-4 mt-2">
        <Loader2 className="animate-spin" size={24} />
      </div>
      
      <h3 className="text-white font-bold text-lg mb-2">
        {action === 'create' ? 'Create Server' : 'Join Server'}
      </h3>
      
      <p className="text-gray-400 text-xs leading-relaxed">
        Server communities are currently under active development. Check back in a future update!
      </p>
    </div>
  )
}
