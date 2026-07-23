import { createClient } from 'npm:@supabase/supabase-js@2.108.2'
import {
  buildEventKey,
  buildNotificationPayload,
  classifyFcmError,
  dedupeDevicesByToken,
  excludeSenderAndDedupe,
  normalizePrivateKey,
  parseMessageWebhook,
  verifyWebhookSecret
} from './helpers.js'

type DeliverySummary = {
  recipients: number
  devices: number
  sent: number
  skipped: number
  failed: number
  disabled: number
}

type DeviceRow = {
  profile_id: string
  installation_id: string
  platform: 'android' | 'ios' | 'web'
  push_token: string
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
})

// Logs are intentionally restricted to IDs, counts, and bounded provider codes.
// Tokens, webhook bodies, message content, credentials, and URLs never enter logs.
const logEvent = (label: string, metadata: Record<string, unknown>) => console.log(`[${label}]`, metadata)

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const importServiceAccountKey = async (privateKey: string) => {
  const encoded = normalizePrivateKey(privateKey)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

let cachedOauthToken: { value: string; expiresAt: number } | null = null

const getFcmAccessToken = async (clientEmail: string, privateKey: string) => {
  const nowMs = Date.now()
  if (cachedOauthToken && cachedOauthToken.expiresAt - nowMs > 60_000) return cachedOauthToken.value

  const nowSeconds = Math.floor(nowMs / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600
  }))
  const unsignedJwt = `${header}.${claims}`
  const key = await importServiceAccountKey(privateKey)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt))
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`

  let response: Response
  let result: Record<string, unknown>
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    })
    result = await response.json()
  } catch (_error) {
    logEvent('PUSH_FCM_AUTH', { status: 'failed', code: 'NETWORK_ERROR' })
    throw new Error('FCM OAuth authentication failed')
  }
  if (!response.ok || typeof result?.access_token !== 'string') {
    logEvent('PUSH_FCM_AUTH', { status: 'failed', code: 'FCM_AUTH_ERROR' })
    throw new Error('FCM OAuth authentication failed')
  }

  const expiresIn = Number(result.expires_in) || 3600
  cachedOauthToken = { value: result.access_token, expiresAt: nowMs + expiresIn * 1000 }
  logEvent('PUSH_FCM_AUTH', { status: 'refreshed', expiresIn })
  return cachedOauthToken.value
}

const resolveMessageContext = async (database: ReturnType<typeof createClient>, messageId: string) => {
  const { data: message, error: messageError } = await database
    .from('messages')
    .select('id, profile_id, dm_room_id, channel_id')
    .eq('id', messageId)
    .maybeSingle()
  if (messageError) throw messageError
  if (!message) return null

  const { data: sender, error: senderError } = await database
    .from('profiles')
    .select('username')
    .eq('id', message.profile_id)
    .maybeSingle()
  if (senderError) throw senderError
  const senderUsername = sender?.username || 'New message'

  if (message.dm_room_id) {
    const { data: members, error: membersError } = await database
      .from('dm_members')
      .select('profile_id')
      .eq('dm_room_id', message.dm_room_id)
    if (membersError) throw membersError
    let recipientIds = excludeSenderAndDedupe(members?.map(member => member.profile_id), message.profile_id)

    if (recipientIds.length > 0) {
      const { data: relationships, error: blockError } = await database
        .from('user_relationships')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${message.profile_id},blocked_id.eq.${message.profile_id}`)
      if (blockError) throw blockError
      const blockedProfiles = new Set<string>()
      for (const relationship of relationships || []) {
        if (relationship.blocker_id === message.profile_id) blockedProfiles.add(relationship.blocked_id)
        if (relationship.blocked_id === message.profile_id) blockedProfiles.add(relationship.blocker_id)
      }
      recipientIds = recipientIds.filter(profileId => !blockedProfiles.has(profileId))
    }

    return {
      type: 'dm_message' as const,
      messageId: message.id,
      senderId: message.profile_id,
      senderUsername,
      dmRoomId: message.dm_room_id,
      recipientIds
    }
  }

  const { data: channel, error: channelError } = await database
    .from('channels')
    .select('id, name, category_id')
    .eq('id', message.channel_id)
    .maybeSingle()
  if (channelError) throw channelError
  if (!channel) return null

  const { data: category, error: categoryError } = await database
    .from('categories')
    .select('server_id')
    .eq('id', channel.category_id)
    .maybeSingle()
  if (categoryError) throw categoryError
  if (!category) return null

  const [{ data: server, error: serverError }, { data: members, error: membersError }] = await Promise.all([
    database.from('servers').select('id, name').eq('id', category.server_id).maybeSingle(),
    database.from('server_members').select('profile_id').eq('server_id', category.server_id)
  ])
  if (serverError) throw serverError
  if (membersError) throw membersError
  if (!server) return null

  return {
    type: 'channel_message' as const,
    messageId: message.id,
    senderId: message.profile_id,
    senderUsername,
    channelId: channel.id,
    channelName: channel.name,
    serverId: server.id,
    serverName: server.name,
    recipientIds: excludeSenderAndDedupe(members?.map(member => member.profile_id), message.profile_id)
  }
}

