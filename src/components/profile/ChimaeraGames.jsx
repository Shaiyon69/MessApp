import { useEffect, useState } from 'react'
import { Gamepad2, Loader2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { safeMediaUrl } from '../../lib/security'
import { debug } from '../../lib/debug'
import { LIBRARY_COLUMNS, formatAchievements, formatPlaytime, sortLibrary, totalPlaytime } from '../../lib/chimaeraLibrary'

/** Whether `profileId` has any games synced from Chimaera that this user may see. */
export function useHasChimaeraLibrary(profileId) {
  const [has, setHas] = useState(false)
  useEffect(() => {
    setHas(false)
    if (!profileId || !supabase) return undefined
    let active = true
    supabase.from('chimaera_library').select('object_id').eq('profile_id', profileId).limit(1)
      .then(({ data, error }) => {
        if (error) debug.warn('CHIMAERA_LIBRARY', { operation: 'check', error })
        if (active) setHas(!error && data?.length > 0)
      })
    return () => { active = false }
  }, [profileId])
  return has
}

/** The Games section of a profile: the user's Chimaera library, most recent first. */
export default function ChimaeraGames({ profileId }) {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setRows(null)
    setFailed(false)
    if (!profileId || !supabase) return undefined
    let active = true
    // shortcut: the first 500 games only; page through if libraries get bigger.
    supabase.from('chimaera_library').select(LIBRARY_COLUMNS).eq('profile_id', profileId).limit(500)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          debug.warn('CHIMAERA_LIBRARY', { operation: 'load', error })
          setFailed(true)
          return
        }
        setRows(sortLibrary(data))
      })
    return () => { active = false }
  }, [profileId])

  if (failed) return <p className="px-1 py-6 text-center type-label text-[var(--text-muted)]">Couldn&apos;t load games. Try again later.</p>
  if (!rows) return <div className="grid place-items-center py-8 text-[var(--text-muted)]"><Loader2 size={20} className="animate-spin" aria-label="Loading games" /></div>
  if (!rows.length) return <p className="px-1 py-6 text-center type-label text-[var(--text-muted)]">No games synced from Chimaera yet.</p>

  const total = formatPlaytime(totalPlaytime(rows))
  return (
    <div className="space-y-2">
      <p className="px-1 type-meta font-bold text-[var(--text-muted)]">
        {rows.length} {rows.length === 1 ? 'game' : 'games'}{total ? ` · ${total} played` : ''} · from Chimaera
      </p>
      <ul className="space-y-1.5">
        {rows.map(row => {
          const icon = safeMediaUrl(row.icon_url, { allowDataImages: false, allowBlob: false })
          const details = [formatPlaytime(row.playtime_ms), formatAchievements(row.achievements_unlocked, row.achievements_total)].filter(Boolean).join(' · ')
          return (
            <li key={`${row.shop}:${row.object_id}`} className="flex items-center gap-3 rounded-2xl bg-[var(--surface-section)] px-3 py-2.5">
              {icon
                ? <img src={icon} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--bg-element)] text-[var(--text-muted)]"><Gamepad2 size={18} aria-hidden="true" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate type-body font-bold text-[var(--text-main)]">{row.title}</p>
                {details && <p className="truncate type-label text-[var(--text-muted)]">{details}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
