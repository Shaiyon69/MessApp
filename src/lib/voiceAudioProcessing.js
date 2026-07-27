import { ensureMicrophonePermission } from './mediaDevices.js'

const CORE_PROCESSING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl']

export function getSupportedAudioConstraints(mediaDevices = globalThis.navigator?.mediaDevices) {
  try {
    return mediaDevices?.getSupportedConstraints?.() || {}
  } catch {
    return {}
  }
}

export function buildVoiceAudioConstraints(enabled = true, supported = {}, preferences = {}) {
  const constraints = {}
  const hasCapabilityReport = Object.keys(supported).length > 0
  const values = {
    echoCancellation: preferences.echoCancellation ?? enabled,
    noiseSuppression: enabled,
    autoGainControl: preferences.autoGainControl ?? enabled
  }

  for (const key of CORE_PROCESSING_KEYS) {
    if (!hasCapabilityReport || supported[key]) constraints[key] = values[key]
  }

  if (supported.channelCount) constraints.channelCount = { ideal: 1 }
  if (supported.sampleRate) constraints.sampleRate = { ideal: 48000 }
  if (supported.sampleSize) constraints.sampleSize = { ideal: 16 }
  if (supported.latency) constraints.latency = { ideal: 0.01 }

  return constraints
}

function isConstraintShapeError(error) {
  return error?.name === 'OverconstrainedError' || error?.name === 'TypeError'
}

function markStreamAsSpeech(stream) {
  stream?.getAudioTracks?.().forEach(track => {
    if ('contentHint' in track) track.contentHint = 'speech'
  })
  return stream
}

function validateMicrophoneStream(stream) {
  const track = stream?.getAudioTracks?.().find(candidate => candidate.readyState !== 'ended')
  if (!track) {
    stream?.getTracks?.().forEach(candidate => candidate.stop())
    const error = new Error('No live microphone was returned')
    error.name = 'NotFoundError'
    throw error
  }
  track.enabled = true
  return markStreamAsSpeech(stream)
}

export async function getVoiceMediaStream({
  mediaDevices = globalThis.navigator?.mediaDevices,
  video = false,
  noiseReduction = true,
  echoCancellation,
  autoGainControl
} = {}) {
  if (!mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable')
  await ensureMicrophonePermission()

  const supported = getSupportedAudioConstraints(mediaDevices)
  const settingsStorage = typeof window !== 'undefined' ? window.localStorage : null
  const storedEchoCancellation = settingsStorage?.getItem('voiceEchoCancel') !== 'false'
  const storedAutoGainControl = settingsStorage?.getItem('voiceAutoGain') !== 'false'
  const preferences = {
    echoCancellation: echoCancellation ?? storedEchoCancellation,
    autoGainControl: autoGainControl ?? storedAutoGainControl
  }
  const enhancedAudio = buildVoiceAudioConstraints(noiseReduction, supported, preferences)

  try {
    return validateMicrophoneStream(await mediaDevices.getUserMedia({ video, audio: enhancedAudio }))
  } catch (error) {
    if (!isConstraintShapeError(error)) throw error
  }

  const coreAudio = {
    echoCancellation: preferences.echoCancellation,
    noiseSuppression: noiseReduction,
    autoGainControl: preferences.autoGainControl
  }

  try {
    return validateMicrophoneStream(await mediaDevices.getUserMedia({ video, audio: coreAudio }))
  } catch (error) {
    if (!isConstraintShapeError(error)) throw error
    return validateMicrophoneStream(await mediaDevices.getUserMedia({ video, audio: true }))
  }
}

export async function applyVoiceAudioProcessing(track, enabled = true, mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!track?.applyConstraints) throw new Error('Dynamic microphone processing is unavailable')
  if ('contentHint' in track) track.contentHint = 'speech'

  const supported = getSupportedAudioConstraints(mediaDevices)
  const enhancedAudio = buildVoiceAudioConstraints(enabled, supported)

  try {
    await track.applyConstraints(enhancedAudio)
  } catch (error) {
    if (!isConstraintShapeError(error)) throw error
    await track.applyConstraints({
      echoCancellation: enabled,
      noiseSuppression: enabled,
      autoGainControl: enabled
    })
  }

  return track.getSettings?.() || {}
}
