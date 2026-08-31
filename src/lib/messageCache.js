/** localStorage persistence for a conversation's recent messages. */
import { normalizeCachedAttachment, serializeAttachmentForCache } from './attachmentCache.js'

export const INITIAL_MESSAGE_LIMIT = 30

const cacheKey = (userId, targetId) => `local_chat_${userId}_${targetId}`

// Messages that failed to send are kept with their retry payload so an offline
// send survives a reload and can be flushed when connectivity returns. Messages
// still in flight are dropped instead: their server-side outcome is unknown, and
// resurrecting one risks a duplicate.
// ponytail: text retries only. Attachment payloads hold live File objects that do
// not survive JSON, so they are dropped; move the blobs to IndexedDB to persist them.
const isPersistableFailure = (message) =>
  message.__delivery_status === 'failed' && message.__retry_payload?.type === 'text'

export const safeCacheSave = (userId, targetId, dataArray) => {
  try {
    const persisted = dataArray
      .filter(message => message && (isPersistableFailure(message) || (!message.__local && !message.__retry_payload)))
      .slice(-INITIAL_MESSAGE_LIMIT)
      .map(message => {
        const persistedMessage = { ...message }
        persistedMessage.message_attachments = (persistedMessage.message_attachments || []).map(serializeAttachmentForCache)
        if (!isPersistableFailure(message)) {
          delete persistedMessage.__delivery_status
          delete persistedMessage.__local
          delete persistedMessage.__retry_payload
        }
        return persistedMessage
      })
    localStorage.setItem(cacheKey(userId, targetId), JSON.stringify(persisted))
  } catch (_err) {}
}

export const safeCacheLoad = (userId, targetId) => {
  try {
    return (JSON.parse(localStorage.getItem(cacheKey(userId, targetId))) || [])
      .slice(-INITIAL_MESSAGE_LIMIT)
      .map(message => ({
        ...message,
        message_attachments: (message.message_attachments || []).map(normalizeCachedAttachment)
      }))
  } catch (_err) {
    return []
  }
}
