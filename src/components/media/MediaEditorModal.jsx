import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Brush, Check, Crop, Loader2, Move, Palette, RotateCw, Undo2, X } from 'lucide-react'
import {
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

const initialEdits = profile => ({
  aspect: profile ? 'square' : 'original',
  rotation: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  brightness: 100,
  saturation: 100,
  hue: 0,
  strokes: []
})

const Slider = ({ label, value, min, max, step = 1, onChange, valueLabel }) => (
  <label className="block">
    <span className="mb-1 flex items-center justify-between type-meta font-bold text-gray-400">
      <span>{label}</span>
      <span className="tabular-nums text-gray-500">{valueLabel || value}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      className="w-full accent-[var(--theme-base)]"
    />
  </label>
)

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
  const [objectUrl, setObjectUrl] = useState('')
  const [sourceSize, setSourceSize] = useState({ width: 1, height: 1 })
  const [edits, setEdits] = useState(() => initialEdits(profile))
  const [tool, setTool] = useState('move')
  const [paintColor, setPaintColor] = useState('#ffffff')
  const [paintWidth, setPaintWidth] = useState(0.012)
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

  const pointerPosition = event => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    }
  }

  const handlePointerDown = event => {
    if (isVideo && tool === 'paint') return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (tool === 'paint') {
      const point = pointerPosition(event)
      setEdits(current => ({
        ...current,
        strokes: [...current.strokes, { color: paintColor, width: paintWidth, points: [point, point] }]
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
    const interaction = interactionRef.current
    if (!interaction) return
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
    interactionRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

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

  if (!file) return null
  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" onClick={processing ? undefined : onCancel} aria-label="Close media editor" />
      <section className="premium-menu relative z-10 flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 sm:rounded-[2rem]">
        <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
          <div>
            <p className="type-label font-black text-[var(--text-main)]">{title}</p>
            <p className="type-meta text-gray-500">{isVideo ? 'Crop and reframe video' : profile ? 'Exports a sharp 1024 × 1024 profile image' : 'Crop, rotate, recolor, or draw'}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={processing} className="premium-icon-button grid h-10 w-10 place-items-center rounded-full disabled:opacity-40" aria-label="Close"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-h-[300px] items-center justify-center overflow-hidden bg-[#050506] p-3 sm:p-5">
            {isVideo ? (
              <div
                className="relative w-full max-w-3xl touch-none overflow-hidden rounded-2xl border border-white/10 bg-black"
                style={{ aspectRatio: String(aspect) }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopInteraction}
                onPointerCancel={stopInteraction}
              >
                <video
                  src={objectUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={event => setSourceSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
                  className="h-full w-full object-cover"
                  style={{
                    transform: `translate(${edits.offsetX}%, ${edits.offsetY}%) rotate(${edits.rotation}deg) scale(${edits.zoom})`,
                    filter: `brightness(${edits.brightness}%) saturate(${edits.saturation}%) hue-rotate(${edits.hue}deg)`
                  }}
                />
                <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 type-meta font-bold text-white">Crop preview</span>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className={`max-h-[62dvh] max-w-full touch-none rounded-2xl border border-white/10 shadow-2xl ${tool === 'paint' ? 'cursor-crosshair' : 'cursor-move'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopInteraction}
                onPointerCancel={stopInteraction}
              />
            )}
          </div>

          <aside className="space-y-5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 p-4 lg:border-l lg:border-t-0">
            <div>
              <p className="mb-2 flex items-center gap-2 type-meta font-black uppercase tracking-widest text-gray-500"><Crop size={14} /> Crop</p>
              <div className="grid grid-cols-4 gap-1.5">
                {(profile ? ASPECT_OPTIONS.filter(option => option.id === 'square') : ASPECT_OPTIONS).map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setEdits(current => ({ ...current, aspect: option.id }))}
                    className={`rounded-xl px-2 py-2 type-meta font-bold ${edits.aspect === option.id ? 'bg-[var(--theme-base)] text-white' : 'bg-[var(--bg-element)] text-gray-400'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTool('move')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 type-meta font-bold ${tool === 'move' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'bg-[var(--bg-element)] text-gray-400'}`}><Move size={15} /> Reposition</button>
              <button type="button" onClick={() => setEdits(current => ({ ...current, rotation: (current.rotation + 90) % 360 }))} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-element)] px-3 py-2.5 type-meta font-bold text-gray-300"><RotateCw size={15} /> Rotate</button>
            </div>

            <Slider label="Zoom" value={edits.zoom} min={1} max={3} step={0.01} valueLabel={`${edits.zoom.toFixed(2)}×`} onChange={zoom => setEdits(current => ({ ...current, zoom }))} />

            <div className="space-y-3">
              <p className="flex items-center gap-2 type-meta font-black uppercase tracking-widest text-gray-500"><Palette size={14} /> Color</p>
              <Slider label="Brightness" value={edits.brightness} min={50} max={150} valueLabel={`${edits.brightness}%`} onChange={brightness => setEdits(current => ({ ...current, brightness }))} />
              <Slider label="Saturation" value={edits.saturation} min={0} max={200} valueLabel={`${edits.saturation}%`} onChange={saturation => setEdits(current => ({ ...current, saturation }))} />
              <Slider label="Hue" value={edits.hue} min={-180} max={180} valueLabel={`${edits.hue}°`} onChange={hue => setEdits(current => ({ ...current, hue }))} />
            </div>

            {!isVideo && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setTool(tool === 'paint' ? 'move' : 'paint')} className={`flex items-center gap-2 rounded-xl px-3 py-2 type-meta font-bold ${tool === 'paint' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'bg-[var(--bg-element)] text-gray-400'}`}><Brush size={15} /> Paint</button>
                  <button type="button" onClick={() => setEdits(current => ({ ...current, strokes: current.strokes.slice(0, -1) }))} disabled={!edits.strokes.length} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--bg-element)] text-gray-400 disabled:opacity-30" aria-label="Undo paint stroke"><Undo2 size={15} /></button>
                </div>
                <div className="flex items-center gap-3">
                  <input type="color" value={paintColor} onChange={event => setPaintColor(event.target.value)} className="h-9 w-12 rounded-lg bg-transparent" aria-label="Paint color" />
                  <input type="range" min="0.004" max="0.04" step="0.002" value={paintWidth} onChange={event => setPaintWidth(Number(event.target.value))} className="flex-1 accent-[var(--theme-base)]" aria-label="Brush size" />
                </div>
              </div>
            )}

            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 type-meta font-semibold text-red-300">{error}</p>}
            {processing && isVideo && (
              <div>
                <div className="mb-1 flex justify-between type-meta font-bold text-gray-400"><span>Rendering video</span><span>{Math.round(progress * 100)}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-element)]"><div className="h-full bg-[var(--theme-base)] transition-[width]" style={{ width: `${progress * 100}%` }} /></div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setEdits(initialEdits(profile)); setTool('move'); setError('') }} disabled={processing} className="flex-1 rounded-xl bg-[var(--bg-element)] px-4 py-3 type-meta font-bold text-gray-300">Reset</button>
              <button type="button" onClick={applyEdit} disabled={processing || Boolean(error && !imageRef.current && !isVideo)} className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-[var(--theme-base)] px-4 py-3 type-meta font-black text-white shadow-lg disabled:opacity-50">
                {processing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {processing ? 'Processing…' : profile ? 'Use photo' : 'Save edit'}
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>,
    document.body
  )
}
