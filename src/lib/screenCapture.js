import { Capacitor, registerPlugin } from '@capacitor/core'
import { addPluginListener, invoke } from '@tauri-apps/api/core'
import { isTauriMobile } from './platform.js'

const VIDEO_ONLY_FALLBACK_ERRORS = new Set(['TypeError', 'OverconstrainedError', 'NotSupportedError'])
const TAURI_SCREEN_CAPTURE = 'messapp-screen-capture'
// The Capacitor build (frozen) sends JPEG frames; the Tauri build sends H.264 and PCM below.
const NativeScreenCapture = registerPlugin('ScreenCapture')

/** Tauri Android: start, stop, keyframe requests and the stopped event of the messapp-screen-capture plugin. */
export const createTauriScreenCapture = ({ tauriInvoke = invoke, tauriAddPluginListener = addPluginListener } = {}) => {
  // Kotlin rejects with { message, code }; the code is the DOMException name the error messages expect.
  const command = name => args => tauriInvoke(`plugin:${TAURI_SCREEN_CAPTURE}|${name}`, args).catch(error => {
    throw new DOMException(error?.message || String(error), error?.code || 'NotSupportedError')
  })
  return {
    start: command('start'),
    stop: command('stop'),
    requestKeyframe: command('request_keyframe'),
    addListener: async (event, handler) => {
      const listener = await tauriAddPluginListener(TAURI_SCREEN_CAPTURE, event, handler)
      return { remove: () => listener.unregister() }
    }
  }
}

/** Server voice is a mesh, one upload per viewer: 1080p60 only for up to 2 viewers. */
export const pickScreenQuality = viewers => (viewers <= 2 ? 'high' : 'standard')

// Bitrate caps per quality: WebRTC's default cap blurs 1080p screen content.
const SCREEN_LIMITS = {
  high: { maxBitrate: 6_000_000, maxFramerate: 60 },
  standard: { maxBitrate: 2_500_000, maxFramerate: 30 }
}

export const screenSenderLimits = track => {
  const quality = track?._messappScreenQuality
  if (quality) return SCREEN_LIMITS[quality]
  const { width = 0, height = 0 } = track?.getSettings?.() || {}
  return Math.min(width, height) >= 1000 ? SCREEN_LIMITS.high : SCREEN_LIMITS.standard
}

/** Caps a screen video sender; a refusal (old browser, encodings not ready) keeps WebRTC's defaults. */
export async function applyScreenSenderLimits(sender) {
  const track = sender?.track
  if (track?.kind !== 'video' || !sender.getParameters || !sender.setParameters) return
  try {
    const params = sender.getParameters()
    if (!params.encodings?.length) params.encodings = [{}]
    Object.assign(params.encodings[0], screenSenderLimits(track))
    await sender.setParameters(params)
  } catch (_error) {
    // Defaults still work, at a lower quality.
  }
}

const SCREEN_HEADER_BYTES = 16
export const SCREEN_MESSAGE = { VIDEO: 1, AUDIO: 2 }

/** The 16-byte header ScreenCaptureService.kt writes (Wire.frame), then the payload. */
export function parseScreenMessage(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < SCREEN_HEADER_BYTES) return null
  const view = new DataView(buffer)
  return {
    type: view.getUint8(0),
    flag: view.getUint8(1),
    a: view.getUint16(2, true),
    b: view.getUint16(4, true),
    timestamp: view.getFloat64(8, true),
    payload: new Uint8Array(buffer, SCREEN_HEADER_BYTES)
  }
}

/** avc1.PPCCLL from the SPS in an Annex B keyframe, or null when it has none. */
export function avcCodecFromAnnexB(bytes) {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0 || bytes[i + 1] !== 0 || bytes[i + 2] !== 1) continue
    if ((bytes[i + 3] & 0x1f) === 7 && i + 6 < bytes.length) {
      return 'avc1.' + [bytes[i + 4], bytes[i + 5], bytes[i + 6]].map(b => b.toString(16).padStart(2, '0')).join('')
    }
  }
  return null
}

const MAX_DECODE_QUEUE = 8
const PORT_TIMEOUT_MS = 10_000

/**
 * Tauri Android: H.264 and PCM arrive as binary messages on a WebMessagePort, are
 * decoded with WebCodecs and written to track generators. Nothing is rendered, so the
 * share keeps going while MessApp is in the background (the WebView is paused there).
 */
