/**
 * Builds the notification feed from two sources: pending friend requests,
 * which disappear once answered, and stored `notifications` rows (mentions and
 * replies in server channels, written by a trigger on message insert). Unread
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
  __search: {
    type: 'channel',
    channelId: row.channel_id,
    channelName: row.channel?.name || '',
    serverId: row.channel?.categories?.server_id || null
  }
})
