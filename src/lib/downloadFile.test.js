import test from 'node:test'
import assert from 'node:assert/strict'
import { downloadFile, resolveDownloadName, toAndroidDownloadUrl, toAttachmentUrl } from './downloadFile.js'

test('resolveDownloadName prefers the stored file name', () => {
  assert.equal(resolveDownloadName('https://cdn.test/a/b.jpg', 'holiday.jpg'), 'holiday.jpg')
  assert.equal(resolveDownloadName('https://cdn.test/a/b.jpg', '   '), 'b.jpg')
})

test('resolveDownloadName falls back for URLs without a usable path', () => {
  assert.equal(resolveDownloadName('blob:https://app.test/1234', null), '1234')
  assert.equal(resolveDownloadName('data:image/png;base64,AAAA', null), 'download')
})

test('toAndroidDownloadUrl tags the name and forces data URLs to download', () => {
  assert.equal(
    toAndroidDownloadUrl('https://cdn.test/a.jpg', 'my photo.jpg'),
    'https://cdn.test/a.jpg#my%20photo.jpg'
  )
  assert.equal(
    toAndroidDownloadUrl('data:image/png;base64,AAAA', 'a.png'),
    'data:application/octet-stream;base64,AAAA#a.png'
  )
})

test('toAndroidDownloadUrl replaces an existing fragment', () => {
  assert.equal(toAndroidDownloadUrl('https://cdn.test/a.jpg#old', 'a.jpg'), 'https://cdn.test/a.jpg#a.jpg')
})

test('toAttachmentUrl asks Supabase Storage for an attachment response', () => {
  assert.equal(
    toAttachmentUrl('https://x.supabase.co/storage/v1/object/sign/a.png?token=abc', 'a.png'),
    'https://x.supabase.co/storage/v1/object/sign/a.png?token=abc&download=a.png'
  )
  assert.equal(toAttachmentUrl('blob:https://app.test/1', 'a.png'), 'blob:https://app.test/1')
  assert.equal(toAttachmentUrl('data:image/png;base64,AAAA', 'a.png'), 'data:image/png;base64,AAAA')
})

test('downloadFile rejects rather than pretending an empty URL saved', async () => {
  await assert.rejects(() => downloadFile('', 'a.png'), /Nothing to download/)
})

test('downloadFile hands Android data URLs to the native bridge, not a navigation', async () => {
  const saved = []
  globalThis.window = { MessAppDownloads: { save: (url) => saved.push(url) } }
  try {
    const name = await downloadFile('data:image/png;base64,AAAA', 'holiday.png', { isAndroid: true })
    assert.equal(name, 'holiday.png')
    assert.deepEqual(saved, ['data:application/octet-stream;base64,AAAA#holiday.png'])
  } finally {
    delete globalThis.window
  }
})

test('downloadFile surfaces a missing Android bridge instead of failing silently', async () => {
  globalThis.window = {}
  try {
    await assert.rejects(
      () => downloadFile('data:image/png;base64,AAAA', 'a.png', { isAndroid: true }),
      /cannot save decrypted media/
    )
  } finally {
    delete globalThis.window
  }
})
