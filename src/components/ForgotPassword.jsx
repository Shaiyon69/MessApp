/** Requests a Supabase recovery email without exposing credentials. */
import { useState } from 'react'
import { ArrowLeft, Mail, Send } from 'lucide-react'
import { supabase } from '../supabaseClient'
import Turnstile, { TURNSTILE_SITE_KEY } from './ui/Turnstile'
import { AuthField, AuthLayout, AuthMessage, SubmitButton, useCooldown } from './auth/AuthParts'

export default function ForgotPassword({ email, onEmailChange, onBackToLogin, expiredLink }) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [cooldown, startCooldown] = useCooldown()
  const captchaPending = Boolean(TURNSTILE_SITE_KEY) && !captchaToken

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
    return text
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!email.trim()) return setAuthMessage('Enter your email address.')

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo, captchaToken })
    setCaptchaReset(n => n + 1)

    if (error) setAuthMessage(formatResetError(error))
    else {
      setSent(true)
      startCooldown()
      setAuthMessage('We sent a reset link to your email. Open it to choose a new password. Check spam if it doesn’t show up.', 'info')
    }
    setLoading(false)
  }

  const subtitle = expiredLink && !sent
    ? 'That reset link has expired or was already used. Enter your email and we’ll send a new one.'
    : sent ? `Check ${email.trim()} for the reset link.` : 'Enter the email for your messapp account.'

  return (
    <AuthLayout title="Reset your password" subtitle={subtitle}>
      <form onSubmit={handleSend} className="flex flex-col gap-4">
        <AuthField label="Email" icon={Mail} type="email" placeholder="you@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} required autoComplete="email" enterKeyHint="send" invalid={messageType === 'error' && Boolean(message)} />
        <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
        <SubmitButton busy={loading} busyLabel="Sending…" waiting={captchaPending} disabled={cooldown > 0} icon={Send}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? 'Resend reset link' : 'Send reset link'}
        </SubmitButton>
      </form>

      <AuthMessage kind={messageType}>
        {message && <p className="type-meta m-0 font-medium">{message}</p>}
      </AuthMessage>

      <button onClick={onBackToLogin} type="button" className="premium-secondary-button mt-5 w-full h-12 font-bold cursor-pointer type-label flex items-center justify-center gap-2">
        <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
      </button>
    </AuthLayout>
  )
}
