const VIDEO_ONLY_FALLBACK_ERRORS = new Set(['TypeError', 'OverconstrainedError', 'NotSupportedError'])

export async function getScreenCaptureStream(mediaDevices) {
  if (!mediaDevices?.getDisplayMedia) {
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
