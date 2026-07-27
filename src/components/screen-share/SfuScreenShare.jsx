/**
 * Owns voice-channel media presentation: participant normalization, responsive
 * grid/pin/carousel state, camera overlays, and watch controls. Stream tracks
 * remain owned by the upstream media session and require lifecycle cleanup.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Activity,
  AudioLines,
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  GripHorizontal,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  MoreHorizontal,
  PhoneOff,
  Pin,
  ScreenShare,
  SlidersHorizontal,
  Square,
  SwitchCamera,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { audioSys } from '../../lib/SoundEngine'
import { supabase } from '../../supabaseClient'
import useFloatingMiniPlayer from '../../hooks/useFloatingMiniPlayer'
import { applyVoiceAudioProcessing, getVoiceMediaStream } from '../../lib/voiceAudioProcessing'
import { getScreenCaptureErrorMessage, getScreenCaptureStream } from '../../lib/screenCapture'
import { acquireAlternateCamera } from '../../lib/mediaDevices'

const VIEW_MODES = {
  PINNED: 'pinned',
  GRID: 'grid',
  CAROUSEL: 'carousel'
}

const VOICE_VOLUME_STORAGE_KEY = 'messapp:voice-volume-settings'

function readVoiceVolumeSettings() {
  if (typeof window === 'undefined') return { participants: {}, streams: {} }
  try {
    const stored = JSON.parse(window.localStorage.getItem(VOICE_VOLUME_STORAGE_KEY))
    return {
      participants: stored?.participants && typeof stored.participants === 'object' ? stored.participants : {},
      streams: stored?.streams && typeof stored.streams === 'object' ? stored.streams : {}
    }
  } catch {
    return { participants: {}, streams: {} }
  }
}

function clampVolume(value) {
  return Math.min(1, Math.max(0, Number(value) || 0))
}

function getStreamVolumeKey(item) {
  return `${item?.participant?.id || 'unknown'}:${item?.type || 'stream'}`
}

function mediaTracksAreLive(stream) {
  return Boolean(stream?.getTracks?.().some(track => track.readyState !== 'ended'))
}

function getParticipantValue(participant, keys, fallback = '') {
  if (!participant || typeof participant !== 'object') return fallback
  for (const key of keys) {
    if (participant[key]) return participant[key]
  }
  return fallback
}

function normalizeRemoteParticipant(participant, fallbackId) {
  if (typeof participant === 'string') {
    return {
      id: participant,
      displayName: participant,
      avatarUrl: '',
      speaking: false,
      muted: false,
      deafened: false
    }
  }

  return {
    id: getParticipantValue(participant, ['profileId', 'profile_id', 'id', 'identity'], fallbackId),
    displayName: getParticipantValue(participant, ['displayName', 'username', 'name', 'identity'], 'Participant'),
    avatarUrl: getParticipantValue(participant, ['avatarUrl', 'avatar_url', 'picture'], ''),
    speaking: Boolean(participant?.speaking || participant?.isSpeaking),
    voiceLevel: Math.max(0, Math.min(1, Number(participant?.voiceLevel || participant?.voice_level) || 0)),
    muted: Boolean(participant?.muted || participant?.isMuted),
    deafened: Boolean(participant?.deafened || participant?.isDeafened)
  }
}

function normalizeStreamType(participant, fallback = 'screen') {
  const rawType = typeof participant === 'object'
    ? participant?.streamType || participant?.type || participant?.kind || participant?.source
    : ''
  if (rawType === 'audio' || rawType === 'voice' || rawType === 'microphone') return 'audio'
  return rawType === 'camera' || rawType === 'video' ? 'camera' : fallback
}

function StreamVideo({ stream, muted = false, volume = 1, className = '' }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.srcObject = stream || null
  }, [stream])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = clampVolume(volume)
  }, [volume])

  if (!stream) return null

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`voice-stage-video block h-full max-h-full min-h-0 w-full max-w-full min-w-0 bg-black object-contain ${className}`}
      style={{ objectFit: 'contain' }}
    />
  )
}

function RemoteAudioPlayback({ stream, volume, muted }) {
  const audioRef = useRef(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.srcObject = stream || null
    audio.play().catch(() => {})
    return () => {
      audio.pause()
      audio.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = clampVolume(volume)
    audioRef.current.muted = muted
  }, [muted, volume])

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />
}

function StreamFallback({ participant, type }) {
  return (
    <div className="voice-stage-fallback flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="voice-stage-avatar-halo">
        <StatusAvatar url={participant?.avatarUrl} username={participant?.displayName} showStatus={false} className="h-16 w-16" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">{participant?.displayName || 'Participant'}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-gray-500">{type === 'camera' ? 'Camera unavailable' : 'Stream unavailable'}</p>
      </div>
    </div>
  )
}

function ParticipantBadge({ participant, streamSummary = '', compact = false }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <StatusAvatar url={participant?.avatarUrl} username={participant?.displayName} status="online" className={compact ? 'h-7 w-7' : 'h-8 w-8'} />
      <div className="min-w-0">
        <p className="truncate font-black text-[var(--text-main)]">{participant?.displayName || 'Participant'}</p>
        <p className="truncate font-bold text-gray-500">{streamSummary || 'In voice'}</p>
      </div>
    </div>
  )
}

function StreamTile({ streamItem, participant, cameraOverlay, volume = 1, cameraVolume = 1, isPinned = false, onPin, onStopWatching }) {
  const summary = streamItem.type === 'screen' && cameraOverlay ? 'Screen + camera' : streamItem.type === 'camera' ? 'Camera' : 'Screen'
  const hasLiveStream = mediaTracksAreLive(streamItem.stream)

  return (
    <div className={`voice-stage-card group relative flex h-full max-h-full min-h-0 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border bg-black shadow-xl ${participant?.speaking ? 'is-speaking border-green-300/80' : 'border-[var(--border-subtle)]'}`}>
      {hasLiveStream ? (
        <StreamVideo stream={streamItem.stream} muted={streamItem.local} volume={volume} />
      ) : (
        <StreamFallback participant={participant} type={streamItem.type} />
      )}

      {cameraOverlay && (
        <div className="voice-camera-overlay absolute left-2 top-2 w-[32%] min-w-24 max-w-48 overflow-hidden rounded-xl border border-white/25 bg-black shadow-2xl md:left-3 md:top-3">
          <div className="aspect-video">
            {mediaTracksAreLive(cameraOverlay.stream) ? (
              <StreamVideo stream={cameraOverlay.stream} muted={cameraOverlay.local} volume={cameraVolume} />
            ) : (
              <StreamFallback participant={participant} type="camera" />
            )}
          </div>
          <div className="flex items-center gap-1 bg-black/80 px-2 py-1 text-[10px] font-black text-white">
            <Camera size={11} aria-hidden="true" />
            <span className="truncate">{participant?.displayName || 'Camera'}</span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2 pt-10 sm:p-3 sm:pt-12">
        <div className="flex items-end justify-between gap-3">
          <ParticipantBadge participant={participant} streamSummary={summary} compact />
          <span className="shrink-0 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-md">{summary}</span>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
        {onPin && (
          <button
            type="button"
            onClick={() => onPin(streamItem.id)}
            className="rounded-lg bg-black/70 p-2 text-white hover:bg-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${participant?.displayName || 'stream'}`}
            title={isPinned ? 'Unpin stream' : 'Pin stream'}
          >
            {isPinned ? <Minimize2 size={15} /> : <Pin size={15} />}
          </button>
        )}
        {onStopWatching && (
          <button
            type="button"
            onClick={() => onStopWatching(streamItem.id)}
            className="rounded-lg bg-black/70 p-2 text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`Stop watching ${participant?.displayName || 'stream'}`}
            title="Stop watching"
          >
            <MonitorX size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

function AvatarParticipantTile({ participant, onPin }) {
  const statusText = [
    participant?.speaking ? 'Speaking' : 'Listening',
    participant?.muted ? 'Muted' : '',
    participant?.deafened ? 'Deafened' : '',
    participant?.cameraActive ? 'Camera on' : '',
    participant?.screenShareActive ? 'Sharing screen' : '',
    participant?.watching ? 'Watching' : ''
  ].filter(Boolean).join(', ')

  return (
    <button
      type="button"
      onClick={() => onPin?.(participant?.id)}
      className={`voice-stage-card relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border px-4 text-center shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${participant?.speaking ? 'is-speaking border-green-300/80' : 'border-[var(--border-subtle)]'}`}
      aria-label={`${participant?.displayName || 'Participant'}: ${statusText}`}
      title={statusText}
    >
      <div className={`voice-stage-avatar-halo relative flex items-center justify-center ${participant?.speaking ? 'is-speaking' : ''}`}>
        <span className={`voice-stage-speaking-wave absolute h-24 w-24 rounded-full border border-green-400/50 transition-opacity duration-200 ${participant?.speaking ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
        <StatusAvatar url={participant?.avatarUrl} username={participant?.displayName} status="online" className={`h-16 w-16 sm:h-20 sm:w-20 ${participant?.speaking ? 'ring-2 ring-green-400 ring-offset-4 ring-offset-[#12131c]' : ''}`} />
      </div>
      <div className="mt-4 flex h-5 items-end gap-1" aria-label={participant?.speaking ? 'Microphone activity detected' : 'No microphone activity'}>
        {[0.55, 1, 0.72, 0.9].map((weight, index) => (
          <span
            key={`voice-bar-${index}`}
            className={`voice-level-bar w-1 rounded-full transition-[height,background-color] duration-150 ease-out ${participant?.speaking ? 'bg-green-400' : 'bg-gray-700'}`}
            data-active={participant?.speaking ? 'true' : undefined}
            style={{ height: `${Math.max(3, Math.round((participant?.voiceLevel || 0) * 20 * weight))}px` }}
          />
        ))}
      </div>
      <span
        className={`mt-3 min-h-6 rounded-full bg-green-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-green-200 transition-opacity duration-200 ${participant?.speaking ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!participant?.speaking}
      >
        Speaking
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-3">
        <div className="flex min-w-0 items-end justify-between gap-2">
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-black text-white sm:text-sm">{participant?.displayName || 'Participant'}</p>
            <p className="truncate text-[10px] font-bold text-gray-400">{statusText || 'Connected'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-gray-300">
            {participant?.muted && <MicOff size={13} aria-label="Muted" />}
            {participant?.deafened && <VolumeX size={13} aria-label="Deafened" />}
            {participant?.cameraActive && <Camera size={13} aria-label="Camera on" />}
            {participant?.screenShareActive && <ScreenShare size={13} aria-label="Sharing screen" />}
          </div>
        </div>
      </div>
    </button>
  )
}

function VolumeSlider({ value, onChange, label }) {
  const percent = Math.round(value * 100)
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${value === 0 ? 'bg-red-500/10 text-red-300' : 'bg-white/5 text-gray-400'}`}>
        {value === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={percent}
        onChange={event => onChange(Number(event.target.value) / 100)}
        className="voice-volume-slider min-w-0 flex-1"
        aria-label={label}
      />
      <span className="w-10 shrink-0 text-right font-mono text-[11px] font-black text-gray-400">{percent}%</span>
    </div>
  )
}

function VolumeMixerPanel({
  participants,
  streams,
  participantVolume,
  streamVolume,
  onParticipantVolumeChange,
  onStreamVolumeChange,
  onClose
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="volume-mixer-title" onClick={onClose}>
      <section className="voice-mic-test-panel custom-scrollbar max-h-[min(82dvh,42rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--border-subtle)] p-5 shadow-2xl sm:p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-20)] text-[var(--theme-base)]">
              <SlidersHorizontal size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="volume-mixer-title" className="text-lg font-black text-[var(--text-main)]">Your volume mixer</h3>
              <p className="text-xs font-semibold text-gray-500">These levels only change what you hear.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="voice-control-button rounded-full bg-white/5 p-2 text-gray-400 hover:text-white" aria-label="Close volume mixer" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5">
          <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Participants</h4>
          <div className="mt-2 space-y-2">
            {participants.length > 0 ? participants.map(participant => (
              <div key={participant.id} className="rounded-2xl border border-[var(--border-subtle)] bg-black/20 p-3">
                <div className="mb-3 flex min-w-0 items-center gap-2.5">
                  <StatusAvatar url={participant.avatarUrl} username={participant.displayName} showStatus={false} className="h-8 w-8" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--text-main)]">{participant.displayName}</p>
                    <p className="text-[10px] font-bold text-gray-500">Voice and shared media</p>
                  </div>
                </div>
                <VolumeSlider
                  value={participantVolume(participant.id)}
                  onChange={value => onParticipantVolumeChange(participant.id, value)}
                  label={`${participant.displayName} volume`}
                />
              </div>
            )) : (
              <p className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-5 text-center text-xs font-semibold text-gray-500">Other participants will appear here when they join.</p>
            )}
          </div>
        </div>

        {streams.length > 0 && (
          <div className="mt-5">
            <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Stream audio</h4>
            <div className="mt-2 space-y-2">
              {streams.map(item => (
                <div key={item.id} className="rounded-2xl border border-[var(--border-subtle)] bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--text-main)]">{item.participant.displayName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{item.type === 'camera' ? 'Camera audio' : 'Shared screen audio'}</p>
                    </div>
                    {item.type === 'camera' ? <Camera size={16} className="shrink-0 text-gray-500" /> : <ScreenShare size={16} className="shrink-0 text-gray-500" />}
                  </div>
                  <VolumeSlider
                    value={streamVolume(item)}
                    onChange={value => onStreamVolumeChange(item, value)}
                    label={`${item.participant.displayName} ${item.type} audio volume`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[10px] font-semibold text-gray-600">Participant levels are remembered on this device. Setting a level to 0% locally mutes that source.</p>
      </section>
    </div>
  )
}

function MicTestPanel({ stream, onClose }) {
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [playbackUrl, setPlaybackUrl] = useState('')
  const [testLevel, setTestLevel] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const stopTimerRef = useRef(null)
  const playbackUrlRef = useRef('')
  const testTrackRef = useRef(null)
  const meterFrameRef = useRef(null)
  const meterContextRef = useRef(null)

  const clearPlayback = useCallback(() => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
    playbackUrlRef.current = ''
    setPlaybackUrl('')
  }, [])

  const stopRecording = useCallback(() => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const stopPrivateMeter = useCallback(() => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current)
      meterFrameRef.current = null
    }
    meterContextRef.current?.close().catch(() => {})
    meterContextRef.current = null
    testTrackRef.current?.stop()
    testTrackRef.current = null
    setTestLevel(0)
  }, [])

  const startRecording = useCallback(() => {
    setError('')
    const audioTracks = stream?.getAudioTracks?.().filter(track => track.readyState === 'live') || []
    if (audioTracks.length === 0) {
      setError('Your microphone is not ready yet. Check its permission and try again.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported on this device.')
      return
    }

    clearPlayback()
    chunksRef.current = []

    try {
      const testTrack = audioTracks[0].clone()
      testTrack.enabled = true
      testTrackRef.current = testTrack
      const testStream = new MediaStream([testTrack])
      const recorder = new MediaRecorder(testStream)
      recorderRef.current = recorder

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (AudioContextClass) {
        const audioContext = new AudioContextClass()
        meterContextRef.current = audioContext
        audioContext.resume().catch(() => {})
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.72
        audioContext.createMediaStreamSource(testStream).connect(analyser)
        const samples = new Uint8Array(analyser.fftSize)
        const measure = () => {
          analyser.getByteTimeDomainData(samples)
          let sum = 0
          for (const sample of samples) {
            const normalized = (sample - 128) / 128
            sum += normalized * normalized
          }
          const rms = Math.sqrt(sum / samples.length)
          setTestLevel(Math.min(1, Math.max(0, (rms - 0.01) * 8)))
          meterFrameRef.current = window.requestAnimationFrame(measure)
        }
        meterFrameRef.current = window.requestAnimationFrame(measure)
      }

      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopPrivateMeter()
        setError('The microphone sample could not be recorded.')
        setPhase('idle')
      }
      recorder.onstop = () => {
        stopPrivateMeter()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        recorderRef.current = null
        if (!blob.size) {
          setError('No audio was captured. Check your microphone and try again.')
          setPhase('idle')
          return
        }
        const nextUrl = URL.createObjectURL(blob)
        playbackUrlRef.current = nextUrl
        setPlaybackUrl(nextUrl)
        setPhase('ready')
      }
      recorder.start(100)
      setPhase('recording')
      stopTimerRef.current = window.setTimeout(stopRecording, 5000)
    } catch {
      recorderRef.current = null
      stopPrivateMeter()
      setError('The microphone sample could not be started.')
      setPhase('idle')
    }
  }, [clearPlayback, stopPrivateMeter, stopRecording, stream])

  useEffect(() => () => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null
      recorderRef.current.onerror = null
      recorderRef.current.onstop = null
      if (recorderRef.current.state === 'recording') recorderRef.current.stop()
    }
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current)
    meterContextRef.current?.close().catch(() => {})
    testTrackRef.current?.stop()
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
  }, [])

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mic-test-title" onClick={onClose}>
      <section className="voice-mic-test-panel w-full max-w-md rounded-3xl border border-[var(--border-subtle)] p-5 shadow-2xl sm:p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-20)] text-[var(--theme-base)]">
              <AudioLines size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="mic-test-title" className="text-lg font-black text-[var(--text-main)]">Test your microphone</h3>
              <p className="text-xs font-semibold text-gray-500">Record up to five seconds, then play it back locally.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="voice-control-button rounded-full bg-white/5 p-2 text-gray-400 hover:text-white" aria-label="Close microphone test" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-black/20 p-4">
          <div className="flex h-20 items-end justify-center gap-1.5" aria-label={`Microphone level ${Math.round(testLevel * 100)} percent`}>
            {Array.from({ length: 14 }, (_, index) => {
              const centerWeight = 1 - Math.abs(index - 6.5) / 10
              const height = phase === 'recording' ? Math.max(8, Math.round(testLevel * 68 * centerWeight)) : 8
              return (
                <span
                  key={`mic-test-level-${index}`}
                  className={`w-1.5 rounded-full transition-[height,background-color] duration-100 ${phase === 'recording' && testLevel > 0.035 ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-gray-700'}`}
                  style={{ height: `${height}px` }}
                />
              )
            })}
          </div>
          <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
            {phase === 'recording' ? 'Recording — speak normally' : phase === 'ready' ? 'Sample ready' : 'Ready to record'}
          </p>
          {phase === 'recording' && <div className="voice-mic-test-progress mt-3 h-1 overflow-hidden rounded-full bg-white/5"><span className="block h-full rounded-full bg-green-400" /></div>}
        </div>

        {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300" role="alert">{error}</p>}

        {playbackUrl && (
          <audio className="mt-4 w-full" src={playbackUrl} controls preload="metadata">
            Your browser does not support audio playback.
          </audio>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {phase === 'recording' ? (
            <button type="button" onClick={stopRecording} className="voice-control-button inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white">
              <Square size={15} fill="currentColor" /> Stop recording
            </button>
          ) : (
            <button type="button" onClick={startRecording} className="voice-control-button inline-flex items-center gap-2 rounded-xl border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] px-4 py-2.5 text-sm font-black text-[var(--chat-control-text)]">
              <Mic size={16} /> {phase === 'ready' ? 'Record again' : 'Start mic test'}
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] font-semibold text-gray-600">The sample stays on this device and is discarded when you close this panel.</p>
      </section>
    </div>
  )
}

function useElementSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect
      setSize(current => current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height })
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

function getPagedGridLayout(count, size) {
  if (count <= 1) return { columns: 1, rows: 1, pageSize: 1 }
  const width = Math.max(size.width || 0, 320)
  const height = Math.max(size.height || 0, 220)
  const minTileWidth = width < 520 ? 150 : width < 900 ? 190 : 250
  const minTileHeight = height < 460 ? 112 : height < 650 ? 140 : 170
  const maxColumns = Math.max(1, Math.min(4, Math.floor(width / minTileWidth)))
  const maxRows = Math.max(1, Math.min(3, Math.floor(height / minTileHeight)))
  const capacity = Math.max(1, maxColumns * maxRows)
  const visible = Math.min(count, capacity)
  let best = { columns: 1, rows: visible, score: Infinity }

  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(visible / columns)
    if (rows > maxRows) continue
    const tileWidth = width / columns
    const tileHeight = height / rows
    const aspectPenalty = Math.abs((tileWidth / tileHeight) - (16 / 9))
    const emptySlots = (columns * rows) - visible
    const score = aspectPenalty + emptySlots * 0.2
    if (score < best.score) best = { columns, rows, score }
  }

  return { columns: best.columns, rows: best.rows, pageSize: Math.min(capacity, best.columns * best.rows) }
}

export default function SfuScreenShare({
  roomId,
  createClient,
  className = '',
  title = 'Voice',
  variant = 'panel',
  muted = false,
  deafened = false,
  currentUser,
  focusRequest,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  onOpen,
  onStateChange
}) {
  const [client, setClient] = useState(null)
  const [localScreenStream, setLocalScreenStream] = useState(null)
  const [localCameraStream, setLocalCameraStream] = useState(null)
  const [localAudioStream, setLocalAudioStream] = useState(null)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceSpeaking, setVoiceSpeaking] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState([])
  const [voicePresenceParticipants, setVoicePresenceParticipants] = useState([])
  const [viewMode, setViewMode] = useState(VIEW_MODES.PINNED)
  const [pinnedStreamId, setPinnedStreamId] = useState(null)
  const [carouselStreamId, setCarouselStreamId] = useState(null)
  const [hiddenStreamIds, setHiddenStreamIds] = useState(() => new Set())
  const [gridPage, setGridPage] = useState(0)
  const [status, setStatus] = useState('idle')
  const [micTestOpen, setMicTestOpen] = useState(false)
  const [volumeMixerOpen, setVolumeMixerOpen] = useState(false)
  const [stageControlsOpen, setStageControlsOpen] = useState(false)
  const [voiceVolumeSettings, setVoiceVolumeSettings] = useState(readVoiceVolumeSettings)
  const [noiseReductionEnabled, setNoiseReductionEnabled] = useState(true)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const localScreenRef = useRef(null)
  const localCameraRef = useRef(null)
  const localAudioRef = useRef(null)
  const mutedRef = useRef(muted)
  const noiseReductionRef = useRef(true)
  const voiceSpeakingRef = useRef(false)
  const voicePresenceChannelRef = useRef(null)
  const localParticipantRef = useRef(null)
  const lastReportedStateRef = useRef('')
  const cameraFacingModeRef = useRef('user')
  const [stageRef, stageSize] = useElementSize()
  const {
    playerRef: miniPlayerRef,
    floatingStyle: miniPlayerStyle,
    dragHandleProps: miniPlayerDragHandleProps
  } = useFloatingMiniPlayer('messapp:mini-player:voice-channel')

  const localParticipant = useMemo(() => ({
    id: currentUser?.id || 'local',
    displayName: currentUser?.displayName || currentUser?.username || 'You',
    avatarUrl: currentUser?.avatarUrl || currentUser?.avatar_url || '',
    speaking: !muted && voiceSpeaking,
    voiceLevel,
    muted,
    deafened
  }), [currentUser?.avatarUrl, currentUser?.avatar_url, currentUser?.displayName, currentUser?.id, currentUser?.username, deafened, muted, voiceLevel, voiceSpeaking])
  localParticipantRef.current = localParticipant
  mutedRef.current = muted

  useEffect(() => {
    if (!roomId || !localParticipant.id) return undefined
    const channel = supabase.channel(`voice-presence:${roomId}`, { config: { presence: { key: localParticipant.id } } })
    voicePresenceChannelRef.current = channel
    const syncParticipants = () => {
      const entries = Object.values(channel.presenceState()).flatMap(value => value)
      const byId = new Map()
      entries.forEach(entry => {
        const participant = normalizeRemoteParticipant(entry, entry?.profile_id || entry?.id)
        if (participant.id) byId.set(participant.id, participant)
      })
      setVoicePresenceParticipants(Array.from(byId.values()))
    }
    channel.on('presence', { event: 'sync' }, syncParticipants)
    channel.subscribe(statusValue => {
      if (statusValue !== 'SUBSCRIBED') return
      const participant = localParticipantRef.current
      channel.track({
        profile_id: participant.id,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
        muted: participant.muted,
        deafened: participant.deafened,
        speaking: participant.speaking,
        voiceLevel: participant.voiceLevel,
        joined_at: new Date().toISOString()
      }).catch(() => {})
    })
    return () => {
      voicePresenceChannelRef.current = null
      setVoicePresenceParticipants([])
      channel.untrack().catch(() => {})
      supabase.removeChannel(channel)
    }
  }, [localParticipant.avatarUrl, localParticipant.displayName, localParticipant.id, roomId])

  useEffect(() => {
    const channel = voicePresenceChannelRef.current
    if (!channel) return
    channel.track({
      profile_id: localParticipant.id,
      displayName: localParticipant.displayName,
      avatarUrl: localParticipant.avatarUrl,
      muted: localParticipant.muted,
      deafened: localParticipant.deafened,
      speaking: localParticipant.speaking,
      voiceLevel: localParticipant.voiceLevel,
      joined_at: new Date().toISOString()
    }).catch(() => {})
  }, [localParticipant])

  useEffect(() => {
    if (!roomId || !createClient) return undefined

    let active = true
    const nextClient = createClient(roomId)
    setClient(nextClient)
    setStatus('connecting')
    setPinnedStreamId(null)
    setCarouselStreamId(null)
    setHiddenStreamIds(new Set())
    setViewMode(VIEW_MODES.PINNED)
    setGridPage(0)

    Promise.resolve(nextClient.connect?.())
      .then(() => {
        if (!active) return
        setStatus('connected')
      })
      .catch(() => {
        if (!active) return
        setStatus('failed')
      })

    const unsubscribe = nextClient.subscribe?.((stream, participant) => {
      if (!active || !stream) return
      const fallbackType = stream.getVideoTracks?.().length > 0 ? 'screen' : 'audio'
      const type = normalizeStreamType(participant, fallbackType)
      const normalizedParticipant = normalizeRemoteParticipant(participant, `remote:${stream.id}`)
      const id = `${normalizedParticipant.id}:${type}:${stream.id}`
      const nextItem = { id, stream, participant: normalizedParticipant, type, local: false }

      setRemoteStreams(current => {
        const withoutDuplicate = current.filter(item => item.id !== id && item.stream?.id !== stream.id)
        return [...withoutDuplicate, nextItem]
      })

      stream.getTracks?.().forEach(track => {
        track.addEventListener('ended', () => {
          setRemoteStreams(current => current.filter(item => item.id !== id))
        }, { once: true })
      })
    })

    return () => {
      active = false
      setClient(null)
      setStatus('idle')
      setRemoteStreams([])
      setLocalScreenStream(current => {
        current?.getTracks().forEach(track => track.stop())
        return null
      })
      setLocalCameraStream(current => {
        current?.getTracks().forEach(track => track.stop())
        return null
      })
      localScreenRef.current = null
      localCameraRef.current = null
      if (typeof unsubscribe === 'function') unsubscribe()
      nextClient.disconnect?.()
    }
  }, [roomId, createClient])

  useEffect(() => {
    if (status !== 'connected' || !client || !navigator.mediaDevices?.getUserMedia) return undefined
    let active = true
    let audioContext = null
    let animationFrame = 0
    let stream = null
    let published = false
    let smoothedLevel = 0
    let lastPublishedAt = 0

    getVoiceMediaStream({
      mediaDevices: navigator.mediaDevices,
      video: false,
      noiseReduction: noiseReductionRef.current
    }).then(async nextStream => {
      if (!active) {
        nextStream.getTracks().forEach(track => track.stop())
        return
      }
      stream = nextStream
      localAudioRef.current = nextStream
      setLocalAudioStream(nextStream)
      nextStream.getAudioTracks().forEach(track => { track.enabled = !mutedRef.current })
      await client.publish?.(nextStream, { type: 'audio', streamType: 'audio', participant: localParticipantRef.current })
      published = true

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return
      audioContext = new AudioContextClass()
      if (audioContext.state === 'suspended') await audioContext.resume().catch(() => {})
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      audioContext.createMediaStreamSource(nextStream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      const measure = timestamp => {
        if (!active) return
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) {
          const normalized = (sample - 128) / 128
          sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / samples.length)
        const rawLevel = mutedRef.current ? 0 : Math.min(1, Math.max(0, (rms - 0.015) * 8))
        smoothedLevel = (smoothedLevel * 0.72) + (rawLevel * 0.28)

        // Separate thresholds prevent the speaking state from rapidly flickering near the noise floor.
        const nextSpeaking = !mutedRef.current && (voiceSpeakingRef.current ? smoothedLevel >= 0.035 : smoothedLevel >= 0.075)
        if (nextSpeaking !== voiceSpeakingRef.current) {
          voiceSpeakingRef.current = nextSpeaking
          setVoiceSpeaking(nextSpeaking)
        }

        // The analyser still samples every frame, but React and Presence only receive a smooth,
        // quantized meter value at a UI-friendly rate.
        if (timestamp - lastPublishedAt >= 100) {
          lastPublishedAt = timestamp
          const nextLevel = mutedRef.current ? 0 : Math.round(smoothedLevel * 20) / 20
          setVoiceLevel(current => current === nextLevel ? current : nextLevel)
        }
        animationFrame = requestAnimationFrame(measure)
      }
      animationFrame = requestAnimationFrame(measure)
    }).catch(() => {
      const failedStream = stream
      failedStream?.getTracks().forEach(track => track.stop())
      if (published && failedStream) {
        try {
          Promise.resolve(client.unpublish?.(failedStream, { type: 'audio', streamType: 'audio' })).catch(() => {})
        } catch {
          // Capture has already stopped; a failed transport cleanup must not keep the mic open.
        }
      }
      if (localAudioRef.current === failedStream) localAudioRef.current = null
      stream = null
      if (active) {
        setLocalAudioStream(current => current === failedStream ? null : current)
        voiceSpeakingRef.current = false
        setVoiceSpeaking(false)
        setVoiceLevel(0)
      }
    })

    return () => {
      active = false
      if (animationFrame) cancelAnimationFrame(animationFrame)
      if (stream) client.unpublish?.(stream, { type: 'audio', streamType: 'audio' })
      stream?.getTracks().forEach(track => track.stop())
      if (localAudioRef.current === stream) localAudioRef.current = null
      setLocalAudioStream(null)
      voiceSpeakingRef.current = false
      setVoiceSpeaking(false)
      setVoiceLevel(0)
      audioContext?.close().catch(() => {})
    }
  }, [client, status])

  useEffect(() => {
    localAudioStream?.getAudioTracks().forEach(track => { track.enabled = !muted })
    if (muted) {
      voiceSpeakingRef.current = false
      setVoiceSpeaking(false)
      setVoiceLevel(0)
    }
  }, [localAudioStream, muted])

  const toggleVoiceNoiseReduction = useCallback(async () => {
    const audioTrack = localAudioRef.current?.getAudioTracks?.()[0]
    if (!audioTrack) return
    const nextState = !noiseReductionRef.current
    try {
      await applyVoiceAudioProcessing(audioTrack, nextState, navigator.mediaDevices)
      noiseReductionRef.current = nextState
      setNoiseReductionEnabled(nextState)
    } catch (error) {
      console.warn('[VOICE_AUDIO] Dynamic noise reduction is unavailable.', { name: error?.name, message: error?.message })
    }
  }, [])

  const localStreams = useMemo(() => {
    const streams = []
    if (localScreenStream) {
      streams.push({
        id: `${localParticipant.id}:screen:${localScreenStream.id}`,
        stream: localScreenStream,
        participant: localParticipant,
        type: 'screen',
        local: true
      })
    }
    if (localCameraStream) {
      streams.push({
        id: `${localParticipant.id}:camera:${localCameraStream.id}`,
        stream: localCameraStream,
        participant: localParticipant,
        type: 'camera',
        local: true
      })
    }
    return streams
  }, [localCameraStream, localParticipant, localScreenStream])

  const remoteAudioStreams = useMemo(() => remoteStreams.filter(item => item.type === 'audio' && mediaTracksAreLive(item.stream)), [remoteStreams])
  const remoteVisualStreams = useMemo(() => remoteStreams.filter(item => item.type !== 'audio'), [remoteStreams])
  const allStreams = useMemo(() => [...localStreams, ...remoteVisualStreams].filter(item => mediaTracksAreLive(item.stream)), [localStreams, remoteVisualStreams])
  const watchedStreams = useMemo(() => allStreams.filter(item => !hiddenStreamIds.has(item.id)), [allStreams, hiddenStreamIds])
  const streamsById = useMemo(() => new Map(allStreams.map(item => [item.id, item])), [allStreams])

  const cameraByOwner = useMemo(() => {
    const map = new Map()
    watchedStreams.forEach(item => {
      if (item.type === 'camera') map.set(item.participant.id, item)
    })
    return map
  }, [watchedStreams])

  const displayStreams = useMemo(() => {
    const hasScreenByOwner = new Set(watchedStreams.filter(item => item.type === 'screen').map(item => item.participant.id))
    return watchedStreams.filter(item => item.type !== 'camera' || !hasScreenByOwner.has(item.participant.id))
  }, [watchedStreams])

  const participants = useMemo(() => {
    const map = new Map()
    voicePresenceParticipants.forEach(participant => {
      map.set(participant.id, {
        ...participant,
        connectedChannelId: roomId,
        cameraActive: false,
        screenShareActive: false,
        watching: false
      })
    })
    map.set(localParticipant.id, {
      ...localParticipant,
      connectedChannelId: roomId,
      cameraActive: Boolean(localCameraStream),
      screenShareActive: Boolean(localScreenStream),
      watching: watchedStreams.some(item => !item.local)
    })

    remoteStreams.forEach(item => {
      const existing = map.get(item.participant.id) || {
        ...item.participant,
        connectedChannelId: roomId,
        cameraActive: false,
        screenShareActive: false,
        watching: false
      }
      map.set(item.participant.id, {
        ...existing,
        ...item.participant,
        connectedChannelId: roomId,
        cameraActive: existing.cameraActive || item.type === 'camera',
        screenShareActive: existing.screenShareActive || item.type === 'screen',
        watching: existing.watching
      })
    })

    return Array.from(map.values())
  }, [localCameraStream, localParticipant, localScreenStream, remoteStreams, roomId, voicePresenceParticipants, watchedStreams])

  const remoteParticipants = useMemo(() => participants.filter(participant => participant.id !== localParticipant.id), [localParticipant.id, participants])
  const adjustableVisualStreams = useMemo(() => remoteVisualStreams.filter(item => (
    mediaTracksAreLive(item.stream) && item.stream?.getAudioTracks?.().some(track => track.readyState === 'live')
  )), [remoteVisualStreams])

  const participantVolume = useCallback((participantId) => (
    clampVolume(voiceVolumeSettings.participants[participantId] ?? 1)
  ), [voiceVolumeSettings.participants])

  const streamVolume = useCallback((item) => (
    clampVolume(voiceVolumeSettings.streams[getStreamVolumeKey(item)] ?? 1)
  ), [voiceVolumeSettings.streams])

  const effectiveStreamVolume = useCallback((item) => {
    if (item?.local || deafened) return 0
    return clampVolume(participantVolume(item?.participant?.id) * streamVolume(item))
  }, [deafened, participantVolume, streamVolume])

  const updateParticipantVolume = useCallback((participantId, value) => {
    setVoiceVolumeSettings(current => ({
      ...current,
      participants: { ...current.participants, [participantId]: clampVolume(value) }
    }))
  }, [])

  const updateStreamVolume = useCallback((item, value) => {
    const key = getStreamVolumeKey(item)
    setVoiceVolumeSettings(current => ({
      ...current,
      streams: { ...current.streams, [key]: clampVolume(value) }
    }))
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(VOICE_VOLUME_STORAGE_KEY, JSON.stringify(voiceVolumeSettings))
    } catch {
      // Volume changes still apply for the current session when storage is unavailable.
    }
  }, [voiceVolumeSettings])

  useEffect(() => {
    const nextState = {
      status,
      isSharing: Boolean(localScreenStream),
      isCameraOn: Boolean(localCameraStream),
      noiseReductionEnabled,
      remoteCount: Math.max(participants.length - 1, 0),
      participants,
      streams: allStreams.map(item => ({
        id: item.id,
        ownerId: item.participant.id,
        type: item.type,
        local: item.local,
        watching: !hiddenStreamIds.has(item.id),
        pinned: item.id === pinnedStreamId,
        available: mediaTracksAreLive(item.stream)
      }))
    }
    const signature = JSON.stringify(nextState)
    if (signature === lastReportedStateRef.current) return
    lastReportedStateRef.current = signature
    onStateChange?.(nextState)
  }, [allStreams, hiddenStreamIds, localCameraStream, localScreenStream, noiseReductionEnabled, onStateChange, participants, pinnedStreamId, status])

  useEffect(() => {
    if (displayStreams.length === 0) {
      setPinnedStreamId(null)
      setCarouselStreamId(null)
      return
    }

    setPinnedStreamId(current => displayStreams.some(item => item.id === current) ? current : displayStreams[0].id)
    setCarouselStreamId(current => displayStreams.some(item => item.id === current) ? current : displayStreams[0].id)
  }, [displayStreams])

  useEffect(() => {
    if (!focusRequest?.ownerId || displayStreams.length === 0) return
    const requestedStream = displayStreams.find(item => item.participant.id === focusRequest.ownerId)
    if (!requestedStream) return
    setHiddenStreamIds(current => {
      if (!current.has(requestedStream.id)) return current
      const next = new Set(current)
      next.delete(requestedStream.id)
      return next
    })
    setPinnedStreamId(requestedStream.id)
    setCarouselStreamId(requestedStream.id)
    setViewMode(VIEW_MODES.PINNED)
  }, [displayStreams, focusRequest])

  const publishStream = useCallback(async (stream, type) => {
    await client?.publish?.(stream, { type, streamType: type, participant: localParticipant })
  }, [client, localParticipant])

  const unpublishStream = useCallback(async (stream, type) => {
    await client?.unpublish?.(stream, { type, streamType: type, participant: localParticipant })
  }, [client, localParticipant])

  const startShare = async () => {
    if (!client) return
    let stream = null
    try {
      stream = await getScreenCaptureStream(navigator.mediaDevices)
      localScreenRef.current = stream
      setLocalScreenStream(stream)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopShare(stream), { once: true })
      await publishStream(stream, 'screen')
      audioSys.playScreenShareStarted()
    } catch (error) {
      // Closing the browser picker is a local media cancellation, not a voice
      // connection failure. A publish failure must also leave the joined voice
      // session intact and clean up any partially acquired tracks.
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        if (localScreenRef.current === stream) {
          localScreenRef.current = null
          setLocalScreenStream(null)
        }
      }
      toast.error(getScreenCaptureErrorMessage(error))
    }
  }

  const stopShare = async (targetStream = localScreenRef.current) => {
    const stream = targetStream
    const wasSharing = Boolean(stream && localScreenRef.current === stream)
    localScreenRef.current = null
    setLocalScreenStream(null)
    stream?.getTracks().forEach(track => track.stop())
    await unpublishStream(stream, 'screen')
    if (wasSharing) audioSys.playScreenShareStopped()
  }

  const startCamera = async () => {
    if (!client || !navigator.mediaDevices?.getUserMedia) return
    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacingModeRef.current } },
        audio: false
      })
      localCameraRef.current = stream
      setLocalCameraStream(stream)
      cameraFacingModeRef.current = stream.getVideoTracks()[0]?.getSettings?.().facingMode || cameraFacingModeRef.current
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (localCameraRef.current === stream) void stopCamera(stream)
      }, { once: true })
      await publishStream(stream, 'camera')
    } catch (_err) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        if (localCameraRef.current === stream) {
          localCameraRef.current = null
          setLocalCameraStream(null)
        }
      }
    }
  }

  const stopCamera = async (targetStream = localCameraRef.current) => {
    const stream = targetStream
    if (!stream) return
    if (localCameraRef.current === stream) {
      localCameraRef.current = null
      setLocalCameraStream(null)
    }
    stream?.getTracks().forEach(track => track.stop())
    await unpublishStream(stream, 'camera')
  }

  const switchCamera = async () => {
    const currentStream = localCameraRef.current
    const currentTrack = currentStream?.getVideoTracks?.()[0]
    if (!currentStream || !currentTrack || isSwitchingCamera) return

    setIsSwitchingCamera(true)
    let replacementStream = null
    try {
      const replacement = await acquireAlternateCamera({
        mediaDevices: navigator.mediaDevices,
        currentTrack,
        preferredFacingMode: cameraFacingModeRef.current
      })
      replacementStream = replacement.stream
      await publishStream(replacement.stream, 'camera')

      localCameraRef.current = replacement.stream
      setLocalCameraStream(replacement.stream)
      cameraFacingModeRef.current = replacement.facingMode
      replacement.track.addEventListener('ended', () => {
        if (localCameraRef.current === replacement.stream) void stopCamera(replacement.stream)
      }, { once: true })

      await unpublishStream(currentStream, 'camera').catch(() => {})
      currentStream.getTracks().forEach(track => track.stop())
      toast.success(replacement.facingMode === 'environment' ? 'Rear camera selected' : 'Front camera selected')
    } catch (_error) {
      replacementStream?.getTracks?.().forEach(track => track.stop())
      toast.error('Could not switch cameras.')
    } finally {
      setIsSwitchingCamera(false)
    }
  }

  const pinStream = useCallback((streamId) => {
    setPinnedStreamId(current => current === streamId ? null : streamId)
    setCarouselStreamId(streamId)
    setViewMode(VIEW_MODES.PINNED)
  }, [])

  const stopWatching = useCallback((streamId) => {
    setHiddenStreamIds(current => {
      const next = new Set(current)
      next.add(streamId)
      return next
    })
  }, [])

  const cycleCarousel = useCallback((direction) => {
    if (displayStreams.length < 2) return
    const currentId = carouselStreamId || pinnedStreamId || displayStreams[0]?.id
    const currentIndex = Math.max(displayStreams.findIndex(item => item.id === currentId), 0)
    const nextIndex = (currentIndex + direction + displayStreams.length) % displayStreams.length
    setCarouselStreamId(displayStreams[nextIndex].id)
    setPinnedStreamId(displayStreams[nextIndex].id)
    setViewMode(VIEW_MODES.CAROUSEL)
  }, [carouselStreamId, displayStreams, pinnedStreamId])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (variant !== 'full' || viewMode !== VIEW_MODES.CAROUSEL) return
      if (stageRef.current && !stageRef.current.contains(document.activeElement)) return
      if (event.key === 'ArrowLeft') cycleCarousel(-1)
      if (event.key === 'ArrowRight') cycleCarousel(1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cycleCarousel, stageRef, variant, viewMode])

  const pinnedStream = streamsById.get(viewMode === VIEW_MODES.CAROUSEL ? carouselStreamId : pinnedStreamId) || displayStreams[0] || null
  const secondaryStreams = displayStreams.filter(item => item.id !== pinnedStream?.id)
  const participantCount = participants.length
  const connectionLabel = status === 'connected' ? 'Connected' : status
  const sharingCount = participants.filter(participant => participant.screenShareActive).length
  const cameraCount = participants.filter(participant => participant.cameraActive).length
  const participantIdsWithTiles = useMemo(() => new Set(displayStreams.map(item => item.participant.id)), [displayStreams])
  const avatarParticipants = useMemo(() => (
    participants.filter(participant => !participantIdsWithTiles.has(participant.id))
  ), [participantIdsWithTiles, participants])
  const gridItems = useMemo(() => [
    ...displayStreams.map(item => ({ id: item.id, type: 'stream', streamItem: item, participant: item.participant })),
    ...avatarParticipants.map(participant => ({ id: `participant:${participant.id}`, type: 'participant', participant }))
  ], [avatarParticipants, displayStreams])
  const gridLayout = useMemo(() => getPagedGridLayout(gridItems.length, stageSize), [gridItems.length, stageSize])
  const gridPageCount = Math.max(1, Math.ceil(gridItems.length / gridLayout.pageSize))
  const visibleGridItems = useMemo(() => {
    const first = Math.min(gridPage, gridPageCount - 1) * gridLayout.pageSize
    return gridItems.slice(first, first + gridLayout.pageSize)
  }, [gridItems, gridLayout.pageSize, gridPage, gridPageCount])

  useEffect(() => {
    setGridPage(current => Math.min(current, Math.max(gridPageCount - 1, 0)))
  }, [gridPageCount])

  const changeGridPage = useCallback((direction) => {
    setGridPage(current => (current + direction + gridPageCount) % gridPageCount)
  }, [gridPageCount])

  const focusParticipant = useCallback((participantId) => {
    const requestedStream = displayStreams.find(item => item.participant.id === participantId)
    if (!requestedStream) return
    setPinnedStreamId(requestedStream.id)
    setCarouselStreamId(requestedStream.id)
    setViewMode(VIEW_MODES.PINNED)
  }, [displayStreams])

  const remoteAudioPlayers = remoteAudioStreams.map(item => (
    <RemoteAudioPlayback
      key={`remote-audio:${item.id}`}
      stream={item.stream}
      volume={deafened ? 0 : participantVolume(item.participant.id)}
      muted={deafened}
    />
  ))

  const renderControls = (compact = false) => (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${compact ? 'voice-mini-controls flex-wrap justify-between' : 'justify-center'}`}>
      {onToggleMute && (
        <button type="button" onClick={onToggleMute} className={`voice-control-button rounded-full border p-2.5 sm:p-3 ${muted ? 'is-danger border-red-500/30 bg-red-500/15 text-red-300' : 'border-[var(--border-subtle)] bg-[var(--bg-element)] text-gray-300'}`} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicOff size={compact ? 16 : 18} /> : <Mic size={compact ? 16 : 18} />}
        </button>
      )}
      {onToggleDeafen && (
        <button type="button" onClick={onToggleDeafen} className={`voice-control-button rounded-full border p-2.5 sm:p-3 ${deafened ? 'is-danger border-red-500/30 bg-red-500/15 text-red-300' : 'border-[var(--border-subtle)] bg-[var(--bg-element)] text-gray-300'}`} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'}>
          {deafened ? <VolumeX size={compact ? 16 : 18} /> : <Volume2 size={compact ? 16 : 18} />}
        </button>
      )}
      <button type="button" onClick={toggleVoiceNoiseReduction} disabled={!localAudioStream || status !== 'connected'} className={`voice-control-button rounded-full border p-2.5 disabled:opacity-40 sm:p-3 ${noiseReductionEnabled ? 'is-active border-[var(--theme-50)] bg-[var(--theme-20)] text-[var(--theme-base)]' : 'is-danger border-red-500/30 bg-red-500/15 text-red-300'}`} aria-label={noiseReductionEnabled ? 'Turn noise reduction off' : 'Turn noise reduction on'} title="Enhanced noise reduction">
        <Activity size={compact ? 16 : 18} />
      </button>
      {localCameraStream ? (
        <>
          <button type="button" onClick={() => stopCamera()} className="voice-control-button is-active rounded-full border border-[var(--theme-50)] bg-[var(--theme-20)] p-2.5 text-[var(--theme-base)] sm:p-3" aria-label="Turn camera off" title="Turn camera off">
            <CameraOff size={compact ? 16 : 18} />
          </button>
          <button type="button" onClick={switchCamera} disabled={isSwitchingCamera} className="voice-control-button rounded-full border border-[var(--border-subtle)] bg-[var(--bg-element)] p-2.5 text-gray-300 disabled:cursor-wait disabled:opacity-50 sm:p-3" aria-label="Switch camera" title="Switch camera">
            <SwitchCamera size={compact ? 16 : 18} />
          </button>
        </>
      ) : (
        <button type="button" onClick={startCamera} disabled={status !== 'connected'} className="voice-control-button rounded-full border border-[var(--border-subtle)] bg-[var(--bg-element)] p-2.5 text-gray-300 disabled:opacity-50 sm:p-3" aria-label="Turn camera on" title="Turn camera on">
          <Camera size={compact ? 16 : 18} />
        </button>
      )}
      {localScreenStream ? (
        <button type="button" onClick={() => stopShare()} className="voice-control-button is-active rounded-full border border-green-400/30 bg-green-500/15 p-2.5 text-green-300 sm:p-3" aria-label="Stop sharing screen" title="Stop sharing screen">
          <MonitorX size={compact ? 16 : 18} />
        </button>
      ) : (
        <button type="button" onClick={startShare} disabled={status !== 'connected'} className="voice-control-button voice-share-button rounded-full border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] p-2.5 text-[var(--chat-control-text)] disabled:opacity-50 sm:p-3" aria-label="Share screen" title="Share screen">
          <MonitorUp size={compact ? 16 : 18} />
        </button>
      )}
      {onLeave && (
        <button type="button" onClick={onLeave} className="voice-control-button voice-leave-button rounded-full bg-red-500 px-4 py-2.5 text-white sm:px-5 sm:py-3" aria-label="Leave voice" title="Leave voice">
          <PhoneOff size={compact ? 16 : 18} />
        </button>
      )}
    </div>
  )

  if (variant === 'mini') {
    return (
      <section
        ref={miniPlayerRef}
        style={miniPlayerStyle}
        className={`floating-mini-player fixed left-auto right-2 bottom-[calc(var(--minimized-call-offset,4.75rem)+env(safe-area-inset-bottom))] z-[90] max-h-[62dvh] w-[min(248px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[#0b0b0c] p-1.5 md:right-5 md:bottom-[calc(6rem+env(safe-area-inset-bottom))] md:max-h-[70dvh] md:w-[min(340px,calc(100vw-2.5rem))] md:overflow-y-auto md:rounded-2xl md:p-2.5 ${className}`}
      >
        {remoteAudioPlayers}
        <button
          type="button"
          {...miniPlayerDragHandleProps}
          className="mini-player-drag-handle mb-0.5 flex h-5 w-full touch-none cursor-grab items-center justify-center rounded-lg text-gray-500 hover:bg-white/5 hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] md:mb-1 md:h-6"
          aria-grabbed="false"
          aria-label="Move voice channel mini player"
          title="Drag to move. Use arrow keys to move, or double-click to reset."
        >
          <GripHorizontal size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpen} className="mb-2 flex w-full items-center gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] md:mb-3 md:gap-3" aria-label={`Return to ${title}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full md:h-10 md:w-10 ${status === 'connected' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>
            <Volume2 size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-[var(--text-main)]">{title}</span>
            <span className="block truncate text-[9px] font-bold uppercase tracking-widest text-gray-500 md:text-[11px]">
              {connectionLabel} - {participantCount} connected{localScreenStream ? ' - sharing screen' : ''}{localCameraStream ? ' - camera on' : ''}
            </span>
          </span>
        </button>
        {pinnedStream && (
          <div className="mb-2 h-[7.5rem] max-h-[24dvh] w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black md:mb-3 md:h-auto md:aspect-video md:max-h-none md:rounded-xl">
            <StreamTile
              streamItem={pinnedStream}
              participant={pinnedStream.participant}
              cameraOverlay={pinnedStream.type === 'screen' ? cameraByOwner.get(pinnedStream.participant.id) : null}
              volume={effectiveStreamVolume(pinnedStream)}
              cameraVolume={effectiveStreamVolume(cameraByOwner.get(pinnedStream.participant.id))}
            />
          </div>
        )}
        {!pinnedStream && (
          <div className="mb-2 space-y-1 rounded-lg border border-[var(--border-subtle)] bg-white/[0.03] p-1.5 md:mb-3 md:space-y-1.5 md:rounded-xl md:p-2">
            {participants.slice(0, 2).map(participant => (
              <div key={participant.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-black/15 px-1.5 py-1 md:gap-2.5 md:px-2 md:py-1.5">
                <div
                  className={`relative shrink-0 rounded-full border-2 p-0.5 ${participant.speaking ? 'border-green-400' : 'border-transparent'}`}
                  title={`${participant.displayName}${participant.speaking ? ' - speaking' : ''}`}
                >
                  <StatusAvatar url={participant.avatarUrl} username={participant.displayName} showStatus={false} className="h-7 w-7 md:h-8 md:w-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-[var(--text-main)]">{participant.displayName}</p>
                  <p className={`truncate text-[9px] font-bold uppercase tracking-widest ${participant.speaking ? 'text-green-400' : 'text-gray-500'}`}>
                    {participant.speaking ? 'Speaking' : 'Listening'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-gray-500">
                  {participant.muted && <MicOff size={12} aria-label="Muted" />}
                  {participant.deafened && <VolumeX size={12} aria-label="Deafened" />}
                  {participant.cameraActive && <Camera size={12} aria-label="Camera on" />}
                  {participant.screenShareActive && <ScreenShare size={12} aria-label="Sharing screen" />}
                </div>
              </div>
            ))}
            {participants.length > 2 && (
              <button type="button" onClick={onOpen} className="w-full rounded-lg px-2 py-1 text-center text-[10px] font-black text-gray-500 hover:bg-white/5 hover:text-gray-300">
                +{participants.length - 2} more {participants.length - 2 === 1 ? 'person' : 'people'}
              </button>
            )}
          </div>
        )}
        {renderControls(true)}
      </section>
    )
  }

  if (variant === 'full') {
    return (
      <section className={`voice-stage-shell relative grid h-full max-h-full min-h-0 w-full max-w-full flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[var(--bg-base)] ${className}`} data-status={status}>
        {remoteAudioPlayers}
        <div className="voice-stage-ambient voice-stage-ambient-one" aria-hidden="true" />
        <div className="voice-stage-ambient voice-stage-ambient-two" aria-hidden="true" />

        <header className="voice-stage-header relative z-10 min-h-16 shrink-0 border-b border-[var(--border-subtle)] px-3 py-3 md:px-5 md:py-3.5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`voice-channel-live-icon relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${status === 'connected' ? 'is-connected text-green-300' : 'text-amber-300'}`}>
                <Volume2 size={20} aria-hidden="true" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#11131a] ${status === 'connected' ? 'bg-green-400' : 'bg-amber-400'}`} />
              </div>
              <div className="min-w-0">
                <p className="mb-0.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-green-400' : 'bg-amber-400'}`} />
                  Live voice channel
                </p>
                <h2 className="truncate text-sm font-black tracking-tight text-[var(--text-main)] md:text-base">{title}</h2>
                <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                  <span className={`shrink-0 text-[10px] font-bold ${status === 'connected' ? 'text-green-300' : 'text-amber-300'}`}>{connectionLabel}</span>
                  {sharingCount > 0 && <span className="voice-stage-stat shrink-0"><ScreenShare size={10} />{sharingCount}</span>}
                  {cameraCount > 0 && <span className="voice-stage-stat shrink-0"><Camera size={10} />{cameraCount}</span>}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden -space-x-2 sm:flex" aria-hidden="true">
                {participants.slice(0, 4).map(participant => (
                  <div key={participant.id} className={`rounded-full border-2 border-[#11131a] ${participant.speaking ? 'ring-2 ring-green-400/80' : ''}`}>
                    <StatusAvatar url={participant.avatarUrl} username={participant.displayName} showStatus={false} className="h-7 w-7" />
                  </div>
                ))}
              </div>
              <div className="voice-participant-count flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1.5">
                <Users size={15} className="text-gray-500" aria-hidden="true" />
                <span className="text-xs font-black text-gray-300">{participantCount}</span>
                <span className="hidden text-[10px] font-bold text-gray-500 md:inline">{participantCount === 1 ? 'person' : 'people'}</span>
              </div>
            </div>
          </div>
        </header>

        <div ref={stageRef} className="relative z-[1] h-full max-h-full min-h-0 w-full max-w-full overflow-hidden p-2 sm:p-3 md:p-5" tabIndex={0} aria-label="Voice stage">
          {viewMode === VIEW_MODES.GRID || !pinnedStream ? (
            <section className="voice-stage-surface relative h-full min-h-0 overflow-hidden rounded-[1.4rem] border border-[var(--border-subtle)] p-2 shadow-2xl sm:p-3">
              <div
                className="voice-stage-grid grid h-full min-h-0 gap-2.5"
                style={{
                  gridTemplateColumns: `repeat(${gridLayout.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`
                }}
              >
                {visibleGridItems.map((item, index) => (
                  <div key={item.id} className="voice-stage-grid-item min-h-0 min-w-0" style={{ '--voice-tile-index': index }}>
                    {item.type === 'stream' ? (
                      <StreamTile
                        streamItem={item.streamItem}
                        participant={item.participant}
                        cameraOverlay={item.streamItem.type === 'screen' ? cameraByOwner.get(item.participant.id) : null}
                        volume={effectiveStreamVolume(item.streamItem)}
                        cameraVolume={effectiveStreamVolume(cameraByOwner.get(item.participant.id))}
                        isPinned={item.streamItem.id === pinnedStreamId}
                        onPin={pinStream}
                        onStopWatching={stopWatching}
                      />
                    ) : (
                      <AvatarParticipantTile participant={item.participant} onPin={focusParticipant} />
                    )}
                  </div>
                ))}
              </div>
              {gridPageCount > 1 && (
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-2">
                  <button type="button" onClick={() => changeGridPage(-1)} className="rounded-full bg-black/75 p-2 text-white hover:bg-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Previous participant page" title="Previous page">
                    <ChevronLeft size={18} />
                  </button>
                  <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-black text-white">Page {Math.min(gridPage + 1, gridPageCount)} of {gridPageCount}</span>
                  <button type="button" onClick={() => changeGridPage(1)} className="rounded-full bg-black/75 p-2 text-white hover:bg-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Next participant page" title="Next page">
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className={`voice-stage-focus-layout grid h-full min-h-0 gap-2.5 overflow-hidden ${secondaryStreams.length > 0 ? 'grid-rows-[minmax(0,1fr)_6.5rem] md:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] md:grid-rows-1' : 'grid-cols-1 grid-rows-1'}`}>
              <div className="voice-stage-grid-item relative h-full max-h-full min-h-0 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-black shadow-2xl">
                <StreamTile
                  streamItem={pinnedStream}
                  participant={pinnedStream.participant}
                  cameraOverlay={pinnedStream.type === 'screen' ? cameraByOwner.get(pinnedStream.participant.id) : null}
                  volume={effectiveStreamVolume(pinnedStream)}
                  cameraVolume={effectiveStreamVolume(cameraByOwner.get(pinnedStream.participant.id))}
                  isPinned
                  onPin={pinStream}
                  onStopWatching={stopWatching}
                />
                {viewMode === VIEW_MODES.CAROUSEL && displayStreams.length > 1 && (
                  <>
                    <button type="button" onClick={() => cycleCarousel(-1)} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 p-3 text-white hover:bg-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Previous stream" title="Previous stream">
                      <ChevronLeft size={22} />
                    </button>
                    <button type="button" onClick={() => cycleCarousel(1)} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 p-3 text-white hover:bg-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Next stream" title="Next stream">
                      <ChevronRight size={22} />
                    </button>
                    <span className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[11px] font-black text-white">
                      {Math.max(displayStreams.findIndex(item => item.id === pinnedStream.id) + 1, 1)} / {displayStreams.length}
                    </span>
                  </>
                )}
              </div>

              {secondaryStreams.length > 0 && (
                <div className="grid min-h-0 grid-cols-2 gap-2.5 overflow-x-auto overflow-y-hidden md:grid-cols-1 md:overflow-hidden" aria-label="Other participants">
                  {secondaryStreams.slice(0, 3).map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => pinStream(item.id)}
                      className="voice-stage-grid-item min-h-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-element)] p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]"
                      style={{ '--voice-tile-index': index + 1 }}
                      aria-label={`Pin ${item.participant.displayName} ${item.type}`}
                    >
                      <StreamTile
                        streamItem={item}
                        participant={item.participant}
                        cameraOverlay={item.type === 'screen' ? cameraByOwner.get(item.participant.id) : null}
                        volume={effectiveStreamVolume(item)}
                        cameraVolume={effectiveStreamVolume(cameraByOwner.get(item.participant.id))}
                      />
                    </button>
                  ))}
                  {secondaryStreams.length > 3 && (
                    <button type="button" onClick={() => setViewMode(VIEW_MODES.GRID)} className="flex min-h-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-element)] p-3 text-xs font-black text-gray-300" aria-label="Show all streams">
                      +{secondaryStreams.length - 3} more
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {micTestOpen && (
          <MicTestPanel
            stream={localAudioStream}
            onClose={() => setMicTestOpen(false)}
          />
        )}

        {volumeMixerOpen && (
          <VolumeMixerPanel
            participants={remoteParticipants}
            streams={adjustableVisualStreams}
            participantVolume={participantVolume}
            streamVolume={streamVolume}
            onParticipantVolumeChange={updateParticipantVolume}
            onStreamVolumeChange={updateStreamVolume}
            onClose={() => setVolumeMixerOpen(false)}
          />
        )}

        <footer className="voice-stage-footer relative z-10 shrink-0 px-2 py-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom))] sm:py-3">
          <div className="voice-stage-mobile-dock mx-auto grid max-w-md grid-cols-6 gap-1 rounded-2xl p-1.5 md:hidden">
            {onToggleMute && (
              <button type="button" onClick={onToggleMute} className={`voice-stage-mobile-action ${muted ? 'is-danger' : ''}`} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
                {muted ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
              </button>
            )}
            {onToggleDeafen && (
              <button type="button" onClick={onToggleDeafen} className={`voice-stage-mobile-action ${deafened ? 'is-danger' : ''}`} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'}>
                {deafened ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
              </button>
            )}
            <button type="button" onClick={localScreenStream ? () => stopShare() : startShare} disabled={status !== 'connected'} className={`voice-stage-mobile-action ${localScreenStream ? 'is-active' : ''}`} aria-label={localScreenStream ? 'Stop sharing screen' : 'Share screen'} title={localScreenStream ? 'Stop sharing' : 'Share screen'}>
              {localScreenStream ? <MonitorX size={18} aria-hidden="true" /> : <MonitorUp size={18} aria-hidden="true" />}
            </button>
            <button type="button" onClick={localCameraStream ? () => stopCamera() : startCamera} disabled={status !== 'connected'} className={`voice-stage-mobile-action ${localCameraStream ? 'is-active' : ''}`} aria-label={localCameraStream ? 'Turn camera off' : 'Turn camera on'} title={localCameraStream ? 'Camera off' : 'Camera on'}>
              {localCameraStream ? <CameraOff size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
            </button>
            {localCameraStream && (
              <button type="button" onClick={switchCamera} disabled={isSwitchingCamera} className="voice-stage-mobile-action disabled:cursor-wait disabled:opacity-50" aria-label="Switch camera" title="Switch camera">
                <SwitchCamera size={18} aria-hidden="true" />
              </button>
            )}
            {onLeave && (
              <button type="button" onClick={onLeave} className="voice-stage-mobile-action is-danger" aria-label="Leave voice" title="Leave voice">
                <PhoneOff size={18} aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={() => setStageControlsOpen(true)} className="voice-stage-mobile-action" aria-label="More call controls" title="More controls" aria-haspopup="dialog" aria-expanded={stageControlsOpen}>
              <MoreHorizontal size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="voice-control-dock custom-scrollbar mx-auto hidden w-fit max-w-full items-center justify-center gap-2 overflow-x-auto rounded-2xl border border-[var(--border-subtle)] p-2 shadow-2xl md:flex">
            <div className="voice-view-switcher flex rounded-xl border border-[var(--border-subtle)] p-0.5 sm:p-1">
              <button type="button" onClick={() => setViewMode(VIEW_MODES.PINNED)} aria-pressed={viewMode === VIEW_MODES.PINNED} aria-label="Focus view" title="Focus view" className={`voice-view-button rounded-lg p-2 sm:p-2.5 ${viewMode === VIEW_MODES.PINNED ? 'is-active border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] text-[var(--chat-control-text)]' : 'text-gray-400 hover:text-white'}`}>
                <Maximize2 size={17} />
              </button>
              <button type="button" onClick={() => setViewMode(VIEW_MODES.GRID)} aria-pressed={viewMode === VIEW_MODES.GRID} aria-label="Grid view" title="Grid view" className={`voice-view-button rounded-lg p-2 sm:p-2.5 ${viewMode === VIEW_MODES.GRID ? 'is-active border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] text-[var(--chat-control-text)]' : 'text-gray-400 hover:text-white'}`}>
                <Grid2X2 size={17} />
              </button>
              <button type="button" onClick={() => setViewMode(VIEW_MODES.CAROUSEL)} aria-pressed={viewMode === VIEW_MODES.CAROUSEL} aria-label="Slideshow view" title="Slideshow view" className={`voice-view-button rounded-lg p-2 sm:p-2.5 ${viewMode === VIEW_MODES.CAROUSEL ? 'is-active border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] text-[var(--chat-control-text)]' : 'text-gray-400 hover:text-white'}`}>
                <ChevronRight size={17} />
              </button>
            </div>
            {renderControls()}
            <button type="button" onClick={() => setVolumeMixerOpen(true)} disabled={status !== 'connected'} className="voice-control-button rounded-full bg-[var(--bg-element)] p-2 text-gray-300 disabled:opacity-40 sm:p-2.5" aria-label="Open volume mixer" title="Volume mixer">
              <SlidersHorizontal size={18} />
            </button>
            <button type="button" onClick={() => setMicTestOpen(true)} disabled={status !== 'connected' || !localAudioStream} className="voice-control-button rounded-full bg-[var(--bg-element)] p-2 text-gray-300 disabled:opacity-40 sm:p-2.5" aria-label="Test microphone" title="Test microphone">
              <AudioLines size={18} />
            </button>
            <button type="button" onClick={() => setHiddenStreamIds(new Set())} disabled={hiddenStreamIds.size === 0} className="voice-control-button rounded-full bg-[var(--bg-element)] p-2 text-gray-300 disabled:opacity-40 sm:p-2.5" aria-label="Show hidden streams" title="Show hidden streams">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </footer>

        {stageControlsOpen && (
          <div className="fixed inset-0 z-[120] md:hidden" data-ui-overlay-owner="SfuScreenShare:stage-controls">
            <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setStageControlsOpen(false)} aria-label="Close voice stage controls" />
            <section className="voice-stage-controls-drawer absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] max-h-[82dvh] overflow-y-auto rounded-[1.75rem] p-3" role="dialog" aria-modal="true" aria-label="Call controls">
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <p className="text-sm font-bold text-[var(--text-main)]">Call controls</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{title || 'Voice channel'}</p>
                </div>
                <button type="button" onClick={() => setStageControlsOpen(false)} className="voice-control-button flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-element)] text-gray-400" aria-label="Close controls">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">View</p>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setViewMode(VIEW_MODES.PINNED)} aria-pressed={viewMode === VIEW_MODES.PINNED} className={`voice-stage-drawer-action ${viewMode === VIEW_MODES.PINNED ? 'is-active' : ''}`}>
                  <Maximize2 size={19} aria-hidden="true" /><span>Focus</span>
                </button>
                <button type="button" onClick={() => setViewMode(VIEW_MODES.GRID)} aria-pressed={viewMode === VIEW_MODES.GRID} className={`voice-stage-drawer-action ${viewMode === VIEW_MODES.GRID ? 'is-active' : ''}`}>
                  <Grid2X2 size={19} aria-hidden="true" /><span>Grid</span>
                </button>
                <button type="button" onClick={() => setViewMode(VIEW_MODES.CAROUSEL)} aria-pressed={viewMode === VIEW_MODES.CAROUSEL} className={`voice-stage-drawer-action ${viewMode === VIEW_MODES.CAROUSEL ? 'is-active' : ''}`}>
                  <ChevronRight size={19} aria-hidden="true" /><span>Slides</span>
                </button>
              </div>

              <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Audio tools</p>
              <div className="grid grid-cols-4 gap-2">
                <button type="button" onClick={toggleVoiceNoiseReduction} disabled={!localAudioStream || status !== 'connected'} className={`voice-stage-drawer-action disabled:opacity-40 ${noiseReductionEnabled ? 'is-active' : ''}`}>
                  <Activity size={19} aria-hidden="true" /><span>Noise</span>
                </button>
                <button type="button" onClick={() => { setStageControlsOpen(false); setVolumeMixerOpen(true) }} disabled={status !== 'connected'} className="voice-stage-drawer-action disabled:opacity-40">
                  <SlidersHorizontal size={19} aria-hidden="true" /><span>Volumes</span>
                </button>
                <button type="button" onClick={() => { setStageControlsOpen(false); setMicTestOpen(true) }} disabled={status !== 'connected' || !localAudioStream} className="voice-stage-drawer-action disabled:opacity-40">
                  <AudioLines size={19} aria-hidden="true" /><span>Mic test</span>
                </button>
                <button type="button" onClick={() => setHiddenStreamIds(new Set())} disabled={hiddenStreamIds.size === 0} className="voice-stage-drawer-action disabled:opacity-40">
                  <MoreHorizontal size={19} aria-hidden="true" /><span>Restore</span>
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {remoteAudioPlayers}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{connectionLabel}</span>
        {renderControls(true)}
      </div>
    </section>
  )
}
