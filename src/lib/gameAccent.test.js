import test from 'node:test'
import assert from 'node:assert/strict'
import { accentFromHex, accentFromPixels } from './gameAccent.js'

const pixels = (...rgba) => Uint8ClampedArray.from(rgba.flat())

test('picks the vivid hue over greys', () => {
  const red = [220, 30, 30, 255]
  const grey = [128, 128, 128, 255]
  assert.match(accentFromPixels(pixels(red, grey, grey, grey)), /^hsl\(0 \d+% /)
})

test('null for grey, dark or transparent images', () => {
  assert.equal(accentFromPixels(pixels([128, 128, 128, 255], [10, 10, 10, 255])), null)
  assert.equal(accentFromPixels(pixels([220, 30, 30, 0])), null)
  assert.equal(accentFromPixels(new Uint8ClampedArray()), null)
})

test('takes Chimaera\'s hex colour and refuses anything else', () => {
  assert.match(accentFromHex('#dc1e1e'), /^hsl\(0 \d+% var\(--game-accent-l/)
  assert.match(accentFromHex('#1e90ff'), /^hsl\(210 /)
  for (const junk of ['#808080', 'red', '#12345', '#1234567', 'url(x)', null, 5]) assert.equal(accentFromHex(junk), null, String(junk))
})
