import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { linkPurrch } from './purrchLink.js'

const args = { uid: 'u1', url: 'https://x.supabase.co', anonKey: 'k' }

describe('linkPurrch', () => {
  it('stores the token hash through the plugin', async () => {
    const calls = []
    const supabase = { functions: { invoke: async () => ({ data: { token_hash: 'h1' }, error: null }) } }
    await linkPurrch({ ...args, supabase, invoke: async (...a) => { calls.push(a) } })
    assert.deepEqual(calls, [['plugin:shaiyon|store_purrch_link', { uid: 'u1', tokenHash: 'h1', url: 'https://x.supabase.co', anonKey: 'k' }]])
  })

  it('rejects with the function error and never stores', async () => {
    let called = false
    const supabase = { functions: { invoke: async () => ({ data: { error: 'nope' }, error: new Error('non-2xx') }) } }
    await assert.rejects(linkPurrch({ ...args, supabase, invoke: async () => { called = true } }), { message: 'nope' })
    assert.equal(called, false)
  })

  it('falls back to a generic message', async () => {
    const supabase = { functions: { invoke: async () => ({ data: null, error: new Error('x') }) } }
    await assert.rejects(linkPurrch({ ...args, supabase, invoke: async () => {} }), { message: 'Could not link Purrch' })
  })
})
