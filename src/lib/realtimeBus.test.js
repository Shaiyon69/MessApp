import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emitRealtime, onRealtime } from './realtimeBus.js'

test('delivers to listeners of that event until they unsubscribe', () => {
  const seen = []
  const off = onRealtime('messages', payload => seen.push(payload.id))
  onRealtime('poll_votes', () => seen.push('wrong event'))

  emitRealtime('messages', { id: 1 })
  off()
  emitRealtime('messages', { id: 2 })

  assert.deepEqual(seen, [1])
})

test('a listener that unsubscribes while handling does not skip the next one', () => {
  const seen = []
  const off = onRealtime('dm_reads', () => { seen.push('a'); off() })
  onRealtime('dm_reads', () => seen.push('b'))

  emitRealtime('dm_reads', {})

  assert.deepEqual(seen, ['a', 'b'])
})
