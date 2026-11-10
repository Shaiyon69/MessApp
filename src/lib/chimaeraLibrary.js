/**
 * A friend's Chimaera library, from public.chimaera_library (migration
 * 20261110063618). Chimaera's Friends tab writes it; RLS lets only the owner
 * and accepted friends read it, so a non-friend simply gets no rows.
 */
export const LIBRARY_COLUMNS = 'shop, object_id, title, icon_url, playtime_ms, last_played_at, achievements_unlocked, achievements_total'

const time = value => {
  const ms = value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : 0
}

/** Games played most recently first, then the rest by playtime; never-played games last. */
export const sortLibrary = rows => [...(rows || [])].sort((a, b) =>
  time(b.last_played_at) - time(a.last_played_at) ||
  (b.playtime_ms || 0) - (a.playtime_ms || 0) ||
  String(a.title).localeCompare(String(b.title))
)

/** "12 h", "45 min", or '' for no playtime. */
export const formatPlaytime = ms => {
  const minutes = Math.floor(Math.max(0, Number(ms) || 0) / 60000)
  if (!minutes) return ''
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours.toLocaleString()} h`
}

/** "12/51 achievements", or '' when the game has none. */
export const formatAchievements = (unlocked, total) =>
  Number.isInteger(total) && total > 0 ? `${Math.min(unlocked || 0, total)}/${total} achievements` : ''

/** Total playtime across the library, for the section header. */
export const totalPlaytime = rows => (rows || []).reduce((sum, row) => sum + Math.max(0, Number(row.playtime_ms) || 0), 0)
