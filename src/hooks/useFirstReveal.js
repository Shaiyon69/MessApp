import { useEffect, useState } from 'react'

const seen = new Set()

/**
 * Staggered `.m3-reveal` entrance for a list, played once per list per session:
 * tab switches remount the page and must not replay it. Returns a function
 * giving a row its class and delay; only the first screenful (index < 9) moves.
 */
export default function useFirstReveal(key, ready) {
  const [reveal] = useState(() => !seen.has(key))
  useEffect(() => { if (ready) seen.add(key) }, [key, ready])
  return index => (reveal && index < 9 ? { className: 'm3-reveal', style: { '--i': index } } : { className: '', style: undefined })
}
