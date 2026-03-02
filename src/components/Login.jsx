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
    <div className="bg-gray-800 p-10 rounded-xl shadow-2xl w-full max-w-md flex flex-col gap-6">
      <h2 className="text-center text-3xl font-bold text-white m-0">Log In</h2>
      <form onSubmit={handleLogin} className="flex flex-col gap-5">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="p-3 rounded-lg border border-gray-700 bg-gray-900 text-white outline-none focus:border-primary transition-colors"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="p-3 rounded-lg border border-gray-700 bg-gray-900 text-white outline-none focus:border-primary transition-colors"
        />
        <button type="submit" disabled={loading} className="mt-2 p-3 bg-primary text-white border-none rounded-lg font-bold cursor-pointer hover:bg-opacity-80 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all">
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
      {message && <p className="text-center text-sm text-gray-400 m-0">{message}</p>}
    </div>
  )
}
