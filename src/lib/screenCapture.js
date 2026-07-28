import { Capacitor, registerPlugin } from '@capacitor/core'

const VIDEO_ONLY_FALLBACK_ERRORS = new Set(['TypeError', 'OverconstrainedError', 'NotSupportedError'])
const NativeScreenCapture = registerPlugin('ScreenCapture')

async function createNativeScreenCaptureStream({
  plugin = NativeScreenCapture,
  documentRef = globalThis.document,
  ImageClass = globalThis.Image
} = {}) {
  const canvas = documentRef?.createElement?.('canvas')
  if (!canvas?.captureStream || !ImageClass) {
    throw new DOMException('Native screen capture cannot create a video stream in this app build.', 'NotSupportedError')
  }

  let stopped = false
  let drawing = false
  let pendingFrame = null
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new DOMException('Native screen capture could not initialize its video surface.', 'NotSupportedError')

  const drawFrame = frame => {
    if (stopped) return
    if (drawing) {
      pendingFrame = frame
      return
    }
    drawing = true
    const image = new ImageClass()
    image.onload = () => {
      if (!stopped) context.drawImage(image, 0, 0, canvas.width, canvas.height)
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
      plugin.stop?.()
    ])
  }

  try {
    frameListener = await plugin.addListener('frame', drawFrame)
    stoppedListener = await plugin.addListener('stopped', () => {
      stream?.getTracks?.().forEach(track => track.stop())
      void cleanup()
    })
    const capture = await plugin.start()
    canvas.width = Math.max(1, capture?.width || 720)
    canvas.height = Math.max(1, capture?.height || 1280)
    stream = canvas.captureStream(Math.max(1, capture?.frameRate || 10))
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

export async function getScreenCaptureStream(mediaDevices, nativeOptions = {}) {
  if (!mediaDevices?.getDisplayMedia) {
    const isNativeAndroid = nativeOptions.isNativePlatform ?? (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    )
    if (isNativeAndroid) return createNativeScreenCaptureStream(nativeOptions)
    throw new DOMException('Screen capture is unavailable in this browser or app build.', 'NotSupportedError')
  }
  try {
    return await mediaDevices.getDisplayMedia({ video: true, audio: true })
  } catch (error) {
    if (!VIDEO_ONLY_FALLBACK_ERRORS.has(error?.name)) throw error
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
