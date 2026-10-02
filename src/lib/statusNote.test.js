import assert from 'node:assert/strict'
import test from 'node:test'
import { activeStatusNote, cleanStatusNote, statusNoteExpiry, statusNoteFromProfile, statusNoteToProfile, STATUS_NOTE_MAX } from './statusNote.js'

test('status note is cleaned and capped', () => {
  assert.equal(cleanStatusNote('  hi\nthere\u0007 '), 'hi there')
  assert.equal(cleanStatusNote('x'.repeat(200)).length, STATUS_NOTE_MAX)
})

test('expired notes read as empty', () => {
  assert.equal(activeStatusNote({ text: 'busy', expiresAt: 1000 }, 999), 'busy')
  assert.equal(activeStatusNote({ text: 'busy', expiresAt: 1000 }, 1000), '')
  assert.equal(activeStatusNote({ text: 'busy', expiresAt: null }, 9e15), 'busy')
  assert.equal(activeStatusNote(null), '')
})

test('expiry durations', () => {
  const now = new Date(2026, 9, 2, 10, 0, 0)
  assert.equal(statusNoteExpiry(null, now), null)
  assert.equal(statusNoteExpiry(3600000, now), now.getTime() + 3600000)
  assert.equal(new Date(statusNoteExpiry('today', now)).getHours(), 23)
})

test('profile round trip drops expired notes', () => {
  const note = { text: 'away', expiresAt: Date.parse('2999-01-01T00:00:00Z') }
  assert.deepEqual(statusNoteFromProfile(statusNoteToProfile(note)), note)
  assert.deepEqual(statusNoteToProfile(null), { status_text: null, status_expires_at: null })
  assert.equal(statusNoteFromProfile({ status_text: 'old', status_expires_at: '2000-01-01T00:00:00Z' }), null)
  assert.equal(statusNoteFromProfile({ status_text: null }), null)
})
