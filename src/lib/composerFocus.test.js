import test from 'node:test'
import assert from 'node:assert/strict'
import { composerHeight, COMPOSER_MAX_PX } from './composerFocus.js'

test('composerHeight grows with the content until the cap', () => {
  assert.equal(composerHeight(44), 44)
  assert.equal(composerHeight(COMPOSER_MAX_PX), COMPOSER_MAX_PX)
})

test('composerHeight clamps past the cap so the field scrolls instead', () => {
  assert.equal(composerHeight(600), COMPOSER_MAX_PX)
})

test('composerHeight never returns a negative height', () => {
  assert.equal(composerHeight(-10), 0)
})
