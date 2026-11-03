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
 * Private voice channels stay off that server-wide topic, since every server
 * member can read it. Their occupancy goes on `voice-roster:channel:<id>`,
 * which only the channel's members can join.
 *
 * Reconciliation helpers live in `../lib/voicePresence` so they stay testable
 * without a Supabase client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { buildVoicePresencePayload, groupPresenceByChannel } from '../lib/voicePresence'

export function useServerVoicePresence({
  serverId,
  privateChannelIds = [],
  profileId,
  displayName,
  avatarUrl,
  activeVoiceSession,
  voiceSessionState,
  voiceMuted,
  voiceDeafened
}) {
  const [serverParticipants, setServerParticipants] = useState({})
  const [privateParticipants, setPrivateParticipants] = useState({})
  const channelRef = useRef(null)
  const rostersRef = useRef(new Map())
  const privateKey = privateChannelIds.join(',')

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
  const trackedRef = useRef(null)
  trackedRef.current = trackedSignature ? JSON.parse(trackedSignature) : null

  useEffect(() => {
    if (!serverId || !profileId) {
      setServerParticipants({})
      return
    }

    const presenceChannel = supabase.channel(`voice-presence:${serverId}`, {
      config: { private: true, presence: { key: profileId } }
    })
    const syncPresence = () => setServerParticipants(groupPresenceByChannel(presenceChannel.presenceState()))

    presenceChannel.on('presence', { event: 'sync' }, syncPresence)
    presenceChannel.on('presence', { event: 'join' }, syncPresence)
    presenceChannel.on('presence', { event: 'leave' }, syncPresence)
    presenceChannel.subscribe()
    channelRef.current = presenceChannel

    return () => {
      channelRef.current = null
      supabase.removeChannel(presenceChannel)
      setServerParticipants({})
    }
  }, [serverId, profileId])

  // One roster per private voice channel this user can see.
  useEffect(() => {
    if (!profileId || !privateKey) {
      setPrivateParticipants({})
      return
    }
    const rosters = new Map()
    for (const channelId of privateKey.split(',')) {
      const roster = supabase.channel(`voice-roster:channel:${channelId}`, {
        config: { private: true, presence: { key: profileId } }
      })
      const syncRoster = () => setPrivateParticipants(current => ({
        ...current,
        [channelId]: groupPresenceByChannel(roster.presenceState())[channelId] || []
      }))
      roster.on('presence', { event: 'sync' }, syncRoster)
      roster.on('presence', { event: 'join' }, syncRoster)
      roster.on('presence', { event: 'leave' }, syncRoster)
      roster.subscribe(status => {
        // A seat taken before this roster finished joining still has to be published.
        if (status === 'SUBSCRIBED' && trackedRef.current?.channel_id === channelId) roster.track(trackedRef.current).catch(() => {})
      })
      rosters.set(channelId, roster)
    }
    rostersRef.current = rosters

    return () => {
      rostersRef.current = new Map()
      rosters.forEach(roster => supabase.removeChannel(roster))
      setPrivateParticipants({})
    }
  }, [privateKey, profileId])

  // Publish/withdraw this client's seat as it joins, leaves, or toggles state.
  useEffect(() => {
    const payload = trackedSignature ? JSON.parse(trackedSignature) : null
    const privateSeat = payload ? privateKey.split(',').includes(payload.channel_id) : false
    const presenceChannel = channelRef.current
    if (presenceChannel) {
      if (payload && !privateSeat) presenceChannel.track(payload).catch(() => {})
      else presenceChannel.untrack().catch(() => {})
    }
    rostersRef.current.forEach((roster, channelId) => {
      if (payload?.channel_id === channelId) roster.track(payload).catch(() => {})
      else roster.untrack().catch(() => {})
    })
  }, [trackedSignature, serverId, profileId, privateKey])

  const participantsByChannel = useMemo(
    () => ({ ...serverParticipants, ...privateParticipants }),
    [serverParticipants, privateParticipants]
  )

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
