/**
 * Messenger-style options sheet: rises from the bottom edge and covers up to
 * about half the screen, instead of a small popout next to the row. Portalled
 * to <body> so no scroll container or stacking context can clip it.
 *
 * The backdrop closes on click, after the tap has fully ended on it, so no part
 * of that tap reaches the row underneath once the sheet is gone. The click that
 * ends the long press which opened the sheet cannot close it: that press went
 * down on the row, so its click targets the rows' common ancestor instead.
 *
 * Drag the grab handle or header: down to dismiss, up to expand to near full
 * height (and back down to collapse) — but only as far as its options reach;
 * a short list has nothing to expand into. A flick counts as much as a drag.
 * The item list stays a normal scroller, so dragging only starts from the top.
 *
 * Motion is transform-only and written straight to the DOM — no React render
 * per pointermove, no height animation (layout) — so it stays on the
 * compositor. The sheet is sized to its content (capped near full height);
 * "collapsed" is that box translated down until at most ~60% of the screen shows.
 *
 * On a PC-sized screen with a mouse (and always in the desktop app) the same
 * props render a small context menu at the pointer instead (ContextMenu below).
 *
 * `items` are `{ label, Icon, onSelect, danger }`; falsy entries are skipped so
 * callers can inline their conditions. Extra props (e.g. data attributes that a
 * caller's click-away listener keys on) land on the root, backdrop included, so
 * that listener leaves the backdrop tap to this component's animated close.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GroupItem } from './SettingsGroup'
import { isDesktopApp } from '../../lib/desktopNotify'

const EXPANDED_VH = 92
const COLLAPSED_MAX_VH = 60
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)' // iOS sheet curve
const SETTLE_MS = 380
const FLICK_PX_PER_MS = 0.5
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const usesContextMenu = () => {
  try {
    return isDesktopApp() || Boolean(window.matchMedia?.('(pointer: fine) and (min-width: 768px)').matches)
  } catch {
    return false
  }
}

/* Where the last press or right-click landed, so the menu opens there. A
   keyboard-opened menu uses the focused element instead. */
let lastPointer = null
if (typeof window !== 'undefined') {
  const remember = (event) => { lastPointer = { x: event.clientX, y: event.clientY } }
  window.addEventListener('pointerdown', remember, true)
  window.addEventListener('contextmenu', remember, true)
  window.addEventListener('keydown', () => { lastPointer = null }, true)
}

export default function ActionSheet(props) {
  const [asMenu] = useState(usesContextMenu)
  return asMenu ? <ContextMenu {...props} /> : <BottomSheet {...props} />
}

const MENU_WIDTH = 240
const EDGE = 8

