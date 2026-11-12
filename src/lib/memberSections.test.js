import test from 'node:test'
import assert from 'node:assert/strict'
import { groupMembersByRole, topRole } from './memberSections.js'

const member = (id, username) => ({ profile_id: id, profiles: { username } })
const roles = [{ id: 'mod', name: 'Moderator', color: '#f1c40f' }, { id: 'gamer', name: 'Gamer', color: '#3498db' }]

test('online members sit under their top role, others under Online, offline last', () => {
  const members = [member('a', 'ann'), member('b', 'bob'), member('c', 'cat'), member('d', 'dan')]
  const memberRoles = [
    { profile_id: 'a', role_id: 'gamer' },
    { profile_id: 'a', role_id: 'mod' },
    { profile_id: 'b', role_id: 'gamer' },
    { profile_id: 'd', role_id: 'mod' }
  ]
  const online = new Set(['a', 'b', 'c'])
  const sections = groupMembersByRole(members, roles, memberRoles, id => online.has(id))
  assert.deepEqual(sections.map(s => [s.label, s.members.map(m => m.profile_id)]), [
    ['Moderator', ['a']],
    ['Gamer', ['b']],
    ['Online', ['c']],
    ['Offline', ['d']]
  ])
  assert.equal(sections[0].color, '#f1c40f')
})

test('empty sections are dropped and unknown role ids ignored', () => {
  const sections = groupMembersByRole([member('a', 'ann')], roles, [{ profile_id: 'a', role_id: 'gone' }], () => true)
  assert.deepEqual(sections.map(s => s.label), ['Online'])
})

test('topRole picks the highest role held', () => {
  assert.equal(topRole('a', roles, [{ profile_id: 'a', role_id: 'gamer' }, { profile_id: 'a', role_id: 'mod' }])?.id, 'mod')
  assert.equal(topRole('z', roles, []), null)
})
