import { ensureMicrophonePermission } from './mediaDevices.js'
import { debug } from './debug.js'

const CORE_PROCESSING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl']

// Fullband mono speech at a high bitrate. usedtx=0 keeps quiet syllables from
// being cut to comfort noise.
const OPUS_HD_PARAMS = {
  maxaveragebitrate: '96000',
  maxplaybackrate: '48000',
  useinbandfec: '1',
  usedtx: '0',
  stereo: '0'
}

export const VOICE_MESSAGE_BITRATE = 96000

// Live-toggle controls for RNNoise-processed tracks, keyed by the track.
const neuralNoiseControls = new WeakMap()

/**
 * Raises Opus quality in an SDP. Applied to the remote description: the
 * browser sizes its own Opus encoder from the fmtp the peer advertises.
 */
export function tuneOpusSdp(sdp) {
  if (typeof sdp !== 'string') return sdp
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n'
  const lines = sdp.split(eol)
  const opusTypes = new Set(lines
    .map(line => line.match(/^a=rtpmap:(\d+) opus\/48000/i)?.[1])
    .filter(Boolean))
  if (!opusTypes.size) return sdp

  const typesWithFmtp = new Set(lines
    .map(line => line.match(/^a=fmtp:(\d+) /)?.[1])
    .filter(type => opusTypes.has(type)))
  const formatParams = (type, existing = '') => {
    const params = new Map(existing.split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const split = part.indexOf('=')
      return split < 0 ? [part, null] : [part.slice(0, split), part.slice(split + 1)]
    }))
    for (const [key, value] of Object.entries(OPUS_HD_PARAMS)) params.set(key, value)
    const joined = [...params].map(([key, value]) => (value === null ? key : `${key}=${value}`)).join(';')
    return `a=fmtp:${type} ${joined}`
  }

  return lines.flatMap(line => {
    const fmtp = line.match(/^a=fmtp:(\d+) (.*)$/)
    if (fmtp && opusTypes.has(fmtp[1])) return [formatParams(fmtp[1], fmtp[2])]
    const rtpmap = line.match(/^a=rtpmap:(\d+) opus\/48000/i)
    if (rtpmap && !typesWithFmtp.has(rtpmap[1])) return [line, formatParams(rtpmap[1])]
    return [line]
  }).join(eol)
}

function readStoredPreferences() {
  const settingsStorage = typeof window !== 'undefined' ? window.localStorage : null
  return {
    echoCancellation: settingsStorage?.getItem('voiceEchoCancel') !== 'false',
    autoGainControl: settingsStorage?.getItem('voiceAutoGain') !== 'false'
  }
}

function canRunNeuralNoiseSuppression() {
  return typeof AudioWorkletNode !== 'undefined' && typeof AudioContext !== 'undefined'
}

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

// RNNoise replaces the browser's own noise suppression; running both muffles speech.
async function addNeuralNoiseSuppression(stream) {
  const rawTrack = stream.getAudioTracks()[0]
  try {
    const { attachRnnoise } = await import('./rnnoise.js')
    const { track, setEnabled } = await attachRnnoise(rawTrack)
    neuralNoiseControls.set(track, setEnabled)
    stream.removeTrack(rawTrack)
    stream.addTrack(track)
  } catch (error) {
    debug.warn('RNNOISE_UNAVAILABLE', { error: error?.message })
    await rawTrack.applyConstraints?.({ noiseSuppression: true }).catch(() => {})
  }
  return markStreamAsSpeech(stream)
}

export async function getVoiceMediaStream({
  mediaDevices = globalThis.navigator?.mediaDevices,
  video = false,
  noiseReduction = true,
  echoCancellation,
  autoGainControl
} = {}) {
  const neural = noiseReduction && canRunNeuralNoiseSuppression()
  const stream = await captureMicrophone({
    mediaDevices,
    video,
    noiseReduction: noiseReduction && !neural,
    echoCancellation,
    autoGainControl
  })
  return neural ? addNeuralNoiseSuppression(stream) : stream
}

async function captureMicrophone({ mediaDevices, video, noiseReduction, echoCancellation, autoGainControl }) {
  if (!mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable')
  await ensureMicrophonePermission()

  const supported = getSupportedAudioConstraints(mediaDevices)
  const stored = readStoredPreferences()
  const preferences = {
    echoCancellation: echoCancellation ?? stored.echoCancellation,
    autoGainControl: autoGainControl ?? stored.autoGainControl
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

  const setNeuralNoiseSuppression = neuralNoiseControls.get(track)
  if (setNeuralNoiseSuppression) {
    setNeuralNoiseSuppression(enabled)
    return track.getSettings?.() || {}
  }

  // Echo cancellation and gain follow their own settings, not this toggle.
  const preferences = readStoredPreferences()
  const supported = getSupportedAudioConstraints(mediaDevices)
  const enhancedAudio = buildVoiceAudioConstraints(enabled, supported, preferences)

  try {
    await track.applyConstraints(enhancedAudio)
  } catch (error) {
    if (!isConstraintShapeError(error)) throw error
    await track.applyConstraints({
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: enabled,
      autoGainControl: preferences.autoGainControl
    })
  }

  return track.getSettings?.() || {}
}
