import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileAuthoritativeMessages, removeMessageById } from './messageReconciliation.js'

test('authoritative refresh removes persisted rows that no longer exist', () => {
  const previous = [
    { id: 'deleted', dm_room_id: 'room', created_at: '2026-01-01T00:00:00Z' },
    { id: 'kept', dm_room_id: 'room', created_at: '2026-01-01T00:01:00Z' }
  ]
  const incoming = [
    { id: 'kept', dm_room_id: 'room', created_at: '2026-01-01T00:01:00Z' }
  ]

  assert.deepEqual(
    reconcileAuthoritativeMessages(previous, incoming, 'dm_room_id', 'room').map(message => message.id),
    ['kept']
  )
})

test('authoritative refresh preserves an unsent optimistic message', () => {
  const optimistic = {
    id: 'local-1',
    dm_room_id: 'room',
    created_at: '2026-01-01T00:02:00Z',
    __local: true
  }

  assert.deepEqual(
    reconcileAuthoritativeMessages([optimistic], [], 'dm_room_id', 'room'),
    [optimistic]
  )
})

test('message removal clears matching cached rows only', () => {
  assert.deepEqual(removeMessageById([{ id: 'one' }, { id: 'two' }], 'one'), [{ id: 'two' }])
})
