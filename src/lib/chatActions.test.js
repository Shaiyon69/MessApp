import test from 'node:test'
import assert from 'node:assert/strict'
import { openDmEntry } from './chatActions.js'

test('missing DM creation handler does not throw', () => {
  assert.equal(openDmEntry({ profiles: { id: 'peer' } }), false)
})

test('existing DM creation handler is invoked for a valid profile', () => {
  const calls = []
  const entry = { profiles: { id: 'peer' } }
  assert.equal(openDmEntry(entry, { createOrOpenDm: value => calls.push(value) }), true)
  assert.deepEqual(calls, [entry])
})
