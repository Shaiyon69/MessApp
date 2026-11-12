import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyScreenSenderLimits,
  avcCodecFromAnnexB,
  createTauriScreenCapture,
  getScreenCaptureErrorMessage,
  getScreenCaptureStream,
  parseScreenMessage,
  pickScreenQuality
} from './screenCapture.js'

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

const wire = (type, flag, a, b, timestamp, payload) => {
  const buffer = new ArrayBuffer(16 + payload.length)
  const view = new DataView(buffer)
  view.setUint8(0, type)
  view.setUint8(1, flag)
  view.setUint16(2, a, true)
  view.setUint16(4, b, true)
  view.setFloat64(8, timestamp, true)
  new Uint8Array(buffer, 16).set(payload)
  return buffer
}

test('the wire header matches ScreenCaptureService.kt', () => {
  const message = parseScreenMessage(wire(1, 1, 1080, 1920, 123456, [9, 8]))
  assert.deepEqual({ ...message, payload: [...message.payload] }, { type: 1, flag: 1, a: 1080, b: 1920, timestamp: 123456, payload: [9, 8] })
  assert.equal(parseScreenMessage(new ArrayBuffer(4)), null)
})

test('the codec string comes from the SPS of an Annex B keyframe', () => {
  assert.equal(avcCodecFromAnnexB(new Uint8Array([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x2a, 0xac, 0, 0, 1, 0x68])), 'avc1.64002a')
  assert.equal(avcCodecFromAnnexB(new Uint8Array([0, 0, 1, 0x65, 1, 2, 3])), null)
})

test('1080p60 for up to 2 viewers, else 720p30', () => {
  assert.equal(pickScreenQuality(1), 'high')
  assert.equal(pickScreenQuality(2), 'high')
  assert.equal(pickScreenQuality(3), 'standard')
})

test('screen senders get the bitrate cap of their quality', async () => {
  const sets = []
  const sender = quality => ({
    track: { kind: 'video', _messappScreenQuality: quality },
    getParameters: () => ({ encodings: [{}] }),
    setParameters: async params => sets.push(params.encodings[0])
  })
  await applyScreenSenderLimits(sender('high'))
  await applyScreenSenderLimits(sender('standard'))
  await applyScreenSenderLimits({ track: { kind: 'audio' } })
  assert.deepEqual(sets, [{ maxBitrate: 6_000_000, maxFramerate: 60 }, { maxBitrate: 2_500_000, maxFramerate: 30 }])
})

const tauriFakes = () => {
  const log = []
  const writes = { video: [], audio: [] }
  const decoders = []
  const windowListeners = new Set()
  const plugin = {
    listeners: new Map(),
    addListener: async (name, callback) => { plugin.listeners.set(name, callback); return { remove: async () => {} } },
    start: async args => {
      log.push(['start', args])
      const port = { closed: false, close() { this.closed = true } }
      plugin.port = port
      windowListeners.forEach(listener => listener({ data: 'messapp-screen-capture', ports: [port] }))
      return { high: true, audio: true, frameRate: 60 }
    },
    stop: async () => log.push(['stop']),
    requestKeyframe: async () => log.push(['keyframe'])
  }
  class Generator {
    constructor({ kind }) {
      this.kind = kind
      this.writable = { getWriter: () => ({ write: async item => writes[kind].push(item), close: async () => {} }) }
    }
  }
  class Decoder {
    constructor(init) {
      this.init = init
      this.decodeQueueSize = 0
      this.chunks = []
      decoders.push(this)
    }
    configure(config) { this.config = config }
    decode(chunk) { this.chunks.push(chunk) }
    close() { this.closed = true }
  }
  class Chunk { constructor(init) { Object.assign(this, init) } }
  class Audio { constructor(init) { Object.assign(this, init) } }
  class Stream {
    constructor(tracks) { this.tracks = tracks }
    getTracks() { return this.tracks }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  }
  const options = {
    tauriMobile: true,
    plugin,
    windowRef: { addEventListener: (_name, listener) => windowListeners.add(listener), removeEventListener: (_name, listener) => windowListeners.delete(listener) },
    TrackGenerator: Generator,
    VideoDecoderClass: Decoder,
    EncodedVideoChunkClass: Chunk,
    AudioDataClass: Audio,
    MediaStreamClass: Stream
  }
  return { log, writes, decoders, plugin, options }
}

const KEY = [0, 0, 0, 1, 0x67, 0x64, 0x00, 0x28, 0, 0, 0, 1, 0x65, 0xaa]

