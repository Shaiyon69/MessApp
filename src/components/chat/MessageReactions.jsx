import React from 'react'

export default function MessageReactions({ 
  reactions, 
  onReactionClick, 
  currentUserId, 
  compact = false 
}) {
  if (!reactions || Object.keys(reactions).length === 0) return null

  const reactionEntries = Object.entries(reactions)
    .map(([emoji, reactionList]) => ({
      emoji,
      count: reactionList.length,
      users: reactionList,
      hasCurrentUser: reactionList.some(r => r.user_id === currentUserId)
    }))
    .sort((a, b) => b.count - a.count)

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {reactionEntries.map(({ emoji, count, hasCurrentUser }) => (
          <button
            key={emoji}
            onClick={() => onReactionClick(emoji)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm transition-colors cursor-pointer ${
              hasCurrentUser 
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                : 'bg-[var(--bg-element)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
            }`}
            title={`${count} reaction${count > 1 ? 's' : ''}`}
          >
            <span>{emoji}</span>
            <span className="text-xs">{count}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {reactionEntries.map(({ emoji, count, users, hasCurrentUser }) => (
        <div
          key={emoji}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm cursor-pointer transition-colors ${
            hasCurrentUser 
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
              : 'bg-[var(--bg-element)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
          }`}
          onClick={() => onReactionClick(emoji)}
          title={`${users.map(u => u.profiles?.username || 'Unknown').join(', ')} reacted with ${emoji}`}
        >
          <span className="text-base">{emoji}</span>
          <span className="text-xs font-medium">{count}</span>
        </div>
      ))}
    </div>
  )
}
