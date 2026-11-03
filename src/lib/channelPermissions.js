/**
 * Display-side mirror of the overwrite rules in
 * supabase/migrations/20261103160000_server_roles.sql. RLS is the real
 * boundary; this only decides lock icons and which voice topics are private.
 *
 * Overwrite rows: { category_id, channel_id, target: 'everyone'|'role'|'member',
 * role_id, profile_id, allow, deny }.
 */
export const VIEW_CHANNEL = 1

// The overwrites a channel actually uses: its category's when synced.
export function effectiveOverwrites(channel, overwrites = []) {
  return channel.sync_permissions
    ? overwrites.filter(row => row.category_id === channel.category_id)
    : overwrites.filter(row => row.channel_id === channel.id)
}

export function categoryOverwrites(category, overwrites = []) {
  return overwrites.filter(row => row.category_id === category.id)
}

// Private = @everyone is denied VIEW_CHANNEL and not allowed it back.
export function isPrivate(rows = []) {
  const everyone = rows.find(row => row.target === 'everyone')
  return Boolean(everyone && (everyone.deny & VIEW_CHANNEL) && !(everyone.allow & VIEW_CHANNEL))
}

export function isChannelPrivate(channel, overwrites) {
  return isPrivate(effectiveOverwrites(channel, overwrites))
}

/* Same order as overwrites_allow_view: member, then any role, then @everyone,
   allow beating deny at each step; no overwrite at all means visible. */
export function canView(rows = [], { profileId, roleIds = [] } = {}) {
  const bits = list => ({
    allow: list.some(row => row.allow & VIEW_CHANNEL),
    deny: list.some(row => row.deny & VIEW_CHANNEL)
  })
  const roleSet = new Set(roleIds)
  for (const step of [
    bits(rows.filter(row => row.target === 'member' && row.profile_id === profileId)),
    bits(rows.filter(row => row.target === 'role' && roleSet.has(row.role_id))),
    bits(rows.filter(row => row.target === 'everyone'))
  ]) {
    if (step.allow) return true
    if (step.deny) return false
  }
  return true
}

/* Rows to insert for a new private category or channel: @everyone denied,
   each picked role or member allowed. `container` is { category_id } or
   { channel_id }. */
export function privateOverwriteRows(container, { roleIds = [], profileIds = [] } = {}) {
  return [
    { ...container, target: 'everyone', allow: 0, deny: VIEW_CHANNEL },
    ...roleIds.map(roleId => ({ ...container, target: 'role', role_id: roleId, allow: VIEW_CHANNEL, deny: 0 })),
    ...profileIds.map(profileId => ({ ...container, target: 'member', profile_id: profileId, allow: VIEW_CHANNEL, deny: 0 }))
  ]
}
