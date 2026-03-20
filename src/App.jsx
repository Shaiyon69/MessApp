import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { App as CapacitorApp } from '@capacitor/app' // 👈 Added this import
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => {
    // 1. Initial Session Check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // 2. Auth State Listener (Catches normal logins AND deep link logins)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // 3. Deep Link Listener (Catches the email link)
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

  if (session) {
    return <Dashboard session={session} />
  }

  return (
    <>
      {showRegister ? (
        <Register switchToLogin={() => setShowRegister(false)} />
      ) : (
        <Login switchToRegister={() => setShowRegister(true)} />
      )}
    </>
  )
}