const markDelivery = async (
  database: ReturnType<typeof createClient>,
  eventKey: string,
  status: 'sent' | 'failed',
  errorCode: string | null = null
) => {
  const values = status === 'sent'
    ? { status, delivered_at: new Date().toISOString(), last_error_code: null }
    : { status, delivered_at: null, last_error_code: errorCode || 'FCM_ERROR' }
  const { error } = await database.from('push_delivery_events').update(values).eq('event_key', eventKey)
  if (error) throw error
}

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let webhookSecret: string
  try {
    webhookSecret = requiredEnv('MESSAPP_PUSH_WEBHOOK_SECRET')
  } catch (_error) {
    return jsonResponse({ error: 'Function is not configured' }, 500)
  }
  if (!verifyWebhookSecret(request.headers, webhookSecret)) return jsonResponse({ error: 'Unauthorized' }, 401)
  logEvent('PUSH_WEBHOOK_AUTH', { status: 'accepted' })

  let messageId: string
  try {
    const body = await request.json()
    messageId = parseMessageWebhook(body).messageId
  } catch (_error) {
    return jsonResponse({ error: 'Invalid webhook payload' }, 400)
  }
  const summary: DeliverySummary = { recipients: 0, devices: 0, sent: 0, skipped: 0, failed: 0, disabled: 0 }
  const complete = () => {
    logEvent('PUSH_DELIVERY_COMPLETE', { messageId, ...summary })
    return jsonResponse(summary)
  }

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const fcmProjectId = requiredEnv('FCM_PROJECT_ID')
    const fcmClientEmail = requiredEnv('FCM_CLIENT_EMAIL')
    const fcmPrivateKey = requiredEnv('FCM_PRIVATE_KEY')
    const database = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const context = await resolveMessageContext(database, messageId)
    if (!context) return complete()
    logEvent('PUSH_MESSAGE_RESOLVE', { messageId, type: context.type, status: 'resolved' })
    summary.recipients = context.recipientIds.length
    logEvent('PUSH_RECIPIENT_RESOLVE', { messageId, recipients: summary.recipients, type: context.type })
    if (context.recipientIds.length === 0) return complete()

    const { data: rawDevices, error: devicesError } = await database
      .from('push_devices')
      .select('profile_id, installation_id, platform, push_token')
      .in('profile_id', context.recipientIds)
      .eq('enabled', true)
    if (devicesError) throw devicesError

    const devices = dedupeDevicesByToken(rawDevices as DeviceRow[]) as DeviceRow[]
    summary.devices = devices.length
    summary.skipped += Math.max((rawDevices?.length || 0) - devices.length, 0)
    logEvent('PUSH_DEVICE_RESOLVE', { messageId, devices: summary.devices, deduplicated: summary.skipped })
    if (devices.length === 0) return complete()

    const accessToken = await getFcmAccessToken(fcmClientEmail, fcmPrivateKey)
    const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`

    for (const device of devices) {
      const eventKey = buildEventKey({
        messageId,
        profileId: device.profile_id,
        installationId: device.installation_id
      })
      const { data: claimed, error: claimError } = await database.rpc('claim_push_delivery_event', {
        target_event_key: eventKey,
        target_message_id: messageId,
        target_profile_id: device.profile_id,
        target_installation_id: device.installation_id
      })
      if (claimError) throw claimError
      if (!claimed) {
        summary.skipped += 1
        logEvent('PUSH_DELIVERY_CLAIM', { messageId, profileId: device.profile_id, installationId: device.installation_id, status: 'skipped' })
        continue
      }
      logEvent('PUSH_DELIVERY_CLAIM', { messageId, profileId: device.profile_id, installationId: device.installation_id, status: 'claimed' })

      let failureCounted = false
      try {
        const payload = buildNotificationPayload({ ...context, platform: device.platform, pushToken: device.push_token })
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
        const result = await response.json().catch(() => ({}))
        if (response.ok) {
          await markDelivery(database, eventKey, 'sent')
          summary.sent += 1
          logEvent('PUSH_FCM_RESULT', { messageId, profileId: device.profile_id, installationId: device.installation_id, status: 'sent' })
          continue
        }

        const classification = classifyFcmError(response.status, result)
        await markDelivery(database, eventKey, 'failed', classification.code)
        summary.failed += 1
        failureCounted = true
        logEvent('PUSH_FCM_RESULT', {
          messageId,
          profileId: device.profile_id,
          installationId: device.installation_id,
          code: classification.code,
          temporary: classification.temporary
        })

        if (classification.invalidToken) {
          const { data: disabledRows, error: disableError } = await database
            .from('push_devices')
            .update({ enabled: false })
            .eq('profile_id', device.profile_id)
            .eq('installation_id', device.installation_id)
            .eq('push_token', device.push_token)
            .select('id')
          if (disableError) throw disableError
          if ((disabledRows?.length || 0) > 0) {
            summary.disabled += 1
            logEvent('PUSH_DEVICE_DISABLE', {
              messageId,
              profileId: device.profile_id,
              installationId: device.installation_id,
              code: classification.code
            })
          }
        }
      } catch (error) {
        const code = failureCounted
          ? 'DEVICE_DISABLE_ERROR'
          : error instanceof Error && error.message === 'FCM OAuth authentication failed' ? 'FCM_AUTH_ERROR' : 'NETWORK_ERROR'
        if (!failureCounted) await markDelivery(database, eventKey, 'failed', code).catch(() => {})
        if (!failureCounted) summary.failed += 1
        logEvent('PUSH_FCM_RESULT', {
          messageId,
          profileId: device.profile_id,
          installationId: device.installation_id,
          code,
          temporary: true
        })
      }
    }

    return complete()
  } catch (_error) {
    logEvent('PUSH_DELIVERY_ERROR', { messageId, code: 'FUNCTION_ERROR' })
    return jsonResponse({ ...summary, error: 'Push delivery failed' }, 500)
  }
})
