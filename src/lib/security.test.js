import test from 'node:test'
import assert from 'node:assert/strict'
import { safeMediaUrl } from './security.js'

test('media URL validation accepts supported encrypted video previews', () => {
  assert.equal(safeMediaUrl('data:video/mp4;base64,AAAA'), 'data:video/mp4;base64,AAAA')
  assert.equal(safeMediaUrl('blob:https://messapp.example/video-id'), 'blob:https://messapp.example/video-id')
})

test('media URL validation accepts voice message audio', () => {
  assert.equal(safeMediaUrl('data:audio/webm;base64,AAAA'), 'data:audio/webm;base64,AAAA')
  assert.equal(safeMediaUrl('data:audio/mp4;base64,AAAA'), 'data:audio/mp4;base64,AAAA')
})

test('media URL validation rejects active content schemes', () => {
  assert.equal(safeMediaUrl('javascript:alert(1)'), null)
  assert.equal(safeMediaUrl('data:text/html;base64,PGgxPkJhZDwvaDE+'), null)
})
