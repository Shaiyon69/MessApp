import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyMention, findMentionQuery, matchMembers, mentionToken, normalizeMention, remarkMentions } from './mentions.js'

const run = tree => {
  remarkMentions()(tree)
  return tree
}
const paragraph = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] })
const text = value => ({ type: 'text', value })

describe('mention parsing', () => {
  it('finds the token the caret sits inside', () => {
    assert.deepEqual(findMentionQuery('hey @ja', 7), { start: 4, query: 'ja' })
    assert.deepEqual(findMentionQuery('@', 1), { start: 0, query: '' })
    assert.equal(findMentionQuery('hey @jane done', 14), null)
    assert.equal(findMentionQuery('mail me at bob@example.com', 26), null)
  })

  it('squashes spaces so a two-word name is one token', () => {
    assert.equal(mentionToken('Jane Doe'), '@JaneDoe')
    assert.equal(normalizeMention('Jane Doe'), 'janedoe')
  })

  it('replaces the in-progress token and leaves the caret after it', () => {
    assert.deepEqual(applyMention('hey @ja there', 4, 7, 'Jane Doe'), { text: 'hey @JaneDoe  there', caret: 13 })
  })
})

describe('member matching', () => {
  const members = [
    { profiles: { username: 'Jane Doe' } },
    { profiles: { username: 'bojan' } },
    { profiles: { username: 'Bo' } },
    { username: 'unrelated' }
  ]

  it('ranks prefix matches ahead of substring matches', () => {
    const names = matchMembers(members, 'bo').map(member => member.profiles.username)
    assert.deepEqual(names, ['Bo', 'bojan'])
  })

  it('returns everyone for an empty query and respects the limit', () => {
    assert.equal(matchMembers(members, '').length, 4)
    assert.equal(matchMembers(members, '', 2).length, 2)
  })
})

describe('remarkMentions', () => {
  it('splits a mention out of surrounding prose', () => {
    const tree = run(paragraph(text('hi @bob!')))
    const [before, mention, after] = tree.children[0].children
    assert.deepEqual(before, text('hi '))
    assert.equal(mention.type, 'mention')
    assert.equal(mention.data.hProperties['data-mention'], 'bob')
    assert.equal(mention.children[0].value, '@bob')
    assert.deepEqual(after, text('!'))
  })

  it('leaves emails and code alone', () => {
    assert.equal(run(paragraph(text('bob@example.com'))).children[0].children.length, 1)
    const code = run(paragraph({ type: 'inlineCode', value: '@bob' }))
    assert.equal(code.children[0].children[0].type, 'inlineCode')
  })

  it('descends into nested inline nodes', () => {
    const tree = run(paragraph({ type: 'emphasis', children: [text('ping @bob')] }))
    assert.equal(tree.children[0].children[0].children[1].type, 'mention')
  })
})
