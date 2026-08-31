import test from 'node:test'
import assert from 'node:assert/strict'
import { assertAvatarFile, avatarObjectName, avatarObjectNameFromUrl, MAX_AVATAR_SOURCE_SIZE_BYTES } from './avatarUpload.js'

const fakeFile = (type, size, name = 'pic.png') => ({ type, size, name })

test('assertAvatarFile accepts an allowed image under the cap', () => {
  const file = fakeFile('image/PNG', 1024)
  assert.equal(assertAvatarFile(file), file)
})

test('assertAvatarFile rejects a disallowed type', () => {
  assert.throws(() => assertAvatarFile(fakeFile('image/svg+xml', 10)), /JPG, PNG, GIF, WebP, or AVIF/)
})

test('assertAvatarFile rejects an oversize file', () => {
  assert.throws(() => assertAvatarFile(fakeFile('image/png', 6 * 1024 * 1024)), /5 MB or smaller/)
  assert.doesNotThrow(() => assertAvatarFile(fakeFile('image/png', 6 * 1024 * 1024), { maxBytes: MAX_AVATAR_SOURCE_SIZE_BYTES }))
})

test('assertAvatarFile rejects a missing file', () => {
  assert.throws(() => assertAvatarFile(null), /Choose an image/)
})

test('avatarObjectName keeps the bucket-required owner prefix', () => {
  const name = avatarObjectName('user-1', fakeFile('image/webp', 1, 'crop-edited.webp'), 'server-abc-')
  assert.match(name, /^user-1-avatar-server-abc-[0-9a-f-]{36}\.webp$/)
})

test('avatarObjectName falls back to webp when the name has no usable extension', () => {
  assert.match(avatarObjectName('user-1', fakeFile('image/webp', 1, 'current-avatar')), /-avatar-[0-9a-f-]{36}\.webp$/)
})

test('avatarObjectNameFromUrl pulls the object name out of a public avatar URL', () => {
  assert.equal(
    avatarObjectNameFromUrl('https://abc.supabase.co/storage/v1/object/public/avatars/user-1-avatar-server-x.webp'),
    'user-1-avatar-server-x.webp'
  )
})

test('avatarObjectNameFromUrl drops a cache-busting query and decodes the name', () => {
  assert.equal(
    avatarObjectNameFromUrl('https://abc.supabase.co/storage/v1/object/public/avatars/user%201-avatar-x.png?t=123'),
    'user 1-avatar-x.png'
  )
})

test('avatarObjectNameFromUrl ignores URLs from another bucket or host', () => {
  assert.equal(avatarObjectNameFromUrl('https://abc.supabase.co/storage/v1/object/public/chat-attachments/a.png'), null)
  assert.equal(avatarObjectNameFromUrl('https://example.com/avatars/a.png'), null)
})

test('avatarObjectNameFromUrl tolerates a missing URL', () => {
  assert.equal(avatarObjectNameFromUrl(null), null)
  assert.equal(avatarObjectNameFromUrl(''), null)
})
