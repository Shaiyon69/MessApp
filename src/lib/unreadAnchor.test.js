import test from 'node:test'
import assert from 'node:assert/strict'
import { firstUnreadIndex, countUnreadFrom } from './unreadAnchor.js'

const messages = [
  { profile_id: 'peer', created_at: '2026-10-27T10:00:00Z' },
  { profile_id: 'me', created_at: '2026-10-27T10:05:00Z' },
  { profile_id: 'peer', created_at: '2026-10-27T10:06:00Z' },
  { profile_id: 'me', created_at: '2026-10-27T10:07:00Z' },
  { profile_id: 'peer', created_at: '2026-10-27T10:08:00Z' },
]

test('divider lands on the first newer message from someone else', () => {
  assert.equal(firstUnreadIndex(messages, '2026-10-27T10:01:00Z', 'me'), 2)
  assert.equal(countUnreadFrom(messages, 2, 'me'), 2)
})

test('own messages never start the unread run', () => {
  assert.equal(firstUnreadIndex(messages.slice(0, 2), '2026-10-27T10:01:00Z', 'me'), -1)
})

test('no pointer or fully read means no divider', () => {
  assert.equal(firstUnreadIndex(messages, null, 'me'), -1)
  assert.equal(firstUnreadIndex(messages, '2026-10-27T10:08:00Z', 'me'), -1)
  assert.equal(countUnreadFrom(messages, -1, 'me'), 0)
})
