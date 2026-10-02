import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanPollDraft, isPollContent, nextPollChoice, tallyPoll } from './polls.js'

describe('polls', () => {
  it('recognises poll content', () => {
    assert.equal(isPollContent('📊 Lunch?'), true)
    assert.equal(isPollContent('Lunch?'), false)
    assert.equal(isPollContent(null), false)
  })

  it('validates a draft', () => {
    assert.deepEqual(cleanPollDraft(' Lunch? ', ['Pizza', ' ', 'Tacos ']), { question: 'Lunch?', options: ['Pizza', 'Tacos'] })
    assert.equal(cleanPollDraft('', ['a', 'b']).error, 'Ask a question')
    assert.equal(cleanPollDraft('q', ['a']).error, 'Add at least two options')
    assert.ok(cleanPollDraft('q', Array.from({ length: 11 }, (_, i) => `o${i}`)).error)
  })

  it('tallies votes and finds mine', () => {
    const votes = [
      { profile_id: 'a', option_index: 0 },
      { profile_id: 'b', option_index: 0 },
      { profile_id: 'b', option_index: 1 },
      { profile_id: 'c', option_index: 9 }
    ]
    const tally = tallyPoll(2, votes, 'b')
    assert.deepEqual(tally.counts, [2, 1])
    assert.equal(tally.voters, 2)
    assert.deepEqual([...tally.mine], [0, 1])
  })

  it('single choice switches or retracts, multiple toggles', () => {
    assert.deepEqual(nextPollChoice(new Set(), 1, false), [1])
    assert.deepEqual(nextPollChoice(new Set([1]), 2, false), [2])
    assert.deepEqual(nextPollChoice(new Set([1]), 1, false), [])
    assert.deepEqual(nextPollChoice(new Set([2]), 0, true), [0, 2])
    assert.deepEqual(nextPollChoice(new Set([0, 2]), 2, true), [0])
  })
})
