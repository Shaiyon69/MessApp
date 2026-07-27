import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acquireAlternateCamera,
  ensureMicrophonePermission,
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
