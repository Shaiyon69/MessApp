import test from 'node:test'
import assert from 'node:assert/strict'
import { pickSendRadial, pickVoiceHold, radialDuration, SEND_RADIAL_OPTIONS, SEND_RADIAL_DURATIONS, SEND_RADIAL_PX, VOICE_HOLD_PX } from './sendRadial.js'

const pick = (angle, radius = SEND_RADIAL_PX) => pickSendRadial(
  Math.cos(angle * Math.PI / 180) * radius,
  Math.sin(angle * Math.PI / 180) * radius
)

test('nothing is selected while the thumb is still on the button', () => {
  assert.equal(pickSendRadial(0, 0), null)
  assert.equal(pick(90, 30), null)
})

test('each wedge picks its own option', () => {
  assert.equal(SEND_RADIAL_OPTIONS[pick(180)].id, 'timed')
  assert.equal(SEND_RADIAL_OPTIONS[pick(135)].id, 'both')
  assert.equal(SEND_RADIAL_OPTIONS[pick(90)].id, 'spoiler')
})

test('a wedge keeps its edge across the angle wrap', () => {
  assert.equal(SEND_RADIAL_OPTIONS[pick(-175)].id, 'timed')
})

test('the gaps and the lower half select nothing', () => {
  assert.equal(pick(45), null)
  assert.equal(pick(-90), null)
  assert.equal(pick(0), null)
})

test('a held timed wedge cycles its lifetime and wraps', () => {
  const timed = SEND_RADIAL_OPTIONS.find(option => option.id === 'timed')
  const ids = SEND_RADIAL_DURATIONS.map(duration => duration.id)
  assert.deepEqual(ids, ['1h', '24h', '7d'])
  assert.equal(radialDuration(timed).id, ids[0])
  assert.equal(radialDuration(timed, 2).id, ids[2])
  assert.equal(radialDuration(timed, ids.length).id, ids[0])
  assert.ok(radialDuration(timed, 1).seconds > 0)
})

test('the spoiler-only wedge never carries a lifetime', () => {
  assert.equal(radialDuration(SEND_RADIAL_OPTIONS.find(option => option.id === 'spoiler'), 3), null)
})

test('pickVoiceHold ignores travel inside the threshold', () => {
  assert.equal(pickVoiceHold(0, 0), null)
  assert.equal(pickVoiceHold(-50, 50), null)
  assert.equal(pickVoiceHold(0, VOICE_HOLD_PX - 1), null)
})

test('pickVoiceHold locks only on a drag up', () => {
  assert.equal(pickVoiceHold(0, VOICE_HOLD_PX), 'lock')
  assert.equal(pickVoiceHold(-10, 140), 'lock')
  assert.equal(pickVoiceHold(10, 140), 'lock')
})

test('pickVoiceHold cancels on every other direction', () => {
  assert.equal(pickVoiceHold(-VOICE_HOLD_PX, 0), 'cancel')
  assert.equal(pickVoiceHold(VOICE_HOLD_PX, 0), 'cancel')
  assert.equal(pickVoiceHold(0, -VOICE_HOLD_PX), 'cancel')
  assert.equal(pickVoiceHold(-120, 80), 'cancel')
  assert.equal(pickVoiceHold(120, -80), 'cancel')
})
