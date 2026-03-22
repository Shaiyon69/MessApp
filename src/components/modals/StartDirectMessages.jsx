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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel ghost-border text-on-surface p-8 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-y-auto max-h-[90vh] custom-scrollbar">
        
        <button onClick={onClose} aria-label="Close" title="Close" className="absolute top-6 right-6 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer hover:bg-surface-container-high p-2 rounded-full z-10">
          <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
        </button>
        
        <h3 className="text-3xl font-bold text-center mb-8 tracking-tight z-10 relative text-on-surface">
          {foundUser ? 'Send Request' : 'Add Friend'}
        </h3>
        
        {!foundUser ? (
          <form onSubmit={handleSearch} className="relative z-10">
            <label className="text-xs font-bold text-outline uppercase tracking-widest ml-1 block mb-2">Recipient Tag</label>
            <div className="flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/10 px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all mb-4 shadow-sm">
              <span className="material-symbols-outlined text-outline mr-2 text-[18px]" aria-hidden="true">search</span>
              <input 
                className="bg-transparent border-none outline-none w-full py-4 text-on-surface placeholder:text-outline/60 font-medium"
                type="text" 
                value={tag} 
                onChange={(e) => setTag(e.target.value)} 
                placeholder="e.g. shaine#1234" 
                autoFocus 
              />
            </div>
            
            {error && <p className="text-error text-sm font-medium mb-4 text-center bg-error/5 p-3 rounded-xl border border-error/10">{error}</p>}
            
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-primary text-on-primary py-4 rounded-xl font-bold hover:bg-primary-dim shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <><span className="material-symbols-outlined text-[20px]" aria-hidden="true">search</span> Search User</>}
            </button>
          </form>
        ) : (
          <div className="relative z-10 flex flex-col items-center">
            
            <div className="bg-surface-container-low border border-outline-variant/10 p-6 rounded-2xl w-full flex flex-col items-center gap-4 mb-8 shadow-sm">
              <div className="h-24 w-24 rounded-full bg-surface-container-high border-2 border-primary shadow-sm flex items-center justify-center overflow-hidden">
                {foundUser.avatar_url ? (
                  <img src={foundUser.avatar_url} alt={foundUser.username} className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-outline text-4xl" aria-hidden="true">person</span>
                )}
              </div>
              <div className="text-center">
                <h4 className="text-2xl font-bold text-on-surface">{foundUser.username}</h4>
                <p className="text-primary font-mono font-medium mt-1 bg-primary-container/30 px-3 py-1 rounded-lg border border-primary/10 inline-block">
                  {foundUser.unique_tag}
                </p>
              </div>
            </div>

            {error && <p className="text-error text-sm font-medium mb-4 text-center">{error}</p>}

            <div className="flex gap-3 w-full">
              <button 
                type="button" 
                onClick={() => { setFoundUser(null); setError(''); }}
                disabled={loading}
                className="flex-1 bg-surface-container-highest hover:bg-surface-variant text-on-surface py-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer border border-outline-variant/10 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span> Back
              </button>
              
              <button 
                type="button" 
                onClick={handleSendRequest}
                disabled={loading} 
                className="flex-[2] bg-primary text-on-primary py-4 rounded-xl font-bold hover:bg-primary-dim shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><span className="material-symbols-outlined text-[20px]" aria-hidden="true">person_add</span> Send Request</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
