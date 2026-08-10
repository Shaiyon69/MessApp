import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldAutoHideChrome } from './useAutoHideCallChrome.js'

test('hides chrome only when video or a screen share is on stage', () => {
  assert.equal(shouldAutoHideChrome({ hasVisualMedia: true }), true)
  assert.equal(shouldAutoHideChrome({ hasVisualMedia: false }), false)
  assert.equal(shouldAutoHideChrome(), false)
})

test('keeps chrome pinned while a panel is open or the controls are held', () => {
  assert.equal(shouldAutoHideChrome({ hasVisualMedia: true, overlayOpen: true }), false)
  assert.equal(shouldAutoHideChrome({ hasVisualMedia: true, chromeHeld: true }), false)
})
