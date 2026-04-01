import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥', '👎', '😡']

export function useMessageReactions(session) {
  const [reactionMenuOpen, setReactionMenuOpen] = useState(null)
  const [messageReactions, setMessageReactions] = useState({})
  const reactionMenuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (reactionMenuRef.current && !reactionMenuRef.current.contains(event.target)) {
        setReactionMenuOpen(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchMessageReactions = async (messageIds) => {
    if (!messageIds.length) return

    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds)

      if (error) throw error

      const reactionsByMessage = {}
      data.forEach(reaction => {
        if (!reactionsByMessage[reaction.message_id]) {
          reactionsByMessage[reaction.message_id] = {}
        }
        if (!reactionsByMessage[reaction.message_id][reaction.emoji]) {
          reactionsByMessage[reaction.message_id][reaction.emoji] = []
        }
        reactionsByMessage[reaction.message_id][reaction.emoji].push(reaction)
      })

      setMessageReactions(reactionsByMessage)
    } catch (err) {
      console.error('Failed to fetch reactions:', err)
    }
  }

  const addReaction = async (messageId, emoji) => {
    if (!session?.user?.id) return

    try {
      // Check if user already reacted with this emoji
      const existingReaction = messageReactions[messageId]?.[emoji]?.find(
        r => r.user_id === session.user.id
      )

      if (existingReaction) {
        // Remove reaction
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existingReaction.id)

        setMessageReactions(prev => {
          const updated = { ...prev }
          if (updated[messageId]?.[emoji]) {
            updated[messageId][emoji] = updated[messageId][emoji].filter(
              r => r.id !== existingReaction.id
            )
            if (updated[messageId][emoji].length === 0) {
              delete updated[messageId][emoji]
            }
            if (Object.keys(updated[messageId]).length === 0) {
              delete updated[messageId]
            }
          }
          return updated
        })
      } else {
        // Add reaction
        const { data, error } = await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_id: session.user.id,
            emoji: emoji
          })
          .select()
          .single()

        if (error) throw error

        setMessageReactions(prev => ({
          ...prev,
          [messageId]: {
            ...prev[messageId],
            [emoji]: [...(prev[messageId]?.[emoji] || []), data]
          }
        }))
      }

      setReactionMenuOpen(null)
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
      toast.error('Failed to add reaction')
    }
  }

  const removeReaction = async (messageId, emoji, userId) => {
    if (!session?.user?.id || session.user.id !== userId) return

    try {
      const reaction = messageReactions[messageId]?.[emoji]?.find(r => r.user_id === userId)
      if (!reaction) return

      await supabase
        .from('message_reactions')
        .delete()
        .eq('id', reaction.id)

      setMessageReactions(prev => {
        const updated = { ...prev }
        if (updated[messageId]?.[emoji]) {
          updated[messageId][emoji] = updated[messageId][emoji].filter(
            r => r.id !== reaction.id
          )
          if (updated[messageId][emoji].length === 0) {
            delete updated[messageId][emoji]
          }
          if (Object.keys(updated[messageId]).length === 0) {
            delete updated[messageId]
          }
        }
        return updated
      })
    } catch (err) {
      console.error('Failed to remove reaction:', err)
      toast.error('Failed to remove reaction')
    }
  }

  const getReactionsForMessage = (messageId) => {
    return messageReactions[messageId] || {}
  }

  const getUserReaction = (messageId, userId) => {
    const reactions = messageReactions[messageId] || {}
    for (const [emoji, reactionList] of Object.entries(reactions)) {
      const userReaction = reactionList.find(r => r.user_id === userId)
      if (userReaction) return emoji
    }
    return null
  }

  const openReactionMenu = (messageId, event) => {
    event.preventDefault()
    setReactionMenuOpen({
      messageId,
      x: event.clientX,
      y: event.clientY
    })
  }

  const ReactionMenu = () => {
    if (!reactionMenuOpen) return null

    return {
      messageId: reactionMenuOpen.messageId,
      x: reactionMenuOpen.x,
      y: reactionMenuOpen.y,
      reactions: REACTIONS.map(emoji => ({
        emoji,
        onClick: () => addReaction(reactionMenuOpen.messageId, emoji)
      }))
    }
  }

  return {
    REACTIONS,
    reactionMenuOpen,
    messageReactions,
    fetchMessageReactions,
    addReaction,
    removeReaction,
    getReactionsForMessage,
    getUserReaction,
    openReactionMenu
  }
}
