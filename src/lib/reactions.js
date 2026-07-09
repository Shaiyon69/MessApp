export const QUICK_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍']

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
