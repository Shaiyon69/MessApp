import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Search, Loader2, MessageSquare } from 'lucide-react'

export default function StartDMModal({ session, onClose, onChatStarted }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStartChat = async (e) => {
    e.preventDefault()
    if (!tag.includes('#')) return setError("Use the format: name#1234")
    setLoading(true)
    setError('')

    // 1. Find user by unique_tag
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('unique_tag', tag.trim())
      .single()

    if (userError || !targetUser) {
      setError("User not found!")
      setLoading(false)
      return
    }

    // 2. Create the Room
    const { data: newRoom, error: roomError } = await supabase
      .from('dm_rooms').insert([{}]).select().single()

    if (newRoom) {
      // 3. Add both people to the room
      await supabase.from('dm_members').insert([
        { dm_room_id: newRoom.id, profile_id: session.user.id },
        { dm_room_id: newRoom.id, profile_id: targetUser.id }
      ])
      onChatStarted()
      onClose()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors cursor-pointer"><X size={24} /></button>
        <h3 className="text-3xl font-bold text-center mb-8 tracking-tight">Direct Message</h3>
        <form onSubmit={handleStartChat}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Recipient Tag</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 px-4 focus-within:border-primary transition-all mb-4">
            <Search size={18} className="text-gray-500 mr-3" />
            <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="text" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="fart#6969" autoFocus />
          </div>
          {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-opacity-90 shadow-lg flex items-center justify-center gap-2">
            {loading ? <Loader2 size={20} className="animate-spin" /> : <><MessageSquare size={20} /> Start Chat</>}
          </button>
        </form>
      </div>
    </div>
  )
}
