/* One label for a message's attachments, stored on messages.attachment_kind so
   push notifications can say what was sent. Items are composer pending files:
   { file, gifUrl, type }. */
const kindOf = (item) => {
  if (item?.gifUrl || item?.file?.type === 'image/gif') return 'gif'
  const type = item?.file?.type || ''
  if (type.startsWith('image/')) return 'photo'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return item.file.name?.startsWith('voice-message-') ? 'voice' : 'audio'
  return 'file'
}

export function attachmentKind(items) {
  const kinds = new Set((items || []).map(kindOf))
  if (kinds.size === 0) return null
  return kinds.size === 1 ? [...kinds][0] : 'mixed'
}
