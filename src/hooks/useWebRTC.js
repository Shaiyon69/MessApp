/**
 * Owns the one-to-one WebRTC call state machine, peer connection, local media,
 * Supabase signaling, and Android audio routing. Tracks belong to this hook and
 * must stop when a call ends or the active DM changes.
 */
import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { audioSys } from '../lib/SoundEngine';
import { debug } from '../lib/debug';
import { applyVoiceAudioProcessing, getVoiceMediaStream } from '../lib/voiceAudioProcessing';
import { acquireAlternateCamera, CallAudio } from '../lib/mediaDevices';
import { getIceServers, hasTurnRelay } from '../lib/iceServers';
import { isPolite, shouldIgnoreOffer } from '../lib/negotiation';

export const OUTGOING_CALL_TIMEOUT_MS = 30000;
// A peer connection reports `disconnected` for ordinary network blips and
// usually recovers on its own, so an ICE restart waits this long first.
const ICE_RECOVERY_DELAY_MS = 5000;
// Bounds the buffer a peer that never answers can grow.
const MAX_PENDING_ICE_CANDIDATES = 100;
const NO_TURN_HINT = 'No TURN relay is configured, so calls only connect when both devices can reach each other directly.';

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

/** Returns call state and controls for the active DM, including cleanup handlers. */
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
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('user');
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);
  const localScreenVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);
  const pendingScreenTrackIdRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const callChannelRef = useRef(null);
  const activeCallTargetRef = useRef(null);
  const incomingVideoRef = useRef(false);
  const outgoingTimeoutRef = useRef(null);
  const callDirectionRef = useRef(null);
  const endingCallRef = useRef(false);
  const mountedRef = useRef(true);
  const nativeAudioActiveRef = useRef(false);
  const callLifecycleIdRef = useRef(0);
  const cameraFacingModeRef = useRef('user');
  // Perfect negotiation. Without these, two renegotiations crossing in flight
  // (both sides toggling screen share, say) left both peer connections stuck in
  // have-local-offer, and no further renegotiation ever succeeded on that call.
  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const settingRemoteAnswerRef = useRef(false);
  const iceRestartedRef = useRef(false);
  const iceRecoveryTimerRef = useRef(null);

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
    const remoteScreenVideo = remoteScreenVideoRef.current;
    const localScreenVideo = localScreenVideoRef.current;

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
    if (remoteScreenVideo && remoteScreenStreamRef.current && remoteScreenVideo.srcObject !== remoteScreenStreamRef.current) {
      remoteScreenVideo.srcObject = remoteScreenStreamRef.current;
      remoteScreenVideo.play().catch(() => {});
    }
    if (localScreenVideo && screenStreamRef.current && localScreenVideo.srcObject !== screenStreamRef.current) {
      localScreenVideo.srcObject = screenStreamRef.current;
      localScreenVideo.play().catch(() => {});
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

  // ICE candidates routinely arrive before the matching remote description is
  // applied (the answerer gathers as soon as it answers, while the caller is
  // still awaiting setRemoteDescription). addIceCandidate throws in that state,
  // so candidates are queued and flushed once a remote description exists —
  // dropping them silently is what left calls stuck in "connecting".
  const flushPendingIceCandidates = async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription || !pendingIceCandidatesRef.current.length) return;
    const queued = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // A candidate from an offer that was ignored or rolled back no longer
        // matches the applied description; the rest still have to be applied.
        debug.warn('WEBRTC_ERROR', { operation: 'flush-ice-candidate', error: serializeCallError(err) });
      }
    }
  };

  const acceptRemoteIceCandidate = async (candidate) => {
    if (!candidate) return;
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      if (pendingIceCandidatesRef.current.length < MAX_PENDING_ICE_CANDIDATES) {
        pendingIceCandidatesRef.current.push(candidate);
      }
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      if (ignoreOfferRef.current) return;
      debug.warn('WEBRTC_ERROR', { operation: 'add-ice-candidate', error: serializeCallError(err) });
    }
  };

  const clearIceRecoveryTimer = () => {
    if (iceRecoveryTimerRef.current) {
      clearTimeout(iceRecoveryTimerRef.current);
      iceRecoveryTimerRef.current = null;
    }
  };

  const failCall = () => {
    audioSys.playCallFailed();
    endCallLocal('failed');
    toast.error(hasTurnRelay() ? 'Call failed.' : `Call failed. ${NO_TURN_HINT}`);
  };

  // A connection that drops (a Wi-Fi to mobile handover, say) used to sit in
  // "Connecting…" until the browser gave up. One ICE restart recovers it. Only
  // the impolite peer offers the restart so the two sides cannot collide.
  const handleConnectionFailure = () => {
    if (endingCallRef.current || !pcRef.current) return;
    if (iceRestartedRef.current) {
      failCall();
      return;
    }
    iceRestartedRef.current = true;
    if (politeRef.current) {
      // The other side drives the restart; give it one window to arrive.
      clearIceRecoveryTimer();
      iceRecoveryTimerRef.current = setTimeout(() => {
        iceRecoveryTimerRef.current = null;
        if (!endingCallRef.current && pcRef.current?.connectionState !== 'connected') failCall();
      }, ICE_RECOVERY_DELAY_MS);
      return;
    }
    debug.warn('WEBRTC_ERROR', { operation: 'ice-restart', connectionState: pcRef.current.connectionState });
    void negotiateLocal('renegotiate-offer', {}, { iceRestart: true });
  };

  const createPeerConnection = async () => {
    const lifecycleId = callLifecycleIdRef.current;
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (e) => {
      if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) return;
      if (e.candidate) void sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) return;
      if (e.track.kind === 'video' && pendingScreenTrackIdRef.current && e.track.id === pendingScreenTrackIdRef.current) {
        pendingScreenTrackIdRef.current = null;
        remoteScreenStreamRef.current = e.streams?.[0] || new MediaStream([e.track]);
        setRemoteScreenSharing(true);
        e.track.onended = () => {
          if (lifecycleId !== callLifecycleIdRef.current) return;
          remoteScreenStreamRef.current = null;
          setRemoteScreenSharing(false);
        };
        bindMediaElements();
        return;
      }
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
        clearIceRecoveryTimer();
        iceRestartedRef.current = false;
        if (callDirectionRef.current !== 'connected') audioSys.playCallConnected();
        setCallDirection('connected');
      }
      if (pc.connectionState === 'disconnected') {
        if (callDirectionRef.current === 'connected') setCallDirection('connecting');
        if (!iceRecoveryTimerRef.current) {
          iceRecoveryTimerRef.current = setTimeout(() => {
            iceRecoveryTimerRef.current = null;
            if (pc.connectionState === 'disconnected') handleConnectionFailure();
          }, ICE_RECOVERY_DELAY_MS);
        }
      }
      if (pc.connectionState === 'failed') {
        // The `disconnected` branch above may already have armed a timer that
        // would fire into a second failure after this one has run.
        clearIceRecoveryTimer();
        handleConnectionFailure();
      }
    };
    return pc;
  };

  /**
   * The single place an offer is created. Every renegotiation (video upgrade,
   * screen share, ICE restart) goes through here so a crossing offer is caught
   * by the signaling-state guard instead of wedging the connection.
   */
  const negotiateLocal = async (signalType, extra = {}, { iceRestart = false } = {}) => {
    const pc = pcRef.current;
    if (!pc) return false;
    const lifecycleId = callLifecycleIdRef.current;
    if (makingOfferRef.current || pc.signalingState !== 'stable') {
      debug.warn('WEBRTC_ERROR', { operation: 'negotiate-skipped', signalType, signalingState: pc.signalingState });
      return false;
    }
    try {
      makingOfferRef.current = true;
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (!isCurrentCallLifecycle(lifecycleId)) return false;
      await pc.setLocalDescription(offer);
      if (!isCurrentCallLifecycle(lifecycleId)) return false;
      return await sendSignal(activeCallTargetRef.current, signalType, { offer, ...extra });
    } catch (err) {
      debug.error('WEBRTC_ERROR', { operation: 'negotiate', signalType, error: serializeCallError(err) });
      return false;
    } finally {
      makingOfferRef.current = false;
    }
  };

  /** The single place a remote offer or answer is applied, with collision handling. */
  const applyRemoteDescription = async (description, type) => {
    const pc = pcRef.current;
    if (!pc || !description) return false;
    const lifecycleId = callLifecycleIdRef.current;

    // A stale answer (the offer it replies to was already superseded) has
    // nowhere to go; applying it would throw.
    if (type === 'answer' && pc.signalingState !== 'have-local-offer') return false;

    ignoreOfferRef.current = shouldIgnoreOffer({
      polite: politeRef.current,
      makingOffer: makingOfferRef.current,
      signalingState: pc.signalingState,
      settingRemoteAnswer: settingRemoteAnswerRef.current,
      type
    });
    if (ignoreOfferRef.current) {
      // Candidates gathered for the ignored offer belong to an ICE generation
      // that will never be applied.
      pendingIceCandidatesRef.current = [];
      return false;
    }

    try {
      settingRemoteAnswerRef.current = type === 'answer';
      // The polite peer withdraws its own offer rather than throwing on the
      // remote one.
      if (type === 'offer' && pc.signalingState !== 'stable') {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(new RTCSessionDescription(description));
    } catch (err) {
      debug.error('WEBRTC_ERROR', { operation: 'apply-remote-description', type, error: serializeCallError(err) });
      return false;
    } finally {
      settingRemoteAnswerRef.current = false;
    }

    if (!isCurrentCallLifecycle(lifecycleId)) return false;
    await flushPendingIceCandidates();
    return true;
  };

  /** Answers an offer that `applyRemoteDescription` has already applied. */
  const answerRemote = async (signalType, extra = {}) => {
    const pc = pcRef.current;
    if (!pc || pc.signalingState !== 'have-remote-offer') return false;
    const lifecycleId = callLifecycleIdRef.current;
    try {
      const answer = await pc.createAnswer();
      if (!isCurrentCallLifecycle(lifecycleId)) return false;
      await pc.setLocalDescription(answer);
      if (!isCurrentCallLifecycle(lifecycleId)) return false;
      return await sendSignal(activeCallTargetRef.current, signalType, { answer, ...extra });
    } catch (err) {
      debug.error('WEBRTC_ERROR', { operation: 'answer-remote', signalType, error: serializeCallError(err) });
      return false;
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const sigChannel = supabase.channel('global-signaling');
    
    const handleSignalPayload = async (payload) => {
      if (payload.type === 'offer') {
        if (callActiveRef.current) {
          await sendSignal(payload.callerId, 'busy', {});
          return;
        }
        // Set synchronously: the effect that mirrors callActive into this ref is
        // a render behind, and two simultaneous calls used to slip past the busy
        // check and deadlock both peers.
        callActiveRef.current = true;
        const lifecycleId = beginCallLifecycle();
        activeCallTargetRef.current = payload.callerId;
        politeRef.current = isPolite(session.user.id, payload.callerId);
        iceRestartedRef.current = false;
        incomingVideoRef.current = Boolean(payload.isVideo);

        if (!pcRef.current) {
          pcRef.current = await createPeerConnection();
          if (endingCallRef.current || lifecycleId !== callLifecycleIdRef.current) {
            callActiveRef.current = false;
            closePeerConnection();
            return;
          }
        }
        const applied = await applyRemoteDescription(payload.offer, 'offer');
        if (!applied || !isCurrentCallLifecycle(lifecycleId)) {
          callActiveRef.current = false;
          closePeerConnection();
          return;
        }

        // Ring only once the call can actually be answered. The UI used to go
        // live before the peer connection existed, and accepting inside that
        // window failed the call for both sides.
        setRemoteCaller(payload.caller);
        setRemoteVideoEnabled(false);
        setVideoEnabled(Boolean(payload.isVideo));
        setCallDirection('incoming');
        setCallActive(true);
        setCallMinimized(false);
        // The caller's tab can disappear without sending anything, which used to
        // leave the callee ringing forever.
        scheduleCallTimeout('missed');
        return;
      }

      if (payload.type === 'answer') {
        if (endingCallRef.current) return;
        if (await applyRemoteDescription(payload.answer, 'answer')) {
          clearOutgoingTimeout();
          setCallDirection('connecting');
        }
      }

      if (payload.type === 'ice-candidate') {
        if (endingCallRef.current) return;
        await acceptRemoteIceCandidate(payload.candidate);
      }

      // An ICE restart after a network change: the same SDP exchange, kept
      // separate from `offer` so it never looks like a new incoming call.
      if (payload.type === 'renegotiate-offer' && !endingCallRef.current && callActiveRef.current) {
        if (await applyRemoteDescription(payload.offer, 'offer')) await answerRemote('renegotiate-answer');
      }

      if (payload.type === 'renegotiate-answer' && !endingCallRef.current && callActiveRef.current) {
        await applyRemoteDescription(payload.answer, 'answer');
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
      
      if (payload.type === 'video-upgrade-offer' && !endingCallRef.current && callActiveRef.current) await handleVideoUpgradeOffer(payload.offer);
      
      if (payload.type === 'video-upgrade-answer') {
        if (endingCallRef.current || !callActiveRef.current) return;
        await applyRemoteDescription(payload.answer, 'answer');
      }

      if (payload.type === 'screen-share-offer' && !endingCallRef.current && callActiveRef.current) {
        await handleScreenShareOffer(payload.offer, payload.trackId);
      }

      if (payload.type === 'screen-share-answer') {
        if (endingCallRef.current || !callActiveRef.current) return;
        await applyRemoteDescription(payload.answer, 'answer');
      }

      if (payload.type === 'screen-share-ended') {
        remoteScreenStreamRef.current = null;
        setRemoteScreenSharing(false);
        detachMediaElement(remoteScreenVideoRef);
      }
    };

    sigChannel.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
      if (!payload || payload.targetId !== session.user.id) return;
      // `global-signaling` is shared by every signed-in user, so a message only
      // counts if it came from the peer this call is with. Without this, anyone
      // could end someone else's call or inject SDP into it.
      if (payload.type !== 'offer' && payload.callerId !== activeCallTargetRef.current) return;
      // A fresh offer is allowed through the brief post-hangup window; calling
      // someone straight back used to be silently dropped.
      if (endingCallRef.current && !['end', 'reject', 'timeout', 'offer'].includes(payload.type)) return;

      try {
        await handleSignalPayload(payload);
      } catch (err) {
        // Every SDP path below can throw; unhandled, they left the call frozen
        // with no state change and nothing in the console.
        debug.error('WEBRTC_ERROR', { operation: 'handle-signal', type: payload.type, error: serializeCallError(err) });
      }
    });

    // Our own cleanup closes the channel; that CLOSED is not a failure.
    let closedByTeardown = false;
    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        callChannelRef.current = sigChannel;
        return;
      }
      if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        if (status === 'CLOSED' && closedByTeardown) return;
        // Signaling is down. Dropping the reference makes sendSignal report the
        // failure instead of silently posting into a dead channel.
        callChannelRef.current = null;
        debug.warn('WEBRTC_ERROR', { operation: 'signaling-channel', status });
      }
    });

    return () => {
      clearOutgoingTimeout();
      clearIceRecoveryTimer();
      // Tell the peer before going away; unmounting used to leave them ringing
      // or sitting in a connected call with nobody on the other end.
      if (callActiveRef.current && activeCallTargetRef.current && !endingCallRef.current) {
        void sendSignal(activeCallTargetRef.current, callDirectionRef.current === 'incoming' ? 'reject' : 'end', {});
      }
      endingCallRef.current = true;
      callActiveRef.current = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(track => track.stop());
        remoteStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      remoteScreenStreamRef.current = null;
      pendingScreenTrackIdRef.current = null;
      pendingIceCandidatesRef.current = [];
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      audioSys.stopRing();
      restoreNativeCallAudio();
      closedByTeardown = true;
      callChannelRef.current = null;
      supabase.removeChannel(sigChannel);
    };

  }, [session?.user?.id]);

  /** Returns whether the signal actually reached the channel. */
  const sendSignal = async (targetId, type, data) => {
    const channel = callChannelRef.current;
    if (!channel || !targetId) {
      debug.warn('WEBRTC_ERROR', { operation: 'send-signal-unavailable', type });
      return false;
    }
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: { targetId, type, callerId: session.user.id, ...data }
      });
      return result === 'ok' || result === undefined;
    } catch (err) {
      debug.warn('WEBRTC_ERROR', { operation: 'send-signal', type, error: serializeCallError(err) });
      return false;
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

  const beginCallLifecycle = () => {
    callLifecycleIdRef.current += 1;
    endingCallRef.current = false;
    return callLifecycleIdRef.current;
  };

  const isCurrentCallLifecycle = (lifecycleId) =>
    !endingCallRef.current && lifecycleId === callLifecycleIdRef.current;

  /** Ends a call that never gets answered — used by both the caller and the callee. */
  const scheduleCallTimeout = (finalState = 'timed_out') => {
    clearOutgoingTimeout();
    outgoingTimeoutRef.current = setTimeout(() => {
      const targetId = activeCallTargetRef.current;
      if (!targetId || !callActiveRef.current || callDirectionRef.current === 'connected') return;
      void sendSignal(targetId, 'timeout', {});
      audioSys.playCallFailed();
      endCallLocal(finalState);
      if (finalState === 'missed') toast('Missed call.');
      else toast.error(hasTurnRelay() ? 'Call timed out.' : `Call timed out. ${NO_TURN_HINT}`);
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
    politeRef.current = isPolite(session.user.id, activeDm.profiles.id);
    iceRestartedRef.current = false;
    // Synchronous so a simultaneous inbound offer is answered `busy` instead of
    // racing this call's own setup.
    callActiveRef.current = true;
    setCallDirection('outgoing');
    setCallActive(true);
    setCallMinimized(false);
    setVideoEnabled(withVideo);

    try {
      const stream = await getVoiceMediaStream({
        mediaDevices: navigator.mediaDevices,
        video: withVideo,
        noiseReduction: ncEnabled
      });

      if (!isCurrentCallLifecycle(lifecycleId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      localStreamRef.current = stream;
      cameraFacingModeRef.current = stream.getVideoTracks()[0]?.getSettings?.().facingMode || 'user';
      setCameraFacingMode(cameraFacingModeRef.current);
      await startNativeCallAudio();
      if (!isCurrentCallLifecycle(lifecycleId)) {
        stopStream(localStreamRef);
        restoreNativeCallAudio();
        return;
      }
      bindMediaElements();

      pcRef.current = await createPeerConnection();
      if (!isCurrentCallLifecycle(lifecycleId)) {
        closePeerConnection();
        stopStream(localStreamRef);
        restoreNativeCallAudio();
        return;
      }
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

      const sent = await negotiateLocal('offer', {
        caller: { id: session.user.id, username: myUsername, avatar_url: myAvatar },
        isVideo: withVideo
      });
      if (!isCurrentCallLifecycle(lifecycleId)) {
        closePeerConnection();
        stopStream(localStreamRef);
        restoreNativeCallAudio();
        return;
      }
      if (!sent) {
        // The offer never left the device, so nothing would ever ring. This used
        // to sit on "Ringing…" for the full 30s timeout instead.
        audioSys.playCallFailed();
        endCallLocal('failed');
        toast.error('Could not reach the call service. Check your connection and try again.');
        return;
      }
      setCallDirection('ringing');
      scheduleCallTimeout('timed_out');
    } catch (err) {
      debug.error('WEBRTC_ERROR', { operation: 'initiate-call', error: serializeCallError(err), dmRoomId: activeDm?.dm_room_id, callState: callDirection });
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
    if (pcRef.current?.signalingState !== 'have-remote-offer') {
      debug.warn('WEBRTC_ERROR', { operation: 'accept-too-early', signalingState: pcRef.current?.signalingState });
      return;
    }
    const lifecycleId = callLifecycleIdRef.current;
    endingCallRef.current = false;
    clearOutgoingTimeout();
    setCallDirection('connecting');
    try {
      const stream = await getVoiceMediaStream({
        mediaDevices: navigator.mediaDevices,
        video: incomingVideoRef.current || videoEnabled,
        noiseReduction: ncEnabled
      });

      if (!isCurrentCallLifecycle(lifecycleId)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      localStreamRef.current = stream;
      cameraFacingModeRef.current = stream.getVideoTracks()[0]?.getSettings?.().facingMode || 'user';
      setCameraFacingMode(cameraFacingModeRef.current);
      await startNativeCallAudio();
      if (!isCurrentCallLifecycle(lifecycleId)) {
        stopStream(localStreamRef);
        restoreNativeCallAudio();
        return;
      }
      bindMediaElements();
      
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

      const sent = await answerRemote('answer', { isVideo: stream.getVideoTracks().length > 0 });
      if (!isCurrentCallLifecycle(lifecycleId)) return;
      if (!sent) throw new Error('The answer could not be sent');
      // Stay on "Connecting…" until ICE actually reports a connection;
      // onconnectionstatechange promotes it and plays the tone.
      setCallDirection('connecting');
    } catch (err) {
      debug.error('WEBRTC_ERROR', { operation: 'answer-call', error: serializeCallError(err), dmRoomId: activeDm?.dm_room_id, callState: callDirection });
      audioSys.playCallFailed();
      const targetId = activeCallTargetRef.current;
      endCallLocal('failed');
      void sendSignal(targetId, 'end', {});
      if (err.name === 'NotAllowedError') {
        toast.error("Camera or Microphone permission denied");
      } else {
        toast.error(`Failed to answer hardware device stream: ${err.message || 'Device configuration error'}`);
      }
    }
  };

  const endCallNetwork = (reason) => {
    logCallEndDebug('end button clicked', { reason, callDirection: callDirectionRef.current, callActive: callActiveRef.current });
    const targetId = activeCallTargetRef.current;
    const currentState = callDirectionRef.current;
    const nextReason = reason || (currentState === 'incoming' ? 'rejected' : currentState === 'connected' ? 'ended' : 'cancelled');
    if (!endingCallRef.current && targetId) {
      void sendSignal(targetId, nextReason === 'rejected' ? 'reject' : 'end', {});
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
    setIsSwitchingCamera(false);
    setCameraFacingMode('user');
    setScreenShareActive(false);
    setRemoteScreenSharing(false);

    if (alreadyEnding) {
      logCallEndDebug('cleanup skipped after hard UI close', { finalState });
      return;
    }

    endingCallRef.current = true;
    callLifecycleIdRef.current += 1;

    clearOutgoingTimeout();
    clearIceRecoveryTimer();
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    settingRemoteAnswerRef.current = false;
    iceRestartedRef.current = false;

    closePeerConnection();
    stopStream(localStreamRef);
    stopStream(remoteStreamRef);
    stopStream(screenStreamRef);
    remoteScreenStreamRef.current = null;
    pendingScreenTrackIdRef.current = null;
    pendingIceCandidatesRef.current = [];

    detachMediaElement(localVideoRef);
    detachMediaElement(remoteVideoRef);
    detachMediaElement(remoteAudioRef);
    detachMediaElement(localScreenVideoRef);
    detachMediaElement(remoteScreenVideoRef);

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
      void sendSignal(activeCallTargetRef.current, 'video-request-intent', {});
    }
  };

  const switchCamera = async () => {
    const localStream = localStreamRef.current;
    const currentTrack = localStream?.getVideoTracks?.()[0];
    if (!currentTrack || !videoEnabled || isSwitchingCamera) return;

    setIsSwitchingCamera(true);
    let replacementStream = null;
    try {
      const replacement = await acquireAlternateCamera({
        mediaDevices: navigator.mediaDevices,
        currentTrack,
        preferredFacingMode: cameraFacingModeRef.current
      });
      replacementStream = replacement.stream;

      const videoSender = pcRef.current?.getSenders?.().find(sender => sender.track?.kind === 'video');
      if (!videoSender?.replaceTrack) throw new Error('The active call cannot replace its camera track');
      await videoSender.replaceTrack(replacement.track);

      localStream.removeTrack(currentTrack);
      localStream.addTrack(replacement.track);
      currentTrack.stop();
      cameraFacingModeRef.current = replacement.facingMode;
      setCameraFacingMode(replacement.facingMode);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(() => {});
      }
      toast.success(replacement.facingMode === 'environment' ? 'Rear camera selected' : 'Front camera selected');
    } catch (error) {
      replacementStream?.getTracks?.().forEach(track => track.stop());
      debug.error('WEBRTC_ERROR', { operation: 'switch-camera', error: serializeCallError(error) });
      toast.error('Could not switch cameras.');
    } finally {
      setIsSwitchingCamera(false);
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
      cameraFacingModeRef.current = newVidTrack.getSettings?.().facingMode || 'user';
      setCameraFacingMode(cameraFacingModeRef.current);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      bindMediaElements();
      setVideoEnabled(true);

      if (pcRef.current) {
        pcRef.current.addTrack(newVidTrack, localStreamRef.current);
        await negotiateLocal('video-upgrade-offer');
      }
    } catch(e) {
      debug.error('WEBRTC_ERROR', { operation: 'video-upgrade', error: serializeCallError(e) });
      toast.error("Camera access failed during upgrade");
    }
  };

  const handleVideoUpgradeOffer = async (offer) => {
    if (!pcRef.current) return;
    if (await applyRemoteDescription(offer, 'offer')) await answerRemote('video-upgrade-answer');
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
      cameraFacingModeRef.current = newVidTrack.getSettings?.().facingMode || 'user';
      setCameraFacingMode(cameraFacingModeRef.current);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      bindMediaElements();
      setVideoEnabled(true);
      
      if (pcRef.current) {
        pcRef.current.addTrack(newVidTrack, localStreamRef.current);
      }
      setPendingVideoRequest(false);
      void sendSignal(activeCallTargetRef.current, 'video-request-accepted', {});
    } catch(e) {
      console.error(serializeCallError(e));
      toast.error("Could not access camera");
      declineVideoRequest();
    }
  };

  const declineVideoRequest = () => {
    setPendingVideoRequest(false);
    void sendSignal(activeCallTargetRef.current, 'video-request-declined', { caller: { username: myUsername } });
  };

  const handleScreenShareOffer = async (offer, trackId) => {
    if (!pcRef.current) return;
    pendingScreenTrackIdRef.current = trackId || null;
    if (await applyRemoteDescription(offer, 'offer')) await answerRemote('screen-share-answer');
  };

  const startScreenShare = async () => {
    if (screenShareActive || !pcRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('Screen sharing is not supported on this device.');
      return;
    }
    const lifecycleId = callLifecycleIdRef.current;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!isCurrentCallLifecycle(lifecycleId) || !pcRef.current) {
        screenStream.getTracks().forEach(track => track.stop());
        return;
      }
      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;
      screenTrack.onended = () => { void stopScreenShare(); };

      pcRef.current.addTrack(screenTrack, screenStream);
      const sent = await negotiateLocal('screen-share-offer', { trackId: screenTrack.id });
      if (!isCurrentCallLifecycle(lifecycleId)) return;
      if (!sent) {
        screenStreamRef.current = null;
        screenStream.getTracks().forEach(track => { track.onended = null; track.stop(); });
        toast.error('Could not start screen sharing.');
        return;
      }
      setScreenShareActive(true);
      bindMediaElements();
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        debug.error('WEBRTC_ERROR', { operation: 'start-screen-share', error: serializeCallError(err) });
        toast.error('Could not start screen sharing.');
      }
    }
  };

  const stopScreenShare = async () => {
    const screenStream = screenStreamRef.current;
    if (!screenStream) return;
    const screenTrackId = screenStream.getVideoTracks()[0]?.id;
    const sender = pcRef.current?.getSenders().find(s => s.track?.id === screenTrackId);

    screenStreamRef.current = null;
    screenStream.getTracks().forEach(track => {
      track.onended = null;
      try { track.stop(); } catch (_err) {}
    });
    detachMediaElement(localScreenVideoRef);
    setScreenShareActive(false);
    void sendSignal(activeCallTargetRef.current, 'screen-share-ended', {});

    if (sender && pcRef.current) {
      pcRef.current.removeTrack(sender);
      await negotiateLocal('screen-share-offer', { trackId: null });
    }
  };

  const toggleScreenShare = () => {
    if (screenShareActive) void stopScreenShare();
    else void startScreenShare();
  };

  const toggleNoiseCancellation = async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextState = !ncEnabled;
        try {
          await applyVoiceAudioProcessing(audioTrack, nextState, navigator.mediaDevices);
          setNcEnabled(nextState);
          toast(nextState ? "Enhanced Noise Reduction On" : "Noise Reduction Off", { icon: nextState ? '🎙️' : '⚠️' });
        } catch (_err) { toast.error("This device cannot change noise reduction during a call"); }
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
    ncEnabled, micEnabled, videoEnabled, remoteVideoEnabled, pendingVideoRequest, speakerEnabled, isSwitchingCamera, cameraFacingMode,
    screenShareActive, remoteScreenSharing,
    localVideoRef, remoteVideoRef, remoteAudioRef, localScreenVideoRef, remoteScreenVideoRef,
    startCall, acceptCall, endCallNetwork, toggleMic, toggleVideo, switchCamera, toggleNoiseCancellation, toggleSpeaker,
    acceptVideoRequest, declineVideoRequest, toggleScreenShare
  };
}
