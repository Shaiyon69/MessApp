const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,80}$/
const textEncoder = new TextEncoder()

export const parseMessageWebhook = payload => {
  if (!payload || payload.type !== 'INSERT' || payload.schema !== 'public' || payload.table !== 'messages') {
    throw new Error('Unsupported webhook event')
  }
  const messageId = payload.record?.id
  if (!UUID_PATTERN.test(messageId || '')) throw new Error('Invalid message identifier')
  // Only the identifier crosses the webhook trust boundary. Routing and sender
  // identity are reloaded from Postgres by the service-role function.
  return { messageId }
}

export const verifyWebhookSecret = (headers, expectedSecret) => {
  if (!expectedSecret) return false
  const authorization = headers.get('authorization') || ''
  const bearerSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const suppliedSecret = headers.get('x-messapp-webhook-secret') || bearerSecret
  const actual = textEncoder.encode(suppliedSecret)
  const expected = textEncoder.encode(expectedSecret)
  const length = Math.max(actual.length, expected.length)
  let difference = actual.length ^ expected.length
  for (let index = 0; index < length; index += 1) {
    difference |= (actual[index] || 0) ^ (expected[index] || 0)
  }
  return difference === 0
}

export const excludeSenderAndDedupe = (profileIds, senderId) => (
  [...new Set((profileIds || []).filter(profileId => UUID_PATTERN.test(profileId || '') && profileId !== senderId))]
)

export const dedupeDevicesByToken = devices => {
  const seen = new Set()
  return (devices || []).filter(device => {
    if (!device?.push_token || seen.has(device.push_token)) return false
    seen.add(device.push_token)
    return true
  })
}

export const normalizePrivateKey = value => (value || '').replace(/\\n/g, '\n').trim()

const safeLabel = (value, fallback) => {
  const normalized = Array.from(String(value || ''))
    .filter(character => character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, 80)
  return normalized || fallback
}

const stableHash = value => {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const buildEventKey = ({ messageId, profileId, installationId }) => (
  `${messageId}:${profileId}:${installationId}`
)

export const buildNotificationPayload = ({
  type,
  messageId,
  senderId,
  senderUsername,
  dmRoomId,
  channelId,
  channelName,
  serverId,
  serverName,
  platform,
  pushToken
}) => {
  const isDm = type === 'dm_message'
  const conversationId = isDm ? dmRoomId : channelId
  const data = isDm
    ? {
        type: 'dm_message',
        message_id: String(messageId),
        dm_room_id: String(dmRoomId),
        sender_id: String(senderId)
      }
    : {
        type: 'channel_message',
        message_id: String(messageId),
        channel_id: String(channelId),
        server_id: String(serverId),
        sender_id: String(senderId)
      }
  const title = isDm
    ? safeLabel(senderUsername, 'New message')
    : `${safeLabel(serverName, 'Server')} #${safeLabel(channelName, 'channel')}`.slice(0, 120)
  const body = isDm
    ? 'Sent you a message'
    : `${safeLabel(senderUsername, 'Someone')} sent a message`
  const collapseKey = `${isDm ? 'dm' : 'ch'}-${stableHash(String(conversationId))}`

  const message = {
    token: pushToken,
    notification: { title, body },
    data
  }
  if (platform === 'android') {
    message.android = { priority: 'high', collapse_key: collapseKey }
  } else if (platform === 'ios') {
    message.apns = { headers: { 'apns-collapse-id': collapseKey, 'apns-priority': '10' } }
  } else if (platform === 'web') {
    message.webpush = { headers: { Urgency: 'high', Topic: collapseKey } }
  }
  return { message }
}

const extractFcmCode = payload => {
  const detailCode = payload?.error?.details?.find(detail => typeof detail?.errorCode === 'string')?.errorCode
  const rawCode = detailCode || payload?.error?.status || 'FCM_ERROR'
  const normalized = String(rawCode).toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80)
  return SAFE_ERROR_CODE.test(normalized) ? normalized : 'FCM_ERROR'
}

export const classifyFcmError = (httpStatus, payload) => {
  const code = extractFcmCode(payload)
  if (code === 'UNREGISTERED') return { code, invalidToken: true, temporary: false }
  const temporary = [408, 429, 500, 502, 503, 504].includes(httpStatus)
    || ['INTERNAL', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'].includes(code)
  return { code, invalidToken: false, temporary }
}
