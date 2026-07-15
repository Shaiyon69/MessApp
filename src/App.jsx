/**
 * Owns application bootstrap, Supabase session gating, lightweight routing,
 * theme initialization, and Capacitor app/keyboard listeners. Dashboard and
 * auth screens consume the resulting session; subscriptions require cleanup.
 */
import { useState, useEffect, useLayoutEffect } from 'react'
import { supabase, supabaseConfigError } from './supabaseClient'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ForgotPassword from './components/ForgotPassword'
import UpdatePassword from './components/UpdatePassword'
import { applyThemeMode, normalizeThemeMode } from './lib/theme'
import { debug } from './lib/debug'
import { shouldConfigureNativeKeyboard } from './lib/mobilePlatform'

let keyboardResizeConfigured = false

export default function App() {
  const [session, setSession] = useState(null)
  const [showRegister, setShowRegister] = useState(false)
  const [path, setPath] = useState(() => window.location.pathname)
  const [loginMessage, setLoginMessage] = useState('')
  const [themeMode, setThemeMode] = useState(() => normalizeThemeMode(localStorage.getItem('appTheme') || 'dark'))

  const navigateTo = (nextPath) => {
    window.history.pushState({}, '', nextPath)
    setPath(window.location.pathname)
  }

  const handleRegistrationComplete = (message) => {
    setShowRegister(false)
    setLoginMessage(message)
    navigateTo('/login')
  }

  useLayoutEffect(() => {
    setThemeMode(applyThemeMode(localStorage.getItem('appTheme') || 'dark'))
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

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      debug.info('APP_SESSION', { operation: 'initial-session', authenticated: Boolean(session) })
    }).catch(error => {
      debug.error('APP_SESSION', { operation: 'initial-session', error })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      debug.info('APP_SESSION', { operation: 'auth-state-change', authEvent: _event, authenticated: Boolean(session) })
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
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event) => {
      document.documentElement.style.setProperty('--ambient-x', `${event.clientX}px`)
      document.documentElement.style.setProperty('--ambient-y', `${event.clientY}px`)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [])

  if (supabaseConfigError) {
    return (
      <div className="ambient-shell min-h-screen h-full w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-[var(--text-main)] flex items-center justify-center px-6 font-sans">
        <div className="glass-panel premium-card w-full max-w-xl rounded-2xl p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-red-300 mb-3">Configuration Required</div>
          <h1 className="text-2xl font-bold mb-3">Supabase is not configured</h1>
          <p className="text-sm text-gray-300 mb-5">{supabaseConfigError}</p>
          <div className="bg-black/30 border border-white/10 rounded-xl p-4 font-mono text-xs text-gray-200 whitespace-pre-wrap">
            VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}
            VITE_SUPABASE_ANON_KEY=your-anon-key
          </div>
          <p className="text-xs text-gray-500 mt-4">Add these values to a root `.env` file, then restart the Vite dev server.</p>
        </div>
      </div>
    )
  }

  const isAuthSurface = !session || path === '/forgot-password' || path === '/update-password'

  return (
    <div className={`ambient-shell flex flex-col items-center justify-center h-full w-full font-sans ${isAuthSurface ? 'auth-shell' : 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'}`}>
      {!session && (
        <button
          type="button"
          onClick={toggleThemeMode}
          className="premium-icon-button fixed right-4 z-[100] flex h-11 w-11 items-center justify-center rounded-full cursor-pointer"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark OLED mode'}
          title={themeMode === 'dark' ? 'Light mode' : 'Dark OLED mode'}
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{themeMode === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>
      )}
      {path === '/update-password' ? (
        <UpdatePassword onComplete={() => navigateTo('/')} />
      ) : path === '/forgot-password' ? (
        <ForgotPassword onBackToLogin={() => navigateTo('/')} />
      ) : session ? (
        <Dashboard session={session} />
      ) : showRegister ? (
        <Register switchToLogin={() => setShowRegister(false)} onRegistrationComplete={handleRegistrationComplete} />
      ) : (
        <Login switchToRegister={() => { setLoginMessage(''); setShowRegister(true) }} switchToForgotPassword={() => navigateTo('/forgot-password')} initialMessage={loginMessage} clearInitialMessage={() => setLoginMessage('')} />
      )}
    </div>
  )
}
