/**
 * Colour of a game cover, for the "Playing X" label. The image comes from its
 * CDN (the browser caches it); only the colour is kept, in memory, per URL.
 */
import { useEffect, useState } from 'react'
import { FALLBACK_ACCENT, accentFromPixels } from '../lib/gameAccent'

const cache = new Map()

const readAccent = (url) => new Promise(resolve => {
  const img = new Image()
  // Needed to read pixels; a CDN without CORS fails here and keeps the fallback.
  img.crossOrigin = 'anonymous'
  img.referrerPolicy = 'no-referrer'
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 24
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, 24, 24)
      resolve(accentFromPixels(ctx.getImageData(0, 0, 24, 24).data))
    } catch {
      resolve(null)
    }
  }
  img.onerror = () => resolve(null)
  img.src = url
})

export function useGameAccent(url) {
  const [accent, setAccent] = useState(null)
  useEffect(() => {
    if (!url) return setAccent(null)
    let live = true
    if (!cache.has(url)) cache.set(url, readAccent(url))
    cache.get(url).then(color => { if (live) setAccent(color) })
    return () => { live = false }
  }, [url])
  return accent || FALLBACK_ACCENT
}
