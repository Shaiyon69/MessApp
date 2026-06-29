import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { generateSecureRandomNumber } from '../lib/crypto'
import { isValidUsername, normalizeProfileBaseName } from '../lib/security'
import { trackSpotlight } from '../lib/uiEffects'

export default function Register({ switchToLogin, onRegistrationComplete }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('') 
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [canResendConfirmation, setCanResendConfirmation] = useState(false)
  const [verificationPending, setVerificationPending] = useState(false)

  const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  const setAuthMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  const formatAuthError = (error) => {
    const text = error?.message || 'Unable to create account.'
    if (/already|registered|exists/i.test(text)) return 'This email is already registered. Please log in.'
    if (/rate|too many|limit/i.test(text)) return 'Too many requests. Wait a moment, then try again.'
    if (/email/i.test(text) && /invalid/i.test(text)) return 'Enter a valid email address.'
    return `Error: ${text}`
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) return setAuthMessage('Passwords do not match.')
    if (!username.trim()) return setAuthMessage('Display name is required.')
    if (!isValidUsername(username)) return setAuthMessage('Display name must be 2-32 characters and use letters, numbers, spaces, dots, dashes, or underscores.')
    if (password.length < 6) return setAuthMessage('Password must be at least 6 characters.')

    setLoading(true)
    setMessage('')
    setCanResendConfirmation(false)
    setVerificationPending(false)

    const randomDiscriminator = generateSecureRandomNumber(1000, 9999)
    const baseName = normalizeProfileBaseName(username) || 'user'
    const generatedTag = `${baseName}#${randomDiscriminator}`

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo, data: { username: username.trim(), unique_tag: generatedTag } },
    })

    if (error) {
      setCanResendConfirmation(/confirm|verification/i.test(error.message))
      setAuthMessage(formatAuthError(error))
    } else if (data?.user && !data?.session) {
      setVerificationPending(true)
      setCanResendConfirmation(true)
      setAuthMessage('Check your email to verify your account before logging in. If it does not arrive, check spam or resend it below.', 'success')
    } else if (data?.session) {
      await supabase.auth.signOut()
      onRegistrationComplete?.('Registration successful. Please log in.')
    } else {
      onRegistrationComplete?.('Registration successful. Please log in.')
    }
    setLoading(false)
  }

  const handleResendConfirmation = async () => {
    if (!email.trim()) return setAuthMessage('Enter your email address first, then resend confirmation.')

    setResending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: redirectTo }
    })

    if (error) setAuthMessage(formatAuthError(error))
    else {
      setVerificationPending(true)
      setCanResendConfirmation(true)
      setAuthMessage('Confirmation email resent. Check your inbox and spam folder.', 'success')
    }
    setResending(false)
  }

  return (
    <div onMouseMove={trackSpotlight} className="glass-panel premium-card rounded-none md:rounded-[32px] w-full min-h-[100dvh] md:min-h-0 md:h-[650px] max-w-5xl flex flex-col md:flex-row relative md:overflow-hidden text-[var(--text-main)] animate-slide-up pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[var(--border-subtle)] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="premium-brand-mark w-8 h-8 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>
          <h1 className="gradient-text text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-2 md:mb-6 font-display leading-[1.1]">
            Claim Your<br className="hidden md:block"/><span className="md:hidden"> </span><span className="accent-gradient-text">Identity.</span>
          </h1>
          <p className="hidden md:block text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Join the next generation of communication. Fast, secure, and infinitely customizable.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>BUILT BY SKIBIDEVS</span><span className="w-8 h-[1px] bg-[var(--border-hover)] my-auto"></span><span>MESSAPP</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[var(--surface-strong)] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2 font-display">Create an Account</h2>
          <p className="text-gray-400 text-sm mb-6 md:mb-8">Establish who you are to access MessApp.</p>

          <form onSubmit={handleRegister} className="flex flex-col gap-3 md:gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
              <div className="premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">alternate_email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="user@messapp.dev" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Display Name</label>
              <div className="premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">person</span>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="What should we call you?" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Password</label>
              <div className="premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">lock</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="••••••••" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Confirm Password</label>
              <div className="premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[18px]" aria-hidden="true">lock_reset</span>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="premium-button mt-1 w-full h-12 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span> : <><span className="text-sm">Establish Who You Are</span><span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span></>}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 border rounded-xl text-center ${messageType === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="text-xs m-0 font-medium">{message}</p>
              {verificationPending && <p className="text-[11px] mt-2 m-0 opacity-80">Do not try to log in until the confirmation link has been opened.</p>}
              {canResendConfirmation && (
                <button type="button" onClick={handleResendConfirmation} disabled={resending} className="premium-secondary-button mt-3 h-10 px-4 rounded-lg disabled:opacity-60 text-xs font-bold cursor-pointer">
                  {resending ? 'Sending...' : 'Resend confirmation email'}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 my-5 md:my-6">
            <div className="flex-1 h-[1px] bg-[var(--border-subtle)]"></div><span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">Already have an account?</span><div className="flex-1 h-[1px] bg-[var(--border-subtle)]"></div>
          </div>

          {switchToLogin && (
            <button onClick={switchToLogin} type="button" className="premium-secondary-button w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 text-sm">
              <span className="material-symbols-outlined text-[18px] text-gray-400" aria-hidden="true">login</span>Return to Login
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
