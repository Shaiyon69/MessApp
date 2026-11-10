import assert from 'node:assert/strict'
import test from 'node:test'
import { configureNativePushRegistration, getInstallationId, getPushPlatform, PUSH_INSTALLATION_ID_KEY, upsertPushDevice, urlBase64ToBytes } from './pushDevices.js'

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

test('VAPID public key decodes from base64url', () => {
  assert.deepEqual(Array.from(urlBase64ToBytes('_-8')), [255, 239])
})

// A stand-in for @tauri-apps/api/core and the messapp-push plugin on Tauri Android.
const fakeTauri = ({ permission = 'granted', afterRequest = 'granted', launch = null, token = 'fcm-token' } = {}) => {
  const calls = []
  const listeners = {}
  return {
    calls,
    listeners,
    core: {
      invoke: async (command, args) => {
        calls.push(command.replace('plugin:messapp-push|', ''))
        if (command.endsWith('|permission_state')) return { receive: permission }
        if (command.endsWith('|request_permission')) return { receive: afterRequest }
        if (command.endsWith('|take_launch_action')) return { data: launch }
        if (command.endsWith('|register')) return { token }
        if (command.endsWith('|create_channel')) {
          assert.deepEqual(args, { id: 'messages', name: 'Messages', description: 'Direct messages and server activity' })
          return null
        }
        throw new Error(`unexpected ${command}`)
      },
      addPluginListener: async (plugin, event, handler) => {
        assert.equal(plugin, 'messapp-push')
        listeners[event] = handler
        return { unregister: async () => { delete listeners[event] } }
      }
    }
  }
}

const rpcClient = () => {
  const tokens = []
  return {
    tokens,
    rpc: async (_name, values) => {
      tokens.push([values.target_platform, values.target_push_token])
      return { data: { refreshed: false }, error: null }
    },
    from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) })
  }
}

test('Tauri Android push reports the platform as android', () => {
  assert.equal(getPushPlatform({ getPlatform: () => 'web' }, true), 'android')
})

test('Tauri Android push registers the FCM token as an android device', async () => {
  const { stopNativePushRegistration } = await import('./pushDevices.js')
  const tauri = fakeTauri()
  const client = rpcClient()
  const result = await configureNativePushRegistration({ profileId: 'profile-a', client, tauriCore: tauri.core })
  assert.equal(result.permission, 'granted')
  assert.deepEqual(tauri.calls, ['permission_state', 'create_channel', 'take_launch_action', 'register'])
  assert.deepEqual(client.tokens, [['android', 'fcm-token']])
  // A refreshed token from the FCM service is saved too.
  tauri.listeners.token({ token: 'fcm-token-2' })
  await new Promise(resolve => globalThis.setTimeout(resolve, 0))
  assert.deepEqual(client.tokens.at(-1), ['android', 'fcm-token-2'])
  await stopNativePushRegistration()
  assert.deepEqual(Object.keys(tauri.listeners), [])
})

test('Tauri Android push asks only when requested, and stops when denied', async () => {
  const quiet = fakeTauri({ permission: 'prompt' })
  const notAsked = await configureNativePushRegistration({ profileId: 'profile-b', client: rpcClient(), tauriCore: quiet.core })
  assert.equal(notAsked.permission, 'prompt')
  assert.deepEqual(quiet.calls, ['permission_state'])

  const denied = fakeTauri({ permission: 'prompt', afterRequest: 'denied' })
  const client = rpcClient()
  const result = await configureNativePushRegistration({ profileId: 'profile-b', requestPermission: true, client, tauriCore: denied.core })
  assert.equal(result.permission, 'denied')
  assert.deepEqual(denied.calls, ['permission_state', 'request_permission'])
  assert.deepEqual(client.tokens, [])
})

test('a tap that cold-started the app is routed once listeners exist', async () => {
  const { stopNativePushRegistration } = await import('./pushDevices.js')
  const { PUSH_NAVIGATION_EVENT } = await import('./pushNavigation.js')
  const seen = []
  const target = new EventTarget()
  const previous = globalThis.window
  globalThis.window = target
  target.addEventListener(PUSH_NAVIGATION_EVENT, event => seen.push(event.detail))
  try {
    const room = '11111111-2222-4333-8444-555555555555'
    const tauri = fakeTauri({ launch: { type: 'dm_message', dm_room_id: room } })
    await configureNativePushRegistration({ profileId: 'profile-c', client: rpcClient(), tauriCore: tauri.core })
    await stopNativePushRegistration()
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.dmRoomId, room)
  } finally {
    globalThis.window = previous
  }
})
