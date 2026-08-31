/**
 * Builds the notification feed.
 *
 * ponytail: this is a computed view, not a stored feed. There is no
 * `notifications` table — items have no per-item read state, no history, and
 * nothing survives a refetch. Rows disappear when their underlying cause is
 * resolved (request answered). Unread conversations are deliberately not
 * notifications: Chats already carries that signal as a dot plus a weight
 * change, and repeating it here made the same DM shout twice. If per-item read
 * state or history is ever needed, the upgrade path is a real notifications
 * table with RLS plus triggers on friendships, and this function becomes its
 * selector.
 */

/** Newest first; items without a timestamp sort last, in stable input order. */
function byNewest(a, b) {
  if (!a.timestamp && !b.timestamp) return 0
  if (!a.timestamp) return 1
  if (!b.timestamp) return -1
  return new Date(b.timestamp) - new Date(a.timestamp)
}

export function buildNotifications({ friendRequests = [] } = {}) {
  return friendRequests
    .map(request => ({
      id: `request-${request.id}`,
      type: 'friend_request',
      timestamp: request.created_at || null,
      profile: request.profiles || null,
      request
    }))
    .sort(byNewest)
}
