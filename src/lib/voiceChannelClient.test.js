import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceChannelClient } from './voiceChannelClient.js'

const createFakeSupabase = ({ subscribeStatus = 'SUBSCRIBED', presenceState = () => ({}) } = {}) => {
  const channels = []
  const removed = []
  return {
    channels,
    removed,
    channel(topic) {
      const channel = {
        topic,
        subscribed: false,
        sent: [],
        tracked: null,
        handlers: {},
        on(type, filter, handler) {
          channel.handlers[filter?.event || type] = handler
          return channel
        },
        subscribe(callback) {
          channel.subscribed = true
          callback(subscribeStatus)
          return channel
        },
        presenceState,
        track: async payload => { channel.tracked = payload },
        untrack: async () => {},
        send: async message => { channel.sent.push(message) }
      }
      channels.push(channel)
      return channel
    },
    removeChannel(channel) {
      removed.push(channel)
      channel.subscribed = false
    }
  }
}

const createClientUnderTest = (supabaseClient, iceServers, PeerConnection = function FakePeerConnection() {}) =>
  createVoiceChannelClient({
    roomId: 'room-1',
    participant: { id: 'user-1', displayName: 'Tester', avatarUrl: '' },
    supabaseClient,
    PeerConnection,
    iceServers
  })

// A voice join resolves TURN credentials before subscribing, so an unmount
// during that fetch used to leave a subscribed channel with nobody holding a
// reference to it. The next join then collided on the same topic and failed.
test('disconnect during ICE resolution leaves no subscribed channel behind', async () => {
  const supabaseClient = createFakeSupabase()
  let resolveIceServers
  const iceServers = new Promise(resolve => { resolveIceServers = resolve })
  const client = createClientUnderTest(supabaseClient, iceServers)

  const connectResult = client.connect().then(() => 'resolved', () => 'rejected')
  client.disconnect()
  resolveIceServers([{ urls: 'stun:example.test' }])

  assert.equal(await connectResult, 'rejected')
  assert.deepEqual(supabaseClient.channels.filter(channel => channel.subscribed), [])
})

test('a completed connect is torn down by disconnect', async () => {
  const supabaseClient = createFakeSupabase()
  const client = createClientUnderTest(supabaseClient, Promise.resolve([{ urls: 'stun:example.test' }]))

  await client.connect()
  assert.equal(supabaseClient.channels.length, 1)
  assert.equal(supabaseClient.channels[0].subscribed, true)

  client.disconnect()
  assert.deepEqual(supabaseClient.removed, supabaseClient.channels)
})

// A rejected subscribe still leaves the channel joined on the socket, so it has
// to be removed here rather than waiting for the caller's teardown.
test('a failed subscribe removes its own channel', async () => {
  const supabaseClient = createFakeSupabase({ subscribeStatus: 'CHANNEL_ERROR' })
  const client = createClientUnderTest(supabaseClient, Promise.resolve([{ urls: 'stun:example.test' }]))

  await assert.rejects(client.connect(), /Could not connect voice media signaling/)
  assert.deepEqual(supabaseClient.channels.filter(channel => channel.subscribed), [])
  assert.equal(supabaseClient.removed.length, 1)
})

// Sorts after any 'user-1:…' connection id, so this client is the impolite peer.
const REMOTE_ID = 'zzzz-user:remote'

// Enough of RTCPeerConnection to exercise negotiation. `addIceCandidate` rejects
// on demand so the pending-candidate drain can be tested.
const createFakePeerConnectionClass = ({ rejectCandidates = false } = {}) => {
  class FakePeerConnection {
    constructor() {
      this.signalingState = 'stable'
      this.remoteDescription = null
      this.localDescription = null
      this.tracks = []
      this.candidates = []
      FakePeerConnection.instances.push(this)
    }

    addTrack(track) { this.tracks.push(track) }
    getSenders() { return this.tracks.map(track => ({ track })) }
    removeTrack() {}
    close() { this.signalingState = 'closed' }

    async setRemoteDescription(description) {
      this.remoteDescription = description
      this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'
    }

    async setLocalDescription() {
      const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer'
      this.localDescription = { type, sdp: 'sdp' }
      this.signalingState = type === 'answer' ? 'stable' : 'have-local-offer'
    }

    async addIceCandidate(candidate) {
      if (rejectCandidates) throw new Error('stale candidate')
      this.candidates.push(candidate)
    }
  }
  FakePeerConnection.instances = []
  return FakePeerConnection
}

