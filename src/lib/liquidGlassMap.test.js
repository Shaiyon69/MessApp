import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGlassMap, glassBezel } from './liquidGlassMap.js'

const at = ({ data, width }, x, y) => [data[(y * width + x) * 4], data[(y * width + x) * 4 + 1]]

test('bezel follows the shader clamp', () => {
  assert.equal(glassBezel(10, 10), 5)
  assert.equal(glassBezel(50, 400), 18)
  assert.equal(glassBezel(900, 900), 26)
})

test('large panels stay flat inside and bend only at the edge', () => {
  const map = buildGlassMap(1000, 600, 24)
  assert.deepEqual(at(map, 500, 300), [128, 128])
  const [leftX] = at(map, 3, 300)
  const [rightX] = at(map, 996, 300)
  assert.notEqual(leftX, 128)
  // Mirror-symmetric: the two side bezels push in opposite directions.
  assert.ok(Math.abs((leftX - 128) + (rightX - 128)) <= 2)
  const [, topY] = at(map, 500, 3)
  assert.notEqual(topY, 128)
})

test('small elements get a centre lens, large ones do not', () => {
  const small = buildGlassMap(120, 120, 60)
  const [sx] = at(small, 40, 60)
  assert.notEqual(sx, 128)
  const large = buildGlassMap(1000, 1000, 24)
  assert.deepEqual(at(large, 300, 500), [128, 128])
})

test('pixels outside the rounded corner are neutral and alpha is opaque', () => {
  const map = buildGlassMap(200, 100, 40)
  assert.deepEqual(at(map, 0, 0), [128, 128])
  assert.equal(map.data[3], 255)
  assert.ok(map.scale >= 1)
})

test('a forced lens bends the body of a large surface', () => {
  const sheet = buildGlassMap(412, 480, 16, 2.5)
  const [x] = at(sheet, 120, 240)
  assert.notEqual(x, 128)
  assert.deepEqual(at(buildGlassMap(412, 480, 16), 206, 240), [128, 128])
})
