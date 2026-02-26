import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login({ switchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    }
    setLoading(false)
  }

  return (
    <div className="register-container">
      <h2>Log In</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
      <p style={{ marginTop: '15px' }}>
        Don't have an account? <button onClick={switchToRegister} style={{ background: 'none', border: 'none', color: '#E75480', cursor: 'pointer', textDecoration: 'underline' }}>Register here</button>
      </p>
    </div>
  )
}
