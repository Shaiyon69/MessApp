import test from 'node:test'
import assert from 'node:assert/strict'
import { canView, effectiveOverwrites, isChannelPrivate, isPrivate, privateOverwriteRows } from './channelPermissions.js'

const rows = [
  { category_id: 'c1', target: 'everyone', allow: 0, deny: 1 },
  { category_id: 'c1', target: 'role', role_id: 'r1', allow: 1, deny: 0 },
  { channel_id: 'ch3', target: 'role', role_id: 'r1', allow: 1, deny: 0 },
  { channel_id: 'ch3', target: 'member', profile_id: 'm', allow: 0, deny: 1 }
]

test('a synced channel uses its category overwrites', () => {
  const synced = { id: 'ch1', category_id: 'c1', sync_permissions: true }
  const own = { id: 'ch2', category_id: 'c1', sync_permissions: false }
  assert.equal(effectiveOverwrites(synced, rows).length, 2)
  assert.equal(isChannelPrivate(synced, rows), true)
  assert.equal(isChannelPrivate(own, rows), false)
})

test('role allow beats @everyone deny, member deny beats role allow', () => {
  const category = rows.filter(row => row.category_id === 'c1')
  assert.equal(canView(category, { profileId: 'm', roleIds: ['r1'] }), true)
  assert.equal(canView(category, { profileId: 'n', roleIds: [] }), false)
  const channel = rows.filter(row => row.channel_id === 'ch3')
  assert.equal(canView(channel, { profileId: 'm', roleIds: ['r1'] }), false)
  assert.equal(canView(channel, { profileId: 'n', roleIds: ['r1'] }), true)
  assert.equal(canView([], { profileId: 'n' }), true)
})

test('private rows deny @everyone and allow the picks', () => {
  const made = privateOverwriteRows({ channel_id: 'x' }, { roleIds: ['r1'], profileIds: ['p1'] })
  assert.equal(isPrivate(made), true)
  assert.deepEqual(made.map(row => row.target), ['everyone', 'role', 'member'])
  assert.equal(canView(made, { profileId: 'p1' }), true)
  assert.equal(canView(made, { profileId: 'p2' }), false)
})
