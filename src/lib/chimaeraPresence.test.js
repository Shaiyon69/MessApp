import test from 'node:test'
import assert from 'node:assert/strict'
import { NOT_IN_CHIMAERA, chimaeraChannelName, toGamePresence } from './chimaeraPresence.js'

const game = { title: 'Portal 2', objectId: '620', shop: 'steam', iconUrl: null }

test('matches the channel name Chimaera tracks on', () => {
  assert.equal(chimaeraChannelName('u1'), 'chimaera-presence-u1')
})

test('no entries means not in Chimaera', () => {
  assert.deepEqual(toGamePresence([]), NOT_IN_CHIMAERA)
  assert.deepEqual(toGamePresence(undefined), NOT_IN_CHIMAERA)
})

test('the newest entry wins', () => {
  const entries = [{ playing: game, since: 2 }, { playing: null, since: 1 }]
  assert.deepEqual(toGamePresence(entries), { online: true, playing: { title: 'Portal 2' } })
  assert.deepEqual(toGamePresence(entries.reverse()), { online: true, playing: { title: 'Portal 2' } })
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
