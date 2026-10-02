/**
 * Custom status text ("Studying until 5"), carried in the global-presence
 * payload beside the online/idle/dnd status rather than in a profiles column:
 * like the presence dot it only means something while the user is online.
 *
 * ponytail: stored per device in localStorage, so a second device does not see
 * the note until it is set there too. Move to a profiles column if that bites.
 */
export const STATUS_NOTE_MAX = 80

export const STATUS_NOTE_DURATIONS = [
  { label: "Don't clear", ms: null },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: 'Today', ms: 'today' }
]

export const cleanStatusNote = text => String(text ?? '')
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .trim()
  .slice(0, STATUS_NOTE_MAX)

export const statusNoteExpiry = (duration, now = new Date()) => {
  if (duration === null) return null
  if (duration === 'today') {
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return end.getTime()
  }
  return now.getTime() + duration
}

/** The note's text if it is set and not expired, else ''. */
export const activeStatusNote = (note, nowMs = Date.now()) => {
  if (!note?.text) return ''
  if (note.expiresAt && nowMs >= note.expiresAt) return ''
  return cleanStatusNote(note.text)
}

export const readStatusNote = key => {
  try {
    const note = JSON.parse(localStorage.getItem(key))
    return activeStatusNote(note) ? note : null
  } catch (_error) {
    return null
  }
}
