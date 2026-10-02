/**
 * Custom status text ("Studying until 5"), carried to other users in the
 * global-presence payload beside the online/idle/dnd status: like the presence
 * dot it only means something while the user is online. The user's own devices
 * share it through profiles.status_text / status_expires_at, and localStorage
 * keeps it on screen before that read lands.
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

/** profiles row (status_text, status_expires_at) to a note, or null. */
export const statusNoteFromProfile = row => {
  const note = row?.status_text
    ? { text: row.status_text, expiresAt: row.status_expires_at ? Date.parse(row.status_expires_at) : null }
    : null
  return activeStatusNote(note) ? note : null
}

export const statusNoteToProfile = note => ({
  status_text: activeStatusNote(note) || null,
  status_expires_at: note?.expiresAt ? new Date(note.expiresAt).toISOString() : null
})
