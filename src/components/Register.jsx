import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('') // This is now their "Display Name"
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleRegister = async (e) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    setLoading(true)
    setMessage('')

    // 1. Generate the immutable unique tag
    const randomDiscriminator = Math.floor(1000 + Math.random() * 9000)
    const baseName = username.trim().toLowerCase().replace(/\s+/g, '')
    const generatedTag = `${baseName}#${randomDiscriminator}`

    // 2. Send both the Display Name AND the Unique Tag to Supabase
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(), // Mutable Display Name
          unique_tag: generatedTag   // Permanent ID
        },
      },
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage(`Success! Your unique ID is ${generatedTag}. Check your email to confirm.`)
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-800 p-10 rounded-xl shadow-2xl w-full max-w-md flex flex-col gap-6">
      <h2 className="text-center text-3xl font-bold text-white m-0">Register</h2>
      <form onSubmit={handleRegister} className="flex flex-col gap-5">
        <input
          type="text"
          placeholder="Display Name (e.g., Shaiyon)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="p-3 rounded-lg border border-gray-700 bg-gray-900 text-white outline-none focus:border-primary transition-colors"
        />
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
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="p-3 rounded-lg border border-gray-700 bg-gray-900 text-white outline-none focus:border-primary transition-colors"
        />
        <button type="submit" disabled={loading} className="mt-2 p-3 bg-primary text-white border-none rounded-lg font-bold cursor-pointer hover:bg-opacity-80 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all">
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      {message && <p className="text-center text-sm text-gray-400 m-0">{message}</p>}
    </div>
  )
}
