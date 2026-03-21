import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'

export default function Login({ switchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isGlassOn, setIsGlassOn] = useState(false)

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

  const toggleGlass = () => setIsGlassOn(!isGlassOn)

  return (
    <div className="text-on-background selection:bg-primary/30 min-h-screen flex items-center justify-center p-4 md:p-0 overflow-hidden w-full relative h-screen bg-surface-dim">
      {/* Settings Overlay (Floating) */}
      <div className="fixed top-6 right-6 z-50">
        <div className="flex items-center gap-3 bg-surface-container-high/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 shadow-xl">
          <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Glass Mode</span>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isGlassOn ? 'bg-primary' : 'bg-surface-container-highest'}`}
            onClick={toggleGlass}
          >
            <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isGlassOn ? 'translate-x-5' : 'translate-x-0'}`}></span>
          </button>
        </div>
      </div>

      <main className={`w-full max-w-7xl h-full max-h-[870px] flex flex-col md:flex-row overflow-hidden rounded-xl bg-surface-container-lowest shadow-2xl border border-white/5 transition-[background-color,backdrop-filter,border] duration-400 ease-in-out ${isGlassOn ? 'glass-card' : ''}`}>
        {/* Left Section: The Artistic MessApp Anchor */}
        <section className="relative hidden md:flex flex-col justify-between w-1/2 p-12 mesh-bg border-r border-white/5 overflow-hidden">
          {/* Branding */}
          <div className="z-10">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(184,196,255,0.4)]">
                <span className="material-symbols-outlined text-on-primary-fixed font-bold">brush</span>
              </div>
              <span className="text-xl font-black text-white tracking-tighter uppercase">MessApp</span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tighter text-white leading-tight mb-6">
              Connected<br/>through MESS.
            </h1>
            <p className="text-on-surface-variant text-lg max-w-md font-light leading-relaxed">
              Welcome to the MessApp. A sanctuary for fun conversations.
            </p>
          </div>

          {/* Footer Decorative */}
          <div className="z-10 flex items-center gap-6 text-xs tracking-[0.2em] uppercase text-primary/60 font-medium">
            <span>MessApp v.1.1</span>
          </div>

          {/* Abstract Visual Layer */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
            <div className="absolute top-1/4 right-[-10%] w-96 h-96 bg-primary/20 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] left-1/4 w-[500px] h-[500px] bg-primary-container/10 rounded-full blur-[150px]"></div>
          </div>
          <img className="absolute inset-0 object-cover w-full h-full mix-blend-overlay opacity-30" alt="Abstract soft blue silk textures and light play" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBoWrhmSSf6EczTMnOqPhoP2HfNA8Avmoz8BtBae5XXpzajzIrv8GDPmG_m462ghCX43F91T8v4Ft4v9pixt12egdOSnLdmZKa3oufAFekVtcWICcFgAoAscFlPiSsz7cynYMe1wAD1pOp_i0EIWFg6mN_E3v7VxPfosyrYLgOQD31aMcTcy3XFXNK85G5VZXqf0aOufy1bwjV0yXEWQDt0EuuQBj308NbVvYmE-pJC1XM71ht6YzhqTYoauMYqr6hYFoFjJbT9yxmQ"/>
        </section>

        {/* Right Section: The Minimalist Login Shell */}
        <section className={`w-full md:w-1/2 flex flex-col justify-center items-center p-8 md:p-20 transition-[background-color] duration-400 ease-in-out ${isGlassOn ? 'bg-opacity-0' : 'bg-surface'}`}>
          <div className="w-full max-w-sm space-y-10">
            {/* Mobile Branding */}
            <div className="md:hidden flex flex-col items-center mb-10">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-on-primary-fixed">brush</span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight uppercase">MessApp</h2>
            </div>

            <div className="space-y-2">
              <h3 className="text-3xl font-bold tracking-tight text-white">MessApp Access</h3>
              <p className="text-on-surface-variant font-light">Enter your credentials to enter the MessApp.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                {/* Email Input */}
                <div className="group">
                  <label className="block text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold mb-2 ml-1" htmlFor="email">Email Address</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">alternate_email</span>
                    <input
                      className="w-full bg-surface-container-low border-none border-b-2 border-outline-variant focus:border-primary focus:ring-0 text-white pl-12 py-4 rounded-lg transition-all placeholder:text-outline"
                      id="email"
                      placeholder="Shaiyon@MessApp.com"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="group">
                  <div className="flex justify-between items-center mb-2 px-1">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold" htmlFor="password">Security Key</label>
                    {/* <a className="text-[10px] uppercase tracking-[0.1em] text-primary/80 hover:text-primary transition-colors cursor-pointer">Recover?</a> */}
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">lock</span>
                    <input
                      className="w-full bg-surface-container-low border-none border-b-2 border-outline-variant focus:border-primary focus:ring-0 text-white pl-12 py-4 rounded-lg transition-all placeholder:text-outline"
                      id="password"
                      placeholder="••••••••"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold py-4 rounded-lg shadow-lg shadow-primary/10 hover:shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : (
                  <>
                    <span>Login</span>
                    <span className="material-symbols-outlined text-lg">arrow_right_alt</span>
                  </>
                )}
              </button>
            </form>

            {message && (
              <div className="mt-6 p-3 bg-error-container/20 border border-error-container/50 rounded-xl text-center relative z-10">
                <p className="text-sm text-error m-0 font-medium">{message}</p>
              </div>
            )}

            {/* Divider */}
            {/* <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="flex-shrink mx-4 text-[10px] uppercase tracking-widest text-outline">or authenticate via</span>
              <div className="flex-grow border-t border-white/5"></div>
            </div> */}

            {/* Social Logins */}
            {/* <div className="grid grid-cols-2 gap-4">
              <button type="button" className="flex items-center justify-center gap-3 py-3 bg-surface-container-high border border-white/5 rounded-lg hover:bg-surface-container-highest transition-all group">
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                <span className="text-xs font-semibold tracking-wide text-on-surface">Google</span>
              </button>
              <button type="button" className="flex items-center justify-center gap-3 py-3 bg-surface-container-high border border-white/5 rounded-lg hover:bg-surface-container-highest transition-all group">
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.96.95-2.1 1.62-3.32 1.62-1.35 0-1.85-.82-3.41-.82-1.55 0-2.16.82-3.37.82-1.22 0-2.43-.75-3.41-1.74C1.5 18.12.31 14.73.31 11.5c0-3.35 2.14-5.11 4.19-5.11 1.07 0 1.95.66 2.72.66.72 0 1.77-.73 3.01-.73 1.25 0 2.31.62 2.97 1.48-2.6 1.4-2.18 5.23.47 6.31-.96 2.22-2.14 4.67-3.63 6.17zM11.69 4.84c0-1.12.92-2.14 1.94-2.14.13 0 .26.01.37.04-1.12 1.29-1.07 2.37-1.07 3.36 0 1.02.82 2.04 1.83 2.04h.02c-1.16 0-2.13-1.04-3.09-3.3z"></path>
                </svg>
                <span className="text-xs font-semibold tracking-wide text-on-surface">Apple ID</span>
              </button>
            </div> */}

            {/* Sign Up Link */}
            {switchToRegister && (
              <p className="text-center text-sm text-on-surface-variant">
                Not yet Messed Up?
                <button
                  type="button"
                  onClick={switchToRegister}
                  className="text-primary font-bold ml-1 hover:underline underline-offset-4 cursor-pointer"
                >
                  Create Mess (Register)
                </button>
              </p>
            )}
          </div>

          {/* Bottom Disclaimer */}
          <div className="mt-auto pt-10 text-[10px] text-outline uppercase tracking-[0.2em] flex flex-wrap justify-center gap-x-8 gap-y-2 opacity-50">
            {/* <a className="hover:text-primary transition-colors cursor-pointer">Privacy</a>
            <a className="hover:text-primary transition-colors cursor-pointer">Terms</a>
            <a className="hover:text-primary transition-colors cursor-pointer">Manifesto</a> */}
          </div>
        </section>
      </main>
    </div>
  )
}
