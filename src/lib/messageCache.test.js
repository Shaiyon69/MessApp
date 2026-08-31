import test from 'node:test'
import assert from 'node:assert/strict'
import { safeCacheLoad, safeCacheSave } from './messageCache.js'

const store = new Map()
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: key => { store.delete(key) }
}

const roundTrip = (messages) => {
  store.clear()
  safeCacheSave('user-1', 'room-1', messages)
  return safeCacheLoad('user-1', 'room-1')
}

const message = (overrides) => ({ id: 'm1', content: 'hi', message_attachments: [], ...overrides })

test('failed text message survives with its retry payload', () => {
  const [restored] = roundTrip([message({
    __local: true,
    __delivery_status: 'failed',
    __retry_payload: { type: 'text', text: 'hi', isSpoiler: false }
  })])

  assert.equal(restored.__delivery_status, 'failed')
  assert.deepEqual(restored.__retry_payload, { type: 'text', text: 'hi', isSpoiler: false })
})

test('in-flight message is dropped so it cannot be sent twice', () => {
  const restored = roundTrip([message({
    __local: true,
    __delivery_status: 'sending',
    __retry_payload: { type: 'text', text: 'hi' }
  })])

  assert.deepEqual(restored, [])
})

test('failed attachment message is dropped because File objects do not serialize', () => {
  const restored = roundTrip([message({
    __local: true,
    __delivery_status: 'failed',
    __retry_payload: { type: 'attachments', items: [{ file: {} }] }
  })])

  assert.deepEqual(restored, [])
})

test('delivered message keeps no local delivery bookkeeping', () => {
  const [restored] = roundTrip([message({ __delivery_status: 'sent' })])

  assert.equal('__delivery_status' in restored, false)
  assert.equal('__local' in restored, false)
  assert.equal('__retry_payload' in restored, false)
})
