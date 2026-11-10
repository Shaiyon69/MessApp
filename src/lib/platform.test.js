import test from 'node:test'
import assert from 'node:assert/strict'
import { isAndroidUserAgent, isTauriDesktop, isTauriMobile } from './platform.js'

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)'

test('Android user agents are recognised', () => {
  assert.equal(isAndroidUserAgent(ANDROID), true)
  assert.equal(isAndroidUserAgent(LINUX), false)
  assert.equal(isAndroidUserAgent(''), false)
})

test('outside Tauri neither shell is reported', () => {
  assert.equal(isTauriDesktop(), false)
  assert.equal(isTauriMobile(), false)
})

test('Tauri on desktop and on Android are told apart', (t) => {
  // @tauri-apps/api's isTauri() reads globalThis.isTauri.
  globalThis.isTauri = true
  t.after(() => { delete globalThis.isTauri })
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  t.after(() => Object.defineProperty(globalThis, 'navigator', nav))
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ANDROID }, configurable: true })
  assert.deepEqual([isTauriMobile(), isTauriDesktop()], [true, false])
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: LINUX }, configurable: true })
  assert.deepEqual([isTauriMobile(), isTauriDesktop()], [false, true])
})
