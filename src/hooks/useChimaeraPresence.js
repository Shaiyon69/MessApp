/**
 * Live Chimaera presence of the given friends, keyed by user id: online while
 * their launcher runs, plus the game they play. Subscribes without tracking,
 * so this client never shows up on a friend's channel.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { chimaeraChannelName, toGamePresence } from '../lib/chimaeraPresence'

export function useChimaeraPresence(friendIds) {
  const [presence, setPresence] = useState({})
  // A stable primitive, so the channels are rebuilt only when the friend set changes.
  const idsKey = [...new Set(friendIds.filter(Boolean))].sort().join(',')

  useEffect(() => {
    if (!idsKey || !supabase) return undefined
    // shortcut: one channel per friend, like Chimaera; past ~100 friends this nears
    // Realtime's per-connection channel limit, then batch into a shared channel.
    const channels = idsKey.split(',').map(id => {
      const channel = supabase.channel(chimaeraChannelName(id))
      channel
        .on('presence', { event: 'sync' }, () => {
          const next = toGamePresence(Object.values(channel.presenceState()).flat())
          setPresence(prev => ({ ...prev, [id]: next }))
        })
        .subscribe()
      return channel
    })
    return () => {
      channels.forEach(channel => void supabase.removeChannel(channel))
      setPresence({})
    }
  }, [idsKey])

  return presence
}
