import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOptimisticReaction, reconcileMessageEvent, reconcileReactionEvent, rollbackReaction, shouldNotifyIncomingMessage } from './chatRealtime.js'

const scope = { field: 'dm_room_id', targetId: 'room-1' }

test('message INSERT is added once and stable-ID echoes deduplicate', () => {
  const row = { id: 'm1', dm_room_id: 'room-1', profile_id: 'peer', content: 'x', created_at: '2026-01-01' }
  const once = reconcileMessageEvent([], { eventType: 'INSERT', row, ...scope })
  assert.equal(reconcileMessageEvent(once, { eventType: 'INSERT', row, ...scope }).length, 1)
})

test('message INSERT reconciles an optimistic row', () => {
  const local = { id: 'local-1', __local: true, dm_room_id: 'room-1', profile_id: 'me', content: 'x' }
  const row = { id: 'm1', dm_room_id: 'room-1', profile_id: 'me', content: 'x', created_at: '2026-01-01' }
  const result = reconcileMessageEvent([local], { eventType: 'INSERT', row, ...scope })
  assert.deepEqual(result.map(message => message.id), ['m1'])
})

test('message UPDATE and DELETE apply immediately', () => {
  const original = [{ id: 'm1', dm_room_id: 'room-1', content: 'old' }]
  const updated = reconcileMessageEvent(original, { eventType: 'UPDATE', row: { ...original[0], content: 'new' }, ...scope })
  assert.equal(updated[0].content, 'new')
  assert.deepEqual(reconcileMessageEvent(updated, { eventType: 'DELETE', oldRow: original[0], ...scope }), [])
})

test('reaction INSERT/UPDATE/DELETE update nested state without echoes', () => {
  const messages = [{ id: 'm1', message_reactions: [{ profile_id: 'me', emoji: '👍', __optimistic: true }] }]
  const inserted = reconcileReactionEvent(messages, { eventType: 'INSERT', row: { id: 'r1', message_id: 'm1', profile_id: 'me', emoji: '👍' } })
  assert.equal(inserted[0].message_reactions.length, 1)
  const updated = reconcileReactionEvent(inserted, { eventType: 'UPDATE', row: { id: 'r1', message_id: 'm1', profile_id: 'me', emoji: '❤️' } })
  assert.equal(updated[0].message_reactions[0].emoji, '❤️')
  assert.deepEqual(reconcileReactionEvent(updated, { eventType: 'DELETE', oldRow: { id: 'r1', message_id: 'm1' } })[0].message_reactions, [])
})

test('selecting the current optimistic reaction removes it; changing replaces it', () => {
  const messages = [{ id: 'm1', message_reactions: [{ id: 'r1', profile_id: 'me', emoji: '👍' }] }]
  assert.deepEqual(applyOptimisticReaction(messages, { messageId: 'm1', profileId: 'me', emoji: '👍' }).next[0].message_reactions, [])
  assert.equal(applyOptimisticReaction(messages, { messageId: 'm1', profileId: 'me', emoji: '❤️' }).next[0].message_reactions[0].emoji, '❤️')
})

test('failed optimistic reaction restores only the affected message reactions', () => {
  const original = [{ id: 'm1', message_reactions: [{ id: 'r1', emoji: '👍' }] }, { id: 'm2', message_reactions: [] }]
  const optimistic = applyOptimisticReaction(original, { messageId: 'm1', profileId: 'me', emoji: '❤️' }).next
  assert.deepEqual(rollbackReaction(optimistic, 'm1', original[0].message_reactions), original)
})

test('current-user and duplicate Realtime echoes do not notify', () => {
  assert.equal(shouldNotifyIncomingMessage({ didAppend: true, profileId: 'me', currentUserId: 'me' }), false)
  assert.equal(shouldNotifyIncomingMessage({ didAppend: false, profileId: 'peer', currentUserId: 'me' }), false)
  assert.equal(shouldNotifyIncomingMessage({ didAppend: true, profileId: 'peer', currentUserId: 'me' }), true)
})
