export function getVideoPreviewTime(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(0.1, duration / 2)
}

export function getVideoAspectRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 16 / 9
  }
  return Math.min(4, Math.max(1 / 4, width / height))
}

export function primeVideoPreview(event) {
  const video = event?.currentTarget
  if (!video || video.currentTime > 0.001 || video.seeking) return
  const previewTime = getVideoPreviewTime(video.duration)
  if (previewTime > 0) {
    try {
      video.currentTime = previewTime
    } catch (_err) {
      // Some engines reject a metadata-time seek and accept it at loadeddata.
    }
  }
}
