import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatVoiceMessageDuration,
  getVoiceMessageExtension,
  getVoiceMessageMimeType,
  normalizeVoiceMessageMimeType
} from './voiceMessages.js'

test('voice recording chooses the first supported streaming format', () => {
  const recorder = {
    isTypeSupported: type => type === 'audio/ogg;codecs=opus'
  }
  assert.equal(getVoiceMessageMimeType(recorder), 'audio/ogg;codecs=opus')
  assert.equal(getVoiceMessageMimeType(null), '')
})

test('voice message MIME types map to safe file extensions', () => {
  assert.equal(normalizeVoiceMessageMimeType('audio/webm;codecs=opus'), 'audio/webm')
  assert.equal(getVoiceMessageExtension('audio/mp4'), 'm4a')
  assert.equal(getVoiceMessageExtension('audio/ogg;codecs=opus'), 'ogg')
  assert.equal(getVoiceMessageExtension(''), 'webm')
})

test('voice recording duration is formatted for the composer', () => {
  assert.equal(formatVoiceMessageDuration(0), '0:00')
  assert.equal(formatVoiceMessageDuration(65.9), '1:05')
})
