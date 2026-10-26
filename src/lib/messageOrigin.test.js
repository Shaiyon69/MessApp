import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { matchesOrigin, messageOrigin, readOriginFilter, stepOriginFilter } from './messageOrigin.js'

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

  it('falls back to all when storage is unavailable', () => {
    assert.equal(readOriginFilter(), 'all')
  })
})

describe('stepOriginFilter', () => {
  it('pages through the filters and clamps at the ends', () => {
    assert.equal(stepOriginFilter('all', 1), 'messapp')
    assert.equal(stepOriginFilter('messapp', 1), 'chimaera')
    assert.equal(stepOriginFilter('chimaera', 1), 'chimaera')
    assert.equal(stepOriginFilter('all', -1), 'all')
  })
})
