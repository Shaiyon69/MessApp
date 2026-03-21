import { useState } from 'react'
import { supabase } from '../../supabaseClient'

export default function JoinServerModal({ session, onClose, onJoinSuccess }) {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setLoading(true)
    setError('')

    const cleanedCode = inviteCode.trim().toUpperCase()
    
    // Using maybeSingle() prevents crashes if the code is wrong
    const { data: inviteData, error: inviteError } = await supabase
      .from('invites')
      .select('server_id')
      .eq('code', cleanedCode)
      .maybeSingle() 

    if (inviteError || !inviteData) {
      setError('Invalid or expired invite code.')
      setLoading(false)
      return
    }

    const { data: existingMember } = await supabase
      .from('server_members')
      .select('id')
      .eq('server_id', inviteData.server_id)
      .eq('profile_id', session.user.id)
      .maybeSingle()

    if (existingMember) {
      setError('You are already in this server!')
      setLoading(false)
      return
    }

    const { error: joinError } = await supabase
      .from('server_members')
      .insert([{ 
        server_id: inviteData.server_id, 
        profile_id: session.user.id, 
        role: 'member' 
      }])

    if (joinError) {
      setError('Failed to join the server. Please try again.')
    } else {
      onJoinSuccess()
      onClose()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden">
      {/* Decorative Gradient Flare (simulated via background elements if needed) */}

      {/* Join Server Modal */}
      <div className="bg-white/[0.05] backdrop-blur-[12px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-xl p-8 shadow-2xl shadow-black/60 relative overflow-hidden w-full max-w-md">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary-container"></div>

        <div className="flex flex-col items-center text-center">
          {/* Branding Anchor */}
          <div className="mb-6">
            <span className="font-headline font-extrabold text-3xl bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent tracking-tight">MessApp</span>
          </div>

          <h1 className="font-headline text-2xl font-bold mb-2 tracking-tight text-on-background">Join a Server</h1>
          <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
            Enter an invitation link or code below to join an existing community in the Digital Observatory.
          </p>

          {/* Form Section */}
          <form onSubmit={handleJoin} className="w-full space-y-6">
            <div className="space-y-2 text-left">
              <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant ml-1">Invite Code</label>
              <div className="relative">
                <input
                  className="w-full bg-surface-container-lowest text-on-surface border-none rounded-lg py-4 px-4 focus:ring-1 focus:ring-primary/50 placeholder:text-outline/40 transition-all duration-300"
                  placeholder="hTK6-zP9q-vR2"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  autoFocus
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40">
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>key</span>
                </div>
              </div>
              <p className="text-[10px] text-outline px-1">Invites should look like <span className="text-primary-dim">hTK6-zP9q-vR2</span> or a full URL.</p>
            </div>

            {error && <p className="text-sm text-error font-medium">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full group relative flex items-center justify-center overflow-hidden rounded-full py-4 font-headline font-bold text-on-primary shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary-container transition-opacity group-hover:opacity-90"></div>
              <span className="relative flex items-center gap-2">
                {loading ? 'Joining...' : 'Join Server'}
                {!loading && <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24" }}>arrow_forward</span>}
              </span>
            </button>

            <div className="pt-2">
              <button onClick={onClose} type="button" className="text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors duration-200 cursor-pointer">
                Back to Dashboard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
