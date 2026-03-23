import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Upload, Loader2, User, AlertTriangle, ShieldAlert, Copy, Check, LogOut, Palette, Bell } from 'lucide-react'
import toast from 'react-hot-toast'

export default function UserSettingsModal({ session, onClose }) {
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [username, setUsername] = useState(session?.user?.user_metadata?.username || '')
  const [uniqueTag, setUniqueTag] = useState(session?.user?.user_metadata?.unique_tag || '')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('account')

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

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      if (updateError) throw updateError

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setAvatarUrl(publicUrl)
      toast.success('Avatar updated successfully')
    } catch (error) { toast.error(error.message) } 
    finally { setLoading(false) }
  }

  const updateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await supabase.auth.updateUser({ data: { username: username } })
      await supabase.from('profiles').update({ username }).eq('id', session.user.id)
      toast.success('Profile updated')
    } catch { toast.error('Failed to update profile') } 
    finally { setLoading(false) }
  }

  const handleDeactivate = () => toast.error('Deactivation requires email confirmation in this beta version.')
  const handleLogout = async () => { await supabase.auth.signOut(); onClose(); }

  const fullTag = uniqueTag.includes('#') ? uniqueTag : `${username || 'User'}#0000`
  const displayTagNumber = fullTag.split('#')[1]

  const copyTag = () => {
    navigator.clipboard.writeText(fullTag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle Escape key to close
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="glass-panel w-full max-w-5xl h-[85vh] min-h-[600px] flex overflow-hidden rounded-2xl animate-slide-up shadow-2xl border border-[#23252a]">
        
        {/* Discord-Style Settings Sidebar */}
        <aside className="w-64 bg-[#15171a] border-r border-[#23252a] flex flex-col pt-12 pb-6 px-4 shrink-0">
          <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-3">User Settings</h3>
            <button 
              onClick={() => setActiveTab('account')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none ${activeTab === 'account' ? 'bg-[#23252a] text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <User size={18} /> My Account
            </button>
            <button 
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none ${activeTab === 'appearance' ? 'bg-[#23252a] text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Palette size={18} /> Appearance
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none ${activeTab === 'notifications' ? 'bg-[#23252a] text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Bell size={18} /> Notifications
            </button>

            <div className="my-4 border-t border-[#23252a] mx-2"></div>
            
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all text-red-400 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 outline-none"
            >
              <LogOut size={18} /> Log Out
            </button>
          </div>
        </aside>

        {/* Main Settings Content */}
        <main className="flex-1 bg-[#0d0f12] overflow-y-auto custom-scrollbar relative p-10 md:p-14">
          <div className="max-w-2xl mx-auto">
            
            {/* Close Button / Esc Hint */}
            <div className="absolute top-10 right-10 flex flex-col items-center gap-1 group">
              <button 
                aria-label="Close modal" 
                onClick={onClose} 
                className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-gray-600 text-gray-400 group-hover:text-white group-hover:bg-white/10 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
              >
                <X size={18} aria-hidden="true" />
              </button>
              <span className="text-[10px] font-bold text-gray-600 uppercase">ESC</span>
            </div>

            {activeTab === 'account' && (
              <div className="animate-fade-in">
                <h2 className="text-2xl font-bold tracking-tight text-white mb-8 font-display">My Account</h2>
                
                {/* Profile Header Card */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-10 bg-[#1c1e22] p-6 rounded-2xl ghost-border shadow-inner">
                  <div className="relative group cursor-pointer shrink-0">
                    <div className="h-28 w-28 rounded-full bg-[#0d0f12] flex items-center justify-center border-2 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)] overflow-hidden">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <User size={48} className="text-gray-500" aria-hidden="true" />
                      )}
                    </div>
                    <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                      <Upload size={20} className="mb-1 text-white" aria-hidden="true" />
                      <span className="text-white">Change</span>
                      <input type="file" accept="image/*" onChange={uploadAvatar} disabled={loading} className="hidden" />
                    </label>
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-2xl font-bold text-white mb-1">{username}</h4>
                    <div className="inline-flex items-center gap-2 bg-[#0d0f12] ghost-border px-3 py-1.5 rounded-lg w-fit shadow-inner">
                      <span className="text-gray-400 text-sm font-medium">{fullTag.split('#')[0]}</span>
                      <span className="text-gray-600">#</span>
                      <span className="text-indigo-400 font-mono font-bold tracking-wider">{displayTagNumber}</span>
                    </div>
                  </div>
                </div>

                {/* Edit Profile Form */}
                <form onSubmit={updateProfile} className="space-y-6 mb-10">
                  <div className="bg-[#1c1e22] p-6 rounded-2xl ghost-border space-y-5">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <User size={16} aria-hidden="true" /> Profile Details
                    </h4>
                    
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Account ID (For adding friends)</label>
                      <div className="flex items-center bg-[#0d0f12] rounded-xl ghost-border overflow-hidden p-1 shadow-inner">
                        <input 
                          className="w-full px-4 py-3 bg-transparent text-gray-400 cursor-not-allowed outline-none select-all font-mono text-sm" 
                          type="text" 
                          value={fullTag} 
                          disabled 
                        />
                        <button 
                          type="button" 
                          onClick={copyTag} 
                          aria-label="Copy Account ID"
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white mr-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                        >
                          {copied ? <Check size={18} className="text-green-400" aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="display-name" className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Display Name</label>
                      <input 
                        id="display-name"
                        className="w-full px-5 py-4 bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium text-lg shadow-inner" 
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
                      className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-8 py-3.5 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-[0.98]"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Changes'}
                    </button>
                  </div>
                </form>

                {/* Danger Zone */}
                <div className="bg-red-500/5 p-6 rounded-2xl border border-red-500/20">
                  <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldAlert size={16} aria-hidden="true" /> Danger Zone
                  </h4>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h5 className="text-white font-bold mb-1">Deactivate Account</h5>
                      <p className="text-xs text-gray-400">Temporarily disable your account.</p>
                    </div>
                    <button 
                      type="button"
                      onClick={handleDeactivate}
                      className="bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none"
                    >
                      <AlertTriangle size={16} aria-hidden="true" />
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Placeholders for other tabs to make it feel like a real app */}
            {activeTab !== 'account' && (
              <div className="animate-fade-in flex flex-col items-center justify-center h-64 text-gray-500 opacity-60">
                <Palette size={48} className="mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Coming Soon</h3>
                <p>These settings are currently under construction by Skibidevs.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
