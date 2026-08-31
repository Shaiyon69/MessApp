// Explicit extension (unlike the rest of the codebase) so `node --test` can
// resolve this module for the colocated test; Vite resolves it identically.
import { supabase } from '../supabaseClient.js'
import { debug } from './debug.js'
import { isPolite, shouldIgnoreOffer } from './negotiation.js'

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

// A peer connection routinely reports `disconnected` during a brief network
// blip and recovers on its own, so an ICE restart waits this long before
// stepping in. Restarting immediately would tear down a link that was fine.
const ICE_RECOVERY_DELAY_MS = 5000

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
  const removalSubscribers = new Set()
  const statusSubscribers = new Set()
  const remoteStreams = new Map()
  let channel = null
  let connected = false
  let connectPromise = null
  let resolvedIceServers = DEFAULT_ICE_SERVERS
  // Bumped by connect() and disconnect() so a connect that is still awaiting
  // ICE credentials can tell it has been cancelled and clean up after itself.
  let connectGeneration = 0
  // Supabase leaves a channel asynchronously. Rejoining the same topic before
  // that lands collides with the still-joined channel, so the next connect()
  // waits on this.
  let pendingRemoval = Promise.resolve()

  const emitStatus = status => {
    statusSubscribers.forEach(listener => {
      try { listener(status) } catch (_err) { /* a listener must not break signaling */ }
    })
  }

  const sendSignal = async (event, payload, target) => {
    if (!channel || !connected) return
    await channel.send({
      type: 'broadcast',
      event: 'media-signal',
      payload: { event, payload, from: connectionId, to: target }
    })
  }

  const forgetStream = streamId => {
    const remote = remoteStreams.get(streamId)
    if (!remote) return
    remoteStreams.delete(streamId)
    removalSubscribers.forEach(listener => {
      try { listener(streamId, remote.participant) } catch (_err) { /* keep removing the rest */ }
    })
  }

  const closePeer = remoteId => {
    const state = peers.get(remoteId)
    if (!state) return
    peers.delete(remoteId)
    if (state.recoveryTimer) clearTimeout(state.recoveryTimer)
    state.pc.ontrack = null
    state.pc.onicecandidate = null
    state.pc.onnegotiationneeded = null
    state.pc.onconnectionstatechange = null
    state.pc.oniceconnectionstatechange = null
    state.pc.close()
    for (const streamId of Array.from(remoteStreams.keys())) {
      if (remoteStreams.get(streamId)?.connectionId === remoteId) forgetStream(streamId)
    }
  }

  // Publication metadata rides along with every description, which makes it the
  // only reliable "this stream is gone" signal: stopping a screen share leaves
  // the receiving track `muted` rather than `ended`, so waiting for an `ended`
  // event left a frozen tile behind on every other client.
  const applyPublicationMetadata = (state, metadata) => {
    if (!Array.isArray(metadata)) return
    const nextIds = new Set()
    state.metadata.clear()
    metadata.forEach(item => {
      if (!item?.streamId) return
      state.metadata.set(item.streamId, item)
      nextIds.add(item.streamId)
    })
    for (const streamId of Array.from(remoteStreams.keys())) {
      const remote = remoteStreams.get(streamId)
      if (remote?.connectionId === state.remoteId && !nextIds.has(streamId)) forgetStream(streamId)
    }
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

  // A `failed` connection used to drop the peer outright, and it was only ever
  // rebuilt if unrelated presence churn happened to fire. One ICE restart
  // recovers the common case (a network change) without a rejoin.
  const recoverPeer = state => {
    if (!connected || !peers.has(state.remoteId)) return
    if (state.iceRestarted || typeof state.pc.restartIce !== 'function') {
      closePeer(state.remoteId)
      return
    }
    state.iceRestarted = true
    state.pc.restartIce()
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
      polite: isPolite(connectionId, remoteId),
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      iceRestarted: false,
      recoveryTimer: null,
      // Inbound signals are handled one at a time per peer: processSignal awaits
      // several times against the same connection, and interleaved runs corrupt
      // both the signaling state and the perfect-negotiation flags.
      tail: Promise.resolve(),
      pendingCandidates: [],
      metadata: new Map()
    }
    peers.set(remoteId, state)

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
        track.addEventListener('ended', () => forgetStream(stream.id), { once: true })
      })
    }
    pc.onnegotiationneeded = () => {
      void negotiate(state).catch(error => debug.warn('VOICE_MESH', { operation: 'negotiate', remoteId, error }))
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        state.iceRestarted = false
        return
      }
      if (pc.connectionState === 'closed') closePeer(remoteId)
      if (pc.connectionState === 'failed') recoverPeer(state)
    }
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      if (iceState === 'connected' || iceState === 'completed') {
        if (state.recoveryTimer) clearTimeout(state.recoveryTimer)
        state.recoveryTimer = null
        state.iceRestarted = false
        return
      }
      if (iceState === 'disconnected' && !state.recoveryTimer) {
        state.recoveryTimer = setTimeout(() => {
          state.recoveryTimer = null
          if (pc.iceConnectionState === 'disconnected') recoverPeer(state)
        }, ICE_RECOVERY_DELAY_MS)
      }
    }

    // Handlers first: addTrack queues `negotiationneeded`, which must find its
    // listener already installed.
    publications.forEach(({ stream }) => {
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
    })
    return state
  }

  const drainPendingCandidates = async state => {
    while (state.pendingCandidates.length) {
      const candidate = state.pendingCandidates.shift()
      try {
        await state.pc.addIceCandidate(candidate)
      } catch (error) {
        // A candidate left over from an offer that was ignored or rolled back no
        // longer matches the applied description. Dropping it must not abort the
        // answer that follows — doing so left the peer silently unconnected.
        debug.warn('VOICE_MESH', { operation: 'pending-candidate', remoteId: state.remoteId, error })
      }
    }
  }

  const processSignal = async (state, message) => {
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

    state.ignoreOffer = shouldIgnoreOffer({
      polite: state.polite,
      makingOffer: state.makingOffer,
      signalingState: state.pc.signalingState,
      settingRemoteAnswer: state.settingRemoteAnswer,
      type: description.type
    })
    if (state.ignoreOffer) {
      // Candidates gathered for the offer being ignored belong to an ICE
      // generation that will never be applied.
      state.pendingCandidates.length = 0
      return
    }

    state.settingRemoteAnswer = description.type === 'answer'
    try {
      await state.pc.setRemoteDescription(description)
    } finally {
      state.settingRemoteAnswer = false
    }
    await drainPendingCandidates(state)

    if (description.type === 'offer') {
      await state.pc.setLocalDescription()
      await sendSignal('description', {
        description: state.pc.localDescription,
        publications: describePublications(publications)
      }, state.remoteId)
    }
  }

  const handleSignal = message => {
    if (!message || message.to !== connectionId || message.from === connectionId) return undefined
    const state = ensurePeer(message.from)
    if (!state) return undefined
    state.tail = state.tail
      .then(() => processSignal(state, message))
      .catch(error => debug.warn('VOICE_MESH', {
        operation: 'handle-signal', event: message.event, remoteId: message.from, error
      }))
    return state.tail
  }

  const syncPresence = () => {
    if (!channel) return
    const present = new Set(
      Object.values(channel.presenceState())
        .flatMap(entries => entries)
        .map(entry => entry?.connection_id)
        .filter(id => id && id !== connectionId)
    )
    // Creating the peer is enough: adding the local publications fires
    // `negotiationneeded`, which is the single place an offer is made. Offering
    // from here too meant every presence sync re-offered to every present peer.
    present.forEach(remoteId => ensurePeer(remoteId))
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

        // A previous session's channel leaves the socket asynchronously; joining
        // the same topic before that completes is the duplicate-topic collision.
        await pendingRemoval
        if (!isCurrent()) throw new Error('Voice media connection was cancelled.')

        const nextChannel = supabaseClient.channel(`voice-media:${roomId}`, {
          config: { presence: { key: connectionId }, broadcast: { self: false } }
        })
        nextChannel.on('broadcast', { event: 'media-signal' }, ({ payload }) => {
          handleSignal(payload)
        })
        nextChannel.on('presence', { event: 'sync' }, syncPresence)
        channel = nextChannel

        try {
          await new Promise((resolve, reject) => {
            let settled = false
            const settle = (action, value) => {
              if (settled) return false
              settled = true
              action(value)
              return true
            }
            nextChannel.subscribe(async status => {
              if (!isCurrent()) {
                settle(reject, new Error('Voice media connection was cancelled.'))
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
                  // disconnect() can land inside the await above; resolving
                  // anyway reported a healthy connection on a dead channel.
                  if (!isCurrent()) throw new Error('Voice media connection was cancelled.')
                  syncPresence()
                  settle(resolve)
                } catch (error) {
                  settle(reject, error)
                }
              } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
                if (settle(reject, new Error('Could not connect voice media signaling.'))) return
                // Signaling died after a healthy join. Without this the UI kept
                // reporting "Connected" on a channel that no longer existed.
                connected = false
                emitStatus('failed')
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
            pendingRemoval = Promise.resolve(supabaseClient.removeChannel(nextChannel)).catch(() => {})
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
      // addTrack fires `negotiationneeded`, which is the only place that offers.
      // Negotiating here as well raced the inbound-offer handler and emitted an
      // answer where the remote expected an offer.
      for (const state of peers.values()) {
        const senderTracks = new Set(state.pc.getSenders().map(sender => sender.track).filter(Boolean))
        stream.getTracks().forEach(track => {
          if (!senderTracks.has(track)) state.pc.addTrack(track, stream)
        })
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
      }
    },

    /** `onRemoved(streamId, participant)` fires when a remote publication goes away. */
    subscribe(listener, onRemoved) {
      subscribers.add(listener)
      if (onRemoved) removalSubscribers.add(onRemoved)
      remoteStreams.forEach(remote => listener(remote.stream, remote.participant))
      return () => {
        subscribers.delete(listener)
        if (onRemoved) removalSubscribers.delete(onRemoved)
      }
    },

    /** Reports signaling health after a successful join (currently only 'failed'). */
    onStatus(listener) {
      statusSubscribers.add(listener)
      return () => statusSubscribers.delete(listener)
    },

    disconnect() {
      connectGeneration++
      connected = false
      peers.forEach((_state, remoteId) => closePeer(remoteId))
      remoteStreams.clear()
      subscribers.clear()
      removalSubscribers.clear()
      statusSubscribers.clear()
      if (channel) {
        const leaving = channel
        void leaving.untrack().catch(() => {})
        pendingRemoval = Promise.resolve(supabaseClient.removeChannel(leaving)).catch(() => {})
      }
      channel = null
      connectPromise = null
    }
  }
}
