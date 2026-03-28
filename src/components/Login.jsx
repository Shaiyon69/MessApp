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

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) setMessage(`Error: ${error.message}`)
    setLoading(false)
  }

  return (
    <div className="glass-panel rounded-none md:rounded-[32px] w-full min-h-[100dvh] md:min-h-0 md:h-[600px] max-w-5xl flex flex-col md:flex-row relative md:overflow-hidden text-white animate-slide-up pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[#23252a] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-300 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-2 md:mb-6 font-display leading-[1.1]">
            Connect<br className="hidden md:block"/><span className="md:hidden"> </span>without<br className="hidden md:block"/><span className="md:hidden"> </span>the mess.
          </h1>
          <p className="hidden md:block text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Welcome to MessApp. Built for secure, fun, and clutter-free messaging by Skibidevs.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>BUILT BY SKIBIDEVS</span><span className="w-8 h-[1px] bg-gray-700 my-auto"></span><span>MESSAPP v0.1.3 (beta0)</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[#0d0f12] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 font-display">Welcome Back</h2>
          <p className="text-gray-400 text-sm mb-6 md:mb-8">Enter your credentials to access MessApp.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4 md:gap-5">
            <div>
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">alternate_email</span>
                <input type="email" placeholder="user@messapp.dev" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-sans text-[16px] md:text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Password</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">lock</span>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-transparent border-none outline-none w-full h-full text-white placeholder-gray-600 font-sans text-[16px] md:text-sm" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="mt-1 md:mt-2 w-full h-12 bg-gradient-to-r from-indigo-300 to-indigo-600 text-[#0d0f12] rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span> : <><span className="text-[#0d0f12] text-sm">Enter MessApp</span><span className="material-symbols-outlined text-[18px] text-[#0d0f12]" aria-hidden="true">arrow_forward</span></>}
            </button>
          </form>

          {message && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
              <p className="text-xs text-red-400 m-0 font-medium">{message}</p>
            </div>
          )}

          <div className="flex items-center gap-4 my-5 md:my-6">
            <div className="flex-1 h-[1px] bg-gray-800"></div><span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">New to the app?</span><div className="flex-1 h-[1px] bg-gray-800"></div>
          </div>

          {switchToRegister && (
            <button onClick={switchToRegister} type="button" className="w-full h-12 bg-[#1c1e22] hover:bg-[#23252a] text-white rounded-xl font-bold transition-all ghost-border cursor-pointer text-sm">
              Create an Account
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
