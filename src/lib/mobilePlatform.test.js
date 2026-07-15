import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldConfigureNativeKeyboard } from './mobilePlatform.js'

test('keyboard resize is skipped on web', () => {
  assert.equal(shouldConfigureNativeKeyboard({ isNativePlatform: () => false, isPluginAvailable: () => true }), false)
})

test('keyboard resize requires the native plugin', () => {
  assert.equal(shouldConfigureNativeKeyboard({ isNativePlatform: () => true, isPluginAvailable: () => false }), false)
  assert.equal(shouldConfigureNativeKeyboard({ isNativePlatform: () => true, isPluginAvailable: () => true }), true)
})
