import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getInteractionFeedbackProfile,
  isTactileFeedbackEnabled
} from './interactionFeedback.js'

test('feedback profiles distinguish send, receive, reaction, and delete actions', () => {
  assert.notDeepEqual(getInteractionFeedbackProfile('message-sent'), getInteractionFeedbackProfile('message-received'))
  assert.equal(getInteractionFeedbackProfile('reaction-added').vibration, 9)
  assert.deepEqual(getInteractionFeedbackProfile('message-deleted').vibration, [16, 28, 20])
})

test('tactile feedback defaults on and honors an explicit opt-out', () => {
  assert.equal(isTactileFeedbackEnabled({ getItem: () => null }), true)
  assert.equal(isTactileFeedbackEnabled({ getItem: () => 'false' }), false)
})
