import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Search, Loader2, ArrowLeft } from 'lucide-react'
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
      setLoading(false)
    } else {
      toast.success("Friend request sent!")
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6 overflow-hidden">
      <div className="bg-white/[0.03] backdrop-blur-[16px] outline outline-1 outline-[rgba(70,72,77,0.15)] text-white p-8 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#85adff] to-[#6e9fff] pointer-events-none" />

        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors cursor-pointer z-10 hover:bg-white/10 p-1.5 rounded-full">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>close</span>
        </button>
        
        <div className="overflow-y-auto custom-scrollbar flex-1 -mx-2 px-2 z-10 relative mt-2">
          <h2 className="text-3xl font-bold font-headline mb-6 tracking-tight relative text-center">
            {foundUser ? 'Send Request' : 'Add Friend'}
          </h2>
          
          {!foundUser ? (
            <form onSubmit={handleSearch} className="relative z-10">
              <label htmlFor="user-tag" className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-2 font-label">Recipient Tag</label>
              <div className="flex items-center bg-[#0c0e12] rounded-xl border border-white/5 px-4 focus-within:border-[#85adff] transition-all mb-4 shadow-inner">
                <Search size={18} className="text-slate-500 mr-3" />
                <input 
                  id="user-tag"
                  className="bg-transparent border-none outline-none w-full py-4 text-white placeholder-slate-600 font-medium" 
                  type="text" 
                  value={tag} 
                  onChange={(e) => setTag(e.target.value)} 
                  placeholder="e.g. shaine#1234" 
                  autoFocus 
                />
              </div>
              
              {error && <p className="text-error text-sm font-medium mb-4 text-center bg-error/10 p-3 rounded-xl border border-error/20">{error}</p>}
              
              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] py-4 rounded-xl font-bold shadow-lg shadow-[#85adff]/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 mt-2 hover:scale-[1.02] active:scale-[0.98]">
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><Search size={20} /> Search User</>}
              </button>
            </form>
          ) : (
            <div className="relative z-10 flex flex-col items-center">
              <div className="bg-[#111318] border border-white/5 p-6 rounded-2xl w-full flex flex-col items-center gap-4 mb-8 shadow-inner">
                <div className="h-24 w-24 rounded-full bg-[#23262c] border border-white/10 flex items-center justify-center overflow-hidden">
                  {foundUser.avatar_url ? (
                    <img src={foundUser.avatar_url} alt={foundUser.username} className="h-full w-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-slate-500">person</span>
                  )}
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-white font-headline">{foundUser.username}</h3>
                  <p className="text-[#85adff] font-mono font-medium mt-1 bg-[#85adff]/10 px-3 py-1 rounded-lg border border-[#85adff]/20 inline-block">
                    {foundUser.unique_tag}
                  </p>
                </div>
              </div>

              {error && <p className="text-error text-sm font-medium mb-4 text-center">{error}</p>}

              <div className="flex gap-3 w-full">
                <button type="button" onClick={() => { setFoundUser(null); setError(''); }} disabled={loading} className="flex-1 bg-white/5 text-slate-300 py-3 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  <ArrowLeft size={18} /> Back
                </button>
                
                <button type="button" onClick={handleSendRequest} disabled={loading} className="flex-[2] bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] py-3 rounded-xl font-bold shadow-lg shadow-[#85adff]/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]">
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <><span className="material-symbols-outlined text-[20px]">person_add</span> Send Request</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
