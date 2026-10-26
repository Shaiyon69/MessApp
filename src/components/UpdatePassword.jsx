/** Completes the recovery-session password update through Supabase Auth. */
import { useEffect, useState } from 'react'
import { KeyRound, LogIn, Send } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { AuthLayout, AuthMessage, PasswordField, SubmitButton } from './auth/AuthParts'

// How long to wait for supabase-js to turn the emailed link into a session.
const SESSION_WAIT_MS = 5000

export default function UpdatePassword({ onComplete, onRequestNewLink, linkError }) {
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const [waitedOut, setWaitedOut] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true
    const applySession = (session) => {
      setSessionReady(Boolean(session))
      setAccountEmail(session?.user?.email || '')
    }

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) applySession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) applySession(session)
    })

    const timer = setTimeout(() => mounted && setWaitedOut(true), SESSION_WAIT_MS)

    return () => {
      mounted = false
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  // Drop the recovery session so leaving this screen never lands in the Dashboard.
  const leave = async (loginMessage) => {
    await supabase.auth.signOut()
    onComplete?.(loginMessage)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) return setMessage('Password must be at least 6 characters.')

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      const text = error.message || 'Unable to update password.'
      if (/rate|too many|limit/i.test(text)) setMessage('Too many requests. Wait a moment, then try again.')
      else if (/session|token|expired/i.test(text)) setMessage('This reset link has expired. Request a new one.')
      else setMessage(text)
      setLoading(false)
      return
    }

    // Login shows the confirmation; the recovery link left a live session behind.
    await leave('Password updated. Sign in with your new password.')
  }

  if (linkError || (!sessionReady && waitedOut)) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work once and expire after a short time. Request a new one to continue.">
        <button type="button" onClick={onRequestNewLink} className="premium-button w-full h-12 font-bold flex items-center justify-center gap-2 cursor-pointer">
          <span className="type-label">Send a new link</span><Send size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => leave()} className="premium-secondary-button mt-3 w-full h-12 font-bold cursor-pointer type-label flex items-center justify-center gap-2">
          <LogIn size={16} aria-hidden="true" /> Back to sign in
        </button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle={sessionReady ? (accountEmail ? `For ${accountEmail}.` : 'Enter your new password.') : 'Preparing your secure reset session…'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <PasswordField label="New password" icon={KeyRound} placeholder="At least 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" enterKeyHint="go" hint="At least 6 characters." invalid={Boolean(message)} />
        <SubmitButton busy={loading} busyLabel="Updating…" disabled={!sessionReady} icon={KeyRound}>Update password</SubmitButton>
      </form>

      <AuthMessage kind="error">
        {message && <p className="type-meta m-0 font-medium">{message}</p>}
      </AuthMessage>

      <button onClick={() => leave()} type="button" className="premium-secondary-button mt-5 w-full h-12 font-bold cursor-pointer type-label flex items-center justify-center gap-2">
        <LogIn size={16} aria-hidden="true" /> Back to sign in
      </button>
    </AuthLayout>
  )
}
