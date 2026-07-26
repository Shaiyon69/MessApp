import { useCallback, useEffect, useRef, useState } from 'react'
import { beginNativeMiniPlayerDrag } from '../lib/nativeMiniPlayerDrag.js'

const VIEWPORT_GUTTER = 8
const KEYBOARD_STEP = 20

function readStoredPosition(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey))
    if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) {
      return { x: stored.x, y: stored.y }
    }
  } catch {
    // A stale or blocked localStorage value should not prevent the player opening.
  }

  return null
}

function createDragProxy(rect) {
  if (typeof document === 'undefined' || !document.body) return null
  const proxy = document.createElement('div')
  proxy.className = 'floating-mini-player-drag-proxy'
  proxy.setAttribute('aria-hidden', 'true')
  Object.assign(proxy.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  })
  document.body.appendChild(proxy)
  return proxy
}

function removeNativeDragListeners(drag) {
  if (!drag || typeof window === 'undefined') return
  if (drag.frameId != null) {
    window.cancelAnimationFrame(drag.frameId)
    drag.frameId = null
  }
  if (drag.moveEventName && drag.moveListener) {
    window.removeEventListener(drag.moveEventName, drag.moveListener, true)
  }
  if (drag.finishListener) {
    window.removeEventListener('pointerup', drag.finishListener, true)
    window.removeEventListener('pointercancel', drag.finishListener, true)
  }
}

function removeNativeDragMoveListener(drag) {
  if (!drag || typeof window === 'undefined') return
  if (drag.frameId != null) {
    window.cancelAnimationFrame(drag.frameId)
    drag.frameId = null
  }
  if (!drag.moveEventName || !drag.moveListener) return
  window.removeEventListener(drag.moveEventName, drag.moveListener, true)
  drag.moveEventName = null
  drag.moveListener = null
}

export function clampMiniPlayerPosition(position, playerRect, viewport) {
  const width = Math.min(playerRect?.width || 0, viewport.width)
  const height = Math.min(playerRect?.height || 0, viewport.height)
  const minX = Math.min(VIEWPORT_GUTTER, Math.max(0, viewport.width - width))
  const minY = Math.min(VIEWPORT_GUTTER, Math.max(0, viewport.height - height))
  const maxX = Math.max(minX, viewport.width - width - VIEWPORT_GUTTER)
  const maxY = Math.max(minY, viewport.height - height - VIEWPORT_GUTTER)

  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y))
  }
}

