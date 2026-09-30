/** Loads GIF search results and queues the selected GIF as an attachment. */
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { safeHttpUrl } from '../../lib/security'

const KLIPY_API_KEY = import.meta.env.VITE_KLIPY_API_KEY
const CUSTOMER_ID_KEY = 'messapp_klipy_customer_id'

// KLIPY requires a per-user customer_id. A random per-device id satisfies it
// without handing the account id to a third party.
const klipyCustomerId = () => {
  try {
    let id = localStorage.getItem(CUSTOMER_ID_KEY)
    if (!id) localStorage.setItem(CUSTOMER_ID_KEY, id = crypto.randomUUID())
    return id
  } catch (_error) {
    return 'anonymous'
  }
}

const RECENT_GIFS_KEY = 'messapp_recent_gifs'

const readRecentGifs = () => {
  try {
    const values = JSON.parse(localStorage.getItem(RECENT_GIFS_KEY) || '[]')
    return Array.isArray(values) ? values.filter(value => safeHttpUrl(value)).slice(0, 12) : []
  } catch (_error) {
    return []
  }
}

const rememberGif = url => {
  try {
    localStorage.setItem(RECENT_GIFS_KEY, JSON.stringify([url, ...readRecentGifs().filter(value => value !== url)].slice(0, 12)))
  } catch (_error) {}
}

export default function GifPickerPopout({ onSelectGif, onClose }) {
  const [gifs, setGifs] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recentGifs, setRecentGifs] = useState(readRecentGifs)
  const apiKey = KLIPY_API_KEY

  useEffect(() => {
    if (!apiKey) {
      setGifs([])
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ per_page: '24', customer_id: klipyCustomerId(), content_filter: 'medium' })
        if (query.trim()) params.set('q', query.trim())
        const endpoint = `https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs/${query.trim() ? 'search' : 'trending'}?${params}`
        const response = await fetch(endpoint, { signal: controller.signal })
        if (!response.ok) throw new Error('GIF search is temporarily unavailable.')
        const payload = await response.json()
        setGifs(Array.isArray(payload.data?.data) ? payload.data.data : [])
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') setError(fetchError.message || 'GIF search failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, query ? 350 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [apiKey, query])

  const chooseGif = url => {
    const safeUrl = safeHttpUrl(url)
    if (!safeUrl) {
      setError('That GIF link is not valid.')
      return
    }
    rememberGif(safeUrl)
    setRecentGifs(readRecentGifs())
    onSelectGif(safeUrl)
  }

  return (
    <div className="premium-menu fixed inset-x-2 bottom-[5.5rem] z-[120] mx-auto w-auto max-w-md rounded-[1.6rem] p-3 shadow-2xl sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 sm:w-96" onClick={event => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="type-label font-black text-[var(--text-main)]">Send a GIF</p>
          <p className="type-label text-gray-500">{apiKey ? 'Search KLIPY' : 'Search needs VITE_KLIPY_API_KEY'}</p>
        </div>
        <button onClick={onClose} type="button" className="premium-icon-button grid h-9 w-9 place-items-center rounded-full" aria-label="Close GIF picker"><X size={15} /></button>
      </div>

      {apiKey && (
        <label className="premium-input mb-2 flex h-11 items-center gap-2 rounded-xl px-3">
          <Search size={16} className="text-gray-500" />
          <input type="search" placeholder="Search GIFs" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent type-body text-[var(--text-main)] outline-none placeholder:text-gray-600" autoFocus />
        </label>
      )}

      {error && <p className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 type-label font-semibold text-red-300">{error}</p>}

      <div className="h-72 overflow-y-auto pr-1 custom-scrollbar">
        {loading ? (
          <div className="columns-2 gap-2" role="status" aria-label="Loading GIFs">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={`gif-skeleton-${index}`} className="skeleton mb-2 rounded-xl" style={{ height: `${72 + (index % 3) * 24}px` }} aria-hidden="true" />
            ))}
          </div>
        ) : apiKey && gifs.length ? (
          <div className="columns-2 gap-2">
            {gifs.map(gif => {
              const previewUrl = safeHttpUrl(gif.file?.sm?.gif?.url || gif.file?.md?.gif?.url)
              const sendUrl = safeHttpUrl(gif.file?.md?.gif?.url || gif.file?.hd?.gif?.url)
              if (!previewUrl || !sendUrl) return null
              return (
                <button key={gif.id} type="button" onClick={() => chooseGif(sendUrl)} className="group mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl border border-transparent bg-[var(--bg-base)] hover:border-[var(--theme-base)]">
                  <img src={previewUrl} alt={gif.title || 'GIF'} className="h-auto w-full transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" decoding="async" />
                </button>
              )
            })}
          </div>
        ) : recentGifs.length ? (
          <>
            <p className="mb-2 type-meta font-black uppercase tracking-widest text-gray-500">Recent</p>
            <div className="grid grid-cols-2 gap-2">
              {recentGifs.map(url => (
                <button key={url} type="button" onClick={() => chooseGif(url)} className="aspect-video overflow-hidden rounded-xl border border-transparent bg-[var(--bg-base)] hover:border-[var(--theme-base)]">
                  <img src={url} alt="Recent GIF" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-pink-500/10 type-title font-black text-pink-300">GIF</span>
            <p className="type-body font-bold text-gray-300">{apiKey ? 'No GIFs found' : 'GIF search is unavailable'}</p>
            <p className="mt-1 type-label text-gray-500">{apiKey ? 'Selected GIFs are added to the attachment preview before sending.' : 'Set VITE_KLIPY_API_KEY to enable KLIPY search.'}</p>
          </div>
        )}
      </div>

      {apiKey && <a href="https://klipy.com/" target="_blank" rel="noreferrer" className="mt-2 block text-right type-meta font-bold uppercase tracking-wider text-gray-600 hover:text-gray-400">Powered by KLIPY</a>}
    </div>
  )
}
