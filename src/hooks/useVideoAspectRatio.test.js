import test from 'node:test'
import assert from 'node:assert/strict'
import { aspectRatioOf, DEFAULT_ASPECT_RATIO } from './useVideoAspectRatio.js'

test('a landscape share reports a wide ratio', () => {
  assert.equal(aspectRatioOf({ videoWidth: 1920, videoHeight: 1080 }), DEFAULT_ASPECT_RATIO)
})

test('a portrait phone share reports a tall ratio', () => {
  const ratio = aspectRatioOf({ videoWidth: 1080, videoHeight: 2340 })
  assert.ok(ratio < 1, `expected a portrait ratio, got ${ratio}`)
})

test('dimensions that are not known yet report null', () => {
  // Before loadedmetadata a video element reports zeroes rather than throwing.
  assert.equal(aspectRatioOf({ videoWidth: 0, videoHeight: 0 }), null)
  assert.equal(aspectRatioOf({ videoWidth: 1280, videoHeight: 0 }), null)
  assert.equal(aspectRatioOf(null), null)
  assert.equal(aspectRatioOf(undefined), null)
})
