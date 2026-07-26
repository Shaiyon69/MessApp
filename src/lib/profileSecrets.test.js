import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isMissingProfileSecretsRpc,
  loadMyProfileSecrets,
  saveMyProfileKeyBackup
} from './profileSecrets.js'

const missingRpc = {
  code: 'PGRST202',
  message: 'Could not find the function public.get_my_profile_secrets in the schema cache'
}

describe('profile secret repository', () => {
  it('uses the self-only RPC without reading the profiles table', async () => {
    let tableReads = 0
    const client = {
      rpc: async () => ({ data: [{ encrypted_private_key: 'encrypted', public_key: 'public' }], error: null }),
      from: () => {
        tableReads += 1
        throw new Error('unexpected table read')
      }
    }

    const result = await loadMyProfileSecrets(client, 'profile-1')
    assert.equal(result.data.encrypted_private_key, 'encrypted')
    assert.equal(result.legacyFallback, false)
    assert.equal(tableReads, 0)
  })

  it('falls back to the legacy self-profile query only when the RPC is missing', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { encrypted_private_key: 'legacy' }, error: null })
    }
    const client = { rpc: async () => ({ data: null, error: missingRpc }), from: () => query }

    const result = await loadMyProfileSecrets(client, 'profile-1')
    assert.equal(result.data.encrypted_private_key, 'legacy')
    assert.equal(result.legacyFallback, true)
  })

  it('does not bypass ordinary authorization or network errors', async () => {
    let tableReads = 0
    const denied = { code: '42501', message: 'permission denied' }
    const client = {
      rpc: async () => ({ data: null, error: denied }),
      from: () => {
        tableReads += 1
        throw new Error('unexpected fallback')
      }
    }

    const result = await loadMyProfileSecrets(client, 'profile-1')
    assert.equal(result.error, denied)
    assert.equal(result.legacyFallback, false)
    assert.equal(tableReads, 0)
  })

  it('uses the backup RPC and recognizes both PostgREST missing-function codes', async () => {
    let args
    const client = {
      rpc: async (name, payload) => {
        args = { name, payload }
        return { data: null, error: null }
      }
    }
    const result = await saveMyProfileKeyBackup(client, {
      profileId: 'profile-1',
      encryptedPrivateKey: 'encrypted',
      publicKey: 'public'
    })

    assert.equal(args.name, 'save_my_profile_key_backup')
    assert.equal(args.payload.new_encrypted_private_key, 'encrypted')
    assert.equal(result.legacyFallback, false)
    assert.equal(isMissingProfileSecretsRpc({ code: '42883' }), true)
  })
})