const fakeRemoteStream = id => ({
  id,
  getVideoTracks: () => [{ kind: 'video' }],
  getTracks: () => [{ kind: 'video', addEventListener: () => {} }]
})

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve() }

const connectWithPeer = async ({ rejectCandidates = false, presenceState = () => ({}) } = {}) => {
  const supabaseClient = createFakeSupabase({ presenceState })
  const PeerConnection = createFakePeerConnectionClass({ rejectCandidates })
  const client = createClientUnderTest(supabaseClient, Promise.resolve([{ urls: 'stun:example.test' }]), PeerConnection)
  await client.connect()
  const channel = supabaseClient.channels[0]
  const to = channel.tracked.connection_id
  const emit = payload => channel.handlers['media-signal']({ payload: { to, from: REMOTE_ID, ...payload } })
  return { client, channel, emit, PeerConnection }
}

const descriptionsSent = channel => channel.sent
  .filter(message => message.payload?.event === 'description')
  .map(message => message.payload.payload.description.type)

// Candidates queued for a description that is not applied yet reject on drain.
// That rejection used to abort the handler before the answer was created, so the
// peer silently never connected.
test('an inbound offer is answered even when the queued candidates are stale', async () => {
  const { channel, emit } = await connectWithPeer({ rejectCandidates: true })

  emit({ event: 'candidate', payload: { candidate: { candidate: 'stale' } } })
  emit({ event: 'description', payload: { description: { type: 'offer', sdp: 'sdp' }, publications: [] } })
  await settle()

  assert.deepEqual(descriptionsSent(channel), ['answer'])
})

test('publish does not emit a description on its own', async () => {
  const { client, channel } = await connectWithPeer({ presenceState: () => ({ [REMOTE_ID]: [{ connection_id: REMOTE_ID }] }) })

  await client.publish({ id: 'stream-1', getTracks: () => [{ kind: 'audio' }] }, { type: 'audio' })
  await settle()

  assert.deepEqual(descriptionsSent(channel), [], 'offers come only from negotiationneeded')
})

test('a presence sync does not re-offer to peers that are already present', async () => {
  const presence = { [REMOTE_ID]: [{ connection_id: REMOTE_ID }] }
  const { channel } = await connectWithPeer({ presenceState: () => presence })

  channel.handlers.sync()
  channel.handlers.sync()
  await settle()

  assert.deepEqual(descriptionsSent(channel), [], 'presence syncs never open a negotiation')
})

// Stopping a screen share leaves the receiving track muted rather than ended, so
// the publication list is the only signal that the stream is gone.
test('a publication that disappears removes the remote stream', async () => {
  const { client, emit, PeerConnection } = await connectWithPeer()
  const added = []
  const removed = []
  client.subscribe(stream => added.push(stream.id), streamId => removed.push(streamId))

  emit({
    event: 'description',
    payload: {
      description: { type: 'offer', sdp: 'sdp' },
      publications: [{ streamId: 'screen-1', type: 'screen', participant: { id: 'other' } }]
    }
  })
  await settle()
  PeerConnection.instances[0].ontrack({ streams: [fakeRemoteStream('screen-1')] })
  assert.deepEqual(added, ['screen-1'])

  emit({ event: 'description', payload: { description: { type: 'offer', sdp: 'sdp' }, publications: [] } })
  await settle()

  assert.deepEqual(removed, ['screen-1'])
})
