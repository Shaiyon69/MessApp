import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeExpiry,
  expiresAtFor,
  findInviteCodes,
  inviteCodeFromPath,
  inviteErrorMessage,
  inviteState,
  inviteUrl,
  parseInviteCode,
  usesFor
} from './invites.js'

describe('invite links', () => {
  test('parses links, paths and bare codes', () => {
    assert.equal(parseInviteCode('https://messapp-tau.vercel.app/invite/ab12cd34ef56'), 'AB12CD34EF56')
    assert.equal(parseInviteCode('  AB12CD34EF56 '), 'AB12CD34EF56')
    assert.equal(parseInviteCode('join me /invite/AB12CD34EF56 now'), 'AB12CD34EF56')
    assert.equal(parseInviteCode('not a code!'), null)
    assert.equal(parseInviteCode(''), null)
  })

  test('round-trips a generated link', () => {
    assert.equal(parseInviteCode(inviteUrl('AB12CD34EF56')), 'AB12CD34EF56')
  })

  test('finds each distinct code in a message', () => {
    const text = 'a https://x.app/invite/AAAAAA11 b https://x.app/invite/aaaaaa11 c /invite/BBBBBB22'
    assert.deepEqual(findInviteCodes(text), ['AAAAAA11', 'BBBBBB22'])
    assert.deepEqual(findInviteCodes('no links here'), [])
  })

  test('reads the entry path', () => {
    assert.equal(inviteCodeFromPath('/invite/ab12cd34ef56'), 'AB12CD34EF56')
    assert.equal(inviteCodeFromPath('/invite/ab12cd34ef56/'), 'AB12CD34EF56')
    assert.equal(inviteCodeFromPath('/login'), null)
  })
})

describe('invite settings', () => {
  test('expiry and uses options', () => {
    assert.equal(expiresAtFor('never'), null)
    assert.equal(expiresAtFor('1h', 0), new Date(3600 * 1000).toISOString())
    assert.equal(usesFor('unlimited'), null)
    assert.equal(usesFor('5'), 5)
  })

  test('state of an invite row', () => {
    const now = Date.parse('2026-11-03T00:00:00Z')
    assert.equal(inviteState({}, now), 'valid')
    assert.equal(inviteState({ revoked_at: '2026-11-01T00:00:00Z' }, now), 'revoked')
    assert.equal(inviteState({ expires_at: '2026-11-02T00:00:00Z' }, now), 'expired')
    assert.equal(inviteState({ uses_left: 0 }, now), 'exhausted')
    assert.equal(inviteState({ uses_left: null }, now), 'valid')
  })

  test('describes the expiry', () => {
    const now = 0
    assert.equal(describeExpiry(null, now), 'Never expires')
    assert.equal(describeExpiry(new Date(-1).toISOString(), now), 'Expired')
    assert.equal(describeExpiry(new Date(30 * 60000).toISOString(), now), 'Expires in 30 minutes')
    assert.equal(describeExpiry(new Date(7 * 86400000).toISOString(), now), 'Expires in 7 days')
  })

  test('maps RPC errors to plain messages', () => {
    assert.equal(inviteErrorMessage({ message: 'invite expired' }), 'This invite has expired.')
    assert.equal(inviteErrorMessage({ message: 'boom' }), 'Something went wrong with this invite.')
  })
})
