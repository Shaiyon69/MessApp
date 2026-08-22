export const PUSH_NAVIGATION_EVENT = 'messapp:push-navigation'
export const PENDING_PUSH_TARGET_KEY = 'messapp_pending_push_target'
// The service worker asks the page which conversation is on screen before it
// shows a notification, so a message you are already reading stays silent.
export const ACTIVE_CONVERSATION_QUERY = 'MESSAPP_ACTIVE_CONVERSATION_QUERY'

let activeConversationId = null

export const setActiveConversationId = value => {
  activeConversationId = value || null
}

export const getActiveConversationId = () => activeConversationId

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const asUuid = value => UUID_PATTERN.test(String(value || '')) ? String(value) : null

export const normalizePushTarget = data => {
  if (!data || typeof data !== 'object') return null
  if (data.type === 'dm_message') {
    const dmRoomId = asUuid(data.dm_room_id)
    return dmRoomId ? { type: 'dm_message', dmRoomId, messageId: asUuid(data.message_id) } : null
  }
  if (data.type === 'friend_request') {
    const requestId = asUuid(data.request_id)
    return requestId ? { type: 'friend_request', requestId, senderId: asUuid(data.sender_id) } : null
  }
  if (data.type === 'channel_message') {
    const serverId = asUuid(data.server_id)
    const channelId = asUuid(data.channel_id)
    return serverId && channelId
      ? { type: 'channel_message', serverId, channelId, messageId: asUuid(data.message_id) }
      : null
  }
  return null
}

export const publishPushNavigation = (
  data,
  { windowObject = globalThis.window, storage = globalThis.sessionStorage } = {}
) => {
  const target = normalizePushTarget(data)
  if (!target) return null
  storage?.setItem?.(PENDING_PUSH_TARGET_KEY, JSON.stringify(target))
  if (typeof windowObject?.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    windowObject.dispatchEvent(new CustomEvent(PUSH_NAVIGATION_EVENT, { detail: target }))
  }
  return target
}

export const consumePendingPushTarget = (storage = globalThis.sessionStorage) => {
  const serialized = storage?.getItem?.(PENDING_PUSH_TARGET_KEY)
  storage?.removeItem?.(PENDING_PUSH_TARGET_KEY)
  if (!serialized) return null
  try {
    const parsed = JSON.parse(serialized)
    if (parsed?.type === 'dm_message') {
      return normalizePushTarget({
        type: parsed.type,
        dm_room_id: parsed.dmRoomId,
        message_id: parsed.messageId
      })
    }
    if (parsed?.type === 'friend_request') {
      return normalizePushTarget({
        type: parsed.type,
        request_id: parsed.requestId,
        sender_id: parsed.senderId
      })
    }
    return normalizePushTarget({
      type: parsed?.type,
      server_id: parsed?.serverId,
      channel_id: parsed?.channelId,
      message_id: parsed?.messageId
    })
  } catch (_error) {
    return null
  }
}

export const consumePushTargetFromLocation = (
  locationObject = globalThis.location,
  historyObject = globalThis.history
) => {
  if (!locationObject?.href) return null
  const url = new URL(locationObject.href)
  const target = normalizePushTarget({
    type: url.searchParams.get('push_type'),
    dm_room_id: url.searchParams.get('dm_room_id'),
    server_id: url.searchParams.get('server_id'),
    channel_id: url.searchParams.get('channel_id'),
    message_id: url.searchParams.get('message_id'),
    request_id: url.searchParams.get('request_id'),
    sender_id: url.searchParams.get('sender_id')
  })
  if (!target) return null
  for (const key of ['push_type', 'dm_room_id', 'server_id', 'channel_id', 'message_id', 'request_id', 'sender_id']) {
    url.searchParams.delete(key)
  }
  historyObject?.replaceState?.({}, '', `${url.pathname}${url.search}${url.hash}`)
  return target
}
