import { useEffect, useState } from 'react'
import { GLASS_WALLPAPER_EVENT, readGlassWallpaper } from '../../lib/theme'

/* What Liquid Glass refracts: the user's own image, or in light mode blobs
   mixed from the palette accent. Dark mode stays OLED black unless an image
   is set. Always mounted; CSS hides it outside the glass style, which keeps
   style switches free of React state. */
export default function GlassBackdrop() {
  const [wallpaper, setWallpaper] = useState(readGlassWallpaper)

  useEffect(() => {
    const sync = () => setWallpaper(readGlassWallpaper())
    window.addEventListener(GLASS_WALLPAPER_EVENT, sync)
    return () => window.removeEventListener(GLASS_WALLPAPER_EVENT, sync)
  }, [])

  // glass.css keys the dark-mode veil and text lift off this attribute.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-glass-wallpaper', Boolean(wallpaper))
  }, [wallpaper])

  return (
    <div className="glass-backdrop" aria-hidden="true">
      {wallpaper ? (
        <div className="glass-backdrop-image" style={{ backgroundImage: `url("${wallpaper}")` }} />
      ) : (
        <>
          <span className="glass-blob glass-blob-a" />
          <span className="glass-blob glass-blob-b" />
          <span className="glass-blob glass-blob-c" />
          <span className="glass-blob glass-blob-d" />
        </>
      )}
    </div>
  )
}
