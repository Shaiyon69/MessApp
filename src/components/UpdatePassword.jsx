/** Completes the recovery-session password update through Supabase Auth. */
import { useEffect, useState } from 'react'
import { Check, KeyRound, LogIn } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { trackSpotlight } from '../lib/uiEffects'

export default function UpdatePassword({ onComplete }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')

  const setAuthMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSessionReady(Boolean(data.session))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) setSessionReady(Boolean(session))
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!sessionReady) return setAuthMessage('Reset session is not ready. Open the latest reset link from your email.')
    if (newPassword.length < 6) return setAuthMessage('Password must be at least 6 characters.')
    if (newPassword !== confirmPassword) return setAuthMessage('Passwords do not match.')

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      const text = error.message || 'Unable to update password.'
      if (/rate|too many|limit/i.test(text)) setAuthMessage('Too many requests. Wait a moment, then try again.')
      else if (/session|token|expired/i.test(text)) setAuthMessage('This reset link has expired. Request a new password reset link.')
      else setAuthMessage(`Error: ${text}`)
    } else {
      setAuthMessage('Password updated. You can now log in with your new password.', 'success')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => onComplete?.(), 1200)
    }

    setLoading(false)
  }

  return (
    <div onMouseMove={trackSpotlight} className="glass-panel premium-card auth-card rounded-2xl md:rounded-[32px] w-full md:h-[580px] max-w-4xl flex flex-col md:flex-row relative md:overflow-hidden text-[var(--text-main)] animate-slide-up">
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[var(--border-subtle)] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="premium-brand-mark w-8 h-8 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>
          <h1 className="gradient-text text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-2 md:mb-6 font-display leading-[1.1]">
            Create<br className="hidden md:block"/><span className="md:hidden"> </span><span className="accent-gradient-text">new access.</span>
          </h1>
          <p className="hidden md:block text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Choose a new password to finish account recovery.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>PASSWORD RECOVERY</span><span className="w-8 h-[1px] bg-[var(--border-hover)] my-auto"></span><span>MESSAPP</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[var(--surface-strong)] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2 font-display">Update Password</h2>
          <p className="text-gray-400 text-sm mb-6 md:mb-8">{sessionReady ? 'Enter your new password.' : 'Preparing your secure reset session...'}</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-5">
            <div>
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">New Password</label>
              <div className={`premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12 ${messageType === 'error' && message ? 'border-red-500/40' : ''}`}>
                <KeyRound size={18} className="text-gray-500 mr-3 shrink-0" aria-hidden="true" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="••••••••" />
              </div>
            </div>
            <div>
              <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Confirm Password</label>
              <div className={`premium-input flex items-center rounded-xl ghost-border px-4 transition-all h-12 ${messageType === 'error' && message ? 'border-red-500/40' : ''}`}>
                <Check size={18} className="text-gray-500 mr-3 shrink-0" aria-hidden="true" />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className="bg-transparent border-none outline-none w-full h-full text-[var(--text-main)] placeholder-gray-600 font-sans text-[16px] md:text-sm" placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" disabled={loading || !sessionReady} className="premium-button mt-1 md:mt-2 w-full h-12 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span> : <><span className="text-sm">Update Password</span><KeyRound size={17} aria-hidden="true" /></>}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 border rounded-xl text-center ${messageType === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="text-xs m-0 font-medium">{message}</p>
            </div>
          )}

          <button onClick={onComplete} type="button" className="premium-secondary-button mt-5 w-full h-12 rounded-xl font-bold cursor-pointer text-sm flex items-center justify-center gap-2">
            <LogIn size={16} aria-hidden="true" /> Return to Login
          </button>
        </div>
      </div>
    </div>
  )
}
