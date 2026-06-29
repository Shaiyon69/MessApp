import { useState, useEffect, useLayoutEffect } from 'react'
import { supabase, supabaseConfigError } from './supabaseClient'
import { App as CapacitorApp } from '@capacitor/app'
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ForgotPassword from './components/ForgotPassword'
import UpdatePassword from './components/UpdatePassword'
import { applyThemeMode, normalizeThemeMode } from './lib/theme'

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

  const toggleThemeMode = () => {
    setThemeMode(current => applyThemeMode(current === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
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
      <div className="ambient-shell min-h-screen w-full text-[var(--text-main)] flex items-center justify-center p-6 font-sans">
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

  return (
    <div className="ambient-shell flex flex-col items-center justify-center min-h-screen w-full font-sans">
      {!session && (
        <button
          type="button"
          onClick={toggleThemeMode}
          className="premium-icon-button fixed right-4 top-4 z-[100] flex h-11 w-11 items-center justify-center rounded-full cursor-pointer"
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
