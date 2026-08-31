/**
 * Focus and sizing helpers for the message composer.
 *
 * Blurring `document.activeElement` is too blunt: on Android WebView a
 * programmatic blur does not reliably dismiss the soft keyboard, so the IME
 * stays open while focus has moved away and every keystroke lands nowhere.
 * Target the composer explicitly instead of whatever happens to be focused.
 */
export const blurComposer = () => document.querySelector('[data-message-composer="true"]')?.blur()

/** About five lines of body text, after which the field scrolls internally.
 *  Capping matters more on a phone than on desktop: the keyboard and a
 *  free-growing composer will happily eat the whole conversation. */
export const COMPOSER_MAX_PX = 132

export function composerHeight(scrollHeight, max = COMPOSER_MAX_PX) {
  return Math.min(Math.max(scrollHeight, 0), max)
}

/**
 * Sizes the composer to its content. The textarea is uncontrolled, so this is
 * driven from `input` and from every path that empties or refills the field
 * behind React's back.
 */
export function resizeComposer(element) {
  if (!element) return
  // Collapse first, or the field only ever grows: scrollHeight can never report
  // less than the height already set on the element.
  element.style.height = 'auto'
  const content = element.scrollHeight
  element.style.height = `${composerHeight(content)}px`
  element.style.overflowY = content > COMPOSER_MAX_PX ? 'auto' : 'hidden'
}

/**
 * Whether Enter should send rather than insert a newline. Asks what the user is
 * typing with, not how wide the window is: a resized desktop window still has a
 * hardware keyboard, and a large tablet still has an on-screen one. Read at
 * keypress rather than cached — either can change mid-session.
 */
export const enterSends = () => !window.matchMedia?.('(pointer: coarse)')?.matches
