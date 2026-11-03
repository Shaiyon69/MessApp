/* Database changes arrive as Broadcast on two private topics (user:<id> and
   room:<id>, see supabase/migrations/20261103155000_broadcast_realtime.sql).
   Each topic is joined once; components listen here by event name instead of
   opening their own Realtime channels. */
const listeners = new Map()

export function onRealtime(event, listener) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(listener)
  return () => listeners.get(event)?.delete(listener)
}

export function emitRealtime(event, payload) {
  for (const listener of [...(listeners.get(event) || [])]) listener(payload)
}
