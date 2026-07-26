import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isHydratedAttachment,
  normalizeCachedAttachment,
  serializeAttachmentForCache
} from './attachmentCache.js'

test('legacy poisoned image cache entries are restored as encrypted attachments', () => {
  const normalized = normalizeCachedAttachment({
    file_url: 'https://project.supabase.co/storage/v1/object/public/chat-attachments/user/room/file.json',
    file_type: 'image/jpeg'
  })
  assert.equal(normalized.file_type, 'encrypted:image/jpeg')
  assert.equal(isHydratedAttachment(normalized), false)
})

test('temporary decrypted media serializes back to its encrypted storage metadata', () => {
  const persisted = serializeAttachmentForCache({
    file_url: 'blob:https://messapp.example/decrypted-video',
    file_type: 'video/mp4',
    storage_file_url: 'https://project.supabase.co/storage/v1/object/public/chat-attachments/user/room/file.json',
    storage_file_type: 'encrypted:video/mp4',
    __media_bytes: 1024
  })
  assert.equal(persisted.file_url.endsWith('/file.json'), true)
  assert.equal(persisted.file_type, 'encrypted:video/mp4')
  assert.equal('__media_bytes' in persisted, false)
})

test('only decrypted or ordinary media references are treated as hydrated', () => {
  assert.equal(isHydratedAttachment({ file_url: 'data:image/png;base64,AAAA', file_type: 'image/png' }), true)
  assert.equal(isHydratedAttachment({ file_url: 'https://cdn.example/image.jpg', file_type: 'image/jpeg' }), true)
  assert.equal(isHydratedAttachment({ file_url: 'https://cdn.example/file.json', file_type: 'image/jpeg' }), false)
})
