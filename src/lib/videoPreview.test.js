import test from 'node:test'
import assert from 'node:assert/strict'
import { getVideoAspectRatio, getVideoPreviewTime, primeVideoPreview } from './videoPreview.js'

test('video previews seek to an early decodable frame', () => {
  assert.equal(getVideoPreviewTime(30), 0.1)
  assert.equal(getVideoPreviewTime(0.1), 0.05)
  assert.equal(getVideoPreviewTime(Number.NaN), 0)
})

test('video preview priming does not interrupt playback or an existing seek', () => {
  const fresh = { duration: 10, currentTime: 0 }
  primeVideoPreview({ currentTarget: fresh })
  assert.equal(fresh.currentTime, 0.1)

  const playing = { duration: 10, currentTime: 3 }
  primeVideoPreview({ currentTarget: playing })
  assert.equal(playing.currentTime, 3)
})

test('video previews preserve source aspect ratios within safe layout bounds', () => {
  assert.equal(getVideoAspectRatio(1920, 1080), 16 / 9)
  assert.equal(getVideoAspectRatio(1080, 1920), 9 / 16)
  assert.equal(getVideoAspectRatio(0, 0), 16 / 9)
  assert.equal(getVideoAspectRatio(10_000, 100), 4)
})