async function createTauriScreenCaptureStream({
  plugin = createTauriScreenCapture(),
  quality = 'standard',
  audio = true,
  windowRef = globalThis,
  TrackGenerator = globalThis.MediaStreamTrackGenerator,
  VideoDecoderClass = globalThis.VideoDecoder,
  EncodedVideoChunkClass = globalThis.EncodedVideoChunk,
  AudioDataClass = globalThis.AudioData,
  MediaStreamClass = globalThis.MediaStream,
  portTimeoutMs = PORT_TIMEOUT_MS
} = {}) {
  if (!TrackGenerator || !VideoDecoderClass || !EncodedVideoChunkClass || !MediaStreamClass) {
    throw new DOMException('Update Android System WebView to share your screen.', 'NotSupportedError')
  }

  let stopped = false
  let stream
  let port
  let stoppedListener
  let decoder = null
  let decoderSize = ''
  let waitingForKey = true
  let audioWriter = null
  const video = new TrackGenerator({ kind: 'video' })
  const videoWriter = video.writable.getWriter()
  Object.defineProperty(video, '_messappScreenQuality', { configurable: true, value: quality })

  const requestKeyframe = () => { void plugin.requestKeyframe?.().catch?.(() => {}) }
  const createDecoder = () => new VideoDecoderClass({
    output: frame => {
      // write() closes the frame; a rejected write only means the track ended.
      if (stopped) frame.close()
      else videoWriter.write(frame).catch(() => {})
    },
    error: () => {
      decoder = null
      waitingForKey = true
      requestKeyframe()
    }
  })

  const onVideo = message => {
    const key = message.flag === 1
    const size = `${message.a}x${message.b}`
    // A rotation restarts the encoder at a new size; its first frame is a keyframe with a new SPS.
    if (key && (!decoder || size !== decoderSize)) {
      const codec = avcCodecFromAnnexB(message.payload)
      if (!codec) return
      try { decoder?.close() } catch (_error) {}
      decoder = createDecoder()
      decoder.configure({ codec, codedWidth: message.a, codedHeight: message.b, optimizeForLatency: true })
      decoderSize = size
    }
    if (!decoder || (waitingForKey && !key)) return
    if (!key && decoder.decodeQueueSize > MAX_DECODE_QUEUE) {
      // Falling behind: skip to the next keyframe rather than build up delay.
      waitingForKey = true
      requestKeyframe()
      return
    }
    waitingForKey = false
    decoder.decode(new EncodedVideoChunkClass({ type: key ? 'key' : 'delta', timestamp: message.timestamp, data: message.payload }))
  }

  const onAudio = message => {
    const channels = message.flag
    if (!audioWriter || !channels) return
    audioWriter.write(new AudioDataClass({
      format: 's16',
      sampleRate: message.a,
      numberOfChannels: channels,
      numberOfFrames: message.payload.byteLength / (2 * channels),
      timestamp: message.timestamp,
      data: message.payload
    })).catch(() => {})
  }

  // Listen before start: the plugin posts the port just before start resolves.
  let removePortListener = () => {}
  let timer
  const portReady = new Promise(resolve => {
    const onMessage = event => {
      if (event.data !== TAURI_SCREEN_CAPTURE || !event.ports?.[0]) return
      removePortListener()
      resolve(event.ports[0])
    }
    removePortListener = () => {
      clearTimeout(timer)
      windowRef.removeEventListener?.('message', onMessage)
    }
    windowRef.addEventListener?.('message', onMessage)
  })

  const cleanup = async () => {
    if (stopped) return
    stopped = true
    removePortListener()
    if (port) port.onmessage = null
    port?.close?.()
    try { decoder?.close() } catch (_error) {}
    await Promise.allSettled([
      stoppedListener?.remove?.(),
      videoWriter.close(),
      audioWriter?.close?.(),
      plugin.stop?.()
    ])
  }

  try {
    stoppedListener = await plugin.addListener('stopped', () => {
      // Android ended the projection (notification or system). track.stop() fires no
      // 'ended', so dispatch it: callers unpublish and reset their UI on that event.
      stream?.getTracks?.().forEach(track => {
        track.stop()
        track.dispatchEvent?.(new Event('ended'))
      })
      void cleanup()
    })
    const capture = await plugin.start({ quality, audio })
    // Timed from here, not before: start waits on Android's consent dialog, which takes as long as the user reads it.
    port = await Promise.race([portReady, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new DOMException('Screen capture did not connect.', 'NotSupportedError')), portTimeoutMs)
    })])
    const tracks = [video]
    if (capture?.audio && AudioDataClass) {
      const audioTrack = new TrackGenerator({ kind: 'audio' })
      audioWriter = audioTrack.writable.getWriter()
      tracks.push(audioTrack)
    }
    // The size the plugin settled on (1080p60 needs encoder support).
    Object.defineProperty(video, '_messappScreenQuality', { configurable: true, value: capture?.high ? 'high' : 'standard' })
    port.onmessage = event => {
      if (stopped) return
      const message = parseScreenMessage(event.data)
      if (message?.type === SCREEN_MESSAGE.VIDEO) onVideo(message)
      else if (message?.type === SCREEN_MESSAGE.AUDIO) onAudio(message)
    }
    stream = new MediaStreamClass(tracks)
    stream.addEventListener?.('inactive', cleanup, { once: true })
    Object.defineProperty(stream, '_messappStopNativeCapture', { configurable: true, value: cleanup })
    return stream
  } catch (error) {
    await cleanup()
    throw error
  }
}

