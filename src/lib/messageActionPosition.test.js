import test from 'node:test'
import assert from 'node:assert/strict'
import { getTouchMessageActionPosition } from './messageActionPosition.js'

test('touch toolbar overlays and stays aligned to an outgoing message', () => {
  const result = getTouchMessageActionPosition({
    messageId: 'message-1',
    alignRight: true,
    rect: { top: 300, right: 390, bottom: 380, left: 220, width: 170, height: 80 }
  }, { width: 240, height: 52 }, { width: 400, height: 800 })

  assert.equal(result.left, 150)
  assert.equal(result.top, 306)
  assert.equal(result.placement, 'overlay')
})

test('touch toolbar overlays a selected message near the viewport edge', () => {
  const result = getTouchMessageActionPosition({
    messageId: 'message-2',
    alignRight: false,
    rect: { top: 20, right: 260, bottom: 180, left: 16, width: 244, height: 160 }
  }, { width: 220, height: 52 }, { width: 360, height: 640 })

  assert.equal(result.left, 16)
  assert.equal(result.top, 26)
  assert.equal(result.placement, 'overlay')
})

test('touch toolbar can stack below the quick-reaction overlay', () => {
  const result = getTouchMessageActionPosition({
    messageId: 'message-3',
    alignRight: false,
    rect: { top: 120, right: 300, bottom: 360, left: 20, width: 280, height: 240 }
  }, { width: 220, height: 52, topOffset: 54 }, { width: 360, height: 640 })

  assert.equal(result.left, 20)
  assert.equal(result.top, 180)
  assert.equal(result.placement, 'overlay')
})

test('stacked touch overlays remain separated near the bottom viewport edge', () => {
  const result = getTouchMessageActionPosition({
    messageId: 'message-4',
    alignRight: true,
    rect: { top: 600, right: 350, bottom: 760, left: 70, width: 280, height: 160 }
  }, { width: 220, height: 52, topOffset: 54 }, { width: 360, height: 640 })

  assert.equal(result.left, 130)
  assert.equal(result.top, 580)
  assert.equal(result.placement, 'overlay')
})
