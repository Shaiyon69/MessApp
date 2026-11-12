import test from 'node:test'
import assert from 'node:assert/strict'
import { createTauriScreenCapture, getScreenCaptureErrorMessage, getScreenCaptureStream } from './screenCapture.js'

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

test('Tauri screen capture invokes the plugin and turns its error code into a DOMException name', async () => {
  const calls = []
  const plugin = createTauriScreenCapture({
    tauriInvoke: async cmd => {
      calls.push(cmd)
      if (cmd.endsWith('|start')) throw { message: 'Screen sharing was cancelled', code: 'NotAllowedError' }
    },
    tauriAddPluginListener: async () => ({ unregister: async () => calls.push('unregister') })
  })
  await assert.rejects(plugin.start(), error => {
    assert.equal(getScreenCaptureErrorMessage(error), 'Screen sharing was cancelled or blocked by the device.')
    return error.name === 'NotAllowedError'
  })
  const listener = await plugin.addListener('frame', () => {})
  await listener.remove()
  await plugin.stop()
  assert.deepEqual(calls, ['plugin:messapp-screen-capture|start', 'unregister', 'plugin:messapp-screen-capture|stop'])
})

test('1:1 calls ask for video only and do not retry', async () => {
  const calls = []
  await getScreenCaptureStream({ getDisplayMedia: async constraints => { calls.push(constraints); return {} } }, { audio: false })
  assert.deepEqual(calls, [{ video: true, audio: false }])
})

test('Android stopping the projection ends the track so callers clean up', async () => {
  const listeners = new Map()
  const ended = []
  const track = { stop() {}, dispatchEvent: event => ended.push(event.type) }
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] }
  let nativeStops = 0
  await getScreenCaptureStream(undefined, {
    isNativePlatform: true,
    plugin: {
      addListener: async (name, callback) => { listeners.set(name, callback); return { remove: async () => {} } },
      start: async () => ({ width: 360, height: 640, frameRate: 10 }),
      stop: async () => { nativeStops += 1 }
    },
    documentRef: { createElement: () => ({ getContext: () => ({ drawImage() {} }), captureStream: () => stream }) },
    ImageClass: class {}
  })
  listeners.get('stopped')()
  assert.deepEqual(ended, ['ended'])
  assert.equal(nativeStops, 1)
})

test('native capture prefers a track generator, so a paused WebView still sends frames', async () => {
  const listeners = new Map()
  const written = []
  let closed = false
  class Generator {
    constructor({ kind }) {
      this.kind = kind
      this.writable = { getWriter: () => ({ write: async frame => written.push(frame), close: async () => { closed = true } }) }
    }
  }
  class Frame {
    constructor(image, init) {
      this.image = image
      this.timestamp = init.timestamp
    }
  }
  class Stream {
    constructor(tracks) { this.tracks = tracks }
    getVideoTracks() { return this.tracks }
    getTracks() { return this.tracks }
  }
  class MockImage {
    set src(value) {
      this.value = value
      this.onload()
    }
  }
  const stream = await getScreenCaptureStream(undefined, {
    isNativePlatform: true,
    plugin: {
      addListener: async (name, callback) => { listeners.set(name, callback); return { remove: async () => {} } },
      start: async () => ({ width: 360, height: 640, frameRate: 10 }),
      stop: async () => {}
    },
    documentRef: { createElement: () => assert.fail('no canvas when a generator exists') },
    ImageClass: MockImage,
    TrackGenerator: Generator,
    VideoFrameClass: Frame,
    MediaStreamClass: Stream
  })
  assert.equal(stream.getVideoTracks()[0].kind, 'video')
  listeners.get('frame')({ dataUrl: 'data:image/jpeg;base64,frame' })
  assert.equal(written.length, 1)
  assert.equal(written[0].image.value, 'data:image/jpeg;base64,frame')
  await stream._messappStopNativeCapture()
  assert.equal(closed, true)
})
