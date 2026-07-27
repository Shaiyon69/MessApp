import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { formatVoiceMessageDuration } from '../../lib/voiceMessages'

const buildWaveform = (seedValue, count = 24) => {
  const seed = String(seedValue || 'voice-message')
    .split('')
    .reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261)

  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((seed + index * 47) * 0.017) * 0.5 + 0.5
    return 0.24 + value * 0.76
  })
}

export default function VoiceMessagePlayer({ src, label = 'Voice message', className = '' }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const waveform = useMemo(() => buildWaveform(label || src), [label, src])
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  useEffect(() => {
    setIsPlaying(false)
    setDuration(0)
    setCurrentTime(0)
  }, [src])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setIsPlaying(false)
      }
    } else {
      audio.pause()
    }
  }

  const seek = (event) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    audio.currentTime = duration * ratio
    setCurrentTime(audio.currentTime)
  }

  return (
    <div className={`flex h-12 min-w-0 items-center gap-2 rounded-full bg-[var(--theme-20)] px-2 text-[var(--chat-text,var(--text-main))] ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
        }}
      />
      <button
        type="button"
        onClick={togglePlayback}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--text-main)] text-[var(--bg-base)] shadow-sm transition-transform active:scale-95"
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-px" />}
      </button>
      <button
        type="button"
        onClick={seek}
        className="flex h-8 min-w-0 flex-1 items-center gap-[2px]"
        aria-label={`Seek ${label}`}
      >
        {waveform.map((height, index) => (
          <span
            key={index}
            className={`min-w-[2px] flex-1 rounded-full ${index / waveform.length <= progress ? 'bg-[var(--theme-base)]' : 'bg-current opacity-25'}`}
            style={{ height: `${Math.round(7 + height * 15)}px` }}
          />
        ))}
      </button>
      <span className="w-9 shrink-0 text-right text-[10px] font-bold tabular-nums opacity-65">
        {formatVoiceMessageDuration(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  )
}
