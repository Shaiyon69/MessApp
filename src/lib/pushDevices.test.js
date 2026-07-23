import assert from 'node:assert/strict'
import test from 'node:test'
import { getInstallationId, getPushPlatform, PUSH_INSTALLATION_ID_KEY } from './pushDevices.js'

const createStorage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values
  }
}

test('installation identity is generated once and remains stable', () => {
  const storage = createStorage()
  const cryptoApi = { randomUUID: () => '11111111-2222-4333-8444-555555555555' }
  const first = getInstallationId(storage, cryptoApi)
  const second = getInstallationId(storage, { randomUUID: () => 'different-installation-id' })
  assert.equal(first, second)
  assert.equal(storage.values.get(PUSH_INSTALLATION_ID_KEY), first)
})

test('push platform is restricted to supported database labels', () => {
  assert.equal(getPushPlatform({ getPlatform: () => 'android' }), 'android')
  assert.equal(getPushPlatform({ getPlatform: () => 'ios' }), 'ios')
  assert.equal(getPushPlatform({ getPlatform: () => 'web' }), 'web')
  assert.equal(getPushPlatform({ getPlatform: () => 'electron' }), 'web')
})
