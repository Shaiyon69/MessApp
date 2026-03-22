import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'

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
    <div className="h-screen w-screen overflow-hidden flex bg-background text-on-surface items-center justify-center p-4">
    <div className="bg-white/[0.03] backdrop-blur-[12px] border border-white/5 shadow-2xl rounded-[32px] w-full max-w-5xl flex flex-col md:flex-row relative overflow-hidden min-h-[600px] animate-slide-up">
      {/* Left Column: Branding and Hero */}
      <div className="w-full md:w-1/2 p-10 md:p-14 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 relative bg-surface">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-300 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 font-display leading-[1.1]">
            Connect<br/>
            without<br/>
            the mess.
          </h1>

          <p className="text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Welcome to MessApp. Built for secure, fun, and clutter-free messaging by Skibidevs.
          </p>
        </div>

        <div className="flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>BUILT BY SKIBIDEVS</span>
          <span className="w-8 h-[1px] bg-gray-700 my-auto"></span>
          <span>MESSAPP BETA V0.1.0</span>
        </div>
      </div>

      {/* Right Column: Login Form */}
      <div className="w-full md:w-1/2 p-10 md:p-14 flex flex-col justify-center bg-surface">
        <div className="max-w-md w-full mx-auto">
          <h2 className="text-3xl font-bold tracking-tight mb-2 font-display">Welcome Back</h2>
          <p className="text-gray-400 text-sm mb-10">Enter your credentials to access MessApp.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            {/* Email Input */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Email Address</label>
              <div className="flex items-center bg-surface-container-lowest border border-transparent focus-within:border-primary focus-within:ring-2 focus-within:ring-primary focus-within:outline-none shadow-inner rounded-xl px-4 transition-all">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[20px]" aria-hidden="true">alternate_email</span>
                <input
                  type="email"
                  placeholder="user@messapp.dev"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-transparent border-none outline-none w-full py-4 text-on-surface placeholder-gray-600 font-sans focus-visible:outline-none"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Password</label>
              <div className="flex items-center bg-surface-container-lowest border border-transparent focus-within:border-primary focus-within:ring-2 focus-within:ring-primary focus-within:outline-none shadow-inner rounded-xl px-4 transition-all">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[20px]" aria-hidden="true">lock</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-transparent border-none outline-none w-full py-4 text-on-surface placeholder-gray-600 font-sans focus-visible:outline-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <span>Enter MessApp</span>
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Error Message Display */}
          {message && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
              <p className="text-sm text-red-400 m-0 font-medium">{message}</p>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-[1px] bg-gray-800"></div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">New to the app?</span>
            <div className="flex-1 h-[1px] bg-gray-800"></div>
          </div>

          {/* Switch to Register Link */}
          {switchToRegister && (
            <button 
              onClick={switchToRegister} 
              type="button"
              className="w-full bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              Create an Account
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}
