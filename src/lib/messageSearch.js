/**
 * Helpers for searching messages across every conversation, not just the open
 * one. Server-channel bodies are plaintext in Postgres and are matched there;
 * DM bodies are AES-GCM ciphertext in the same column, so those have to be
 * pulled down, decrypted, and matched in the browser. The split lives in
 * useChatManager — this module only holds the parts worth testing on their own.
 */

export const SEARCH_MIN_QUERY_LENGTH = 2
/* ponytail: DM search decrypts this many recent messages per room per query.
   Build a local plaintext index if the cap starts hiding real hits. */
export const SEARCH_ROOM_MESSAGE_LIMIT = 500
export const SEARCH_RESULT_LIMIT = 100
export const SEARCH_ROOM_CONCURRENCY = 4
export const SEARCH_DEBOUNCE_MS = 300

/** PostgREST reads % and _ as wildcards, so a literal query has to escape them. */
export const escapeIlikePattern = (query) => String(query).replace(/([\\%_])/g, '\\$1')

/** Matches the message body or its author, the two things the old in-chat search covered. */
export const matchesSearchQuery = (message, loweredQuery) => {
  if (!message || message.is_deleted || message.is_unreadable) return false
  if (!loweredQuery) return false
  return Boolean(
    message.content?.toLowerCase().includes(loweredQuery) ||
    message.profiles?.username?.toLowerCase().includes(loweredQuery)
  )
}

/** Newest first, one entry per message, capped so a broad query stays cheap to render. */
export const rankSearchResults = (results = [], limit = SEARCH_RESULT_LIMIT) => {
  const byId = new Map()
  results
    .filter(result => result && result.id)
    .forEach(result => { if (!byId.has(result.id)) byId.set(result.id, result) })
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
}

/** Runs `worker` over `items` a few at a time — a whole DM list at once starves the connection. */
export const mapWithConcurrency = async (items, limit, worker) => {
  const results = []
  let cursor = 0
  const runnerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: runnerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

/** Label a channel hit from the nested server/category embed the search query asks for. */
export const describeChannelResult = (message) => {
  const channel = message?.channels
  const server = channel?.categories?.servers
  return {
    type: 'server',
    channelId: channel?.id || message?.channel_id || null,
    channelName: channel?.name || 'channel',
    serverId: server?.id || null,
    label: server?.name && channel?.name ? `${server.name} • #${channel.name}` : `#${channel?.name || 'channel'}`
  }
}

/** Label a DM hit from the caller's own DM list. */
export const describeDmResult = (message, dm) => ({
  type: 'dm',
  dmRoomId: dm?.dm_room_id || message?.dm_room_id || null,
  label: dm?.profiles?.username || 'Direct message'
})
