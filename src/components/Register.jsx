import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Mail, Lock, UserPlus, Loader2, User } from 'lucide-react'

export default function Register({ switchToLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('') 
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleRegister = async (e) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    if (!username.trim()) {
      setMessage('Display name is required.')
      return
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    setMessage('')

    const randomDiscriminator = Math.floor(1000 + Math.random() * 9000)
    const baseName = username.trim().toLowerCase().replace(/\s+/g, '')
    const generatedTag = `${baseName}#${randomDiscriminator}`

    // 👇 The updated Supabase Auth call 👇
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'com.shaiyon.messapp://login-callback',
        data: {
          username: username.trim(),
          unique_tag: generatedTag
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
    <div className="bg-gray-900/80 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl w-full max-w-md flex flex-col relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 blur-3xl rounded-full pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 blur-3xl rounded-full pointer-events-none"></div>

      <div className="flex flex-col items-center mb-8 relative z-10">
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner mb-4">
          <UserPlus size={32} className="text-primary" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Create Account</h2>
        <p className="text-gray-400 mt-2 text-sm">Join the community today</p>
      </div>

      <form onSubmit={handleRegister} className="flex flex-col gap-4 relative z-10">
        <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
          <User size={18} className="text-gray-500 mr-3" />
          <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="text" placeholder="Display Name" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>

        <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
          <Mail size={18} className="text-gray-500 mr-3" />
          <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
          <Lock size={18} className="text-gray-500 mr-3" />
          <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
          <Lock size={18} className="text-gray-500 mr-3" />
          <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>

        <button type="submit" disabled={loading} className="mt-4 w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 size={20} className="animate-spin" /> : 'Register'}
        </button>
      </form>

      {message && (
        <div className={`mt-6 p-3 rounded-xl text-center relative z-10 border ${message.includes('Success') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {switchToLogin && (
        <div className="mt-8 text-center relative z-10 pt-6 border-t border-white/10">
          <p className="text-gray-400 text-sm">
            Already have an account?{' '}
            <button onClick={switchToLogin} type="button" className="text-primary hover:text-white font-bold transition-colors">Log In</button>
          </p>
        </div>
      )}
    </div>
  )
}
