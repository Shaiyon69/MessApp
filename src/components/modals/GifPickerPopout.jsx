/** Loads public GIF search results and returns the selected remote media URL. */
import React, { useState, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'

export default function GifPickerPopout({ onSelectGif, onClose }) {
  const [gifs, setGifs] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  
  const fetchGifs = async (searchTerm) => {
     setLoading(true)
     try {
        const apiKey = import.meta.env.VITE_GIPHY_API_KEY
        if (!apiKey) {
          setGifs([])
          setLoading(false)
          return
        }
        const endpoint = searchTerm 
           ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(searchTerm)}&limit=20`
           : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20`
        const res = await fetch(endpoint)
        const { data } = await res.json()
        setGifs(data || [])
     } catch (e) {
        console.error("Giphy fetch failed", e)
     } finally {
        setLoading(false)
     }
  }

  useEffect(() => {
     const delayDebounceFn = setTimeout(() => { fetchGifs(query) }, 500)
     return () => clearTimeout(delayDebounceFn)
  }, [query])

  return (
    <div className="premium-menu absolute bottom-full left-0 md:left-12 mb-2 w-[calc(100vw-32px)] sm:w-80 rounded-2xl p-3 z-50 animate-fade-in origin-bottom-left" onClick={e => e.stopPropagation()}>
       <div className="flex justify-between items-center mb-3">
         <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest ml-1">Giphy Search</span>
         <button onClick={onClose} type="button" className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-md hover:bg-[var(--bg-element)] transition-colors cursor-pointer"><X size={14}/></button>
       </div>
       <input 
         type="text" placeholder="Search for a GIF..." value={query} onChange={e => setQuery(e.target.value)}
         className="premium-input w-full rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] mb-3 outline-none transition-all placeholder:text-gray-600"
         autoFocus
       />
      <div className="h-64 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2 -mr-1 pr-1">
         {!import.meta.env.VITE_GIPHY_API_KEY ? (
            <div className="col-span-2 text-center text-sm text-gray-500 py-8 px-4">Add VITE_GIPHY_API_KEY to your .env file to enable GIF search.</div>
         ) : loading ? (
            <div className="col-span-2 flex justify-center py-8"><Loader2 className="animate-spin text-[var(--theme-base)]" size={24} /></div>
         ) : gifs.length === 0 ? (
            <div className="col-span-2 text-center text-sm text-gray-500 py-8">No GIFs found.</div>
         ) : (
            gifs.map(gif => (
              <button key={gif.id} type="button" onClick={() => onSelectGif(gif.images.downsized.url)} className="rounded-xl overflow-hidden border-2 border-transparent hover:border-[var(--theme-base)] transition-all cursor-pointer aspect-video relative group bg-[var(--bg-base)]">
                <img src={gif.images.fixed_height_small.url} alt={gif.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              </button>
            ))
         )}
       </div>
    </div>
  )
}
