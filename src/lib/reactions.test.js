import test from 'node:test'
import assert from 'node:assert/strict'
import { REACTION_MENU_STATE, shouldCancelLongPress, shouldSuppressOriginClick, transitionReactionMenu } from './reactions.js'

test('long press opens once and can reopen after close', () => {
  const opened = transitionReactionMenu(REACTION_MENU_STATE.CLOSED, 'OPEN_TOOLBAR')
  assert.equal(transitionReactionMenu(opened, 'OPEN_TOOLBAR'), REACTION_MENU_STATE.TOOLBAR)
  const closed = transitionReactionMenu(opened, 'CLOSE')
  assert.equal(transitionReactionMenu(closed, 'OPEN_TOOLBAR'), REACTION_MENU_STATE.TOOLBAR)
})

test('movement beyond touch slop cancels a pending long press', () => {
  assert.equal(shouldCancelLongPress(0, 0, 4, 5), false)
  assert.equal(shouldCancelLongPress(0, 0, 8, 8), true)
})

test('origin click suppression expires instead of consuming a later tap', () => {
  assert.equal(shouldSuppressOriginClick(1_500, 1_200), true)
  assert.equal(shouldSuppressOriginClick(1_500, 1_500), false)
  assert.equal(shouldSuppressOriginClick(1_500, 2_000), false)
})

test('picker back returns to toolbar and a second back closes', () => {
  const picker = transitionReactionMenu(REACTION_MENU_STATE.TOOLBAR, 'OPEN_PICKER')
  const toolbar = transitionReactionMenu(picker, 'BACK')
  assert.equal(toolbar, REACTION_MENU_STATE.TOOLBAR)
  assert.equal(transitionReactionMenu(toolbar, 'BACK'), REACTION_MENU_STATE.CLOSED)
})

test('submitting and outside/escape close cannot leave a menu open', () => {
  const submitting = transitionReactionMenu(REACTION_MENU_STATE.TOOLBAR, 'SUBMIT')
  assert.equal(submitting, REACTION_MENU_STATE.SUBMITTING)
  assert.equal(transitionReactionMenu(submitting, 'CLOSE'), REACTION_MENU_STATE.CLOSED)
})

test('quick reaction, picker reaction, outside tap, and Escape all close', () => {
  for (const reason of ['QUICK_SELECTED', 'PICKER_SELECTED', 'OUTSIDE', 'ESCAPE']) {
    assert.equal(transitionReactionMenu(REACTION_MENU_STATE.PICKER, 'CLOSE'), REACTION_MENU_STATE.CLOSED, reason)
  }
})
