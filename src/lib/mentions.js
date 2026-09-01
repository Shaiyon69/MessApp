/**
 * @username mentions.
 *
 * Usernames may contain spaces ("Jane Doe"), which an inline @token cannot —
 * where does the name stop? So both ends of the feature agree on one squashed
 * form: the composer inserts `@JaneDoe`, the renderer highlights it, and
 * comparisons run through normalizeMention.
 */

const MENTION_TOKEN = /(?:^|\s)@([\p{L}\p{N}_.-]{0,32})$/u
const MENTION_IN_TEXT = /(^|\s)@([\p{L}\p{N}_.-]{1,32})/gu

export const normalizeMention = name => String(name ?? '').trim().toLowerCase().replace(/\s+/g, '')

export const mentionToken = name => `@${String(name ?? '').trim().replace(/\s+/g, '')}`

/** The @token the caret sits inside, or null when the caret is elsewhere. */
export function findMentionQuery(text, caret) {
  if (typeof text !== 'string') return null
  const match = MENTION_TOKEN.exec(text.slice(0, Math.max(0, caret)))
  if (!match) return null
  return { start: caret - match[1].length - 1, query: match[1].toLowerCase() }
}

/** Server members whose username matches the query, prefix hits first. */
export function matchMembers(members, query, limit = 6) {
  const needle = normalizeMention(query)
  const scored = []
  for (const member of members || []) {
    const username = member?.profiles?.username || member?.username
    if (!username) continue
    const name = normalizeMention(username)
    if (needle && !name.includes(needle)) continue
    scored.push({ member, rank: name.startsWith(needle) ? 0 : 1, name })
  }
  scored.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
  return scored.slice(0, limit).map(entry => entry.member)
}

/** Replace the in-progress @token with a finished mention plus a trailing space. */
export function applyMention(text, start, caret, username) {
  const token = `${mentionToken(username)} `
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length }
}

// Code, links and autolinked emails already own their text — an email is the
// one place a bare @ means something else.
const OPAQUE_NODES = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html'])

const splitText = (value) => {
  const parts = []
  let cursor = 0
  MENTION_IN_TEXT.lastIndex = 0
  let match
  while ((match = MENTION_IN_TEXT.exec(value))) {
    const at = match.index + match[1].length
    if (at > cursor) parts.push({ type: 'text', value: value.slice(cursor, at) })
    parts.push({
      type: 'mention',
      data: { hName: 'span', hProperties: { className: 'mention', 'data-mention': normalizeMention(match[2]) } },
      children: [{ type: 'text', value: `@${match[2]}` }]
    })
    cursor = at + match[2].length + 1
  }
  if (!parts.length) return null
  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) })
  return parts
}

/**
 * remark plugin turning `@name` into a node react-markdown renders through the
 * `span` component. Written out rather than pulling unist-util-visit in: the
 * walk is six lines and the plugin ships inside the lazy markdown chunk.
 */
export function remarkMentions() {
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
