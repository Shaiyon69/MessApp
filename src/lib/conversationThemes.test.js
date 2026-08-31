import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONVERSATION_THEMES,
  DEFAULT_CONVERSATION_THEME,
  getConversationTheme,
  getConversationThemeStyle,
  isConversationThemeSchemaError,
  resolveConversationThemeId,
  normalizeConversationThemeId
} from './conversationThemes.js'

test('conversation themes expose complete light and dark palettes', () => {
  assert.equal(CONVERSATION_THEMES.length, 6)
  for (const theme of CONVERSATION_THEMES) {
    for (const mode of ['light', 'dark']) {
      const { palette } = getConversationTheme(theme.id, mode)
      for (const requiredToken of ['accent', 'base', 'border', 'element', 'muted', 'outgoingText', 'surface', 'text']) {
        assert.ok(palette[requiredToken], `${theme.id} ${mode} is missing ${requiredToken}`)
      }
    }
  }
})

test('unknown theme ids safely use the monochrome default', () => {
  assert.equal(normalizeConversationThemeId('unknown'), DEFAULT_CONVERSATION_THEME)
  assert.equal(getConversationThemeStyle('unknown', 'dark')['--chat-bg-base'], '#000000')
})

test('light and dark modes use separate readable outgoing colors', () => {
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-outgoing-bg'], '#000000')
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-outgoing-border'], '#303030')
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-outgoing-text'], '#fafafa')
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-control-bg'], '#000000')
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-control-border'], '#303030')
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-control-text'], '#fafafa')
  assert.equal(getConversationThemeStyle('mono', 'light')['--chat-outgoing-text'], '#ffffff')
  assert.notEqual(
    getConversationThemeStyle('ocean', 'light')['--chat-bg-element'],
    getConversationThemeStyle('ocean', 'dark')['--chat-bg-element']
  )
})

test('accent-filled controls never label themselves in their own accent', () => {
  // Mono dark is #f5f5f5, so an accent fill with white text is white on white:
  // the palette answers with a black fill and a near-white glyph instead.
  for (const theme of CONVERSATION_THEMES) {
    for (const mode of ['light', 'dark']) {
      const style = getConversationThemeStyle(theme.id, mode)
      assert.notEqual(style['--chat-control-bg'], style['--chat-control-text'], `${theme.id} ${mode}`)
    }
  }
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-control-bg'], '#000000')
  assert.equal(getConversationThemeStyle('mono', 'dark')['--chat-control-text'], '#fafafa')
})

test('legacy DM colors resolve to the closest conversation theme', () => {
  assert.equal(resolveConversationThemeId(null, '#6366F1'), 'lavender')
  assert.equal(resolveConversationThemeId(null, '#10b981'), 'forest')
  assert.equal(resolveConversationThemeId('ocean', '#f43f5e'), 'ocean')
})

test('persisted light and dark accents restore every conversation theme', () => {
  for (const theme of CONVERSATION_THEMES) {
    for (const mode of ['light', 'dark']) {
      const accent = getConversationTheme(theme.id, mode).palette.accent
      assert.equal(resolveConversationThemeId(null, accent), theme.id)
    }
  }
})

test('theme schema errors are distinguished from permission and network errors', () => {
  assert.equal(isConversationThemeSchemaError({ code: '42703', message: 'column dm_rooms.theme_id does not exist' }), true)
  assert.equal(isConversationThemeSchemaError({ code: '42501', message: 'permission denied' }), false)
  assert.equal(isConversationThemeSchemaError({ message: 'Failed to fetch' }), false)
})
