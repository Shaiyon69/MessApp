/**
 * Owns application bootstrap, Supabase session gating, lightweight routing,
 * theme initialization, and Capacitor app/keyboard listeners. Dashboard and
 * auth screens consume the resulting session; subscriptions require cleanup.
 */
import { useState, useEffect, useLayoutEffect } from 'react'
import { inviteCodeFromPath } from './lib/invites'
import { Sun, Moon } from 'lucide-react'
import { supabase, supabaseConfigError } from './supabaseClient'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { exitApp, hasBackButton, onBackButton } from './lib/backButton'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ForgotPassword from './components/ForgotPassword'
import UpdatePassword from './components/UpdatePassword'
import Download from './components/Download'
import { applyGlassRefraction, applySurfaceTint, applyThemeMode, applyUiStyle, normalizeThemeMode } from './lib/theme'
import { startLiquidGlass } from './lib/liquidGlass'
import GlassBackdrop from './components/ui/GlassBackdrop'
import { debug } from './lib/debug'
import { keyStore } from './lib/keyStore'
import { shouldConfigureNativeKeyboard } from './lib/mobilePlatform'
import { ACTIVE_CONVERSATION_QUERY, getActiveConversationId, publishPushNavigation } from './lib/pushNavigation'

let keyboardResizeConfigured = false