export default function useFloatingMiniPlayer(storageKey) {
  const playerRef = useRef(null)
  const dragRef = useRef(null)
  const positionRef = useRef(readStoredPosition(storageKey))
  const [position, setPosition] = useState(positionRef.current)

  const getViewport = useCallback(() => ({
    width: window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth,
    height: window.visualViewport?.height || document.documentElement.clientHeight || window.innerHeight
  }), [])

  const setClampedPosition = useCallback((nextPosition) => {
    const rect = playerRef.current?.getBoundingClientRect()
    if (!rect) return
    const next = clampMiniPlayerPosition(nextPosition, rect, getViewport())
    positionRef.current = next
    setPosition(next)
  }, [getViewport])

  const persistPosition = useCallback(() => {
    if (!storageKey || !positionRef.current) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(positionRef.current))
    } catch {
      // Storage can be unavailable in privacy modes; dragging still works for the session.
    }
  }, [storageKey])

  const finishDragging = useCallback((event) => {
    const drag = dragRef.current
    if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return
    if (drag.nativeActive && !event?.nativePosition) return
    removeNativeDragListeners(drag)
    if (drag.nativeFallbackTimer != null) window.clearTimeout(drag.nativeFallbackTimer)
    const finalPosition = event?.nativePosition || drag.pendingPosition || positionRef.current
    const player = playerRef.current
    if (finalPosition && player) {
      player.style.left = `${finalPosition.x}px`
      player.style.top = `${finalPosition.y}px`
      player.style.right = 'auto'
      player.style.bottom = 'auto'
      player.style.transform = ''
      positionRef.current = finalPosition
      setPosition(finalPosition)
    }
    drag.proxy?.remove()
    if (player) player.style.opacity = drag.previousOpacity
    if (player) player.style.visibility = drag.previousVisibility
    player?.classList.remove('is-dragging')
    drag.handle?.setAttribute('aria-grabbed', 'false')
    dragRef.current = null
    persistPosition()
    void drag.nativeControl?.complete()
  }, [persistPosition])

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    const rect = playerRef.current?.getBoundingClientRect()
    if (!rect) return

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startPosition = { x: rect.left, y: rect.top }
    const player = playerRef.current
    const useProxy = event.pointerType === 'touch' || window.matchMedia?.('(max-width: 767px)')?.matches
    const proxy = useProxy ? createDragProxy(rect) : null
    const previousOpacity = player.style.opacity
    const previousVisibility = player.style.visibility
    player.style.left = `${rect.left}px`
    player.style.top = `${rect.top}px`
    player.style.right = 'auto'
    player.style.bottom = 'auto'
    player.style.transform = ''
    positionRef.current = startPosition
    player.classList.add('is-dragging')
    if (proxy) player.style.visibility = 'hidden'
    event.currentTarget.setAttribute('aria-grabbed', 'true')
    const drag = {
      pointerId: event.pointerId,
      handle: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      viewport: getViewport(),
      proxy,
      previousOpacity,
      previousVisibility,
      frameId: null,
      pendingPosition: startPosition
    }
    const getPointerPosition = (pointerEvent) => {
      const coalescedEvents = pointerEvent.getCoalescedEvents?.()
      const pointer = coalescedEvents?.length ? coalescedEvents[coalescedEvents.length - 1] : pointerEvent
      return clampMiniPlayerPosition({
        x: drag.originX + pointer.clientX - drag.startX,
        y: drag.originY + pointer.clientY - drag.startY
      }, { width: drag.width, height: drag.height }, drag.viewport)
    }
    const moveListener = (pointerEvent) => {
      if (dragRef.current !== drag || drag.pointerId !== pointerEvent.pointerId) return
      const next = getPointerPosition(pointerEvent)
      drag.pendingPosition = next
      positionRef.current = next
      if (drag.frameId != null) return
      drag.frameId = window.requestAnimationFrame(() => {
        drag.frameId = null
        if (dragRef.current !== drag) return
        const movingLayer = drag.proxy || playerRef.current
        const pending = drag.pendingPosition
        if (movingLayer && pending) {
          movingLayer.style.transform = `translate3d(${pending.x - drag.originX}px, ${pending.y - drag.originY}px, 0)`
        }
      })
    }
    const finishListener = (pointerEvent) => {
      if (drag.nativeActive) {
        drag.pendingPosition = getPointerPosition(pointerEvent)
        positionRef.current = drag.pendingPosition
        if (drag.nativeFallbackTimer == null) {
          drag.nativeFallbackTimer = window.setTimeout(() => {
            if (dragRef.current !== drag) return
            drag.nativeActive = false
            void drag.nativeControl?.cancel()
            finishDragging({ pointerId: drag.pointerId })
          }, 350)
        }
        return
      }
      finishDragging(pointerEvent)
    }
    drag.moveEventName = 'pointermove'
    drag.moveListener = moveListener
    drag.finishListener = finishListener
    dragRef.current = drag
    window.addEventListener(drag.moveEventName, moveListener, { capture: true, passive: true })
    window.addEventListener('pointerup', finishListener, { capture: true, passive: true })
    window.addEventListener('pointercancel', finishListener, { capture: true, passive: true })

    const compact = window.matchMedia?.('(max-width: 767px)')?.matches === true
    if (event.pointerType === 'touch' && compact) {
      const nativeOptions = {
        pointerType: event.pointerType,
        compact,
        startX: event.clientX,
        startY: event.clientY,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: drag.viewport.width,
        viewportHeight: drag.viewport.height,
        gutter: VIEWPORT_GUTTER,
        scale: window.devicePixelRatio || 1
      }

      void beginNativeMiniPlayerDrag(nativeOptions, (result, control) => {
        if (dragRef.current !== drag) {
          void control.cancel()
          return
        }
        const nativePosition = Number.isFinite(result?.x) && Number.isFinite(result?.y)
          ? clampMiniPlayerPosition(
              { x: result.x, y: result.y },
              { width: drag.width, height: drag.height },
              drag.viewport
            )
          : drag.pendingPosition
        finishDragging({
          pointerId: drag.pointerId,
          nativePosition
        })
      }).then((control) => {
        if (!control) return
        if (dragRef.current !== drag) {
          void control.cancel()
          return
        }

        drag.nativeActive = true
        drag.nativeControl = control
        removeNativeDragMoveListener(drag)
        drag.proxy?.remove()
        drag.proxy = null
      })
    }
  }, [finishDragging, getViewport])

  const handleKeyDown = useCallback((event) => {
    const movement = {
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowDown: [0, KEYBOARD_STEP]
    }[event.key]
    if (!movement) return

    event.preventDefault()
    const rect = playerRef.current?.getBoundingClientRect()
    if (!rect) return
    const current = positionRef.current || { x: rect.left, y: rect.top }
    setClampedPosition({ x: current.x + movement[0], y: current.y + movement[1] })
    window.requestAnimationFrame(persistPosition)
  }, [persistPosition, setClampedPosition])

  const resetPosition = useCallback(() => {
    void dragRef.current?.nativeControl?.cancel()
    if (dragRef.current?.nativeFallbackTimer != null) {
      window.clearTimeout(dragRef.current.nativeFallbackTimer)
    }
    removeNativeDragListeners(dragRef.current)
    dragRef.current?.proxy?.remove()
    if (playerRef.current && dragRef.current) {
      playerRef.current.style.opacity = dragRef.current.previousOpacity
      playerRef.current.style.visibility = dragRef.current.previousVisibility
    }
    playerRef.current?.classList.remove('is-dragging')
    dragRef.current?.handle?.setAttribute('aria-grabbed', 'false')
    dragRef.current = null
    positionRef.current = null
    setPosition(null)
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // The default CSS position is still restored even if storage is blocked.
    }
  }, [storageKey])

  useEffect(() => {
    if (!positionRef.current) return undefined

    const keepInsideViewport = () => setClampedPosition(positionRef.current)
    const frame = window.requestAnimationFrame(keepInsideViewport)
    window.addEventListener('resize', keepInsideViewport)
    window.visualViewport?.addEventListener('resize', keepInsideViewport)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', keepInsideViewport)
      window.visualViewport?.removeEventListener('resize', keepInsideViewport)
    }
  }, [setClampedPosition])

  useEffect(() => () => {
    const drag = dragRef.current
    void drag?.nativeControl?.cancel()
    if (drag?.nativeFallbackTimer != null) window.clearTimeout(drag.nativeFallbackTimer)
    removeNativeDragListeners(drag)
    drag?.proxy?.remove()
    if (playerRef.current && drag) {
      playerRef.current.style.opacity = drag.previousOpacity
      playerRef.current.style.visibility = drag.previousVisibility
    }
  }, [])

  return {
    playerRef,
    floatingStyle: position
      ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }
      : undefined,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onLostPointerCapture: finishDragging,
      onKeyDown: handleKeyDown,
      onDoubleClick: resetPosition
    }
  }
}
