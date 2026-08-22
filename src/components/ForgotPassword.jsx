/** Requests a Supabase recovery email without exposing credentials. */
import { useState } from 'react'
import { ArrowLeft, LayoutGrid, Loader2, Mail, Send } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { trackSpotlight } from '../lib/uiEffects'

export default function ForgotPassword({ onBackToLogin }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')

  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/update-password` : 'http://localhost:5173/update-password'

  const setAuthMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  const formatResetError = (error) => {
    const text = error?.message || 'Unable to send reset link.'
    if (/rate|too many|limit/i.test(text)) return 'Too many requests. Wait a moment, then try again.'
    if (/email/i.test(text) && /invalid/i.test(text)) return 'Enter a valid email address.'
    if (error?.status >= 500) return 'Email service is unavailable right now. Try again later.'
    return `Error: ${text}`
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!email.trim()) return setAuthMessage('Enter your email address.')

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })

    if (error) setAuthMessage(formatResetError(error))
    else {
      setSent(true)
      setAuthMessage('We sent a password reset link to your email. Open it to choose a new password.', 'success')
    }
    setLoading(false)
  }

  return (
    <div onMouseMove={trackSpotlight} className="glass-panel premium-card auth-card rounded-2xl md:rounded-[32px] w-full md:h-[560px] max-w-4xl flex flex-col md:flex-row relative md:overflow-hidden text-[var(--text-main)] animate-slide-up">
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[var(--border-subtle)] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="premium-brand-mark w-8 h-8 rounded-lg flex items-center justify-center">
              <LayoutGrid size={14} aria-hidden="true" />
            </div>
            <span className="font-bold tracking-wider type-label">MESSAPP</span>
          </div>
          <h1 className="gradient-text type-display md:text-5xl lg:text-6xl font-semibold tracking-tight mb-2 md:mb-6 font-display leading-[1.1]">
            Reset<br className="hidden md:block"/><span className="md:hidden"> </span>your <span className="accent-gradient-text">key.</span>
          </h1>
          <p className="hidden md:block text-gray-400 type-title max-w-sm mt-4 leading-relaxed font-sans">
            We will send a secure password reset link to your email address.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 type-meta font-bold text-gray-500 uppercase tracking-widest">
          <span>SECURE RECOVERY</span><span className="w-8 h-[1px] bg-[var(--border-hover)] my-auto"></span><span>MESSAPP</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[var(--surface-strong)] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="type-display font-semibold tracking-tight mb-2 font-display">Forgot Password</h2>
          <p className="text-gray-400 type-label mb-6 md:mb-8">{sent ? `Check ${email.trim()} for the reset link.` : 'Enter the email connected to your MessApp account.'}</p>

          <form onSubmit={handleSend} className="flex flex-col gap-4 md:gap-5">
            <div>
              <label className="type-meta font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
              <div className={`premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12 ${messageType === 'error' && message ? 'border-red-500/40' : ''}`}>
                <Mail size={18} className="text-gray-500 mr-3 shrink-0" aria-hidden="true" />
                <input type="email" placeholder="user@messapp.dev" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans type-body" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="premium-button mt-1 md:mt-2 w-full h-12 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <><span className="type-label">{sent ? 'Resend Reset Link' : 'Send Reset Link'}</span><Send size={17} aria-hidden="true" /></>}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 border rounded-xl text-center ${messageType === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="type-meta m-0 font-medium">{message}</p>
              {messageType === 'success' && <p className="type-meta mt-2 m-0 opacity-80">Check spam or promotions if it does not show up.</p>}
            </div>
          )}

          <button onClick={onBackToLogin} type="button" className="premium-secondary-button mt-5 w-full h-12 rounded-xl font-bold cursor-pointer type-label flex items-center justify-center gap-2">
            <ArrowLeft size={16} aria-hidden="true" /> Return to Login
          </button>
        </div>
      </div>
    </div>
  )
}
