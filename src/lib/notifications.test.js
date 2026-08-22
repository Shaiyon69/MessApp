import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNotifications } from './notifications.js'

test('friend requests are listed newest first', () => {
  const items = buildNotifications({
    friendRequests: [
      { id: 'r1', created_at: '2026-01-01T00:00:00Z', profiles: { username: 'alex' } },
      { id: 'r2', created_at: '2026-01-03T00:00:00Z', profiles: { username: 'jamie' } }
    ]
  })
  assert.deepEqual(items.map(i => i.id), ['request-r2', 'request-r1'])
})

test('unread DMs are not notifications — Chats owns that signal', () => {
  const items = buildNotifications({
    dms: [{ dm_room_id: 'd1', is_unread: true, last_message_at: '2026-01-03T00:00:00Z', profiles: {} }]
  })
  assert.deepEqual(items, [])
})

test('items without a timestamp sort last rather than to the top', () => {
  const items = buildNotifications({
    friendRequests: [
      { id: 'r1', profiles: {} },
      { id: 'r2', created_at: '2026-01-01T00:00:00Z', profiles: {} }
    ]
  })
  assert.deepEqual(items.map(i => i.id), ['request-r2', 'request-r1'])
})

test('no sources yields an empty feed', () => {
  assert.deepEqual(buildNotifications(), [])
})
