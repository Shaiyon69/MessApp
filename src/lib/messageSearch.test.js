import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describeChannelResult,
  describeDmResult,
  escapeIlikePattern,
  mapWithConcurrency,
  matchesSearchQuery,
  rankSearchResults
} from './messageSearch.js'

test('escapeIlikePattern keeps wildcards literal', () => {
  assert.equal(escapeIlikePattern('50% off'), '50\\% off')
  assert.equal(escapeIlikePattern('a_b'), 'a\\_b')
  assert.equal(escapeIlikePattern('back\\slash'), 'back\\\\slash')
  assert.equal(escapeIlikePattern('plain'), 'plain')
})

test('matchesSearchQuery matches body or author and skips dead messages', () => {
  const message = { content: 'Ship the Release', profiles: { username: 'ada' } }
  assert.equal(matchesSearchQuery(message, 'release'), true)
  assert.equal(matchesSearchQuery(message, 'ada'), true)
  assert.equal(matchesSearchQuery(message, 'nope'), false)
  assert.equal(matchesSearchQuery({ ...message, is_deleted: true }, 'release'), false)
  assert.equal(matchesSearchQuery({ ...message, is_unreadable: true }, 'release'), false)
  assert.equal(matchesSearchQuery(message, ''), false)
})

test('rankSearchResults dedupes, sorts newest first, and caps', () => {
  const results = [
    { id: 'a', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c', created_at: '2026-03-01T00:00:00Z' },
    { id: 'a', created_at: '2026-01-01T00:00:00Z' },
    { id: 'b', created_at: '2026-02-01T00:00:00Z' },
    { id: null, created_at: '2026-04-01T00:00:00Z' }
  ]
  assert.deepEqual(rankSearchResults(results).map(r => r.id), ['c', 'b', 'a'])
  assert.deepEqual(rankSearchResults(results, 2).map(r => r.id), ['c', 'b'])
})

test('mapWithConcurrency keeps order and never exceeds the limit', async () => {
  const items = [1, 2, 3, 4, 5, 6, 7]
  let active = 0
  let peak = 0
  const out = await mapWithConcurrency(items, 3, async (item) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active -= 1
    return item * 2
  })
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14])
  assert.ok(peak <= 3, `peak concurrency was ${peak}`)
  assert.deepEqual(await mapWithConcurrency([], 3, async () => 1), [])
})

test('describeChannelResult labels a hit from the nested embed', () => {
  const scope = describeChannelResult({
    channel_id: 'ch1',
    channels: { id: 'ch1', name: 'general', categories: { id: 'cat1', servers: { id: 'srv1', name: 'Study' } } }
  })
  assert.deepEqual(scope, { type: 'server', channelId: 'ch1', channelName: 'general', serverId: 'srv1', label: 'Study • #general' })
})

test('describeChannelResult still labels when the embed is missing', () => {
  const scope = describeChannelResult({ channel_id: 'ch2' })
  assert.equal(scope.channelId, 'ch2')
  assert.equal(scope.serverId, null)
  assert.equal(scope.label, '#channel')
})

test('describeDmResult names the peer', () => {
  assert.deepEqual(
    describeDmResult({ dm_room_id: 'r1' }, { dm_room_id: 'r1', profiles: { username: 'ada' } }),
    { type: 'dm', dmRoomId: 'r1', label: 'ada' }
  )
  assert.equal(describeDmResult({ dm_room_id: 'r2' }, null).label, 'Direct message')
})
