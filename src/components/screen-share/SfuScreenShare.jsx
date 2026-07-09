import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Volume2, VolumeX } from 'lucide-react'
import { audioSys } from '../../lib/SoundEngine'

function ScreenVideo({ stream, muted = false }) {
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
      className="aspect-video w-full rounded-xl bg-black object-contain"
    />
  )
}

export default function SfuScreenShare({
  roomId,
  createClient,
  className = '',
  title = 'Voice',
  variant = 'panel',
  muted = false,
  deafened = false,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  onOpen,
  onStateChange
}) {
  const [client, setClient] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState([])
  const [selectedShareId, setSelectedShareId] = useState(null)
  const [status, setStatus] = useState('idle')
  const localStreamRef = useRef(null)

  useEffect(() => {
    if (!roomId || !createClient) return

    let active = true
    const nextClient = createClient(roomId)
    setClient(nextClient)
    setStatus('connecting')

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
      setRemoteStreams(current => {
        if (current.some(item => item.stream.id === stream.id)) return current
        return [...current, { stream, participant }]
      })
    })

    return () => {
      active = false
      setClient(null)
      setStatus('idle')
      setRemoteStreams([])
      setLocalStream(current => {
        current?.getTracks().forEach(track => track.stop())
        return null
      })
      localStreamRef.current = null
      if (typeof unsubscribe === 'function') unsubscribe()
      nextClient.disconnect?.()
    }
  }, [roomId, createClient])

  useEffect(() => {
    onStateChange?.({
      status,
      isSharing: Boolean(localStream),
      remoteCount: remoteStreams.length
    })
  }, [localStream, onStateChange, remoteStreams.length, status])

  const sharedStreams = useMemo(() => {
    const streams = []
    if (localStream) streams.push({ id: localStream.id, stream: localStream, name: 'You', local: true })
    remoteStreams.forEach((item, index) => {
      streams.push({
        id: item.stream.id,
        stream: item.stream,
        name: item.participant || `Participant ${index + 2}`,
        local: false
      })
    })
    return streams
  }, [localStream, remoteStreams])

  useEffect(() => {
    if (sharedStreams.length === 0) {
      setSelectedShareId(null)
      return
    }
    if (!sharedStreams.some(item => item.id === selectedShareId)) {
      setSelectedShareId(sharedStreams[0].id)
    }
  }, [selectedShareId, sharedStreams])

  const activeShare = sharedStreams.find(item => item.id === selectedShareId) || sharedStreams[0] || null

  const startShare = async () => {
    if (!client || !navigator.mediaDevices?.getDisplayMedia) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      localStreamRef.current = stream
      setLocalStream(stream)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopShare(stream), { once: true })
      await client.publish?.(stream)
      audioSys.playScreenShareStarted()
    } catch (_err) {
      setStatus('failed')
    }
  }

  const stopShare = async (targetStream = localStreamRef.current) => {
    const stream = targetStream
    const wasSharing = Boolean(stream && localStreamRef.current === stream)
    localStreamRef.current = null
    setLocalStream(null)
    stream?.getTracks().forEach(track => track.stop())
    await client?.unpublish?.(stream)
    if (wasSharing) audioSys.playScreenShareStopped()
  }

  if (variant === 'mini') {
    return (
      <section className={`fixed left-3 right-3 bottom-[calc(var(--minimized-call-offset,4.75rem)+env(safe-area-inset-bottom))] z-[90] w-auto max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--border-subtle)] bg-[#111214]/95 p-2.5 shadow-2xl backdrop-blur-xl md:left-auto md:right-5 md:bottom-[calc(6rem+env(safe-area-inset-bottom))] md:w-[420px] ${className}`}>
        <button type="button" onClick={onOpen} className="mb-3 flex w-full items-center gap-3 text-left">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${status === 'connected' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>
            <MonitorUp size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-[var(--text-main)]">{title}</span>
            <span className="block truncate text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {status}{localStream ? ' - sharing screen' : ''}
            </span>
          </span>
        </button>
        {localStream && <ScreenVideo stream={localStream} muted />}
        <div className="mt-3 flex items-center justify-between gap-2">
          {onToggleMute && (
            <button type="button" onClick={onToggleMute} className={`rounded-xl p-2 ${muted ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
          )}
          {onToggleDeafen && (
            <button type="button" onClick={onToggleDeafen} className={`rounded-xl p-2 ${deafened ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={deafened ? 'Undeafen' : 'Deafen'}>
              {deafened ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          )}
          {localStream ? (
            <button type="button" onClick={() => stopShare()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white">
              <MonitorX size={16} />
              Stop sharing
            </button>
          ) : (
            <button type="button" onClick={startShare} disabled={status !== 'connected'} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--theme-base)] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              <MonitorUp size={16} />
              Share
            </button>
          )}
          {onLeave && (
            <button type="button" onClick={onLeave} className="rounded-xl bg-red-500/15 p-2 text-red-300" aria-label="Leave voice">
              <PhoneOff size={17} />
            </button>
          )}
        </div>
      </section>
    )
  }

  if (variant === 'full') {
    return (
      <section className={`flex flex-1 min-h-0 flex-col overflow-hidden bg-[var(--bg-base)] ${className}`}>
        <div className="flex min-h-0 flex-1 flex-col bg-[#101114] md:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center p-3 md:p-6">
              <div className="relative flex aspect-video w-full max-w-6xl items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black shadow-2xl">
                {activeShare ? (
                  <>
                    <ScreenVideo stream={activeShare.stream} muted={activeShare.local} />
                    <div className="absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-black text-white shadow-xl">
                      {activeShare.name} is sharing screen
                    </div>
                  </>
                ) : (
                  <div className="flex max-w-sm flex-col items-center px-6 text-center">
                    <MonitorUp size={42} className="mb-4 text-gray-500" aria-hidden="true" />
                    <h3 className="text-xl font-black text-[var(--text-main)]">No one is sharing</h3>
                    <p className="mt-2 text-sm text-gray-500">Start a screen share or pick a stream when someone goes live.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 border-t border-[var(--border-subtle)] bg-[#15161a] px-3 py-3">
              {onToggleMute && (
                <button type="button" onClick={onToggleMute} className={`rounded-xl p-3 ${muted ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
              {onToggleDeafen && (
                <button type="button" onClick={onToggleDeafen} className={`rounded-xl p-3 ${deafened ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={deafened ? 'Undeafen' : 'Deafen'}>
                  {deafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              )}
              {localStream ? (
                <button type="button" onClick={() => stopShare()} className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-3 text-sm font-black text-red-300">
                  <MonitorX size={18} />
                  Stop
                </button>
              ) : (
                <button type="button" onClick={startShare} disabled={status !== 'connected'} className="inline-flex items-center gap-2 rounded-xl bg-[var(--theme-base)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                  <MonitorUp size={18} />
                  Share
                </button>
              )}
              {onLeave && (
                <button type="button" onClick={onLeave} className="rounded-xl bg-red-500 p-3 text-white" aria-label="Leave voice">
                  <PhoneOff size={18} />
                </button>
              )}
            </div>
          </div>

          <aside className="flex max-h-60 w-full shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[#18191f] md:max-h-none md:w-80 md:border-l md:border-t-0">
            <div className="border-b border-[var(--border-subtle)] px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-300">{status === 'connected' ? 'Connected' : status}</p>
              <h3 className="truncate text-lg font-black text-[var(--text-main)]">{title}</h3>
              <p className="mt-1 text-xs text-gray-500">{remoteStreams.length + 1} in call</p>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--text-main)]">You</p>
                    <p className="text-xs text-gray-500">{localStream ? 'Sharing screen' : muted ? 'Muted' : 'In voice'}</p>
                  </div>
                  {sharedStreams.length > 1 && localStream && (
                    <button type="button" onClick={() => setSelectedShareId(localStream.id)} className="rounded-lg bg-[var(--theme-20)] px-2.5 py-1.5 text-[10px] font-black text-[var(--theme-base)]">
                      WATCH STREAM
                    </button>
                  )}
                </div>
              </div>
              {remoteStreams.map((item, index) => (
                <div key={item.stream.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--text-main)]">{item.participant || `Participant ${index + 2}`}</p>
                      <p className="text-xs text-gray-500">Sharing screen</p>
                    </div>
                    {sharedStreams.length > 1 && (
                      <button type="button" onClick={() => setSelectedShareId(item.stream.id)} className="rounded-lg bg-[var(--theme-20)] px-2.5 py-1.5 text-[10px] font-black text-[var(--theme-base)]">
                        WATCH STREAM
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{status}</span>
        {localStream ? (
          <button type="button" onClick={() => stopShare()} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-white">
            <MonitorX size={18} />
            Stop sharing
          </button>
        ) : (
          <button type="button" onClick={startShare} disabled={status !== 'connected'} className="inline-flex items-center gap-2 rounded-xl bg-[var(--theme-base)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
            <MonitorUp size={18} />
            Share screen
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ScreenVideo stream={localStream} muted />
        {remoteStreams.map(item => (
          <div key={item.stream.id} className="relative aspect-video bg-black">
            <ScreenVideo stream={item.stream} />
            {item.participant && <div className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white">{item.participant}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}
