import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createServerNotificationPreferencesRepository } from './serverNotificationPreferences.js'

const createQueryClient = result => {
  let calls = 0
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
    upsert: async () => result
  }

  return {
    client: {
      from: table => {
        calls += 1
        assert.equal(table, 'server_notification_preferences')
        return query
      }
    },
    getCalls: () => calls
  }
}

describe('server notification preferences repository', () => {
  it('does not query Supabase when the deployment capability is disabled', async () => {
    const { client, getCalls } = createQueryClient({ data: { muted: true }, error: null })
    const repository = createServerNotificationPreferencesRepository(client)

    assert.deepEqual(await repository.load('server-1', 'profile-1'), { unavailable: true })
    assert.deepEqual(await repository.upsert({ server_id: 'server-1' }), { unavailable: true })
    assert.equal(repository.isAvailable(), false)
    assert.equal(getCalls(), 0)
  })

  it('caches a missing-table response and suppresses later requests', async () => {
    const missingTable = {
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.server_notification_preferences' in the schema cache"
      }
    }
    const { client, getCalls } = createQueryClient(missingTable)
    const repository = createServerNotificationPreferencesRepository(client, { enabled: true })

    assert.deepEqual(await repository.load('server-1', 'profile-1'), { unavailable: true })
    assert.deepEqual(await repository.load('server-2', 'profile-1'), { unavailable: true })
    assert.deepEqual(await repository.upsert({ server_id: 'server-1' }), { unavailable: true })
    assert.equal(repository.isAvailable(), false)
    assert.equal(getCalls(), 1)
  })

  it('shares an in-flight load for React remounts using the same conversation', async () => {
    let resolveRequest
    const result = new Promise(resolve => { resolveRequest = resolve })
    const { client, getCalls } = createQueryClient(result)
    const repository = createServerNotificationPreferencesRepository(client, { enabled: true })

    const first = repository.load('server-1', 'profile-1')
    const second = repository.load('server-1', 'profile-1')
    assert.equal(first, second)
    assert.equal(getCalls(), 1)

    resolveRequest({ data: { muted: false }, error: null })
    assert.deepEqual(await first, { data: { muted: false }, error: null })
    assert.equal(repository.isAvailable(), true)
  })

  it('does not classify ordinary request failures as a missing table', async () => {
    const networkFailure = { data: null, error: { code: 'NETWORK_ERROR', message: 'Request failed' } }
    const { client, getCalls } = createQueryClient(networkFailure)
    const repository = createServerNotificationPreferencesRepository(client, { enabled: true })

    assert.deepEqual(await repository.load('server-1', 'profile-1'), networkFailure)
    assert.deepEqual(await repository.load('server-1', 'profile-1'), networkFailure)
    assert.equal(repository.isAvailable(), true)
    assert.equal(getCalls(), 2)
  })
})
