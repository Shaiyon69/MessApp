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
    if (password !== confirmPassword) return setMessage('Passwords do not match.')
    if (!username.trim()) return setMessage('Display name is required.')
    if (password.length < 6) return setMessage('Password must be at least 6 characters.')

    setLoading(true)
    setMessage('')

    const randomDiscriminator = generateSecureRandomNumber(1000, 9999)
    const baseName = username.trim().toLowerCase().replace(/\s+/g, '')
    const generatedTag = `${baseName}#${randomDiscriminator}`

    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173', data: { username: username.trim(), unique_tag: generatedTag } },
    })

    if (error) setMessage(`Error: ${error.message}`)
    else setMessage('Success! Check your email to verify your account.')
    setLoading(false)
  }

  return (
    <div className="glass-panel rounded-none md:rounded-[32px] w-full min-h-[100dvh] md:min-h-0 md:h-[650px] max-w-5xl flex flex-col md:flex-row relative md:overflow-hidden text-white animate-slide-up pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[#23252a] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-300 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-2 md:mb-6 font-display leading-[1.1]">
            Claim Your<br className="hidden md:block"/><span className="md:hidden"> </span>Identity.
          </h1>
          <p className="hidden md:block text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Join the next generation of communication. Fast, secure, and infinitely customizable.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>BUILT BY SKIBIDEVS</span><span className="w-8 h-[1px] bg-gray-700 my-auto"></span><span>MESSAPP v0.1.3 (beta0)</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[#0d0f12] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 font-display">Create an Account</h2>
          <p className="text-gray-400 text-sm mb-6 md:mb-8">Establish who you are to access MessApp.</p>

          <form onSubmit={handleRegister} className="flex flex-col gap-3 md:gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">alternate_email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="user@messapp.dev" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Display Name</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">person</span>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="What should we call you?" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Password</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">lock</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="••••••••" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Confirm Password</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">lock_reset</span>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="mt-1 w-full h-12 bg-gradient-to-r from-indigo-300 to-indigo-600 text-[#0d0f12] rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span> : <><span className="text-[#0d0f12] text-sm">Establish Who You Are</span><span className="material-symbols-outlined text-[18px] text-[#0d0f12]" aria-hidden="true">arrow_forward</span></>}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 border rounded-xl text-center ${message.includes('Success') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="text-xs m-0 font-medium">{message}</p>
            </div>
          )}

          <div className="flex items-center gap-4 my-5 md:my-6">
            <div className="flex-1 h-[1px] bg-gray-800"></div><span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">Already have an account?</span><div className="flex-1 h-[1px] bg-gray-800"></div>
          </div>

          {switchToLogin && (
            <button onClick={switchToLogin} type="button" className="w-full h-12 bg-[#1c1e22] hover:bg-[#23252a] text-white rounded-xl font-bold transition-all border border-[#23252a] flex items-center justify-center gap-2 text-sm active:scale-[0.98]">
              <span className="material-symbols-outlined text-[18px] text-gray-400" aria-hidden="true">login</span>Return to Login
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
