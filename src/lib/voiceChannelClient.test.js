import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceChannelClient } from './voiceChannelClient.js'

const createFakeSupabase = ({ subscribeStatus = 'SUBSCRIBED' } = {}) => {
  const channels = []
  const removed = []
  return {
    channels,
    removed,
    channel(topic) {
      const channel = {
        topic,
        subscribed: false,
        on() { return channel },
        subscribe(callback) {
          channel.subscribed = true
          callback(subscribeStatus)
          return channel
        },
        presenceState: () => ({}),
        track: async () => {},
        untrack: async () => {},
        send: async () => {}
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

const createClientUnderTest = (supabaseClient, iceServers) => createVoiceChannelClient({
  roomId: 'room-1',
  participant: { id: 'user-1', displayName: 'Tester', avatarUrl: '' },
  supabaseClient,
  PeerConnection: function FakePeerConnection() {},
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
