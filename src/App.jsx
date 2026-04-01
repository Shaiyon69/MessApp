import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { App as CapacitorApp } from '@capacitor/app'
import { initPushNotifications } from './lib/pushNotifications'
import { crashReporter } from './lib/crashReporter'
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Onboarding from './components/Onboarding'

export default function App() {
  const [session, setSession] = useState(null)
  const [showRegister, setShowRegister] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    let teardownPush = null

    // Initialize crash reporting
    crashReporter.init()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      
      // Check onboarding completion - should only show for first-time visitors
      const hasCompletedOnboarding = localStorage.getItem('messapp_onboarding_complete')
      if (!hasCompletedOnboarding) {
        setShowOnboarding(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      
      // When user logs out, don't show onboarding again if they already completed it
      if (_event === 'SIGNED_OUT') {
        const hasCompletedOnboarding = localStorage.getItem('messapp_onboarding_complete')
        if (!hasCompletedOnboarding) {
          setShowOnboarding(true)
        }
      }
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

    initPushNotifications({
      onToken: (token) => {
        // Token is stored automatically; hook here if you want to sync it to Supabase.
        console.info('[push] registered', token)
      },
      onNotification: (notification) => {
        console.info('[push] received', notification)
      },
      onNotificationAction: (action) => {
        console.info('[push] action', action)
      },
      onError: (err) => {
        console.warn('[push] error', err)
      },
    }).then((fn) => {
      teardownPush = fn
    })

    return () => {
      subscription.unsubscribe()
      teardownPush?.()
    }
  }, [])

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
  }

  // Show onboarding if not completed
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  if (session) {
    return <Dashboard session={session} />
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#121417] p-4 sm:p-8 font-sans">
      {showRegister ? (
        <Register switchToLogin={() => setShowRegister(false)} />
      ) : (
        <Login switchToRegister={() => setShowRegister(true)} />
      )}
    </div>
  )
}
