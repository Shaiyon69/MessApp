import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './style/App.css'
import Register from './components/Register'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function App() {
  const [session, setSession] = useState(null)
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => {
    // Get active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session) {
    return <Dashboard session={session} />
  }

  return (
    <div className="App">
      <h1>WELCOME TO MESSAPP</h1>
      {showRegister ? (
        <>

        {/* Modify for better readability and user experience */}
          <Register />
          <p style={{ marginTop: '15px' }}>
            Already have an account?{' '}
            <button onClick={() => setShowRegister(false)} style={{ background: 'none', border: 'none', color: '#E75480', cursor: 'pointer', textDecoration: 'underline' }}>
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

export default App
