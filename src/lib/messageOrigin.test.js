import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ORIGIN_FILTERS, matchesOrigin, messageOrigin, readOriginFilter, stepOriginFilter } from './messageOrigin.js'

describe('messageOrigin', () => {
  it('treats rows without the column as messapp', () => {
    assert.equal(messageOrigin({}), 'messapp')
    assert.equal(messageOrigin({ origin: 'chimaera' }), 'chimaera')
  })

  it('all shows both, the others show only their own', () => {
    const mine = { origin: 'messapp' }
    const theirs = { origin: 'chimaera' }

    assert.ok(matchesOrigin(mine, 'all') && matchesOrigin(theirs, 'all'))
    assert.ok(matchesOrigin(mine, 'messapp') && !matchesOrigin(theirs, 'messapp'))
    assert.ok(matchesOrigin(theirs, 'chimaera') && !matchesOrigin(mine, 'chimaera'))
  })

  it('purrch is its own origin', () => {
    assert.deepEqual(ORIGIN_FILTERS.map(f => f.id), ['all', 'messapp', 'chimaera', 'purrch'])
    assert.ok(matchesOrigin({ origin: 'purrch' }, 'purrch'))
    assert.ok(!matchesOrigin({ origin: 'purrch' }, 'messapp'))
  })

  it('falls back to all when storage is unavailable', () => {
    assert.equal(readOriginFilter(), 'all')
  })
})

describe('stepOriginFilter', () => {
  it('pages through the filters and clamps at the ends', () => {
    assert.equal(stepOriginFilter('all', 1), 'messapp')
    assert.equal(stepOriginFilter('messapp', 1), 'chimaera')
    assert.equal(stepOriginFilter('chimaera', 1), 'purrch')
    assert.equal(stepOriginFilter('purrch', 1), 'purrch')
    assert.equal(stepOriginFilter('all', -1), 'all')
  })
})
