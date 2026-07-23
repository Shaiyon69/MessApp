/**
 * Owns voice-channel media presentation: participant normalization, responsive
 * grid/pin/carousel state, camera overlays, and watch controls. Stream tracks
 * remain owned by the upstream media session and require lifecycle cleanup.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
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
  Users,
  Volume2,
  VolumeX
} from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { audioSys } from '../../lib/SoundEngine'
import { supabase } from '../../supabaseClient'

const VIEW_MODES = {
  PINNED: 'pinned',
  GRID: 'grid',
  CAROUSEL: 'carousel'
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
  return rawType === 'camera' || rawType === 'video' ? 'camera' : fallback
}

function StreamVideo({ stream, muted = false, className = '' }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.srcObject = stream || null
  }, [stream])

  if (!stream) return null

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`h-full w-full bg-black object-contain ${className}`}
    />
  )
}

function StreamFallback({ participant, type }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black px-4 text-center">
      <StatusAvatar url={participant?.avatarUrl} username={participant?.displayName} showStatus={false} className="h-16 w-16" />
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

function StreamTile({ streamItem, participant, cameraOverlay, isPinned = false, onPin, onStopWatching }) {
  const summary = streamItem.type === 'screen' && cameraOverlay ? 'Screen + camera' : streamItem.type === 'camera' ? 'Camera' : 'Screen'
  const hasLiveStream = mediaTracksAreLive(streamItem.stream)

  return (
    <div className={`group relative flex h-full min-h-0 overflow-hidden rounded-lg border bg-black shadow-xl ${participant?.speaking ? 'border-green-300 shadow-green-500/20 ring-2 ring-green-400/30' : 'border-[var(--border-subtle)]'}`}>
      {hasLiveStream ? (
        <StreamVideo stream={streamItem.stream} muted={streamItem.local} />
      ) : (
        <StreamFallback participant={participant} type={streamItem.type} />
      )}

      {cameraOverlay && (
        <div className="absolute left-2 top-2 w-[32%] min-w-24 max-w-48 overflow-hidden rounded-lg border border-white/25 bg-black shadow-2xl md:left-3 md:top-3">
          <div className="aspect-video">
            {mediaTracksAreLive(cameraOverlay.stream) ? (
              <StreamVideo stream={cameraOverlay.stream} muted={cameraOverlay.local} />
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 sm:p-3">
        <div className="flex items-end justify-between gap-3">
          <ParticipantBadge participant={participant} streamSummary={summary} compact />
          <span className="shrink-0 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">{summary}</span>
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
      className={`relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_center,var(--theme-20),#12131c_68%)] px-4 text-center shadow-xl outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${participant?.speaking ? 'border-green-300 shadow-green-500/20 ring-1 ring-green-400/40' : 'border-[var(--border-subtle)]'}`}
      aria-label={`${participant?.displayName || 'Participant'}: ${statusText}`}
      title={statusText}
    >
      <div className="relative flex items-center justify-center">
        <span className={`absolute h-24 w-24 rounded-full border border-green-400/50 transition-opacity duration-200 ${participant?.speaking ? 'animate-ping opacity-100' : 'opacity-0'}`} aria-hidden="true" />
        <StatusAvatar url={participant?.avatarUrl} username={participant?.displayName} status="online" className={`h-16 w-16 sm:h-20 sm:w-20 ${participant?.speaking ? 'ring-2 ring-green-400 ring-offset-4 ring-offset-[#12131c]' : ''}`} />
      </div>
      <div className="mt-4 flex h-5 items-end gap-1" aria-label={participant?.speaking ? 'Microphone activity detected' : 'No microphone activity'}>
        {[0.55, 1, 0.72, 0.9].map((weight, index) => (
          <span
            key={`voice-bar-${index}`}
            className={`w-1 rounded-full transition-[height,background-color] duration-150 ease-out ${participant?.speaking ? 'bg-green-400' : 'bg-gray-700'}`}
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
  const localScreenRef = useRef(null)
  const localCameraRef = useRef(null)
  const localAudioRef = useRef(null)
  const mutedRef = useRef(muted)
  const voiceSpeakingRef = useRef(false)
  const voicePresenceChannelRef = useRef(null)
  const localParticipantRef = useRef(null)
  const lastReportedStateRef = useRef('')
  const [stageRef, stageSize] = useElementSize()

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
      const type = normalizeStreamType(participant, 'screen')
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
    let smoothedLevel = 0
    let lastPublishedAt = 0

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
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
      if (active) {
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

  const allStreams = useMemo(() => [...localStreams, ...remoteStreams].filter(item => mediaTracksAreLive(item.stream)), [localStreams, remoteStreams])
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

  useEffect(() => {
    const nextState = {
      status,
      isSharing: Boolean(localScreenStream),
      isCameraOn: Boolean(localCameraStream),
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
  }, [allStreams, hiddenStreamIds, localCameraStream, localScreenStream, onStateChange, participants, pinnedStreamId, status])

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
    if (!client || !navigator.mediaDevices?.getDisplayMedia) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      localScreenRef.current = stream
      setLocalScreenStream(stream)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopShare(stream), { once: true })
      await publishStream(stream, 'screen')
      audioSys.playScreenShareStarted()
    } catch (_err) {
      setStatus('failed')
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      localCameraRef.current = stream
      setLocalCameraStream(stream)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopCamera(stream), { once: true })
      await publishStream(stream, 'camera')
    } catch (_err) {
      setStatus('failed')
    }
  }

  const stopCamera = async (targetStream = localCameraRef.current) => {
    const stream = targetStream
    localCameraRef.current = null
    setLocalCameraStream(null)
    stream?.getTracks().forEach(track => track.stop())
    await unpublishStream(stream, 'camera')
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

  const renderControls = (compact = false) => (
    <div className={`flex items-center gap-2 ${compact ? 'flex-wrap justify-between' : 'justify-center'}`}>
      {onToggleMute && (
        <button type="button" onClick={onToggleMute} className={`rounded-full border border-[var(--border-subtle)] p-2.5 sm:p-3 ${muted ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicOff size={compact ? 16 : 18} /> : <Mic size={compact ? 16 : 18} />}
        </button>
      )}
      {onToggleDeafen && (
        <button type="button" onClick={onToggleDeafen} className={`rounded-full border border-[var(--border-subtle)] p-2.5 sm:p-3 ${deafened ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'}>
          {deafened ? <VolumeX size={compact ? 16 : 18} /> : <Volume2 size={compact ? 16 : 18} />}
        </button>
      )}
      {localCameraStream ? (
        <button type="button" onClick={() => stopCamera()} className="rounded-full border border-red-500/30 bg-red-500/15 p-2.5 text-red-300 sm:p-3" aria-label="Turn camera off" title="Turn camera off">
          <CameraOff size={compact ? 16 : 18} />
        </button>
      ) : (
        <button type="button" onClick={startCamera} disabled={status !== 'connected'} className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-element)] p-2.5 text-gray-300 disabled:opacity-50 sm:p-3" aria-label="Turn camera on" title="Turn camera on">
          <Camera size={compact ? 16 : 18} />
        </button>
      )}
      {localScreenStream ? (
        <button type="button" onClick={() => stopShare()} className="rounded-full border border-red-500/30 bg-red-500/15 p-2.5 text-red-300 sm:p-3" aria-label="Stop sharing screen" title="Stop sharing screen">
          <MonitorX size={compact ? 16 : 18} />
        </button>
      ) : (
        <button type="button" onClick={startShare} disabled={status !== 'connected'} className="rounded-full border border-[var(--theme-50)] bg-[var(--theme-base)] p-2.5 text-white disabled:opacity-50 sm:p-3" aria-label="Share screen" title="Share screen">
          <MonitorUp size={compact ? 16 : 18} />
        </button>
      )}
      {onLeave && (
        <button type="button" onClick={onLeave} className="rounded-full bg-red-500 px-4 py-2.5 text-white sm:px-5 sm:py-3" aria-label="Leave voice" title="Leave voice">
          <PhoneOff size={compact ? 16 : 18} />
        </button>
      )}
    </div>
  )

  if (variant === 'mini') {
    return (
      <section className={`fixed left-2 right-2 bottom-[calc(var(--minimized-call-offset,4.75rem)+env(safe-area-inset-bottom))] z-[90] max-h-[46dvh] w-auto overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[#111214]/95 p-2.5 shadow-2xl backdrop-blur-xl sm:left-3 sm:right-3 md:left-auto md:right-5 md:bottom-[calc(6rem+env(safe-area-inset-bottom))] md:max-h-[70dvh] md:w-[min(420px,calc(100vw-2.5rem))] ${className}`}>
        <button type="button" onClick={onOpen} className="mb-3 flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`Return to ${title}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${status === 'connected' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>
            <Volume2 size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-[var(--text-main)]">{title}</span>
            <span className="block truncate text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {connectionLabel} - {participantCount} connected{localScreenStream ? ' - sharing screen' : ''}{localCameraStream ? ' - camera on' : ''}
            </span>
          </span>
        </button>
        {pinnedStream && (
          <div className="mb-3 aspect-video overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black">
            <StreamTile
              streamItem={pinnedStream}
              participant={pinnedStream.participant}
              cameraOverlay={pinnedStream.type === 'screen' ? cameraByOwner.get(pinnedStream.participant.id) : null}
            />
          </div>
        )}
        {renderControls(true)}
      </section>
    )
  }

  if (variant === 'full') {
    return (
      <section className={`grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[var(--bg-base)] ${className}`}>
        <header className="min-h-14 shrink-0 border-b border-[var(--border-subtle)] bg-[#12131c]/95 px-3 py-2.5 md:px-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 truncate text-sm font-black text-[var(--text-main)] md:text-base"><Volume2 size={16} className="shrink-0 text-green-400" />{title}</h2>
              <p className={`flex items-center gap-1.5 truncate font-mono text-[10px] font-bold ${status === 'connected' ? 'text-green-300' : 'text-amber-300'}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'connected' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'bg-amber-400'}`} />
                {connectionLabel} · {participantCount} {participantCount === 1 ? 'person' : 'people'} · {sharingCount} sharing · {cameraCount} camera{cameraCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-element)] px-3 py-1.5">
              <Users size={16} className="text-gray-500" aria-hidden="true" />
              <span className="text-xs font-black text-gray-400">{participantCount}</span>
            </div>
          </div>
        </header>

        <div ref={stageRef} className="min-h-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(109,95,253,0.10),transparent_60%)] p-2 sm:p-3 md:p-5" tabIndex={0} aria-label="Voice stage">
          {viewMode === VIEW_MODES.GRID || !pinnedStream ? (
            <section className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[#0a0b10] p-2 sm:p-3 shadow-2xl">
              <div
                className="grid h-full min-h-0 gap-2"
                style={{
                  gridTemplateColumns: `repeat(${gridLayout.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`
                }}
              >
                {visibleGridItems.map(item => (
                  <div key={item.id} className="min-h-0 min-w-0">
                    {item.type === 'stream' ? (
                      <StreamTile
                        streamItem={item.streamItem}
                        participant={item.participant}
                        cameraOverlay={item.streamItem.type === 'screen' ? cameraByOwner.get(item.participant.id) : null}
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
            <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_6.5rem] gap-2 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] md:grid-rows-1">
              <div className="relative min-h-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black shadow-2xl">
                <StreamTile
                  streamItem={pinnedStream}
                  participant={pinnedStream.participant}
                  cameraOverlay={pinnedStream.type === 'screen' ? cameraByOwner.get(pinnedStream.participant.id) : null}
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

              <div className="grid min-h-0 grid-cols-2 gap-2 overflow-x-auto overflow-y-hidden md:grid-cols-1 md:overflow-hidden" aria-label="Other participants">
                {secondaryStreams.slice(0, 3).map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => pinStream(item.id)}
                    className="min-h-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-element)] p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]"
                    aria-label={`Pin ${item.participant.displayName} ${item.type}`}
                  >
                    <StreamTile
                      streamItem={item}
                      participant={item.participant}
                      cameraOverlay={item.type === 'screen' ? cameraByOwner.get(item.participant.id) : null}
                    />
                  </button>
                ))}
                {secondaryStreams.length > 3 && (
                  <button type="button" onClick={() => setViewMode(VIEW_MODES.GRID)} className="flex min-h-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-element)] p-3 text-xs font-black text-gray-300" aria-label="Show all streams">
                    +{secondaryStreams.length - 3} more
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        <footer className="shrink-0 border-t border-[var(--border-subtle)] bg-[#12131c]/95 px-2 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-1 sm:gap-2">
            <div className="flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] p-0.5 sm:p-1">
              <button type="button" onClick={() => setViewMode(VIEW_MODES.PINNED)} aria-pressed={viewMode === VIEW_MODES.PINNED} aria-label="Focus view" title="Focus view" className={`rounded-lg p-2 sm:p-2.5 ${viewMode === VIEW_MODES.PINNED ? 'bg-[var(--theme-base)] text-white' : 'text-gray-400 hover:text-white'}`}>
                <Maximize2 size={17} />
              </button>
              <button type="button" onClick={() => setViewMode(VIEW_MODES.GRID)} aria-pressed={viewMode === VIEW_MODES.GRID} aria-label="Grid view" title="Grid view" className={`rounded-lg p-2 sm:p-2.5 ${viewMode === VIEW_MODES.GRID ? 'bg-[var(--theme-base)] text-white' : 'text-gray-400 hover:text-white'}`}>
                <Grid2X2 size={17} />
              </button>
              <button type="button" onClick={() => setViewMode(VIEW_MODES.CAROUSEL)} aria-pressed={viewMode === VIEW_MODES.CAROUSEL} aria-label="Slideshow view" title="Slideshow view" className={`rounded-lg p-2 sm:p-2.5 ${viewMode === VIEW_MODES.CAROUSEL ? 'bg-[var(--theme-base)] text-white' : 'text-gray-400 hover:text-white'}`}>
                <ChevronRight size={17} />
              </button>
            </div>
            {renderControls()}
            <button type="button" onClick={() => setHiddenStreamIds(new Set())} disabled={hiddenStreamIds.size === 0} className="rounded-xl bg-[var(--bg-element)] p-2 text-gray-300 disabled:opacity-40 sm:p-2.5" aria-label="Show hidden streams" title="Show hidden streams">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </footer>
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{connectionLabel}</span>
        {renderControls(true)}
      </div>
    </section>
  )
}
