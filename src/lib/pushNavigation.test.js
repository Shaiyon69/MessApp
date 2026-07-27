import assert from 'node:assert/strict'
import test from 'node:test'
import {
  consumePendingPushTarget,
  consumePushTargetFromLocation,
  normalizePushTarget,
  PENDING_PUSH_TARGET_KEY
} from './pushNavigation.js'

const DM_ROOM_ID = '11111111-1111-4111-8111-111111111111'
const SERVER_ID = '22222222-2222-4222-8222-222222222222'
const CHANNEL_ID = '33333333-3333-4333-8333-333333333333'

test('push targets accept only known conversation types and UUID identifiers', () => {
  assert.deepEqual(normalizePushTarget({ type: 'dm_message', dm_room_id: DM_ROOM_ID }), {
    type: 'dm_message',
    dmRoomId: DM_ROOM_ID,
    messageId: null
  })
  assert.deepEqual(normalizePushTarget({
    type: 'channel_message',
    server_id: SERVER_ID,
    channel_id: CHANNEL_ID
  }), {
    type: 'channel_message',
    serverId: SERVER_ID,
    channelId: CHANNEL_ID,
    messageId: null
  })
  assert.equal(normalizePushTarget({ type: 'dm_message', dm_room_id: '../settings' }), null)
  assert.equal(normalizePushTarget({ type: 'unknown', dm_room_id: DM_ROOM_ID }), null)
})

test('pending push targets are consumed once', () => {
  const values = new Map([[PENDING_PUSH_TARGET_KEY, JSON.stringify({
    type: 'dm_message',
    dmRoomId: DM_ROOM_ID,
    messageId: null
  })]])
  const storage = {
    getItem: key => values.get(key) || null,
    removeItem: key => values.delete(key)
  }
  assert.equal(consumePendingPushTarget(storage)?.dmRoomId, DM_ROOM_ID)
  assert.equal(consumePendingPushTarget(storage), null)
})

test('cold-start query parameters produce a target and are removed from the address', () => {
  let replaced = ''
  const target = consumePushTargetFromLocation(
    { href: `https://messapp.example/?push_type=channel_message&server_id=${SERVER_ID}&channel_id=${CHANNEL_ID}&message_id=bad` },
    { replaceState: (_state, _title, url) => { replaced = url } }
  )
  assert.equal(target?.channelId, CHANNEL_ID)
  assert.equal(target?.messageId, null)
  assert.equal(replaced, '/')
})
