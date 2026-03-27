import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { generateSecureRandomNumber } from '../lib/crypto'

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

    const randomDiscriminator = generateSecureRandomNumber(1000, 9999)
    const baseName = username.trim().toLowerCase().replace(/\s+/g, '')
    const generatedTag = `${baseName}#${randomDiscriminator}`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // FIX: Dynamically adapts to local dev or production URL for PWA compatibility
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
        data: {
          username: username.trim(),
          unique_tag: generatedTag
        },
      },
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('Success! Check your email to verify your account.')
    }
    setLoading(false)
  }

  return (
    <div className="glass-panel rounded-none md:rounded-[32px] w-full min-h-[100dvh] md:min-h-0 md:h-[650px] max-w-5xl flex flex-col md:flex-row relative md:overflow-hidden text-white animate-slide-up">
      
      <div className="w-full md:w-1/2 p-8 pt-safe md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[#23252a] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-10">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-500 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)]">
              <span className="material-symbols-outlined text-white text-xl md:text-2xl font-light" aria-hidden="true">tag</span>
            </div>
            <span className="font-display font-bold tracking-widest text-lg md:text-xl text-white">MESSAPP</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-headline font-bold mb-4 md:mb-6 tracking-tight leading-tight">Claim Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Identity.</span></h1>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-md font-body">Join the next generation of communication. Fast, secure, and infinitely customizable.</p>
        </div>

        <div className="hidden md:flex items-center gap-4 mt-12 bg-white/5 p-4 rounded-2xl border border-white/5 w-fit">
          <div className="flex -space-x-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 border-2 border-[#0d0f12]"></div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 border-2 border-[#0d0f12]"></div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 border-2 border-[#0d0f12]"></div>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Join 10,000+ Users</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-8 pb-safe md:p-10 lg:p-14 flex flex-col justify-center bg-[#0d0f12]/50">
        <div className="w-full max-w-md mx-auto">
          <form onSubmit={handleRegister} className="space-y-4 md:space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors material-symbols-outlined text-[20px]" aria-hidden="true">mail</span>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  className="w-full bg-[#15171a] border border-[#23252a] rounded-xl h-12 md:h-14 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-sm md:text-base"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Display Name</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors material-symbols-outlined text-[20px]" aria-hidden="true">person</span>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  required 
                  className="w-full bg-[#15171a] border border-[#23252a] rounded-xl h-12 md:h-14 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-sm md:text-base"
                  placeholder="What should we call you?"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors material-symbols-outlined text-[20px]" aria-hidden="true">lock</span>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  className="w-full bg-[#15171a] border border-[#23252a] rounded-xl h-12 md:h-14 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-sm md:text-base"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Confirm Password</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors material-symbols-outlined text-[20px]" aria-hidden="true">lock_reset</span>
                <input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  required 
                  className="w-full bg-[#15171a] border border-[#23252a] rounded-xl h-12 md:h-14 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-sm md:text-base"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className={`w-full h-12 md:h-14 mt-4 md:mt-8 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${loading ? 'bg-indigo-500/50 cursor-not-allowed' : 'bg-white hover:bg-gray-100 shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-[0.98]'}`}
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
              ) : (
                <>
                  <span className="text-[#0d0f12] text-base md:text-sm font-bold">Establish Who You Are</span>
                  <span className="material-symbols-outlined text-[20px] text-[#0d0f12]" aria-hidden="true">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {message && (
            <div className={`mt-6 p-4 border rounded-xl text-center ${message.includes('Success') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="text-sm m-0 font-medium">{message}</p>
            </div>
          )}

          <div className="flex items-center gap-4 my-6 md:my-8">
            <div className="flex-1 h-[1px] bg-gray-800"></div>
            <span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">Already have an account?</span>
            <div className="flex-1 h-[1px] bg-gray-800"></div>
          </div>

          {switchToLogin && (
            <button
              onClick={switchToLogin}
              type="button"
              className="w-full h-14 md:h-auto md:py-4 bg-[#1c1e22] hover:bg-[#23252a] text-white rounded-xl font-bold transition-all border border-[#23252a] flex items-center justify-center gap-2 text-sm md:text-base active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px] text-gray-400" aria-hidden="true">login</span>
              Return to Login
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
