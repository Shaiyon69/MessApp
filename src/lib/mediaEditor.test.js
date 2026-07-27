import test from 'node:test'
import assert from 'node:assert/strict'
import { getMediaOutputSize, normalizeMediaEdits, resolveMediaAspect } from './mediaEditor.js'

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
    strokes: []
  })
})
