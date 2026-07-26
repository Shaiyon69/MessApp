import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getPinKdfIterations,
  LEGACY_PIN_KDF_ITERATIONS,
  PIN_KDF_ITERATIONS
} from './crypto.js'

describe('PIN key derivation compatibility', () => {
  it('uses the hardened work factor for new encrypted key backups', () => {
    assert.equal(PIN_KDF_ITERATIONS, 600000)
    assert.equal(getPinKdfIterations(3), PIN_KDF_ITERATIONS)
  })

  it('keeps existing version 2 backups recoverable', () => {
    assert.equal(getPinKdfIterations(2), LEGACY_PIN_KDF_ITERATIONS)
    assert.equal(getPinKdfIterations(undefined), LEGACY_PIN_KDF_ITERATIONS)
  })
})
