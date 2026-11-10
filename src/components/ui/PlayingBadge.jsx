/** A friend's Chimaera game: icon and "Playing X", the playtime below, tinted by the cover. */
import { useState } from 'react'
import { useGameAccent } from '../../hooks/useGameAccent'

export default function PlayingBadge({ playing, className = '' }) {
  const color = useGameAccent(playing.coverUrl)
  const [iconFailed, setIconFailed] = useState(null)
  return (
    <span className={`flex min-w-0 flex-col items-end text-right type-meta font-semibold ${className}`} style={{ color }}>
      <span className="flex max-w-full items-center gap-1.5">
        {playing.iconUrl && iconFailed !== playing.iconUrl && (
          <img src={playing.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIconFailed(playing.iconUrl)} className="h-4 w-4 shrink-0 rounded object-cover" />
        )}
        <span className="truncate">Playing {playing.title}</span>
      </span>
      {playing.time && <span className="opacity-75">{playing.time}</span>}
    </span>
  )
}
