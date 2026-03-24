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
    // Backdrop for mobile screens, transparent on desktop so it looks like a popout
    <div className="fixed inset-0 z-[150] flex flex-col justify-end md:justify-center items-center md:items-start md:static bg-black/60 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none p-4 md:p-0">
      
      <div 
        ref={popoutRef} 
        className="w-full max-w-sm md:absolute md:left-24 md:bottom-6 md:w-[280px] bg-[#111214] rounded-[32px] md:rounded-2xl border border-[#23252a] shadow-2xl overflow-hidden animate-slide-up md:animate-slide-right flex flex-col p-8 md:p-6 text-center items-center pb-12 md:pb-6"
      >
        <button onClick={onClose} className="absolute top-4 md:top-3 right-4 md:right-3 text-gray-500 hover:text-white transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full md:rounded-md p-2 md:p-1 bg-white/5 md:bg-transparent">
          <X size={18} />
        </button>
        
        <div className="w-16 h-16 md:w-12 md:h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-6 md:mb-4 mt-4 md:mt-2 border border-indigo-500/20">
          <Loader2 className="animate-spin" size={28} />
        </div>
        
        <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
          {action === 'create' ? 'Creating Server...' : 'Joining Server...'}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-2 md:mb-0">
          Hold tight, we are syncing things up with the database.
        </p>
      </div>

    </div>
  )
}
