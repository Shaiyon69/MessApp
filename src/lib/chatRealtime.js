/** Pure reconciliation helpers shared by room-scoped Realtime callbacks/tests. */

const byCreatedAt = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)

const matchesOptimistic = (message, row) => message?.__local
  && message.profile_id === row.profile_id
  && message.reply_to_message_id === row.reply_to_message_id
  && (String(message.content || '') === String(row.content || '')
    || ((message.message_attachments || []).length > 0 && (row.message_attachments || []).length > 0))

/** Applies an INSERT/UPDATE/DELETE after the caller has resolved/decrypted a row. */
export function reconcileMessageEvent(messages, { eventType, row, oldRow, field, targetId }) {
  const current = messages.filter(message => message?.[field] === targetId)
  const messageId = row?.id || oldRow?.id
  if (!messageId) return current
  if (eventType === 'DELETE') return current.filter(message => message.id !== messageId)
  if (row?.[field] !== targetId) return current

  const existingIndex = current.findIndex(message => message.id === row.id)
  if (existingIndex >= 0) {
    const next = [...current]
    next[existingIndex] = { ...current[existingIndex], ...row }
    return next.sort(byCreatedAt)
  }

  const optimisticIndex = eventType === 'INSERT' ? current.findIndex(message => matchesOptimistic(message, row)) : -1
  if (optimisticIndex >= 0) {
    const next = [...current]
    next[optimisticIndex] = { ...row, __delivery_status: 'sent' }
    return next.sort(byCreatedAt)
  }
  return eventType === 'INSERT' ? [...current, row].sort(byCreatedAt) : current
}

/** Applies reaction echoes without duplicating optimistic or existing IDs. */
export function reconcileReactionEvent(messages, { eventType, row, oldRow }) {
  const reaction = row || oldRow
  const reactionId = reaction?.id
  const messageId = reaction?.message_id
  if (!reactionId && !messageId) return messages

  return messages.map(message => {
    const reactions = message.message_reactions || []
    const ownsReaction = message.id === messageId || reactions.some(item => item.id === reactionId)
    if (!ownsReaction) return message
    if (eventType === 'DELETE') {
      return { ...message, message_reactions: reactions.filter(item => reactionId ? item.id !== reactionId : !(item.profile_id === reaction.profile_id && item.emoji === reaction.emoji)) }
    }
    const withoutEcho = reactions.filter(item => item.id !== reactionId && !(item.profile_id === reaction.profile_id && !item.id))
    return { ...message, message_reactions: [...withoutEcho, reaction] }
  })
}

/** Replaces/removes the current user's reaction and returns rollback state. */
export function applyOptimisticReaction(messages, { messageId, profileId, emoji }) {
  const previous = messages
  const next = messages.map(message => {
    if (message.id !== messageId) return message
    const reactions = message.message_reactions || []
    const current = reactions.find(reaction => reaction.profile_id === profileId)
    const keep = reactions.filter(reaction => reaction.profile_id !== profileId)
    const replacement = current?.emoji === emoji ? keep : [...keep, { profile_id: profileId, emoji, __optimistic: true }]
    return { ...message, message_reactions: replacement }
  })
  return { previous, next }
}

export const rollbackReaction = (messages, messageId, previousReactions) => messages.map(message =>
  message.id === messageId ? { ...message, message_reactions: previousReactions } : message
)

export const shouldNotifyIncomingMessage = ({ didAppend, profileId, currentUserId }) =>
  Boolean(didAppend && profileId && profileId !== currentUserId)
