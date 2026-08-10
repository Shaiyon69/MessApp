/** Pure helpers for server-wide voice-channel occupancy (see useServerVoicePresence). */

const asParticipant = (entry) => ({
  id: entry.profile_id,
  displayName: entry.display_name || 'Participant',
  avatarUrl: entry.avatar_url || '',
  muted: Boolean(entry.muted),
  deafened: Boolean(entry.deafened),
  cameraActive: Boolean(entry.camera_active),
  screenShareActive: Boolean(entry.screen_share_active),
  // Speaking level changes per audio frame and is never broadcast server-wide;
  // the live media session supplies it for the channel this client joined.
  speaking: false,
  voiceLevel: 0
})

/** Groups presence entries by the voice channel each member is sitting in. */
export function groupPresenceByChannel(presenceState) {
  const byChannel = {}
  Object.values(presenceState || {})
    .flatMap(entries => entries || [])
    .forEach(entry => {
      const channelId = entry?.channel_id
      if (!channelId || !entry?.profile_id) return
      if (!byChannel[channelId]) byChannel[channelId] = []
      // A member signed in twice should still occupy one seat.
      if (byChannel[channelId].some(participant => participant.id === entry.profile_id)) return
      byChannel[channelId].push(asParticipant(entry))
    })
  return byChannel
}

/** Builds the presence row published while sitting in a voice channel, or null when not connected. */
export function buildVoicePresencePayload({ serverId, profileId, activeVoiceSession, voiceSessionState, displayName, avatarUrl, muted, deafened }) {
  if (!profileId || !serverId) return null
  if (!activeVoiceSession?.channelId || activeVoiceSession.serverId !== serverId) return null
  return {
    profile_id: profileId,
    channel_id: activeVoiceSession.channelId,
    display_name: displayName || 'Participant',
    avatar_url: avatarUrl || '',
    muted: Boolean(muted),
    deafened: Boolean(deafened),
    camera_active: Boolean(voiceSessionState?.isCameraOn),
    screen_share_active: Boolean(voiceSessionState?.isSharing)
  }
}
