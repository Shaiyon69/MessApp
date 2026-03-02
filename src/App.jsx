import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session) {
    return <Dashboard session={session} />
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-gray-900 p-8">
      <h1 className="text-4xl font-bold tracking-widest mb-8 text-white text-center uppercase">WELCOME TO MESSAPP</h1>
      {showRegister ? (
        <>
          <Register />
          <p className="mt-4 text-gray-400">
            Already have an account?{' '}
            <button onClick={() => setShowRegister(false)} className="bg-transparent border-none text-primary cursor-pointer hover:underline">
              Log in here
            </button>
          </p>
        </>
      ) : (
        <Login switchToRegister={() => setShowRegister(true)} />
      )}
    </div>
  )
}
