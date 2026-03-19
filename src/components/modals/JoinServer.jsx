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
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors cursor-pointer">
          <X size={24} />
        </button>
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Join a Server</h3>
        <p className="text-gray-400 text-center mb-8">Enter an invite code to join your friends.</p>
        <form onSubmit={handleJoin}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Invite Code</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 mt-2 mb-4 px-4 focus-within:border-primary transition-all">
            <LinkIcon size={18} className="text-gray-500 mr-3" />
            <input 
              className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" 
              type="text" 
              value={inviteCode} 
              onChange={(e) => setInviteCode(e.target.value)} 
              placeholder="e.g. MS-ABC123" 
            />
          </div>
          {error && <p className="text-red-400 text-sm font-medium mb-4 text-center">{error}</p>}
          <div className="flex justify-end items-center gap-4 mt-8">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Join Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
