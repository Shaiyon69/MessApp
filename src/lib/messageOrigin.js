// Which app a DM message was sent from. Older rows predate the column and count as 'messapp'.
export const ORIGIN_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'messapp', label: 'messapp' },
  { id: 'chimaera', label: 'Chimaera' }
]

const STORAGE_KEY = 'messapp:originFilter'
const FILTER_IDS = new Set(ORIGIN_FILTERS.map(filter => filter.id))

export const messageOrigin = (message) => message?.origin || 'messapp'

export const matchesOrigin = (message, filter) =>
  filter === 'all' || messageOrigin(message) === filter

export const readOriginFilter = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return FILTER_IDS.has(stored) ? stored : 'all'
  } catch (_err) {
    return 'all'
  }
}

export const writeOriginFilter = (filter) => {
  try { localStorage.setItem(STORAGE_KEY, filter) } catch (_err) { /* per-session only */ }
}

// Swipe paging: clamps at both ends rather than wrapping, like a page indicator.
export const stepOriginFilter = (filter, step) => {
  const index = ORIGIN_FILTERS.findIndex(f => f.id === filter)
  const next = Math.max(0, Math.min(ORIGIN_FILTERS.length - 1, index + step))
  return ORIGIN_FILTERS[next].id
}
