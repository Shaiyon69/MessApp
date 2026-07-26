const belongsToConversation = (message, field, targetId) =>
  Boolean(message?.id && message[field] === targetId)

export function reconcileAuthoritativeMessages(previous = [], incoming = [], field, targetId) {
  const incomingById = new Map(
    incoming
      .filter(message => belongsToConversation(message, field, targetId))
      .map(message => [message.id, message])
  )

  // The server result is authoritative for persisted rows. Preserve only
  // optimistic/retry rows that have not reached the server yet.
  previous
    .filter(message =>
      belongsToConversation(message, field, targetId) &&
      (message.__local || message.__retry_payload) &&
      !incomingById.has(message.id)
    )
    .forEach(message => incomingById.set(message.id, message))

  return Array.from(incomingById.values())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

export function removeMessageById(messages = [], messageId) {
  return messages.filter(message => message?.id !== messageId)
}
