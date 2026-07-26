import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getFreshWallpaperCacheEntry,
  getWallpaperScopeKey,
  preloadWallpaperImage,
  resolveWallpaperUrl
} from './wallpaperRuntime.js'

test('wallpaper runtime keys isolate rooms using the same custom path shape', () => {
  assert.notEqual(
    getWallpaperScopeKey('room-a', 'user/room-a/wallpaper-one.webp'),
    getWallpaperScopeKey('room-b', 'user/room-b/wallpaper-one.webp')
  )
})

test('wallpaper cache returns only unexpired signed URLs', () => {
  const cache = new Map([
    ['fresh', { url: 'https://signed.example/fresh', expiresAt: 2000 }],
    ['expired', { url: 'https://signed.example/expired', expiresAt: 999 }]
  ])
  assert.equal(getFreshWallpaperCacheEntry(cache, 'fresh', 1000)?.url, 'https://signed.example/fresh')
  assert.equal(getFreshWallpaperCacheEntry(cache, 'expired', 1000), null)
})

test('switching back to a cached room resolves its wallpaper without waiting for state effects', () => {
  const cache = new Map([
    ['room-a:wallpapers/a.jpg', { url: 'blob:a', expiresAt: 2000 }]
  ])
  const previousRoomState = { scopeKey: 'room-b:wallpapers/b.jpg', url: 'blob:b' }

  assert.equal(
    resolveWallpaperUrl(cache, 'room-a:wallpapers/a.jpg', previousRoomState, 1000),
    'blob:a'
  )
  assert.equal(
    resolveWallpaperUrl(cache, 'room-c:wallpapers/c.jpg', previousRoomState, 1000),
    ''
  )
})

test('wallpaper URL is applied only after its image loads', async () => {
  class FakeImage {
    set src(value) {
      queueMicrotask(() => this.onload?.())
      this.value = value
    }
  }
  assert.equal(
    await preloadWallpaperImage('https://signed.example/wallpaper', FakeImage),
    'https://signed.example/wallpaper'
  )
})
