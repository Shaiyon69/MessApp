export const MEDIA_ASPECTS = Object.freeze({
  original: null,
  square: 1,
  portrait: 4 / 5,
  landscape: 16 / 9
})

export const clampMediaValue = (value, minimum, maximum) =>
  Math.min(Math.max(Number(value) || 0, minimum), maximum)

export function resolveMediaAspect(aspect, sourceWidth, sourceHeight) {
  const configured = MEDIA_ASPECTS[aspect]
  if (configured) return configured
  return sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1
}

export function getMediaOutputSize({
  sourceWidth,
  sourceHeight,
  aspect = 'original',
  maxDimension = 1600
}) {
  const ratio = resolveMediaAspect(aspect, sourceWidth, sourceHeight)
  const safeMax = Math.max(64, Math.round(maxDimension || 1600))
  if (ratio >= 1) {
    return { width: safeMax, height: Math.max(1, Math.round(safeMax / ratio)) }
  }
  return { width: Math.max(1, Math.round(safeMax * ratio)), height: safeMax }
}

export function normalizeMediaEdits(edits = {}) {
  return {
    aspect: MEDIA_ASPECTS[edits.aspect] !== undefined ? edits.aspect : 'original',
    rotation: ((Math.round(Number(edits.rotation) || 0) % 360) + 360) % 360,
    zoom: clampMediaValue(edits.zoom || 1, 1, 3),
    offsetX: clampMediaValue(edits.offsetX, -100, 100),
    offsetY: clampMediaValue(edits.offsetY, -100, 100),
    brightness: clampMediaValue(edits.brightness || 100, 50, 150),
    saturation: clampMediaValue(edits.saturation || 100, 0, 200),
    hue: clampMediaValue(edits.hue, -180, 180),
    strokes: Array.isArray(edits.strokes) ? edits.strokes : []
  }
}

export function drawEditedMediaFrame(context, source, edits, width, height) {
  const normalized = normalizeMediaEdits(edits)
  const rotated = normalized.rotation === 90 || normalized.rotation === 270
  const sourceWidth = rotated ? source.videoHeight || source.naturalHeight || source.height : source.videoWidth || source.naturalWidth || source.width
  const sourceHeight = rotated ? source.videoWidth || source.naturalWidth || source.width : source.videoHeight || source.naturalHeight || source.height
  const coverScale = Math.max(width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight)) * normalized.zoom
  const drawWidth = (source.videoWidth || source.naturalWidth || source.width) * coverScale
  const drawHeight = (source.videoHeight || source.naturalHeight || source.height) * coverScale

  context.save()
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#050506'
  context.fillRect(0, 0, width, height)
  context.translate(
    width / 2 + (normalized.offsetX / 100) * width,
    height / 2 + (normalized.offsetY / 100) * height
  )
  context.rotate((normalized.rotation * Math.PI) / 180)
  context.filter = `brightness(${normalized.brightness}%) saturate(${normalized.saturation}%) hue-rotate(${normalized.hue}deg)`
  context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  context.restore()

  for (const stroke of normalized.strokes) {
    const points = Array.isArray(stroke.points) ? stroke.points : []
    if (points.length < 2) continue
    context.save()
    context.strokeStyle = stroke.color || '#ffffff'
    context.lineWidth = Math.max(1, Number(stroke.width) || 0.008) * Math.min(width, height)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    points.forEach((point, index) => {
      const x = clampMediaValue(point.x, 0, 1) * width
      const y = clampMediaValue(point.y, 0, 1) * height
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
    context.restore()
  }
}

const waitForMediaEvent = (target, eventName, errorName = 'error') => new Promise((resolve, reject) => {
  const onReady = () => {
    cleanup()
    resolve()
  }
  const onError = () => {
    cleanup()
    reject(new Error('The selected media could not be decoded.'))
  }
  const cleanup = () => {
    target.removeEventListener(eventName, onReady)
    target.removeEventListener(errorName, onError)
  }
  target.addEventListener(eventName, onReady, { once: true })
  target.addEventListener(errorName, onError, { once: true })
})

export async function createEditedImageFile(file, edits, options = {}) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl
    if (!image.complete) await waitForMediaEvent(image, 'load')
    else if (image.decode) await image.decode()
    const { width, height } = getMediaOutputSize({
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      aspect: edits.aspect,
      maxDimension: options.maxDimension || 1600
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    drawEditedMediaFrame(context, image, edits, width, height)
    const type = options.type || 'image/webp'
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, options.quality || 0.92))
    if (!blob) throw new Error('The edited image could not be exported.')
    const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '')
    const extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp'
    return new File([blob], `${baseName}-edited.${extension}`, { type, lastModified: Date.now() })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function getSupportedEditedVideoType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass) return ''
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(type => !MediaRecorderClass.isTypeSupported || MediaRecorderClass.isTypeSupported(type)) || ''
}

export async function createEditedVideoFile(file, edits, options = {}) {
  if (!document.createElement('canvas').captureStream || !globalThis.MediaRecorder) {
    throw new Error('Video cropping is not supported by this browser.')
  }
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = objectUrl
  video.playsInline = true
  video.muted = true
  video.preload = 'auto'
  try {
    await waitForMediaEvent(video, 'loadedmetadata')
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The video duration is unavailable.')
    if (video.duration > (options.maxDuration || 90)) throw new Error('Video cropping currently supports clips up to 90 seconds.')
    const { width, height } = getMediaOutputSize({
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      aspect: edits.aspect,
      maxDimension: options.maxDimension || 1280
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    const outputStream = canvas.captureStream(options.frameRate || 30)
    const sourceStream = video.captureStream?.()
    sourceStream?.getAudioTracks?.().forEach(track => outputStream.addTrack(track))
    const mimeType = getSupportedEditedVideoType()
    if (!mimeType) throw new Error('This browser cannot export an edited video.')
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond || 4_000_000
    })
    const chunks = []
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data)
    }
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve
      recorder.onerror = () => reject(new Error('The edited video could not be encoded.'))
    })
    let frameHandle = null
    const drawFrame = () => {
      drawEditedMediaFrame(context, video, { ...edits, strokes: [] }, width, height)
      options.onProgress?.(Math.min(1, video.currentTime / video.duration))
      if (!video.ended && !video.paused) {
        frameHandle = video.requestVideoFrameCallback
          ? video.requestVideoFrameCallback(drawFrame)
          : requestAnimationFrame(drawFrame)
      }
    }
    recorder.start(500)
    video.currentTime = 0
    await video.play()
    drawFrame()
    await waitForMediaEvent(video, 'ended')
    if (video.cancelVideoFrameCallback && frameHandle) video.cancelVideoFrameCallback(frameHandle)
    else if (frameHandle) cancelAnimationFrame(frameHandle)
    recorder.stop()
    await stopped
    outputStream.getTracks().forEach(track => track.stop())
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
    if (!blob.size) throw new Error('The edited video is empty.')
    const baseName = String(file.name || 'video').replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}-cropped.webm`, { type: 'video/webm', lastModified: Date.now() })
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}
