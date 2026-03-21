import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'

export default function Register({ switchToLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')


  const handleRegister = async (e) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    if (!username.trim()) {
      setMessage('Display name is required.')
      return
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    setMessage('')

    const randomDiscriminator = Math.floor(1000 + Math.random() * 9000)
    const baseName = username.trim().toLowerCase().replace(/\s+/g, '')
    const generatedTag = `${baseName}#${randomDiscriminator}`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'com.shaiyon.messapp://login-callback',
        data: {
          username: username.trim(),
          unique_tag: generatedTag
        },
      },
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage(`Success! Your unique ID is ${generatedTag}. Check your email to confirm.`)
    }
    setLoading(false)
  }

  return (
    <div className="bg-background text-on-background font-body min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 20% 30%, rgba(133, 173, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(110, 159, 255, 0.1) 0%, transparent 50%)', backgroundColor: '#0c0e12' }}>
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-secondary-container/20 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Main Registration Shell */}
      <main className="w-full max-w-md relative z-10">
        {/* Header / Brand Identity */}
        <div className="text-center mb-10">
          <h1 className="font-headline font-extrabold text-4xl tracking-tight bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent mb-2">
            MessApp
          </h1>
          <p className="text-on-surface-variant font-label text-sm tracking-wide">
            JOIN THE DIGITAL OBSERVATORY
          </p>
        </div>

        {/* Glassmorphic Card */}
        <div className="bg-white/[0.03] backdrop-blur-[16px] p-8 rounded-xl border border-white/5 shadow-2xl shadow-black/40">
          <form onSubmit={handleRegister} className="space-y-6">
            {/* Username Field */}
            <div className="space-y-2">
              <label className="block font-label text-xs font-semibold text-on-surface-variant tracking-wider uppercase ml-1">
                Username
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'wght' 200", fontSize: '20px' }}>
                  person
                </span>
                <input
                  className="w-full bg-surface-container-lowest/50 border-none rounded-lg py-3.5 pl-12 pr-4 text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary/40 transition-all outline-none"
                  placeholder="CosmosExplorer"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <label className="block font-label text-xs font-semibold text-on-surface-variant tracking-wider uppercase ml-1">
                Email Address
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'wght' 200", fontSize: '20px' }}>
                  alternate_email
                </span>
                <input
                  className="w-full bg-surface-container-lowest/50 border-none rounded-lg py-3.5 pl-12 pr-4 text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary/40 transition-all outline-none"
                  placeholder="stardust@galaxy.io"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="block font-label text-xs font-semibold text-on-surface-variant tracking-wider uppercase ml-1">
                Password
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'wght' 200", fontSize: '20px' }}>
                  lock
                </span>
                <input
                  className="w-full bg-surface-container-lowest/50 border-none rounded-lg py-3.5 pl-12 pr-4 text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary/40 transition-all outline-none"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <label className="block font-label text-xs font-semibold text-on-surface-variant tracking-wider uppercase ml-1">
                Confirm Password
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'wght' 200", fontSize: '20px' }}>
                  lock
                </span>
                <input
                  className="w-full bg-surface-container-lowest/50 border-none rounded-lg py-3.5 pl-12 pr-4 text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary/40 transition-all outline-none"
                  placeholder="••••••••"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all duration-200 mt-4 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Create Account'}
            </button>

            {message && (
              <div className={`mt-4 p-3 rounded-xl text-center relative z-10 border ${message.includes('Success') ? 'bg-primary-container/20 border-primary-container/50 text-primary' : 'bg-error-container/20 border-error-container/50 text-error'}`}>
                <p className="text-sm m-0 font-medium">{message}</p>
              </div>
            )}

            {/* Footer Links */}
            <div className="pt-6 text-center space-y-4">
              {switchToLogin && (
                <p className="text-sm text-on-surface-variant">
                  Already have an account?
                  <button type="button" onClick={switchToLogin} className="text-primary hover:text-primary-fixed transition-colors font-semibold ml-1 cursor-pointer">
                    Back to Login
                  </button>
                </p>
              )}

              <div className="flex items-center gap-4 py-2">
                <div className="h-[1px] flex-1 bg-white/5"></div>
                <span className="text-[10px] font-label text-outline-variant tracking-widest uppercase">Encryption Guaranteed</span>
                <div className="h-[1px] flex-1 bg-white/5"></div>
              </div>

              <div className="flex justify-center gap-6">
                <button className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2 text-xs cursor-pointer group" type="button">
                  <span className="material-symbols-outlined group-hover:text-primary transition-colors" style={{ fontVariationSettings: "'wght' 200", fontSize: '16px' }}>policy</span>
                  Terms
                </button>
                <button className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2 text-xs cursor-pointer group" type="button">
                  <span className="material-symbols-outlined group-hover:text-primary transition-colors" style={{ fontVariationSettings: "'wght' 200", fontSize: '16px' }}>security</span>
                  Privacy
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Optional App Version / Footer */}
        <div className="mt-12 text-center pointer-events-none">
          <span className="text-[10px] text-outline-variant font-label tracking-tighter opacity-50">
            MESSAPP CLIENT V2.4.0 — DISTRIBUTED OBSERVATORY PROTOCOL
          </span>
        </div>
      </main>
    </div>
  )
}
