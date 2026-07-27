const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)

export function getTouchMessageActionPosition(anchor, menuSize = {}, viewport = {}) {
  const rect = anchor?.rect
  if (!rect) return null

  const margin = 8
  const gap = 6
  const viewportWidth = viewport.width || window.innerWidth
  const viewportHeight = viewport.height || window.innerHeight
  const width = menuSize.width || 244
  const height = menuSize.height || 52
  const topOffset = menuSize.topOffset || 0
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const maxTop = Math.max(margin, viewportHeight - height - margin)

  // Mobile actions intentionally overlay the selected content. Right-hand
  // messages align to the right edge; incoming messages align to the left.
  const rawLeft = anchor.alignRight ? rect.right - width : rect.left
  const overlayBaseTop = clamp(rect.top + gap, margin, Math.max(margin, maxTop - topOffset))
  const overlaidTop = overlayBaseTop + topOffset

  return {
    messageId: anchor.messageId,
    left: clamp(rawLeft, margin, maxLeft),
    top: clamp(overlaidTop, margin, maxTop),
    alignRight: Boolean(anchor.alignRight),
    placement: 'overlay',
    rect: {
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  }
}
