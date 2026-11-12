import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acquireAlternateCamera,
  createTauriCallAudio,
  ensureMicrophonePermission,
  isNativeCallAudioAvailable,
  getNextCameraSelection
} from './mediaDevices.js'

test('native microphone permission is requested before capture when needed', async () => {
  const calls = []
  const state = await ensureMicrophonePermission({
    capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      isPluginAvailable: () => true
    },
    nativePermissionClient: {
      checkMediaPermissions: async () => {
        calls.push('check')
        return { microphone: 'prompt' }
      },
      requestMicrophonePermission: async () => {
        calls.push('request')
        return { microphone: 'granted' }
      }
    }
  })

  assert.equal(state, 'granted')
  assert.deepEqual(calls, ['check', 'request'])
})

test('denied browser microphone permission stops before getUserMedia', async () => {
  await assert.rejects(
    ensureMicrophonePermission({
      capacitor: { isNativePlatform: () => false },
      permissions: { query: async () => ({ state: 'denied' }) }
    }),
    error => error.name === 'NotAllowedError'
  )
})

test('camera selection cycles to a different enumerated device', () => {
  const plan = getNextCameraSelection([
    { kind: 'videoinput', deviceId: 'front' },
    { kind: 'videoinput', deviceId: 'rear' }
  ], {
    deviceId: 'front',
    facingMode: 'user'
  })

  assert.deepEqual(plan.constraints, {
    video: { deviceId: { exact: 'rear' } },
    audio: false
  })
  assert.equal(plan.facingMode, 'environment')
})

test('alternate camera acquisition returns an enabled live track', async () => {
  const track = {
    enabled: false,
    readyState: 'live',
    getSettings: () => ({ deviceId: 'rear', facingMode: 'environment' })
  }
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track]
  }
  const result = await acquireAlternateCamera({
    currentTrack: { getSettings: () => ({ deviceId: 'front', facingMode: 'user' }) },
    mediaDevices: {
      enumerateDevices: async () => [
        { kind: 'videoinput', deviceId: 'front' },
        { kind: 'videoinput', deviceId: 'rear' }
      ],
      getUserMedia: async () => stream
    }
  })

  assert.equal(result.stream, stream)
  assert.equal(result.track, track)
  assert.equal(track.enabled, true)
  assert.equal(result.facingMode, 'environment')
})

test('Tauri Android uses the native call audio client, the web does not', () => {
  assert.equal(isNativeCallAudioAvailable({ isNativePlatform: () => false }, true), true)
  assert.equal(isNativeCallAudioAvailable({ isNativePlatform: () => false }, false), false)
})

test('Tauri call audio client invokes the messapp-call-audio plugin', async () => {
  const calls = []
  const client = createTauriCallAudio(async (cmd, args) => {
    calls.push([cmd, args])
    return { enabled: true }
  })
  assert.deepEqual(await client.setSpeakerEnabled({ enabled: true }), { enabled: true })
  await client.requestMicrophonePermission()
  assert.deepEqual(calls, [
    ['plugin:messapp-call-audio|set_speaker_enabled', { enabled: true }],
    ['plugin:messapp-call-audio|request_microphone_permission', undefined]
  ])
})

test('Tauri call audio errors become named Errors', async () => {
  const client = createTauriCallAudio(async () => { throw 'AudioManager busy' })
  await assert.rejects(client.startCall(), /start_call: AudioManager busy/)
})

test('Tauri Android asks the plugin for the mic permission', async () => {
  const state = await ensureMicrophonePermission({
    capacitor: { isNativePlatform: () => false },
    tauriMobile: true,
    nativePermissionClient: {
      checkMediaPermissions: async () => ({ microphone: 'prompt-with-rationale' }),
      requestMicrophonePermission: async () => ({ microphone: 'granted' })
    }
  })
  assert.equal(state, 'granted')
})
