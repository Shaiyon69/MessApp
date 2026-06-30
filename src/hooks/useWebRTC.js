import { useState, useEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { audioSys } from '../lib/SoundEngine';

const CallAudio = registerPlugin('CallAudio');
export const OUTGOING_CALL_TIMEOUT_MS = 30000;
const RINGING_STATES = new Set(['incoming', 'outgoing', 'ringing']);
const ACTIVE_MEDIA_STATES = new Set(['connecting', 'connected']);

const isNativeAndroidCallAudioAvailable = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android' &&
  Capacitor.isPluginAvailable('CallAudio');

const logCallAudioDebug = (message, payload = {}) => {
  if (localStorage.getItem('messappDebugCallAudio') === 'true') {
    console.debug('[CALL_AUDIO_DEBUG]', message, payload);
  }
};

const logCallEndDebug = (message, payload = {}) => {
  try {
    if (localStorage.getItem('messappDebugCalls') !== 'true') return;
  } catch (_err) {
    return;
  }
  console.debug('[CALL_DEBUG]', message, payload);
};

const serializeCallError = (err) => {
  if (!err) return null;
  if (err instanceof Error || typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
};

export function useWebRTC(session, activeDm) {
  const [callActive, setCallActive] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [callDirection, setCallDirection] = useState(null);
  const [remoteCaller, setRemoteCaller] = useState(null);
  const [ncEnabled, setNcEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(false);
  const [pendingVideoRequest, setPendingVideoRequest] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callChannelRef = useRef(null);
  const activeCallTargetRef = useRef(null);
  const incomingVideoRef = useRef(false);
  const outgoingTimeoutRef = useRef(null);
  const cleanupTimerRef = useRef(null);
  const callDirectionRef = useRef(null);
  const endingCallRef = useRef(false);
  const mountedRef = useRef(true);
  const nativeAudioActiveRef = useRef(false);
  const callLifecycleIdRef = useRef(0);

  // Using refs to keep signaling callback readouts up to date without cycling subscriptions
  const callActiveRef = useRef(callActive);
  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    callDirectionRef.current = callDirection;
  }, [callDirection]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const myAvatar = session?.user?.user_metadata?.avatar_url;
  const myUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0];

  const startNativeCallAudio = async () => {
    if (!isNativeAndroidCallAudioAvailable()) return false;
    try {
      logCallAudioDebug('startCall requested', { speakerEnabled });
      const result = await CallAudio.startCall();
      logCallAudioDebug('startCall response', result || {});
      nativeAudioActiveRef.current = true;
      setSpeakerEnabled(Boolean(result?.enabled));
      return true;
    } catch (err) {
      console.warn('[CALL_AUDIO_DEBUG] Android call audio session could not start.', serializeCallError(err));
      return false;
    }
  };

  const setNativeCallAudio = async (enabled) => {
    if (!isNativeAndroidCallAudioAvailable()) return false;
    logCallAudioDebug('setSpeakerEnabled requested', { enabled });
    const result = await CallAudio.setSpeakerEnabled({ enabled });
    logCallAudioDebug('setSpeakerEnabled response', result || {});
    setSpeakerEnabled(Boolean(result?.enabled ?? enabled));
    bindMediaElements();
    return true;
  };

  const restoreNativeCallAudio = () => {
    if (!isNativeAndroidCallAudioAvailable() || !nativeAudioActiveRef.current) return;
    nativeAudioActiveRef.current = false;
    logCallAudioDebug('endCall requested');
    CallAudio.endCall()
      .then((result) => logCallAudioDebug('endCall response', result || {}))
      .catch((err) => console.warn('[CALL_AUDIO_DEBUG] Android call audio restore failed.', serializeCallError(err)));
  };

  useEffect(() => {
    if (callActive && callDirection === 'incoming') audioSys.startRing(false);
    else if (callActive && (callDirection === 'outgoing' || callDirection === 'ringing')) audioSys.startRing(true);
    else audioSys.stopRing();
    return () => audioSys.stopRing();
  }, [callActive, callDirection]);

  const bindMediaElements = () => {
    const remoteAudio = remoteAudioRef.current;
    const remoteVideo = remoteVideoRef.current;
    const localVideo = localVideoRef.current;

    if (remoteAudio && remoteStreamRef.current) {
      if (remoteAudio.srcObject !== remoteStreamRef.current) {
        remoteAudio.srcObject = remoteStreamRef.current;
      }
      remoteAudio.muted = false;
      remoteAudio.volume = 1;
      if (remoteAudio.paused) {
        remoteAudio.play()
          .then(() => logCallAudioDebug('remote audio playback started', { muted: remoteAudio.muted, volume: remoteAudio.volume, hasSrcObject: Boolean(remoteAudio.srcObject) }))
          .catch((err) => {
            if (!callActiveRef.current || endingCallRef.current) return;
            console.warn('[CALL_AUDIO_DEBUG] Remote audio playback failed.', { muted: remoteAudio.muted, volume: remoteAudio.volume, hasSrcObject: Boolean(remoteAudio.srcObject), error: serializeCallError(err) });
          });
      }
    }
    if (remoteVideo && remoteStreamRef.current && remoteVideo.srcObject !== remoteStreamRef.current) {
      remoteVideo.srcObject = remoteStreamRef.current;
      remoteVideo.play().catch(() => {});
    }
    if (localVideo && localStreamRef.current && localVideo.srcObject !== localStreamRef.current) {
      localVideo.srcObject = localStreamRef.current;
      localVideo.play().catch(() => {});
    }
  };

  useEffect(() => {
    bindMediaElements();
  });

  useEffect(() => {
    const handleMediaRebind = () => {
      if (document.visibilityState === 'visible') bindMediaElements();
    };
    const handleOrientation = () => setTimeout(bindMediaElements, 120);
    document.addEventListener('visibilitychange', handleMediaRebind);
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('resize', handleOrientation);
    return () => {
      document.removeEventListener('visibilitychange', handleMediaRebind);
      window.removeEventListener('orientationchange', handleOrientation);
      window.removeEventListener('resize', handleOrientation);
    };
  }, []);

  const createPeerConnection = () => {
    const lifecycleId = callLifecycleIdRef.current;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = (e) => {
      if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) return;
      if (e.candidate) sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) return;
      const stream = e.streams?.[0] || remoteStreamRef.current || new MediaStream();
      if (!remoteStreamRef.current) remoteStreamRef.current = stream;
      if (!remoteStreamRef.current.getTracks().find(t => t.id === e.track.id)) {
        remoteStreamRef.current.addTrack(e.track);
      }
      if (e.track.kind === 'video') {
        setRemoteVideoEnabled(!e.track.muted && e.track.readyState !== 'ended');
        e.track.onunmute = () => {
          setRemoteVideoEnabled(true);
          bindMediaElements();
        };
        e.track.onmute = () => setRemoteVideoEnabled(false);
        e.track.onended = () => setRemoteVideoEnabled(false);
      }
      bindMediaElements();
    };
    pc.onconnectionstatechange = () => {
      if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) return;
      if (pc.connectionState === 'connected') {
        clearOutgoingTimeout();
        if (callDirectionRef.current !== 'connected') audioSys.playCallConnected();
        setCallDirection('connected');
      }
      if (pc.connectionState === 'disconnected' && callDirectionRef.current === 'connected') {
        setCallDirection('connecting');
      }
      if (pc.connectionState === 'failed') {
        audioSys.playCallFailed();
        endCallLocal('failed');
        toast.error('Call failed.');
      }
    };
    return pc;
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const sigChannel = supabase.channel('global-signaling');
    
    sigChannel.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
      if (payload.targetId !== session.user.id) return;
      if (endingCallRef.current && !['end', 'reject', 'timeout'].includes(payload.type)) {
        return;
      }

      if (payload.type === 'offer') {
        if (callActiveRef.current) {
          sendSignal(payload.callerId, 'busy', {});
          return;
        }
        const lifecycleId = beginCallLifecycle();
        endingCallRef.current = false;
        setRemoteCaller(payload.caller);
        activeCallTargetRef.current = payload.callerId;
        setCallDirection('incoming');
        setCallActive(true);
        setCallMinimized(false);
        incomingVideoRef.current = Boolean(payload.isVideo);
        setRemoteVideoEnabled(false);
        setVideoEnabled(Boolean(payload.isVideo));
        
        if (!pcRef.current) {
          pcRef.current = createPeerConnection();
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.offer));
        if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) return;
      }

      if (payload.type === 'answer') {
        if (endingCallRef.current) return;
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          clearOutgoingTimeout();
          setCallDirection('connecting');
        }
      }

      if (payload.type === 'ice-candidate') {
        if (endingCallRef.current) return;
        if (pcRef.current && pcRef.current.remoteDescription) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (_err) {}
        }
      }

      if (payload.type === 'end') {
        const wasConnected = callDirectionRef.current === 'connected';
        const finalState = wasConnected ? 'ended' : callDirectionRef.current === 'incoming' ? 'cancelled' : 'ended';
        endCallLocal(finalState);
        if (wasConnected) {
          audioSys.playCallEnded();
          toast('Call ended');
        } else {
          audioSys.playCallFailed();
          toast('Call cancelled.');
        }
      }
      
      if (payload.type === 'busy') {
        audioSys.playCallFailed();
        endCallLocal('rejected');
        toast.error('User is busy in another call');
      }

      if (payload.type === 'reject') {
        audioSys.playCallFailed();
        endCallLocal('rejected');
        toast.error('Call declined.');
      }

      if (payload.type === 'timeout') {
        audioSys.playCallFailed();
        endCallLocal('missed');
        toast('Missed call.');
      }

      if (payload.type === 'video-request-intent' && !endingCallRef.current && callActiveRef.current) setPendingVideoRequest(true);
      
      if (payload.type === 'video-request-declined') {
        toast.dismiss('vid-req');
        toast.error(`${payload.caller?.username || 'User'} declined the video request.`);
      }
      
      if (payload.type === 'video-request-accepted') {
        if (endingCallRef.current || !callActiveRef.current) return;
        toast.dismiss('vid-req');
        toast.success("Video accepted! Connecting streams...");
        initiateVideoUpgrade(); 
      }
      
      if (payload.type === 'video-upgrade-offer' && !endingCallRef.current && callActiveRef.current) handleVideoUpgradeOffer(payload.offer);
      
      if (payload.type === 'video-upgrade-answer') {
        if (endingCallRef.current || !callActiveRef.current) return;
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      }
    });

    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') callChannelRef.current = sigChannel;
    });

    return () => {
      clearOutgoingTimeout();
      clearCleanupTimer();
      endingCallRef.current = true;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(track => track.stop());
        remoteStreamRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      audioSys.stopRing();
      restoreNativeCallAudio();
      supabase.removeChannel(sigChannel);
    };

  }, [session?.user?.id]);

  const sendSignal = (targetId, type, data) => {
    if (callChannelRef.current && targetId) {
      callChannelRef.current.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: { targetId, type, callerId: session.user.id, ...data }
      }).catch(()=>{});
    }
  };

  const checkMediaAccess = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("⚠️ Secure Context Required! You must access this via 'localhost' or HTTPS to use the camera/mic.", { duration: 5000 });
      return false;
    }
    return true;
  };

  const clearOutgoingTimeout = () => {
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
  };

  const clearCleanupTimer = () => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
  };

  const beginCallLifecycle = () => {
    callLifecycleIdRef.current += 1;
    endingCallRef.current = false;
    return callLifecycleIdRef.current;
  };

  const isCurrentCallLifecycle = (lifecycleId) =>
    !endingCallRef.current && lifecycleId === callLifecycleIdRef.current;

  const scheduleOutgoingTimeout = () => {
    clearOutgoingTimeout();
    outgoingTimeoutRef.current = setTimeout(() => {
      const targetId = activeCallTargetRef.current;
      if (!targetId || !callActiveRef.current || callDirectionRef.current === 'connected') return;
      sendSignal(targetId, 'timeout', {});
      audioSys.playCallFailed();
      endCallLocal('timed_out');
      toast.error('Call timed out.');
    }, OUTGOING_CALL_TIMEOUT_MS);
  };

  const stopStream = (streamRef) => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach(track => {
      try {
        track.onmute = null;
        track.onunmute = null;
        track.onended = null;
        track.stop();
      } catch (_err) {}
    });
    streamRef.current = null;
  };

  const detachMediaElement = (elementRef) => {
    const element = elementRef.current;
    if (!element) return;
    try {
      element.pause?.();
      element.srcObject = null;
      element.removeAttribute?.('src');
      element.load?.();
    } catch (_err) {}
  };

  const closePeerConnection = () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.getSenders?.().forEach(sender => {
        try { sender.track?.stop(); } catch (_err) {}
      });
      pc.close();
    } catch (_err) {}
    pcRef.current = null;
  };

  const startCall = async (withVideo = false) => {
    if (!activeDm || !checkMediaAccess()) return;
    const lifecycleId = beginCallLifecycle();
    endingCallRef.current = false
    setRemoteCaller(activeDm.profiles);
    activeCallTargetRef.current = activeDm.profiles.id;
    setCallDirection('outgoing');
    setCallActive(true);
    setCallMinimized(false);
    setVideoEnabled(withVideo);

    try {
      const constraints = {
        video: withVideo,
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled }
      };
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'TypeError') {
          console.warn("Retrying with fallback simple audio constraints due to structural error:", serializeCallError(err));
          stream = await navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true });
        } else {
          throw err;
        }
      }

      if (!isCurrentCallLifecycle(lifecycleId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      localStreamRef.current = stream;
      await startNativeCallAudio();
      if (!isCurrentCallLifecycle(lifecycleId)) {
        stopStream(localStreamRef);
        restoreNativeCallAudio();
        return;
      }
      bindMediaElements();

      pcRef.current = createPeerConnection();
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

      const offer = await pcRef.current.createOffer();
      if (!isCurrentCallLifecycle(lifecycleId)) return;
      await pcRef.current.setLocalDescription(offer);
      if (!isCurrentCallLifecycle(lifecycleId)) return;

      sendSignal(activeCallTargetRef.current, 'offer', {
        offer, caller: { id: session.user.id, username: myUsername, avatar_url: myAvatar }, isVideo: withVideo
      });
      setCallDirection('ringing');
      scheduleOutgoingTimeout();
    } catch (err) {
      console.error("Call initiation structural error context:", serializeCallError(err));
      audioSys.playCallFailed();
      endCallLocal('failed');
      if (err.name === 'NotAllowedError') {
        toast.error("Camera or Microphone permission denied");
      } else {
        toast.error(`Failed to access hardware devices: ${err.message || 'Unknown configuration error'}`);
      }
    }
  };

  const acceptCall = async () => {
    if (!checkMediaAccess()) { endCallNetwork('rejected'); return; }
    const lifecycleId = callLifecycleIdRef.current;
    endingCallRef.current = false;
    setCallDirection('connecting');
    try {
      const constraints = {
        video: incomingVideoRef.current || videoEnabled,
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'TypeError') {
          console.warn("Retrying with fallback simple audio constraints on target device:", serializeCallError(err));
          stream = await navigator.mediaDevices.getUserMedia({ video: incomingVideoRef.current || videoEnabled, audio: true });
        } else {
          throw err;
        }
      }

      if (!isCurrentCallLifecycle(lifecycleId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      localStreamRef.current = stream;
      await startNativeCallAudio();
      if (!isCurrentCallLifecycle(lifecycleId)) {
        stopStream(localStreamRef);
        restoreNativeCallAudio();
        return;
      }
      bindMediaElements();
      
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
      
      const answer = await pcRef.current.createAnswer();
      if (!isCurrentCallLifecycle(lifecycleId)) return;
      await pcRef.current.setLocalDescription(answer);
      if (!isCurrentCallLifecycle(lifecycleId)) return;
      
      sendSignal(activeCallTargetRef.current, 'answer', { answer, isVideo: stream.getVideoTracks().length > 0 });
      setCallDirection('connected');
      audioSys.playCallConnected();
    } catch (err) {
      console.error("Call answering structural error context:", serializeCallError(err));
      audioSys.playCallFailed();
      const targetId = activeCallTargetRef.current;
      endCallLocal('failed');
      sendSignal(targetId, 'end', {});
      if (err.name === 'NotAllowedError') {
        toast.error("Camera or Microphone permission denied");
      } else {
        toast.error(`Failed to answer hardware device stream: ${err.message || 'Device configuration error'}`);
      }
    }
  };

  const resetCallUiState = () => {
  callActiveRef.current = false
  callDirectionRef.current = null

  setCallActive(false)
  setCallMinimized(false)
  setCallDirection(null)
  setRemoteCaller(null)
  setMicEnabled(true)
  setVideoEnabled(false)
  setRemoteVideoEnabled(false)
  setPendingVideoRequest(false)
  setSpeakerEnabled(false)
}

  const endCallNetwork = (reason) => {
    logCallEndDebug('end button clicked', { reason, callDirection: callDirectionRef.current, callActive: callActiveRef.current });
    const targetId = activeCallTargetRef.current;
    const currentState = callDirectionRef.current;
    const nextReason = reason || (currentState === 'incoming' ? 'rejected' : currentState === 'connected' ? 'ended' : 'cancelled');
    if (!endingCallRef.current && targetId) {
      sendSignal(targetId, nextReason === 'rejected' ? 'reject' : 'end', {});
      logCallEndDebug('signal sent', { targetId, type: nextReason === 'rejected' ? 'reject' : 'end', reason: nextReason });
    }
    if (nextReason === 'ended') audioSys.playCallEnded();
    else audioSys.playCallFailed();
    forceEndCall(nextReason);
  };

  const forceEndCall = (finalState = 'ended') => {
    const alreadyEnding = endingCallRef.current;

    logCallEndDebug(alreadyEnding ? 'cleanup re-entered' : 'cleanup started', {
      finalState,
      callDirection: callDirectionRef.current,
      callActive: callActiveRef.current
    });

    callActiveRef.current = false;
    callDirectionRef.current = null;

    setCallActive(false);
    setCallMinimized(false);
    setCallDirection(null);
    setRemoteCaller(null);
    setMicEnabled(true);
    setVideoEnabled(false);
    setRemoteVideoEnabled(false);
    setPendingVideoRequest(false);
    setSpeakerEnabled(false);

    if (alreadyEnding) {
      logCallEndDebug('cleanup skipped after hard UI close', { finalState });
      return;
    }

    endingCallRef.current = true;
    callLifecycleIdRef.current += 1;

    clearOutgoingTimeout();
    clearCleanupTimer();

    closePeerConnection();
    stopStream(localStreamRef);
    stopStream(remoteStreamRef);

    detachMediaElement(localVideoRef);
    detachMediaElement(remoteVideoRef);
    detachMediaElement(remoteAudioRef);

    restoreNativeCallAudio();

    incomingVideoRef.current = false;
    activeCallTargetRef.current = null;

    audioSys.stopRing();

    logCallEndDebug('cleanup finished', { finalState });

    setTimeout(() => {
      endingCallRef.current = false;
    }, 250);
  };

  const endCallLocal = (finalState = 'ended') => {
    forceEndCall(finalState);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoEnabled;
      setVideoEnabled(!videoEnabled);
    } else {
      if (!checkMediaAccess()) return;
      toast('Asking recipient to turn on video...', { icon: '⏳', id: 'vid-req', duration: 10000 });
      sendSignal(activeCallTargetRef.current, 'video-request-intent', {});
    }
  };

  const initiateVideoUpgrade = async () => {
    const lifecycleId = callLifecycleIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!isCurrentCallLifecycle(lifecycleId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const newVidTrack = stream.getVideoTracks()[0];
      
      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      
      localStreamRef.current.addTrack(newVidTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      bindMediaElements();
      setVideoEnabled(true);

      if (pcRef.current) {
        pcRef.current.addTrack(newVidTrack, localStreamRef.current);
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        sendSignal(activeCallTargetRef.current, 'video-upgrade-offer', { offer });
      }
    } catch(e) { 
      console.error(serializeCallError(e));
      toast.error("Camera access failed during upgrade"); 
    }
  };

  const handleVideoUpgradeOffer = async (offer) => {
    if (!pcRef.current) return;
    const lifecycleId = callLifecycleIdRef.current;
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    if (!isCurrentCallLifecycle(lifecycleId)) return;
    const answer = await pcRef.current.createAnswer();
    if (!isCurrentCallLifecycle(lifecycleId)) return;
    await pcRef.current.setLocalDescription(answer);
    if (!isCurrentCallLifecycle(lifecycleId)) return;
    sendSignal(activeCallTargetRef.current, 'video-upgrade-answer', { answer });
  };

  const acceptVideoRequest = async () => {
    const lifecycleId = callLifecycleIdRef.current;
    try {
      if (!checkMediaAccess()) { declineVideoRequest(); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!isCurrentCallLifecycle(lifecycleId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const newVidTrack = stream.getVideoTracks()[0];
      
      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      
      localStreamRef.current.addTrack(newVidTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      bindMediaElements();
      setVideoEnabled(true);
      
      if (pcRef.current) {
        pcRef.current.addTrack(newVidTrack, localStreamRef.current);
      }
      setPendingVideoRequest(false);
      sendSignal(activeCallTargetRef.current, 'video-request-accepted', {});
    } catch(e) {
      console.error(serializeCallError(e));
      toast.error("Could not access camera");
      declineVideoRequest();
    }
  };

  const declineVideoRequest = () => {
    setPendingVideoRequest(false);
    sendSignal(activeCallTargetRef.current, 'video-request-declined', { caller: { username: myUsername } });
  };

  const toggleNoiseCancellation = async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextState = !ncEnabled;
        try {
          await audioTrack.applyConstraints({ noiseSuppression: nextState, echoCancellation: nextState, autoGainControl: nextState });
          setNcEnabled(nextState);
          toast(nextState ? "Hardware Noise Cancellation On" : "Noise Cancellation Off", { icon: nextState ? '🎙️' : '⚠️' });
        } catch (_err) { toast.error("Browser does not support dynamic constraints"); }
      }
    }
  };

  const toggleSpeaker = async () => {
    const nextState = !speakerEnabled;
    if (isNativeAndroidCallAudioAvailable()) {
      try {
        await setNativeCallAudio(nextState);
        toast(nextState ? 'Speaker output selected' : 'Phone audio selected');
      } catch (_err) {
        console.warn('[CALL_AUDIO_DEBUG] Android call audio output switch failed.', { requestedEnabled: nextState, error: serializeCallError(_err) });
        toast.error('Could not change Android call audio output.');
      }
      return;
    }

    const audio = remoteAudioRef.current;
    if (!audio || typeof audio.setSinkId !== 'function') {
      setSpeakerEnabled(nextState);
      toast('Speaker routing follows your device audio settings on this platform.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(device => device.kind === 'audiooutput');
      const target = nextState
        ? outputs.find(device => /speaker|speakerphone/i.test(device.label)) || outputs.find(device => device.deviceId === 'default')
        : outputs.find(device => /earpiece|communications/i.test(device.label)) || outputs.find(device => device.deviceId === 'default');
      await audio.setSinkId(target?.deviceId || 'default');
      setSpeakerEnabled(nextState);
      toast(nextState ? 'Speaker output selected' : 'Default call audio selected');
    } catch (_err) {
      setSpeakerEnabled(nextState);
      toast('Audio output switching is controlled by the device on this platform.');
    }
  };

  return {
    callActive, callMinimized, setCallMinimized, callDirection, remoteCaller,
    ncEnabled, micEnabled, videoEnabled, remoteVideoEnabled, pendingVideoRequest, speakerEnabled,
    localVideoRef, remoteVideoRef, remoteAudioRef,
    startCall, acceptCall, endCallNetwork, toggleMic, toggleVideo, toggleNoiseCancellation, toggleSpeaker,
    acceptVideoRequest, declineVideoRequest
  };
}
