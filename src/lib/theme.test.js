import test from 'node:test'
import assert from 'node:assert/strict'
import { UI_STYLES, normalizeGlassRefraction, normalizeUiStyle } from './theme.js'

test('UI styles keep known ids and fall back to default', () => {
  for (const { id } of UI_STYLES) assert.equal(normalizeUiStyle(id), id)
  assert.equal(normalizeUiStyle('vista'), 'default')
  assert.equal(normalizeUiStyle(null), 'default')
})

test('glass refraction defaults on and only turns off explicitly', () => {
  assert.equal(normalizeGlassRefraction('off'), 'off')
  assert.equal(normalizeGlassRefraction(null), 'on')
  assert.equal(normalizeGlassRefraction('banana'), 'on')
})
