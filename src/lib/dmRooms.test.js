import test from 'node:test'
import assert from 'node:assert/strict'
import { getDmRoomErrorMessage, getOrCreateDmRoom } from './dmRooms.js'

test('getOrCreateDmRoom calls the RPC once and returns its room ID', async () => {
  const calls = []
  const client = {
    rpc: async (...args) => {
      calls.push(args)
      return { data: { id: 'room-123', theme_color: '#6366f1' }, error: null }
    }
  }

  assert.equal(await getOrCreateDmRoom('peer-456', client), 'room-123')
  assert.deepEqual(calls, [['create_or_get_dm', { peer_id: 'peer-456' }]])
})

test('getOrCreateDmRoom rejects a successful response without a room ID', async () => {
  const client = { rpc: async () => ({ data: {}, error: null }) }
  await assert.rejects(getOrCreateDmRoom('peer-456', client), /invalid room/)
})

test('getOrCreateDmRoom rejects an RPC error and never invents a room', async () => {
  const rpcError = { code: '42501', message: 'permission denied' }
  const client = { rpc: async () => ({ data: null, error: rpcError }) }
  await assert.rejects(getOrCreateDmRoom('peer-456', client), error => error === rpcError)
})

test('DM errors expose useful bounded messages', () => {
  assert.match(getDmRoomErrorMessage({ message: 'DM blocked by relationship' }), /blocked/)
  assert.match(getDmRoomErrorMessage({ message: 'accepted friendship required' }), /accepted friend/)
  assert.match(getDmRoomErrorMessage({ code: '42501', message: 'denied' }), /permission/)
})
