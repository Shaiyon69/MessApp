import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_WALLPAPERS,
  DEFAULT_CHAT_WALLPAPER,
  getChatWallpaper,
  getCustomWallpaperPath,
  isCustomWallpaperValue,
  normalizeChatWallpaper,
  validateCustomWallpaperFile
} from './chatWallpapers.js'

const customPath = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/wallpaper-33333333-3333-4333-8333-333333333333.webp'

test('wallpaper ids are unique and include a clean option', () => {
  assert.equal(new Set(CHAT_WALLPAPERS.map(wallpaper => wallpaper.id)).size, CHAT_WALLPAPERS.length)
  assert.ok(CHAT_WALLPAPERS.length >= 10)
  assert.equal(getChatWallpaper('none').css, 'none')
})

test('unknown values fall back without accepting CSS or URLs', () => {
  assert.equal(normalizeChatWallpaper('url(https://example.com/image.png)'), DEFAULT_CHAT_WALLPAPER)
  assert.equal(normalizeChatWallpaper('unknown'), DEFAULT_CHAT_WALLPAPER)
})

test('custom tokens only accept the protected storage path format', () => {
  const value = `custom:${customPath}`
  assert.equal(isCustomWallpaperValue(value), true)
  assert.equal(getCustomWallpaperPath(value), customPath)
  assert.equal(isCustomWallpaperValue('custom:https://example.com/image.png'), false)
  assert.equal(isCustomWallpaperValue('custom:../../image.png'), false)
})

test('custom files are limited by type and original size', () => {
  assert.equal(validateCustomWallpaperFile({ type: 'image/jpeg', size: 1024 }), true)
  assert.throws(() => validateCustomWallpaperFile({ type: 'image/svg+xml', size: 1024 }), /JPG, PNG, or WebP/)
  assert.throws(() => validateCustomWallpaperFile({ type: 'image/png', size: 11 * 1024 * 1024 }), /10 MB/)
})
