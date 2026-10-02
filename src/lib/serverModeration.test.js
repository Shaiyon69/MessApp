import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canBanMember, canModerateMember, canModerateMessages, describeModerationEvent, isTimedOut } from './serverModeration.js'

describe('server moderation role hierarchy', () => {
  it('protects the owner and the acting member', () => {
    assert.equal(canModerateMember('owner', 'owner'), false)
    assert.equal(canModerateMember('owner', 'member', true), false)
  })

  it('limits admins and moderators to lower roles', () => {
    assert.equal(canModerateMember('admin', 'moderator'), true)
    assert.equal(canModerateMember('admin', 'admin'), false)
    assert.equal(canModerateMember('moderator', 'member'), true)
    assert.equal(canModerateMember('moderator', 'moderator'), false)
  })

  it('only lets owners and admins ban lower roles', () => {
    assert.equal(canBanMember('owner', 'admin'), true)
    assert.equal(canBanMember('admin', 'member'), true)
    assert.equal(canBanMember('moderator', 'member'), false)
  })

  it('allows every server staff role to moderate messages', () => {
    assert.equal(canModerateMessages('owner'), true)
    assert.equal(canModerateMessages('admin'), true)
    assert.equal(canModerateMessages('moderator'), true)
    assert.equal(canModerateMessages('member'), false)
  })
})

describe('moderation log lines', () => {
  it('names actor, action, and target', () => {
    const actor = { username: 'alice' }
    const target = { username: 'bob' }
    assert.equal(describeModerationEvent({ action: 'ban', actor, target }), 'alice banned bob')
    assert.equal(describeModerationEvent({ action: 'role_change', actor, target, metadata: { from: 'member', to: 'moderator' } }), 'alice made bob moderator')
    assert.equal(describeModerationEvent({ action: 'message_delete', actor, target }), 'alice removed a message from bob')
  })

  it('survives deleted profiles', () => {
    assert.equal(describeModerationEvent({ action: 'kick', actor: null, target: null }), 'Someone removed someone')
  })
})

describe('member timeout', () => {
  it('is active only while timed_out_until is in the future', () => {
    assert.equal(isTimedOut({ timed_out_until: '2026-10-02T12:00:00Z' }, Date.parse('2026-10-02T11:59:00Z')), true)
    assert.equal(isTimedOut({ timed_out_until: '2026-10-02T12:00:00Z' }, Date.parse('2026-10-02T12:00:00Z')), false)
    assert.equal(isTimedOut({ timed_out_until: null }), false)
    assert.equal(isTimedOut(undefined), false)
  })

  it('describes timeout log lines', () => {
    const actor = { username: 'alice' }
    const target = { username: 'bob' }
    assert.match(describeModerationEvent({ action: 'timeout', actor, target, metadata: { until: '2026-10-02T12:00:00Z' } }), /^alice timed out bob until /)
    assert.equal(describeModerationEvent({ action: 'timeout', actor, target, metadata: {} }), 'alice timed out bob')
    assert.equal(describeModerationEvent({ action: 'untimeout', actor, target }), "alice lifted bob's timeout")
  })
})
