import React from 'react'
import { Minimize2, Mic, MicOff, Video, VideoOff, Activity, Phone, PhoneOff } from 'lucide-react'
import { StatusAvatar } from './MessageElements'

export default function CallOverlay({
  callActive, callMinimized, setCallMinimized, callDirection, remoteCaller,
  ncEnabled, micEnabled, videoEnabled, remoteVideoEnabled, pendingVideoRequest,
  localVideoRef, remoteVideoRef, remoteAudioRef,
  acceptCall, endCallNetwork, toggleMic, toggleVideo, toggleNoiseCancellation,
  acceptVideoRequest, declineVideoRequest
}) {
  
  if (!callActive) return null;

  // 🚀 ISLAND DOCKED UI (MINIMIZED)
  if (callMinimized) {
    return (
      <div className="mx-0 md:mx-2 mb-3 bg-[#111214]/90 backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl p-2.5 flex items-center justify-between shadow-2xl animate-fade-in z-40">
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        <div className="flex items-center gap-3 px-2 min-w-0">
          <div className="relative shrink-0">
            <StatusAvatar url={remoteCaller?.avatar_url} username={remoteCaller?.username} showStatus={false} className="w-10 h-10 rounded-full" />
            {callDirection === 'connected' && <div className="absolute inset-0 rounded-full ring-2 ring-green-500 animate-pulse"></div>}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-sm font-bold text-white truncate">{remoteCaller?.username}</span>
            <span className={`text-[10px] uppercase tracking-widest font-bold ${callDirection === 'connected' ? 'text-green-400' : 'text-[var(--theme-base)]'}`}>
              {callDirection === 'incoming' ? 'Incoming...' : callDirection === 'outgoing' ? 'Ringing...' : 'Active Call'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 pr-1 shrink-0">
          <button onClick={toggleMic} className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500'}`}>
            {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
          
          <button onClick={toggleVideo} className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${videoEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500'}`}>
            {videoEnabled ? <Video size={14} /> : <VideoOff size={14} />}
          </button>

          {callDirection === 'incoming' ? (
            <button onClick={acceptCall} className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 h-8 md:h-10 rounded-full transition-all animate-pulse cursor-pointer">Accept</button>
          ) : (
            <button onClick={endCallNetwork} className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all cursor-pointer"><PhoneOff size={14}/></button>
          )}
          
          <div className="w-[1px] h-6 bg-white/10 mx-0.5"></div>
          <button onClick={() => setCallMinimized(false)} className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-white bg-white/5 transition-colors cursor-pointer"><Maximize2 size={14}/></button>
        </div>
      </div>
    )
  }

  // 🚀 FULL SCREEN CALL UI
  return (
    <div className={`fixed inset-0 z-[100] ${remoteVideoEnabled && callDirection === 'connected' ? 'bg-black' : 'bg-[var(--bg-base)]/90 backdrop-blur-2xl'} flex flex-col items-center justify-center p-4 animate-fade-in pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]`}>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      
      <div className="absolute top-6 right-6 flex gap-4 z-50">
        <button onClick={() => setCallMinimized(true)} className="text-gray-400 hover:text-white bg-black/20 p-3 rounded-full border border-white/10 transition-colors cursor-pointer shadow-lg hover:bg-white/10 backdrop-blur-md"><Minimize2 size={20}/></button>
      </div>

      <div className="relative w-full max-w-5xl flex flex-col items-center justify-center gap-4 mb-8 flex-1">
        
        {/* Remote Feed or Avatar */}
        <div className={`relative flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 ${remoteVideoEnabled && callDirection === 'connected' ? 'w-full h-full' : 'w-40 h-40 shadow-[0_0_100px_var(--theme-20)]'}`}>
           <video 
             ref={remoteVideoRef} 
             autoPlay playsInline 
             className={`w-full h-full object-cover ${remoteVideoEnabled && callDirection === 'connected' ? 'block' : 'hidden'}`} 
           />
           {/* Fallback to Avatar */}
           {(!remoteVideoEnabled || callDirection !== 'connected') && (
             <>
               {callDirection === 'connected' && <div className="absolute inset-0 rounded-full border-4 border-[var(--theme-base)] animate-ping opacity-30"></div>}
               <StatusAvatar url={remoteCaller?.avatar_url} username={remoteCaller?.username} showStatus={false} className="w-32 h-32 rounded-full bg-[var(--bg-surface)] border-2 border-white/10 relative z-10" />
             </>
           )}
        </div>

        {/* Local Picture-in-Picture Feed */}
        <div className={`overflow-hidden shadow-2xl border border-white/10 bg-[#1c1e22] transition-all duration-500 ${videoEnabled ? 'block' : 'hidden'} ${remoteVideoEnabled && callDirection === 'connected' ? 'absolute bottom-24 right-4 md:right-8 w-28 h-40 md:w-48 md:h-64 rounded-2xl z-40' : 'w-40 h-40 rounded-3xl'}`}>
           <video 
             ref={localVideoRef} 
             autoPlay playsInline muted 
             className="w-full h-full object-cover"
             style={{ transform: 'scaleX(-1)' }} 
           />
        </div>

        {/* Status Text (Hidden if in full video mode) */}
        {(!remoteVideoEnabled || callDirection !== 'connected') && (
          <div className="absolute bottom-[10%] flex flex-col items-center">
            <h2 className="text-4xl font-bold text-white mb-2 tracking-tight drop-shadow-lg">{remoteCaller?.username}</h2>
            <p className="text-[var(--theme-base)] font-bold text-base tracking-widest uppercase drop-shadow-md">
              {callDirection === 'incoming' ? 'Incoming Call...' : callDirection === 'outgoing' ? 'Ringing...' : 'Connected'}
            </p>
          </div>
        )}
        
        {/* Incoming Video Request Modal */}
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

      <div className="flex gap-4 p-3 bg-black/40 border border-white/10 rounded-full backdrop-blur-3xl shadow-2xl mt-auto z-50">
        <button onClick={toggleMic} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
          {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        
        <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${videoEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
          {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button onClick={toggleNoiseCancellation} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${ncEnabled ? 'bg-[var(--theme-base)] text-white shadow-lg shadow-[var(--theme-50)]' : 'bg-white/5 text-gray-400'}`} title="Hardware Noise Cancellation">
          <Activity size={24} />
        </button>
        
        <div className="w-[1px] h-10 bg-white/10 mx-1 my-auto"></div>

        {callDirection === 'incoming' ? (
          <button onClick={acceptCall} className="w-14 h-14 rounded-full flex items-center justify-center bg-green-500 hover:bg-green-600 text-white transition-all shadow-lg shadow-green-500/30 cursor-pointer animate-pulse">
            <Phone size={24} />
          </button>
        ) : (
          <button onClick={endCallNetwork} className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/30 cursor-pointer">
            <PhoneOff size={24} />
          </button>
        )}
      </div>
    </div>
  )
}
