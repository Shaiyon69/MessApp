import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Search, Loader2, MessageSquare, User, ArrowLeft, UserPlus } from 'lucide-react'

export default function StartDMModal({ session, onClose, onChatStarted }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState(null)

  // STEP 1: Search for the user
  const handleSearch = async (e) => {
    e.preventDefault()
    if (!tag.includes('#')) return setError("Use the format: Name#1234")
    setLoading(true)
    setError('')

    const searchTag = tag.trim()

    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('id, username, unique_tag, avatar_url')
      .ilike('unique_tag', searchTag)
      .maybeSingle()

    if (userError || !targetUser) {
      setError("User not found! Make sure you typed the tag correctly.")
      setLoading(false)
      return
    }

    if (targetUser.id === session.user.id) {
      setError("You cannot start a direct message with yourself.")
      setLoading(false)
      return
    }

    // Move to confirmation step
    setFoundUser(targetUser)
    setLoading(false)
  }

  // STEP 2: Confirm and create the room
  const handleConfirm = async () => {
    setLoading(true)
    setError('')

    const { data: newRoom, error: roomError } = await supabase
      .from('dm_rooms').insert([{}]).select().maybeSingle()

    if (newRoom) {
      await supabase.from('dm_members').insert([
        { dm_room_id: newRoom.id, profile_id: session.user.id },
        { dm_room_id: newRoom.id, profile_id: foundUser.id }
      ])
      onChatStarted()
      onClose()
    } else {
      setError("Failed to create the chat room.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-[#0B0F19] border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
        
        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[rgb(var(--accent))]/10 to-transparent pointer-events-none" />

        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors cursor-pointer z-10">
          <X size={24} />
        </button>
        
        <h3 className="text-3xl font-bold text-center mb-8 tracking-tight z-10 relative">
          {foundUser ? 'Confirm Request' : 'Find a Friend'}
        </h3>
        
        {!foundUser ? (
          /* --- SEARCH VIEW --- */
          <form onSubmit={handleSearch} className="relative z-10">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Recipient Tag</label>
            <div className="flex items-center bg-black/40 rounded-xl border border-white/10 px-4 focus-within:border-[rgb(var(--accent))] focus-within:shadow-[0_0_15px_rgba(var(--accent),0.15)] transition-all mb-4 shadow-inner">
              <Search size={18} className="text-gray-500 mr-3" />
              <input 
                className="bg-transparent border-none outline-none w-full py-4 text-white placeholder-gray-600 font-medium" 
                type="text" 
                value={tag} 
                onChange={(e) => setTag(e.target.value)} 
                placeholder="e.g. shaine#1234" 
                autoFocus 
              />
            </div>
            
            {error && <p className="text-red-400 text-sm font-medium mb-4 text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}
            
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-[rgb(var(--accent))] text-white py-4 rounded-xl font-bold hover:brightness-110 shadow-[0_0_15px_rgba(var(--accent),0.3)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <><Search size={20} /> Search User</>}
            </button>
          </form>
        ) : (
          /* --- CONFIRMATION VIEW --- */
          <div className="relative z-10 flex flex-col items-center">
            
            {/* User Profile Card */}
            <div className="bg-black/40 border border-white/10 p-6 rounded-2xl w-full flex flex-col items-center gap-4 mb-8 shadow-inner">
              <div className="h-24 w-24 rounded-full bg-black/50 border-2 border-[rgb(var(--accent))] shadow-[0_0_15px_rgba(var(--accent),0.3)] flex items-center justify-center overflow-hidden">
                {foundUser.avatar_url ? (
                  <img src={foundUser.avatar_url} alt={foundUser.username} className="h-full w-full object-cover" />
                ) : (
                  <User size={40} className="text-gray-400" />
                )}
              </div>
              <div className="text-center">
                <h4 className="text-2xl font-bold text-white">{foundUser.username}</h4>
                <p className="text-[rgb(var(--accent))] font-mono font-medium mt-1 bg-[rgb(var(--accent))]/10 px-3 py-1 rounded-lg border border-[rgb(var(--accent))]/20 inline-block">
                  {foundUser.unique_tag}
                </p>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm font-medium mb-4 text-center">{error}</p>}

            <div className="flex gap-3 w-full">
              <button 
                type="button" 
                onClick={() => { setFoundUser(null); setError(''); }}
                disabled={loading}
                className="flex-1 bg-white/5 text-gray-300 py-4 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft size={18} /> Back
              </button>
              
              <button 
                type="button" 
                onClick={handleConfirm}
                disabled={loading} 
                className="flex-[2] bg-[rgb(var(--accent))] text-white py-4 rounded-xl font-bold hover:brightness-110 shadow-[0_0_15px_rgba(var(--accent),0.3)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><UserPlus size={20} /> Add & Message</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