async function createNativeScreenCaptureStream({
  plugin = NativeScreenCapture,
  documentRef = globalThis.document,
  ImageClass = globalThis.Image,
  TrackGenerator = globalThis.MediaStreamTrackGenerator,
  VideoFrameClass = globalThis.VideoFrame,
  MediaStreamClass = globalThis.MediaStream
} = {}) {
  // Sharing another app puts MessApp in the background, and the Android WebView is
  // paused there (WryActivity calls WebView.onPause), which can stall a canvas
  // capture. A track generator takes frames without rendering, so it is preferred.
  const useGenerator = Boolean(TrackGenerator && VideoFrameClass && MediaStreamClass)
  const canvas = useGenerator ? null : documentRef?.createElement?.('canvas')
  if (!ImageClass || (!useGenerator && !canvas?.captureStream)) {
    throw new DOMException('Native screen capture cannot create a video stream in this app build.', 'NotSupportedError')
  }

  let stopped = false
  let drawing = false
  let pendingFrame = null
  let paint
  let generator
  let writer
  if (useGenerator) {
    generator = new TrackGenerator({ kind: 'video' })
    writer = generator.writable.getWriter()
    // write() closes the VideoFrame; a rejected write only means the track ended.
    paint = image => writer.write(new VideoFrameClass(image, { timestamp: Math.round(performance.now() * 1000) })).catch(() => {})
  } else {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new DOMException('Native screen capture could not initialize its video surface.', 'NotSupportedError')
    paint = image => context.drawImage(image, 0, 0, canvas.width, canvas.height)
  }

  const drawFrame = frame => {
    if (stopped) return
    if (drawing) {
      pendingFrame = frame
      return
    }
    drawing = true
    const image = new ImageClass()
    image.onload = () => {
      if (!stopped) paint(image)
      drawing = false
      const nextFrame = pendingFrame
      pendingFrame = null
      if (nextFrame) drawFrame(nextFrame)
    }
    image.onerror = () => {
      drawing = false
    }
    image.src = frame.dataUrl
  }

  let stream
  let frameListener
  let stoppedListener
  const cleanup = async () => {
    if (stopped) return
    stopped = true
    await Promise.allSettled([
      frameListener?.remove?.(),
      stoppedListener?.remove?.(),
      writer?.close?.(),
      plugin.stop?.()
    ])
  }

  try {
    frameListener = await plugin.addListener('frame', drawFrame)
    stoppedListener = await plugin.addListener('stopped', () => {
      // Android ended the projection (notification or system). track.stop() fires no
      // 'ended', so dispatch it: callers unpublish and reset their UI on that event.
      stream?.getTracks?.().forEach(track => {
        track.stop()
        track.dispatchEvent?.(new Event('ended'))
      })
      void cleanup()
    })
    const capture = await plugin.start()
    if (useGenerator) {
      stream = new MediaStreamClass([generator])
    } else {
      canvas.width = Math.max(1, capture?.width || 720)
      canvas.height = Math.max(1, capture?.height || 1280)
      stream = canvas.captureStream(Math.max(1, capture?.frameRate || 10))
    }
    const videoTrack = stream.getVideoTracks?.()[0]
    if (!videoTrack) {
      throw new DOMException('Native screen capture did not create a video track.', 'NotSupportedError')
    }
    stream.addEventListener?.('inactive', cleanup, { once: true })
    Object.defineProperty(stream, '_messappStopNativeCapture', {
      configurable: true,
      value: cleanup
    })
    return stream
  } catch (error) {
    await cleanup()
    throw error
  }
}

/**
 * audio: false skips the shared sound. viewers picks the Android quality (pickScreenQuality).
 * Tests pass tauriMobile or isNativePlatform with fakes to reach the Android paths.
 */
export async function getScreenCaptureStream(mediaDevices, { audio = true, viewers = 1, tauriMobile = isTauriMobile(), ...nativeOptions } = {}) {
  if (!mediaDevices?.getDisplayMedia) {
    if (tauriMobile) return createTauriScreenCaptureStream({ quality: pickScreenQuality(viewers), audio, ...nativeOptions })
    const isNativeAndroid = nativeOptions.isNativePlatform ?? (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
    if (isNativeAndroid) return createNativeScreenCaptureStream(nativeOptions)
    throw new DOMException('Screen capture is unavailable in this browser or app build.', 'NotSupportedError')
  }
  try {
    return await mediaDevices.getDisplayMedia({ video: true, audio })
  } catch (error) {
    if (!audio || !VIDEO_ONLY_FALLBACK_ERRORS.has(error?.name)) throw error
    return mediaDevices.getDisplayMedia({ video: true, audio: false })
  }
}

export function getScreenCaptureErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
    return 'Screen sharing was cancelled or blocked by the device.'
  }
  if (error?.name === 'NotSupportedError') {
    return 'This mobile browser or app build does not support screen capture.'
  }
  return 'Could not start screen sharing.'
}
