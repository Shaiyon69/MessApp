export const createP2PSignalingChannel = (supabase, onSignal) => {
  const channel = supabase.channel('p2p-signaling')

  channel
    .on('broadcast', { event: 'signal' }, (payload) => {
      if (payload?.payload) {
        onSignal(payload.payload)
      }
    })
    .subscribe()

  const sendSignal = async (signal) => {
    await channel.send({ type: 'broadcast', event: 'signal', payload: signal })
  }

  return { channel, sendSignal }
}

export function createPeerConnection({ onData, onOpen, onClose, onIce }) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  let dataChannel = null

  pc.onicecandidate = (event) => {
    if (event.candidate && onIce) onIce(event.candidate)
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') onOpen?.()
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') onClose?.()
  }

  pc.ondatachannel = (event) => {
    dataChannel = event.channel
    dataChannel.onmessage = (msg) => onData?.(msg)
    dataChannel.onopen = () => onOpen?.()
    dataChannel.onclose = () => onClose?.()
  }

  const createDataChannel = () => {
    dataChannel = pc.createDataChannel('messapp-datachannel')
    dataChannel.onmessage = (msg) => onData?.(msg)
    dataChannel.onopen = () => onOpen?.()
    dataChannel.onclose = () => onClose?.()
    return dataChannel
  }

  return {
    pc,
    dataChannel,
    createDataChannel,
    setRemoteDescription: async (desc) => await pc.setRemoteDescription(desc),
    setLocalDescription: async (desc) => await pc.setLocalDescription(desc),
    createOffer: async () => await pc.createOffer(),
    createAnswer: async () => await pc.createAnswer(),
    addIceCandidate: async (candidate) => await pc.addIceCandidate(candidate),
    close: () => {
      try { pc.close() } catch {
        // ignore errors on close
      }
    }
  }
}
