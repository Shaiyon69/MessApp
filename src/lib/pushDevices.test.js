import assert from 'node:assert/strict'
import test from 'node:test'
import { getInstallationId, getPushPlatform, PUSH_INSTALLATION_ID_KEY, upsertPushDevice } from './pushDevices.js'

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

test('push registration uses the authenticated ownership-transfer RPC', async () => {
  const calls = []
  const client = {
    rpc: async (name, values) => {
      calls.push({ name, values })
      return { data: { refreshed: true, reenabled: false }, error: null }
    }
  }
  const result = await upsertPushDevice({
    profileId: 'profile-a',
    installationId: 'installation-0001',
    platform: 'android',
    pushToken: 'provider-token',
    client
  })
  assert.equal(result.refreshed, true)
  assert.deepEqual(calls, [{
    name: 'register_push_device',
    values: {
      target_installation_id: 'installation-0001',
      target_platform: 'android',
      target_push_token: 'provider-token'
    }
  }])
})
