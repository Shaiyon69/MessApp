export const SERVER_ROLES = ['member', 'moderator', 'admin']

const ROLE_RANK = {
  member: 0,
  moderator: 1,
  admin: 2,
  owner: 3
}

export const canModerateMember = (actorRole, targetRole, isSelf = false) => {
  if (isSelf || !Object.hasOwn(ROLE_RANK, actorRole) || !Object.hasOwn(ROLE_RANK, targetRole)) return false
  if (actorRole === 'owner') return targetRole !== 'owner'
  if (actorRole === 'admin') return targetRole === 'moderator' || targetRole === 'member'
  if (actorRole === 'moderator') return targetRole === 'member'
  return false
}

export const canBanMember = (actorRole, targetRole, isSelf = false) => {
  if (isSelf) return false
  if (actorRole === 'owner') return targetRole !== 'owner'
  if (actorRole === 'admin') return targetRole === 'moderator' || targetRole === 'member'
  return false
}

export const canModerateMessages = role => ['owner', 'admin', 'moderator'].includes(role)
