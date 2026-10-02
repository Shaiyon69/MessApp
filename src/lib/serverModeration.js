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

// Server cap is 28 days (timeout_server_member). 0 lifts the timeout.
export const TIMEOUT_OPTIONS = [
  { label: '10 min', minutes: 10 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
  { label: '1 week', minutes: 10080 }
]

export const isTimedOut = (member, nowMs = Date.now()) => Date.parse(member?.timed_out_until || '') > nowMs

export const canModerateMessages = role => ['owner', 'admin', 'moderator'].includes(role)

// One line of the moderation log, e.g. "alice banned bob". Names fall back to
// "Someone" because actor/target rows are `on delete set null`.
export const describeModerationEvent = event => {
  const actor = event?.actor?.username || 'Someone'
  const target = event?.target?.username || 'someone'
  switch (event?.action) {
    case 'kick': return `${actor} removed ${target}`
    case 'ban': return `${actor} banned ${target}`
    case 'unban': return `${actor} unbanned ${target}`
    case 'role_change': {
      const to = event.metadata?.to
      return to ? `${actor} made ${target} ${to}` : `${actor} changed ${target}'s role`
    }
    case 'message_delete': return `${actor} removed a message from ${target}`
    case 'timeout': {
      const until = Date.parse(event.metadata?.until || '')
      return Number.isFinite(until)
        ? `${actor} timed out ${target} until ${new Date(until).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
        : `${actor} timed out ${target}`
    }
    case 'untimeout': return `${actor} lifted ${target}'s timeout`
    default: return `${actor} took a moderation action`
  }
}
