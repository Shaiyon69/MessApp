import test from 'node:test'
import assert from 'node:assert/strict'
import { QUICK_REACTION_EMOJIS, REACTION_MENU_STATE, normalizeQuickReactions, replaceQuickReaction, shouldCancelLongPress, shouldSuppressOriginClick, transitionReactionMenu } from './reactions.js'

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

test('quick reaction storage shapes normalize to a full unique row', () => {
  assert.deepEqual(normalizeQuickReactions([]), QUICK_REACTION_EMOJIS)
  assert.deepEqual(normalizeQuickReactions(['🔥', '🔥']).length, QUICK_REACTION_EMOJIS.length)
  assert.equal(normalizeQuickReactions([{ emoji: '🔥' }])[0], '🔥')
})

test('editing a slot keeps every other slot and swaps on duplicates', () => {
  const row = normalizeQuickReactions([])
  assert.deepEqual(replaceQuickReaction(row, 0, '🔥'), ['🔥', ...row.slice(1)])
  // Picking an emoji already in the row must not shrink it back to defaults.
  const swapped = replaceQuickReaction(row, 0, row[3])
  assert.equal(swapped[0], row[3])
  assert.equal(swapped[3], row[0])
  assert.equal(new Set(swapped).size, row.length)
})
