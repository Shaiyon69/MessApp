import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Upload, Loader2, User, AlertTriangle, Copy, Check, LogOut, Palette, Bell, Lock, Edit2, Mail, Key, Shield, ChevronRight, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'

const BANNER_OPTIONS = [
  { id: 'indigo', value: 'linear-gradient(to right, #4f46e5, #9333ea)' },
  { id: 'sunset', value: 'linear-gradient(to right, #f97316, #eab308)' },
  { id: 'ocean', value: 'linear-gradient(to right, #0ea5e9, #10b981)' },
  { id: 'cherry', value: 'linear-gradient(to right, #f43f5e, #ec4899)' },
  { id: 'midnight', value: 'linear-gradient(to right, #1e1b4b, #312e81)' },
  { id: 'solid-gray', value: '#374151' },
  { id: 'solid-black', value: '#0a0a0c' }
]

const ToggleSwitch = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between p-4 bg-[#1c1e22] rounded-xl ghost-border mb-4 shadow-sm">
    <div className="pr-4">
      <h5 className="text-white font-bold text-sm md:text-base">{label}</h5>
      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
    </div>
    <button 
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${checked ? 'bg-indigo-500' : 'bg-gray-600'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
)

export default function UserSettingsModal({ session, initialTab = 'account', onClose }) {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [showMobileMenu, setShowMobileMenu] = useState(true) 
  
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const [avatarUrl, setAvatarUrl] = useState(null)
  const [bannerUrl, setBannerUrl] = useState(BANNER_OPTIONS[0].value)
  const [username, setUsername] = useState(session?.user?.user_metadata?.username || '')
  const [uniqueTag, setUniqueTag] = useState(session?.user?.user_metadata?.unique_tag || '')
  const [bio, setBio] = useState(session?.user?.user_metadata?.bio || '')
  const [pronouns, setPronouns] = useState(session?.user?.user_metadata?.pronouns || '')
  
  const [userEmail, setUserEmail] = useState(session?.user?.email || '')
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState(userEmail)

  const [appTheme, setAppTheme] = useState(() => localStorage.getItem('appTheme') || 'dark')
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false')
  const [desktopNotifs, setDesktopNotifs] = useState(() => Notification.permission === 'granted')

  const [allowDirectMessages, setAllowDirectMessages] = useState(true)
  const [blockedUsers, setBlockedUsers] = useState(() => JSON.parse(localStorage.getItem(`blocked_${session.user.id}`) || '[]'))
  const [restrictedUsers, setRestrictedUsers] = useState(() => JSON.parse(localStorage.getItem(`restricted_${session.user.id}`) || '[]'))
  const [blockedProfiles, setBlockedProfiles] = useState([])
  const [restrictedProfiles, setRestrictedProfiles] = useState([])

  useEffect(() => {
    async function getProfile() {
      const { data } = await supabase.from('profiles').select('avatar_url, banner_url, username, unique_tag, bio, pronouns').eq('id', session.user.id).single()
      if (data) {
        setAvatarUrl(data.avatar_url)
        if (data.banner_url) setBannerUrl(data.banner_url)
        if (data.username) setUsername(data.username)
        if (data.unique_tag) setUniqueTag(data.unique_tag)
        if (data.bio) setBio(data.bio)
        if (data.pronouns) setPronouns(data.pronouns)
      }
    }
    getProfile()
  }, [session.user.id])

  useEffect(() => {
    async function fetchPrivacyProfiles() {
      if (blockedUsers.length > 0) {
        const { data } = await supabase.from('profiles').select('id, username, avatar_url, unique_tag').in('id', blockedUsers)
        if (data) setBlockedProfiles(data)
      } else setBlockedProfiles([])

      if (restrictedUsers.length > 0) {
        const { data } = await supabase.from('profiles').select('id, username, avatar_url, unique_tag').in('id', restrictedUsers)
        if (data) setRestrictedProfiles(data)
      } else setRestrictedProfiles([])
    }
    fetchPrivacyProfiles()
  }, [blockedUsers, restrictedUsers])

  // PERFORMANCE: Mutate the DOM directly for themes to avoid heavy React re-renders
  useEffect(() => { 
    localStorage.setItem('appTheme', appTheme) 
    document.documentElement.setAttribute('data-theme', appTheme)
    
    if (appTheme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
    }
  }, [appTheme])

  useEffect(() => { localStorage.setItem('soundEnabled', soundEnabled) }, [soundEnabled])

  const requestDesktopNotifs = async (enabled) => {
    if (!enabled) {
      setDesktopNotifs(false)
      toast.success("Desktop notifications disabled.")
      return
    }
    if (!("Notification" in window)) {
      toast.error("This browser/device does not support standard web notifications.")
      return
    }
    if (Notification.permission === "granted") {
      setDesktopNotifs(true)
    } else if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission()
      if (permission === "granted") {
        setDesktopNotifs(true)
        toast.success("Desktop notifications enabled!")
      } else {
        toast.error("Permission denied.")
      }
    }
  }

  const uploadAvatar = async (event) => {
    try {
      setLoading(true)
      if (!event.target.files || event.target.files.length === 0) throw new Error('You must select an image to upload.')

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}-avatar-${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      if (updateError) throw updateError

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      
      setAvatarUrl(publicUrl)
      toast.success('Avatar updated successfully')
    } catch (error) { 
      toast.error(error.message) 
    } finally { 
      setLoading(false) 
    }
  }

  const updateProfileDetails = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const updatePayload = { 
        username: username.trim(), 
        bio: bio.trim(), 
        pronouns: pronouns.trim(),
        banner_url: bannerUrl 
      }
      await supabase.auth.updateUser({ data: updatePayload })
      await supabase.from('profiles').update(updatePayload).eq('id', session.user.id)
      toast.success('Profile updated successfully')
    } catch { toast.error('Failed to update profile') } 
    finally { setLoading(false) }
  }

  const handleUpdateEmail = async () => {
    if (!newEmail.trim() || newEmail === userEmail) return setIsEditingEmail(false)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Verification link sent to both emails.')
      setUserEmail(newEmail.trim())
      setIsEditingEmail(false)
    }
    setLoading(false)
  }

  const handlePasswordReset = async () => {
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, {
      redirectTo: window.location.origin
    })
    if (error) toast.error(error.message)
    else toast.success('Password reset link sent to your email.')
    setLoading(false)
  }

  const handleUnblock = (id) => {
    const updated = blockedUsers.filter(u => u !== id)
    setBlockedUsers(updated)
    localStorage.setItem(`blocked_${session.user.id}`, JSON.stringify(updated))
    toast.success("User unblocked")
  }

  const handleUnrestrict = (id) => {
    const updated = restrictedUsers.filter(u => u !== id)
    setRestrictedUsers(updated)
    localStorage.setItem(`restricted_${session.user.id}`, JSON.stringify(updated))
    toast.success("User unrestricted")
  }

  const handleDeactivate = () => toast.error('Deactivation requires email confirmation in this beta version.')
  
  const handleLogout = async () => { 
    try {
      await supabase.auth.signOut();
      localStorage.clear(); 
      window.location.reload(); 
    } catch (e) {
      toast.error("Failed to log out: " + e.message);
    }
  }

  // SECURITY: Securely deletes user by calling Postgres RPC
  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_user_account')
      if (error) throw error
      
      await supabase.auth.signOut()
      localStorage.clear()
      window.location.reload()
    } catch (error) {
      toast.error(error.message || 'Failed to delete account.')
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const fullTag = uniqueTag.includes('#') ? uniqueTag : `${username || 'User'}#0000`

  const copyTag = () => {
    navigator.clipboard.writeText(fullTag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const TABS = [
    { id: 'account', label: 'My Account', icon: User },
    { id: 'privacy', label: 'Privacy & Safety', icon: Lock },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start md:items-center justify-center z-[100] md:p-4 overflow-hidden">
      
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#15171a] w-full max-w-sm rounded-3xl border border-[#23252a] shadow-2xl p-6 text-center animate-slide-up md:animate-fade-in">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <LogOut size={32} className="text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Ready to leave?</h3>
            <p className="text-gray-400 text-sm mb-8">Are you sure you want to log out of MessApp?</p>
            <div className="flex flex-col gap-3">
              <button onClick={handleLogout} className="w-full h-14 md:h-12 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 cursor-pointer text-base md:text-sm">
                Yes, Log Out
              </button>
              <button onClick={() => setShowLogoutConfirm(false)} className="w-full h-14 md:h-12 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-bold transition-all cursor-pointer border border-white/5 text-base md:text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#15171a] w-full max-w-sm rounded-3xl border border-red-500/50 shadow-2xl p-6 text-center animate-slide-up md:animate-fade-in">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Delete Account?</h3>
            <p className="text-gray-400 text-sm mb-6">This action is <span className="text-red-400 font-bold">permanent</span> and cannot be undone. All data will be wiped.</p>
            <div className="flex flex-col gap-3">
              <button onClick={handleDeleteAccount} disabled={isDeleting} className="w-full h-14 md:h-12 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 cursor-pointer text-base md:text-sm flex items-center justify-center disabled:opacity-50">
                {isDeleting ? <Loader2 className="animate-spin" size={20} /> : 'Permanently Delete'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} className="w-full h-14 md:h-12 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-bold transition-all cursor-pointer border border-white/5 text-base md:text-sm disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-full md:max-w-5xl md:h-[85vh] md:min-h-[600px] flex flex-col md:flex-row overflow-hidden md:rounded-2xl animate-slide-up shadow-2xl bg-[#0d0f12] md:border border-[#23252a]">
        
        <aside className={`${showMobileMenu ? 'flex' : 'hidden'} md:flex w-full md:w-64 bg-[#111214] md:bg-[#15171a] border-r border-[#23252a] flex-col shrink-0 z-20 h-full`}>
          <div className="flex md:hidden items-center justify-between w-full px-6 h-16 bg-[#0d0f12] border-b border-[#23252a] shrink-0 sticky top-0">
             <h3 className="text-xl font-bold text-white tracking-tight">Settings</h3>
             <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer">
               <X size={24} />
             </button>
          </div>

          <h3 className="hidden md:block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-3 pt-8">User Settings</h3>
          
          <div className="flex flex-col p-4 md:p-0 gap-4 md:gap-1 flex-1 overflow-y-auto">
            <div className="bg-[#1c1e22] md:bg-transparent rounded-2xl md:rounded-none border border-[#23252a] md:border-none overflow-hidden shadow-sm md:shadow-none">
              {TABS.map((tab, index) => (
                <div key={tab.id}>
                  <button 
                    onClick={() => { setActiveTab(tab.id); setShowMobileMenu(false); }} 
                    className={`w-full flex items-center justify-between md:justify-start gap-2 md:gap-3 px-5 md:px-3 h-16 md:h-10 font-medium text-base md:text-sm transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none cursor-pointer ${activeTab === tab.id && !showMobileMenu ? 'md:bg-[#23252a] md:text-white md:shadow-sm' : 'text-gray-300 md:text-gray-400 hover:bg-white/5 hover:text-white bg-transparent'}`}
                  >
                    <div className="flex items-center gap-3">
                      <tab.icon size={20} className="md:w-[18px] md:h-[18px] text-gray-400" /> 
                      <span className="text-white md:text-inherit">{tab.label}</span>
                    </div>
                    <ChevronRight size={20} className="md:hidden text-gray-500" />
                  </button>
                  {index < TABS.length - 1 && <div className="h-[1px] bg-[#23252a] md:hidden mx-5"></div>}
                </div>
              ))}
            </div>

            <div className="hidden md:block my-2 border-t border-[#23252a] mx-2"></div>

            <button onClick={() => setShowLogoutConfirm(true)} className="flex w-full items-center justify-center md:justify-start gap-3 px-5 md:px-3 h-16 md:h-10 rounded-2xl md:rounded-lg font-bold text-base md:text-sm transition-all text-red-400 hover:bg-red-500/10 bg-[#1c1e22] md:bg-transparent border border-[#23252a] md:border-transparent shadow-sm md:shadow-none focus-visible:ring-2 focus-visible:ring-red-500 outline-none cursor-pointer mt-auto md:mt-0">
               <div className="flex items-center gap-3">
                 <LogOut size={20} className="md:w-[18px] md:h-[18px] text-red-400" />
                 <span>Log Out</span>
               </div>
            </button>
          </div>
        </aside>

        <main className={`${!showMobileMenu ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden bg-[#0d0f12] relative`}>
          
          <div className="md:hidden flex items-center justify-between px-4 h-16 border-b border-[#23252a] bg-[#15171a] shrink-0 sticky top-0 z-50 shadow-sm">
            <button onClick={() => setShowMobileMenu(true)} className="flex items-center text-indigo-400 font-medium p-2 -ml-2 cursor-pointer">
              <ChevronLeft size={28} />
              <span className="ml-1 text-base">Settings</span>
            </button>
            <span className="font-bold text-white text-base absolute left-0 right-0 text-center pointer-events-none">{TABS.find(t => t.id === activeTab)?.label}</span>
          </div>

          <div className="hidden md:flex absolute top-10 right-10 flex-col items-center gap-1 group z-50">
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-gray-600 text-gray-400 group-hover:text-white group-hover:bg-white/10 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none">
              <X size={18} aria-hidden="true" />
            </button>
            <span className="text-[10px] font-bold text-gray-600 uppercase">ESC</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative p-4 sm:p-8 md:p-14 pb-32 md:pb-14">
            <div className="max-w-2xl mx-auto h-full">

              {activeTab === 'account' && (
                <div className="animate-fade-in space-y-8 md:space-y-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-white font-display">My Account</h2>
                  
                  <div className="bg-[#1c1e22] rounded-2xl ghost-border overflow-hidden shadow-lg">
                    <div className="h-28 sm:h-32 transition-all duration-300" style={{ background: bannerUrl }}></div>
                    
                    <div className="px-5 md:px-6 pb-6 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                      <div className="relative group cursor-pointer shrink-0 -mt-12 sm:-mt-14 z-10 w-fit">
                        <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-[#0d0f12] flex items-center justify-center border-4 border-[#1c1e22] shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden">
                          {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : <User size={48} className="text-gray-500" aria-hidden="true" />}
                        </div>
                        <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm border-4 border-transparent">
                          <Upload size={18} className="mb-1 text-white" />
                          <span className="text-white">Avatar</span>
                          <input type="file" accept="image/*" onChange={uploadAvatar} disabled={loading} className="hidden" />
                        </label>
                      </div>

                      <div className="flex flex-col flex-1 pb-1">
                        <h4 className="text-xl sm:text-2xl font-bold text-white leading-tight">{username}</h4>
                        <p className="text-sm text-gray-400 font-medium">{fullTag}</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={updateProfileDetails} className="bg-[#1c1e22] p-5 sm:p-6 rounded-2xl ghost-border space-y-6 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b border-[#23252a] pb-3"><Edit2 size={16} /> Public Profile</h4>
                    
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-3 block">Banner Color</label>
                      <div className="flex flex-wrap gap-3">
                        {BANNER_OPTIONS.map(b => (
                          <button 
                            type="button" 
                            key={b.id} 
                            onClick={() => setBannerUrl(b.value)}
                            className={`w-10 h-10 md:w-8 md:h-8 rounded-full border-2 transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${bannerUrl === b.value ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'}`}
                            style={{ background: b.value }}
                            title={`Select ${b.id} banner`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Display Name</label>
                        <input className="w-full px-4 h-14 md:h-12 bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium shadow-inner text-[16px] md:text-sm" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Pronouns</label>
                        <input className="w-full px-4 h-14 md:h-12 bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium shadow-inner text-[16px] md:text-sm" type="text" placeholder="e.g. they/them" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">About Me</label>
                      <textarea className="w-full px-4 py-4 md:py-3 min-h-[100px] bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium shadow-inner resize-none custom-scrollbar text-[16px] md:text-sm" rows={3} placeholder="Write a little bit about yourself..." value={bio} onChange={(e) => setBio(e.target.value)} />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button type="submit" disabled={loading} className="w-full sm:w-auto bg-indigo-500 text-white px-8 h-14 md:h-12 rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-base md:text-sm">
                        {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Profile'}
                      </button>
                    </div>
                  </form>

                  <div className="bg-[#1c1e22] rounded-2xl ghost-border overflow-hidden shadow-sm">
                    <div className="p-5 sm:p-6 border-b border-[#23252a]">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><User size={16} /> Account Information</h4>
                    </div>
                    
                    <div className="p-5 sm:p-6 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Account ID</span>
                          <div className="text-white font-mono bg-[#0d0f12] px-3 py-1.5 rounded-lg border border-[#23252a] inline-block">{fullTag}</div>
                        </div>
                        <button type="button" onClick={copyTag} className="bg-white/5 hover:bg-white/10 text-white px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] flex items-center justify-center gap-2 w-full sm:w-auto text-base md:text-sm">
                          {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />} {copied ? 'Copied' : 'Copy ID'}
                        </button>
                      </div>

                      <div className="h-[1px] bg-[#23252a] w-full"></div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3 w-full sm:w-auto">
                          <Mail className="text-gray-500 mt-0.5 hidden sm:block" size={20} />
                          <div className="flex-1">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-0.5">Email Address</span>
                            {isEditingEmail ? (
                              <input type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full bg-[#0d0f12] text-white px-4 h-14 md:h-10 rounded-xl md:rounded-lg border border-indigo-500 outline-none text-[16px] md:text-sm mt-2 md:mt-0" />
                            ) : (
                              <span className="text-white font-medium text-[16px] md:text-base">{userEmail || 'No email attached'}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          {isEditingEmail ? (
                            <>
                              <button type="button" onClick={() => { setIsEditingEmail(false); setNewEmail(userEmail) }} className="bg-white/5 hover:bg-white/10 text-white px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium transition-colors cursor-pointer flex-1 sm:flex-none text-base md:text-sm">Cancel</button>
                              <button type="button" onClick={handleUpdateEmail} disabled={loading} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium transition-colors cursor-pointer flex-1 sm:flex-none flex items-center justify-center gap-2 text-base md:text-sm">{loading ? <Loader2 size={18} className="animate-spin"/> : 'Save'}</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setIsEditingEmail(true)} className="bg-[#0d0f12] hover:bg-[#23252a] text-white px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] w-full sm:w-auto text-base md:text-sm">Edit</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#1c1e22] rounded-2xl ghost-border overflow-hidden shadow-sm">
                    <div className="p-5 sm:p-6 border-b border-[#23252a]">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Shield size={16} /> Password & Authentication</h4>
                    </div>
                    <div className="p-5 sm:p-6 space-y-4">
                      <button type="button" onClick={handlePasswordReset} disabled={loading} className="w-full bg-[#0d0f12] hover:bg-[#23252a] border border-[#23252a] text-white h-16 md:h-14 px-4 rounded-xl flex items-center justify-between transition-colors cursor-pointer group disabled:opacity-50">
                        <div className="flex items-center gap-3"><Key size={20} className="text-indigo-400" /> <span className="font-bold text-base md:text-sm">Reset Password via Email</span></div>
                        {loading ? <Loader2 size={18} className="animate-spin text-gray-400" /> : <span className="text-xs text-gray-500 group-hover:text-white transition-colors hidden sm:block">Send Link</span>}
                      </button>
                    </div>
                  </div>

                  <div className="bg-red-500/5 p-5 sm:p-6 rounded-2xl border border-red-500/20">
                    <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Danger Zone</h4>
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="text-white font-bold mb-0.5 text-base md:text-sm">Disable Account</h5>
                          <p className="text-xs text-gray-400">Temporarily hide your profile and messages.</p>
                        </div>
                        <button type="button" onClick={handleDeactivate} className="w-full sm:w-auto bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 h-14 md:h-10 rounded-xl md:rounded-lg font-bold transition-all cursor-pointer text-base md:text-sm">
                          Disable
                        </button>
                      </div>
                      <div className="h-[1px] bg-red-500/20 w-full"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="text-white font-bold mb-0.5 text-base md:text-sm">Delete Account</h5>
                          <p className="text-xs text-gray-400">Permanently erase your account and data.</p>
                        </div>
                        <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full sm:w-auto bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 h-14 md:h-10 rounded-xl md:rounded-lg font-bold transition-all cursor-pointer text-base md:text-sm">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Privacy & Safety</h2>
                  
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-6 mb-2">Direct Messages</h4>
                    <ToggleSwitch 
                      label="Allow direct messages from server members" 
                      description="This setting is applied when you join a new server." 
                      checked={allowDirectMessages} 
                      onChange={setAllowDirectMessages} 
                    />

                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-8 mb-2">Blocked Users</h4>
                    <div className="bg-[#1c1e22] rounded-2xl ghost-border overflow-hidden">
                      {blockedProfiles.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-sm">You haven't blocked anyone.</div>
                      ) : (
                        blockedProfiles.map((profile, idx) => (
                          <div key={profile.id}>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-white/5 transition-colors gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-[#0d0f12] overflow-hidden border border-[#23252a] shrink-0">
                                  {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-white uppercase text-lg md:text-base">{profile.username[0]}</span>}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-white font-bold text-base md:text-sm">{profile.username}</span>
                                  <span className="text-gray-500 text-sm md:text-xs font-mono">{profile.unique_tag}</span>
                                </div>
                              </div>
                              <button onClick={() => handleUnblock(profile.id)} className="bg-[#0d0f12] hover:bg-red-500/20 text-red-400 w-full sm:w-auto px-4 h-12 md:h-10 rounded-xl md:rounded-lg font-bold transition-colors cursor-pointer border border-[#23252a] hover:border-red-500/30 text-base md:text-sm">Unblock</button>
                            </div>
                            {idx < blockedProfiles.length - 1 && <div className="h-[1px] bg-[#23252a] mx-4"></div>}
                          </div>
                        ))
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-8 mb-2">Restricted Accounts</h4>
                    <div className="bg-[#1c1e22] rounded-2xl ghost-border overflow-hidden">
                      {restrictedProfiles.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-sm">You haven't restricted anyone.</div>
                      ) : (
                        restrictedProfiles.map((profile, idx) => (
                          <div key={profile.id}>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-white/5 transition-colors gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-[#0d0f12] overflow-hidden border border-[#23252a] shrink-0">
                                  {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-white uppercase text-lg md:text-base">{profile.username[0]}</span>}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-white font-bold text-base md:text-sm">{profile.username}</span>
                                  <span className="text-gray-500 text-sm md:text-xs font-mono">{profile.unique_tag}</span>
                                </div>
                              </div>
                              <button onClick={() => handleUnrestrict(profile.id)} className="bg-[#0d0f12] hover:bg-indigo-500/20 text-indigo-400 w-full sm:w-auto px-4 h-12 md:h-10 rounded-xl md:rounded-lg font-bold transition-colors cursor-pointer border border-[#23252a] hover:border-indigo-500/30 text-base md:text-sm">Unrestrict</button>
                            </div>
                            {idx < restrictedProfiles.length - 1 && <div className="h-[1px] bg-[#23252a] mx-4"></div>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Appearance</h2>
                  <div className="bg-[#1c1e22] p-5 sm:p-6 rounded-2xl ghost-border space-y-6">
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">App Theme</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {['dark', 'midnight', 'light'].map(theme => (
                          <button key={theme} onClick={() => setAppTheme(theme)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all cursor-pointer ${appTheme === theme ? 'border-indigo-500 bg-indigo-500/10 shadow-md' : 'border-[#23252a] hover:border-gray-500'}`}>
                            <div className={`w-full h-16 rounded-lg ghost-border ${theme === 'dark' ? 'bg-[#0d0f12]' : theme === 'midnight' ? 'bg-black' : 'bg-gray-200'}`}></div>
                            <span className="text-base md:text-sm font-bold capitalize text-white">{theme}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Notifications</h2>
                  <div className="space-y-2">
                    <ToggleSwitch 
                      label="Enable Desktop/Push Notifications" 
                      description="Receive alerts when you are pinged or receive a DM outside the app." 
                      checked={desktopNotifs} 
                      onChange={requestDesktopNotifs} 
                    />
                    <ToggleSwitch 
                      label="Message Sounds" 
                      description="Play a subtle sound when a new message arrives." 
                      checked={soundEnabled} 
                      onChange={setSoundEnabled} 
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
