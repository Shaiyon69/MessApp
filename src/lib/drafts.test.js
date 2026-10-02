import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDraftStore } from './drafts.js'

const memoryStorage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    values
  }
}

describe('draft store', () => {
  it('survives a reload and clears on empty text', () => {
    const storage = memoryStorage()
    createDraftStore(storage, 'drafts_u1').set('server:c1', 'half a thought')
    const reloaded = createDraftStore(storage, 'drafts_u1')
    assert.equal(reloaded.get('server:c1'), 'half a thought')
    reloaded.set('server:c1', '')
    assert.equal(storage.values.has('drafts_u1'), false)
  })

  it('ignores corrupt storage', () => {
    const storage = memoryStorage()
    storage.setItem('drafts_u1', '{not json')
    assert.equal(createDraftStore(storage, 'drafts_u1').get('home:d1'), '')
  })
})
