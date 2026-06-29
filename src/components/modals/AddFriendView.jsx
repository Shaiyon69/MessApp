import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Loader2, UserPlus, UserCheck, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { trackSpotlight } from '../../lib/uiEffects'

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
    <div className="flex-1 w-full h-full overflow-y-auto bg-[var(--bg-base)] custom-scrollbar">
      <div className="max-w-2xl w-full mx-auto p-4 md:p-8 pt-6 md:pt-12 flex flex-col pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <div onMouseMove={trackSpotlight} className="premium-card p-6 md:p-10 rounded-2xl animate-slide-up">
          <div className="premium-brand-mark w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
            <UserPlus size={32} className="text-white" />
          </div>

          <h2 className="gradient-text text-2xl md:text-3xl font-semibold mb-2 tracking-tight">Add a Friend</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">You can add friends with their unique tag. It's cAse sEnsiTive!</p>

          <div className="premium-section rounded-2xl p-4 md:p-5 mb-6">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 block">Send Friend Request</label>
            <form onSubmit={handleSearch} className="premium-input flex flex-row items-center rounded-xl ghost-border p-1 transition-all">
              <input type="text" className="flex-1 h-12 px-3 bg-transparent text-[var(--text-main)] font-medium outline-none placeholder-gray-600 text-[16px] md:text-sm min-w-0" placeholder="Username#0000" value={tag} onChange={(e) => setTag(e.target.value)} />
              <button type="submit" disabled={loading || !tag} className={`premium-button h-12 px-5 rounded-lg font-bold text-sm flex items-center justify-center shrink-0 ${loading || !tag ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Search'}
              </button>
            </form>
          </div>

          {foundUser && (
            <div className="premium-section p-4 rounded-2xl mb-6 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-full bg-[var(--border-subtle)] overflow-hidden border border-[var(--bg-base)] flex items-center justify-center shadow-inner shrink-0">
                  {foundUser.avatar_url ? <img src={foundUser.avatar_url} className="w-full h-full object-cover" alt="User Avatar" /> : <span className="text-[var(--text-main)] font-bold text-lg uppercase">{foundUser.username[0]}</span>}
                </div>
                <div className="min-w-0">
                  <h4 className="text-[var(--text-main)] font-bold text-base truncate">{foundUser.username}</h4>
                  <p className="text-indigo-400 text-xs font-mono truncate">{foundUser.unique_tag}</p>
                </div>
              </div>
              {success && <div className="bg-green-500/20 p-2 rounded-full border border-green-500/30 shrink-0 ml-2"><UserCheck size={20} className="text-green-400" /></div>}
            </div>
          )}

          {error && <p className="text-red-400 text-sm font-medium mb-4 text-center bg-red-500/10 p-3 rounded-xl">{error}</p>}

          {foundUser && !success && (
            <div className="flex flex-row gap-3 w-full mt-2">
              <button type="button" onClick={() => { setFoundUser(null); setError(''); setTag(''); setSuccess(false); }} className="premium-secondary-button flex-1 h-12 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-sm">Cancel</button>
              <button type="button" onClick={handleSendRequest} disabled={loading} className={`premium-button flex-[2] h-12 rounded-xl font-bold flex items-center justify-center gap-2 text-sm ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send Request'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
