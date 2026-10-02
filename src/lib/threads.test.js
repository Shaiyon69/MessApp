import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mergeThreadReplies } from './threads.js'

it('merges thread replies by id, oldest first', () => {
  const current = [{ id: 'b', created_at: '2026-01-02T00:00:00Z', content: 'two' }]
  const merged = mergeThreadReplies(current, [
    { id: 'a', created_at: '2026-01-01T00:00:00Z', content: 'one' },
    { id: 'b', created_at: '2026-01-02T00:00:00Z', is_deleted: true }
  ])
  assert.deepEqual(merged.map(reply => reply.id), ['a', 'b'])
  assert.equal(merged[1].content, 'two')
  assert.equal(merged[1].is_deleted, true)
})
