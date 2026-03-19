import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Mail, Lock, LogIn, Loader2, Hash } from 'lucide-react'

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
    <div className="bg-gray-900/80 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl w-full max-w-md flex flex-col relative overflow-hidden">
      {/* Decorative background ambient glows */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 blur-3xl rounded-full pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 blur-3xl rounded-full pointer-events-none"></div>

      {/* Header Section */}
      <div className="flex flex-col items-center mb-8 relative z-10">
        <div className="h-16 w-16 bg-primary/20 rounded-2xl flex items-center justify-center mb-4 border border-primary/30 shadow-lg shadow-primary/20">
          <Hash size={32} className="text-primary" strokeWidth={2} />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Welcome Back</h2>
        <p className="text-gray-400 mt-2 text-sm">Log in to your MessApp account</p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-5 relative z-10">
        {/* Email Input */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Email Address</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <Mail size={18} className="text-gray-500 mr-3" />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600"
            />
          </div>
        </div>

        {/* Password Input */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Password</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <Lock size={18} className="text-gray-500 mr-3" />
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={loading} 
          className="mt-4 w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : (
            <>
              <LogIn size={20} />
              <span>Log In</span>
            </>
          )}
        </button>
      </form>

      {/* Error Message Display */}
      {message && (
        <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center relative z-10">
          <p className="text-sm text-red-400 m-0 font-medium">{message}</p>
        </div>
      )}

      {/* Switch to Register Link */}
      {switchToRegister && (
        <div className="mt-8 text-center relative z-10 pt-6 border-t border-white/10">
          <p className="text-gray-400 text-sm">
            Need an account?{' '}
            <button 
              onClick={switchToRegister} 
              type="button"
              className="text-primary hover:text-white font-bold transition-colors cursor-pointer"
            >
              Register here
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
