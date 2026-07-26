import test from 'node:test'
import assert from 'node:assert/strict'
import { clampMiniPlayerPosition } from './useFloatingMiniPlayer.js'

test('clamps a mini player to every viewport edge', () => {
  const player = { width: 320, height: 180 }
  const viewport = { width: 1000, height: 700 }

  assert.deepEqual(
    clampMiniPlayerPosition({ x: -100, y: -100 }, player, viewport),
    { x: 8, y: 8 }
  )
  assert.deepEqual(
    clampMiniPlayerPosition({ x: 900, y: 650 }, player, viewport),
    { x: 672, y: 512 }
  )
})

test('keeps an oversized mini player anchored inside a small viewport', () => {
  assert.deepEqual(
    clampMiniPlayerPosition(
      { x: 300, y: 300 },
      { width: 500, height: 500 },
      { width: 360, height: 320 }
    ),
    { x: 0, y: 0 }
  )
})
