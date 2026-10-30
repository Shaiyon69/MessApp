import test from 'node:test'
import assert from 'node:assert/strict'
import { createKeyStore } from './keyStore.js'

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    data
  }
}

// Stands in for tauri-plugin-skibi; re-serializes like the Rust side (adds ext/key_ops).
const fakeVault = ({ failSave = false } = {}) => {
  const users = new Map()
  const reserialize = s => JSON.stringify({ ...JSON.parse(s), ext: true, key_ops: [] })
  const calls = []
  const invoke = async (cmd, { uid, keys }) => {
    calls.push(cmd)
    if (cmd === 'plugin:skibi|keys_load') return structuredClone(users.get(uid) || { private: null, public: null, legacy: [] })
    if (cmd === 'plugin:skibi|keys_save') {
      if (failSave) throw new Error('vault down')
      users.set(uid, {
        private: keys.private && reserialize(keys.private),
        public: keys.public && reserialize(keys.public),
        legacy: keys.legacy.map(reserialize)
      })
    }
  }
  return { invoke, users, calls }
}

const priv = (n) => JSON.stringify({ kty: 'EC', crv: 'P-256', x: `x${n}`, y: `y${n}`, d: `d${n}` })
const pub = (n) => JSON.stringify({ kty: 'EC', crv: 'P-256', x: `x${n}`, y: `y${n}` })

test('migrates plaintext keys into the vault and removes them from localStorage', async () => {
  const storage = memoryStorage({
    e2ee_private_key_u1: priv(1),
    e2ee_public_key_u1: pub(1),
    e2ee_legacy_keys_u1: JSON.stringify([JSON.parse(priv(0))]),
    e2ee_force_new_key_u1: 'true'
  })
  const vault = fakeVault()
  const store = createKeyStore({ storage, invoke: vault.invoke })
  await store.hydrate('u1')

  assert.equal(store.isSecure('u1'), true)
  assert.equal(storage.getItem('e2ee_private_key_u1'), null)
  assert.equal(storage.getItem('e2ee_legacy_keys_u1'), null)
  assert.equal(storage.getItem('e2ee_force_new_key_u1'), 'true', 'non-secret flags stay in localStorage')
  assert.equal(JSON.parse(store.getItem('e2ee_private_key_u1')).d, 'd1')
  assert.equal(JSON.parse(store.getItem('e2ee_legacy_keys_u1'))[0].d, 'd0')
})

test('writes go to the vault in order and survive a fresh hydrate', async () => {
  const storage = memoryStorage()
  const vault = fakeVault()
  const store = createKeyStore({ storage, invoke: vault.invoke })
  await store.hydrate('u1')
  assert.equal(store.getItem('e2ee_private_key_u1'), null)

  store.setItem('e2ee_private_key_u1', priv(2))
  store.setItem('e2ee_public_key_u1', pub(2))
  await store.flush()
  assert.equal(storage.data.size, 0, 'nothing plaintext')

  const again = createKeyStore({ storage, invoke: vault.invoke })
  await again.hydrate('u1')
  assert.equal(JSON.parse(again.getItem('e2ee_private_key_u1')).d, 'd2')
  assert.equal(JSON.parse(again.getItem('e2ee_public_key_u1')).x, 'x2')
})

test('a failed save falls back to localStorage so the key is never lost', async () => {
  const storage = memoryStorage()
  const errors = []
  const vault = fakeVault({ failSave: true })
  const store = createKeyStore({ storage, invoke: vault.invoke, onError: e => errors.push(e) })
  await store.hydrate('u1')
  store.setItem('e2ee_private_key_u1', priv(3))
  await store.flush()
  assert.equal(storage.getItem('e2ee_private_key_u1'), priv(3))
  assert.equal(errors.length, 1)
})

test('a failed migration keeps localStorage untouched', async () => {
  const storage = memoryStorage({ e2ee_private_key_u1: priv(1) })
  const vault = fakeVault({ failSave: true })
  const store = createKeyStore({ storage, invoke: vault.invoke, onError: () => {} })
  await store.hydrate('u1')
  assert.equal(store.isSecure('u1'), false)
  assert.equal(store.getItem('e2ee_private_key_u1'), priv(1))
})

test('without Tauri everything stays in localStorage, and other users are not managed', async () => {
  const storage = memoryStorage()
  const web = createKeyStore({ storage, invoke: null })
  await web.hydrate('u1')
  web.setItem('e2ee_private_key_u1', priv(4))
  assert.equal(storage.getItem('e2ee_private_key_u1'), priv(4))

  const vault = fakeVault()
  const desktop = createKeyStore({ storage: memoryStorage(), invoke: vault.invoke })
  await desktop.hydrate('u1')
  desktop.setItem('e2ee_private_key_u2', priv(5))
  assert.equal(vault.users.has('u2'), false)
})

test('different keys in vault and localStorage: vault wins, plaintext copy kept', async () => {
  const storage = memoryStorage({ e2ee_private_key_u1: priv(1) })
  const vault = fakeVault()
  vault.users.set('u1', { private: priv(9), public: pub(9), legacy: [] })
  const store = createKeyStore({ storage, invoke: vault.invoke })
  await store.hydrate('u1')
  assert.equal(JSON.parse(store.getItem('e2ee_private_key_u1')).d, 'd9')
  assert.equal(storage.getItem('e2ee_private_key_u1'), priv(1))
})
