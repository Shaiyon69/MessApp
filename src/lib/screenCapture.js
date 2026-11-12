import { Capacitor, registerPlugin } from '@capacitor/core'
import { addPluginListener, invoke } from '@tauri-apps/api/core'
import { isTauriMobile } from './platform.js'

const VIDEO_ONLY_FALLBACK_ERRORS = new Set(['TypeError', 'OverconstrainedError', 'NotSupportedError'])
const TAURI_SCREEN_CAPTURE = 'messapp-screen-capture'

/** Tauri Android: the Capacitor ScreenCapture interface, through the messapp-screen-capture plugin. */
export const createTauriScreenCapture = ({ tauriInvoke = invoke, tauriAddPluginListener = addPluginListener } = {}) => {
  // Kotlin rejects with { message, code }; the code is the DOMException name the error messages expect.
  const command = name => () => tauriInvoke(`plugin:${TAURI_SCREEN_CAPTURE}|${name}`).catch(error => {
    throw new DOMException(error?.message || String(error), error?.code || 'NotSupportedError')
  })
  return {
    start: command('start'),
    stop: command('stop'),
    addListener: async (event, handler) => {
      const listener = await tauriAddPluginListener(TAURI_SCREEN_CAPTURE, event, handler)
      return { remove: () => listener.unregister() }
    }
  }
}

const NativeScreenCapture = isTauriMobile() ? createTauriScreenCapture() : registerPlugin('ScreenCapture')

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

/** audio: false skips display audio (1:1 calls send video only). */
export async function getScreenCaptureStream(mediaDevices, { audio = true, ...nativeOptions } = {}) {
  if (!mediaDevices?.getDisplayMedia) {
    const isNativeAndroid = nativeOptions.isNativePlatform ?? (
      isTauriMobile() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
    )
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
