import assert from 'node:assert/strict'
import test from 'node:test'
import { filterMarkup, isLowPowerDevice } from './liquidGlass.js'

const passes = markup => markup.match(/<feDisplacementMap/g).length

test('glass filter splits channels unless mono', () => {
  assert.equal(passes(filterMarkup('a', 10, 10, 'data:', 4)), 3)
  assert.equal(passes(filterMarkup('b', 10, 10, 'data:', 4, true)), 1)
  assert.match(filterMarkup('b', 10, 10, 'data:', 4, true), /scale="4\.00"/)
})

test('isLowPowerDevice flags phones, Save-Data and small machines only', () => {
  const media = (coarse) => () => ({ matches: coarse })
  assert.equal(isLowPowerDevice({ hardwareConcurrency: 12, deviceMemory: 16 }, media(false)), false)
  assert.equal(isLowPowerDevice({ hardwareConcurrency: 12 }, media(true)), true)
  assert.equal(isLowPowerDevice({ hardwareConcurrency: 4 }, media(false)), true)
  assert.equal(isLowPowerDevice({ hardwareConcurrency: 8, deviceMemory: 2 }, media(false)), true)
  assert.equal(isLowPowerDevice({ hardwareConcurrency: 8, connection: { saveData: true } }, media(false)), true)
  assert.equal(isLowPowerDevice(undefined), false)
})
