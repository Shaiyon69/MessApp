import test from 'node:test'
import assert from 'node:assert/strict'
import { stepRowIndex } from './conversationNav.js'

const rows = [{ unread: false }, { unread: true }, { unread: false }, { unread: true }]

test('steps to the neighbour row', () => {
  assert.equal(stepRowIndex(rows, 0, 1), 1)
  assert.equal(stepRowIndex(rows, 2, -1), 1)
})

test('skips read rows when stepping by unread', () => {
  assert.equal(stepRowIndex(rows, 1, 1, true), 3)
  assert.equal(stepRowIndex(rows, 3, -1, true), 1)
  assert.equal(stepRowIndex(rows, 3, 1, true), -1)
})

test('with no active row, down starts at the top and up at the bottom', () => {
  assert.equal(stepRowIndex(rows, -1, 1), 0)
  assert.equal(stepRowIndex(rows, rows.length, -1), 3)
})
