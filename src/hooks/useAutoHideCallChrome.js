/**
 * Discord-style auto-hiding call chrome. Headers and control docks fade out
 * after a short idle period so video and screen shares own the whole surface,
 * and come back on the first pointer, touch, or key activity.
 *
 * Chrome only auto-hides while there is something visual to make room for:
 * an audio-only call or an open panel keeps its controls pinned, because
 * hiding them there would drop affordances without buying any screen space.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE_DELAY_MS = 3200
// Pointer moves fire far faster than the idle timer needs re-arming.
const RESCHEDULE_THROTTLE_MS = 120

/** Pure so the visibility policy can be asserted without a DOM. */
export function shouldAutoHideChrome({ hasVisualMedia = false, overlayOpen = false, chromeHeld = false } = {}) {
  return Boolean(hasVisualMedia) && !overlayOpen && !chromeHeld
}

export default function useAutoHideCallChrome({
  hasVisualMedia = false,
  overlayOpen = false,
  idleDelayMs = IDLE_DELAY_MS
} = {}) {
  const [chromeVisible, setChromeVisible] = useState(true)
  const chromeHeldRef = useRef(false)
  const hideTimerRef = useRef(null)
  const lastScheduleRef = useRef(0)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    if (!shouldAutoHideChrome({ hasVisualMedia, overlayOpen, chromeHeld: chromeHeldRef.current })) return
    lastScheduleRef.current = Date.now()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      setChromeVisible(false)
    }, idleDelayMs)
  }, [clearHideTimer, hasVisualMedia, idleDelayMs, overlayOpen])

  const revealChrome = useCallback(() => {
    setChromeVisible(true)
    // Skip the timer churn while a pointer sweeps across the stage, but always
    // re-arm once the pending timer has fired.
    if (hideTimerRef.current != null && Date.now() - lastScheduleRef.current < RESCHEDULE_THROTTLE_MS) return
    scheduleHide()
  }, [scheduleHide])

  // Pointing at (or tabbing into) the controls keeps them up so they can never
  // vanish out from under a click.
  const holdChrome = useCallback(held => {
    chromeHeldRef.current = held
    if (held) {
      clearHideTimer()
      setChromeVisible(true)
      return
    }
    scheduleHide()
  }, [clearHideTimer, scheduleHide])

  useEffect(() => {
    if (!shouldAutoHideChrome({ hasVisualMedia, overlayOpen, chromeHeld: chromeHeldRef.current })) {
      clearHideTimer()
      setChromeVisible(true)
      return undefined
    }
    scheduleHide()
    return clearHideTimer
  }, [clearHideTimer, hasVisualMedia, overlayOpen, scheduleHide])

  return {
    chromeVisible,
    revealChrome,
    /** Spread on the stage/root element that should count as user activity. */
    stageActivityProps: {
      onPointerMove: revealChrome,
      onPointerDown: revealChrome,
      onKeyDown: revealChrome
    },
    /** Spread on each chrome region so hover/focus pins it open. */
    chromeHoldProps: {
      onPointerEnter: () => holdChrome(true),
      onPointerLeave: () => holdChrome(false),
      onFocusCapture: () => holdChrome(true),
      onBlurCapture: () => holdChrome(false)
    }
  }
}
