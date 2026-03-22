import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Search, Loader2, UserPlus, User, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StartDMModal({ session, onClose }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState(null)

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
      setError("You cannot send a friend request to yourself.")
      setLoading(false)
      return
    }

    setFoundUser(targetUser)
    setLoading(false)
  }

  const handleSendRequest = async () => {
    setLoading(true)
    setError('')

    const { error: requestError } = await supabase
      .from('friendships')
      .insert([{ 
        sender_id: session.user.id, 
        receiver_id: foundUser.id, 
        status: 'pending' 
      }])

    if (requestError) {
      if (requestError.code === '23505') {
        setError("You already sent a friend request to this user!")
      } else {
        setError("Failed to send friend request.")
      }
      setLoading(false)
    } else {
      toast.success("Friend request sent!")
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-white/[0.03] backdrop-blur-[12px] border border-white/5 shadow-2xl text-on-surface p-8 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[rgb(var(--accent))]/10 to-transparent pointer-events-none" />

        <button aria-label="Close Modal" title="Close Modal" onClick={onClose} className="absolute top-6 right-6 text-on-surface-variant hover:text-primary transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-xl p-1 z-10">
          <X size={24} />
        </button>
        
        <h3 className="text-3xl font-bold text-center mb-8 tracking-tight z-10 relative">
          {foundUser ? 'Send Request' : 'Add Friend'}
        </h3>
        
        {!foundUser ? (
          <form onSubmit={handleSearch} className="relative z-10">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Recipient Tag</label>
            <div className="flex items-center bg-surface-container-lowest border border-transparent focus-within:border-[rgb(var(--accent))] focus-within:shadow-[0_0_15px_rgba(var(--accent),0.15)] focus-within:ring-2 focus-within:ring-[rgb(var(--accent))] focus-within:outline-none transition-all mb-4 shadow-inner rounded-xl px-4">
              <Search size={18} className="text-gray-500 mr-3" aria-hidden="true" />
              <input 
                className="bg-transparent border-none outline-none w-full py-4 text-on-surface placeholder-gray-600 font-medium focus-visible:outline-none"
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
              className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <><Search size={20} aria-hidden="true" /> Search User</>}
            </button>
          </form>
        ) : (
          <div className="relative z-10 flex flex-col items-center">
            
            <div className="bg-surface-container-lowest border border-transparent p-6 rounded-2xl w-full flex flex-col items-center gap-4 mb-8 shadow-inner">
              <div className="h-24 w-24 rounded-full bg-surface-container border-2 border-[rgb(var(--accent))] shadow-[0_0_15px_rgba(var(--accent),0.3)] flex items-center justify-center overflow-hidden">
                {foundUser.avatar_url ? (
                  <img src={foundUser.avatar_url} alt={foundUser.username} className="h-full w-full object-cover" />
                ) : (
                  <User size={40} className="text-gray-400" />
                )}
              </div>
              <div className="text-center">
                <h4 className="text-2xl font-bold text-on-surface">{foundUser.username}</h4>
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
                className="flex-1 bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ArrowLeft size={18} aria-hidden="true" /> Back
              </button>
              
              <button 
                type="button" 
                onClick={handleSendRequest}
                disabled={loading} 
                className="flex-[2] bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed font-bold py-3.5 px-6 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><UserPlus size={20} aria-hidden="true" /> Send Request</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
