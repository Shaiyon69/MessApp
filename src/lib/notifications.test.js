import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNotifications, countUnreadNotifications, filterNotifications, groupByDay, notificationAction, notificationJumpTarget } from './notifications.js'

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

test('feed rows merge with requests and count unread', () => {
  const items = buildNotifications({
    friendRequests: [{ id: 'r1', created_at: '2026-01-02T00:00:00Z', profiles: {} }],
    feed: [
      { id: 'n1', kind: 'mention', created_at: '2026-01-03T00:00:00Z', read_at: null, actor: { username: 'sam' } },
      { id: 'n2', kind: 'reply', created_at: '2026-01-01T00:00:00Z', read_at: '2026-01-01T01:00:00Z' }
    ]
  })
  assert.deepEqual(items.map(i => i.id), ['feed-n1', 'request-r1', 'feed-n2'])
  assert.equal(items[0].type, 'mention')
  assert.equal(countUnreadNotifications(items), 2)
})

test('a feed row jumps to its channel message', () => {
  const target = notificationJumpTarget({
    message_id: 'm1', channel_id: 'c1', created_at: '2026-01-01T00:00:00Z',
    channel: { name: 'general', categories: { server_id: 's1' } }
  })
  assert.deepEqual(target, {
    id: 'm1', created_at: '2026-01-01T00:00:00Z',
    __search: { type: 'channel', channelId: 'c1', channelName: 'general', serverId: 's1' }
  })
})

test('a thread reply jumps to its root', () => {
  assert.equal(notificationJumpTarget({ message_id: 'm2', channel_id: 'c1', message: { thread_root_id: 'm1' } }).id, 'm1')
})

test('a DM row jumps into its conversation', () => {
  assert.deepEqual(notificationJumpTarget({ message_id: 'm1', dm_room_id: 'd1', created_at: 't' }).__search, { type: 'dm', dmRoomId: 'd1' })
})

test('rows without a message open the DM or server, or nothing after a kick', () => {
  assert.equal(notificationAction({ message_id: 'm1', channel_id: 'c1' }).type, 'jump')
  assert.deepEqual(notificationAction({ kind: 'missed_call', dm_room_id: 'd1', actor: { id: 'p1' } }), { type: 'dm', profile: { id: 'p1' }, dmRoomId: 'd1' })
  assert.equal(notificationAction({ kind: 'friend_accepted', actor: { id: 'p1' } }).type, 'dm')
  assert.equal(notificationAction({ kind: 'friend_accepted', actor: null }), null)
  assert.deepEqual(notificationAction({ kind: 'moderation', server_id: 's1', data: { action: 'timeout' } }), { type: 'server', serverId: 's1' })
  assert.equal(notificationAction({ kind: 'moderation', server_id: 's1', data: { action: 'kick' } }), null)
})

test('filters keep only their kinds; all keeps everything', () => {
  const items = [{ type: 'mention' }, { type: 'reaction' }, { type: 'friend_request' }, { type: 'missed_call' }, { type: 'moderation' }]
  assert.equal(filterNotifications(items, 'all').length, 5)
  assert.deepEqual(filterNotifications(items, 'requests').map(i => i.type), ['friend_request'])
  assert.deepEqual(filterNotifications(items, 'calls').map(i => i.type), ['missed_call'])
  assert.equal(filterNotifications(items, 'unknown').length, 5)
})

test('groupByDay splits by local calendar day and drops empty sections', () => {
  const now = new Date(2026, 9, 27, 9, 0)
  const items = [
    { id: 'a', timestamp: new Date(2026, 9, 27, 0, 5).toISOString() },
    { id: 'b', timestamp: new Date(2026, 9, 26, 23, 59).toISOString() },
    { id: 'c', timestamp: new Date(2026, 9, 20).toISOString() },
    { id: 'd', timestamp: null }
  ]
  assert.deepEqual(groupByDay(items, now).map(s => [s.label, s.items.map(i => i.id)]), [
    ['Today', ['a']], ['Yesterday', ['b']], ['Earlier', ['c', 'd']]
  ])
  assert.deepEqual(groupByDay([{ id: 'a', timestamp: now.toISOString() }], now).map(s => s.label), ['Today'])
})
