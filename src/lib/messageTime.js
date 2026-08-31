/**
 * One formatter for every "when was this sent" label in the app.
 *
 * Tiers are decided on the local calendar day, not on elapsed hours: a message
 * at 23:30 read at 00:30 the next morning is "Yesterday", not "an hour ago".
 */

const TIME_ONLY = { hour: 'numeric', minute: '2-digit' }
const DATE_THIS_YEAR = { month: 'short', day: 'numeric' }
const DATE_OTHER_YEAR = { year: 'numeric', month: 'short', day: 'numeric' }

/* Days since the epoch in the viewer's own timezone, so subtracting two of
   these gives whole calendar days regardless of DST or time of day. */
const localDayIndex = date => Math.floor(
  (date.getTime() - date.getTimezoneOffset() * 60000) / 86400000
)

const formatTime = (date, locales) => date.toLocaleTimeString(locales, TIME_ONLY)

/**
 * @param {string|number|Date} value - message timestamp (ISO string from Postgres)
 * @param {Date} [now] - injected for tests; defaults to the current time
 * @param {string|string[]} [locales] - defaults to the browser locale
 * @returns {string} '' when the value is missing or unparseable
 */
export function formatMessageTime(value, now = new Date(), locales = undefined) {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const dayDelta = localDayIndex(now) - localDayIndex(date)
  const time = formatTime(date, locales)

  if (dayDelta === 0) return time
  if (dayDelta === 1) return `Yesterday ${time}`

  // Future timestamps (clock skew between devices) read better as a plain date
  // than as "Yesterday", so anything not today/yesterday falls through here.
  const sameYear = date.getFullYear() === now.getFullYear()
  const day = date.toLocaleDateString(locales, sameYear ? DATE_THIS_YEAR : DATE_OTHER_YEAR)
  return `${day}, ${time}`
}
