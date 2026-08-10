// Explicit extension (unlike the rest of the codebase) so `node --test` can
// resolve this module for the colocated test; Vite resolves it identically.
import { supabase } from '../supabaseClient.js'

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

const createConnectionId = userId => {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${userId}:${suffix}`
}

const serializeParticipant = participant => ({
  id: participant?.id || '',
  displayName: participant?.displayName || participant?.username || 'Participant',
  avatarUrl: participant?.avatarUrl || participant?.avatar_url || ''
})

const describePublications = publications => Array.from(publications.values()).map(({ stream, type, participant }) => ({
  streamId: stream.id,
  type,
  participant: serializeParticipant(participant)
}))

/**
 * Creates a room-scoped WebRTC mesh client. Supabase Realtime carries only
 * presence and SDP/ICE signaling; audio, camera, and screen tracks remain
 * end-to-end peer connections between the joined voice participants.
 */
export function createVoiceChannelClient({
  roomId,
  participant,
  supabaseClient = supabase,
  PeerConnection = globalThis.RTCPeerConnection,
  iceServers = DEFAULT_ICE_SERVERS
}) {
  if (!roomId) throw new Error('A voice room id is required.')
  if (!participant?.id) throw new Error('A voice participant id is required.')

  const connectionId = createConnectionId(participant.id)
  const peers = new Map()
  const publications = new Map()
  const subscribers = new Set()
  const remoteStreams = new Map()
  let channel = null
  let connected = false
  let connectPromise = null
  let resolvedIceServers = DEFAULT_ICE_SERVERS
  // Bumped by connect() and disconnect() so a connect that is still awaiting
  // ICE credentials can tell it has been cancelled and clean up after itself.
  let connectGeneration = 0

  const sendSignal = async (event, payload, target) => {
    if (!channel || !connected) return
    await channel.send({
      type: 'broadcast',
      event: 'media-signal',
      payload: { event, payload, from: connectionId, to: target }
    })
  }

  const closePeer = remoteId => {
    const state = peers.get(remoteId)
    if (!state) return
    peers.delete(remoteId)
    state.pc.ontrack = null
    state.pc.onicecandidate = null
    state.pc.close()
    for (const [streamId, remote] of remoteStreams) {
      if (remote.connectionId === remoteId) remoteStreams.delete(streamId)
    }
  }

  const applyPublicationMetadata = (state, metadata = []) => {
    state.metadata.clear()
    metadata.forEach(item => {
      if (item?.streamId) state.metadata.set(item.streamId, item)
    })
  }

  const negotiate = async state => {
    if (!connected || state.makingOffer || state.pc.signalingState === 'closed') return
    try {
      state.makingOffer = true
      await state.pc.setLocalDescription()
      await sendSignal('description', {
        description: state.pc.localDescription,
        publications: describePublications(publications)
      }, state.remoteId)
    } finally {
      state.makingOffer = false
    }
  }

  const ensurePeer = remoteId => {
    if (!remoteId || remoteId === connectionId) return null
    const existing = peers.get(remoteId)
    if (existing) return existing
    if (typeof PeerConnection !== 'function') throw new Error('WebRTC is unavailable on this device.')

    const pc = new PeerConnection({ iceServers: resolvedIceServers })
    const state = {
      pc,
      remoteId,
      polite: connectionId.localeCompare(remoteId) > 0,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      pendingCandidates: [],
      metadata: new Map()
    }
    peers.set(remoteId, state)

    publications.forEach(({ stream }) => {
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
    })

    pc.onicecandidate = event => {
      if (event.candidate) void sendSignal('candidate', { candidate: event.candidate }, remoteId)
    }
    pc.ontrack = event => {
      const stream = event.streams?.[0]
      if (!stream) return
      const metadata = state.metadata.get(stream.id) || {
        type: stream.getVideoTracks().length ? 'screen' : 'audio',
        participant: { id: remoteId.split(':')[0], displayName: 'Participant' }
      }
      const normalized = {
        stream,
        participant: {
          ...serializeParticipant(metadata.participant),
          streamType: metadata.type || 'screen'
        },
        connectionId: remoteId
      }
      remoteStreams.set(stream.id, normalized)
      subscribers.forEach(listener => listener(stream, normalized.participant))
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => remoteStreams.delete(stream.id), { once: true })
      })
    }
    pc.onnegotiationneeded = () => {
      void negotiate(state).catch(() => {})
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(remoteId)
    }
    return state
  }

  const handleSignal = async message => {
    if (!message || message.to !== connectionId || message.from === connectionId) return
    const state = ensurePeer(message.from)
    if (!state) return

    if (message.event === 'candidate') {
      const candidate = message.payload?.candidate
      if (!candidate) return
      if (!state.pc.remoteDescription) {
        state.pendingCandidates.push(candidate)
        return
      }
      try {
        await state.pc.addIceCandidate(candidate)
      } catch (error) {
        if (!state.ignoreOffer) throw error
      }
      return
    }

    if (message.event !== 'description') return
    const description = message.payload?.description
    if (!description) return
    applyPublicationMetadata(state, message.payload?.publications)

    const readyForOffer = !state.makingOffer
      && (state.pc.signalingState === 'stable' || state.settingRemoteAnswer)
    const offerCollision = description.type === 'offer' && !readyForOffer
    state.ignoreOffer = !state.polite && offerCollision
    if (state.ignoreOffer) return

    state.settingRemoteAnswer = description.type === 'answer'
    try {
      await state.pc.setRemoteDescription(description)
    } finally {
      state.settingRemoteAnswer = false
    }
    while (state.pendingCandidates.length) {
      await state.pc.addIceCandidate(state.pendingCandidates.shift())
    }

    if (description.type === 'offer') {
      await state.pc.setLocalDescription()
      await sendSignal('description', {
        description: state.pc.localDescription,
        publications: describePublications(publications)
      }, state.remoteId)
    }
  }

  const syncPresence = () => {
    if (!channel) return
    const present = new Set(
      Object.values(channel.presenceState())
        .flatMap(entries => entries)
        .map(entry => entry?.connection_id)
        .filter(id => id && id !== connectionId)
    )
    present.forEach(remoteId => {
      const state = ensurePeer(remoteId)
      if (state && connectionId.localeCompare(remoteId) < 0 && state.pc.signalingState === 'stable') {
        void negotiate(state).catch(() => {})
      }
    })
    Array.from(peers.keys()).forEach(remoteId => {
      if (!present.has(remoteId)) closePeer(remoteId)
    })
  }

  return {
    connect() {
      if (connectPromise) return connectPromise
      const generation = ++connectGeneration
      const isCurrent = () => generation === connectGeneration

      connectPromise = (async () => {
        // ICE servers come from an async credential fetch, so disconnect() can
        // land before this resolves. Everything created past this point has to
        // be torn down here: disconnect() already ran and saw `channel` still
        // null, so it had nothing to remove. Skipping that left a subscribed
        // channel behind, and the next join failed on the duplicate topic.
        const resolved = await Promise.resolve(iceServers).catch(() => DEFAULT_ICE_SERVERS)
        if (!isCurrent()) throw new Error('Voice media connection was cancelled.')
        resolvedIceServers = resolved

        const nextChannel = supabaseClient.channel(`voice-media:${roomId}`, {
          config: { presence: { key: connectionId }, broadcast: { self: false } }
        })
        nextChannel.on('broadcast', { event: 'media-signal' }, ({ payload }) => {
          void handleSignal(payload).catch(() => {})
        })
        nextChannel.on('presence', { event: 'sync' }, syncPresence)
        channel = nextChannel

        try {
          await new Promise((resolve, reject) => {
            nextChannel.subscribe(async status => {
              if (!isCurrent()) {
                reject(new Error('Voice media connection was cancelled.'))
                return
              }
              if (status === 'SUBSCRIBED') {
                connected = true
                try {
                  await nextChannel.track({
                    connection_id: connectionId,
                    profile_id: participant.id,
                    displayName: participant.displayName,
                    avatarUrl: participant.avatarUrl
                  })
                  syncPresence()
                  resolve()
                } catch (error) {
                  reject(error)
                }
              } else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
                reject(new Error('Could not connect voice media signaling.'))
              }
            })
          })
        } catch (error) {
          // A failed subscribe leaves a joined channel on the socket too, which
          // would collide with the retry. Only this connect's own channel is
          // removed — if disconnect() got there first, `channel` is already null.
          if (channel === nextChannel) {
            channel = null
            connected = false
            void supabaseClient.removeChannel(nextChannel)
          }
          throw error
        }
      })()
      return connectPromise
    },

    async publish(stream, metadata = {}) {
      if (!stream?.id) return
      publications.set(stream.id, {
        stream,
        type: metadata.type || metadata.streamType || 'screen',
        participant: metadata.participant || participant
      })
      for (const state of peers.values()) {
        const senderTracks = new Set(state.pc.getSenders().map(sender => sender.track).filter(Boolean))
        stream.getTracks().forEach(track => {
          if (!senderTracks.has(track)) state.pc.addTrack(track, stream)
        })
        await negotiate(state)
      }
    },

    async unpublish(stream) {
      if (!stream) return
      publications.delete(stream.id)
      const tracks = new Set(stream.getTracks())
      for (const state of peers.values()) {
        state.pc.getSenders().forEach(sender => {
          if (tracks.has(sender.track)) state.pc.removeTrack(sender)
        })
        await negotiate(state)
      }
    },

    subscribe(listener) {
      subscribers.add(listener)
      remoteStreams.forEach(remote => listener(remote.stream, remote.participant))
      return () => subscribers.delete(listener)
    },

    disconnect() {
      connectGeneration++
      connected = false
      peers.forEach((_state, remoteId) => closePeer(remoteId))
      remoteStreams.clear()
      subscribers.clear()
      if (channel) {
        void channel.untrack().catch(() => {})
        void supabaseClient.removeChannel(channel)
      }
      channel = null
      connectPromise = null
    }
  }
}
