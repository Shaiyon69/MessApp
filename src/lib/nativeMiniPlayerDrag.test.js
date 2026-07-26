import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldUseNativeMiniPlayerDrag } from './nativeMiniPlayerDrag.js'

test('native mini-player drag is limited to compact Android touch sessions', () => {
  assert.equal(shouldUseNativeMiniPlayerDrag({
    platform: 'android',
    native: true,
    pointerType: 'touch',
    compact: true
  }), true)

  assert.equal(shouldUseNativeMiniPlayerDrag({
    platform: 'android',
    native: true,
    pointerType: 'mouse',
    compact: true
  }), false)

  assert.equal(shouldUseNativeMiniPlayerDrag({
    platform: 'web',
    native: false,
    pointerType: 'touch',
    compact: true
  }), false)

  assert.equal(shouldUseNativeMiniPlayerDrag({
    platform: 'android',
    native: true,
    pointerType: 'touch',
    compact: false
  }), false)
})