export default function App() {
  const [session, setSession] = useState(null)
  /* null means "signed out", which is also what it means before getSession()
     resolves — so nothing auth-shaped renders until this flips. Otherwise the
     login screen paints for a frame (longer, if the token needs refreshing). */
  const [sessionReady, setSessionReady] = useState(false)
  // Dashboard reads E2EE keys synchronously, so it waits until they are loaded for this user.
  const [keysReadyFor, setKeysReadyFor] = useState(null)
  const [showRegister, setShowRegister] = useState(false)
  const [path, setPath] = useState(() => window.location.pathname)
  // Read once: the entry path is replaced with '/' after getSession() settles.
  const [entryInviteCode] = useState(() => inviteCodeFromPath(window.location.pathname))
  const [loginMessage, setLoginMessage] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [resetExpired, setResetExpired] = useState(false)
  // Read once at startup: supabase-js reports a dead reset link as #error_code=otp_expired
  // on the update-password redirect, and the hash is stripped after getSession() settles.
  const [resetLinkError] = useState(() => (
    window.location.pathname === '/update-password' && new URLSearchParams(window.location.hash.slice(1)).has('error_code')
  ))
  const [themeMode, setThemeMode] = useState(() => normalizeThemeMode(localStorage.getItem('appTheme') || 'dark'))

  // The screen lives in history state so the address bar stays at '/'.
  const navigateTo = (nextPath) => {
    window.history.pushState({ path: nextPath }, '', '/')
    setPath(nextPath)
  }

  const handleRegistrationComplete = (message) => {
    setShowRegister(false)
    setLoginMessage(message)
    navigateTo('/login')
  }

  useLayoutEffect(() => {
    setThemeMode(applyThemeMode(localStorage.getItem('appTheme') || 'dark'))
    applySurfaceTint(localStorage.getItem('surfaceTint') || 'blue')
    applyUiStyle(localStorage.getItem('uiStyle'))
    applyGlassRefraction(localStorage.getItem('glassRefraction'))
    startLiquidGlass()
    document.documentElement.setAttribute('data-reduce-motion', String(localStorage.getItem('reduceMotion') === 'true'))
  }, [])

  useEffect(() => {
    // The web shim rejects resize calls; guard the native bridge and avoid a
    // duplicate call when Strict Mode remounts effects in development.
    if (!shouldConfigureNativeKeyboard(Capacitor) || keyboardResizeConfigured) return
    keyboardResizeConfigured = true
    Keyboard.setResizeMode({ mode: KeyboardResize.BODY }).catch(error => {
      debug.warn('MOBILE_WEBVIEW', { operation: 'keyboard-resize-mode', error })
    })
  }, [])

  const toggleThemeMode = () => {
    setThemeMode(current => applyThemeMode(current === 'dark' ? 'light' : 'dark'))
  }

  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    keyStore.hydrate(userId).finally(() => { if (!cancelled) setKeysReadyFor(userId) })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      debug.info('APP_SESSION', { operation: 'initial-session', authenticated: Boolean(session) })
    }).catch(error => {
      debug.error('APP_SESSION', { operation: 'initial-session', error })
    }).finally(() => {
      setSessionReady(true)
      // supabase-js has consumed any #access_token by now; drop it and the entry path from the bar.
      window.history.replaceState({ path: window.location.pathname }, '', '/')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setSessionReady(true)
      debug.info('APP_SESSION', { operation: 'auth-state-change', authEvent: _event, authenticated: Boolean(session) })
      // A recovery link may land on any path (site_url fallback, deep link);
      // send it to the update-password screen instead of the Dashboard.
      if (_event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/update-password') navigateTo('/update-password')
    })

    const setupDeepLinkListener = async () => {
      await CapacitorApp.addListener('appUrlOpen', (event) => {
        if (event.url.includes('login-callback')) {
          const url = new URL(event.url)
          const hash = url.hash
          
          if (hash) {
            window.location.hash = hash
          }
        }
      })
    }

    setupDeepLinkListener()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handlePopState = event => setPath(event.state?.path || '/')
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const handleServiceWorkerMessage = event => {
      if (event.data?.type === 'MESSAPP_PUSH_OPEN') publishPushNavigation(event.data.data)
      if (event.data?.type === ACTIVE_CONVERSATION_QUERY) {
        event.ports?.[0]?.postMessage({
          activeConversationId: document.visibilityState === 'visible' ? getActiveConversationId() : null
        })
      }
    }
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
  }, [])

  // Android back on a signed-out screen steps toward Login instead of closing the app.
  useEffect(() => {
    if (!hasBackButton() || session) return undefined
    return onBackButton(() => {
      if (showRegister) setShowRegister(false)
      else if (path !== '/') navigateTo('/')
      else exitApp()
    })
  }, [session, showRegister, path])

  if (supabaseConfigError) {
    return (
      <div className="ambient-shell min-h-screen h-full w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-[var(--text-main)] flex items-center justify-center px-6 font-sans">
        <div className="glass-panel premium-card w-full max-w-xl rounded-2xl p-6">
          <div className="type-meta font-bold uppercase tracking-widest text-red-300 mb-3">Configuration Required</div>
          <h1 className="type-view-title font-bold mb-3">Supabase is not configured</h1>
          <p className="type-label text-gray-300 mb-5">{supabaseConfigError}</p>
          <div className="bg-black/30 border border-white/10 rounded-xl p-4 font-mono type-meta text-gray-200 whitespace-pre-wrap">
            VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}
            VITE_SUPABASE_ANON_KEY=your-anon-key
          </div>
          <p className="type-meta text-gray-500 mt-4">Add these values to a root `.env` file, then restart the Vite dev server.</p>
        </div>
      </div>
    )
  }

  const isAuthSurface = !session || path === '/forgot-password' || path === '/update-password' || path === '/download'

  /* Same shell, no children: the background is already painted, so the app
     opens straight into the Dashboard for a signed-in user. */
  if (!sessionReady) return <div className="ambient-shell flex h-full w-full" />

  return (
    <div className={`ambient-shell flex flex-col items-center h-full w-full font-sans ${isAuthSurface ? 'auth-shell' : 'justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'}`}>
      <GlassBackdrop />
      {!session && (
        <button
          type="button"
          onClick={toggleThemeMode}
          className="premium-icon-button fixed right-4 z-[100] flex h-11 w-11 items-center justify-center rounded-full cursor-pointer"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark OLED mode'}
          title={themeMode === 'dark' ? 'Light mode' : 'Dark OLED mode'}
        >
          {themeMode === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
      )}
      {path === '/download' ? (
        <Download onBack={() => navigateTo('/')} />
      ) : path === '/update-password' ? (
        <UpdatePassword
          linkError={resetLinkError}
          onComplete={(message) => { if (message) setLoginMessage(message); setShowRegister(false); navigateTo('/') }}
          onRequestNewLink={() => { setResetExpired(true); navigateTo('/forgot-password') }}
        />
      ) : path === '/forgot-password' ? (
        <ForgotPassword email={authEmail} onEmailChange={setAuthEmail} expiredLink={resetExpired} onBackToLogin={() => { setResetExpired(false); navigateTo('/') }} />
      ) : session ? (
        keysReadyFor === session.user.id ? <Dashboard session={session} initialInviteCode={entryInviteCode} /> : null
      ) : showRegister ? (
        <Register email={authEmail} onEmailChange={setAuthEmail} switchToLogin={() => setShowRegister(false)} onRegistrationComplete={handleRegistrationComplete} />
      ) : (
        <Login email={authEmail} onEmailChange={setAuthEmail} switchToRegister={() => { setLoginMessage(''); setShowRegister(true) }} switchToForgotPassword={() => navigateTo('/forgot-password')} initialMessage={loginMessage} clearInitialMessage={() => setLoginMessage('')} />
      )}
    </div>
  )
}
