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

const QUICK_REACTION_COUNT = QUICK_REACTION_EMOJIS.length

/** Coerce stored/legacy shapes into exactly QUICK_REACTION_COUNT unique emojis. */
export const normalizeQuickReactions = (value) => {
  const list = Array.isArray(value) ? value : []
  return [...list, ...QUICK_REACTION_EMOJIS]
    .map(item => normalizeReactionEmoji(typeof item === 'string' ? item : item?.emoji || item?.type || item?.reaction))
    .filter(Boolean)
    .filter((item, index, self) => self.indexOf(item) === index)
    .slice(0, QUICK_REACTION_COUNT)
}

/**
 * Put `emoji` in `index`. When it already occupies another slot the two swap,
 * because dropping the duplicate would let the defaults refill the gap and the
 * edit would look like it never applied.
 */
export const replaceQuickReaction = (list, index, emoji) => {
  const next = normalizeQuickReactions(list)
  const picked = normalizeReactionEmoji(emoji)
  if (!picked || index < 0 || index >= next.length) return next
  const existing = next.indexOf(picked)
  if (existing !== -1) next[existing] = next[index]
  next[index] = picked
  return next
}
