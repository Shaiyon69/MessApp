import test from 'node:test'
import assert from 'node:assert/strict'
import { NOT_IN_CHIMAERA, chimaeraChannelName, playtimeLabel, toGamePresence } from './chimaeraPresence.js'

const game = { title: 'Portal 2', objectId: '620', shop: 'steam', iconUrl: null }
const STEAM_COVER = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/header.jpg'

test('matches the channel name Chimaera tracks on', () => {
  assert.equal(chimaeraChannelName('u1'), 'chimaera-presence-u1')
})

test('no entries means not in Chimaera', () => {
  assert.deepEqual(toGamePresence([]), NOT_IN_CHIMAERA)
  assert.deepEqual(toGamePresence(undefined), NOT_IN_CHIMAERA)
})

test('the newest entry wins', () => {
  const entries = [{ playing: game, since: 2 }, { playing: null, since: 1 }]
  assert.deepEqual(toGamePresence(entries), { online: true, playing: { title: 'Portal 2', startedAt: null, iconUrl: null, coverUrl: STEAM_COVER } })
  assert.deepEqual(toGamePresence(entries.reverse()), { online: true, playing: { title: 'Portal 2', startedAt: null, iconUrl: null, coverUrl: STEAM_COVER } })
})

test('sharing off still counts as online', () => {
  assert.deepEqual(toGamePresence([{ playing: null, since: 1 }]), { online: true, playing: null })
})

test('junk payloads never become a game', () => {
  for (const playing of [{ title: 5, objectId: '1' }, { title: 'x' }, { title: '   ', objectId: '1' }, 'Portal', [game]]) {
    assert.deepEqual(toGamePresence([{ playing, since: 1 }]), { online: true, playing: null }, JSON.stringify(playing))
  }
  assert.deepEqual(toGamePresence([null]), { online: true, playing: null })
})

test('titles are cleaned and capped like status notes', () => {
  const { playing } = toGamePresence([{ playing: { ...game, title: `  A\nB${'x'.repeat(200)}` }, since: 1 }])
  assert.equal(playing.title.startsWith('A B'), true)
  assert.equal(playing.title.length, 80)
})

test('keeps a valid start time and drops junk', () => {
  const at = startedAt => toGamePresence([{ playing: { ...game, startedAt }, since: 1 }], 1_000_000).playing.startedAt
  assert.equal(at(500_000), 500_000)
  for (const junk of ['500000', -1, 9_000_000_000, NaN, null]) assert.equal(at(junk), null, String(junk))
})

test('formats elapsed playtime', () => {
  assert.equal(playtimeLabel(null, 0), null)
  assert.equal(playtimeLabel(1, 30_001), null)
  assert.equal(playtimeLabel(1, 12 * 60_000 + 1), '12m')
  assert.equal(playtimeLabel(1, 65 * 60_000 + 1), '1h 05m')
})

test('icons must be https; other shops take their colour from the icon', () => {
  const at = playing => toGamePresence([{ playing: { ...game, ...playing }, since: 1 }]).playing
  for (const iconUrl of ['http://x.test/a.png', 'local:/C:/a.png', 'data:image/png;base64,AA', 5]) assert.equal(at({ iconUrl }).iconUrl, null, String(iconUrl))
  const custom = at({ shop: 'custom', objectId: 'gog-1', iconUrl: 'https://cdn.test/i.png' })
  assert.equal(custom.iconUrl, 'https://cdn.test/i.png')
  assert.equal(custom.coverUrl, 'https://cdn.test/i.png')
  assert.equal(at({ objectId: '../x' }).coverUrl, null)
})
