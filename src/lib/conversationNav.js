/* Keyboard stepping through the rendered conversation rows (`data-conv-row`),
   so the order always matches what the list shows: pins, tab, server. */

// Index of the row to move to, or -1 when there is none in that direction.
export const stepRowIndex = (rows, from, dir, unreadOnly = false) => {
  for (let i = from + dir; i >= 0 && i < rows.length; i += dir) {
    if (!unreadOnly || rows[i].unread) return i
  }
  return -1
}

export const isEditableTarget = (el) => Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"]'))
