import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { X, Upload, Loader2, User, AlertTriangle, ShieldAlert, Copy, Check, LogOut, Palette, Bell, Lock, Link as LinkIcon, Ban, EyeOff, Camera, Edit2, Mail, Phone, Key, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const ToggleSwitch = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between p-4 bg-[#1c1e22] rounded-xl ghost-border mb-4 shadow-sm">
    <div className="pr-4">
      <h5 className="text-white font-bold text-sm">{label}</h5>
      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
    </div>
    <button 
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${checked ? 'bg-indigo-500' : 'bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
)

export default function UserSettingsModal({ session, initialTab = 'account', onClose }) {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [copied, setCopied] = useState(false)

  const [avatarUrl, setAvatarUrl] = useState(null)
  const [bannerUrl, setBannerUrl] = useState(null)
  const [username, setUsername] = useState(session?.user?.user_metadata?.username || '')
  const [uniqueTag, setUniqueTag] = useState(session?.user?.user_metadata?.unique_tag || '')
  const [bio, setBio] = useState(session?.user?.user_metadata?.bio || '')
  const [pronouns, setPronouns] = useState(session?.user?.user_metadata?.pronouns || '')
  
  const [userEmail, setUserEmail] = useState(session?.user?.email || '')
  const [userPhone, setUserPhone] = useState(session?.user?.phone || '')
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const [newEmail, setNewEmail] = useState(userEmail)
  const [newPhone, setNewPhone] = useState(userPhone)

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
        setBannerUrl(data.banner_url)
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

  useEffect(() => { localStorage.setItem('appTheme', appTheme) }, [appTheme])
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

  const uploadImage = async (event, type) => {
    try {
      setLoading(true)
      if (!event.target.files || event.target.files.length === 0) throw new Error('You must select an image to upload.')

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}-${type}-${Math.random()}.${fileExt}`
      const bucketName = type === 'avatar' ? 'avatars' : 'banners' 

      const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName)
      
      const updateData = type === 'avatar' ? { avatar_url: publicUrl } : { banner_url: publicUrl }
      const { error: updateError } = await supabase.from('profiles').update(updateData).eq('id', session.user.id)
      if (updateError) throw updateError

      await supabase.auth.updateUser({ data: updateData })
      
      if (type === 'avatar') setAvatarUrl(publicUrl)
      else setBannerUrl(publicUrl)
      
      toast.success(`${type === 'avatar' ? 'Avatar' : 'Banner'} updated successfully`)
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
      const updatePayload = { username: username.trim(), bio: bio.trim(), pronouns: pronouns.trim() }
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

  const handleUpdatePhone = async () => {
    if (!newPhone.trim() || newPhone === userPhone) return setIsEditingPhone(false)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ phone: newPhone.trim() })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Verification code sent.')
      setUserPhone(newPhone.trim())
      setIsEditingPhone(false)
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
  const handleLogout = async () => { await supabase.auth.signOut(); onClose(); }

  const fullTag = uniqueTag.includes('#') ? uniqueTag : `${username || 'User'}#0000`
  const displayTagNumber = fullTag.split('#')[1]

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
    { id: 'connections', label: 'Connections', icon: LinkIcon },
  ]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] md:p-4 overflow-hidden">
      <div className="w-full h-[100dvh] md:max-w-5xl md:h-[85vh] md:min-h-[600px] flex flex-col md:flex-row overflow-hidden md:rounded-2xl animate-slide-up shadow-2xl bg-[#0d0f12] md:border border-[#23252a]">
        
        <aside className="w-full md:w-64 bg-[#15171a] border-b md:border-b-0 md:border-r border-[#23252a] flex flex-row md:flex-col pt-safe md:pt-12 pb-0 md:pb-6 px-2 md:px-4 shrink-0 overflow-x-auto md:overflow-y-auto custom-scrollbar no-scrollbar relative z-20">
          <div className="flex md:hidden items-center justify-between w-full p-2 sticky left-0">
             <h3 className="text-sm font-bold text-white uppercase tracking-widest pl-2">Settings</h3>
             <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer">
               <X size={18} />
             </button>
          </div>

          <h3 className="hidden md:block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-3">User Settings</h3>
          
          <div className="flex flex-row md:flex-col gap-1 md:gap-1 p-2 md:p-0 min-w-max md:min-w-0 pb-3 md:pb-0">
            {TABS.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`flex items-center gap-2 md:gap-3 px-3 md:px-3 py-2 md:py-2.5 rounded-lg font-medium text-[13px] md:text-sm transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none whitespace-nowrap cursor-pointer ${activeTab === tab.id ? 'bg-[#23252a] text-white shadow-sm' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
              >
                <tab.icon size={16} className="md:w-[18px] md:h-[18px]" /> {tab.label}
              </button>
            ))}
            <div className="hidden md:block my-4 border-t border-[#23252a] mx-2"></div>
            <button onClick={handleLogout} className="hidden md:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all text-red-400 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 outline-none cursor-pointer">
              <LogOut size={18} /> Log Out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto custom-scrollbar relative p-4 sm:p-8 md:p-14 bg-[#0d0f12] pb-24 md:pb-14">
          <div className="max-w-2xl mx-auto h-full">
            
            <div className="hidden md:flex absolute top-10 right-10 flex-col items-center gap-1 group">
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-gray-600 text-gray-400 group-hover:text-white group-hover:bg-white/10 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none">
                <X size={18} aria-hidden="true" />
              </button>
              <span className="text-[10px] font-bold text-gray-600 uppercase">ESC</span>
            </div>

            {activeTab === 'account' && (
              <div className="animate-fade-in pb-10 space-y-10">
                <h2 className="text-2xl font-bold tracking-tight text-white font-display">My Account</h2>
                
                <div className="bg-[#1c1e22] rounded-2xl ghost-border overflow-hidden shadow-lg">
                  <div className="h-28 sm:h-32 bg-indigo-900/40 relative group">
                    {bannerUrl && <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />}
                    <label className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-md shadow-md">
                      <Camera size={16} />
                      <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'banner')} disabled={loading} className="hidden" />
                    </label>
                  </div>
                  
                  <div className="px-6 pb-6 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                    <div className="relative group cursor-pointer shrink-0 -mt-12 sm:-mt-14 z-10">
                      <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-[#0d0f12] flex items-center justify-center border-4 border-[#1c1e22] shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden">
                        {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : <User size={48} className="text-gray-500" aria-hidden="true" />}
                      </div>
                      <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm border-4 border-transparent">
                        <Upload size={18} className="mb-1 text-white" />
                        <span className="text-white">Avatar</span>
                        <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'avatar')} disabled={loading} className="hidden" />
                      </label>
                    </div>

                    <div className="flex flex-col flex-1 pb-1">
                      <h4 className="text-xl sm:text-2xl font-bold text-white leading-tight">{username}</h4>
                      <p className="text-sm text-gray-400 font-medium">{fullTag}</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={updateProfileDetails} className="bg-[#1c1e22] p-5 sm:p-6 rounded-2xl ghost-border space-y-5 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b border-[#23252a] pb-3"><Edit2 size={16} /> Public Profile</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Display Name</label>
                      <input className="w-full px-4 py-3 bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium shadow-inner" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Pronouns</label>
                      <input className="w-full px-4 py-3 bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium shadow-inner" type="text" placeholder="e.g. they/them" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">About Me</label>
                    <textarea className="w-full px-4 py-3 bg-[#0d0f12] rounded-xl ghost-border focus:border-indigo-500 outline-none transition-all text-white font-medium shadow-inner resize-none custom-scrollbar" rows={3} placeholder="Write a little bit about yourself..." value={bio} onChange={(e) => setBio(e.target.value)} />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={loading} className="w-full sm:w-auto bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
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
                      <button type="button" onClick={copyTag} className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] flex items-center justify-center gap-2 w-full sm:w-auto">
                        {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy ID'}
                      </button>
                    </div>

                    <div className="h-[1px] bg-[#23252a] w-full"></div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 w-full sm:w-auto">
                        <Mail className="text-gray-500 mt-0.5" size={20} />
                        <div className="flex-1">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-0.5">Email Address</span>
                          {isEditingEmail ? (
                            <input type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full bg-[#0d0f12] text-white px-3 py-1.5 rounded border border-indigo-500 outline-none text-sm" />
                          ) : (
                            <span className="text-white font-medium">{userEmail || 'No email attached'}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {isEditingEmail ? (
                          <>
                            <button type="button" onClick={() => { setIsEditingEmail(false); setNewEmail(userEmail) }} className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer flex-1 sm:flex-none">Cancel</button>
                            <button type="button" onClick={handleUpdateEmail} disabled={loading} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer flex-1 sm:flex-none flex items-center justify-center gap-2">{loading ? <Loader2 size={16} className="animate-spin"/> : 'Save'}</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setIsEditingEmail(true)} className="bg-[#0d0f12] hover:bg-[#23252a] text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] w-full sm:w-auto">Edit</button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 w-full sm:w-auto">
                        <Phone className="text-gray-500 mt-0.5" size={20} />
                        <div className="flex-1">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-0.5">Phone Number</span>
                          {isEditingPhone ? (
                            <input type="tel" autoFocus value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="w-full bg-[#0d0f12] text-white px-3 py-1.5 rounded border border-indigo-500 outline-none text-sm" />
                          ) : (
                            <span className="text-gray-400 font-medium italic">{userPhone || 'No phone number added'}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {isEditingPhone ? (
                          <>
                            <button type="button" onClick={() => { setIsEditingPhone(false); setNewPhone(userPhone) }} className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer flex-1 sm:flex-none">Cancel</button>
                            <button type="button" onClick={handleUpdatePhone} disabled={loading} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer flex-1 sm:flex-none flex items-center justify-center gap-2">{loading ? <Loader2 size={16} className="animate-spin"/> : 'Save'}</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setIsEditingPhone(true)} className="bg-[#0d0f12] hover:bg-[#23252a] text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] w-full sm:w-auto">{userPhone ? 'Edit' : 'Add'}</button>
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
                    <button type="button" onClick={handlePasswordReset} disabled={loading} className="w-full bg-[#0d0f12] hover:bg-[#23252a] border border-[#23252a] text-white p-4 rounded-xl flex items-center justify-between transition-colors cursor-pointer group disabled:opacity-50">
                      <div className="flex items-center gap-3"><Key size={20} className="text-indigo-400" /> <span className="font-bold">Reset Password via Email</span></div>
                      {loading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <span className="text-xs text-gray-500 group-hover:text-white transition-colors">Send Link</span>}
                    </button>
                    <button type="button" onClick={() => toast('Configure MFA Policies in Supabase dashboard to enable this.')} className="w-full bg-[#0d0f12] hover:bg-[#23252a] border border-[#23252a] text-white p-4 rounded-xl flex items-center justify-between transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3"><ShieldAlert size={20} className="text-green-400" /> <span className="font-bold">Enable Two-Factor Auth</span></div>
                      <span className="text-xs text-gray-500 group-hover:text-white transition-colors">Setup</span>
                    </button>
                  </div>
                </div>

                <div className="bg-red-500/5 p-5 sm:p-6 rounded-2xl border border-red-500/20">
                  <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Danger Zone</h4>
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h5 className="text-white font-bold mb-0.5">Disable Account</h5>
                        <p className="text-xs text-gray-400">Temporarily hide your profile and messages.</p>
                      </div>
                      <button type="button" onClick={handleDeactivate} className="w-full sm:w-auto bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 py-2.5 rounded-xl font-bold transition-all cursor-pointer">
                        Disable
                      </button>
                    </div>
                    <div className="h-[1px] bg-red-500/20 w-full"></div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h5 className="text-white font-bold mb-0.5">Delete Account</h5>
                        <p className="text-xs text-gray-400">Permanently erase your account and data.</p>
                      </div>
                      <button type="button" onClick={() => toast.error('Account deletion requires custom RPC setup in Supabase.')} className="w-full sm:w-auto bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 py-2.5 rounded-xl font-bold transition-all cursor-pointer">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                <button onClick={handleLogout} className="md:hidden w-full flex items-center justify-center gap-3 mt-8 px-4 py-3.5 rounded-xl font-bold text-sm transition-all border border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10 active:scale-[0.98] outline-none cursor-pointer">
                  <LogOut size={18} /> Log Out
                </button>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="animate-fade-in pb-10">
                <h2 className="text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Privacy & Safety</h2>
                
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
                          <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[#0d0f12] overflow-hidden border border-[#23252a] shrink-0">
                                {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-white uppercase">{profile.username[0]}</span>}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-white font-bold text-sm">{profile.username}</span>
                                <span className="text-gray-500 text-xs font-mono">{profile.unique_tag}</span>
                              </div>
                            </div>
                            <button onClick={() => handleUnblock(profile.id)} className="bg-[#0d0f12] hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] hover:border-red-500/30 text-xs">Unblock</button>
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
                          <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[#0d0f12] overflow-hidden border border-[#23252a] shrink-0">
                                {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-white uppercase">{profile.username[0]}</span>}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-white font-bold text-sm">{profile.username}</span>
                                <span className="text-gray-500 text-xs font-mono">{profile.unique_tag}</span>
                              </div>
                            </div>
                            <button onClick={() => handleUnrestrict(profile.id)} className="bg-[#0d0f12] hover:bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-[#23252a] hover:border-indigo-500/30 text-xs">Unrestrict</button>
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
                <h2 className="text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Appearance</h2>
                <div className="bg-[#1c1e22] p-5 sm:p-6 rounded-2xl ghost-border space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">App Theme</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {['dark', 'midnight', 'light'].map(theme => (
                        <button key={theme} onClick={() => { setAppTheme(theme); toast("Global themes coming soon!", { icon: '🎨'}) }} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all cursor-pointer ${appTheme === theme ? 'border-indigo-500 bg-indigo-500/10 shadow-md' : 'border-[#23252a] hover:border-gray-500'}`}>
                          <div className={`w-full h-16 rounded-lg ghost-border ${theme === 'dark' ? 'bg-[#0d0f12]' : theme === 'midnight' ? 'bg-black' : 'bg-gray-200'}`}></div>
                          <span className="text-sm font-bold capitalize text-white">{theme}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="animate-fade-in pb-10">
                <h2 className="text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Notifications</h2>
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

            {activeTab === 'connections' && (
              <div className="animate-fade-in pb-10">
                <h2 className="text-2xl font-bold tracking-tight text-white mb-6 md:mb-8 font-display">Connections</h2>
                <p className="text-sm text-gray-400 mb-6">Connect your accounts to unlock special integrations and display them on your profile.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={() => toast('Configure OAuth via Supabase backend to enable.')} className="bg-[#1c1e22] hover:bg-white/5 transition-colors p-4 rounded-xl ghost-border flex items-center gap-4 group cursor-pointer text-left">
                    <div className="w-10 h-10 rounded-full bg-[#0d0f12] flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                      <span className="font-bold text-lg">S</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-white text-sm">Steam</h5>
                      <p className="text-xs text-gray-500">Not Connected</p>
                    </div>
                  </button>

                  <button onClick={() => toast('Configure OAuth via Supabase backend to enable.')} className="bg-[#1c1e22] hover:bg-white/5 transition-colors p-4 rounded-xl ghost-border flex items-center gap-4 group cursor-pointer text-left">
                    <div className="w-10 h-10 rounded-full bg-[#0d0f12] flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                      <span className="font-bold text-lg">G</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-white text-sm">GitHub</h5>
                      <p className="text-xs text-gray-500">Not Connected</p>
                    </div>
                  </button>
                  
                  <button onClick={() => toast('Configure OAuth via Supabase backend to enable.')} className="bg-[#1c1e22] hover:bg-white/5 transition-colors p-4 rounded-xl ghost-border flex items-center gap-4 group cursor-pointer text-left">
                    <div className="w-10 h-10 rounded-full bg-[#0d0f12] flex items-center justify-center text-[#1DB954] opacity-70 group-hover:opacity-100 transition-colors">
                      <span className="font-bold text-lg">Sp</span>
                    </div>
                    <div>
                      <h5 className="font-bold text-white text-sm">Spotify</h5>
                      <p className="text-xs text-gray-500">Not Connected</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
