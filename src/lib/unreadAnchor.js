/* Where the "New messages" divider goes: the first message from someone else
   newer than the read pointer captured when the conversation opened. No
   pointer (never read) means no divider rather than one above everything. */
export const firstUnreadIndex = (messages, anchorAt, ownId) => {
  const anchor = Date.parse(anchorAt)
  if (Number.isNaN(anchor)) return -1
  return messages.findIndex(message => message?.profile_id !== ownId && Date.parse(message?.created_at) > anchor)
}

export const countUnreadFrom = (messages, index, ownId) => {
  if (index < 0) return 0
  return messages.slice(index).filter(message => message?.profile_id !== ownId).length
}
