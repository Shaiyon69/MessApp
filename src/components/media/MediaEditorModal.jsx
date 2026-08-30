import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Brush, Check, Crop, Loader2, RotateCw, Undo2, X } from 'lucide-react'
import {
  clampMediaValue,
  createEditedImageFile,
  createEditedVideoFile,
  drawEditedMediaFrame,
  resolveMediaAspect
} from '../../lib/mediaEditor'

const ASPECT_OPTIONS = [
  { id: 'original', label: 'Original' },
  { id: 'square', label: '1:1' },
  { id: 'portrait', label: '4:5' },
  { id: 'landscape', label: '16:9' }
]

const PAINT_COLORS = ['#ffffff', '#000000', '#ef4444', '#facc15', '#22c55e', '#3b82f6']
const BRUSH_WIDTH = 0.012
const MIN_ZOOM = 1
const MAX_ZOOM = 3

const initialEdits = profile => ({
  aspect: profile ? 'square' : 'original',
  rotation: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  strokes: []
})

const pointerSpread = pointers => {
  const [first, second] = [...pointers.values()]
  return Math.hypot(first.x - second.x, first.y - second.y)
}

/* One photo, a handful of icons over it. Colour grading lived here once and only
   made the sheet harder to read — the lib still defaults those to identity. */
