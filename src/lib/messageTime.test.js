import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMessageTime } from './messageTime.js'

// Fixed locale so assertions do not depend on the machine running the suite.
const EN = 'en-US'
const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min)

test('same calendar day shows the time only', () => {
  const now = at(2026, 8, 28, 14, 0)
  assert.equal(formatMessageTime(at(2026, 8, 28, 22, 24), now, EN), '10:24 PM')
  assert.equal(formatMessageTime(at(2026, 8, 28, 0, 5), now, EN), '12:05 AM')
})

test('previous calendar day is labelled Yesterday', () => {
  const now = at(2026, 8, 28, 14, 0)
  assert.equal(formatMessageTime(at(2026, 8, 27, 22, 24), now, EN), 'Yesterday 10:24 PM')
})

test('midnight boundary counts calendar days, not elapsed hours', () => {
  // One hour apart, but on either side of midnight.
  const now = at(2026, 8, 28, 0, 30)
  assert.equal(formatMessageTime(at(2026, 8, 27, 23, 30), now, EN), 'Yesterday 11:30 PM')
  // Nearly a full day apart, still the same calendar day.
  assert.equal(formatMessageTime(at(2026, 8, 28, 0, 1), at(2026, 8, 28, 23, 59), EN), '12:01 AM')
})

test('older this year shows month and day without the year', () => {
  const now = at(2026, 8, 28, 14, 0)
  assert.equal(formatMessageTime(at(2026, 8, 25, 22, 24), now, EN), 'Aug 25, 10:24 PM')
  assert.equal(formatMessageTime(at(2026, 1, 3, 9, 0), now, EN), 'Jan 3, 9:00 AM')
})

test('a different year includes the year', () => {
  const now = at(2026, 8, 28, 14, 0)
  assert.equal(formatMessageTime(at(2025, 8, 26, 22, 24), now, EN), 'Aug 26, 2025, 10:24 PM')
})

test('year boundary two days apart still shows the year', () => {
  const now = at(2026, 1, 1, 10, 0)
  assert.equal(formatMessageTime(at(2025, 12, 30, 18, 0), now, EN), 'Dec 30, 2025, 6:00 PM')
})

test('yesterday across a year boundary is still Yesterday', () => {
  const now = at(2026, 1, 1, 10, 0)
  assert.equal(formatMessageTime(at(2025, 12, 31, 23, 0), now, EN), 'Yesterday 11:00 PM')
})

test('missing and unparseable values format to an empty string', () => {
  const now = at(2026, 8, 28, 14, 0)
  assert.equal(formatMessageTime(null, now, EN), '')
  assert.equal(formatMessageTime(undefined, now, EN), '')
  assert.equal(formatMessageTime('', now, EN), '')
  assert.equal(formatMessageTime('not a date', now, EN), '')
})

test('accepts ISO strings and Date instances alike', () => {
  const now = at(2026, 8, 28, 14, 0)
  const sent = at(2026, 8, 28, 22, 24)
  assert.equal(formatMessageTime(sent.toISOString(), now, EN), formatMessageTime(sent, now, EN))
})
