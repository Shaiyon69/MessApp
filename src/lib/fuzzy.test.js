import test from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyFilter, fuzzyScore } from './fuzzy.js'

test('matches subsequences and rejects out-of-order characters', () => {
  assert.notEqual(fuzzyScore('jd', 'john_doe'), null)
  assert.notEqual(fuzzyScore('gnrl', 'general'), null)
  assert.equal(fuzzyScore('dj', 'john_doe'), null)
  assert.equal(fuzzyScore('x', 'john'), null)
})

test('empty query matches everything, empty text matches nothing', () => {
  assert.equal(fuzzyScore('  ', 'john'), 0)
  assert.equal(fuzzyScore('a', ''), null)
  assert.equal(fuzzyScore('a', undefined), null)
})

test('prefix beats mid-word, word start beats scattered', () => {
  assert.ok(fuzzyScore('jo', 'john') > fuzzyScore('jo', 'bojo'))
  assert.ok(fuzzyScore('jd', 'john_doe') > fuzzyScore('jd', 'jaded'))
})

test('fuzzyFilter ranks best first, checks every field, keeps order on ties', () => {
  const people = [
    { name: 'bojo', tag: 'x#1' },
    { name: 'john', tag: 'x#2' },
    { name: 'alice', tag: 'jo#3' },
    { name: 'zed', tag: 'z#4' }
  ]
  assert.deepEqual(fuzzyFilter(people, 'jo', p => [p.name, p.tag]).map(p => p.name), ['john', 'alice', 'bojo'])
  assert.equal(fuzzyFilter(people, '', p => [p.name]).length, 4)
})
