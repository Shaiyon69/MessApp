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

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callChannelRef = useRef(null);
  const activeCallTargetRef = useRef(null);

  const myAvatar = session?.user?.user_metadata?.avatar_url;
  const myUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0];

  useEffect(() => {
    if (callActive && callDirection === 'incoming') audioSys.startRing(false);
    else if (callActive && callDirection === 'outgoing') audioSys.startRing(true);
    else audioSys.stopRing();
    return () => audioSys.stopRing();
  }, [callActive, callDirection]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const sigChannel = supabase.channel('global-signaling');
    
    sigChannel.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
      if (payload.targetId !== session.user.id) return;

      if (payload.type === 'offer') {
        if (callActive) {
          sendSignal(payload.callerId, 'busy', {});
          return;
        }
        setRemoteCaller(payload.caller);
        activeCallTargetRef.current = payload.callerId;
        setCallDirection('incoming');
        setCallActive(true);
        setCallMinimized(false);
        setRemoteVideoEnabled(payload.isVideo || false);
        setVideoEnabled(payload.isVideo || false);
        
        if (!pcRef.current) {
          pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pcRef.current.onicecandidate = (e) => {
            if (e.candidate) sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate });
          };
          pcRef.current.ontrack = (e) => {
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
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.offer));
      }

      if (payload.type === 'answer') {
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          setCallDirection('connected');
          if (payload.isVideo) setRemoteVideoEnabled(true);
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
      if (status === 'SUBSCRIBED') callChannelRef.current = sigChannel;
    });

    return () => { supabase.removeChannel(sigChannel); };
  }, [session?.user?.id, callActive]);

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

  const startCall = async (withVideo = false) => {
    if (!activeDm || !checkMediaAccess()) return;
    setRemoteCaller(activeDm.profiles);
    activeCallTargetRef.current = activeDm.profiles.id;
    setCallDirection('outgoing');
    setCallActive(true);
    setCallMinimized(false);
    setVideoEnabled(withVideo);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: withVideo,
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled } 
      });
      localStreamRef.current = stream;
      if (withVideo && localVideoRef.current) localVideoRef.current.srcObject = stream;

      pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate });
      };
      
      pcRef.current.ontrack = (e) => {
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

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);

      sendSignal(activeCallTargetRef.current, 'offer', {
        offer, caller: { id: session.user.id, username: myUsername, avatar_url: myAvatar }, isVideo: withVideo
      });
    } catch (_err) {
      endCallLocal();
      toast.error("Camera or Microphone permission denied");
    }
  };

  const acceptCall = async () => {
    if (!checkMediaAccess()) { endCallNetwork(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: videoEnabled, 
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled } 
      });
      localStreamRef.current = stream;
      if (videoEnabled && localVideoRef.current) localVideoRef.current.srcObject = stream;
      
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
      
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      
      sendSignal(activeCallTargetRef.current, 'answer', { answer, isVideo: videoEnabled });
      setCallDirection('connected');
    } catch (_err) {
      endCallLocal();
      sendSignal(activeCallTargetRef.current, 'end', {});
      toast.error("Camera or Microphone permission denied");
    }
  };

  const endCallNetwork = () => {
    if (activeCallTargetRef.current) sendSignal(activeCallTargetRef.current, 'end', {});
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
    } catch(e) { toast.error("Camera access failed during upgrade"); }
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
    } catch(e) {
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

  return {
    callActive, callMinimized, setCallMinimized, callDirection, remoteCaller,
    ncEnabled, micEnabled, videoEnabled, remoteVideoEnabled, pendingVideoRequest,
    localVideoRef, remoteVideoRef, remoteAudioRef,
    startCall, acceptCall, endCallNetwork, toggleMic, toggleVideo, toggleNoiseCancellation,
    acceptVideoRequest, declineVideoRequest
  };
}
