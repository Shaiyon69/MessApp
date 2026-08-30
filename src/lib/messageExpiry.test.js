import test from 'node:test'
import assert from 'node:assert/strict'
import { DISAPPEARING_OPTIONS, describeExpiry, dropExpired, expiresAtFrom, isExpired } from './messageExpiry.js'

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0)

test('a lifetime becomes an absolute timestamp measured from send time', () => {
  assert.equal(expiresAtFrom(3600, NOW), new Date(NOW + 3600000).toISOString())
})

test('no lifetime means the message never expires', () => {
  assert.equal(expiresAtFrom(null, NOW), null)
  assert.equal(expiresAtFrom(0, NOW), null)
  assert.equal(expiresAtFrom(-60, NOW), null)
  assert.equal(expiresAtFrom(undefined, NOW), null)
})

test('every composer option round-trips through expiresAtFrom', () => {
  for (const option of DISAPPEARING_OPTIONS) {
    const stamp = expiresAtFrom(option.seconds, NOW)
    if (option.seconds === null) assert.equal(stamp, null)
    else assert.equal(new Date(stamp).getTime() - NOW, option.seconds * 1000)
  }
})

test('a message is expired only once its stamp has passed', () => {
  assert.equal(isExpired({ expires_at: new Date(NOW + 1000).toISOString() }, NOW), false)
  assert.equal(isExpired({ expires_at: new Date(NOW).toISOString() }, NOW), true)
  assert.equal(isExpired({ expires_at: new Date(NOW - 1000).toISOString() }, NOW), true)
})

test('messages without a usable stamp are never dropped', () => {
  assert.equal(isExpired({ expires_at: null }, NOW), false)
  assert.equal(isExpired({}, NOW), false)
  assert.equal(isExpired({ expires_at: 'not a date' }, NOW), false)
  assert.equal(isExpired(null, NOW), false)
})

test('dropExpired removes only the passed messages', () => {
  const messages = [
    { id: 'a' },
    { id: 'b', expires_at: new Date(NOW - 1).toISOString() },
    { id: 'c', expires_at: new Date(NOW + 60000).toISOString() }
  ]
  assert.deepEqual(dropExpired(messages, NOW).map(m => m.id), ['a', 'c'])
})

test('dropExpired returns the same reference when nothing expired', () => {
  const messages = [{ id: 'a' }, { id: 'c', expires_at: new Date(NOW + 60000).toISOString() }]
  assert.equal(dropExpired(messages, NOW), messages)
  assert.equal(dropExpired([], NOW).length, 0)
})

test('describeExpiry labels a set lifetime and stays empty when off', () => {
  assert.equal(describeExpiry(24 * 60 * 60), '24h')
  assert.equal(describeExpiry(null), '')
  assert.equal(describeExpiry(12345), '')
})
