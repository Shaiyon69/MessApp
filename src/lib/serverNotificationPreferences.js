export const isMissingServerNotificationTable = error => (
  error?.code === 'PGRST205' ||
  `${error?.message || ''} ${error?.details || ''}`.includes('server_notification_preferences')
)

export const createServerNotificationPreferencesRepository = (
  client,
  { enabled = false } = {}
) => {
  let availability = enabled ? 'unknown' : 'disabled'
  const pendingLoads = new Map()

  const unavailable = () => ({ unavailable: true })

  const markResultAvailability = result => {
    if (isMissingServerNotificationTable(result?.error)) {
      availability = 'missing'
      return unavailable()
    }
    if (!result?.error) availability = 'available'
    return result
  }

  const load = (serverId, profileId) => {
    if (!client || availability === 'disabled' || availability === 'missing') {
      return Promise.resolve(unavailable())
    }

    const key = `${serverId}:${profileId}`
    if (pendingLoads.has(key)) return pendingLoads.get(key)

    const request = Promise.resolve(
      client
        .from('server_notification_preferences')
        .select('muted')
        .eq('server_id', serverId)
        .eq('profile_id', profileId)
        .maybeSingle()
    )
      .then(markResultAvailability)
      .finally(() => pendingLoads.delete(key))

    pendingLoads.set(key, request)
    return request
  }

  const upsert = async (preference) => {
    if (!client || availability === 'disabled' || availability === 'missing') {
      return unavailable()
    }

    const result = await client
      .from('server_notification_preferences')
      .upsert(preference, { onConflict: 'server_id,profile_id' })

    return markResultAvailability(result)
  }

  return {
    isAvailable: () => availability !== 'disabled' && availability !== 'missing',
    load,
    upsert
  }
}
