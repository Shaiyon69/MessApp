import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { audioSys } from '../lib/SoundEngine';

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
  const [callDuration, setCallDuration] = useState(0);
  const [callQuality, setCallQuality] = useState('good');
  const [connectionState, setConnectionState] = useState('disconnected');
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [callHistory, setCallHistory] = useState([]);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callChannelRef = useRef(null);
  const activeCallTargetRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const callTimerRef = useRef(null);
  const screenStreamRef = useRef(null);

  const myAvatar = session?.user?.user_metadata?.avatar_url;
  const myUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0];

  useEffect(() => {
    if (callActive && callDirection === 'incoming') audioSys.startRing(false);
    else if (callActive && callDirection === 'outgoing') audioSys.startRing(true);
    else audioSys.stopRing();
    return () => audioSys.stopRing();
  }, [callActive, callDirection]);

  // Call timer
  useEffect(() => {
    if (callActive && callDirection === 'connected') {
      callStartTimeRef.current = Date.now();
      callTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallDuration(0);
    }
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callActive, callDirection]);

  useEffect(() => {
    if (!session?.user?.id) return;
    console.log('[webrtc] Setting up signaling channel for user:', session.user.id);
    const sigChannel = supabase.channel('global-signaling');
    
    sigChannel.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
      console.log('[webrtc] Received signal:', payload);
      if (payload.targetId !== session.user.id) {
        console.log('[webrtc] Signal not for this user, ignoring');
        return;
      }

      console.log('[webrtc] Processing signal type:', payload.type);

      if (payload.type === 'offer') {
        console.log('[webrtc] Received incoming call offer from:', payload.caller);
        console.log('[webrtc] Offer caller ID:', payload.callerId);
        console.log('[webrtc] My user ID:', session.user.id);
        
        // Validate the offer
        if (!payload.callerId || !payload.offer || !payload.caller) {
          console.error('[webrtc] Invalid offer received:', payload);
          return;
        }
        
        if (callActive) {
          console.log('[webrtc] User already in call, sending busy');
          sendSignal(payload.callerId, 'busy', {});
          return;
        }
        
        // Prevent self-calls
        if (payload.callerId === session.user.id) {
          console.error('[webrtc] Received self-call, ignoring');
          return;
        }
        
        console.log('[webrtc] Setting up incoming call');
        setRemoteCaller(payload.caller);
        activeCallTargetRef.current = payload.callerId;
        setCallDirection('incoming');
        setCallActive(true);
        setCallMinimized(false);
        setRemoteVideoEnabled(payload.isVideo || false);
        setVideoEnabled(payload.isVideo || false);
        
        console.log('[webrtc] Incoming call state set, user should see call UI');
        
        if (!pcRef.current) {
          pcRef.current = new RTCPeerConnection({ 
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' }
            ]
          });
          
          pcRef.current.onicecandidate = (e) => {
            if (e.candidate) {
              console.log('[webrtc] Sending ICE candidate to:', activeCallTargetRef.current);
              sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate });
            }
          };
          
          pcRef.current.onconnectionstatechange = () => {
            const state = pcRef.current.connectionState;
            console.log('[webrtc] Connection state:', state);
            setConnectionState(state);
            if (state === 'failed' || state === 'disconnected') {
              setCallQuality('poor');
            } else if (state === 'connected') {
              setCallQuality('good');
              setCallDirection('connected');
              toast.success('Call connected!');
            }
          };
          
          pcRef.current.ontrack = (e) => {
            console.log('[webrtc] Track received:', e.track.kind);
            if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
            if (!remoteStreamRef.current.getTracks().find(t => t.id === e.track.id)) {
              remoteStreamRef.current.addTrack(e.track);
            }
            if (e.track.kind === 'audio' && remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStreamRef.current;
              remoteAudioRef.current.play().catch(()=>{});
            }
            if (e.track.kind === 'video' && remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStreamRef.current;
              remoteVideoRef.current.play().catch(()=>{});
              setRemoteVideoEnabled(true);
            }
          };
        }
        
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.offer));
          console.log('[webrtc] Remote description set for offer');
        } catch (err) {
          console.error('[webrtc] Failed to set remote description:', err);
          sendSignal(payload.callerId, 'end', {});
          endCallLocal();
          toast.error('Failed to process incoming call');
        }
      }

      if (payload.type === 'answer') {
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          console.log('[webrtc] Setting remote description for answer');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          setCallDirection('connected');
          if (payload.isVideo) setRemoteVideoEnabled(true);
          console.log('[webrtc] Call should be connected now');
        }
      }

      if (payload.type === 'ice-candidate') {
        if (pcRef.current && pcRef.current.remoteDescription) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (_err) {}
        }
      }

      if (payload.type === 'end') {
        endCallLocal();
        toast('Call ended');
      }
      
      if (payload.type === 'busy') {
        endCallLocal();
        toast.error('User is busy in another call');
      }

      if (payload.type === 'video-request-intent') setPendingVideoRequest(true);
      
      if (payload.type === 'video-request-declined') {
        toast.dismiss('vid-req');
        toast.error(`${payload.caller?.username || 'User'} declined the video request.`);
      }
      
      if (payload.type === 'video-request-accepted') {
        toast.dismiss('vid-req');
        toast.success("Video accepted! Connecting streams...");
        initiateVideoUpgrade(); 
      }
      
      if (payload.type === 'video-upgrade-offer') handleVideoUpgradeOffer(payload.offer);
      
      if (payload.type === 'video-upgrade-answer') {
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      }
    });

    sigChannel.subscribe((status) => {
      console.log('[webrtc] Signaling channel status:', status);
      if (status === 'SUBSCRIBED') {
        callChannelRef.current = sigChannel;
        console.log('[webrtc] Signaling channel ready');
      }
    });

    return () => { 
      console.log('[webrtc] Cleaning up signaling channel');
      supabase.removeChannel(sigChannel); 
    };
  }, [session?.user?.id, callActive]);

  const sendSignal = (targetId, type, data) => {
    console.log('[webrtc] Sending signal:', { targetId, type, callerId: session.user.id, data });
    console.log('[webrtc] Channel status:', !!callChannelRef.current);
    
    if (!callChannelRef.current) {
      console.error('[webrtc] Cannot send signal - signaling channel not ready');
      toast.error('Connection not ready. Please try again.');
      return false;
    }
    
    if (!targetId) {
      console.error('[webrtc] Cannot send signal - missing targetId');
      toast.error('Invalid call target.');
      return false;
    }
    
    if (!session?.user?.id) {
      console.error('[webrtc] Cannot send signal - missing session user ID');
      toast.error('Authentication error. Please refresh.');
      return false;
    }
    
    callChannelRef.current.send({
      type: 'broadcast',
      event: 'webrtc-signal',
      payload: { targetId, type, callerId: session.user.id, ...data }
    }).catch((err) => {
      console.error('[webrtc] Failed to send signal:', err);
      toast.error('Failed to send call signal. Please check your connection.');
    });
    
    return true;
  };

  const checkMediaAccess = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("⚠️ Secure Context Required! You must access this via 'localhost' or HTTPS to use the camera/mic.", { duration: 5000 });
      return false;
    }
    return true;
  };

  const handleMediaError = (err) => {
    const name = err?.name || 'UnknownError';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      toast.error(
        "Camera/Microphone permission denied. On Linux, allow this app in OS privacy settings and ensure xdg-desktop-portal + pipewire are installed.",
        { duration: 6000 }
      );
      return;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      toast.error("No camera/microphone device detected.");
      return;
    }
    toast.error(`Media access failed (${name}).`);
  };

  const startCall = async (withVideo = false) => {
    console.log('[webrtc] Starting call with video:', withVideo);
    console.log('[webrtc] Active DM:', activeDm);
    
    if (!activeDm || !activeDm.profiles?.id) {
      console.error('[webrtc] Cannot start call - no active DM or invalid profile');
      toast.error('Please select a user to call first.');
      return;
    }
    
    if (!checkMediaAccess()) {
      console.log('[webrtc] Cannot start call - media access failed');
      return;
    }
    
    // Check if signaling channel is ready
    if (!callChannelRef.current) {
      console.error('[webrtc] Cannot start call - signaling channel not ready');
      toast.error('Connection not ready. Please wait a moment and try again.');
      return;
    }
    
    const targetUserId = activeDm.profiles.id;
    console.log('[webrtc] Target user ID:', targetUserId);
    console.log('[webrtc] My user ID:', session.user.id);
    
    // Prevent calling yourself
    if (targetUserId === session.user.id) {
      toast.error('You cannot call yourself.');
      return;
    }
    
    setRemoteCaller(activeDm.profiles);
    activeCallTargetRef.current = targetUserId;
    setCallDirection('outgoing');
    setCallActive(true);
    setCallMinimized(false);
    setVideoEnabled(withVideo);

    console.log('[webrtc] Call state set, getting media...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: withVideo,
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled } 
      });
      localStreamRef.current = stream;
      if (withVideo && localVideoRef.current) localVideoRef.current.srcObject = stream;

      pcRef.current = new RTCPeerConnection({ 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      });
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[webrtc] Sending ICE candidate to:', targetUserId);
          sendSignal(targetUserId, 'ice-candidate', { candidate: e.candidate });
        }
      };
      
      pcRef.current.ontrack = (e) => {
        console.log('[webrtc] Track received:', e.track.kind);
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
        if (!remoteStreamRef.current.getTracks().find(t => t.id === e.track.id)) {
          remoteStreamRef.current.addTrack(e.track);
        }
        if (e.track.kind === 'audio' && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStreamRef.current;
          remoteAudioRef.current.play().catch(()=>{});
        }
        if (e.track.kind === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
          remoteVideoRef.current.play().catch(()=>{});
          setRemoteVideoEnabled(true);
        }
      };

      pcRef.current.onconnectionstatechange = () => {
        const state = pcRef.current.connectionState;
        console.log('[webrtc] Connection state:', state);
        setConnectionState(state);
        if (state === 'connected') {
          setCallDirection('connected');
          toast.success('Call connected!');
        } else if (state === 'failed' || state === 'disconnected') {
          setCallQuality('poor');
          if (state === 'failed') {
            toast.error('Call connection failed');
            endCallLocal();
          }
        }
      };

      pcRef.current.oniceconnectionstatechange = () => {
        console.log('[webrtc] ICE connection state:', pcRef.current.iceConnectionState);
      };

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);

      console.log('[webrtc] Sending offer to:', targetUserId);
      const signalSent = sendSignal(targetUserId, 'offer', {
        offer, 
        caller: { id: session.user.id, username: myUsername, avatar_url: myAvatar }, 
        isVideo: withVideo
      });
      
      if (signalSent) {
        console.log('[webrtc] Offer sent successfully');
        // Set a timeout for call response
        setTimeout(() => {
          if (callDirection === 'outgoing') {
            toast.error('No response from user. They may be unavailable.');
            endCallLocal();
          }
        }, 30000); // 30 seconds timeout
      } else {
        console.error('[webrtc] Failed to send offer');
        endCallLocal();
      }
    } catch (err) {
      console.error('[webrtc] Error starting call:', err);
      endCallLocal();
      handleMediaError(err);
    }
  };

  const acceptCall = async () => {
    if (!checkMediaAccess()) { 
      if (activeCallTargetRef.current) {
        sendSignal(activeCallTargetRef.current, 'end', {});
      }
      endCallLocal(); 
      return;
    }
    
    if (!activeCallTargetRef.current) {
      console.error('[webrtc] Cannot accept call - no target reference');
      toast.error('Call reference lost. Please ask them to call again.');
      endCallLocal();
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: videoEnabled, 
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled } 
      });
      localStreamRef.current = stream;
      if (videoEnabled && localVideoRef.current) localVideoRef.current.srcObject = stream;
      
      // Initialize RTCPeerConnection if not already done
      if (!pcRef.current) {
        pcRef.current = new RTCPeerConnection({ 
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
          ]
        });
        
        pcRef.current.onicecandidate = (e) => {
          if (e.candidate && activeCallTargetRef.current) {
            console.log('[webrtc] Sending ICE candidate to:', activeCallTargetRef.current);
            sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate });
          }
        };
        
        pcRef.current.ontrack = (e) => {
          console.log('[webrtc] Track received:', e.track.kind);
          if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
          if (!remoteStreamRef.current.getTracks().find(t => t.id === e.track.id)) {
            remoteStreamRef.current.addTrack(e.track);
          }
          if (e.track.kind === 'audio' && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
            remoteAudioRef.current.play().catch(()=>{});
          }
          if (e.track.kind === 'video' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
            remoteVideoRef.current.play().catch(()=>{});
            setRemoteVideoEnabled(true);
          }
        };

        pcRef.current.onconnectionstatechange = () => {
          const state = pcRef.current.connectionState;
          console.log('[webrtc] Connection state:', state);
          setConnectionState(state);
          if (state === 'connected') {
            setCallDirection('connected');
            toast.success('Call connected!');
          } else if (state === 'failed' || state === 'disconnected') {
            setCallQuality('poor');
            if (state === 'failed') {
              toast.error('Call connection failed');
              endCallLocal();
            }
          }
        };

        pcRef.current.oniceconnectionstatechange = () => {
          console.log('[webrtc] ICE connection state:', pcRef.current.iceConnectionState);
        };
      }
      
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
      
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      
      console.log('[webrtc] Sending answer to:', activeCallTargetRef.current);
      const signalSent = sendSignal(activeCallTargetRef.current, 'answer', { answer, isVideo: videoEnabled });
      
      if (!signalSent) {
        console.error('[webrtc] Failed to send answer');
        endCallLocal();
      }
    } catch (err) {
      console.error('[webrtc] Error accepting call:', err);
      endCallLocal();
      if (activeCallTargetRef.current) {
        sendSignal(activeCallTargetRef.current, 'end', {});
      }
      handleMediaError(err);
    }
  };

  const endCallNetwork = () => {
    if (activeCallTargetRef.current) {
      console.log('[webrtc] Sending end signal to:', activeCallTargetRef.current);
      sendSignal(activeCallTargetRef.current, 'end', {});
    } else {
      console.log('[webrtc] Ending call locally (no target to notify)');
    }
    endCallLocal();
  };

  const endCallLocal = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(t => t.stop());
      remoteStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setCallActive(false);
    setCallMinimized(false);
    setCallDirection(null);
    setRemoteCaller(null);
    activeCallTargetRef.current = null;
    setMicEnabled(true);
    setVideoEnabled(false);
    setRemoteVideoEnabled(false);
    setPendingVideoRequest(false);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    audioSys.stopRing();
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newVidTrack = stream.getVideoTracks()[0];
      localStreamRef.current.addTrack(newVidTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setVideoEnabled(true);

      pcRef.current.addTrack(newVidTrack, localStreamRef.current);
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      sendSignal(activeCallTargetRef.current, 'video-upgrade-offer', { offer });
    } catch(_e) { toast.error("Camera access failed during upgrade"); }
  };

  const handleVideoUpgradeOffer = async (offer) => {
    if (!pcRef.current) return;
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    sendSignal(activeCallTargetRef.current, 'video-upgrade-answer', { answer });
  };

  const acceptVideoRequest = async () => {
    try {
      if (!checkMediaAccess()) { declineVideoRequest(); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newVidTrack = stream.getVideoTracks()[0];
      localStreamRef.current.addTrack(newVidTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setVideoEnabled(true);
      
      pcRef.current.addTrack(newVidTrack, localStreamRef.current);
      setPendingVideoRequest(false);
      sendSignal(activeCallTargetRef.current, 'video-request-accepted', {});
    } catch(_e) {
      toast.error("Could not access camera");
      declineVideoRequest();
    }
  };

  const declineVideoRequest = () => {
    setPendingVideoRequest(false);
    sendSignal(activeCallTargetRef.current, 'video-request-declined', { caller: { username: myUsername } });
  };

  const toggleScreenShare = async () => {
    if (!pcRef.current) return;
    
    try {
      if (screenShareEnabled) {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }
        
        // Replace with camera video if available
        if (localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
          }
        }
        
        setScreenShareEnabled(false);
        sendSignal(activeCallTargetRef.current, 'screen-share-stopped', {});
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        
        screenStreamRef.current = screenStream;
        
        // Replace video track with screen share
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        } else {
          pcRef.current.addTrack(videoTrack, screenStream);
        }
        
        setScreenShareEnabled(true);
        sendSignal(activeCallTargetRef.current, 'screen-share-started', {});
        
        // Auto-stop when user ends screen share
        videoTrack.onended = () => {
          toggleScreenShare();
        };
      }
    } catch (err) {
      toast.error("Screen sharing failed: " + err.message);
    }
  };

  const formatCallDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const addToCallHistory = (call) => {
    const historyEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      duration: callDuration,
      direction: callDirection,
      remoteUser: remoteCaller,
      wasVideo: videoEnabled || remoteVideoEnabled
    };
    
    setCallHistory(prev => [historyEntry, ...prev.slice(0, 49)]); // Keep last 50 calls
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

  return {
    callActive, callMinimized, setCallMinimized, callDirection, remoteCaller,
    ncEnabled, micEnabled, videoEnabled, remoteVideoEnabled, pendingVideoRequest,
    callDuration, callQuality, connectionState, screenShareEnabled, callHistory,
    localVideoRef, remoteVideoRef, remoteAudioRef,
    startCall, acceptCall, endCallNetwork, toggleMic, toggleVideo, toggleNoiseCancellation,
    acceptVideoRequest, declineVideoRequest, toggleScreenShare, formatCallDuration, addToCallHistory
  };
}
