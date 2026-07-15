/** Authenticates an existing user through Supabase and hands routing to App. */
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { trackSpotlight } from '../lib/uiEffects'

export default function Login({ switchToRegister, switchToForgotPassword, initialMessage, clearInitialMessage }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [canResendConfirmation, setCanResendConfirmation] = useState(false)

  const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  useEffect(() => {
    if (!initialMessage) return
    setMessage(initialMessage)
    setMessageType('success')
    setCanResendConfirmation(false)
    clearInitialMessage?.()
  }, [initialMessage, clearInitialMessage])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setMessageType('error')
    setCanResendConfirmation(false)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const unconfirmed = /confirm|verified|verification/i.test(error.message)
      setCanResendConfirmation(unconfirmed)
      setMessageType('error')
      setMessage(unconfirmed ? 'This account still needs email confirmation before you can log in.' : `Error: ${error.message}`)
    }
    setLoading(false)
  }

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setMessageType('error')
      return setMessage('Enter your email address first, then resend confirmation.')
    }

    setResending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: redirectTo }
    })

    if (error) {
      setMessageType('error')
      setMessage(`Error: ${error.message}`)
    } else {
      setMessageType('success')
      setMessage('Confirmation email resent. Check your inbox and spam folder.')
    }
    setResending(false)
  }

  return (
    <div onMouseMove={trackSpotlight} className="glass-panel premium-card auth-card rounded-2xl md:rounded-[32px] w-full md:h-[600px] max-w-5xl flex flex-col md:flex-row relative md:overflow-hidden text-[var(--text-main)] animate-slide-up">
      
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[var(--border-subtle)] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="premium-brand-mark w-8 h-8 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>
          <h1 className="gradient-text text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-2 md:mb-6 font-display leading-[1.1]">
            Connect<br className="hidden md:block"/><span className="md:hidden"> </span>without<br className="hidden md:block"/><span className="md:hidden"> </span><span className="accent-gradient-text">the mess.</span>
          </h1>
          <p className="hidden md:block text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Welcome to MessApp. Built for secure, fun, and clutter-free messaging by Skibidevs.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>BUILT BY SKIBIDEVS</span><span className="w-8 h-[1px] bg-[var(--border-hover)] my-auto"></span><span>MESSAPP</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[var(--surface-strong)] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2 font-display">Welcome Back</h2>
          <p className="text-gray-400 text-sm mb-6 md:mb-8">Enter your credentials to access MessApp.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4 md:gap-5">
            <div>
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
              <div className="premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">alternate_email</span>
                <input type="email" placeholder="user@messapp.dev" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest block">Password</label>
                {switchToForgotPassword && (
                  <button type="button" onClick={switchToForgotPassword} className="text-[10px] md:text-xs font-bold text-indigo-300 hover:text-indigo-200 uppercase tracking-widest cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                    Forgot?
                  </button>
                )}
              </div>
              <div className="premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">lock</span>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="premium-button mt-1 md:mt-2 w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span> : <><span className="text-sm">Enter MessApp</span><span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span></>}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 border rounded-xl text-center ${messageType === 'success' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <p className={`text-xs m-0 font-medium ${messageType === 'success' ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
              {canResendConfirmation && (
                <button type="button" onClick={handleResendConfirmation} disabled={resending} className="premium-secondary-button mt-3 h-10 px-4 rounded-lg disabled:opacity-60 text-xs font-bold cursor-pointer">
                  {resending ? 'Sending...' : 'Resend confirmation email'}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 my-5 md:my-6">
            <div className="flex-1 h-[1px] bg-[var(--border-subtle)]"></div><span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">New to the app?</span><div className="flex-1 h-[1px] bg-[var(--border-subtle)]"></div>
          </div>

          {switchToRegister && (
            <button onClick={switchToRegister} type="button" className="premium-secondary-button w-full h-12 rounded-xl font-bold cursor-pointer text-sm">
              Create an Account
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
