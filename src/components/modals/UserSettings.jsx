import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Upload, Loader2, User, AlertTriangle, ShieldAlert, Copy, Check, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function UserSettingsModal({ session, onClose }) {
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [username, setUsername] = useState(session?.user?.user_metadata?.username || '')
  const [uniqueTag, setUniqueTag] = useState(session?.user?.user_metadata?.unique_tag || '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function getProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, username, unique_tag')
        .eq('id', session.user.id)
        .single()
      
      if (data) {
        setAvatarUrl(data.avatar_url)
        if (data.username) setUsername(data.username)
        if (data.unique_tag) setUniqueTag(data.unique_tag)
      }
    }
    getProfile()
  }, [session.user.id])

  const uploadAvatar = async (event) => {
    try {
      setLoading(true)
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.')
      }

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}-${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id)

      if (updateError) throw updateError

      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      })

      setAvatarUrl(publicUrl)
      toast.success('Avatar updated successfully')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await supabase.auth.updateUser({
        data: { username: username }
      })

      await supabase
        .from('profiles')
        .update({ username })
        .eq('id', session.user.id)

      toast.success('Profile updated')
      onClose()
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleDeactivate = () => {
    toast.error('Deactivation requires email confirmation in this beta version.')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    onClose()
  }

  // Format the tag properly as NAME#1234
  const fullTag = uniqueTag.includes('#') ? uniqueTag : `${username || 'User'}#0000`
  const displayTagNumber = fullTag.split('#')[1]

  const copyTag = () => {
    navigator.clipboard.writeText(fullTag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-[#0B0F19] border border-white/10 text-white p-8 rounded-[2rem] w-full max-w-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative flex flex-col max-h-[90vh]">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[rgb(var(--accent))]/20 to-transparent pointer-events-none rounded-t-[2rem]" />
        
        {/* Hitbox properly placed on top */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white hover:bg-white/10 p-3 rounded-full transition-all cursor-pointer z-[110]">
          <X size={26} />
        </button>
        
        <h3 className="text-2xl font-bold mb-8 tracking-tight z-10">My Account</h3>
        
        <div className="overflow-y-auto custom-scrollbar flex-1 -mx-2 px-2 z-10 relative">
          <div className="flex items-center gap-6 mb-10 bg-white/[0.02] p-6 rounded-3xl border border-white/5 shadow-inner">
            <div className="relative group cursor-pointer shrink-0">
              <div className="h-28 w-28 rounded-full bg-black/50 flex items-center justify-center border-2 border-[rgb(var(--accent))] shadow-[0_0_20px_rgba(var(--accent),0.3)] overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User size={48} className="text-gray-400" />
                )}
              </div>
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                <Upload size={20} className="mb-1 text-white" />
                <span className="text-white">Change</span>
                <input type="file" accept="image/*" onChange={uploadAvatar} disabled={loading} className="hidden" />
              </label>
            </div>
            <div className="flex flex-col">
              <h4 className="text-2xl font-bold text-white mb-1">{username}</h4>
              <div className="inline-flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg w-fit">
                <span className="text-gray-400 text-sm font-medium">{fullTag.split('#')[0]}</span>
                <span className="text-gray-600">#</span>
                <span className="text-[rgb(var(--accent))] font-mono font-bold tracking-wider">{displayTagNumber}</span>
              </div>
            </div>
          </div>

          <form onSubmit={updateProfile} className="space-y-6 mb-10">
            <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 space-y-5">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <User size={16} /> Profile Details
              </h4>
              
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Account ID (For adding friends)</label>
                <div className="flex items-center bg-black/50 rounded-2xl border border-white/5 focus-within:border-white/10 transition-all overflow-hidden p-1">
                  <input 
                    className="w-full px-4 py-3 bg-transparent text-gray-400 cursor-not-allowed outline-none select-all font-mono" 
                    type="text" 
                    value={fullTag} 
                    disabled 
                  />
                  <button type="button" onClick={copyTag} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white mr-1 cursor-pointer">
                    {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Display Name</label>
                <input 
                  className="w-full px-5 py-4 bg-black/40 rounded-2xl border border-white/10 focus:border-[rgb(var(--accent))] focus:shadow-[0_0_15px_rgba(var(--accent),0.15)] outline-none transition-all text-white font-medium text-lg" 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                />
                <p className="text-xs text-gray-500 mt-2 ml-1">This is how other users will see you in channels.</p>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-[rgb(var(--accent))] text-white px-8 py-3.5 rounded-2xl font-bold hover:brightness-110 transition-all shadow-[0_0_20px_rgba(var(--accent),0.4)] cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>

          {/* NEW LOGOUT SECTION */}
          <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 mb-6">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <LogOut size={16} /> Session Management
            </h4>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h5 className="text-white font-bold mb-1">Log Out</h5>
                <p className="text-xs text-gray-400">Sign out of your account on this device.</p>
              </div>
              <button 
                type="button"
                onClick={handleLogout}
                className="bg-white/5 border border-white/10 text-white hover:bg-white/10 px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-sm"
              >
                <LogOut size={16} />
                Log Out
              </button>
            </div>
          </div>

          <div className="bg-red-500/5 p-6 rounded-3xl border border-red-500/10">
            <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ShieldAlert size={16} /> Danger Zone
            </h4>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h5 className="text-white font-bold mb-1">Deactivate Account</h5>
                <p className="text-xs text-gray-400">Temporarily disable your account. You can reactivate it by logging in again.</p>
              </div>
              <button 
                type="button"
                onClick={handleDeactivate}
                className="bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <AlertTriangle size={16} />
                Deactivate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
