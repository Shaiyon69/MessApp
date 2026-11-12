/** A friend's Chimaera game on one line: icon, "Playing X", playtime, tinted by the cover. */
import { useState } from 'react'
import { useGameAccent } from '../../hooks/useGameAccent'

export default function PlayingBadge({ playing, className = '' }) {
  // Chimaera's own reading of the cover wins; older Chimaera builds send none.
  const fromCover = useGameAccent(playing.accent ? null : playing.coverUrl)
  const color = playing.accent || fromCover
  const [iconFailed, setIconFailed] = useState(null)
  return (
    <span className={`flex min-w-0 items-center gap-1.5 type-meta font-semibold ${className}`} style={{ color }} title={`Playing ${playing.title}${playing.time ? ` · ${playing.time}` : ''}`}>
      {playing.iconUrl && iconFailed !== playing.iconUrl && (
        <img src={playing.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIconFailed(playing.iconUrl)} className="h-4 w-4 shrink-0 rounded object-cover" />
      )}
      <span className="min-w-0 truncate">Playing {playing.title}</span>
      {playing.time && <span className="shrink-0 opacity-75">· {playing.time}</span>}
    </span>
  )
}