// No header: like Discord's, the menu sits on the row it belongs to.
function ContextMenu({ header: _header, items, onClose, ...rest }) {
  const menuRef = useRef(null)
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  const [position, setPosition] = useState(null)

  // Place at the pointer, flipped and clamped so it never leaves the window.
  useLayoutEffect(() => {
    const menu = menuRef.current
    const rect = opener.current?.getBoundingClientRect?.()
    const point = lastPointer || (rect ? { x: rect.left, y: rect.bottom } : { x: window.innerWidth / 2, y: window.innerHeight / 3 })
    const { offsetWidth: width, offsetHeight: height } = menu
    let x = point.x
    let y = point.y
    if (x + width > window.innerWidth - EDGE) x = Math.max(EDGE, x - width)
    if (y + height > window.innerHeight - EDGE) y = Math.max(EDGE, y - height)
    setPosition({ x, y })
    menu.querySelector('button')?.focus({ preventScroll: true })
  }, [])

  const close = () => {
    onClose()
    opener.current?.focus?.({ preventScroll: true })
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') return close()
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const buttons = [...menuRef.current.querySelectorAll('button')]
      const index = buttons.indexOf(document.activeElement)
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1
      buttons[(next + buttons.length) % buttons.length]?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return createPortal(
    <div {...rest} className="fixed inset-0 z-[200]">
      {/* Transparent catcher: any click or right-click outside closes the menu. */}
      <div className="absolute inset-0" onClick={close} onContextMenu={(event) => { event.preventDefault(); close() }} aria-hidden="true" />
      <div
        ref={menuRef}
        role="menu"
        aria-label={rest['aria-label']}
        className="ios-sheet menu-glass absolute flex max-h-[min(70vh,32rem)] flex-col overflow-hidden rounded-xl py-1 shadow-2xl"
        style={{ width: MENU_WIDTH, left: position?.x ?? -9999, top: position?.y ?? -9999 }}
      >
        <div className="custom-scrollbar seg-group seg-plain min-h-0 overflow-y-auto px-1 pt-1">
          {items.filter(Boolean).map(({ label, Icon, onSelect, danger }) => (
            <GroupItem key={label} role="menuitem" onClick={() => { onClose(); onSelect() }} className={`min-h-9 gap-3 py-1.5 type-label font-semibold ${danger ? 'text-red-400' : ''}`}>
              {Icon && <Icon size={16} aria-hidden="true" className={danger ? '' : 'text-[var(--text-muted)]'} />}
              {label}
            </GroupItem>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

function BottomSheet({ header, items, onClose, ...rest }) {
  const sheetRef = useRef(null)
  const backdropRef = useRef(null)
  const snaps = useRef({ expanded: 0, collapsed: 0, closed: 0 })
  const y = useRef(0)
  const drag = useRef(null)
  const closing = useRef(false)

  const apply = (nextY, animate) => {
    const { collapsed, closed } = snaps.current
    y.current = nextY
    const transition = (property) => (animate && !reducedMotion() ? `${property} ${SETTLE_MS}ms ${EASE}` : 'none')
    sheetRef.current.style.transition = transition('transform')
    sheetRef.current.style.transform = `translate3d(0, ${nextY}px, 0)`
    // Backdrop is fully dark at or above collapsed and fades out on the way to closed.
    backdropRef.current.style.transition = transition('opacity')
    backdropRef.current.style.opacity = String(Math.min(1, Math.max(0, (closed - nextY) / (closed - collapsed || 1))))
  }

  const dismiss = () => {
    if (closing.current) return
    closing.current = true
    apply(snaps.current.closed, true)
    setTimeout(onClose, reducedMotion() ? 0 : SETTLE_MS)
  }

  // Measure, park the sheet off-screen, then animate up to collapsed next frame.
  useLayoutEffect(() => {
    const sheetHeight = sheetRef.current.offsetHeight
    const collapsedHeight = Math.min(sheetHeight, window.innerHeight * COLLAPSED_MAX_VH / 100)
    snaps.current = { expanded: 0, collapsed: sheetHeight - collapsedHeight, closed: sheetHeight }
    apply(sheetHeight, false)
    const frame = requestAnimationFrame(() => apply(snaps.current.collapsed, true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const onPointerDown = (event) => {
    if (closing.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startPointer: event.clientY, startY: y.current, lastPointer: event.clientY, lastTime: event.timeStamp, velocity: 0 }
  }

  const onPointerMove = (event) => {
    const d = drag.current
    if (!d) return
    const dt = event.timeStamp - d.lastTime
    if (dt > 0) d.velocity = (event.clientY - d.lastPointer) / dt
    d.lastPointer = event.clientY
    d.lastTime = event.timeStamp
    // Hard stop at the top: pulling further would only lift the sheet off the
    // bottom edge and show a gap under the last option.
    apply(Math.max(0, d.startY + event.clientY - d.startPointer), false)
  }

  const onPointerUp = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    const { expanded, collapsed, closed } = snaps.current
    const current = y.current
    if (d.velocity > FLICK_PX_PER_MS) return current < collapsed ? apply(collapsed, true) : dismiss()
    if (d.velocity < -FLICK_PX_PER_MS) return apply(expanded, true)
    // Slow release: nearest stop, with close needing a third of the visible sheet.
    if (current > collapsed + (closed - collapsed) / 3) return dismiss()
    apply(current < collapsed / 2 ? expanded : collapsed, true)
  }

  return createPortal(
    <div {...rest} role="dialog" aria-modal="true" className="fixed inset-0 z-[200] flex items-end justify-center">
      {/* preventDefault on pointerdown keeps the tap from focusing or
          text-selecting anything; the close itself waits for the click. */}
      <div ref={backdropRef} className="premium-backdrop absolute inset-0 opacity-0" onPointerDown={(event) => event.preventDefault()} onClick={dismiss} aria-hidden="true" />
      {/* menu-glass: under Liquid Glass this sheet keeps its refractive glass
          (black float tint in dark) instead of the flat --lg-flat fill. */}
      <div
        ref={sheetRef}
        className="ios-sheet menu-glass relative flex w-full max-w-lg flex-col rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))] will-change-transform"
        style={{ maxHeight: `${EXPANDED_VH}dvh`, transform: 'translate3d(0, 100%, 0)' }}
      >
        <div className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[var(--app-accent-50)]" aria-hidden="true" />
          {header ? <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3">{header}</div> : <div className="h-3" />}
        </div>
        <div className="custom-scrollbar seg-group seg-plain min-h-0 overflow-y-auto overscroll-contain px-3 pt-1">
          {items.filter(Boolean).map(({ label, Icon, onSelect, danger }) => (
            <GroupItem key={label} onClick={() => { onClose(); onSelect() }} className={`min-h-12 gap-4 py-2 type-body font-semibold ${danger ? 'text-red-400' : ''}`}>
              {Icon && <Icon size={20} aria-hidden="true" className={danger ? '' : 'text-[var(--text-muted)]'} />}
              {label}
            </GroupItem>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
