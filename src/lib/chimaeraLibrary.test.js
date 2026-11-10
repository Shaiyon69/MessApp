import test from 'node:test'
import assert from 'node:assert/strict'
import { formatAchievements, formatPlaytime, sortLibrary, totalPlaytime } from './chimaeraLibrary.js'

test('recent games first, then by playtime, never-played last', () => {
  const rows = [
    { title: 'Never', playtime_ms: 0, last_played_at: null },
    { title: 'Old', playtime_ms: 10, last_played_at: '2026-01-01T00:00:00+00:00' },
    { title: 'New', playtime_ms: 1, last_played_at: '2026-11-01T00:00:00+00:00' },
    { title: 'Big', playtime_ms: 99, last_played_at: null }
  ]
  assert.deepEqual(sortLibrary(rows).map(r => r.title), ['New', 'Old', 'Big', 'Never'])
  assert.deepEqual(sortLibrary(null), [])
})

test('playtime reads in minutes or hours', () => {
  assert.equal(formatPlaytime(0), '')
  assert.equal(formatPlaytime(59_999), '')
  assert.equal(formatPlaytime(45 * 60_000), '45 min')
  assert.equal(formatPlaytime(12.5 * 3_600_000), '12 h')
  assert.equal(formatPlaytime(-5), '')
})

test('achievements only when the game has some', () => {
  assert.equal(formatAchievements(12, 51), '12/51 achievements')
  assert.equal(formatAchievements(null, 51), '0/51 achievements')
  assert.equal(formatAchievements(60, 51), '51/51 achievements')
  assert.equal(formatAchievements(0, 0), '')
  assert.equal(formatAchievements(3, null), '')
})

test('total playtime ignores junk', () => {
  assert.equal(totalPlaytime([{ playtime_ms: 1000 }, { playtime_ms: -5 }, {}]), 1000)
})
