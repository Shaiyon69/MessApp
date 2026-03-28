import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2, UserPlus, UserCheck, ArrowLeft } from 'lucide-react'
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
      if (requestError.code === '23505') setError("A request already exists between you two.")
      else setError("Failed to send request.")
      setLoading(false)
      return
    }
    setSuccess(true)
    setLoading(false)
    toast.success('Friend request sent!')
  }

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-[#0d0f12] custom-scrollbar">
      <div className="max-w-2xl w-full mx-auto p-4 md:p-8 pt-6 md:pt-12 flex flex-col pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <div className="bg-[#15171a] p-6 md:p-10 rounded-[32px] border border-[#23252a] shadow-2xl animate-slide-up">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20">
            <UserPlus size={32} className="text-indigo-500" />
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 tracking-tight">Add a Friend</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">You can add friends with their unique tag. It's cAse sEnsiTive!</p>

          <div className="bg-[#1c1e22] rounded-2xl p-4 md:p-5 mb-6 border border-[#23252a] shadow-inner">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 block">Send Friend Request</label>
            <form onSubmit={handleSearch} className="flex flex-row items-center bg-[#0d0f12] rounded-xl border border-[#23252a] focus-within:border-indigo-500 p-1 transition-colors shadow-inner">
              <input type="text" className="flex-1 h-12 px-3 bg-transparent text-white font-medium outline-none placeholder-gray-600 text-[16px] md:text-sm min-w-0" placeholder="Username#0000" value={tag} onChange={(e) => setTag(e.target.value)} />
              <button type="submit" disabled={loading || !tag} className={`h-12 px-5 rounded-lg font-bold text-sm flex items-center justify-center transition-all shrink-0 ${loading || !tag ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white cursor-pointer hover:bg-indigo-600 shadow-md'}`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Search'}
              </button>
            </form>
          </div>

          {foundUser && (
            <div className="bg-[#1c1e22] p-4 rounded-2xl border border-[#23252a] mb-6 flex items-center justify-between animate-fade-in shadow-md">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-full bg-[#23252a] overflow-hidden border border-[#0d0f12] flex items-center justify-center shadow-inner shrink-0">
                  {foundUser.avatar_url ? <img src={foundUser.avatar_url} className="w-full h-full object-cover" alt="User Avatar" /> : <span className="text-white font-bold text-lg uppercase">{foundUser.username[0]}</span>}
                </div>
                <div className="min-w-0">
                  <h4 className="text-white font-bold text-base truncate">{foundUser.username}</h4>
                  <p className="text-indigo-400 text-xs font-mono truncate">{foundUser.unique_tag}</p>
                </div>
              </div>
              {success && <div className="bg-green-500/20 p-2 rounded-full border border-green-500/30 shrink-0 ml-2"><UserCheck size={20} className="text-green-400" /></div>}
            </div>
          )}

          {error && <p className="text-red-400 text-sm font-medium mb-4 text-center bg-red-500/10 p-3 rounded-xl">{error}</p>}

          {foundUser && !success && (
            <div className="flex flex-row gap-3 w-full mt-2">
              <button type="button" onClick={() => { setFoundUser(null); setError(''); setTag(''); setSuccess(false); }} className="flex-1 bg-white/5 text-gray-300 h-12 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/5 text-sm">Cancel</button>
              <button type="button" onClick={handleSendRequest} disabled={loading} className={`flex-[2] text-white h-12 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all text-sm ${loading ? 'bg-indigo-500/50 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20 cursor-pointer'}`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send Request'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
