import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export function useTypingIndicators(session, activeChannel, activeDm) {
  const [typingUsers, setTypingUsers] = useState([])
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)

  // Subscribe to typing indicators
  useEffect(() => {
    if (!session?.user?.id) return

    const channelName = activeChannel 
      ? `typing-channel-${activeChannel.id}`
      : activeDm 
        ? `typing-dm-${activeDm.dm_room_id}`
        : null

    if (!channelName) return

    const channel = supabase.channel(channelName)

    // Listen for typing events
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.user_id !== session.user.id) {
        handleTypingEvent(payload)
      }
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[typing] Subscribed to ${channelName}`)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, activeChannel?.id, activeDm?.dm_room_id])

  const handleTypingEvent = useCallback((payload) => {
    const { user_id, username, avatar_url, is_typing } = payload

    setTypingUsers(prev => {
      if (is_typing) {
        // Add or update typing user
        const existing = prev.find(u => u.user_id === user_id)
        if (!existing) {
          return [...prev, { user_id, username, avatar_url, lastTyped: Date.now() }]
        } else {
          return prev.map(u => 
            u.user_id === user_id 
              ? { ...u, lastTyped: Date.now() }
              : u
          )
        }
      } else {
        // Remove typing user
        return prev.filter(u => u.user_id !== user_id)
      }
    })

    // Auto-remove after 10 seconds
    if (is_typing) {
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.user_id !== user_id))
      }, 10000)
    }
  }, [])

  const sendTypingIndicator = useCallback((isTyping) => {
    if (!session?.user?.id || isTyping === isTypingRef.current) return

    const channelName = activeChannel 
      ? `typing-channel-${activeChannel.id}`
      : activeDm 
        ? `typing-dm-${activeDm.dm_room_id}`
        : null

    if (!channelName) return

    const channel = supabase.channel(channelName)
    
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: session.user.id,
        username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
        avatar_url: session.user.user_metadata?.avatar_url,
        is_typing: isTyping
      }
    })

    isTypingRef.current = isTyping
  }, [session, activeChannel, activeDm])

  const startTyping = useCallback(() => {
    sendTypingIndicator(true)
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Auto-stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingIndicator(false)
      isTypingRef.current = false
    }, 3000)
  }, [sendTypingIndicator])

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    sendTypingIndicator(false)
  }, [sendTypingIndicator])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      stopTyping()
    }
  }, [stopTyping])

  return {
    typingUsers,
    startTyping,
    stopTyping
  }
}

export function useReadReceipts(session, activeChannel, activeDm) {
  const [readReceipts, setReadReceipts] = useState({})
  const messageReadTimeoutRef = useRef({})

  // Subscribe to read receipt updates
  useEffect(() => {
    if (!session?.user?.id) return

    const channelName = activeChannel 
      ? `read-receipts-channel-${activeChannel.id}`
      : activeDm 
        ? `read-receipts-dm-${activeDm.dm_room_id}`
        : null

    if (!channelName) return

    const channel = supabase.channel(channelName)

    channel.on('broadcast', { event: 'message_read' }, ({ payload }) => {
      if (payload.reader_id !== session.user.id) {
        handleReadReceipt(payload)
      }
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[read-receipts] Subscribed to ${channelName}`)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, activeChannel?.id, activeDm?.dm_room_id])

  const handleReadReceipt = useCallback((payload) => {
    const { message_id, reader_id, reader_username, read_at } = payload

    setReadReceipts(prev => ({
      ...prev,
      [message_id]: {
        ...prev[message_id],
        [reader_id]: {
          username: reader_username,
          read_at: read_at
        }
      }
    }))
  }, [])

  const markMessageAsRead = useCallback(async (messageId) => {
    if (!session?.user?.id) return

    // Debounce read receipts to avoid spam
    if (messageReadTimeoutRef.current[messageId]) {
      return
    }

    messageReadTimeoutRef.current[messageId] = setTimeout(() => {
      delete messageReadTimeoutRef.current[messageId]
    }, 1000)

    // Update in database
    try {
      await supabase
        .from('read_receipts')
        .upsert({
          message_id: messageId,
          user_id: session.user.id,
          read_at: new Date().toISOString()
        }, {
          onConflict: 'message_id,user_id'
        })
    } catch (error) {
      console.error('[read-receipts] Failed to mark message as read:', error)
    }

    // Broadcast to other users
    const channelName = activeChannel 
      ? `read-receipts-channel-${activeChannel.id}`
      : activeDm 
        ? `read-receipts-dm-${activeDm.dm_room_id}`
        : null

    if (channelName) {
      const channel = supabase.channel(channelName)
      
      channel.send({
        type: 'broadcast',
        event: 'message_read',
        payload: {
          message_id: messageId,
          reader_id: session.user.id,
          reader_username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
          read_at: new Date().toISOString()
        }
      })
    }
  }, [session, activeChannel, activeDm])

  const getMessageReadStatus = useCallback((messageId, totalRecipients = 1) => {
    const receipts = readReceipts[messageId] || {}
    const readCount = Object.keys(receipts).length
    
    return {
      readCount,
      totalCount: totalRecipients,
      isRead: readCount >= totalRecipients,
      readBy: Object.values(receipts)
    }
  }, [readReceipts])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(messageReadTimeoutRef.current).forEach(timeout => {
        clearTimeout(timeout)
      })
    }
  }, [])

  return {
    readReceipts,
    markMessageAsRead,
    getMessageReadStatus
  }
}
