/**
 * Fuzzy matching for the search overlay: every query character must appear in
 * order (a subsequence), and the score rewards matches that are contiguous or
 * start a word, so "jd" finds "john_doe" and "jo" ranks "john" above "bojo".
 */
const SEPARATOR = /[\s_\-.#@/]/

/** Score of `query` against `text`, or null when it does not match. Higher is better. */
export function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase()
  const t = (text || '').toLowerCase()
  if (!q) return 0
  if (!t) return null

  let score = 0
  let ti = 0
  let previous = -2
  for (const char of q) {
    if (char === ' ') continue
    const found = t.indexOf(char, ti)
    if (found === -1) return null
    score += 1
    if (found === previous + 1) score += 5
    if (found === 0 || SEPARATOR.test(t[found - 1])) score += 8
    score -= Math.min(found - ti, 5) * 0.5
    previous = found
    ti = found + 1
  }

  const substring = t.indexOf(q)
  if (substring === 0) score += 30
  else if (substring > 0) score += 15
  return score
}

/** Items that match on any of `fields(item)`, best first. Ties keep input order. */
export function fuzzyFilter(items, query, fields) {
  if (!query.trim()) return items
  return items
    .map((item, index) => {
      const scores = fields(item).map(field => fuzzyScore(query, field)).filter(score => score !== null)
      return { item, index, score: scores.length ? Math.max(...scores) : null }
    })
    .filter(entry => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.item)
}
