import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldNotify } from './desktopNotify.js'

test('notifies for other people\'s messages unless the room is open and focused', () => {
  const base = { enabled: true, focused: true, isOwnMessage: false, isOpenRoom: false }
  assert.equal(shouldNotify(base), true)
  assert.equal(shouldNotify({ ...base, isOpenRoom: true }), false)
  assert.equal(shouldNotify({ ...base, isOpenRoom: true, focused: false }), true)
  assert.equal(shouldNotify({ ...base, isOwnMessage: true, focused: false }), false)
  assert.equal(shouldNotify({ ...base, enabled: false, focused: false }), false)
})
