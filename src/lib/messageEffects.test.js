import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyWordEffect, claimFreshEffect, parseMessageEffect, remarkWordEffects, stripEffects, withMessageEffect } from './messageEffects.js'

const paragraph = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] })
const text = value => ({ type: 'text', value })
const run = tree => {
  remarkWordEffects()(tree)
  return tree
}

describe('message effects', () => {
  it('round-trips a message effect prefix', () => {
    const sent = withMessageEffect('hello', 'slam')
    assert.equal(sent, '{!slam} hello')
    assert.deepEqual(parseMessageEffect(sent), { effect: 'slam', text: 'hello' })
  })

  it('ignores unknown effects', () => {
    assert.equal(withMessageEffect('hi', 'nope'), 'hi')
    assert.deepEqual(parseMessageEffect('{!nope} hi'), { effect: null, text: '{!nope} hi' })
    assert.equal(stripEffects('{wobble|hi}'), '{wobble|hi}')
  })

  it('strips all markup for previews', () => {
    assert.equal(stripEffects('{!confetti} so {big|big} and {shake|shaky}'), 'so big and shaky')
  })
})

describe('claimFreshEffect', () => {
  it('plays a just-sent message once and never an old one', () => {
    const now = Date.parse('2026-01-01T00:00:05Z')
    const fresh = { profile_id: 'a', content: '{!slam} hi', created_at: '2026-01-01T00:00:00Z' }
    assert.equal(claimFreshEffect(fresh, now), true)
    assert.equal(claimFreshEffect(fresh, now + 1000), false)
    assert.equal(claimFreshEffect({ ...fresh, content: 'old', created_at: '2025-12-31T00:00:00Z' }, now), false)
  })
})

describe('applyWordEffect', () => {
  it('wraps the selection and puts the caret after it', () => {
    assert.deepEqual(applyWordEffect('say hello now', 4, 9, 'shake'), { text: 'say {shake|hello} now', caret: 17 })
  })

  it('wraps the whole message after any prefix when nothing is selected', () => {
    assert.equal(applyWordEffect('{!slam} hi there', 3, 3, 'big').text, '{!slam} {big|hi there}')
  })

  it('replaces an existing effect instead of nesting', () => {
    assert.equal(applyWordEffect('{shake|hi}', 0, 10, 'nod').text, '{nod|hi}')
  })
})

describe('remarkWordEffects', () => {
  it('splits an effect span out of prose', () => {
    const [before, fx, after] = run(paragraph(text('a {ripple|wave} b'))).children[0].children
    assert.deepEqual(before, text('a '))
    assert.equal(fx.data.hProperties.className, 'fx fx-ripple')
    assert.equal(fx.children[0].value, 'wave')
    assert.deepEqual(after, text(' b'))
  })

  it('leaves code alone', () => {
    const tree = run(paragraph({ type: 'inlineCode', value: '{big|x}' }))
    assert.equal(tree.children[0].children[0].type, 'inlineCode')
  })
})
