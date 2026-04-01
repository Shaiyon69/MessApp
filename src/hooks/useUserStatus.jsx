import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function useUserStatus(session) {
  const [userStatus, setUserStatus] = useState({
    status: 'online',
    customStatus: '',
    lastSeen: new Date()
  })
  const [isUpdating, setIsUpdating] = useState(false)

  const statusOptions = [
    { value: 'online', label: 'Online', color: 'text-green-400', icon: '●' },
    { value: 'idle', label: 'Idle', color: 'text-yellow-400', icon: '●' },
    { value: 'dnd', label: 'Do Not Disturb', color: 'text-red-400', icon: '●' },
    { value: 'offline', label: 'Offline', color: 'text-gray-400', icon: '●' }
  ]

  // Load user status from profile
  useEffect(() => {
    if (session?.user?.id) {
      loadUserStatus()
    }
  }, [session?.user?.id])

  const loadUserStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('status, custom_status, last_seen')
        .eq('id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        setUserStatus({
          status: data.status || 'online',
          customStatus: data.custom_status || '',
          lastSeen: new Date(data.last_seen)
        })
      }
    } catch (error) {
      console.error('Failed to load user status:', error)
    }
  }

  const updateStatus = async (newStatus, customStatus = '') => {
    if (!session?.user?.id) return

    setIsUpdating(true)
    try {
      const updates = {
        status: newStatus,
        custom_status: customStatus,
        last_seen: new Date().toISOString()
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', session.user.id)

      if (error) throw error

      setUserStatus({
        status: newStatus,
        customStatus: customStatus,
        lastSeen: new Date()
      })

      // Broadcast status change to presence channel
      const presenceChannel = supabase.channel('user-presence')
      
      presenceChannel.send({
        type: 'broadcast',
        event: 'status_change',
        payload: {
          user_id: session.user.id,
          username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
          status: newStatus,
          custom_status: customStatus,
          last_seen: new Date().toISOString()
        }
      })

    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const setOnline = () => updateStatus('online', userStatus.customStatus)
  const setIdle = () => updateStatus('idle', userStatus.customStatus)
  const setDnd = () => updateStatus('dnd', userStatus.customStatus)
  const setOffline = () => updateStatus('offline', userStatus.customStatus)

  const updateCustomStatus = (customStatus) => {
    updateStatus(userStatus.status, customStatus)
  }

  // Auto-away after 5 minutes of inactivity
  useEffect(() => {
    let awayTimeout

    const resetAwayTimeout = () => {
      clearTimeout(awayTimeout)
      
      if (userStatus.status === 'online') {
        awayTimeout = setTimeout(() => {
          setIdle()
        }, 5 * 60 * 1000) // 5 minutes
      }
    }

    const handleActivity = () => {
      resetAwayTimeout()
      if (userStatus.status === 'idle') {
        setOnline()
      }
    }

    // Activity listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true)
    })

    resetAwayTimeout()

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true)
      })
      clearTimeout(awayTimeout)
    }
  }, [userStatus.status])

  return {
    userStatus,
    statusOptions,
    isUpdating,
    updateStatus,
    setOnline,
    setIdle,
    setDnd,
    setOffline,
    updateCustomStatus
  }
}

export function usePresenceTracker(session) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [userPresences, setUserPresences] = useState({})

  useEffect(() => {
    if (!session?.user?.id) return

    const presenceChannel = supabase.channel('global-presence')

    // Subscribe to presence updates
    presenceChannel.on('presence', { event: 'sync' }, () => {
      console.log('[presence] Synced')
    })

    presenceChannel.on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach(presence => {
        setUserPresences(prev => ({
          ...prev,
          [presence.user_id]: {
            ...presence,
            status: 'online',
            last_seen: new Date()
          }
        }))
      })
    })

    presenceChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach(presence => {
        setUserPresences(prev => {
          const updated = { ...prev }
          delete updated[presence.user_id]
          return updated
        })
      })
    })

    // Listen for status changes
    presenceChannel.on('broadcast', { event: 'status_change' }, ({ payload }) => {
      setUserPresences(prev => ({
        ...prev,
        [payload.user_id]: {
          ...prev[payload.user_id],
          ...payload,
          last_seen: new Date(payload.last_seen)
        }
      }))
    })

    // Track current user
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString()
        })
      }
    })

    // Cleanup on page unload
    const handleBeforeUnload = () => {
      presenceChannel.untrack()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      supabase.removeChannel(presenceChannel)
    }
  }, [session?.user?.id])

  const getUserPresence = (userId) => {
    return userPresences[userId] || {
      status: 'offline',
      last_seen: null
    }
  }

  const isUserOnline = (userId) => {
    const presence = getUserPresence(userId)
    return presence.status === 'online'
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-400'
      case 'idle': return 'bg-yellow-400'
      case 'dnd': return 'bg-red-400'
      default: return 'bg-gray-400'
    }
  }

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Never'
    
    const now = new Date()
    const lastSeenDate = new Date(lastSeen)
    const diffMs = now - lastSeenDate
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    
    return lastSeenDate.toLocaleDateString()
  }

  return {
    onlineUsers,
    userPresences,
    getUserPresence,
    isUserOnline,
    getStatusColor,
    formatLastSeen
  }
}
