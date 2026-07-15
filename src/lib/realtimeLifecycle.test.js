import test from 'node:test'
import assert from 'node:assert/strict'
import { getRealtimeRetryDelay, getRealtimeScope, shouldScheduleRealtimeRetry, shouldVisibilityCatchUp } from './realtimeLifecycle.js'

test('DM and server subscriptions use their own filter fields', () => {
  assert.deepEqual(getRealtimeScope('home', null, 'dm-1'), { targetId: 'dm-1', field: 'dm_room_id' })
  assert.deepEqual(getRealtimeScope('server', 'channel-1', null), { targetId: 'channel-1', field: 'channel_id' })
})

test('old-room generations and an existing timer cannot schedule retries', () => {
  assert.equal(shouldScheduleRealtimeRetry({ generation: 1, currentGeneration: 2, hasTimer: false }), false)
  assert.equal(shouldScheduleRealtimeRetry({ generation: 2, currentGeneration: 2, hasTimer: true }), false)
  assert.equal(shouldScheduleRealtimeRetry({ generation: 2, currentGeneration: 2, hasTimer: false }), true)
})

test('retry delay is bounded and visibility catch-up only runs when visible', () => {
  assert.equal(getRealtimeRetryDelay(1), 500)
  assert.equal(getRealtimeRetryDelay(99), 8000)
  assert.equal(shouldVisibilityCatchUp('visible'), true)
  assert.equal(shouldVisibilityCatchUp('hidden'), false)
})
