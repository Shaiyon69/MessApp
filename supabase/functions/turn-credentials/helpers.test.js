import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hmacSha1Base64, buildTurnCredential, buildIceServers, resolveTurnCredential } from './helpers.js'

test('resolveTurnCredential prefers the shared secret, then fixed credentials', async () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0)
  const minted = await resolveTurnCredential({ sharedSecret: 'shh', username: 'u', password: 'p', ttlSeconds: 60, now })
  assert.deepEqual(minted, await buildTurnCredential({ secret: 'shh', ttlSeconds: 60, now }))
  assert.deepEqual(await resolveTurnCredential({ username: 'u', password: 'p', ttlSeconds: 60 }), { username: 'u', credential: 'p' })
  assert.equal(await resolveTurnCredential({ username: 'u', ttlSeconds: 60 }), null)
  assert.equal(await resolveTurnCredential({ ttlSeconds: 60 }), null)
})

test('buildIceServers leaves out turns: without a TLS port', () => {
  const [, relay] = buildIceServers({ host: 'h', port: '3478', tlsPort: null, username: 'u', credential: 'p' })
  assert.deepEqual(relay.urls, ['turn:h:3478?transport=udp', 'turn:h:3478?transport=tcp'])
})

test('hmacSha1Base64 matches a known HMAC-SHA1 vector', async () => {
  const digest = await hmacSha1Base64('test-secret', '1234567890')
  assert.equal(digest, 'SCDzCTOx4gtK7IZmqFeE3VSefWw=')
})

test('buildTurnCredential derives username from expiry and signs it', async () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0)
  const { username, credential, expiresAt } = await buildTurnCredential({ secret: 'shh', ttlSeconds: 3600, now })
  assert.equal(expiresAt, Math.floor(now / 1000) + 3600)
  assert.equal(username, String(expiresAt))
  assert.equal(credential, await hmacSha1Base64('shh', username))
})

test('buildTurnCredential produces different credentials for different secrets', async () => {
  const now = Date.now()
  const a = await buildTurnCredential({ secret: 'secret-a', ttlSeconds: 60, now })
  const b = await buildTurnCredential({ secret: 'secret-b', ttlSeconds: 60, now })
  assert.equal(a.username, b.username)
  assert.notEqual(a.credential, b.credential)
})

test('buildIceServers returns a STUN entry and a TURN entry with udp, tcp, and TLS URIs', () => {
  const iceServers = buildIceServers({ host: 'turn.example.com', port: '3478', tlsPort: '5349', username: 'u', credential: 'c' })
  assert.equal(iceServers.length, 2)
  assert.deepEqual(iceServers[0], { urls: ['stun:turn.example.com:3478'] })
  assert.equal(iceServers[1].username, 'u')
  assert.equal(iceServers[1].credential, 'c')
  assert.deepEqual(iceServers[1].urls, [
    'turn:turn.example.com:3478?transport=udp',
    'turn:turn.example.com:3478?transport=tcp',
    'turns:turn.example.com:5349?transport=tcp'
  ])
})
