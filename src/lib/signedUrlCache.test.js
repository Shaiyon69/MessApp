import test from 'node:test'
import assert from 'node:assert/strict'
import { createSignedUrlCache, getFreshSignedUrl, putSignedUrl, withSignedUrlCache } from './signedUrlCache.js'

const TTL = 3600
const T0 = 1_000_000

test('a cached URL is returned without minting again', async () => {
  const cache = createSignedUrlCache()
  let mints = 0
  const mint = async () => { mints += 1; return `signed-${mints}` }

  assert.equal(await withSignedUrlCache(cache, 'a/b.png', TTL, mint, T0), 'signed-1')
  assert.equal(await withSignedUrlCache(cache, 'a/b.png', TTL, mint, T0 + 1000), 'signed-1')
  assert.equal(mints, 1)
})

test('concurrent callers for one path share a single mint', async () => {
  const cache = createSignedUrlCache()
  let mints = 0
  const mint = async () => { mints += 1; return 'signed' }

  const results = await Promise.all([
    withSignedUrlCache(cache, 'a/b.png', TTL, mint, T0),
    withSignedUrlCache(cache, 'a/b.png', TTL, mint, T0),
    withSignedUrlCache(cache, 'a/b.png', TTL, mint, T0)
  ])
  assert.deepEqual(results, ['signed', 'signed', 'signed'])
  assert.equal(mints, 1)
})

test('distinct paths do not share an entry', async () => {
  const cache = createSignedUrlCache()
  let mints = 0
  const mint = async () => `signed-${++mints}`

  assert.equal(await withSignedUrlCache(cache, 'a.png', TTL, mint, T0), 'signed-1')
  assert.equal(await withSignedUrlCache(cache, 'b.png', TTL, mint, T0), 'signed-2')
})

test('entries retire before the URL itself expires', async () => {
  const cache = createSignedUrlCache()
  let mints = 0
  const mint = async () => `signed-${++mints}`

  await withSignedUrlCache(cache, 'a.png', TTL, mint, T0)
  // 5 minutes before the hour is up the entry is already gone, so the URL
  // handed to a caller always has real life left on it.
  const justInsideMargin = T0 + (TTL - 5 * 60) * 1000
  assert.equal(await withSignedUrlCache(cache, 'a.png', TTL, mint, justInsideMargin), 'signed-2')
  assert.equal(mints, 2)
})

test('a failed mint is evicted so the next caller retries', async () => {
  const cache = createSignedUrlCache()
  let attempts = 0
  const mint = async () => {
    attempts += 1
    if (attempts === 1) throw new Error('storage unavailable')
    return 'signed'
  }

  await assert.rejects(() => withSignedUrlCache(cache, 'a.png', TTL, mint, T0), /storage unavailable/)
  assert.equal(await withSignedUrlCache(cache, 'a.png', TTL, mint, T0), 'signed')
  assert.equal(attempts, 2)
})

test('a TTL shorter than the safety margin is never cached', async () => {
  const cache = createSignedUrlCache()
  let mints = 0
  const mint = async () => `signed-${++mints}`

  await withSignedUrlCache(cache, 'a.png', 60, mint, T0)
  await withSignedUrlCache(cache, 'a.png', 60, mint, T0)
  assert.equal(mints, 2)
  assert.equal(cache.size, 0)
})

test('getFreshSignedUrl drops an expired entry instead of returning it', () => {
  const cache = createSignedUrlCache()
  putSignedUrl(cache, 'a.png', 'signed', TTL, T0)
  assert.equal(getFreshSignedUrl(cache, 'a.png', T0 + 1000), 'signed')
  assert.equal(getFreshSignedUrl(cache, 'a.png', T0 + TTL * 1000), null)
  assert.equal(cache.size, 0)
})
