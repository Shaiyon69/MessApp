const CORE_PROCESSING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl']

export function getSupportedAudioConstraints(mediaDevices = globalThis.navigator?.mediaDevices) {
  try {
    return mediaDevices?.getSupportedConstraints?.() || {}
  } catch {
    return {}
  }
}

export function buildVoiceAudioConstraints(enabled = true, supported = {}) {
  const constraints = {}
  const hasCapabilityReport = Object.keys(supported).length > 0

  for (const key of CORE_PROCESSING_KEYS) {
    if (!hasCapabilityReport || supported[key]) constraints[key] = enabled
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

export async function getVoiceMediaStream({
  mediaDevices = globalThis.navigator?.mediaDevices,
  video = false,
  noiseReduction = true
} = {}) {
  if (!mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable')

  const supported = getSupportedAudioConstraints(mediaDevices)
  const enhancedAudio = buildVoiceAudioConstraints(noiseReduction, supported)

  try {
    return markStreamAsSpeech(await mediaDevices.getUserMedia({ video, audio: enhancedAudio }))
  } catch (error) {
    if (!isConstraintShapeError(error)) throw error
  }

  const coreAudio = {
    echoCancellation: noiseReduction,
    noiseSuppression: noiseReduction,
    autoGainControl: noiseReduction
  }

  try {
    return markStreamAsSpeech(await mediaDevices.getUserMedia({ video, audio: coreAudio }))
  } catch (error) {
    if (!isConstraintShapeError(error)) throw error
    return markStreamAsSpeech(await mediaDevices.getUserMedia({ video, audio: true }))
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
