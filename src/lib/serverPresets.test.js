import test from 'node:test'
import assert from 'node:assert/strict'
import { getMissingPresetStructure, getServerPreset } from './serverPresets.js'

test('gaming and study presets include text and voice spaces', () => {
  for (const presetId of ['gaming', 'study']) {
    const channels = getServerPreset(presetId).categories.flatMap(category => category.channels)
    assert.ok(channels.some(channel => channel.type === 'text'))
    assert.ok(channels.some(channel => channel.type === 'voice'))
  }
})

test('unknown presets safely fall back to the simple server', () => {
  assert.equal(getServerPreset('unknown').id, 'simple')
})

test('preset planning preserves existing default channels and adds only missing rows', () => {
  const plan = getMissingPresetStructure(
    getServerPreset('gaming'),
    [{ id: 'general-category', name: 'General', position: 0 }],
    [{ id: 'general-channel', category_id: 'general-category', name: 'general', type: 'text', position: 0 }]
  )

  const general = plan.find(category => category.name === 'General')
  assert.equal(general.existingCategory.id, 'general-category')
  assert.deepEqual(general.missingChannels.map(channel => channel.name), ['announcements', 'clips-and-highlights'])
  assert.equal(plan.find(category => category.name === 'Game Rooms').existingCategory, undefined)
})
