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
    <div className="relative min-h-screen flex items-center justify-center px-6 lg:px-10 w-full bg-[#0c0e12]">
      {/* Ambient Background Element */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-tertiary/10 blur-[100px] rounded-full pointer-events-none"></div>
      </div>

      <main className="relative z-10 w-full max-w-[440px]">
        {/* Header Section */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-white text-3xl" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>blur_on</span>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-fixed mb-2 font-headline uppercase">MessApp</h1>
          <p className="text-outline-variant text-xs uppercase tracking-widest font-bold mt-2 opacity-80">Removing one mess at a time.</p>
        </header>

        {/* Registration Form */}
        <section className="space-y-5 glass-panel ghost-border p-8 rounded-3xl shadow-[0_24px_48px_rgba(89,91,140,0.1)]">
          <form onSubmit={handleRegister} className="flex flex-col gap-4 relative z-10">
            {/* Input Group: Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-primary-fixed/70 uppercase tracking-[0.05em] ml-1" htmlFor="username">Username</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-primary-fixed/40 text-xl" aria-hidden="true">person</span>
                <input
                  id="username"
                  type="text"
                  placeholder="alex_rivers"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full bg-white/5 border-none rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-outline/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all outline-none"
                />
              </div>
            </div>

            {/* Input Group: Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-primary-fixed/70 uppercase tracking-[0.05em] ml-1" htmlFor="email">Email</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-primary-fixed/40 text-xl" aria-hidden="true">mail</span>
                <input
                  id="email"
                  type="email"
                  placeholder="alex@harmony.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white/5 border-none rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-outline/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all outline-none"
                />
              </div>
            </div>

            {/* Input Group: Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-primary-fixed/70 uppercase tracking-[0.05em] ml-1" htmlFor="password">Password</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-primary-fixed/40 text-xl" aria-hidden="true">lock</span>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white/5 border-none rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder:text-outline/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all outline-none"
                />
              </div>
            </div>

            {/* Input Group: Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-primary-fixed/70 uppercase tracking-[0.05em] ml-1" htmlFor="confirmPassword">Confirm Password</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-primary-fixed/40 text-xl" aria-hidden="true">lock</span>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-white/5 border-none rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder:text-outline/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all outline-none"
                />
              </div>
            </div>

            {/* Primary Action */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-br from-primary to-primary-dim text-white font-semibold py-4 rounded-full mt-4 shadow-xl shadow-primary/10 active:scale-95 transition-transform duration-200 flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Create Account'}
            </button>

            {/* Terms/Legal Hint */}
            <p className="text-[10px] text-center text-outline-variant/50 px-4 mt-2">
              By clicking Create Account, you agree to our <a href="#" className="underline decoration-primary/30 rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Terms of Service</a> and <a href="#" className="underline decoration-primary/30 rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Privacy Policy</a>.
            </p>
          </form>

          {message && (
            <div className={`mt-6 p-3 rounded-xl text-center relative z-10 border ${message.includes('Success') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="text-sm font-medium">{message}</p>
            </div>
          )}
        </section>

        {/* Footer Navigation */}
        {switchToLogin && (
          <footer className="mt-8 text-center">
            <p className="text-outline-variant text-sm">
              Already have an account?{' '}
              <button
                onClick={switchToLogin}
                type="button"
                className="text-primary-fixed font-semibold ml-1 hover:text-primary transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-md"
              >
                Sign In
              </button>
            </p>
          </footer>
        )}

        {/* The Harmony Ribbon (Decorative) */}
        <div className="mt-12 flex justify-center gap-2">
          <div className="h-1 w-8 rounded-full bg-primary/30"></div>
          <div className="h-1 w-2 rounded-full bg-tertiary"></div>
          <div className="h-1 w-2 rounded-full bg-primary/30"></div>
        </div>

      </main>

      {/* Decorative Image Assets (Abstract/Editorial) */}
      <div className="hidden lg:block fixed right-10 bottom-10 w-64 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full rounded-[40px] border border-primary/20 rotate-12"></div>
        <div className="absolute inset-0 w-full h-full rounded-[40px] border border-tertiary/20 -rotate-6"></div>
      </div>
    </div>
  )
}
