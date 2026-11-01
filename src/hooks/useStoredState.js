/**
 * useState persisted to localStorage under `key` as JSON — per-device layout
 * prefs (list width, collapsed panels). Storage failures (private mode,
 * blocked site data) degrade to in-memory state.
 */
import { useCallback, useState } from 'react'

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch { return fallback }
}

export default function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback))

  const set = useCallback((next) => {
    setValue(current => {
      const resolved = typeof next === 'function' ? next(current) : next
      try { localStorage.setItem(key, JSON.stringify(resolved)) } catch { /* in-memory only */ }
      return resolved
    })
  }, [key])

  return [value, set]
}
