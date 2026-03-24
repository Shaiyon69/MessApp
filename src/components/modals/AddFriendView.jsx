import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2, UserPlus, User, ArrowLeft, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AddFriendView({ session }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!tag.includes('#')) return setError("Use the format: Name#1234")
    setLoading(true)
    setError('')
    setSuccess(false)

    const searchTag = tag.trim()
    const { data: targetUser, error: userError } = await supabase.from('profiles').select('id, username, unique_tag, avatar_url').ilike('unique_tag', searchTag).maybeSingle()

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

    const { error: requestError } = await supabase.from('friendships').insert([{ sender_id: session.user.id, receiver_id: foundUser.id, status: 'pending' }])

    if (requestError) {
      if (requestError.code === '23505') setError("You already sent a friend request to this user!")
      else setError("Failed to send friend request.")
    } else {
      toast.success("Friend request sent!")
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar border-r border-[#23252a]">
      <div className="max-w-xl w-full mx-auto mt-4 md:mt-10">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2 font-display uppercase">Add Friend</h2>
        <p className="text-gray-400 text-sm mb-6 md:mb-8">You can add a friend with their unique tag. It's case sensitive!</p>

        {!foundUser ? (
          <form onSubmit={handleSearch} className="bg-[#1c1e22] p-4 sm:p-6 rounded-2xl ghost-border shadow-lg">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-[#0d0f12] rounded-xl border border-[#23252a] p-1.5 focus-within:border-indigo-500 transition-all shadow-inner gap-2">
              <input 
                className="bg-transparent border-none outline-none w-full py-3 px-4 text-white placeholder-gray-600 font-medium text-[15px]" 
                type="text" 
                value={tag} 
                onChange={(e) => setTag(e.target.value)} 
                placeholder="e.g. example#1234" 
                autoFocus 
              />
              <button 
                type="submit" 
                disabled={loading || !tag.trim()} 
                className="bg-indigo-500 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-600 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center whitespace-nowrap shadow-md shadow-indigo-500/20"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send Request'}
              </button>
            </div>
            {error && <p className="text-red-400 text-sm font-medium mt-3 flex items-center gap-2 px-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> {error}</p>}
          </form>
        ) : (
          <div className="bg-[#1c1e22] border border-white/5 p-6 md:p-8 rounded-2xl w-full flex flex-col items-center gap-6 shadow-xl animate-slide-up">
            <div className="h-28 w-28 rounded-full bg-[#0d0f12] border-4 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)] flex items-center justify-center overflow-hidden relative">
              {foundUser.avatar_url ? <img src={foundUser.avatar_url} alt={foundUser.username} className="h-full w-full object-cover" /> : <User size={48} className="text-gray-400" />}
            </div>
            <div className="text-center">
              <h4 className="text-3xl font-bold text-white mb-1">{foundUser.username}</h4>
              <p className="text-indigo-400 font-mono font-medium bg-indigo-500/10 px-3 py-1 rounded-lg inline-block border border-indigo-500/20">{foundUser.unique_tag}</p>
            </div>

            {error && <p className="text-red-400 text-sm font-medium">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
              <button 
                type="button" 
                onClick={() => { setFoundUser(null); setError(''); setTag(''); setSuccess(false); }}
                className="flex-1 bg-white/5 text-gray-300 py-3.5 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/5 h-12"
              >
                <ArrowLeft size={18} /> Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSendRequest}
                disabled={loading || success} 
                className={`flex-[2] text-white py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all h-12 ${success ? 'bg-green-500 shadow-green-500/20' : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20 cursor-pointer disabled:opacity-50'}`}
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : success ? <><UserCheck size={20} /> Request Sent!</> : <><UserPlus size={20} /> Send Request</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
