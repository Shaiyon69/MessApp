import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Link as LinkIcon, Loader2 } from 'lucide-react'

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/[0.03] backdrop-blur-[12px] border border-white/5 shadow-2xl text-on-surface p-8 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar relative">
        <button aria-label="Close Modal" title="Close Modal" onClick={onClose} className="absolute top-6 right-6 text-on-surface-variant hover:text-primary transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-xl p-1">
          <X size={24} />
        </button>
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Join a Server</h3>
        <p className="text-on-surface-variant text-center mb-8">Enter an invite code to join your friends.</p>
        <form onSubmit={handleJoin}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Invite Code</label>
          <div className="flex items-center bg-surface-container-lowest border border-transparent shadow-inner rounded-xl mt-2 mb-4 px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary focus-within:outline-none transition-all">
            <LinkIcon size={18} className="text-gray-500 mr-3" aria-hidden="true" />
            <input 
              className="bg-transparent border-none outline-none w-full py-3 text-on-surface placeholder-gray-600 focus-visible:outline-none"
              type="text" 
              value={inviteCode} 
              onChange={(e) => setInviteCode(e.target.value)} 
              placeholder="e.g. MS-ABC123" 
            />
          </div>
          {error && <p className="text-red-400 text-sm font-medium mb-4 text-center">{error}</p>}
          <div className="flex justify-end items-center gap-4 mt-8">
            <button type="button" onClick={onClose} className="bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">Cancel</button>
            <button type="submit" disabled={loading} className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Join Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
