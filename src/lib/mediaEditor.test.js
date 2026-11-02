import test from 'node:test'
import assert from 'node:assert/strict'
import { getMediaOutputSize, isUntouchedVideoEdit, normalizeMediaEdits, resolveMediaAspect } from './mediaEditor.js'

test('profile crop produces a high-resolution square', () => {
  assert.deepEqual(getMediaOutputSize({
    sourceWidth: 4032,
    sourceHeight: 3024,
    aspect: 'square',
    maxDimension: 1024
  }), { width: 1024, height: 1024 })
})

test('portrait and original crops preserve the requested aspect', () => {
  assert.deepEqual(getMediaOutputSize({
    sourceWidth: 1920,
    sourceHeight: 1080,
    aspect: 'portrait',
    maxDimension: 1600
  }), { width: 1280, height: 1600 })
  assert.equal(resolveMediaAspect('original', 1920, 1080), 16 / 9)
})

test('editor values are normalized to safe rendering bounds', () => {
  assert.deepEqual(normalizeMediaEdits({
    rotation: -90,
    zoom: 9,
    offsetX: -500,
    brightness: 10,
    saturation: 500,
    hue: 400
  }), {
    aspect: 'original',
    rotation: 270,
    zoom: 3,
    offsetX: -100,
    offsetY: 0,
    brightness: 50,
    saturation: 200,
    hue: 180,
    strokes: [],
    texts: [],
    trimStart: 0,
    trimEnd: null,
    muted: false
  })
})

test('blank captions are dropped and trims are kept non-negative', () => {
  const normalized = normalizeMediaEdits({
    texts: [{ text: '  ' }, { text: 'hi', x: 0.5, y: 0.5 }],
    trimStart: -3,
    trimEnd: 4.5,
    muted: 1
  })
  assert.deepEqual(normalized.texts, [{ text: 'hi', x: 0.5, y: 0.5 }])
  assert.equal(normalized.trimStart, 0)
  assert.equal(normalized.trimEnd, 4.5)
  assert.equal(normalized.muted, true)
})

test('an untouched video edit sends the original file', () => {
  assert.equal(isUntouchedVideoEdit({}, 12), true)
  assert.equal(isUntouchedVideoEdit({ trimEnd: 12 }, 12), true)
  assert.equal(isUntouchedVideoEdit({ trimEnd: 8 }, 12), false)
  assert.equal(isUntouchedVideoEdit({ muted: true }, 12), false)
  assert.equal(isUntouchedVideoEdit({ texts: [{ text: 'hey' }] }, 12), false)
  assert.equal(isUntouchedVideoEdit({ rotation: 90 }, 12), false)
})
