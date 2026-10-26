/** Cloudflare Turnstile widget; renders nothing when VITE_TURNSTILE_SITE_KEY is unset (local dev, e2e). */
import { useEffect, useRef, useState } from 'react'

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise
const loadScript = () => {
  scriptPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => { scriptPromise = undefined; reject(new Error('Turnstile failed to load')) }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Tokens are single-use: bump `resetKey` after each auth attempt to get a fresh one. */
export default function Turnstile({ onToken, resetKey = 0 }) {
  const container = useRef(null)
  const onTokenRef = useRef(onToken)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return undefined
    let widgetId
    let cancelled = false
    setFailed(false)
    onTokenRef.current('')
    loadScript().then(turnstile => {
      if (cancelled || !container.current) return
      widgetId = turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        // Follow the app's theme toggle, not the OS: auto can paint a white widget on the OLED ground.
        theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
        callback: token => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => { onTokenRef.current(''); setFailed(true) }
      })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [resetKey, retry])

  if (!TURNSTILE_SITE_KEY) return null
  return (
    <>
      <div ref={container} className="flex justify-center min-h-[65px]" />
      {failed && (
        <div className="auth-message flex flex-wrap items-center justify-between gap-3 rounded-xl p-3" data-kind="error" role="alert">
          <p className="type-meta m-0 font-medium">The security check didn't load. Disable any content blocker for this page, then retry.</p>
          <button type="button" onClick={() => setRetry(n => n + 1)} className="premium-secondary-button h-11 px-4 type-meta font-bold cursor-pointer">Retry</button>
        </div>
      )}
    </>
  )
}
