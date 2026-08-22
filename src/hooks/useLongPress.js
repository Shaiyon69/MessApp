/**
 * Hold-to-open for list rows: a touch long press, or a right-click on desktop,
 * calls `onLongPress(payload)`. Deliberately standalone — the message long press
 * in MessageElements is fused to swipe-to-reply gesture state and pointer
 * capture, so it cannot be shared.
 *
 * Called once per component; the returned `bind(payload)` builds the handlers
 * for each row, so the gesture refs stay at a fixed hook count no matter how
 * many rows render. One press at a time, so one set of refs is enough.
 *
 * Spread the handlers on the row's wrapper element, not on the inner button:
 * onClickCapture has to see the click before the button's own onClick to
 * suppress the tap that follows an activated press. Descendants marked
 * `data-no-long-press` (nested menu buttons, sub-lists) are ignored.
 */
import { useRef } from 'react'

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 10

export default function useLongPress(onLongPress) {
  const timer = useRef(null)
  const start = useRef(null)
  const activated = useRef(false)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }

  return (payload) => ({
    onContextMenu: (event) => {
      event.preventDefault()
      cancel()
      onLongPress(payload)
    },
    onPointerDown: (event) => {
      /* Cleared first thing, for every pointer type: when a menu opens the
         click that ends the press can land on the menu's own backdrop instead
         of this row, so onClickCapture never runs to clear it. */
      activated.current = false
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      if (event.target?.closest?.('[data-no-long-press]')) return
      cancel()
      start.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        activated.current = true
        navigator.vibrate?.(50)
        onLongPress(payload)
      }, LONG_PRESS_MS)
    },
    // Scrolling the list must never open a menu.
    onPointerMove: (event) => {
      if (!start.current) return
      if (Math.abs(event.clientX - start.current.x) > MOVE_CANCEL_PX || Math.abs(event.clientY - start.current.y) > MOVE_CANCEL_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClickCapture: (event) => {
      if (!activated.current) return
      activated.current = false
      event.preventDefault()
      event.stopPropagation()
    }
  })
}
