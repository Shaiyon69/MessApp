import { Capacitor, registerPlugin } from '@capacitor/core'

// Registered once here and shared with useWebRTC.js. registerPlugin warns and
// returns the existing proxy when a name is registered twice, so a second
// module-scope registration still works but logs a misleading console error.
export const CallAudio = registerPlugin('CallAudio')
const GRANTED_PERMISSION_STATES = new Set(['granted', 'limited'])

const createPermissionError = (message) => {
  const error = new Error(message)
  error.name = 'NotAllowedError'
  return error
}

const normalizePermissionState = value => String(value || 'prompt').toLowerCase()

export async function ensureMicrophonePermission({
  capacitor = Capacitor,
  nativePermissionClient = CallAudio,
  permissions = globalThis.navigator?.permissions
} = {}) {
  const isNativeAndroid = capacitor?.isNativePlatform?.()
    && capacitor?.getPlatform?.() === 'android'
    && capacitor?.isPluginAvailable?.('CallAudio')

  if (isNativeAndroid) {
    const current = await nativePermissionClient.checkMediaPermissions()
    let state = normalizePermissionState(current?.microphone)
    if (!GRANTED_PERMISSION_STATES.has(state)) {
      const requested = await nativePermissionClient.requestMicrophonePermission()
      state = normalizePermissionState(requested?.microphone)
    }
    if (!GRANTED_PERMISSION_STATES.has(state)) {
      throw createPermissionError('Microphone permission is disabled in device settings.')
    }
    return state
  }

  if (permissions?.query) {
    try {
      const result = await permissions.query({ name: 'microphone' })
      const state = normalizePermissionState(result?.state)
      if (state === 'denied') throw createPermissionError('Microphone permission is disabled in browser settings.')
      return state
    } catch (error) {
      if (error?.name === 'NotAllowedError') throw error
      // Safari and older WebViews do not expose the microphone permission
      // descriptor. getUserMedia remains the authoritative prompt there.
    }
  }

  return 'prompt'
}

export function getNextCameraSelection(devices = [], currentSettings = {}, preferredFacingMode = 'user') {
  const cameras = devices.filter(device => device?.kind === 'videoinput' && device.deviceId)
  const currentDeviceIndex = cameras.findIndex(device => device.deviceId === currentSettings.deviceId)
  const currentFacingMode = currentSettings.facingMode || preferredFacingMode || 'user'
  const nextFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment'

  if (cameras.length > 1) {
    const nextIndex = currentDeviceIndex >= 0 ? (currentDeviceIndex + 1) % cameras.length : 0
    return {
      constraints: { video: { deviceId: { exact: cameras[nextIndex].deviceId } }, audio: false },
      facingMode: nextFacingMode,
      deviceId: cameras[nextIndex].deviceId
    }
  }

  return {
    constraints: { video: { facingMode: { ideal: nextFacingMode } }, audio: false },
    facingMode: nextFacingMode,
    deviceId: ''
  }
}

export async function acquireAlternateCamera({
  mediaDevices = globalThis.navigator?.mediaDevices,
  currentTrack,
  preferredFacingMode = 'user'
} = {}) {
  if (!mediaDevices?.getUserMedia) throw new Error('Camera capture is unavailable')

  let devices = []
  try {
    devices = await mediaDevices.enumerateDevices?.() || []
  } catch {
    // facingMode remains a useful mobile fallback when enumeration is blocked.
  }

  const plan = getNextCameraSelection(devices, currentTrack?.getSettings?.() || {}, preferredFacingMode)
  let stream
  try {
    stream = await mediaDevices.getUserMedia(plan.constraints)
  } catch (error) {
    if (!plan.deviceId) throw error
    stream = await mediaDevices.getUserMedia({
      video: { facingMode: { ideal: plan.facingMode } },
      audio: false
    })
  }

  const track = stream?.getVideoTracks?.().find(candidate => candidate.readyState !== 'ended')
  if (!track) {
    stream?.getTracks?.().forEach(candidate => candidate.stop())
    throw new Error('No live camera was returned')
  }

  track.enabled = true
  if ('contentHint' in track) track.contentHint = 'motion'
  return {
    stream,
    track,
    facingMode: track.getSettings?.().facingMode || plan.facingMode
  }
}
