const VOICE_MESSAGE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4'
]

export function getVoiceMessageMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass) return ''
  if (typeof MediaRecorderClass.isTypeSupported !== 'function') return ''
  return VOICE_MESSAGE_MIME_CANDIDATES.find(type => MediaRecorderClass.isTypeSupported(type)) || ''
}

export function normalizeVoiceMessageMimeType(value) {
  return String(value || 'audio/webm').split(';', 1)[0].trim().toLowerCase()
}

export function getVoiceMessageExtension(value) {
  const type = normalizeVoiceMessageMimeType(value)
  if (type === 'audio/ogg') return 'ogg'
  if (type === 'audio/mp4' || type === 'audio/x-m4a') return 'm4a'
  if (type === 'audio/mpeg') return 'mp3'
  if (type === 'audio/wav') return 'wav'
  return 'webm'
}

export function formatVoiceMessageDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
