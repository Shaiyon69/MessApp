import test from 'node:test'
import assert from 'node:assert/strict'
import { getScreenCaptureErrorMessage, getScreenCaptureStream } from './screenCapture.js'

test('screen capture requests display audio when the platform supports it', async () => {
  const calls = []
  const stream = { id: 'screen-1' }
  const result = await getScreenCaptureStream({
    getDisplayMedia: async constraints => {
      calls.push(constraints)
      return stream
    }
  })
  assert.equal(result, stream)
  assert.deepEqual(calls, [{ video: true, audio: true }])
})

test('screen capture retries video-only when display audio is unsupported', async () => {
  const calls = []
  const stream = { id: 'screen-2' }
  const result = await getScreenCaptureStream({
    getDisplayMedia: async constraints => {
      calls.push(constraints)
      if (constraints.audio) throw new DOMException('Audio unsupported', 'NotSupportedError')
      return stream
    }
  })
  assert.equal(result, stream)
  assert.deepEqual(calls, [
    { video: true, audio: true },
    { video: true, audio: false }
  ])
})

test('permission denial is not retried and gets a clear message', async () => {
  let callCount = 0
  await assert.rejects(
    getScreenCaptureStream({
      getDisplayMedia: async () => {
        callCount += 1
        throw new DOMException('Denied', 'NotAllowedError')
      }
    }),
    { name: 'NotAllowedError' }
  )
  assert.equal(callCount, 1)
  assert.match(getScreenCaptureErrorMessage({ name: 'NotAllowedError' }), /cancelled or blocked/i)
})

test('native app capture falls back to a canvas MediaStream and stops the projection with its track', async () => {
  const listeners = new Map()
  let nativeStops = 0
  const track = { stopCalled: false, stop() { this.stopCalled = true } }
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] }
  const draws = []
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => draws.push(args) }),
    captureStream: frameRate => {
      assert.equal(frameRate, 10)
      return stream
    }
  }
  class MockImage {
    set src(value) {
      this.value = value
      this.onload()
    }
  }
  const plugin = {
    addListener: async (name, callback) => {
      listeners.set(name, callback)
      return { remove: async () => listeners.delete(name) }
    },
    start: async () => ({ width: 360, height: 640, frameRate: 10 }),
    stop: async () => { nativeStops += 1 }
  }

  const result = await getScreenCaptureStream(undefined, {
    isNativePlatform: true,
    plugin,
    documentRef: { createElement: () => canvas },
    ImageClass: MockImage
  })
  assert.equal(result, stream)
  assert.equal(canvas.width, 360)
  assert.equal(canvas.height, 640)
  listeners.get('frame')({ dataUrl: 'data:image/jpeg;base64,frame' })
  assert.equal(draws.length, 1)

  track.stop()
  await result._messappStopNativeCapture()
  assert.equal(track.stopCalled, true)
  assert.equal(nativeStops, 1)
})
