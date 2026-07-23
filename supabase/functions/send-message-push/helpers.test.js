import assert from 'node:assert/strict'
import test from 'node:test'
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

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111'
const SENDER_ID = '22222222-2222-4222-8222-222222222222'
const RECIPIENT_ID = '33333333-3333-4333-8333-333333333333'
const INSTALLATION_ID = '44444444-4444-4444-8444-444444444444'

test('webhook parsing accepts only a public messages insert and returns only its ID', () => {
  const parsed = parseMessageWebhook({
    type: 'INSERT',
    schema: 'public',
    table: 'messages',
    record: { id: MESSAGE_ID, profile_id: RECIPIENT_ID, content: 'must not be trusted' }
  })
  assert.deepEqual(parsed, { messageId: MESSAGE_ID })
  assert.throws(() => parseMessageWebhook({ type: 'UPDATE', schema: 'public', table: 'messages', record: { id: MESSAGE_ID } }))
})

test('webhook secret rejects absent and incorrect values', () => {
  assert.equal(verifyWebhookSecret(new Headers(), 'expected-secret'), false)
  assert.equal(verifyWebhookSecret(new Headers({ authorization: 'Bearer wrong-secret' }), 'expected-secret'), false)
  assert.equal(verifyWebhookSecret(new Headers({ 'x-messapp-webhook-secret': 'expected-secret' }), 'expected-secret'), true)
})

test('sender is excluded and device tokens are deduplicated', () => {
  assert.deepEqual(excludeSenderAndDedupe([SENDER_ID, RECIPIENT_ID, RECIPIENT_ID], SENDER_ID), [RECIPIENT_ID])
  const devices = dedupeDevicesByToken([
    { installation_id: 'one-installation', push_token: 'same-token' },
    { installation_id: 'two-installation', push_token: 'same-token' },
    { installation_id: 'three-installation', push_token: 'different-token' }
  ])
  assert.equal(devices.length, 2)
})

test('private-key escaped newlines are normalized', () => {
  assert.equal(normalizePrivateKey(' line-one\\nline-two '), 'line-one\nline-two')
})

test('DM payload contains routing metadata but never message content', () => {
  const payload = buildNotificationPayload({
    type: 'dm_message',
    messageId: MESSAGE_ID,
    senderId: SENDER_ID,
    senderUsername: 'Sender',
    dmRoomId: RECIPIENT_ID,
    platform: 'android',
    pushToken: 'device-token',
    content: 'private plaintext'
  })
  assert.equal(payload.message.notification.body, 'Sent you a message')
  assert.equal(payload.message.data.dm_room_id, RECIPIENT_ID)
  assert.equal(payload.message.data.type, 'dm_message')
  assert.equal(JSON.stringify(payload).includes('private plaintext'), false)
  assert.equal('content' in payload.message.data, false)
})

test('channel payload contains channel and server routing metadata', () => {
  const payload = buildNotificationPayload({
    type: 'channel_message',
    messageId: MESSAGE_ID,
    senderId: SENDER_ID,
    senderUsername: 'Sender',
    channelId: RECIPIENT_ID,
    channelName: 'general',
    serverId: INSTALLATION_ID,
    serverName: 'MessApp',
    platform: 'ios',
    pushToken: 'device-token'
  })
  assert.deepEqual(payload.message.data, {
    type: 'channel_message',
    message_id: MESSAGE_ID,
    channel_id: RECIPIENT_ID,
    server_id: INSTALLATION_ID,
    sender_id: SENDER_ID
  })
  assert.match(payload.message.notification.title, /MessApp #general/)
})

test('FCM errors distinguish unregistered tokens from temporary failures', () => {
  assert.deepEqual(classifyFcmError(404, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }), {
    code: 'UNREGISTERED', invalidToken: true, temporary: false
  })
  assert.deepEqual(classifyFcmError(503, { error: { status: 'UNAVAILABLE' } }), {
    code: 'UNAVAILABLE', invalidToken: false, temporary: true
  })
})

test('event keys are deterministic per message, recipient, and installation', () => {
  const input = { messageId: MESSAGE_ID, profileId: RECIPIENT_ID, installationId: INSTALLATION_ID }
  assert.equal(buildEventKey(input), buildEventKey(input))
  assert.notEqual(buildEventKey(input), buildEventKey({ ...input, installationId: 'different-installation' }))
})
