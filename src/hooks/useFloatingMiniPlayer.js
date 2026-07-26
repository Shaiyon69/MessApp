import { useCallback, useEffect, useRef, useState } from 'react'

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
  const [isDragging, setIsDragging] = useState(false)

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
    if (drag.frameId != null) window.cancelAnimationFrame(drag.frameId)
    const finalPosition = drag.pendingPosition || positionRef.current
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
    dragRef.current = null
    setIsDragging(false)
    persistPosition()
  }, [persistPosition])

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    const rect = playerRef.current?.getBoundingClientRect()
    if (!rect) return

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startPosition = { x: rect.left, y: rect.top }
    const player = playerRef.current
    player.style.left = `${rect.left}px`
    player.style.top = `${rect.top}px`
    player.style.right = 'auto'
    player.style.bottom = 'auto'
    player.style.transform = ''
    positionRef.current = startPosition
    setPosition(startPosition)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      pendingPosition: startPosition,
      frameId: null
    }
    setIsDragging(true)
  }, [])

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.pendingPosition = clampMiniPlayerPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    }, { width: drag.width, height: drag.height }, getViewport())
    positionRef.current = drag.pendingPosition
    if (drag.frameId != null) return
    drag.frameId = window.requestAnimationFrame(() => {
      const activeDrag = dragRef.current
      const player = playerRef.current
      if (!activeDrag || activeDrag !== drag || !player) return
      activeDrag.frameId = null
      const next = activeDrag.pendingPosition
      player.style.transform = `translate3d(${next.x - activeDrag.originX}px, ${next.y - activeDrag.originY}px, 0)`
    })
  }, [getViewport])

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
    dragRef.current = null
    positionRef.current = null
    setPosition(null)
    setIsDragging(false)
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
    if (dragRef.current?.frameId != null) window.cancelAnimationFrame(dragRef.current.frameId)
  }, [])

  return {
    playerRef,
    isDragging,
    floatingStyle: position
      ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }
      : undefined,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDragging,
      onPointerCancel: finishDragging,
      onLostPointerCapture: finishDragging,
      onKeyDown: handleKeyDown,
      onDoubleClick: resetPosition
    }
  }
}
