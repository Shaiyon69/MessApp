/** Canonical reaction choices and Unicode normalization for storage/UI parity. */
export const QUICK_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍']

export const REACTION_MENU_STATE = Object.freeze({
  CLOSED: 'closed',
  TOOLBAR: 'toolbar',
  PICKER: 'picker',
  SUBMITTING: 'submitting'
})

export const shouldCancelLongPress = (startX, startY, currentX, currentY, threshold = 10) =>
  Math.hypot(currentX - startX, currentY - startY) > threshold

export const shouldSuppressOriginClick = (suppressUntil, now = Date.now()) =>
  Number.isFinite(suppressUntil) && now < suppressUntil

export function transitionReactionMenu(state, action) {
  if (action === 'CLOSE') return REACTION_MENU_STATE.CLOSED
  if (action === 'OPEN_TOOLBAR') return REACTION_MENU_STATE.TOOLBAR
  if (action === 'OPEN_PICKER' && state !== REACTION_MENU_STATE.CLOSED) return REACTION_MENU_STATE.PICKER
  if (action === 'SUBMIT' && state !== REACTION_MENU_STATE.CLOSED) return REACTION_MENU_STATE.SUBMITTING
  if (action === 'BACK' && state === REACTION_MENU_STATE.PICKER) return REACTION_MENU_STATE.TOOLBAR
  if (action === 'BACK') return REACTION_MENU_STATE.CLOSED
  return state
}

const REACTION_EMOJIS = {
  love: '❤️',
  heart: '❤️',
  '❤': '❤️',
  '❤️': '❤️',
  haha: '😂',
  laugh: '😂',
  laughing: '😂',
  '😂': '😂',
  wow: '😮',
  surprised: '😮',
  '😮': '😮',
  sad: '😢',
  cry: '😢',
  '😢': '😢',
  angry: '😡',
  mad: '😡',
  '😡': '😡',
  like: '👍',
  thumbs_up: '👍',
  '+1': '👍',
  '👍': '👍'
}

export const normalizeReactionEmoji = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  return REACTION_EMOJIS[raw.toLowerCase()] || REACTION_EMOJIS[raw] || raw
}
