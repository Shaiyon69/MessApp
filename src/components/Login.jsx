import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'

export default function Login({ switchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isGlassOn, setIsGlassOn] = useState(false)

  useEffect(() => {
    const html = document.documentElement;
    if (isGlassOn) html.classList.add('glass-mode');
    else html.classList.remove('glass-mode');
  }, [isGlassOn]);

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(`Error: ${error.message}`)
    setLoading(false)
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-surface overflow-hidden p-4 sm:p-8 mesh-bg relative">
      <div className="fixed top-6 right-6 z-50">
        <div className="flex items-center gap-3 bg-surface-container-high/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 shadow-xl">
          <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Glass Mode</span>
          <button 
            aria-label={isGlassOn ? "Disable Glass Mode" : "Enable Glass Mode"}
            title="Toggle Glassmorphism"
            onClick={() => setIsGlassOn(!isGlassOn)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${isGlassOn ? 'bg-primary' : 'bg-surface-container-highest'}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isGlassOn ? 'translate-x-4' : 'translate-x-0'}`}></span>
          </button>
        </div>
      </div>

      <main className="w-full max-w-[1200px] h-[85vh] min-h-[600px] max-h-[800px] flex flex-col md:flex-row rounded-3xl overflow-hidden glass-surface shadow-2xl border border-white/5 z-10 transition-all duration-300">
        <section className="relative hidden md:flex flex-col justify-between w-1/2 p-12 bg-black/20 border-r border-white/5">
          <div className="z-10">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(133,173,255,0.4)]">
                <span className="material-symbols-outlined text-on-primary font-bold" aria-hidden="true">blur_on</span>
              </div>
              <span className="text-xl font-black text-white tracking-tighter uppercase font-headline">MessApp</span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tighter text-white leading-tight mb-6 font-headline bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">
              Connect<br/>without<br/>the mess.
            </h1>
            <p className="text-on-surface-variant text-lg max-w-md font-light leading-relaxed">
              Welcome to MessApp. Built for secure, fun, and clutter-free messaging by Skibidevs.
            </p>
          </div>
          <div className="z-10 flex items-center gap-6 text-xs tracking-[0.2em] uppercase text-primary/60 font-bold font-label">
            <span>Built by Skibidevs</span>
            <span className="w-8 h-px bg-primary/20"></span>
            <span>MessApp Beta v0.1.0</span>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(133,173,255,0.1)_0%,_transparent_50%)] pointer-events-none" />
        </section>

        <section className="w-full md:w-1/2 flex flex-col justify-center p-8 md:p-16 lg:p-20 overflow-y-auto custom-scrollbar bg-black/10 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto space-y-8">
            <div className="md:hidden flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center mb-4 shadow-2xl shadow-primary/20">
                <span className="material-symbols-outlined text-on-primary text-3xl" aria-hidden="true">blur_on</span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight uppercase font-headline">MessApp</h2>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-3xl font-bold tracking-tight text-white font-headline">Welcome Back</h3>
              <p className="text-on-surface-variant font-light">Enter your credentials to access MessApp.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest px-1 font-label">Email Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant text-lg group-focus-within:text-primary transition-colors" aria-hidden="true">alternate_email</span>
                    </div>
                    <input 
                      id="email"
                      type="email" 
                      placeholder="user@messapp.dev" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-surface-container-lowest/50 border border-transparent rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all duration-300 font-body text-sm outline-none" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label htmlFor="password" className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-label">Password</label>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant text-lg group-focus-within:text-primary transition-colors" aria-hidden="true">lock</span>
                    </div>
                    <input 
                      id="password"
                      type="password" 
                      placeholder="••••••••" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-surface-container-lowest/50 border border-transparent rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all duration-300 font-body text-sm outline-none" 
                    />
                  </div>
                </div>
              </div>

              {message && (
                <div className="p-3 bg-error-container/10 border border-error/20 rounded-lg text-center">
                  <p className="text-sm text-error font-medium">{message}</p>
                </div>
              )}

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  aria-label="Log in to MessApp"
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : (
                    <>
                      <span>Enter MessApp</span>
                      <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-on-surface-variant font-label tracking-tighter">New to the app?</span>
              </div>
            </div>

            {switchToRegister && (
              <div className="text-center">
                <button 
                  onClick={switchToRegister} 
                  type="button" 
                  aria-label="Switch to Create Account page"
                  className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-primary font-bold transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  Create an Account
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
