/**
 * Reports a video's intrinsic aspect ratio so its container can take the shape
 * of what is actually being sent. A phone screen share arrives portrait and a
 * desktop one lands near 16:9; a fixed box letterboxes whichever it guessed
 * wrong, which is most of the picture on a mini player.
 */
import { useCallback, useState } from 'react'

export const DEFAULT_ASPECT_RATIO = 16 / 9
// Encoder resolution can wobble by a pixel between frames; re-rendering the
// container for that would fight the CSS transition for no visible gain.
const SIGNIFICANT_CHANGE = 0.01

/** @returns {number|null} null until the first frame's dimensions are known. */
export function aspectRatioOf(video) {
  const width = video?.videoWidth || 0
  const height = video?.videoHeight || 0
  if (width <= 0 || height <= 0) return null
  return width / height
}

export default function useVideoAspectRatio() {
  const [aspectRatio, setAspectRatio] = useState(null)

  const measure = useCallback(target => {
    const next = aspectRatioOf(target?.target || target)
    if (!next) return
    setAspectRatio(current => (current && Math.abs(current - next) < SIGNIFICANT_CHANGE ? current : next))
  }, [])

  return {
    aspectRatio,
    /** Spread on the <video> whose shape the container should follow. */
    videoAspectProps: { onLoadedMetadata: measure, onResize: measure }
  }
}
