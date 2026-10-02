/**
 * Channel polls. The poll message's own content is "📊 <question>", written by
 * the create_poll RPC, so previews, search and push read it as plain text.
 * The renderer only treats it as a poll once the polls row loads; a member who
 * types the emoji by hand gets an ordinary message.
 */
export const POLL_PREFIX = '📊 '
export const POLL_MAX_OPTIONS = 10
export const POLL_QUESTION_MAX = 200
export const POLL_OPTION_MAX = 80

export const isPollContent = content => typeof content === 'string' && content.startsWith(POLL_PREFIX)

/** Trimmed question and non-empty options, or an error string the form shows. */
export function cleanPollDraft(question, options) {
  const q = String(question ?? '').trim()
  const opts = (options || []).map(option => String(option ?? '').trim()).filter(Boolean)
  if (!q) return { error: 'Ask a question' }
  if (q.length > POLL_QUESTION_MAX) return { error: `Keep the question under ${POLL_QUESTION_MAX} characters` }
  if (opts.length < 2) return { error: 'Add at least two options' }
  if (opts.length > POLL_MAX_OPTIONS) return { error: `At most ${POLL_MAX_OPTIONS} options` }
  if (opts.some(option => option.length > POLL_OPTION_MAX)) return { error: `Keep options under ${POLL_OPTION_MAX} characters` }
  return { question: q, options: opts }
}

/** Per-option counts, distinct voters, and the indexes this user picked. */
export function tallyPoll(optionCount, votes, userId) {
  const counts = Array.from({ length: optionCount }, () => 0)
  const voters = new Set()
  const mine = new Set()
  for (const vote of votes || []) {
    if (vote.option_index < 0 || vote.option_index >= optionCount) continue
    counts[vote.option_index] += 1
    voters.add(vote.profile_id)
    if (vote.profile_id === userId) mine.add(vote.option_index)
  }
  return { counts, voters: voters.size, mine }
}

/** The vote set after tapping one option. */
export function nextPollChoice(mine, index, allowMultiple) {
  if (!allowMultiple) return mine.has(index) && mine.size === 1 ? [] : [index]
  const next = new Set(mine)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return [...next].sort((a, b) => a - b)
}