export default function MediaEditorModal({
  file,
  profile = false,
  onCancel,
  onSave,
  title = profile ? 'Edit profile photo' : 'Edit media'
}) {
  const isVideo = String(file?.type || '').startsWith('video/')
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const interactionRef = useRef(null)
  // Live pointers, so a second finger can turn a drag into a pinch mid-gesture.
  const pointersRef = useRef(new Map())
  const [objectUrl, setObjectUrl] = useState('')
  const [sourceSize, setSourceSize] = useState({ width: 1, height: 1 })
  const [edits, setEdits] = useState(() => initialEdits(profile))
  const [tool, setTool] = useState('move')
  const [cropOpen, setCropOpen] = useState(false)
  const [paintColor, setPaintColor] = useState(PAINT_COLORS[0])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file) return undefined
    const nextUrl = URL.createObjectURL(file)
    setObjectUrl(nextUrl)
    if (!isVideo) {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => {
        imageRef.current = image
        setSourceSize({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => setError('This image could not be decoded.')
      image.src = nextUrl
    }
    return () => {
      imageRef.current = null
      URL.revokeObjectURL(nextUrl)
    }
  }, [file, isVideo])

  const aspect = resolveMediaAspect(edits.aspect, sourceSize.width, sourceSize.height)
  const previewSize = useMemo(() => {
    const width = 720
    return { width, height: Math.max(280, Math.min(720, Math.round(width / aspect))) }
  }, [aspect])

  useEffect(() => {
    if (isVideo || !imageRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = previewSize.width
    canvas.height = previewSize.height
    const context = canvas.getContext('2d', { alpha: false })
    drawEditedMediaFrame(context, imageRef.current, edits, canvas.width, canvas.height)
  }, [edits, isVideo, previewSize])

  const setZoom = value => setEdits(current => ({ ...current, zoom: clampMediaValue(value, MIN_ZOOM, MAX_ZOOM) }))

  const pointerPosition = event => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    }
  }

  const handlePointerDown = event => {
    const pointers = pointersRef.current
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (pointers.size === 2) {
      interactionRef.current = { type: 'pinch', spread: pointerSpread(pointers), zoom: edits.zoom }
      return
    }
    if (pointers.size > 2) return
    if (tool === 'paint') {
      const point = pointerPosition(event)
      setEdits(current => ({
        ...current,
        strokes: [...current.strokes, { color: paintColor, width: BRUSH_WIDTH, points: [point, point] }]
      }))
      interactionRef.current = { type: 'paint' }
      return
    }
    interactionRef.current = {
      type: 'move',
      x: event.clientX,
      y: event.clientY,
      offsetX: edits.offsetX,
      offsetY: edits.offsetY
    }
  }

  const handlePointerMove = event => {
    const pointers = pointersRef.current
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const interaction = interactionRef.current
    if (!interaction) return
    if (interaction.type === 'pinch') {
      if (pointers.size < 2) return
      setZoom(interaction.zoom * (pointerSpread(pointers) / Math.max(1, interaction.spread)))
      return
    }
    if (interaction.type === 'paint') {
      const point = pointerPosition(event)
      setEdits(current => ({
        ...current,
        strokes: current.strokes.map((stroke, index) => index === current.strokes.length - 1
          ? { ...stroke, points: [...stroke.points, point] }
          : stroke)
      }))
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setEdits(current => ({
      ...current,
      offsetX: Math.min(100, Math.max(-100, interaction.offsetX + ((event.clientX - interaction.x) / rect.width) * 100)),
      offsetY: Math.min(100, Math.max(-100, interaction.offsetY + ((event.clientY - interaction.y) / rect.height) * 100))
    }))
  }

  const stopInteraction = event => {
    pointersRef.current.delete(event.pointerId)
    interactionRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  // Desktop has no pinch, and the profile crops are mostly used there.
  const handleWheel = event => setZoom(edits.zoom - event.deltaY * 0.002)

  const applyEdit = async () => {
    setProcessing(true)
    setProgress(0)
    setError('')
    try {
      const editedFile = isVideo
        ? await createEditedVideoFile(file, edits, { onProgress: setProgress })
        : await createEditedImageFile(file, edits, {
            maxDimension: profile ? 1024 : 1600,
            quality: profile ? 0.94 : 0.92
          })
      await onSave(editedFile)
    } catch (editError) {
      setError(editError?.message || 'The media could not be edited.')
    } finally {
      setProcessing(false)
    }
  }

  const surfaceHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: stopInteraction,
    onPointerCancel: stopInteraction,
    onWheel: handleWheel
  }
  const toolButton = 'grid h-10 w-10 place-items-center rounded-full backdrop-blur transition-colors disabled:opacity-40'
  const toolIdle = 'bg-black/55 text-white hover:bg-black/70'
  const toolActive = 'bg-white text-black'

  if (!file) return null
  return createPortal(
    <div className="fixed inset-0 z-[240] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {isVideo ? (
          <div
            className="relative max-h-full w-full max-w-3xl touch-none overflow-hidden"
            style={{ aspectRatio: String(aspect) }}
            {...surfaceHandlers}
          >
            <video
              src={objectUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={event => setSourceSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
              className="h-full w-full object-cover"
              style={{
                transform: `translate(${edits.offsetX}%, ${edits.offsetY}%) rotate(${edits.rotation}deg) scale(${edits.zoom})`
              }}
            />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={`max-h-full max-w-full touch-none ${tool === 'paint' ? 'cursor-crosshair' : 'cursor-move'}`}
            {...surfaceHandlers}
          />
        )}
      </div>

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancel} disabled={processing} className={`${toolButton} ${toolIdle}`} aria-label="Close media editor"><X size={18} /></button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEdits(current => ({ ...current, rotation: (current.rotation + 90) % 360 }))}
            className={`${toolButton} ${toolIdle}`}
            aria-label="Rotate 90 degrees"
          ><RotateCw size={18} /></button>
          {/* Profile crops are locked square, so the chips would have one option. */}
          {!profile && (
            <button
              type="button"
              onClick={() => setCropOpen(open => !open)}
              className={`${toolButton} ${cropOpen ? toolActive : toolIdle}`}
              aria-pressed={cropOpen}
              aria-label="Crop"
            ><Crop size={18} /></button>
          )}
          {!isVideo && (
            <button
              type="button"
              onClick={() => setTool(tool === 'paint' ? 'move' : 'paint')}
              className={`${toolButton} ${tool === 'paint' ? toolActive : toolIdle}`}
              aria-pressed={tool === 'paint'}
              aria-label="Draw"
            ><Brush size={18} /></button>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {cropOpen && !profile && (
          <div className="flex justify-center gap-2" role="group" aria-label="Crop shape">
            {ASPECT_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setEdits(current => ({ ...current, aspect: option.id }))}
                className={`rounded-full px-3.5 py-1.5 type-meta font-bold backdrop-blur ${edits.aspect === option.id ? 'bg-white text-black' : 'bg-black/55 text-white'}`}
                aria-pressed={edits.aspect === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {tool === 'paint' && !isVideo && (
          <div className="flex items-center justify-center gap-2">
            {PAINT_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setPaintColor(color)}
                style={{ backgroundColor: color }}
                className={`h-8 w-8 rounded-full border-2 transition-transform ${paintColor === color ? 'scale-110 border-white' : 'border-white/30'}`}
                aria-pressed={paintColor === color}
                aria-label={`Draw in ${color}`}
              />
            ))}
            <button
              type="button"
              onClick={() => setEdits(current => ({ ...current, strokes: current.strokes.slice(0, -1) }))}
              disabled={!edits.strokes.length}
              className={`${toolButton} ${toolIdle}`}
              aria-label="Undo stroke"
            ><Undo2 size={16} /></button>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-center type-meta font-semibold text-red-300">{error}</p>}
        {processing && isVideo && (
          <div>
            <div className="mb-1 flex justify-between type-meta font-bold text-gray-300"><span>Rendering video</span><span>{Math.round(progress * 100)}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress * 100}%` }} /></div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={applyEdit}
            disabled={processing || Boolean(error && !imageRef.current && !isVideo)}
            className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 type-meta font-black text-white shadow-lg disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {processing ? 'Processing…' : profile ? 'Use photo' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
