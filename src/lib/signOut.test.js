import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPreservedKeys } from './signOut.js'

/* The only branch worth a test: which keys survive the wipe. Getting this wrong
   destroys E2EE private keys, and the failure is silent until a user reopens a
   DM and finds it unreadable. */
function fakeStorage(entries) {
  const keys = Object.keys(entries)
  return {
    length: keys.length,
    key: (i) => keys[i],
    getItem: (k) => entries[k]
  }
}

test('preserves key material and preferences', () => {
  const preserved = collectPreservedKeys(fakeStorage({
    e2ee_private_key: 'secret',
    e2ee_room_abc: 'roomkey',
    appTheme: 'dark',
    surfaceTint: 'ocean',
    notificationsEnabled: 'true'
  }))
  assert.deepEqual(preserved, {
    e2ee_private_key: 'secret',
    e2ee_room_abc: 'roomkey',
    appTheme: 'dark',
    surfaceTint: 'ocean',
    notificationsEnabled: 'true'
  })
})

test('drops session state', () => {
  const preserved = collectPreservedKeys(fakeStorage({
    'last_dm_user-1': 'room-9',
    'restricted_user-1': '[]',
    'sb-auth-token': 'jwt',
    dm_list_cache: '[]'
  }))
  assert.deepEqual(preserved, {})
})

test('a key merely containing e2ee_ is not preserved', () => {
  const preserved = collectPreservedKeys(fakeStorage({ cache_e2ee_stuff: 'x' }))
  assert.deepEqual(preserved, {})
})
