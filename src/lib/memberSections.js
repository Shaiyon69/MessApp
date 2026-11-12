// Member list sections, Discord style: each online member sits under their top
// custom role (roles come sorted by position, first = top), online members with
// no role under "Online", and everyone offline under "Offline".
export function groupMembersByRole(members = [], roles = [], memberRoles = [], isOnline = () => false) {
  const rank = new Map(roles.map((role, index) => [role.id, index]))
  const topRoleOf = new Map()
  for (const { profile_id: profileId, role_id: roleId } of memberRoles) {
    if (!rank.has(roleId)) continue
    const current = topRoleOf.get(profileId)
    if (current === undefined || rank.get(roleId) < rank.get(current)) topRoleOf.set(profileId, roleId)
  }

  const byRole = new Map(roles.map(role => [role.id, []]))
  const online = []
  const offline = []
  for (const member of members) {
    const roleId = topRoleOf.get(member.profile_id)
    if (!isOnline(member.profile_id)) offline.push(member)
    else if (roleId) byRole.get(roleId).push(member)
    else online.push(member)
  }

  const byName = (a, b) => (a.profiles?.username || '').localeCompare(b.profiles?.username || '')
  return [
    ...roles.map(role => ({ id: role.id, label: role.name, color: role.color || null, members: byRole.get(role.id).sort(byName) })),
    { id: 'online', label: 'Online', color: null, members: online.sort(byName) },
    { id: 'offline', label: 'Offline', color: null, members: offline.sort(byName) }
  ].filter(section => section.members.length > 0)
}

// A member's top custom role (its colour tints their name), or null.
export function topRole(profileId, roles = [], memberRoles = []) {
  const held = new Set(memberRoles.filter(entry => entry.profile_id === profileId).map(entry => entry.role_id))
  return roles.find(role => held.has(role.id)) || null
}
