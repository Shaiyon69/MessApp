import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Brush, Crop, Loader2, RotateCw, Scissors, Type, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import {
  TEXT_SIZE,
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
  strokes: [],
  texts: [],
  trimStart: 0,
  trimEnd: null,
  muted: false
})

const pointerSpread = pointers => {
  const [first, second] = [...pointers.values()]
  return Math.hypot(first.x - second.x, first.y - second.y)
}

const formatTime = seconds => {
  const total = Math.max(0, Math.round(seconds || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/* Messenger-style: the photo or clip fills the screen between a top bar
   (Cancel, Undo, Done) and a bottom panel (the active tool's options over a
   labelled tool bar). Photos crop, rotate, draw and caption; clips trim, crop,
   rotate, caption and mute. Captions are live HTML over the preview and are
   only burned into the pixels on export, so they stay draggable and editable
   until Done. */
export default function MediaEditorModal({
  file,
  profile = false,
  onCancel,
  onSave,
  title = profile ? 'Edit profile photo' : 'Edit media'
}) {
  const isVideo = String(file?.type || '').startsWith('video/')
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const imageRef = useRef(null)
  const stageRef = useRef(null)
  const interactionRef = useRef(null)
  // Live pointers, so a second finger can turn a drag into a pinch mid-gesture.
  const pointersRef = useRef(new Map())
  const [objectUrl, setObjectUrl] = useState('')
  const [sourceSize, setSourceSize] = useState({ width: 1, height: 1 })
  const [duration, setDuration] = useState(0)
  const [edits, setEdits] = useState(() => initialEdits(profile))
  // 'move' (no tool), 'crop', 'paint', 'text' or 'trim'. Clips open on Trim.
  const [tool, setTool] = useState(isVideo ? 'trim' : 'move')
  const [paintColor, setPaintColor] = useState(PAINT_COLORS[0])
  // The caption being typed: { index (null for a new one), text, color }.
  const [textDraft, setTextDraft] = useState(null)
  // 'strokes' or 'texts' per stroke or caption added, newest last, so Undo
  // removes the latest of either whatever tool is open.
  const [undoStack, setUndoStack] = useState([])
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
    // Captions are drawn as HTML on top of the preview, not into it.
    drawEditedMediaFrame(context, imageRef.current, { ...edits, texts: [] }, canvas.width, canvas.height)
  }, [edits, isVideo, previewSize, sourceSize])

  // The preview loops inside the trim range, so what plays is what gets sent.
  const trimEnd = edits.trimEnd ?? duration
  const onVideoTime = event => {
    const video = event.currentTarget
    if (duration && (video.currentTime >= trimEnd || video.currentTime < edits.trimStart - 0.25)) {
      video.currentTime = edits.trimStart
    }
  }
  const setTrim = (key, value) => {
    setEdits(current => {
      const end = current.trimEnd ?? duration
      const next = key === 'trimStart'
        ? { ...current, trimStart: Math.min(value, end - 0.5) }
        : { ...current, trimEnd: Math.max(value, current.trimStart + 0.5) }
      if (videoRef.current) videoRef.current.currentTime = key === 'trimStart' ? next.trimStart : Math.max(next.trimStart, next.trimEnd - 1)
      return next
    })
  }

  const setZoom = value => setEdits(current => ({ ...current, zoom: clampMediaValue(value, MIN_ZOOM, MAX_ZOOM) }))

  const stagePosition = event => {
    const rect = stageRef.current.getBoundingClientRect()
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
    if (tool === 'paint' && !isVideo) {
      const point = stagePosition(event)
      setEdits(current => ({
        ...current,
        strokes: [...current.strokes, { color: paintColor, width: BRUSH_WIDTH, points: [point, point] }]
      }))
      setUndoStack(stack => [...stack, 'strokes'])
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
      const point = stagePosition(event)
      setEdits(current => ({
        ...current,
        strokes: current.strokes.map((stroke, index) => index === current.strokes.length - 1
          ? { ...stroke, points: [...stroke.points, point] }
          : stroke)
      }))
      return
    }
    if (interaction.type === 'text') {
      const point = stagePosition(event)
      setEdits(current => ({
        ...current,
        texts: current.texts.map((item, index) => index === interaction.index ? { ...item, x: point.x, y: point.y } : item)
      }))
      interaction.moved = interaction.moved || Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY) > 4
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
    const interaction = interactionRef.current
    interactionRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    // A tap on a caption (no drag) reopens it for editing.
    if (interaction?.type === 'text' && !interaction.moved) {
      const item = edits.texts[interaction.index]
      if (item) setTextDraft({ index: interaction.index, text: item.text, color: item.color })
    }
  }

  const startTextDrag = (event, index) => {
    event.stopPropagation()
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    stageRef.current?.setPointerCapture?.(event.pointerId)
    interactionRef.current = { type: 'text', index, startX: event.clientX, startY: event.clientY, moved: false }
  }

  const commitText = () => {
    const draft = textDraft
    setTextDraft(null)
    setTool(current => (current === 'text' ? 'move' : current))
    if (!draft) return
    const text = draft.text.trim()
    if (draft.index === null && text) setUndoStack(stack => [...stack, 'texts'])
    // A cleared caption is deleted: drop one caption entry so the stack still matches.
    if (draft.index !== null && !text) {
      setUndoStack(stack => {
        const at = stack.lastIndexOf('texts')
        return at < 0 ? stack : [...stack.slice(0, at), ...stack.slice(at + 1)]
      })
    }
    setEdits(current => {
      const texts = [...current.texts]
      if (draft.index === null) {
        if (text) texts.push({ text, color: draft.color, x: 0.5, y: 0.45, size: TEXT_SIZE })
      } else if (text) {
        texts[draft.index] = { ...texts[draft.index], text, color: draft.color }
      } else {
        texts.splice(draft.index, 1)
      }
      return { ...current, texts }
    })
  }

  // Desktop has no pinch, and the profile crops are mostly used there.
  const handleWheel = event => setZoom(edits.zoom - event.deltaY * 0.002)

  const undoTarget = undoStack.at(-1)
  const undo = () => {
    if (!undoTarget) return
    setUndoStack(stack => stack.slice(0, -1))
    setEdits(current => ({ ...current, [undoTarget]: current[undoTarget].slice(0, -1) }))
  }
  const cropTouched = edits.aspect !== initialEdits(profile).aspect || edits.rotation || edits.zoom !== 1 || edits.offsetX || edits.offsetY
  const resetCrop = () => {
    const base = initialEdits(profile)
    setEdits(current => ({ ...current, aspect: base.aspect, rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 }))
  }
  const openText = () => {
    setTool('text')
    setTextDraft({ index: null, text: '', color: PAINT_COLORS[0] })
  }
  const pickTool = id => (id === 'text' ? openText() : setTool(current => (current === id ? 'move' : id)))

  const applyEdit = async () => {
    setProcessing(true)
    setProgress(0)
    setError('')
    try {
      videoRef.current?.pause()
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
  // The editor is always on black, so its blues are fixed: theme accents can be dark.
  const iconButton = 'grid h-10 w-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#adc6ff] disabled:opacity-40'
  const chip = active => `rounded-full border px-3.5 py-1.5 type-meta font-bold transition-colors ${active ? 'border-[#7fa7e0] bg-[#3b82f633] text-white' : 'border-white/15 text-white/70 hover:text-white'}`
  const tools = [
    isVideo && { id: 'trim', label: 'Trim', Icon: Scissors },
    { id: 'crop', label: 'Crop', Icon: Crop },
    !isVideo && { id: 'paint', label: 'Draw', Icon: Brush },
    !profile && { id: 'text', label: 'Text', Icon: Type }
  ].filter(Boolean)

  if (!file) return null
  return createPortal(
    <div className="fixed inset-0 z-[240] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancel} disabled={processing} className={iconButton} aria-label="Close media editor"><X size={20} /></button>
        <button type="button" onClick={undo} disabled={!undoTarget || processing} className={iconButton} aria-label={undoTarget === 'texts' ? 'Undo caption' : 'Undo stroke'} title="Undo"><Undo2 size={20} /></button>
        <button
          type="button"
          onClick={applyEdit}
          disabled={processing || Boolean(error && !imageRef.current && !isVideo)}
          className="flex h-10 items-center gap-2 rounded-full bg-[var(--app-gold)] px-5 type-label font-bold text-[var(--on-app-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? 'Working…' : profile ? 'Use photo' : 'Done'}
        </button>
      </div>

      {/* The stage is a size container, so the media box keeps its aspect
          however tall or wide the screen is. */}
      <div className="media-editor-area flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          ref={stageRef}
          className={`media-editor-stage relative touch-none overflow-hidden ${tool === 'paint' && !isVideo ? 'cursor-crosshair' : 'cursor-move'}`}
          style={{ '--media-aspect': isVideo ? aspect : previewSize.width / previewSize.height }}
          {...surfaceHandlers}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              src={objectUrl}
              autoPlay
              loop
              playsInline
              muted={edits.muted}
              preload="metadata"
              onTimeUpdate={onVideoTime}
              onLoadedMetadata={event => {
                setSourceSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
                setDuration(event.currentTarget.duration || 0)
              }}
              className="h-full w-full object-cover"
              style={{
                transform: `translate(${edits.offsetX}%, ${edits.offsetY}%) rotate(${edits.rotation}deg) scale(${edits.zoom})`
              }}
            />
          ) : (
            <canvas ref={canvasRef} className="block h-full w-full" />
          )}
          {edits.texts.map((item, index) => (
            <button
              key={`text-${index}`}
              type="button"
              onPointerDown={event => startTextDrag(event, index)}
              className="media-editor-caption absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 cursor-grab whitespace-pre-wrap text-center font-bold leading-tight"
              style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, color: item.color, fontSize: `calc(min(100cqw, 100cqh) * ${item.size || TEXT_SIZE})` }}
              aria-label={`Caption: ${item.text}. Drag to move, tap to edit.`}
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-black px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {/* Done already took its snapshot of the edits, so the panel waits while it renders. */}
          <fieldset disabled={processing} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0 empty:hidden">
          {tool === 'crop' && (
            <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Crop shape">
              {/* Profile crops are locked square, so the shape chips would have one option. */}
              {!profile && ASPECT_OPTIONS.map(option => (
                <button key={option.id} type="button" onClick={() => setEdits(current => ({ ...current, aspect: option.id }))} className={chip(edits.aspect === option.id)} aria-pressed={edits.aspect === option.id}>
                  {option.label}
                </button>
              ))}
              <button type="button" onClick={() => setEdits(current => ({ ...current, rotation: (current.rotation + 90) % 360 }))} className={iconButton} aria-label="Rotate 90 degrees" title="Rotate"><RotateCw size={18} /></button>
              <button type="button" onClick={resetCrop} disabled={!cropTouched} className={`${chip(false)} disabled:opacity-40`} aria-label="Reset crop">Reset</button>
            </div>
          )}

          {tool === 'paint' && !isVideo && (
            <div className="flex items-center justify-center gap-2" role="group" aria-label="Brush color">
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
            </div>
          )}

          {tool === 'trim' && isVideo && duration > 0 && (
            <div>
              <div className="media-trim relative h-8">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20" />
                <div
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--app-gold)]"
                  style={{ left: `${(edits.trimStart / duration) * 100}%`, right: `${100 - (trimEnd / duration) * 100}%` }}
                />
                <input type="range" min={0} max={duration} step={0.1} value={edits.trimStart} onChange={event => setTrim('trimStart', Number(event.target.value))} aria-label="Trim start" className="media-trim-input" />
                <input type="range" min={0} max={duration} step={0.1} value={trimEnd} onChange={event => setTrim('trimEnd', Number(event.target.value))} aria-label="Trim end" className="media-trim-input" />
              </div>
              <div className="mt-1 flex justify-between type-meta tabular-nums text-white/60">
                <span>{formatTime(edits.trimStart)}</span>
                <span className="font-semibold text-white">Keeping {formatTime(trimEnd - edits.trimStart)}</span>
                <span>{formatTime(trimEnd)}</span>
              </div>
            </div>
          )}

          </fieldset>

          {error && <p className="rounded-xl bg-[#e5676f]/15 px-3 py-2 text-center type-meta font-semibold text-[#e5676f]" role="alert">{error}</p>}
          {processing && isVideo && (
            <div>
              <div className="mb-1 flex justify-between type-meta font-bold text-white/70"><span>Rendering video</span><span className="tabular-nums">{Math.round(progress * 100)}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[#3b82f6] transition-[width]" style={{ width: `${progress * 100}%` }} /></div>
            </div>
          )}

          <div className="flex justify-around" role="group" aria-label="Editing tools">
            {tools.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => pickTool(id)}
                disabled={processing}
                aria-pressed={tool === id}
                className={`flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 type-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#adc6ff] ${tool === id ? 'bg-[#3b82f633] text-white' : 'text-white/60 hover:text-white'}`}
              >
                <Icon size={20} className={tool === id ? 'text-[#adc6ff]' : ''} />
                {label}
              </button>
            ))}
            {isVideo && (
              <button
                type="button"
                onClick={() => setEdits(current => ({ ...current, muted: !current.muted }))}
                disabled={processing}
                aria-pressed={edits.muted}
                aria-label={edits.muted ? 'Turn sound back on' : 'Mute video'}
                className="flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 type-meta text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#adc6ff]"
              >
                {edits.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                {edits.muted ? 'Muted' : 'Sound'}
              </button>
            )}
          </div>
        </div>
      </div>

      {textDraft && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/70 backdrop-blur-sm" role="dialog" aria-label="Caption">
          <div className="flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={commitText} className="rounded-full bg-white px-5 py-2 type-label font-bold text-black">Done</button>
          </div>
          <div className="flex flex-1 items-center justify-center px-6">
            <textarea
              autoFocus
              rows={2}
              value={textDraft.text}
              onChange={event => setTextDraft(draft => ({ ...draft, text: event.target.value }))}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitText() } }}
              placeholder="Type something"
              aria-label="Caption text"
              className="w-full max-w-xl resize-none bg-transparent text-center text-3xl font-bold outline-none placeholder:text-white/40"
              style={{ color: textDraft.color }}
            />
          </div>
          <div className="flex justify-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {PAINT_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setTextDraft(draft => ({ ...draft, color }))}
                style={{ backgroundColor: color }}
                className={`h-8 w-8 rounded-full border-2 ${textDraft.color === color ? 'scale-110 border-white' : 'border-white/30'}`}
                aria-pressed={textDraft.color === color}
                aria-label={`Text in ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
