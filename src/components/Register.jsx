import { useState } from 'react'
import { supabase } from '../supabaseClient'

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
    <div className="glass-panel rounded-[32px] w-full max-w-5xl flex flex-col md:flex-row relative overflow-hidden min-h-[600px] text-white">
      {/* Left Column: Branding and Hero */}
      <div className="w-full md:w-1/2 p-10 md:p-14 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#23252a] relative">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-300 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" aria-hidden="true">apps</span>
            </div>
            <span className="font-bold tracking-wider text-sm">MESSAPP</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 font-display leading-[1.1]">
            Claim your<br/>
            identity.
          </h1>

          <p className="text-gray-400 text-lg max-w-sm mt-4 leading-relaxed font-sans">
            Join the network and start messaging without the mess. Secure, fun, and built by Skibidevs.
          </p>
        </div>

        <div className="flex gap-6 mt-16 md:mt-0 pt-8 text-xs font-bold text-gray-500 uppercase tracking-widest">
          <span>BUILT BY SKIBIDEVS</span>
          <span className="w-8 h-[1px] bg-gray-700 my-auto"></span>
          <span>MESSAPP BETA V0.1.0</span>
        </div>
      </div>

      {/* Right Column: Register Form */}
      <div className="w-full md:w-1/2 p-10 md:p-14 flex flex-col justify-center bg-[#0d0f12]">
        <div className="max-w-md w-full mx-auto">
          <h2 className="text-3xl font-bold tracking-tight mb-2 font-display">Join MessApp</h2>
          <p className="text-gray-400 text-sm mb-8">Create your user profile.</p>

          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            {/* Username Input */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Username</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[20px]" aria-hidden="true">person</span>
                <input
                  type="text"
                  placeholder="CoolUser99"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="bg-transparent border-none outline-none w-full py-3.5 text-white placeholder-gray-600 font-sans"
                />
              </div>
            </div>

            {/* Email Input */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Email Address</label>
              <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all">
                <span className="material-symbols-outlined text-gray-500 mr-3 text-[20px]" aria-hidden="true">alternate_email</span>
                <input
                  type="email"
                  placeholder="user@messapp.dev"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-transparent border-none outline-none w-full py-3.5 text-white placeholder-gray-600 font-sans"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Password</label>
              <div className="flex flex-col gap-3">
                <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all">
                  <span className="material-symbols-outlined text-gray-500 mr-3 text-[20px]" aria-hidden="true">lock</span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-transparent border-none outline-none w-full py-3.5 text-white placeholder-gray-600 font-sans"
                  />
                </div>

                <div className="flex items-center bg-[#15171a] rounded-xl ghost-border px-4 transition-all">
                  <span className="material-symbols-outlined text-gray-500 mr-3 text-[20px]" aria-hidden="true">lock</span>
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="bg-transparent border-none outline-none w-full py-3.5 text-white placeholder-gray-600 font-sans"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-gradient-to-r from-indigo-300 to-indigo-600 text-[#0d0f12] py-4 rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
              ) : (
                <>
                  <span className="text-[#0d0f12]">Establish Identity</span>
                  <span className="material-symbols-outlined text-[20px] text-[#0d0f12]" aria-hidden="true">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Error/Success Message Display */}
          {message && (
            <div className={`mt-6 p-4 border rounded-xl text-center ${message.includes('Success') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <p className="text-sm m-0 font-medium">{message}</p>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-[1px] bg-gray-800"></div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Already have an account?</span>
            <div className="flex-1 h-[1px] bg-gray-800"></div>
          </div>

          {/* Switch to Login Link */}
          {switchToLogin && (
            <button
              onClick={switchToLogin}
              type="button"
              className="w-full bg-[#1c1e22] hover:bg-[#23252a] text-white py-4 rounded-xl font-bold transition-all ghost-border cursor-pointer"
            >
              Return to Login
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
