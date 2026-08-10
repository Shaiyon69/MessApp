/**
 * Tracks who is sitting in every voice channel of the active server, not just
 * the one this client joined.
 *
 * The media client (`voiceChannelClient`) only knows about peers inside the
 * room it connected to, so occupancy for other channels has to come from a
 * separate, server-scoped presence channel that every member subscribes to
 * regardless of whether they are in a call. Joining a voice channel publishes a
 * presence entry; leaving withdraws it.
 *
 * Reconciliation helpers live in `../lib/voicePresence` so they stay testable
 * without a Supabase client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { buildVoicePresencePayload, groupPresenceByChannel } from '../lib/voicePresence'

export function useServerVoicePresence({
  serverId,
  profileId,
  displayName,
  avatarUrl,
  activeVoiceSession,
  voiceSessionState,
  voiceMuted,
  voiceDeafened
}) {
  const [participantsByChannel, setParticipantsByChannel] = useState({})
  const channelRef = useRef(null)

  // Republish only when a field peers can actually observe changes.
  const trackedPayload = useMemo(() => buildVoicePresencePayload({
    serverId,
    profileId,
    activeVoiceSession,
    voiceSessionState,
    displayName,
    avatarUrl,
    muted: voiceMuted,
    deafened: voiceDeafened
  }), [
    serverId,
    profileId,
    activeVoiceSession,
    voiceSessionState,
    displayName,
    avatarUrl,
    voiceMuted,
    voiceDeafened
  ])
  const trackedSignature = trackedPayload ? JSON.stringify(trackedPayload) : null

  useEffect(() => {
    if (!serverId || !profileId) {
      setParticipantsByChannel({})
      return
    }

    const presenceChannel = supabase.channel(`voice-presence:${serverId}`, {
      config: { presence: { key: profileId } }
    })
    const syncPresence = () => setParticipantsByChannel(groupPresenceByChannel(presenceChannel.presenceState()))

    presenceChannel.on('presence', { event: 'sync' }, syncPresence)
    presenceChannel.on('presence', { event: 'join' }, syncPresence)
    presenceChannel.on('presence', { event: 'leave' }, syncPresence)
    presenceChannel.subscribe()
    channelRef.current = presenceChannel

    return () => {
      channelRef.current = null
      supabase.removeChannel(presenceChannel)
      setParticipantsByChannel({})
    }
  }, [serverId, profileId])

  // Publish/withdraw this client's seat as it joins, leaves, or toggles state.
  useEffect(() => {
    const presenceChannel = channelRef.current
    if (!presenceChannel) return
    if (trackedSignature) presenceChannel.track(JSON.parse(trackedSignature)).catch(() => {})
    else presenceChannel.untrack().catch(() => {})
  }, [trackedSignature, serverId, profileId])

  /**
   * Live media-session state wins for the channel this client joined (it carries
   * real speaking/level data); presence covers every other channel.
   */
  const getVoiceParticipantsForChannel = useCallback((channelId) => {
    if (!channelId) return []
    if (activeVoiceSession?.channelId === channelId && voiceSessionState?.participants?.length) {
      return voiceSessionState.participants
    }
    return participantsByChannel[channelId] || []
  }, [activeVoiceSession?.channelId, participantsByChannel, voiceSessionState?.participants])

  return { participantsByChannel, getVoiceParticipantsForChannel }
}
