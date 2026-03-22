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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button onClick={onClose} aria-label="Close" title="Close" className="absolute top-6 right-6 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer hover:bg-surface-container-high p-2 rounded-full">
          <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight text-on-surface">Join a Server</h3>
        <p className="text-outline text-center mb-8">Enter an invite code to join your friends.</p>
        <form onSubmit={handleJoin}>
          <label className="text-xs font-bold text-outline uppercase tracking-widest ml-1 block mb-2">Invite Code</label>
          <div className="flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/10 mb-4 px-4 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-sm">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2" aria-hidden="true">link</span>
            <input 
              className="bg-transparent border-none outline-none w-full py-4 text-on-surface placeholder:text-outline/60 font-medium"
              type="text" 
              value={inviteCode} 
              onChange={(e) => setInviteCode(e.target.value)} 
              placeholder="e.g. MS-ABC123" 
            />
          </div>
          {error && <p className="text-error text-sm font-medium mb-4 text-center bg-error/5 p-3 rounded-xl border border-error/10">{error}</p>}
          <div className="flex justify-end items-center gap-3 mt-8 pt-4 border-t border-outline-variant/10">
            <button type="button" onClick={onClose} className="bg-surface-container-high hover:bg-surface-variant text-on-surface py-3 px-6 rounded-xl font-bold transition-colors cursor-pointer border border-outline-variant/10">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-dim transition-colors shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <><span className="material-symbols-outlined text-[18px]" aria-hidden="true">add_circle</span> Join Server</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
