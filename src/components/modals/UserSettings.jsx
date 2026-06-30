import { useCallback, useMemo, useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { Capacitor } from '@capacitor/core'
import { X, Upload, Loader2, User, AlertTriangle, Copy, Check, LogOut, Palette, Bell, Lock, Edit2, Mail, Key, Shield, ChevronRight, ChevronLeft, FileText, History, Mic, Video, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { THEME_MODES, applyThemeMode, normalizeThemeMode } from '../../lib/theme'
import { audioSys } from '../../lib/SoundEngine'

const BANNER_OPTIONS = [
  { id: 'indigo', value: 'linear-gradient(to right, #4f46e5, #9333ea)' },
  { id: 'sunset', value: 'linear-gradient(to right, #f97316, #eab308)' },
  { id: 'ocean', value: 'linear-gradient(to right, #0ea5e9, #10b981)' },
  { id: 'cherry', value: 'linear-gradient(to right, #f43f5e, #ec4899)' },
  { id: 'violet', value: 'linear-gradient(to right, #1e1b4b, #312e81)' },
  { id: 'solid-gray', value: '#374151' },
  { id: 'solid-black', value: '#0a0a0c' }
]

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
const getLocalBoolean = (key, fallback = true) => {
  const value = localStorage.getItem(key)
  return value === null ? fallback : value !== 'false'
}

const ToggleSwitch = ({ label, description, checked, onChange }) => (
  <div className="premium-section flex items-center justify-between p-4 rounded-xl mb-4">
    <div className="pr-4">
      <h5 className="text-[var(--text-main)] font-bold text-sm md:text-base">{label}</h5>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
    </div>
    <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none cursor-pointer ${checked ? 'bg-[var(--accent)]' : 'bg-gray-600'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
)

export default function UserSettingsModal({ session, settingsConfig, setSettingsConfig, onProfileUpdated, onClose }) {
  const [loading, setLoading] = useState(false)
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
  const [savedProfile, setSavedProfile] = useState(null)
  
  const [userEmail, setUserEmail] = useState(session?.user?.email || '')
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState(userEmail)
  const [hasSecureStorage, setHasSecureStorage] = useState(false)
  
  const [resetCooldown, setResetCooldown] = useState(0)

  const [appTheme, setAppTheme] = useState(() => normalizeThemeMode(localStorage.getItem('appTheme') || 'dark'))
  const [uiDensity, setUiDensity] = useState(() => {
    const stored = localStorage.getItem('uiDensity') || localStorage.getItem('chatMessageScale') || 'default'
    if (stored === 'comfortable' || stored === 'normal') return 'default'
    if (stored === 'large') return 'spacious'
    return stored
  })
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState(() => getLocalBoolean('messageSoundsEnabled', getLocalBoolean('soundEnabled', true)))
  const [callSoundsEnabled, setCallSoundsEnabled] = useState(() => getLocalBoolean('callSoundsEnabled', true))
  const [ringtoneSoundsEnabled, setRingtoneSoundsEnabled] = useState(() => getLocalBoolean('ringtoneSoundsEnabled', true))
  const [desktopNotifs, setDesktopNotifs] = useState(() => localStorage.getItem('notificationsEnabled') === 'true')
  const [voiceAutoGain, setVoiceAutoGain] = useState(() => localStorage.getItem('voiceAutoGain') !== 'false')
  const [voiceEchoCancel, setVoiceEchoCancel] = useState(() => localStorage.getItem('voiceEchoCancel') !== 'false')
  const [videoPreviewEnabled, setVideoPreviewEnabled] = useState(() => localStorage.getItem('videoPreviewEnabled') === 'true')

  const [allowDirectMessages, setAllowDirectMessages] = useState(true)
  const [allowFriendRequests, setAllowFriendRequests] = useState(true)
  
  const [blockedUsers, setBlockedUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`blocked_${session.user.id}`)) || [] } catch (_e) { return [] }
  })
  const [restrictedUsers, setRestrictedUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`restricted_${session.user.id}`)) || [] } catch (_e) { return [] }
  })
  const [blockedProfiles, setBlockedProfiles] = useState([])
  const [restrictedProfiles, setRestrictedProfiles] = useState([])

  useEffect(() => {
    let timer;
    if (resetCooldown > 0) {
      timer = setTimeout(() => setResetCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resetCooldown]);

  useEffect(() => {
      async function getProfile() {
        const { data } = await supabase.from('profiles').select('avatar_url, banner_url, username, unique_tag, bio, pronouns, encrypted_private_key, allow_dms, allow_friend_requests').eq('id', session.user.id).single()
        let cachedProfile = {}
        try {
          cachedProfile = JSON.parse(localStorage.getItem(`profile_cache_${session.user.id}`)) || {}
        } catch (_err) {}
        if (data) {
          const mergedProfile = { ...data, ...cachedProfile }
          setAvatarUrl(mergedProfile.avatar_url)
          setBannerUrl(mergedProfile.banner_url || BANNER_OPTIONS[0].value)
          if (mergedProfile.username) setUsername(mergedProfile.username)
          if (mergedProfile.unique_tag) setUniqueTag(mergedProfile.unique_tag)
          setBio(mergedProfile.bio || '')
          setPronouns(mergedProfile.pronouns || '')
          if (data.encrypted_private_key) setHasSecureStorage(true)
          if (data.allow_dms !== null) setAllowDirectMessages(data.allow_dms)
          if (data.allow_friend_requests !== null) setAllowFriendRequests(data.allow_friend_requests)
          setSavedProfile({
            username: mergedProfile.username || '',
            bio: mergedProfile.bio || '',
            pronouns: mergedProfile.pronouns || '',
            bannerUrl: mergedProfile.banner_url || BANNER_OPTIONS[0].value
          })
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

  useEffect(() => { 
    const appliedTheme = applyThemeMode(appTheme)
    if (appliedTheme !== appTheme) setAppTheme(appliedTheme)
  }, [appTheme])

  useEffect(() => {
    localStorage.setItem('uiDensity', uiDensity)
    localStorage.setItem('chatMessageScale', uiDensity)
    document.documentElement.setAttribute('data-ui-density', uiDensity)
    const size = uiDensity === 'spacious' ? '16px' : uiDensity === 'compact' ? '14px' : '15px'
    document.documentElement.style.setProperty('--chat-message-font-size', size)
  }, [uiDensity])

  useEffect(() => {
    localStorage.setItem('messageSoundsEnabled', String(messageSoundsEnabled))
    localStorage.setItem('soundEnabled', String(messageSoundsEnabled))
  }, [messageSoundsEnabled])
  useEffect(() => { localStorage.setItem('callSoundsEnabled', String(callSoundsEnabled)) }, [callSoundsEnabled])
  useEffect(() => {
    localStorage.setItem('ringtoneSoundsEnabled', String(ringtoneSoundsEnabled))
    if (!ringtoneSoundsEnabled) audioSys.stopRing()
  }, [ringtoneSoundsEnabled])
  useEffect(() => { localStorage.setItem('voiceAutoGain', String(voiceAutoGain)) }, [voiceAutoGain])
  useEffect(() => { localStorage.setItem('voiceEchoCancel', String(voiceEchoCancel)) }, [voiceEchoCancel])
  useEffect(() => { localStorage.setItem('videoPreviewEnabled', String(videoPreviewEnabled)) }, [videoPreviewEnabled])

  const hasUnsavedProfileChanges = useMemo(() => {
    if (!savedProfile) return false
    return savedProfile.username !== username || savedProfile.bio !== bio || savedProfile.pronouns !== pronouns || savedProfile.bannerUrl !== bannerUrl
  }, [savedProfile, username, bio, pronouns, bannerUrl])

  const closeWithUnsavedGuard = useCallback(() => {
    if (hasUnsavedProfileChanges && !window.confirm('Discard unsaved profile changes?')) return
    onClose()
  }, [hasUnsavedProfileChanges, onClose])

  const handlePrivacyToggle = async (field, value, setter) => {
    setter(value);
    try {
      await supabase.from('profiles').update({ [field]: value }).eq('id', session.user.id);
    } catch (_e) {
      toast.error("Failed to update privacy settings.");
    }
  }

  const requestDesktopNotifs = async (enabled) => {
    if (!enabled) { 
      setDesktopNotifs(false); 
      localStorage.setItem('notificationsEnabled', 'false');
      return toast.success("Notifications disabled."); 
    }
    
    try {
      if (Capacitor.isNativePlatform()) {
        if (!Capacitor.isPluginAvailable('PushNotifications')) {
            return toast.error("Push plugin not available.");
        }

        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          let permStatus = await PushNotifications.checkPermissions();
          if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
          }
          if (permStatus.receive !== 'granted') {
            toast.error("Permission denied by device settings.");
            return;
          }

          await PushNotifications.register();

          PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success, token: ' + token.value);
            await supabase.from('profiles').update({ fcm_token: token.value }).eq('id', session.user.id);
          });

          PushNotifications.addListener('registrationError', (_error) => {
            toast.error("Firebase missing! You must add google-services.json to build.");
          });

          setDesktopNotifs(true);
          localStorage.setItem('notificationsEnabled', 'true');
          toast.success("Native push initialized!");

        } catch (nativeError) {
          console.warn("Native Push Error:", nativeError);
          toast.error("Native push requires Firebase config.");
        }

      } else {
        if (!("Notification" in window)) return toast.error("This browser does not support notifications.");
        if (Notification.permission === "granted") {
          setDesktopNotifs(true);
          localStorage.setItem('notificationsEnabled', 'true');
        } else if (Notification.permission !== "denied") {
          const permission = await Notification.requestPermission();
          if (permission === "granted") { 
            setDesktopNotifs(true); 
            localStorage.setItem('notificationsEnabled', 'true');
            toast.success("Desktop notifications enabled!"); 
          }
          else toast.error("Permission denied.");
        }
      }
    } catch (_e) {
      toast.error("Notifications are blocked on this device.");
    }
  }

  const uploadAvatar = async (event) => {
    try {
      setLoading(true)
      if (!event.target.files || event.target.files.length === 0) throw new Error('You must select an image to upload.')
      const file = event.target.files[0]
      if (!ALLOWED_AVATAR_TYPES.has((file.type || '').toLowerCase())) throw new Error('Avatar must be JPG, PNG, GIF, WebP, or AVIF.')
      if (file.size > MAX_AVATAR_SIZE_BYTES) throw new Error('Avatar must be 5 MB or smaller.')
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}-avatar-${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      if (updateError) throw updateError

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setAvatarUrl(publicUrl)
      localStorage.setItem(`profile_cache_${session.user.id}`, JSON.stringify({ ...(JSON.parse(localStorage.getItem(`profile_cache_${session.user.id}`)) || {}), avatar_url: publicUrl }))
      onProfileUpdated?.({ avatar_url: publicUrl })
      toast.success('Avatar updated successfully')
    } catch (error) { toast.error(error.message) } 
    finally { setLoading(false) }
  }

  const updateProfileDetails = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const updatePayload = { username: username.trim(), bio: bio.trim(), pronouns: pronouns.trim(), banner_url: bannerUrl }
      const { error: profileError } = await supabase.from('profiles').update(updatePayload).eq('id', session.user.id)
      if (profileError) throw profileError
      const { error: authError } = await supabase.auth.updateUser({ data: updatePayload })
      if (authError) throw authError
      setSavedProfile({ username: updatePayload.username, bio: updatePayload.bio, pronouns: updatePayload.pronouns, bannerUrl: updatePayload.banner_url })
      localStorage.setItem(`profile_cache_${session.user.id}`, JSON.stringify({ ...(JSON.parse(localStorage.getItem(`profile_cache_${session.user.id}`)) || {}), ...updatePayload }))
      onProfileUpdated?.(updatePayload)
      toast.success('Profile updated successfully')
    } catch (error) { toast.error(error.message || 'Failed to update profile') } 
    finally { setLoading(false) }
  }

  const handleUpdateEmail = async () => {
    if (!newEmail.trim() || newEmail === userEmail) return setIsEditingEmail(false)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (error) toast.error(error.message)
    else { toast.success('Verification link sent to both emails.'); setUserEmail(newEmail.trim()); setIsEditingEmail(false); }
    setLoading(false)
  }

  const handlePasswordReset = async () => {
    if (resetCooldown > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: window.location.origin });
    
    if (error) {
      if (error.status === 429 || error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('too many requests')) {
        toast.error("Network rate limit hit! Please wait 60 seconds before trying again.", { duration: 4000 });
        setResetCooldown(60);
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Password reset link sent to your email.');
      setResetCooldown(60); 
    }
    setLoading(false);
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
      
      const keysToKeep = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('e2ee_') || key === 'appTheme' || key === 'soundEnabled' || key === 'messageSoundsEnabled' || key === 'callSoundsEnabled' || key === 'ringtoneSoundsEnabled' || key === 'notificationsEnabled')) {
          keysToKeep[key] = localStorage.getItem(key);
        }
      }
      
      localStorage.clear(); 
      
      for (const [k, v] of Object.entries(keysToKeep)) {
        localStorage.setItem(k, v);
      }
      
      window.location.reload(); 
    } 
    catch (e) { toast.error("Failed to log out: " + e.message); }
  }

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
    const handleEsc = (e) => { if (e.key === 'Escape') closeWithUnsavedGuard() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [closeWithUnsavedGuard])

  const TABS = [
      { id: 'account', label: 'My Account', icon: User },
      { id: 'privacy', label: 'Privacy & Safety', icon: Lock },
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'voice', label: 'Voice & Video', icon: Mic },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'legal', label: 'Legal & Policies', icon: FileText },
    ]

  return (
    <div data-ui-overlay-owner="UserSettings:settings-modal" className="premium-backdrop fixed inset-0 flex items-start md:items-center justify-center z-[100] md:p-4 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      
      {showLogoutConfirm && (
        <div data-ui-overlay-owner="UserSettings:logout-confirm" className="premium-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
          <div className="premium-modal w-full max-w-sm rounded-3xl p-6 text-center animate-slide-up md:animate-fade-in">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <LogOut size={32} className="text-red-400" />
            </div>
            <h3 className="gradient-text relative z-10 text-xl font-semibold mb-2">Ready to leave?</h3>
            <p className="relative z-10 text-gray-400 text-sm mb-8">Are you sure you want to log out of MessApp?</p>
            <div className="relative z-10 flex flex-col gap-3">
              <button onClick={handleLogout} className="premium-danger-button w-full h-14 md:h-12 rounded-xl font-bold cursor-pointer text-base md:text-sm">Yes, Log Out</button>
              <button onClick={() => setShowLogoutConfirm(false)} className="premium-secondary-button w-full h-14 md:h-12 rounded-xl font-bold cursor-pointer text-base md:text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div data-ui-overlay-owner="UserSettings:delete-confirm" className="premium-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
          <div className="premium-modal w-full max-w-sm rounded-3xl p-6 text-center animate-slide-up md:animate-fade-in">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h3 className="gradient-text relative z-10 text-xl font-semibold mb-2">Delete Account?</h3>
            <p className="relative z-10 text-gray-400 text-sm mb-6">This action is <span className="text-red-400 font-bold">permanent</span> and cannot be undone. All data will be wiped.</p>
            <div className="relative z-10 flex flex-col gap-3">
              <button onClick={handleDeleteAccount} disabled={isDeleting} className="premium-danger-button w-full h-14 md:h-12 rounded-xl font-bold cursor-pointer text-base md:text-sm flex items-center justify-center disabled:opacity-50">
                {isDeleting ? <Loader2 className="animate-spin" size={20} /> : 'Permanently Delete'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} className="premium-secondary-button w-full h-14 md:h-12 rounded-xl font-bold cursor-pointer text-base md:text-sm disabled:opacity-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="premium-modal w-full h-full md:max-w-5xl md:h-[85vh] md:min-h-[600px] flex flex-col md:flex-row overflow-hidden md:rounded-2xl animate-slide-up">
        
        <aside className={`relative z-10 ${settingsConfig.showMenu ? 'flex' : 'hidden'} md:flex w-full md:w-64 bg-[var(--surface-strong)] md:bg-[var(--bg-surface)]/70 border-r border-[var(--border-subtle)] flex-col shrink-0 h-full backdrop-blur-xl`}>
          <div className="flex md:hidden items-center justify-between w-full px-6 h-16 bg-[var(--surface-strong)] border-b border-[var(--border-subtle)] shrink-0 sticky top-0">
             <h3 className="text-xl font-bold text-[var(--text-main)] tracking-tight">Settings</h3>
	             <button onClick={closeWithUnsavedGuard} className="premium-icon-button p-2 rounded-full cursor-pointer"><X size={24} /></button>
          </div>

          <h3 className="hidden md:block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-3 pt-8">User Settings</h3>
          
          <div className="flex flex-col p-4 md:p-0 gap-4 md:gap-1 flex-1 overflow-y-auto">
	            <div className="premium-section md:bg-transparent rounded-2xl md:rounded-none md:border-none overflow-hidden md:shadow-none">
              {TABS.map((tab, index) => (
                <div key={tab.id}>
                  <button onClick={() => { setSettingsConfig(prev => ({ ...prev, tab: tab.id, showMenu: false })); }} className={`w-full flex items-center justify-between md:justify-start gap-2 md:gap-3 px-5 md:px-3 h-16 md:h-10 font-medium text-base md:text-sm transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none cursor-pointer ${settingsConfig.tab === tab.id && !settingsConfig.showMenu ? 'md:bg-[var(--bg-element)] md:text-[var(--text-main)] text-[var(--theme-base)] md:shadow-sm' : 'text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] bg-transparent'}`}>
                    <div className="flex items-center gap-3"><tab.icon size={20} className={`md:w-[18px] md:h-[18px] ${settingsConfig.tab === tab.id && !settingsConfig.showMenu ? 'text-[var(--theme-base)] md:text-[var(--text-main)]' : 'text-gray-500'}`} /> <span className={settingsConfig.tab === tab.id && !settingsConfig.showMenu ? 'text-[var(--theme-base)] md:text-[var(--text-main)]' : 'text-gray-500 md:text-gray-400 md:hover:text-[var(--text-main)] transition-colors'}>{tab.label}</span></div>
                    <ChevronRight size={20} className="md:hidden text-gray-500" />
                  </button>
                  {index < TABS.length - 1 && <div className="h-[1px] bg-[var(--border-subtle)] md:hidden mx-5"></div>}
                </div>
              ))}
            </div>
            <div className="hidden md:block my-2 border-t border-[var(--border-subtle)] mx-2"></div>
            <button onClick={() => setShowLogoutConfirm(true)} className="flex w-full items-center justify-center md:justify-start gap-3 px-5 md:px-3 h-16 md:h-10 rounded-2xl md:rounded-lg font-bold text-base md:text-sm transition-all text-red-400 hover:bg-red-500/10 bg-[var(--bg-element)] md:bg-transparent border border-[var(--border-subtle)] md:border-transparent shadow-sm md:shadow-none focus-visible:ring-2 focus-visible:ring-red-500 outline-none cursor-pointer mt-auto md:mt-0">
               <div className="flex items-center gap-3"><LogOut size={20} className="md:w-[18px] md:h-[18px] text-red-400" /><span>Log Out</span></div>
            </button>
          </div>
        </aside>

        <main className={`relative z-10 ${!settingsConfig.showMenu ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden bg-[var(--bg-base)]/65 relative`}>
          <div className="md:hidden flex items-center justify-between px-4 h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 shrink-0 sticky top-0 z-50 shadow-sm backdrop-blur-xl">
            <button onClick={() => setSettingsConfig(prev => ({ ...prev, showMenu: true }))} className="flex items-center text-indigo-400 font-medium p-2 -ml-2 cursor-pointer">
              <ChevronLeft size={28} /><span className="ml-1 text-base">Settings</span>
            </button>
            <span className="font-bold text-[var(--text-main)] text-base absolute left-0 right-0 text-center pointer-events-none">{TABS.find(t => t.id === settingsConfig.tab)?.label}</span>
          </div>

          <div className="hidden md:flex absolute top-10 right-10 flex-col items-center gap-1 group z-50">
            <button onClick={closeWithUnsavedGuard} className="premium-icon-button w-9 h-9 flex items-center justify-center rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"><X size={18} aria-hidden="true" /></button>
            <span className="text-[10px] font-bold text-gray-600 uppercase">ESC</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative p-4 sm:p-8 md:p-14 pb-32 md:pb-14">
            <div className="max-w-2xl mx-auto h-full">

              {settingsConfig.tab === 'account' && (
                <div className="animate-fade-in space-y-8 md:space-y-10">
	                  <h2 className="gradient-text hidden md:block text-2xl font-semibold tracking-tight font-display">My Account</h2>
                  {hasUnsavedProfileChanges && (
                    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm">
                      You have unsaved profile changes.
                    </div>
                  )}
                  
	                  <div className="premium-section rounded-2xl overflow-hidden">
                    <div className="h-28 sm:h-32 transition-all duration-300" style={{ background: bannerUrl }}></div>
                    <div className="px-5 md:px-6 pb-6 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                      <div className="relative group cursor-pointer shrink-0 -mt-12 sm:-mt-14 z-10 w-fit">
                        <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-[var(--bg-base)] flex items-center justify-center border-4 border-[var(--bg-element)] shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden">
                          {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : <User size={48} className="text-gray-500" aria-hidden="true" />}
                        </div>
                        <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm border-4 border-transparent">
                          <Upload size={18} className="mb-1 text-white" />
                          <span className="text-white">Avatar</span>
                          <input type="file" accept="image/*" onChange={uploadAvatar} disabled={loading} className="hidden" />
                        </label>
                      </div>
                      <div className="flex flex-col flex-1 pb-1">
                        <h4 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] leading-tight">{username}</h4>
                        <p className="text-sm text-gray-500 font-medium">{fullTag}</p>
                      </div>
                    </div>
                  </div>

	                  <form onSubmit={updateProfileDetails} className="premium-section p-5 sm:p-6 rounded-2xl space-y-6">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3"><Edit2 size={16} /> Public Profile</h4>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-3 block">Banner Color</label>
                      <div className="flex flex-wrap gap-3">
                        {BANNER_OPTIONS.map(b => (
                          <button type="button" key={b.id} onClick={() => setBannerUrl(b.value)} className={`w-10 h-10 md:w-8 md:h-8 rounded-full border-2 transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${bannerUrl === b.value ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'}`} style={{ background: b.value }} title={`Select ${b.id} banner`} />
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Display Name</label>
	                        <input className="premium-input w-full px-4 h-14 md:h-12 rounded-xl ghost-border outline-none transition-all text-[var(--text-main)] font-medium text-[16px] md:text-sm" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Pronouns</label>
	                        <input className="premium-input w-full px-4 h-14 md:h-12 rounded-xl ghost-border outline-none transition-all text-[var(--text-main)] font-medium text-[16px] md:text-sm" type="text" placeholder="e.g. they/them" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">About Me</label>
	                      <textarea className="premium-input w-full px-4 py-4 md:py-3 min-h-[100px] rounded-xl ghost-border outline-none transition-all text-[var(--text-main)] font-medium resize-none custom-scrollbar text-[16px] md:text-sm" rows={3} placeholder="Write a little bit about yourself..." value={bio} onChange={(e) => setBio(e.target.value)} />
                    </div>
                    <div className="flex justify-end pt-2">
	                      <button type="submit" disabled={loading} className="premium-button w-full sm:w-auto px-8 h-14 md:h-12 rounded-xl font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-base md:text-sm">
                        {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Profile'}
                      </button>
                    </div>
                  </form>

	                  <div className="premium-section rounded-2xl overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><User size={16} /> Account Information</h4>
                    </div>
                    <div className="p-5 sm:p-6 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Account ID</span>
                          <button type="button" onClick={copyTag} className="text-[var(--text-main)] font-mono bg-[var(--bg-base)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] inline-flex items-center gap-2 hover:border-indigo-500 hover:text-indigo-400 transition-colors cursor-pointer">
                            <span>{fullTag}</span>{copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                          </button>
                        </div>
                        <span className="text-xs text-gray-500 sm:text-right">Click the ID to copy it.</span>
                      </div>
                      <div className="h-[1px] bg-[var(--border-subtle)] w-full"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3 w-full sm:w-auto">
                          <Mail className="text-gray-500 mt-0.5 hidden sm:block" size={20} />
                          <div className="flex-1">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-0.5">Email Address</span>
                            {isEditingEmail ? (
	                              <input type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="premium-input w-full text-[var(--text-main)] px-4 h-14 md:h-10 rounded-xl md:rounded-lg outline-none text-[16px] md:text-sm mt-2 md:mt-0" />
                            ) : (
                              <span className="text-[var(--text-main)] font-medium text-[16px] md:text-base">{userEmail || 'No email attached'}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          {isEditingEmail ? (
	                            <><button type="button" onClick={() => { setIsEditingEmail(false); setNewEmail(userEmail) }} className="premium-secondary-button px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium cursor-pointer flex-1 sm:flex-none text-base md:text-sm">Cancel</button><button type="button" onClick={handleUpdateEmail} disabled={loading} className="premium-button px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium cursor-pointer flex-1 sm:flex-none flex items-center justify-center gap-2 text-base md:text-sm">{loading ? <Loader2 size={18} className="animate-spin"/> : 'Save'}</button></>
                          ) : (
	                            <button type="button" onClick={() => setIsEditingEmail(true)} className="premium-secondary-button px-4 h-14 md:h-10 rounded-xl md:rounded-lg font-medium cursor-pointer w-full sm:w-auto text-base md:text-sm">Edit Email</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="premium-section rounded-2xl overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Shield size={16} /> Password Reset</h4>
                    </div>
                    <div className="p-5 sm:p-6 space-y-4">
                      <p className="text-sm text-gray-400 mb-4">Need a new password? We'll send a secure reset link to your registered email address.</p>
                      <button type="button" onClick={handlePasswordReset} disabled={loading || resetCooldown > 0} className="premium-secondary-button w-full text-[var(--text-main)] h-16 md:h-14 px-4 rounded-xl flex items-center justify-between cursor-pointer group disabled:opacity-50">
                        <div className="flex items-center gap-3">
                          <Key size={20} className="text-indigo-400" /> 
                          <span className="font-bold text-base md:text-sm">
                            {resetCooldown > 0 ? `Wait ${resetCooldown}s to send again` : 'Send Reset Link'}
                          </span>
                        </div>
                        {loading ? <Loader2 size={18} className="animate-spin text-gray-400" /> : <span className="text-xs text-gray-500 group-hover:text-[var(--text-main)] transition-colors hidden sm:block">Click to Send</span>}
                      </button>
                    </div>
                  </div>

                  <div className="bg-red-500/5 p-5 sm:p-6 rounded-2xl border border-red-500/20">
                    <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Danger Zone</h4>
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="text-[var(--text-main)] font-bold mb-0.5 text-base md:text-sm">Disable Account</h5>
                          <p className="text-xs text-gray-500">Temporarily hide your profile and messages.</p>
                        </div>
                        <button type="button" onClick={handleDeactivate} className="w-full sm:w-auto bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 h-14 md:h-10 rounded-xl md:rounded-lg font-bold transition-all cursor-pointer text-base md:text-sm">Disable</button>
                      </div>
                      <div className="h-[1px] bg-red-500/20 w-full"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="text-[var(--text-main)] font-bold mb-0.5 text-base md:text-sm">Delete Account</h5>
                          <p className="text-xs text-gray-500">Permanently erase your account and data.</p>
                        </div>
                        <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full sm:w-auto bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 h-14 md:h-10 rounded-xl md:rounded-lg font-bold transition-all cursor-pointer text-base md:text-sm">Delete</button>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {settingsConfig.tab === 'privacy' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Privacy & Safety</h2>
                  
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-6 mb-2">Interactions</h4>
                    <ToggleSwitch 
                      label="Allow direct messages" 
                      description="Allow users who share a server with you to send direct messages." 
                      checked={allowDirectMessages} 
                      onChange={(val) => handlePrivacyToggle('allow_dms', val, setAllowDirectMessages)} 
                    />
                    <ToggleSwitch 
                      label="Allow friend requests" 
                      description="Allow anyone to send you a friend request using your User ID." 
                      checked={allowFriendRequests} 
                      onChange={(val) => handlePrivacyToggle('allow_friend_requests', val, setAllowFriendRequests)} 
                    />

                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-8 mb-2">Blocked Users</h4>
                    <div className="premium-section rounded-2xl overflow-hidden">
                      {blockedProfiles.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">You haven't blocked anyone.</div> : (
                        blockedProfiles.map((profile, idx) => (
                          <div key={profile.id}>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-[var(--bg-surface)] transition-colors gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-subtle)] shrink-0">
                                  {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-[var(--text-main)] uppercase text-lg md:text-base">{profile.username[0]}</span>}
                                </div>
                                <div className="flex flex-col"><span className="text-[var(--text-main)] font-bold text-base md:text-sm">{profile.username}</span><span className="text-gray-500 text-sm md:text-xs font-mono">{profile.unique_tag}</span></div>
                              </div>
                              <button onClick={() => handleUnblock(profile.id)} className="bg-[var(--bg-base)] hover:bg-red-500/20 text-red-400 w-full sm:w-auto px-4 h-12 md:h-10 rounded-xl md:rounded-lg font-bold transition-colors cursor-pointer border border-[var(--border-subtle)] hover:border-red-500/30 text-base md:text-sm">Unblock</button>
                            </div>
                            {idx < blockedProfiles.length - 1 && <div className="h-[1px] bg-[var(--border-subtle)] mx-4"></div>}
                          </div>
                        ))
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-8 mb-2 flex items-center gap-2">Muted Accounts</h4>
                    <div className="premium-section rounded-2xl overflow-hidden">
                      {restrictedProfiles.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">You haven't restricted anyone. Muting hides their messages from your active list.</div> : (
                        restrictedProfiles.map((profile, idx) => (
                          <div key={profile.id}>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-[var(--bg-surface)] transition-colors gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-subtle)] shrink-0">
                                  {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-[var(--text-main)] uppercase text-lg md:text-base">{profile.username[0]}</span>}
                                </div>
                                <div className="flex flex-col"><span className="text-[var(--text-main)] font-bold text-base md:text-sm">{profile.username}</span><span className="text-gray-500 text-sm md:text-xs font-mono">{profile.unique_tag}</span></div>
                              </div>
                              <button onClick={() => handleUnrestrict(profile.id)} className="bg-[var(--bg-base)] hover:bg-[var(--bg-element)] text-gray-300 w-full sm:w-auto px-4 h-12 md:h-10 rounded-xl md:rounded-lg font-bold transition-colors cursor-pointer border border-[var(--border-subtle)] hover:border-gray-500 text-base md:text-sm">Unmute</button>
                            </div>
                            {idx < restrictedProfiles.length - 1 && <div className="h-[1px] bg-[var(--border-subtle)] mx-4"></div>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {settingsConfig.tab === 'security' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Security & Keys</h2>

	                  <div className="premium-section rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasSecureStorage ? 'bg-green-500/20 text-green-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                        {hasSecureStorage ? <Check size={20} /> : <Lock size={20} />}
                      </div>
                      <div>
                        <h3 className="text-[var(--text-main)] font-bold text-lg">{hasSecureStorage ? 'E2EE Cloud Backup Enabled' : 'Enable E2EE Backup'}</h3>
                        <p className="text-xs text-gray-400">{hasSecureStorage ? 'Your encryption keys are safely backed up.' : 'Securely back up your keys'}</p>
                      </div>
                    </div>
                    
	                    <div className="bg-[var(--accent-glow)] border border-[var(--border-accent)] p-4 rounded-xl mb-6">
                      <p className="text-sm leading-relaxed font-medium" style={{ color: document.documentElement.getAttribute('data-theme') === 'light' ? '#312e81' : '#c7d2fe' }}>
                        {hasSecureStorage 
                          ? "Since you are on a trusted device with your keys currently loaded, resetting your PIN is simple. Enter a new 6-digit PIN below. We will instantly re-encrypt your local keys with the new PIN and update your cloud backup. You do not need to remember your old PIN to do this." 
                          : "Create a 6-digit PIN to securely back up your End-to-End Encryption keys to the cloud. When you log in on a new device, you will need this PIN to restore your chat history."}
                      </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
	                      <input id="pin-setup-input" type="password" maxLength="6" placeholder="••••••" className="premium-input rounded-xl px-4 py-3 text-[var(--text-main)] text-center tracking-[0.5em] font-mono text-xl md:w-48 outline-none transition-all" />
                      <button 
                        onClick={async () => {
                          const pin = document.getElementById('pin-setup-input').value;
                          if (pin.length !== 6 || isNaN(pin)) return toast.error('PIN must be exactly 6 digits.');
                          const priv = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
                          const pubKey = localStorage.getItem(`e2ee_public_key_${session.user.id}`); 
                          if (!priv) return toast.error('No local key found to back up. Please generate a key first.');

                          const toastId = toast.loading(hasSecureStorage ? 'Updating PIN Backup...' : 'Encrypting and uploading keys...');
                          try {
                            const { encryptKeyWithPin } = await import('../../lib/crypto');
                            const encryptedKey = await encryptKeyWithPin(pin, priv);
                            
                            const updatePayload = { encrypted_private_key: encryptedKey };
                            if (pubKey) updatePayload.public_key = pubKey;

                            const { error } = await supabase.from('profiles').update(updatePayload).eq('id', session.user.id);
                            if (error) throw error;
                            toast.success(hasSecureStorage ? 'PIN Reset & Backup Updated!' : 'Secure Storage Enabled! Keys backed up.', { id: toastId });
                            setHasSecureStorage(true);
                            document.getElementById('pin-setup-input').value = '';
                          } catch (_e) {
                            toast.error('Failed to process backup key.', { id: toastId });
                          }
                        }} 
	                        className={`flex-1 px-6 py-3 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 ${hasSecureStorage ? 'premium-secondary-button' : 'premium-button'}`}
                      >
                        <Shield size={18} /> {hasSecureStorage ? 'Reset / Update PIN' : 'Turn On Secure Storage'}
                      </button>
                    </div>
                  </div>

                  {hasSecureStorage && (
	                    <div className="premium-section p-6 rounded-2xl mt-6">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><History size={16} /> Restore Legacy Keys</h4>
                      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                        If you skipped the PIN entry during login, you won't be able to read old messages. Enter your PIN here to fetch and restore your past encryption keys from the cloud.
                      </p>
                      <div className="flex flex-col md:flex-row gap-3">
	                        <input id="pin-restore-input" type="password" maxLength="6" placeholder="••••••" className="premium-input rounded-xl px-4 py-3 text-[var(--text-main)] text-center tracking-[0.5em] font-mono text-xl md:w-48 outline-none transition-all" />
                        <button 
                          onClick={async () => {
                            const pin = document.getElementById('pin-restore-input').value;
                            if (pin.length !== 6 || isNaN(pin)) return toast.error('PIN must be exactly 6 digits.');
                            
                            const toastId = toast.loading('Restoring keys...');
                            try {
                              const { data } = await supabase.from('profiles').select('encrypted_private_key').eq('id', session.user.id).single();
                              if (!data?.encrypted_private_key) throw new Error("No backup found");
                              
                              const { decryptKeyWithPin } = await import('../../lib/crypto');
                              const decryptedKeyStr = await decryptKeyWithPin(pin, data.encrypted_private_key);
                              
                              if (!decryptedKeyStr) throw new Error("Decryption failed");
                              
                              let parsedKey;
                              try {
                                parsedKey = JSON.parse(decryptedKeyStr);
                                if (!parsedKey.kty) throw new Error("Invalid key format");
                              } catch (_err) {
                                throw new Error("Incorrect PIN");
                              }

                              const currentMain = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
                              if (currentMain === decryptedKeyStr) {
                                  toast.error("This PIN unlocked your CURRENT key! There are no older legacy keys to restore.", { id: toastId });
                                  return;
                              }
                              
                              const legacyKeysStr = localStorage.getItem(`e2ee_legacy_keys_${session.user.id}`);
                              const legacyKeys = legacyKeysStr ? JSON.parse(legacyKeysStr) : [];
                              
                              const isAlreadyLegacy = legacyKeys.some(k => JSON.stringify(k) === decryptedKeyStr);
                              if (!isAlreadyLegacy) {
                                  legacyKeys.push(parsedKey);
                                  localStorage.setItem(`e2ee_legacy_keys_${session.user.id}`, JSON.stringify(legacyKeys));
                              }

                              toast.success('Old keys restored! Reloading...', { id: toastId });
                              setTimeout(() => window.location.reload(), 1000);
                            } catch (_e) {
                              toast.error('Incorrect PIN. Please try again.', { id: toastId });
                            }
                          }} 
	                          className="premium-secondary-button flex-1 px-6 py-3 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Key size={18} /> Restore Old Keys
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {settingsConfig.tab === 'appearance' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Appearance</h2>
                  <div className="space-y-5">
	                  <div className="premium-section p-5 sm:p-6 rounded-2xl space-y-6">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">App Theme</h4>
                          <p className="text-sm text-gray-500 mt-1">Changes settings, friend lists, and non-chat app surfaces.</p>
                        </div>
                        <Palette size={20} className="text-indigo-400 shrink-0" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {THEME_MODES.map(theme => (
	                          <button key={theme} onClick={() => setAppTheme(theme)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all cursor-pointer ${appTheme === theme ? 'border-[var(--accent)] bg-[var(--accent-glow)] shadow-md' : 'border-[var(--border-subtle)] hover:border-[var(--border-hover)]'}`}>
	                            <div className={`w-full h-16 rounded-lg ghost-border ${theme === 'dark' ? 'bg-black' : 'bg-gray-200'}`}></div>
                            <span className="text-base md:text-sm font-bold text-[var(--text-main)]">{theme === 'dark' ? 'Dark OLED' : 'Light'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
	                  <div className="premium-section p-5 sm:p-6 rounded-2xl space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">UI Scale</h4>
                        <p className="text-sm text-gray-500 mt-1">Adjusts overall interface spacing and keeps chat readable.</p>
                      </div>
                      <MessageSquare size={20} className="text-indigo-400 shrink-0" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Density</label>
	                      <div className="premium-input grid grid-cols-3 gap-2 rounded-xl p-1">
                        {[
                          { id: 'compact', label: 'Compact' },
                          { id: 'default', label: 'Default' },
                          { id: 'spacious', label: 'Spacious' }
                        ].map(option => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setUiDensity(option.id)}
	                            className={`h-11 rounded-lg text-sm font-bold transition-all cursor-pointer ${uiDensity === option.id ? 'premium-button' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)]'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
	                    <div className="premium-section rounded-xl p-4">
	                      <div className="mb-3 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                        <span className="text-sm font-bold text-white">Chat Preview</span>
                        <span className="text-xs text-gray-400">Independent from app theme</span>
                      </div>
                      <div className="space-y-2">
	                        <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-md border border-[var(--border-subtle)] bg-[var(--bg-element)] px-3 py-2 text-white" style={{ fontSize: uiDensity === 'spacious' ? '16px' : uiDensity === 'compact' ? '14px' : '15px' }}>
                          Dark messages stay readable in light mode.
                        </div>
	                        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-white" style={{ fontSize: uiDensity === 'spacious' ? '16px' : uiDensity === 'compact' ? '14px' : '15px' }}>
                          Topbar and input match the chat surface.
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              )}

              {settingsConfig.tab === 'notifications' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Notifications</h2>
                  <div className="space-y-2">
                    <ToggleSwitch label="Enable Device Notifications" description="Receive push notifications when you are pinged or receive a DM." checked={desktopNotifs} onChange={requestDesktopNotifs} />
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-8 mb-2">Communication Sounds</h4>
                    <ToggleSwitch label="Message sounds" description="Play subtle sent and received sounds while the app is open." checked={messageSoundsEnabled} onChange={setMessageSoundsEnabled} />
                    <ToggleSwitch label="Call sounds" description="Play short tones when calls connect, end, or fail." checked={callSoundsEnabled} onChange={setCallSoundsEnabled} />
                    <ToggleSwitch label="Ringtones" description="Play incoming and outgoing call rings while calls are waiting." checked={ringtoneSoundsEnabled} onChange={setRingtoneSoundsEnabled} />
                  </div>
                </div>
              )}

              {settingsConfig.tab === 'voice' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Voice & Video</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                    <div className="premium-section p-5 rounded-2xl">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center mb-4">
                        <Mic size={22} />
                      </div>
                      <h3 className="text-[var(--text-main)] font-bold text-lg mb-1">Voice Processing</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">Tune browser call constraints for clearer WebRTC audio.</p>
                    </div>
                    <div className="premium-section p-5 rounded-2xl">
                      <div className="w-12 h-12 rounded-2xl bg-pink-500/15 text-pink-300 flex items-center justify-center mb-4">
                        <Video size={22} />
                      </div>
                      <h3 className="text-[var(--text-main)] font-bold text-lg mb-1">Video Preview</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">Keep video behavior predictable before joining a call.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <ToggleSwitch label="Automatic gain control" description="Let the browser balance microphone volume during calls." checked={voiceAutoGain} onChange={setVoiceAutoGain} />
                    <ToggleSwitch label="Echo cancellation" description="Reduce speaker feedback and room echo during voice calls." checked={voiceEchoCancel} onChange={setVoiceEchoCancel} />
                    <ToggleSwitch label="Remember video preview preference" description="Keep your last video preview preference on this device." checked={videoPreviewEnabled} onChange={setVideoPreviewEnabled} />
                  </div>
                </div>
              )}

              {settingsConfig.tab === 'legal' && (
                <div className="animate-fade-in pb-10">
                  <h2 className="hidden md:block text-2xl font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Legal & Policies</h2>
                  
                  <div className="premium-section rounded-2xl overflow-hidden mb-6">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Terms of Service</h4>
                    </div>
                    <div className="p-5 sm:p-6 text-gray-400 text-sm leading-relaxed space-y-4">
                      <p>Welcome to MessApp. By utilizing our platform, you agree to comply with our core operational standards. MessApp is built as a secure, decentralized-friendly communication platform. You maintain sole responsibility for the activity originating from your cryptographic identity.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Zero-Tolerance UGC Policy</h5>
                      <p>We maintain a strict zero-tolerance protocol regarding abusive content and harassment. You agree not to weaponize MessApp to transmit illicit, threatening, or rights-violating payloads.</p>
                      <p>In the event of network abuse, utilize the Block feature located in the Privacy & Safety tab. Violators flagged by network heuristics may face immediate permanent access revocation.</p>
                    </div>
                  </div>

                  <div className="premium-section rounded-2xl overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Privacy Protocol</h4>
                    </div>
                    <div className="p-5 sm:p-6 text-gray-400 text-sm leading-relaxed space-y-4">
                      <p>Absolute privacy is the foundation of our architecture. MessApp deploys strictly implemented End-to-End Encryption (AES-GCM) across all direct communications. We physically lack the cryptographic keys required to decipher, read, or intercept your private data.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Data Minimization</h5>
                      <p>We capture only the bare minimum telemetry required for network stability: your authentication email and explicit public profile variables. Encrypted payloads are routed through our servers strictly for delivery synchronization and are inaccessible to our infrastructure.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Data Eradication</h5>
                      <p>You wield complete authority over your footprint. You may execute localized message deletion, full conversation wiping, or total account eradication at will. Account deletion triggers an immediate cascade purge across our active server arrays.</p>
                    </div>
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
