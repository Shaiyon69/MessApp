/**
 * A Set of ids persisted to localStorage under `key` — per-device list prefs
 * (pinned rows, manually-unread chats). Storage failures (private mode,
 * blocked site data) degrade to an in-memory set.
 */
import { useCallback, useState } from 'react'

const read = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key)) || []) } catch { return new Set() }
}

export default function useStoredSet(key) {
  const [set, setSet] = useState(() => read(key))

  const toggle = useCallback((id, on = !set.has(id)) => {
    if (on === set.has(id)) return
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    setSet(next)
    try { localStorage.setItem(key, JSON.stringify([...next])) } catch { /* in-memory only */ }
  }, [key, set])

  return [set, toggle]
}