test('Tauri capture decodes H.264 into a video track and PCM into an audio track', async () => {
  const fakes = tauriFakes()
  const stream = await getScreenCaptureStream(undefined, { viewers: 1, ...fakes.options })
  assert.deepEqual(fakes.log[0], ['start', { quality: 'high', audio: true }])
  assert.deepEqual(stream.getTracks().map(track => track.kind), ['video', 'audio'])
  assert.equal(stream.getVideoTracks()[0]._messappScreenQuality, 'high')

  const send = buffer => fakes.plugin.port.onmessage({ data: buffer })
  send(wire(1, 0, 1080, 1920, 1, [0, 0, 1, 0x41]))
  assert.equal(fakes.decoders.length, 0, 'delta frames before the first keyframe are dropped')
  send(wire(1, 1, 1080, 1920, 2, KEY))
  send(wire(1, 0, 1080, 1920, 3, [0, 0, 1, 0x41]))
  assert.equal(fakes.decoders.length, 1)
  assert.deepEqual(fakes.decoders[0].config, { codec: 'avc1.640028', codedWidth: 1080, codedHeight: 1920, optimizeForLatency: true })
  assert.deepEqual(fakes.decoders[0].chunks.map(chunk => chunk.type), ['key', 'delta'])

  send(wire(2, 2, 48000, 0, 4, new Array(960 * 4).fill(0)))
  assert.equal(fakes.writes.audio[0].numberOfFrames, 960)
  assert.equal(fakes.writes.audio[0].sampleRate, 48000)

  await stream._messappStopNativeCapture()
  assert.equal(fakes.plugin.port.closed, true)
  assert.deepEqual(fakes.log.at(-1), ['stop'])
})

test('a rotation (new size on a keyframe) restarts the decoder at that size', async () => {
  const fakes = tauriFakes()
  await getScreenCaptureStream(undefined, { viewers: 1, ...fakes.options })
  const send = buffer => fakes.plugin.port.onmessage({ data: buffer })
  send(wire(1, 1, 1080, 1920, 1, KEY))
  send(wire(1, 1, 1920, 1080, 2, KEY))
  assert.equal(fakes.decoders.length, 2)
  assert.equal(fakes.decoders[0].closed, true)
  assert.equal(fakes.decoders[1].config.codedWidth, 1920)
})

test('a decoder falling behind skips to the next keyframe', async () => {
  const fakes = tauriFakes()
  await getScreenCaptureStream(undefined, { viewers: 4, ...fakes.options })
  assert.deepEqual(fakes.log[0], ['start', { quality: 'standard', audio: true }])
  const send = buffer => fakes.plugin.port.onmessage({ data: buffer })
  send(wire(1, 1, 720, 1280, 1, KEY))
  fakes.decoders[0].decodeQueueSize = 20
  send(wire(1, 0, 720, 1280, 2, [0, 0, 1, 0x41]))
  send(wire(1, 0, 720, 1280, 3, [0, 0, 1, 0x41]))
  assert.deepEqual(fakes.decoders[0].chunks.map(chunk => chunk.type), ['key'])
  assert.ok(fakes.log.some(entry => entry[0] === 'keyframe'))
})

test('Tauri capture without WebCodecs asks for a WebView update', async () => {
  await assert.rejects(
    getScreenCaptureStream(undefined, { tauriMobile: true, TrackGenerator: undefined, VideoDecoderClass: undefined }),
    error => error.name === 'NotSupportedError'
  )
})

test('a slow consent dialog does not time the share out', async () => {
  const fakes = tauriFakes()
  const start = fakes.plugin.start
  // The user reads the dialog for longer than the port timeout.
  fakes.plugin.start = async args => { await new Promise(resolve => setTimeout(resolve, 60)); return start(args) }
  const stream = await getScreenCaptureStream(undefined, { viewers: 1, portTimeoutMs: 20, ...fakes.options })
  assert.equal(stream.getVideoTracks().length, 1)
  assert.ok(!fakes.log.some(entry => entry[0] === 'stop'))
  await stream._messappStopNativeCapture()
})

test('no port after consent still fails cleanly', async () => {
  const fakes = tauriFakes()
  fakes.plugin.start = async () => ({ high: false, audio: false })
  await assert.rejects(
    getScreenCaptureStream(undefined, { viewers: 1, portTimeoutMs: 20, ...fakes.options }),
    error => error.name === 'NotSupportedError'
  )
  assert.deepEqual(fakes.log.at(-1), ['stop'])
})
