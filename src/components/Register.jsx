/** Creates a Supabase auth identity; profile provisioning is backend-dependent. */
import { useState } from 'react'
import { ArrowRight, AtSign, Lock, User } from 'lucide-react'
import { supabase } from '../supabaseClient'
import Turnstile, { TURNSTILE_SITE_KEY } from './ui/Turnstile'
import { generateSecureRandomNumber } from '../lib/crypto'
import { isValidUsername, normalizeProfileBaseName } from '../lib/security'
import { AuthField, AuthLayout, AuthMessage, PasswordField, SubmitButton, useCooldown } from './auth/AuthParts'

export default function Register({ email, onEmailChange, switchToLogin, onRegistrationComplete }) {
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
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

  const setAuthMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  const formatAuthError = (error) => {
    const text = error?.message || 'Unable to create account.'
    if (/already|registered|exists/i.test(text)) return 'This email is already registered. Sign in instead.'
    if (/rate|too many|limit/i.test(text)) return 'Too many requests. Wait a moment, then try again.'
    if (/email/i.test(text) && /invalid/i.test(text)) return 'Enter a valid email address.'
    return text
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!username.trim()) return setAuthMessage('Display name is required.')
    if (!isValidUsername(username)) return setAuthMessage('Display name must be 2-32 characters and use letters, numbers, spaces, dots, dashes, or underscores.')
    if (password.length < 6) return setAuthMessage('Password must be at least 6 characters.')

    setLoading(true)
    setMessage('')
    setCanResendConfirmation(false)

    const randomDiscriminator = generateSecureRandomNumber(1000, 9999)
    const generatedTag = `${baseName}#${randomDiscriminator}`

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo, captchaToken, data: { username: username.trim(), unique_tag: generatedTag } },
    })
    setCaptchaReset(n => n + 1)

    if (error) {
      setCanResendConfirmation(/confirm|verification/i.test(error.message))
      setAuthMessage(formatAuthError(error))
    } else if (data?.user && !data?.session) {
      setCanResendConfirmation(true)
      startCooldown()
      setAuthMessage('Check your email to verify your account, then sign in. No email? Check spam or resend it below.', 'info')
    } else if (data?.session) {
      await supabase.auth.signOut()
      onRegistrationComplete?.('Account created. Sign in to continue.')
    } else {
      onRegistrationComplete?.('Account created. Sign in to continue.')
    }
    setLoading(false)
  }

  const handleResendConfirmation = async () => {
    if (!email.trim()) return setAuthMessage('Enter your email address first, then resend confirmation.')

    setResending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, captchaToken }
    })
    setCaptchaReset(n => n + 1)

    if (error) setAuthMessage(formatAuthError(error))
    else {
      setCanResendConfirmation(true)
      startCooldown()
      setAuthMessage('Confirmation email resent. Check your inbox and spam folder.', 'info')
    }
    setResending(false)
  }

  const baseName = normalizeProfileBaseName(username) || 'user'
  const invalid = messageType === 'error' && Boolean(message)

  return (
    <AuthLayout title="Create your account" subtitle="You’ll confirm your email, then sign in.">
      <form onSubmit={handleRegister} className="flex flex-col gap-4">
        <AuthField label="Email" icon={AtSign} type="email" placeholder="you@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} required autoComplete="email" enterKeyHint="next" />
        <AuthField
          label="Display name"
          icon={User}
          type="text"
          placeholder="What should we call you?"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={32}
          autoComplete="nickname"
          enterKeyHint="next"
          hint={username.trim() ? `Friends find you as ${baseName}#····` : 'Friends find you by a tag generated from this name.'}
          invalid={invalid && !isValidUsername(username)}
        />
        <PasswordField label="Password" icon={Lock} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" enterKeyHint="go" hint="At least 6 characters." invalid={invalid && password.length < 6} />
        <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
        <SubmitButton busy={loading} busyLabel="Creating account…" waiting={captchaPending} icon={ArrowRight}>Create account</SubmitButton>
      </form>

      <AuthMessage kind={messageType}>
        {message && <p className="type-meta m-0 font-medium">{message}</p>}
        {message && canResendConfirmation && (
          <button type="button" onClick={handleResendConfirmation} disabled={resending || captchaPending || cooldown > 0} className="premium-secondary-button mt-3 min-h-11 px-4 disabled:opacity-60 type-meta font-bold cursor-pointer">
            {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend confirmation email'}
          </button>
        )}
      </AuthMessage>

      {switchToLogin && (
        <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
          <p className="type-label text-[var(--text-muted)] mb-3 mt-0">Already have an account?</p>
          <button onClick={switchToLogin} type="button" className="premium-secondary-button w-full h-12 font-bold cursor-pointer type-label">
            Sign in
          </button>
        </div>
      )}
    </AuthLayout>
  )
}
