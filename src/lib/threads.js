/** Thread replies by id, oldest first; later copies of a row win. */
export function mergeThreadReplies(current, incoming) {
  const byId = new Map((current || []).map(reply => [reply.id, reply]))
  for (const reply of incoming || []) {
    if (reply?.id) byId.set(reply.id, { ...byId.get(reply.id), ...reply })
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}
