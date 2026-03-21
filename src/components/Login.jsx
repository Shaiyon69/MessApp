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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    setLoading(false)
  }

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'radial-gradient(circle at top right, #1d2025 0%, #0c0e12 100%)' }}>
      {/* Background Nebula Accents */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-tertiary/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Login Container */}
      <main className="w-full max-w-md z-10">
        {/* Brand Identity */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shadow-2xl shadow-primary/20 mb-6 group transition-transform hover:scale-105 duration-300">
            <span className="material-symbols-outlined text-on-primary text-3xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>blur_on</span>
          </div>
          <h1 className="font-headline font-extrabold text-4xl tracking-tight bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent mb-2">
            MessApp
          </h1>
          <p className="font-label text-on-surface-variant tracking-wider uppercase text-[10px] font-semibold">Digital Observatory</p>
        </div>

        {/* Glassmorphic Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-8 md:p-10 shadow-2xl shadow-black/50 border border-white/10 ring-1 ring-white/5">
          <h2 className="font-headline font-bold text-2xl text-on-surface mb-8 text-center tracking-tight">Welcome Back</h2>

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-widest px-1" htmlFor="email">Email</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>alternate_email</span>
                </div>
                <input
                  className="w-full bg-surface-container-lowest/50 border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/40 transition-all duration-300 font-body text-sm"
                  id="email"
                  placeholder="observer@nebula.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-widest" htmlFor="password">Password</label>
                <a className="text-[11px] font-medium text-primary-dim hover:text-primary transition-colors cursor-pointer">Forgot Password</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg group-focus-within:text-primary transition-colors" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>lock_open</span>
                </div>
                <input
                  className="w-full bg-surface-container-lowest/50 border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/40 transition-all duration-300 font-body text-sm"
                  id="password"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div className="absolute inset-y-0 right-4 flex items-center cursor-pointer">
                  <span className="material-symbols-outlined text-on-surface-variant hover:text-on-surface text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>visibility</span>
                </div>
              </div>
            </div>

            {/* Sign In Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : (
                  <>
                    <span>Sign In</span>
                    <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>arrow_forward</span>
                  </>
                )}
              </button>
            </div>

            {message && (
              <div className="mt-4 p-3 bg-error-container/20 border border-error-container/50 rounded-xl text-center">
                <p className="text-sm text-error m-0 font-medium">{message}</p>
              </div>
            )}
          </form>

          {/* Social Login Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-transparent px-2 text-on-surface-variant font-label tracking-tighter">Or synchronize via</span>
            </div>
          </div>

          {/* Social Links */}
          <div className="grid grid-cols-2 gap-4">
            <button type="button" className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors duration-200 cursor-pointer group">
              <img className="w-5 h-5 grayscale opacity-70 group-hover:opacity-100" alt="Google authentication service logo" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAXT_cy-OUaa3Ps7H1MKT-n8K4LK4WUHsXIf4a6sUGQRodzU5RIY2RV_EyVn4zvrfXEINJFS0YA4NAKNe21co1WkGRsCAI2Co7mQuBGzp_CS5Q9vZ9ft8NwPu0VSffRtVZy7T7aloc5bpml2YNQmrePVPJvij6C4AzgmCb5RSs4gBYuPIKhhf-MMKGgh7io4_sHCK9KJTrPXDwP-AnTglwC5ovZHPtJ_u5GAZsDDhNyXQ3yuTgWrV-BrWB7EvDle5zLsl4uxamcyhY"/>
              <span className="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface">Google</span>
            </button>
            <button type="button" className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors duration-200 cursor-pointer group">
              <span className="material-symbols-outlined text-lg text-on-surface-variant group-hover:text-on-surface" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>fingerprint</span>
              <span className="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface">Biometric</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        {switchToRegister && (
          <div className="mt-10 text-center">
            <p className="text-on-surface-variant text-sm font-body">
              Not an observer yet?
              <button onClick={switchToRegister} type="button" className="text-primary font-bold hover:underline underline-offset-4 ml-1 cursor-pointer">
                Create Account
              </button>
            </p>
          </div>
        )}
      </main>

      {/* UI Decorative Elements */}
      <div className="fixed bottom-8 right-8 hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant font-label tracking-widest opacity-40 pointer-events-none">
        <span className="uppercase">v4.0.2 Stable</span>
        <div className="w-1 h-1 rounded-full bg-primary"></div>
        <span className="uppercase">System Online</span>
      </div>
    </div>
  )
}
