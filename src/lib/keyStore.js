/**
 * Where E2EE keys live. In the Tauri desktop app they move out of plaintext
 * localStorage into OS secure storage (tauri-plugin-shaiyon). The rest of the app
 * keeps its synchronous getItem/setItem calls: `hydrate` loads the keys once
 * per user, and writes go to memory first, then to secure storage in order.
 * On the web and on mobile, or whenever secure storage fails, keys stay in
 * localStorage exactly as before, so a failure can never lose a key.
 */
import { isTauri, invoke as tauriInvoke } from '@tauri-apps/api/core'
import { debug } from './debug.js'

const FIELDS = {
  e2ee_private_key_: 'private',
  e2ee_public_key_: 'public',
  e2ee_legacy_keys_: 'legacy'
}

const emptyKeys = () => ({ private: null, public: null, legacy: [] })

const field = (name) => {
  for (const [prefix, key] of Object.entries(FIELDS)) {
    if (name.startsWith(prefix)) return { key, uid: name.slice(prefix.length) }
  }
  return null
}

const nameFor = (key, uid) => Object.keys(FIELDS).find(prefix => FIELDS[prefix] === key) + uid

// The vault re-serializes JWKs, so compare key material rather than strings.
export const sameJwk = (a, b) => {
  if (!a || !b) return a === b
  const x = JSON.parse(a)
  const y = JSON.parse(b)
  return x.x === y.x && x.y === y.y && (x.d || null) === (y.d || null)
}

export const sameKeys = (a, b) => (
  sameJwk(a.private, b.private) &&
  sameJwk(a.public, b.public) &&
  a.legacy.length === b.legacy.length &&
  a.legacy.every((key, i) => sameJwk(key, b.legacy[i]))
)

export function createKeyStore({ storage, invoke, onError = () => {} }) {
  let vault = null // { uid, keys } while secure storage is active for that user
  let writes = Promise.resolve()

  const readLocal = (uid) => {
    const legacy = storage.getItem(nameFor('legacy', uid))
    return {
      private: storage.getItem(nameFor('private', uid)),
      public: storage.getItem(nameFor('public', uid)),
      legacy: legacy ? JSON.parse(legacy).map(jwk => JSON.stringify(jwk)) : []
    }
  }

  const removeLocal = (uid) => {
    for (const key of Object.values(FIELDS)) storage.removeItem(nameFor(key, uid))
  }

  const managed = (name) => {
    const f = field(name)
    return f && vault && f.uid === vault.uid ? f : null
  }

  /* Each save sends the newest keys at the moment it runs, one at a time, so two
     quick setItem calls can't land out of order. If a save fails, the value also
     goes to localStorage; the next hydrate migrates it again. */
  const persist = (name, value) => {
    // Bound to this user's vault object: a later hydrate for someone else can't redirect the write.
    const target = vault
    writes = writes
      .then(() => invoke('plugin:shaiyon|keys_save', { uid: target.uid, keys: target.keys }))
      .catch(error => {
        if (value === null) storage.removeItem(name)
        else storage.setItem(name, value)
        onError(error)
      })
    return writes
  }

  return {
    /** Call once a user is known, before anything reads their keys. */
    async hydrate(uid) {
      vault = null
      if (!invoke || !uid) return
      try {
        const stored = await invoke('plugin:shaiyon|keys_load', { uid })
        const local = readLocal(uid)
        if (!stored.private && local.private) {
          await invoke('plugin:shaiyon|keys_save', { uid, keys: local })
          const check = await invoke('plugin:shaiyon|keys_load', { uid })
          if (!sameKeys(check, local)) throw new Error('secure storage read-back did not match')
          removeLocal(uid)
          vault = { uid, keys: check }
          return
        }
        // Only drop the plaintext copy when it holds the same keys; otherwise keep both.
        if (local.private && sameKeys(stored, local)) removeLocal(uid)
        vault = { uid, keys: { ...emptyKeys(), ...stored } }
      } catch (error) {
        vault = null
        onError(error)
      }
    },

    /** True when this user's keys are in OS secure storage. */
    isSecure(uid) {
      return Boolean(vault && vault.uid === uid)
    },

    getItem(name) {
      const f = managed(name)
      if (!f) return storage.getItem(name)
      if (f.key !== 'legacy') return vault.keys[f.key]
      return vault.keys.legacy.length ? `[${vault.keys.legacy.join(',')}]` : null
    },

    setItem(name, value) {
      const f = managed(name)
      if (!f) return storage.setItem(name, value)
      vault.keys[f.key] = f.key === 'legacy'
        ? JSON.parse(value).map(jwk => JSON.stringify(jwk))
        : String(value)
      persist(name, value)
    },

    removeItem(name) {
      const f = managed(name)
      if (!f) return storage.removeItem(name)
      vault.keys[f.key] = f.key === 'legacy' ? [] : null
      persist(name, null)
    },

    /** Deletes the user's keys from secure storage (account deletion). */
    async forget(uid) {
      if (vault?.uid === uid) vault = null
      if (!invoke || !uid) return
      await writes
      await invoke('plugin:shaiyon|keys_clear', { uid }).catch(onError)
    },

    /** Resolves after queued secure-storage writes finish (tests, sign-out). */
    flush() {
      return writes
    }
  }
}

export const keyStore = createKeyStore({
  storage: globalThis.localStorage,
  invoke: isTauri() ? tauriInvoke : null,
  onError: (error) => debug.warn('KEY_STORE', { operation: 'secure-storage-fallback', error })
})
