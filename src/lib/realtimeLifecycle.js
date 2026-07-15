/** Small deterministic helpers for room-scoped Realtime lifecycle decisions. */
export function getRealtimeScope(view, channelId, dmRoomId) {
  return view === 'server'
    ? { targetId: channelId || null, field: 'channel_id' }
    : { targetId: dmRoomId || null, field: 'dm_room_id' }
}

export const getRealtimeRetryDelay = (attempt) => Math.min(500 * (2 ** Math.max(0, attempt - 1)), 8000)

export const shouldScheduleRealtimeRetry = ({ generation, currentGeneration, hasTimer }) =>
  generation === currentGeneration && !hasTimer

export const shouldVisibilityCatchUp = (visibilityState) => visibilityState === 'visible'
