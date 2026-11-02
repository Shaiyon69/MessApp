import test from 'node:test'
import assert from 'node:assert/strict'
import { clampListWidth, LIST_WIDTH_DEFAULT } from './listWidth.js'

test('clampListWidth keeps the column within its bounds', () => {
  assert.equal(clampListWidth(27.5), 27.5)
  assert.equal(clampListWidth(0), 18)
  assert.equal(clampListWidth(Infinity), 32)
  assert.equal(clampListWidth('garbage'), LIST_WIDTH_DEFAULT)
})
