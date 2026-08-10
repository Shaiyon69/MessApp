import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupPresenceByChannel, buildVoicePresencePayload } from './voicePresence.js'

const entry = (overrides = {}) => ({
  profile_id: 'user-1',
  channel_id: 'channel-a',
  display_name: 'Ana',
  avatar_url: 'https://example.test/a.png',
  ...overrides
})

test('groups occupants by the voice channel they are sitting in', () => {
  const grouped = groupPresenceByChannel({
    'user-1': [entry()],
    'user-2': [entry({ profile_id: 'user-2', display_name: 'Bo' })],
    'user-3': [entry({ profile_id: 'user-3', channel_id: 'channel-b', display_name: 'Cy' })]
  })
  assert.deepEqual(Object.keys(grouped).sort(), ['channel-a', 'channel-b'])
  assert.deepEqual(grouped['channel-a'].map(p => p.displayName).sort(), ['Ana', 'Bo'])
  assert.equal(grouped['channel-b'][0].displayName, 'Cy')
})

test('a member signed in twice occupies a single seat', () => {
  const grouped = groupPresenceByChannel({ 'user-1': [entry(), entry()] })
  assert.equal(grouped['channel-a'].length, 1)
})

test('entries without a channel or profile are ignored', () => {
  const grouped = groupPresenceByChannel({
    a: [entry({ channel_id: undefined })],
    b: [entry({ profile_id: undefined })],
    c: [entry({ profile_id: 'user-9', channel_id: 'channel-c' })]
  })
  assert.deepEqual(Object.keys(grouped), ['channel-c'])
})

test('media flags are normalized to booleans for the sidebar', () => {
  const [participant] = groupPresenceByChannel({
    'user-1': [entry({ muted: true, screen_share_active: true })]
  })['channel-a']
  assert.equal(participant.muted, true)
  assert.equal(participant.screenShareActive, true)
  assert.equal(participant.deafened, false)
  assert.equal(participant.cameraActive, false)
  assert.equal(participant.speaking, false)
})

test('empty or missing presence state yields no channels', () => {
  assert.deepEqual(groupPresenceByChannel({}), {})
  assert.deepEqual(groupPresenceByChannel(null), {})
})

test('presence payload is published only while connected to this server', () => {
  const base = {
    serverId: 'server-1',
    profileId: 'user-1',
    displayName: 'Ana',
    voiceSessionState: { isSharing: true, isCameraOn: false }
  }
  const connected = buildVoicePresencePayload({
    ...base,
    activeVoiceSession: { serverId: 'server-1', channelId: 'channel-a' }
  })
  assert.equal(connected.channel_id, 'channel-a')
  assert.equal(connected.screen_share_active, true)
  assert.equal(connected.camera_active, false)

  // Sitting in another server's voice channel must not occupy a seat here.
  assert.equal(buildVoicePresencePayload({
    ...base,
    activeVoiceSession: { serverId: 'server-2', channelId: 'channel-z' }
  }), null)

  assert.equal(buildVoicePresencePayload({ ...base, activeVoiceSession: null }), null)
  assert.equal(buildVoicePresencePayload({ ...base, profileId: null, activeVoiceSession: { serverId: 'server-1', channelId: 'channel-a' } }), null)
})
