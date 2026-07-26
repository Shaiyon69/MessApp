import test from 'node:test'
import assert from 'node:assert/strict'
import { getTouchMessageActionPosition } from './messageActionPosition.js'

test('touch toolbar stays above and aligned to an outgoing message', () => {
  const result = getTouchMessageActionPosition({
    messageId: 'message-1',
    alignRight: true,
    rect: { top: 300, right: 390, bottom: 380, left: 220, width: 170, height: 80 }
  }, { width: 240, height: 52 }, { width: 400, height: 800 })

  assert.equal(result.left, 150)
  assert.equal(result.top, 242)
  assert.equal(result.placement, 'above')
})

test('touch toolbar overlays the selected message when there is no room above', () => {
  const result = getTouchMessageActionPosition({
    messageId: 'message-2',
    alignRight: false,
    rect: { top: 20, right: 260, bottom: 180, left: 16, width: 244, height: 160 }
  }, { width: 220, height: 52 }, { width: 360, height: 640 })

  assert.equal(result.left, 16)
  assert.equal(result.top, 26)
  assert.equal(result.placement, 'overlay')
})
