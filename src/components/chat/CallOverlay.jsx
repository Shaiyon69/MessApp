/**
 * Presents hook-owned WebRTC state in full or minimized call UI. Media refs
 * receive streams from useWebRTC; this component never creates or stops tracks.
 */
import React from 'react'
import { Minimize2, Maximize2, Mic, MicOff, Video, VideoOff, Activity, Phone, PhoneOff, Volume2, GripHorizontal } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import useFloatingMiniPlayer from '../../hooks/useFloatingMiniPlayer'

const CALL_STATUS_LABELS = {
  outgoing: 'Starting call...',
  ringing: 'Ringing...',
  incoming: 'Incoming call',
  connecting: 'Connecting...',
  connected: 'Connected',
  rejected: 'Declined',
  missed: 'Missed call',
  timed_out: 'Timed out',
  cancelled: 'Cancelled',
  ended: 'Ended',
  failed: 'Call failed'
}

export default function CallOverlay({
  callActive, callMinimized, setCallMinimized, callDirection, remoteCaller,
  ncEnabled, micEnabled, videoEnabled, remoteVideoEnabled, pendingVideoRequest, speakerEnabled,
  localVideoRef, remoteVideoRef, remoteAudioRef,
  acceptCall, endCallNetwork, toggleMic, toggleVideo, toggleNoiseCancellation, toggleSpeaker,
  acceptVideoRequest, declineVideoRequest, composerTrayOpen = false
}) {
  const {
    playerRef,
    floatingStyle,
    isDragging,
    dragHandleProps
  } = useFloatingMiniPlayer('messapp:mini-player:direct-call')

  if (!callActive) return null;

  const isIncoming = callDirection === 'incoming'
  const isConnected = callDirection === 'connected'
  const isWaiting = ['incoming', 'outgoing', 'ringing', 'connecting'].includes(callDirection)
  const isTerminal = ['rejected', 'missed', 'timed_out', 'cancelled', 'ended', 'failed'].includes(callDirection)
  const isVideoLive = remoteVideoEnabled && isConnected
  const hasMiniVideo = isVideoLive || (videoEnabled && !isIncoming)
  const isMiniVideoCall = hasMiniVideo || videoEnabled || remoteVideoEnabled
  const statusLabel = CALL_STATUS_LABELS[callDirection] || 'Call'

  if (callMinimized) {
    return (
      <div
        ref={playerRef}
        style={floatingStyle}
        data-ui-overlay-owner="CallOverlay:minimized-card"
        data-composer-tray-open={composerTrayOpen ? 'true' : undefined}
        className={`direct-call-mini minimized-call-card fixed left-auto right-3 bottom-[calc(var(--minimized-call-offset,4.75rem)+env(safe-area-inset-bottom))] w-[min(340px,calc(100vw-1.5rem))] pointer-events-auto max-h-[70dvh] overflow-y-auto md:right-5 md:bottom-[calc(6rem+env(safe-area-inset-bottom))] border border-[var(--border-subtle)] rounded-[1.35rem] p-2 shadow-2xl animate-fade-in z-[90] ${isDragging ? 'is-dragging select-none' : ''}`}
      >
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        <header className="direct-call-mini-header mb-2 flex items-center gap-2 rounded-2xl px-1.5 py-1">
          <button
            type="button"
            {...dragHandleProps}
            className={`flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded-xl px-2 py-1.5 text-left text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isDragging ? 'cursor-grabbing text-gray-200' : 'hover:text-gray-200'}`}
            aria-label="Move mini call player"
            title="Drag to move. Use arrow keys to move, or double-click to reset."
          >
            <GripHorizontal size={16} className="shrink-0 text-gray-600" aria-hidden="true" />
            <span className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]' : isTerminal ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`} />
            <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-[0.16em]">
              {isMiniVideoCall ? 'Video call' : 'Voice call'} · {statusLabel}
            </span>
          </button>
          <button type="button" onClick={() => setCallMinimized(false)} className="direct-call-mini-control flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400" aria-label="Open full call" title="Open full call">
            <Maximize2 size={14}/>
          </button>
        </header>

        {hasMiniVideo ? (
          <div className="direct-call-mini-media relative mb-2 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={isVideoLive ? remoteVideoRef : localVideoRef}
              autoPlay
              playsInline
              muted={!isVideoLive}
              className="h-full w-full object-cover"
              style={!isVideoLive ? { transform: 'scaleX(-1)' } : undefined}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-3.5 pb-3 pt-12">
              <p className="truncate text-base font-black tracking-tight text-white">{remoteCaller?.username || 'Call'}</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isConnected ? 'text-green-300' : 'text-[var(--theme-base)]'}`}>
                {statusLabel}{!isVideoLive ? ' · Your camera' : ''}
              </p>
            </div>
            {isVideoLive && videoEnabled && (
              <div className="direct-call-mini-pip absolute right-2.5 top-2.5 h-20 w-14 overflow-hidden rounded-xl border border-white/20 bg-[#1c1e22] shadow-xl sm:h-24 sm:w-16">
                <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              </div>
            )}
          </div>
        ) : (
          <div className="direct-call-mini-audio relative mb-2 flex min-h-32 min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-white/[0.07] px-4 py-4">
            <div className="direct-call-mini-orb direct-call-mini-orb-one" aria-hidden="true" />
            <div className="direct-call-mini-orb direct-call-mini-orb-two" aria-hidden="true" />
            <div className={`direct-call-mini-avatar-shell relative z-[1] shrink-0 rounded-full p-1.5 ${isConnected ? 'is-connected' : ''}`}>
              {isConnected && <span className="direct-call-mini-avatar-wave absolute rounded-full border border-green-400/55" aria-hidden="true" />}
              <StatusAvatar url={remoteCaller?.avatar_url} username={remoteCaller?.username} showStatus={false} className="relative z-[2] h-16 w-16 rounded-full" />
              <span className={`absolute bottom-1 right-1 z-[3] h-3.5 w-3.5 rounded-full border-[3px] border-[#151820] ${isConnected ? 'bg-green-400' : isTerminal ? 'bg-red-400' : 'bg-amber-400'}`} aria-hidden="true" />
            </div>
            <div className="relative z-[1] min-w-0 flex-1">
              <span className="block truncate text-lg font-black tracking-tight text-white">{remoteCaller?.username || 'Call'}</span>
              <span className={`mt-0.5 block truncate text-[10px] font-bold uppercase tracking-[0.15em] ${isConnected ? 'text-green-400' : 'text-[var(--theme-base)]'}`}>
                {statusLabel}{isConnected ? ` · ${micEnabled ? 'Mic on' : 'Muted'}` : ''}
              </span>
              {isConnected && (
                <div className="mt-3 flex h-5 items-center gap-1" aria-label="Call audio is live">
                  {[7, 12, 18, 10, 15, 8].map((height, index) => (
                    <span key={index} className="direct-call-mini-level w-1 rounded-full bg-green-400" style={{ height: `${height}px`, animationDelay: `${index * 90}ms` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="direct-call-mini-controls flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/[0.06] p-1.5">
          {!isTerminal && (
            <>
              <button type="button" onClick={toggleMic} className={`direct-call-mini-control flex h-9 w-9 items-center justify-center rounded-full md:h-10 md:w-10 ${micEnabled ? 'text-white' : 'is-danger text-red-300'}`} aria-label={micEnabled ? 'Mute' : 'Unmute'} title={micEnabled ? 'Mute' : 'Unmute'}>
                {micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
              </button>

              <button type="button" onClick={toggleVideo} className={`direct-call-mini-control flex h-9 w-9 items-center justify-center rounded-full md:h-10 md:w-10 ${videoEnabled ? 'is-active text-white' : 'is-danger text-red-300'}`} aria-label={videoEnabled ? 'Turn video off' : 'Turn video on'} title={videoEnabled ? 'Turn video off' : 'Turn video on'}>
                {videoEnabled ? <Video size={15} /> : <VideoOff size={15} />}
              </button>

              <button type="button" onClick={toggleSpeaker} className={`direct-call-mini-control flex h-9 w-9 items-center justify-center rounded-full md:h-10 md:w-10 ${speakerEnabled ? 'is-active text-white' : 'text-gray-400'}`} aria-label="Toggle speaker" title="Speaker">
                <Volume2 size={15} />
              </button>

              <button type="button" onClick={toggleNoiseCancellation} className={`direct-call-mini-control flex h-9 w-9 items-center justify-center rounded-full md:h-10 md:w-10 ${ncEnabled ? 'is-active text-white' : 'is-danger text-red-300'}`} aria-label={ncEnabled ? 'Turn noise reduction off' : 'Turn noise reduction on'} title="Enhanced noise reduction">
                <Activity size={15} />
              </button>

              {isIncoming ? (
                <button type="button" onClick={acceptCall} className="direct-call-mini-accept inline-flex h-9 items-center gap-2 rounded-full bg-green-500 px-4 text-xs font-black text-white md:h-10"><Phone size={14} />Accept</button>
              ) : (
                <button type="button" onClick={() => endCallNetwork('ended')} className="direct-call-mini-end flex h-9 w-11 items-center justify-center rounded-full bg-red-500 text-white md:h-10 md:w-12" aria-label="End call" title="End call"><PhoneOff size={15}/></button>
              )}
            </>
          )}
          {isTerminal && <span className="px-3 py-2 text-xs font-bold text-gray-500">{statusLabel}</span>}
        </div>
      </div>
    )
  }

  return (
    <div data-ui-overlay-owner="CallOverlay:fullscreen-call" className={`fixed inset-0 z-[100] ${isVideoLive ? 'bg-black' : 'bg-[var(--bg-base)]/90 backdrop-blur-2xl'} flex flex-col items-center justify-center p-4 animate-fade-in pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]`}>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] flex gap-4 z-50">
        <button onClick={() => setCallMinimized(true)} className="text-gray-400 hover:text-white bg-black/20 p-3 rounded-full border border-white/10 transition-colors cursor-pointer shadow-lg hover:bg-white/10 backdrop-blur-md"><Minimize2 size={20}/></button>
      </div>

      <div className="relative w-full max-w-5xl flex flex-col items-center justify-center gap-4 mb-8 flex-1">
        
        <div className={`relative flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 ${isVideoLive ? 'w-full h-full' : 'w-52 h-52 md:w-64 md:h-64 shadow-[0_0_100px_var(--theme-20)]'}`}>
           <video 
             ref={remoteVideoRef} 
             autoPlay playsInline 
             className={`w-full h-full object-cover ${isVideoLive ? 'block' : 'hidden'}`}
           />
           {!isVideoLive && (
             <>
               {isWaiting && <div className="absolute inset-4 rounded-full border-4 border-[var(--theme-base)] animate-ping opacity-25"></div>}
               {isWaiting && <div className="absolute inset-0 rounded-full border border-[var(--theme-base)]/30 animate-pulse"></div>}
               <StatusAvatar url={remoteCaller?.avatar_url} username={remoteCaller?.username} showStatus={false} className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-[var(--bg-surface)] border-2 border-white/10 relative z-10 shadow-2xl" />
             </>
           )}
        </div>

        <div className={`overflow-hidden shadow-2xl border border-white/10 bg-[#1c1e22] transition-all duration-500 ${videoEnabled ? 'block' : 'hidden'} ${isVideoLive ? 'absolute bottom-24 right-4 md:right-8 w-28 h-40 md:w-48 md:h-64 rounded-2xl z-40' : 'w-40 h-40 rounded-3xl'}`}>
           <video 
             ref={localVideoRef} 
             autoPlay playsInline muted 
             className="w-full h-full object-cover"
             style={{ transform: 'scaleX(-1)' }} 
           />
        </div>

        {!isVideoLive && (
          <div className="absolute bottom-[8%] flex flex-col items-center px-4 text-center">
            <h2 className="text-4xl font-bold text-white mb-2 tracking-tight drop-shadow-lg">{remoteCaller?.username}</h2>
            <p className="text-[var(--theme-base)] font-bold text-base tracking-widest uppercase drop-shadow-md">
              {statusLabel}
            </p>
          </div>
        )}
        
        {pendingVideoRequest && (
          <div className="absolute top-24 bg-[#1c1e22] border border-indigo-500 p-5 rounded-3xl shadow-[0_0_40px_rgba(99,102,241,0.4)] z-[200] flex flex-col items-center gap-4 animate-slide-up">
            <div className="bg-indigo-500/20 p-3 rounded-full text-indigo-400">
              <Video size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-white font-bold text-lg">{remoteCaller?.username || 'User'}</h3>
              <span className="text-gray-300 text-sm">is requesting to turn on video</span>
            </div>
            <div className="flex gap-3 w-full mt-2">
               <button onClick={declineVideoRequest} className="flex-1 bg-white/5 border border-white/10 text-white py-3 rounded-xl text-sm font-bold hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer">Decline</button>
               <button onClick={acceptVideoRequest} className="flex-1 bg-green-500 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-green-500/20 hover:bg-green-600 transition-colors cursor-pointer">Accept</button>
            </div>
          </div>
        )}
      </div>

      {!isTerminal && <div className="flex gap-2 md:gap-4 p-2 md:p-3 bg-black/40 border border-white/10 rounded-full backdrop-blur-3xl shadow-2xl mt-auto z-50 max-w-full">
        <button onClick={toggleMic} className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
          {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        
        <button onClick={toggleVideo} className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${videoEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
          {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button onClick={toggleNoiseCancellation} className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${ncEnabled ? 'bg-[var(--theme-base)] text-white shadow-lg shadow-[var(--theme-50)]' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`} aria-label={ncEnabled ? 'Turn noise reduction off' : 'Turn noise reduction on'} title="Enhanced noise reduction">
          <Activity size={24} />
        </button>

        <button onClick={toggleSpeaker} className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${speakerEnabled ? 'bg-[var(--theme-base)] text-white shadow-lg shadow-[var(--theme-50)]' : 'bg-white/10 hover:bg-white/20 text-white'}`} title="Speaker">
          <Volume2 size={24} />
        </button>
        
        <div className="w-[1px] h-10 bg-white/10 mx-1 my-auto"></div>

        {isIncoming ? (
          <button onClick={acceptCall} className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-green-500 hover:bg-green-600 text-white transition-all shadow-lg shadow-green-500/30 cursor-pointer animate-pulse" title="Answer">
            <Phone size={24} />
          </button>
        ) : (
          <button onClick={() => endCallNetwork('ended')} className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/30 cursor-pointer" title="End call">
            <PhoneOff size={24} />
          </button>
        )}
        {isIncoming && (
          <button onClick={() => endCallNetwork('rejected')} className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/30 cursor-pointer" title="Decline">
            <PhoneOff size={24} />
          </button>
        )}
      </div>}
    </div>
  )
}
