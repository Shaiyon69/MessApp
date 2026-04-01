import React from 'react'

export default function TypingIndicator({ typingUsers = [] }) {
  if (typingUsers.length === 0) return null

  const getTypingText = () => {
    const names = typingUsers.map(u => u.username)
    
    if (names.length === 1) {
      return `${names[0]} is typing...`
    } else if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`
    } else if (names.length === 3) {
      return `${names[0]}, ${names[1]}, and ${names[2]} are typing...`
    } else {
      return `${names.length} people are typing...`
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] italic">
      <div className="flex items-center gap-1">
        <div className="flex gap-1">
          <div className="w-1 h-1 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-1 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1 h-1 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
      <span>{getTypingText()}</span>
    </div>
  )
}

export function ReadReceipts({ 
  messageId, 
  readReceipts = {}, 
  totalRecipients = 1,
  showDetails = false,
  currentUserId 
}) {
  const messageReceipts = readReceipts[messageId] || {}
  const readCount = Object.keys(messageReceipts).length
  const isRead = readCount >= totalRecipients

  if (!showDetails && readCount === 0) return null

  const getReadIcon = () => {
    if (readCount === 0) {
      return <span className="text-[var(--text-muted)]">✓</span>
    } else if (isRead) {
      return <span className="text-blue-400">✓✓</span>
    } else {
      return <span className="text-[var(--text-secondary)]">✓✓</span>
    }
  }

  const getReadText = () => {
    if (readCount === 0) return 'Not read yet'
    if (isRead) return `Read by ${readCount} of ${totalRecipients}`
    return `Read by ${readCount} of ${totalRecipients}`
  }

  if (!showDetails) {
    return (
      <div className="flex items-center gap-1" title={getReadText()}>
        {getReadIcon()}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      {getReadIcon()}
      <span>{getReadText()}</span>
      {readCount > 0 && (
        <div className="flex -space-x-2">
          {Object.values(messageReceipts).slice(0, 3).map((receipt, index) => (
            <div
              key={index}
              className="w-4 h-4 bg-indigo-500 rounded-full border-2 border-[var(--bg-surface)] flex items-center justify-center"
              title={`${receipt.username} read this`}
            >
              <span className="text-[6px] text-white font-bold">
                {receipt.username.charAt(0).toUpperCase()}
              </span>
            </div>
          ))}
          {readCount > 3 && (
            <div className="w-4 h-4 bg-[var(--bg-element)] rounded-full border-2 border-[var(--bg-surface)] flex items-center justify-center">
              <span className="text-[6px] text-[var(--text-muted)] font-bold">
                +{readCount - 3}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
