export const SERVER_PRESETS = {
  gaming: {
    id: 'gaming',
    name: 'Gaming',
    description: 'Squads, clips, matchmaking, and voice rooms.',
    categories: [
      {
        name: 'General',
        channels: [
          { name: 'general', type: 'text' },
          { name: 'announcements', type: 'text' },
          { name: 'clips-and-highlights', type: 'text' }
        ]
      },
      {
        name: 'Game Rooms',
        channels: [
          { name: 'looking-for-group', type: 'text' },
          { name: 'game-chat', type: 'text' },
          { name: 'Lobby', type: 'voice' },
          { name: 'Squad 1', type: 'voice' },
          { name: 'Squad 2', type: 'voice' }
        ]
      }
    ]
  },
  study: {
    id: 'study',
    name: 'Study',
    description: 'Resources, questions, accountability, and study rooms.',
    categories: [
      {
        name: 'General',
        channels: [
          { name: 'general', type: 'text' },
          { name: 'announcements', type: 'text' }
        ]
      },
      {
        name: 'Study Hub',
        channels: [
          { name: 'questions', type: 'text' },
          { name: 'notes-and-resources', type: 'text' },
          { name: 'accountability', type: 'text' }
        ]
      },
      {
        name: 'Study Rooms',
        channels: [
          { name: 'Quiet Study', type: 'voice' },
          { name: 'Group Study', type: 'voice' }
        ]
      }
    ]
  },
  simple: {
    id: 'simple',
    name: 'Simple',
    description: 'Start with the default General category and channel.',
    categories: [
      {
        name: 'General',
        channels: [{ name: 'general', type: 'text' }]
      }
    ]
  }
}

export function getServerPreset(presetId) {
  return SERVER_PRESETS[presetId] || SERVER_PRESETS.simple
}

export function getMissingPresetStructure(preset, existingCategories = [], existingChannels = []) {
  const categoriesByName = new Map(existingCategories.map(category => [category.name.toLowerCase(), category]))
  const channelsByCategory = new Map()

  for (const channel of existingChannels) {
    const key = channel.category_id
    const items = channelsByCategory.get(key) || []
    items.push(channel)
    channelsByCategory.set(key, items)
  }

  return preset.categories.map((category, position) => {
    const existingCategory = categoriesByName.get(category.name.toLowerCase())
    const categoryChannels = existingCategory ? channelsByCategory.get(existingCategory.id) || [] : []
    const existingChannelKeys = new Set(categoryChannels.map(channel => `${channel.type}:${channel.name.toLowerCase()}`))

    return {
      ...category,
      position,
      existingCategory,
      missingChannels: category.channels.filter(channel => !existingChannelKeys.has(`${channel.type}:${channel.name.toLowerCase()}`))
    }
  })
}

export async function provisionServerPreset(client, serverId, presetId) {
  const preset = getServerPreset(presetId)
  if (!client || !serverId || preset.id === 'simple') return

  const { data: existingCategories, error: categoriesError } = await client
    .from('categories')
    .select('id, name, position')
    .eq('server_id', serverId)
  if (categoriesError) throw categoriesError

  const existingCategoryIds = (existingCategories || []).map(category => category.id)
  let existingChannels = []
  if (existingCategoryIds.length > 0) {
    const { data, error } = await client
      .from('channels')
      .select('id, category_id, name, type, position')
      .in('category_id', existingCategoryIds)
    if (error) throw error
    existingChannels = data || []
  }

  const structure = getMissingPresetStructure(preset, existingCategories || [], existingChannels)
  for (const categoryPlan of structure) {
    let category = categoryPlan.existingCategory
    if (!category) {
      const { data, error } = await client
        .from('categories')
        .insert({ server_id: serverId, name: categoryPlan.name, position: categoryPlan.position })
        .select('id, name, position')
        .single()
      if (error) throw error
      category = data
    }

    if (categoryPlan.missingChannels.length === 0) continue
    const existingCount = categoryPlan.existingCategory
      ? existingChannels.filter(channel => channel.category_id === category.id).length
      : 0
    const rows = categoryPlan.missingChannels.map((channel, index) => ({
      category_id: category.id,
      name: channel.name,
      type: channel.type,
      position: existingCount + index
    }))
    const { error } = await client.from('channels').insert(rows)
    if (error) throw error
  }
}
