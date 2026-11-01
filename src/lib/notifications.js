/**
 * Builds the notification feed from two sources: pending friend requests,
 * which disappear once answered, and stored `notifications` rows written by
 * database triggers (mention, reply, thread_reply, reaction, poll_vote,
 * friend_accepted, moderation) or by the caller's client (missed_call). Unread
 * conversations are deliberately not notifications: Chats already carries that
 * signal as a dot plus a weight change, and repeating it here made the same DM
 * shout twice.
 */

/** Newest first; items without a timestamp sort last, in stable input order. */
function byNewest(a, b) {
  if (!a.timestamp && !b.timestamp) return 0
  if (!a.timestamp) return 1
  if (!b.timestamp) return -1
  return new Date(b.timestamp) - new Date(a.timestamp)
}

export function buildNotifications({ friendRequests = [], feed = [] } = {}) {
  return [
    ...friendRequests.map(request => ({
      id: `request-${request.id}`,
      type: 'friend_request',
      timestamp: request.created_at || null,
      profile: request.profiles || null,
      unread: true,
      request
    })),
    ...feed.map(row => ({
      id: `feed-${row.id}`,
      type: row.kind,
      timestamp: row.created_at || null,
      profile: row.actor || null,
      unread: !row.read_at,
      row
    }))
  ].sort(byNewest)
}

/** Badge count: unanswered requests plus unread feed rows. */
export const countUnreadNotifications = items => items.filter(item => item.unread).length

/** A feed row as the message shape Dashboard's selectSearchResult jumps to.
    A thread reply is not in the channel list, so it jumps to its root. */
export const notificationJumpTarget = row => ({
  id: row.message?.thread_root_id || row.message_id,
  created_at: row.message?.created_at || row.created_at,
  __search: row.dm_room_id
    ? { type: 'dm', dmRoomId: row.dm_room_id }
    : {
        type: 'channel',
        channelId: row.channel_id,
        channelName: row.channel?.name || '',
        serverId: row.channel?.categories?.server_id || null
      }
})

/** What clicking a feed row does: jump to its message, open the DM with the
    actor, open the server, or nothing (moderation after a kick or ban). */
export function notificationAction(row) {
  if (row.message_id) return { type: 'jump', target: notificationJumpTarget(row) }
  if (row.kind === 'missed_call' || row.kind === 'friend_accepted') {
    return row.actor?.id ? { type: 'dm', profile: row.actor, dmRoomId: row.dm_room_id || null } : null
  }
  if (row.kind === 'moderation' && row.server_id && !['kick', 'ban'].includes(row.data?.action)) {
    return { type: 'server', serverId: row.server_id }
  }
  return null
}

/** Filter chips. `kinds: null` means everything. */
export const NOTIFICATION_FILTERS = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'mentions', label: 'Mentions', kinds: ['mention', 'reply', 'thread_reply'] },
  { id: 'activity', label: 'Activity', kinds: ['reaction', 'poll_vote'] },
  { id: 'requests', label: 'Friends', kinds: ['friend_request', 'friend_accepted'] },
  { id: 'calls', label: 'Calls', kinds: ['missed_call'] },
  { id: 'server', label: 'Servers', kinds: ['moderation'] }
]

export function filterNotifications(items, filterId) {
  const kinds = NOTIFICATION_FILTERS.find(filter => filter.id === filterId)?.kinds
  return kinds ? items.filter(item => kinds.includes(item.type)) : items
}

const dayStart = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Today / Yesterday / Earlier, by the viewer's local calendar day. Empty
    sections are dropped; input order (newest first) is kept inside each. */
export function groupByDay(items, now = new Date()) {
  const today = dayStart(now)
  const yesterday = dayStart(new Date(today - 1))
  const sections = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Earlier', items: [] }
  ]
  for (const item of items) {
    const day = item.timestamp ? dayStart(new Date(item.timestamp)) : 0
    sections[day >= today ? 0 : day >= yesterday ? 1 : 2].items.push(item)
  }
  return sections.filter(section => section.items.length)
}
