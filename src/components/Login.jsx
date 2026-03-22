import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'

export default function Login({ switchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    }
    setLoading(false)
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 lg:px-10 w-full bg-[#0c0e12]">
      {/* Ambient Background Element */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-tertiary/20 blur-[100px] rounded-full pointer-events-none"></div>
      </div>

      <main className="relative z-10 w-full max-w-[420px] space-y-10">
        {/* Branding Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary shadow-lg shadow-primary/20 mb-4">
            <span className="material-symbols-outlined text-on-primary text-3xl" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>all_inclusive</span>
          </div>
          <h1 className="text-[2.75rem] font-semibold tracking-tighter text-white leading-none font-headline uppercase">MessApp</h1>
          <p className="text-outline-variant font-body text-sm uppercase tracking-widest text-xs mt-2 font-bold">Removing one mess at a time.</p>
        </div>

        {/* Login Form */}
        <div className="glass-panel rounded-[2rem] p-8 ghost-border shadow-[0_24px_48px_rgba(89,91,140,0.1)]">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-outline-variant ml-1" htmlFor="email">Email</label>
              <div className="relative flex items-center">
                <input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-14 px-5 bg-black/20 border-none rounded-xl text-white placeholder:text-outline/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all outline-none"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-xs font-medium text-outline-variant" htmlFor="password">Password</label>
                <a className="text-xs text-primary font-semibold hover:underline decoration-2 underline-offset-4" href="#">Forgot Password?</a>
              </div>
              <div className="relative flex items-center">
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-14 px-5 bg-black/20 border-none rounded-xl text-white placeholder:text-outline/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all outline-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-gradient-to-br from-primary to-primary-dim text-on-primary rounded-full font-semibold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : (
                <>
                  <span>Sign In</span>
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Error Message Display */}
          {message && (
            <div className="mt-6 p-3 bg-error/10 border border-error/20 rounded-xl text-center">
              <p className="text-sm text-error m-0 font-medium">{message}</p>
            </div>
          )}

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/20"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest">
              <span className="bg-[#0c0e12] px-4 text-outline rounded-full">or continue with</span>
            </div>
          </div>

          {/* Social Options */}
          <div className="grid grid-cols-2 gap-4">
            <button
              aria-label="Sign in with Google"
              title="Google"
              className="flex items-center justify-center h-12 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-outline-variant focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <span className="material-symbols-outlined mr-2" aria-hidden="true">mail</span>
              <span className="text-sm font-medium">Google</span>
            </button>
            <button
              aria-label="Sign in with Apple"
              title="Apple"
              className="flex items-center justify-center h-12 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-outline-variant focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <span className="material-symbols-outlined mr-2" aria-hidden="true">potted_plant</span>
              <span className="text-sm font-medium">Apple</span>
            </button>
          </div>
        </div>

        {/* Switch to Register Link */}
        {switchToRegister && (
          <p className="text-center text-outline-variant text-sm">
            New to MessApp?{' '}
            <button 
              onClick={switchToRegister} 
              type="button"
              className="text-primary font-bold hover:underline decoration-2 underline-offset-4 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-md"
            >
              Create an Account
            </button>
          </p>
        )}
      </main>

      {/* Decorative Image Assets (Abstract/Editorial) */}
      <div className="hidden lg:block fixed right-10 bottom-10 w-64 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full rounded-[40px] border border-primary/20 rotate-12"></div>
        <div className="absolute inset-0 w-full h-full rounded-[40px] border border-tertiary/20 -rotate-6"></div>
      </div>
    </div>
  )
}
