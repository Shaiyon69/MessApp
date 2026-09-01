import test from 'node:test'
import assert from 'node:assert/strict'
import { hasMarkdown } from './markdownText.js'

test('plain prose skips the markdown parser', () => {
  assert.equal(hasMarkdown('hey are you around tonight'), false)
  assert.equal(hasMarkdown('ok'), false)
  assert.equal(hasMarkdown(''), false)
  assert.equal(hasMarkdown(null), false)
})

test('anything markdown could act on takes the markdown path', () => {
  for (const text of [
    '**bold**', '_em_', '`code`', '~~strike~~', '# heading', '> quote',
    '- item', '1. item', '[link](https://a.b)', 'see https://a.b',
    'visit www.a.b', 'mail me@a.b', 'a | b', '![img](x)', 'AT&T', 'a<b'
  ]) assert.equal(hasMarkdown(text), true, text)
})
