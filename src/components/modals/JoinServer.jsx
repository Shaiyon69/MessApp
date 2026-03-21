import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2 } from 'lucide-react'

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
      .insert([{ server_id: inviteData.server_id, profile_id: session.user.id, role: 'member' }])

    if (joinError) setError('Failed to join the server. Please try again.')
    else { onJoinSuccess(); onClose(); }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden">
      <div className="bg-white/[0.05] backdrop-blur-[12px] outline outline-1 outline-[rgba(70,72,77,0.15)] rounded-2xl p-8 shadow-2xl shadow-black/60 relative overflow-hidden w-full max-w-md">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#85adff] to-[#6e9fff]"></div>

        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <span className="font-headline font-extrabold text-3xl bg-gradient-to-r from-[#85adff] to-[#6e9fff] bg-clip-text text-transparent tracking-tight">MessApp</span>
          </div>

          <h2 className="font-headline text-2xl font-bold mb-2 tracking-tight text-white">Join a Server</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Enter an invitation link or code below to join an existing community in the Digital Observatory.
          </p>

          <form onSubmit={handleJoin} className="w-full space-y-6">
            <div className="space-y-2 text-left">
              <label className="font-label text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Invite Code</label>
              <div className="relative">
                <input
                  className="w-full bg-[#0c0e12] text-white border-none rounded-xl py-4 px-4 focus:ring-2 focus:ring-[#85adff]/50 placeholder:text-slate-600 transition-all duration-300 outline-none shadow-inner"
                  placeholder="hTK6-zP9q-vR2"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  autoFocus
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#85adff]/40">
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>key</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 px-1">Invites should look like <span className="text-[#85adff] font-bold">MS-ABC123</span>.</p>
            </div>

            {error && <p className="text-sm text-error font-medium p-3 bg-error/10 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full group relative flex items-center justify-center overflow-hidden rounded-full py-4 font-headline font-bold text-[#002a62] shadow-lg shadow-[#85adff]/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#85adff] to-[#6e9fff] transition-opacity group-hover:opacity-90"></div>
              <span className="relative flex items-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Join Server'}
                {!loading && <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>arrow_forward</span>}
              </span>
            </button>

            <div className="pt-2">
              <button onClick={onClose} type="button" className="text-slate-400 hover:text-white text-sm font-medium transition-colors duration-200 cursor-pointer">
                Back to Dashboard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
