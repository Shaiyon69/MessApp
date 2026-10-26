/** Authenticates an existing user through Supabase and hands routing to App. */
import { useEffect, useState } from 'react'
import { ArrowRight, AtSign, Lock } from 'lucide-react'
import { supabase } from '../supabaseClient'
import Turnstile, { TURNSTILE_SITE_KEY } from './ui/Turnstile'
import { AuthField, AuthLayout, AuthMessage, PasswordField, SubmitButton, useCooldown } from './auth/AuthParts'

const formatLoginError = (error) => {
  const text = error?.message || ''
  if (/invalid login credentials/i.test(text)) return 'That email and password don’t match. Check both and try again.'
  if (/rate|too many|limit/i.test(text)) return 'Too many attempts. Wait a moment, then try again.'
  return text || 'Unable to sign in. Try again.'
}

export default function Login({ email, onEmailChange, switchToRegister, switchToForgotPassword, initialMessage, clearInitialMessage }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [canResendConfirmation, setCanResendConfirmation] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [cooldown, startCooldown] = useCooldown()
  const captchaPending = Boolean(TURNSTILE_SITE_KEY) && !captchaToken

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

    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
    setCaptchaReset(n => n + 1)

    if (error) {
      const unconfirmed = /confirm|verified|verification/i.test(error.message)
      setCanResendConfirmation(unconfirmed)
      setMessageType('error')
      setMessage(unconfirmed ? 'This account still needs email confirmation before you can sign in.' : formatLoginError(error))
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
      options: { emailRedirectTo: redirectTo, captchaToken }
    })
    setCaptchaReset(n => n + 1)

    if (error) {
      setMessageType('error')
      setMessage(formatLoginError(error))
    } else {
      setMessageType('success')
      setMessage('Confirmation email resent. Check your inbox and spam folder.')
      startCooldown()
    }
    setResending(false)
  }

  const invalid = messageType === 'error' && Boolean(message) && !canResendConfirmation

  return (
    <AuthLayout title="Sign in" subtitle="Use the email and password for your messapp account.">
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <AuthField label="Email" icon={AtSign} type="email" placeholder="you@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} required autoComplete="email" enterKeyHint="next" invalid={invalid} />
        <div>
          <PasswordField label="Password" icon={Lock} placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" enterKeyHint="go" invalid={invalid} />
          {switchToForgotPassword && (
            <button type="button" onClick={switchToForgotPassword} className="mt-1 min-h-11 -ml-1 px-1 type-label font-semibold text-[var(--accent)] hover:text-[var(--accent-bright)] cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              Forgot password?
            </button>
          )}
        </div>
        <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
        <SubmitButton busy={loading} busyLabel="Signing in…" waiting={captchaPending} icon={ArrowRight}>Sign in</SubmitButton>
      </form>

      <AuthMessage kind={messageType}>
        {message && <p className="type-meta m-0 font-medium">{message}</p>}
        {message && canResendConfirmation && (
          <button type="button" onClick={handleResendConfirmation} disabled={resending || captchaPending || cooldown > 0} className="premium-secondary-button mt-3 min-h-11 px-4 disabled:opacity-60 type-meta font-bold cursor-pointer">
            {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend confirmation email'}
          </button>
        )}
      </AuthMessage>

      {switchToRegister && (
        <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
          <p className="type-label text-[var(--text-muted)] mb-3 mt-0">New to messapp?</p>
          <button onClick={switchToRegister} type="button" className="premium-secondary-button w-full h-12 font-bold cursor-pointer type-label">
            Create an account
          </button>
        </div>
      )}
    </AuthLayout>
  )
}
