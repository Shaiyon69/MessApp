import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentKind } from './attachmentKind.js'

const file = (type, name = 'x') => ({ file: { type, name } })

test('attachmentKind labels a single kind, mixed sets, and no attachments', () => {
  assert.equal(attachmentKind([]), null)
  assert.equal(attachmentKind([file('image/png'), file('image/jpeg')]), 'photo')
  assert.equal(attachmentKind([{ gifUrl: 'https://x/y.gif' }]), 'gif')
  assert.equal(attachmentKind([file('image/gif')]), 'gif')
  assert.equal(attachmentKind([file('video/mp4')]), 'video')
  assert.equal(attachmentKind([file('audio/webm', 'voice-message-1.webm')]), 'voice')
  assert.equal(attachmentKind([file('audio/mpeg', 'song.mp3')]), 'audio')
  assert.equal(attachmentKind([file('application/pdf')]), 'file')
  assert.equal(attachmentKind([file('image/png'), file('video/mp4')]), 'mixed')
})
