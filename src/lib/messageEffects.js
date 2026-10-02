/**
 * iMessage-style effects, carried as inline markup inside `content`.
 *
 * Keeping them in the text rather than a column means they ride through DM
 * encryption, edits, retries and the message cache untouched, and need no
 * migration. Two forms:
 *   `{shake|some words}` — a word effect, rendered by remarkWordEffects
 *   `{!slam} rest`       — a whole-message effect, a prefix parseMessageEffect strips
 */

export const WORD_EFFECTS = ['big', 'small', 'shake', 'nod', 'explode', 'ripple', 'bloom', 'jitter']
export const BUBBLE_EFFECTS = ['slam', 'loud', 'gentle']
export const SCREEN_EFFECTS = ['confetti', 'balloons', 'fireworks', 'lasers', 'love', 'celebration']

// Word effects animated letter by letter; the rest move the span as one piece.
export const LETTER_EFFECTS = new Set(['explode', 'ripple', 'bloom', 'jitter'])

const MESSAGE_EFFECTS = [...BUBBLE_EFFECTS, ...SCREEN_EFFECTS]
const PREFIX = new RegExp(`^\\{!(${MESSAGE_EFFECTS.join('|')})\\} ?`)
const WORD_IN_TEXT = new RegExp(`\\{(${WORD_EFFECTS.join('|')})\\|([^{}|\\n]{1,200})\\}`, 'g')

/** Split a leading `{!effect}` off the text. Unknown names stay as text. */
export function parseMessageEffect(text) {
  if (typeof text !== 'string') return { effect: null, text }
  const match = PREFIX.exec(text)
  return match ? { effect: match[1], text: text.slice(match[0].length) } : { effect: null, text }
}

// iMessage's trigger phrases: saying one plays the effect with no markup.
// Lunar New Year is checked before plain New Year so it wins.
const KEYWORD_EFFECTS = [
  [/\bhappy (lunar|chinese) new year\b/i, 'celebration'],
  [/\bhappy new year\b/i, 'fireworks'],
  [/\bhappy (birthday|bday)\b/i, 'balloons'],
  [/\bcongrat(s|ulations)\b/i, 'confetti'],
  [/\bpew ?pew\b/i, 'lasers']
]

/** Screen effect a plain message earns from its wording, or null. */
export function keywordEffect(text) {
  if (typeof text !== 'string') return null
  return KEYWORD_EFFECTS.find(([pattern]) => pattern.test(text))?.[1] ?? null
}

export function withMessageEffect(text, effect) {
  return effect && MESSAGE_EFFECTS.includes(effect) && text ? `{!${effect}} ${text}` : text
}

/** Markup-free text, for previews and snippets. */
export function stripEffects(text) {
  if (typeof text !== 'string') return text
  return parseMessageEffect(text).text.replace(WORD_IN_TEXT, '$2')
}

/**
 * Wrap the selection in a word effect; with nothing selected, the whole
 * message (after any message-effect prefix). Existing markup inside the
 * selection is flattened first — effects don't nest.
 */
export function applyWordEffect(text, start, end, effect) {
  if (!WORD_EFFECTS.includes(effect)) return { text, caret: end }
  if (start === end) {
    const prefix = text.length - parseMessageEffect(text).text.length
    start = prefix
    end = text.length
  }
  const inner = stripEffects(text.slice(start, end)).replace(/[{}|\n]/g, ' ')
  if (!inner.trim()) return { text, caret: end }
  const wrapped = `{${effect}|${inner}}`
  return { text: text.slice(0, start) + wrapped + text.slice(end), caret: start + wrapped.length }
}

export const SCREEN_EFFECT_EVENT = 'messapp:screen-effect'
const FRESH_MS = 10_000
// StrictMode runs state initializers twice back to back; both get the answer.
const SAME_MOUNT_MS = 50
// ponytail: grows by one entry per effect message this session; prune if that ever matters.
const claimed = new Map()

/**
 * True once per just-sent message. Keyed on sender + content, not id: the
 * optimistic row's local id is swapped for the server one, which remounts
 * the bubble and would otherwise replay the effect.
 */
export function claimFreshEffect(message, now = Date.now()) {
  if (!(now - new Date(message?.created_at).getTime() < FRESH_MS)) return false
  const key = `${message.profile_id}|${message.content}`
  const at = claimed.get(key)
  if (at !== undefined) return now - at < SAME_MOUNT_MS
  claimed.set(key, now)
  return true
}

const OPAQUE_NODES = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html'])

const splitText = (value) => {
  const parts = []
  let cursor = 0
  WORD_IN_TEXT.lastIndex = 0
  let match
  while ((match = WORD_IN_TEXT.exec(value))) {
    if (match.index > cursor) parts.push({ type: 'text', value: value.slice(cursor, match.index) })
    parts.push({
      type: 'wordEffect',
      data: { hName: 'span', hProperties: { className: `fx fx-${match[1]}`, 'data-fx': match[1] } },
      children: [{ type: 'text', value: match[2] }]
    })
    cursor = match.index + match[0].length
  }
  if (!parts.length) return null
  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) })
  return parts
}

/**
 * remark plugin turning `{effect|text}` into a span. Same walk as
 * remarkMentions; it only sees single text nodes, so markdown inside the
 * braces (`{shake|**hi**}`) is left as typed.
 */
export function remarkWordEffects() {
  const walk = (node) => {
    if (!Array.isArray(node.children)) return
    const next = []
    for (const child of node.children) {
      const parts = child.type === 'text' ? splitText(child.value) : null
      if (parts) {
        next.push(...parts)
        continue
      }
      if (!OPAQUE_NODES.has(child.type)) walk(child)
      next.push(child)
    }
    node.children = next
  }
  return tree => { walk(tree) }
}
