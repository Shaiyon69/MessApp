/** Routes a DM-list entry to the owner-provided open/create handler safely. */
export function openDmEntry(entry, { selectDm, createOrOpenDm, onMissing } = {}) {
  if (entry?.dm_room_id && typeof selectDm === 'function') {
    selectDm(entry)
    return true
  }
  if (entry?.profiles?.id && typeof createOrOpenDm === 'function') {
    createOrOpenDm(entry)
    return true
  }
  onMissing?.({ profileId: entry?.profiles?.id || null, hasRoomId: Boolean(entry?.dm_room_id) })
  return false
}
