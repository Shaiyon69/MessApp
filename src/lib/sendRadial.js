/**
 * The send button's hold-and-drag radial: three wedges above the button, each a
 * spoiler/disappearing combination that would otherwise take two taps in the
 * send-options menu. The geometry lives here so the picking rule stays testable
 * away from React, and so the wedges render from the same angles they hit-test
 * against.
 *
 * Angles are degrees counter-clockwise from "right", matching `Math.atan2`, and
 * the arc leans up-and-left because the send button sits in the bottom-right
 * corner of the composer.
 */

import { DISAPPEARING_OPTIONS } from './messageExpiry.js'

export const SEND_RADIAL_OPTIONS = [
  { id: 'timed', angle: 180, spoiler: false, timed: true },
  { id: 'both', angle: 135, spoiler: true, timed: true },
  { id: 'spoiler', label: 'Spoiler', angle: 90, spoiler: true, timed: false }
]

/**
 * The lifetimes a timed wedge cycles through while the thumb rests on it. They
 * are the menu's own choices, so the two halves of the control can never
 * disagree about what a disappearing message means.
 */
export const SEND_RADIAL_DURATIONS = DISAPPEARING_OPTIONS.filter(option => option.seconds)

/** How long a wedge is held before it steps to the next lifetime. */
export const SEND_RADIAL_CYCLE_MS = 1200

/**
 * @param {object} option an entry of SEND_RADIAL_OPTIONS
 * @param {number} step how many cycle ticks the wedge has been held for
 * @returns {object|null} a DISAPPEARING_OPTIONS entry, null for spoiler-only
 */
export function radialDuration(option, step = 0) {
  if (!option?.timed) return null
  return SEND_RADIAL_DURATIONS[step % SEND_RADIAL_DURATIONS.length]
}

/** Distance from the button centre to a wedge. */
export const SEND_RADIAL_PX = 84

/** Inside this, the thumb has not left the button and nothing is selected. */
export const SEND_RADIAL_DEAD_PX = 40

const ARC_DEGREES = 30

/**
 * @param {number} dx pointer travel right of the press origin
 * @param {number} dy pointer travel *up* from the press origin
 * @returns {number|null} index into SEND_RADIAL_OPTIONS, null when unselected
 */
export function pickSendRadial(dx, dy) {
  if (Math.hypot(dx, dy) < SEND_RADIAL_DEAD_PX) return null
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  // Wrapped difference, so a hair below straight-left still hits the 180 wedge.
  const index = SEND_RADIAL_OPTIONS.findIndex(option =>
    Math.abs(((option.angle - angle + 540) % 360) - 180) <= ARC_DEGREES)
  return index === -1 ? null : index
}

/**
 * The other gesture on the same button: when the composer is empty it records,
 * and holding it borrows the voice-note idiom every other messenger already
 * taught people — drag up to lock the recording and carry on hands-free, drag
 * anywhere else to throw it away.
 */
export const VOICE_HOLD_PX = 72

/** Half-width of the upward cone that locks; outside it, the drag cancels. */
const LOCK_CONE_DEGREES = 45

/**
 * @param {number} dx pointer travel right of the press origin
 * @param {number} dy pointer travel *up* from the press origin
 * @returns {'cancel'|'lock'|null}
 */
export function pickVoiceHold(dx, dy) {
  if (Math.hypot(dx, dy) < VOICE_HOLD_PX) return null
  // Only a drag within the cone around straight up locks. Left, right and down
  // all mean the same thing — the thumb is leaving, so throw the take away.
  return dy >= Math.abs(dx) * Math.tan((90 - LOCK_CONE_DEGREES) * Math.PI / 180)
    ? 'lock'
    : 'cancel'
}
