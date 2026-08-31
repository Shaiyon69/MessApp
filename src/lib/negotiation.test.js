import test from 'node:test'
import assert from 'node:assert/strict'
import { isPolite, shouldIgnoreOffer } from './negotiation.js'

test('isPolite picks exactly one peer of any pair', () => {
  const a = 'aaa:1'
  const b = 'bbb:2'
  assert.equal(isPolite(a, b) && isPolite(b, a), false)
  assert.equal(isPolite(a, b) || isPolite(b, a), true)
})

test('isPolite is stable for ids containing punctuation', () => {
  assert.equal(isPolite('user-2:abc', 'user-1:abc'), true)
  assert.equal(isPolite('user-1:abc', 'user-2:abc'), false)
})

test('answers are never ignored', () => {
  for (const polite of [true, false]) {
    assert.equal(shouldIgnoreOffer({
      polite, makingOffer: true, signalingState: 'have-local-offer', settingRemoteAnswer: false, type: 'answer'
    }), false)
  }
})

test('the polite peer never ignores a colliding offer', () => {
  assert.equal(shouldIgnoreOffer({
    polite: true, makingOffer: true, signalingState: 'have-local-offer', settingRemoteAnswer: false, type: 'offer'
  }), false)
})

test('the impolite peer ignores a colliding offer', () => {
  assert.equal(shouldIgnoreOffer({
    polite: false, makingOffer: true, signalingState: 'have-local-offer', settingRemoteAnswer: false, type: 'offer'
  }), true)
  assert.equal(shouldIgnoreOffer({
    polite: false, makingOffer: false, signalingState: 'have-local-offer', settingRemoteAnswer: false, type: 'offer'
  }), true)
})

test('an offer arriving on a stable connection is always accepted', () => {
  for (const polite of [true, false]) {
    assert.equal(shouldIgnoreOffer({
      polite, makingOffer: false, signalingState: 'stable', settingRemoteAnswer: false, type: 'offer'
    }), false)
  }
})

test('an offer arriving while an answer is being applied is accepted', () => {
  assert.equal(shouldIgnoreOffer({
    polite: false, makingOffer: false, signalingState: 'have-local-offer', settingRemoteAnswer: true, type: 'offer'
  }), false)
})
