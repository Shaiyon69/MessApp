/** Chooses create/join server actions without owning server data or permissions. */
import { useRef, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import { trackSpotlight } from '../../lib/uiEffects'

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
    <div data-ui-overlay-owner="ServerActionPopout:mobile-backdrop" className="premium-backdrop fixed inset-0 z-[150] flex flex-col justify-end md:justify-center items-center md:items-start md:static md:bg-transparent md:backdrop-blur-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      
      <div ref={popoutRef} onMouseMove={trackSpotlight} className="premium-modal premium-card w-full max-w-sm md:absolute md:left-24 md:bottom-6 md:w-[280px] rounded-[32px] md:rounded-2xl animate-slide-up md:animate-slide-right flex flex-col p-8 md:p-6 text-center items-center pb-12 md:pb-6">
        <button onClick={onClose} className="absolute top-4 md:top-3 right-4 md:right-3 text-gray-500 hover:text-white transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-full md:rounded-md p-2 md:p-1 bg-white/5 md:bg-transparent">
          <X size={18} />
        </button>
        
        <div className="w-16 h-16 md:w-12 md:h-12 bg-[var(--accent-glow)] text-indigo-300 rounded-full flex items-center justify-center mb-6 md:mb-4 mt-4 md:mt-2 border border-[var(--border-accent)] shadow-[0_0_32px_rgba(94,106,210,0.22)]">
          <Loader2 className="animate-spin" size={28} />
        </div>
        
        <h3 className="gradient-text text-xl font-semibold mb-2 tracking-tight">
          {action === 'create' ? 'Creating Server...' : 'Joining Server...'}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-2 md:mb-0">
          Hold tight, we are syncing things up with the database.
        </p>
      </div>

    </div>
  )
}
