import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canBanMember, canModerateMember, canModerateMessages } from './serverModeration.js'

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
