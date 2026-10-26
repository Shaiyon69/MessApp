/**
 * Owns account, privacy, notification, appearance, and local key settings.
 * Native device tokens and private key material must never be logged or exposed
 * to sibling components.
 */
import { useCallback, useMemo, useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { Capacitor } from '@capacitor/core'
import { X, Upload, Loader2, User, AlertTriangle, Copy, Check, LogOut, Palette, Bell, Lock, Edit2, Mail, Key, Shield, ChevronRight, ChevronLeft, FileText, History, Mic, Video, MessageSquare, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { PALETTES, THEME_MODES, UI_STYLES, applyGlassRefraction, applySurfaceTint, applyThemeMode, applyUiStyle, normalizeGlassRefraction, normalizeSurfaceTint, normalizeThemeMode, normalizeUiStyle, readGlassWallpaper, saveGlassWallpaper } from '../../lib/theme'
import { isChromium, isLowPowerDevice } from '../../lib/liquidGlass'
import { audioSys } from '../../lib/SoundEngine'
import { debug } from '../../lib/debug'
import { configureNativePushRegistration, disableCurrentPushDevice, registerWebPushDevice, reportPushError, stopNativePushRegistration, PUSH_INSTALLATION_ID_KEY } from '../../lib/pushDevices'
import { signOutAndReset } from '../../lib/signOut'
import { getModeratorRole } from '../../lib/moderation'
import { loadMyProfileSecrets, saveMyProfileKeyBackup } from '../../lib/profileSecrets'
import ModerationPanel from './ModerationPanel'
import Turnstile, { TURNSTILE_SITE_KEY } from '../ui/Turnstile'
import MediaEditorModal from '../media/MediaEditorModal'
import SettingsGroup, { GroupItem } from '../ui/SettingsGroup'
import Switch from '../ui/Switch'
import TonalIcon from '../ui/TonalIcon'
import { assertAvatarFile, avatarObjectName, deleteAvatarImage, uploadAvatarImage, MAX_AVATAR_SOURCE_SIZE_BYTES } from '../../lib/avatarUpload'

/* The gradient string itself is persisted to profiles.banner_url, not the id,
   so retuning these leaves existing banners rendering as they always did — they
   simply no longer match a swatch. No migration needed. */
const BANNER_OPTIONS = [
  { id: 'ink', value: 'linear-gradient(to right, #0c0e12, #1c1f28)' },
  { id: 'azure', value: 'linear-gradient(to right, #1e40af, #3b82f6)' },
  { id: 'ocean', value: 'linear-gradient(to right, #0369a1, #38bdf8)' },
  { id: 'steel', value: 'linear-gradient(to right, #3730a3, #818cf8)' },
  { id: 'frost', value: 'linear-gradient(to right, #dbeafe, #f8fafc)' },
  { id: 'slate', value: '#334155' },
  { id: 'midnight', value: '#0f172a' }
]

const getLocalBoolean = (key, fallback = true) => {
  const value = localStorage.getItem(key)
  return value === null ? fallback : value !== 'false'
}

const ToggleSwitch = ({ label, description, checked, onChange }) => (
  <GroupItem title={label} description={description} trailing={<Switch checked={checked} onChange={onChange} label={label} />} />
)

export default function UserSettingsModal({ session, settingsConfig, setSettingsConfig, onProfileUpdated, onClose }) {
  const [loading, setLoading] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [moderatorRole, setModeratorRole] = useState(null)

  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarEditorFile, setAvatarEditorFile] = useState(null)
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
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)

  const [appTheme, setAppTheme] = useState(() => normalizeThemeMode(localStorage.getItem('appTheme') || 'dark'))
  const [surfaceTint, setSurfaceTint] = useState(() => normalizeSurfaceTint(localStorage.getItem('surfaceTint') || 'blue'))
  const [uiStyle, setUiStyle] = useState(() => normalizeUiStyle(localStorage.getItem('uiStyle')))
  const [glassRefraction, setGlassRefraction] = useState(() => normalizeGlassRefraction(localStorage.getItem('glassRefraction')) === 'on')
  const [hasGlassWallpaper, setHasGlassWallpaper] = useState(() => Boolean(readGlassWallpaper()))
  const [uiDensity, setUiDensity] = useState(() => {
    const stored = localStorage.getItem('uiDensity') || localStorage.getItem('chatMessageScale') || 'default'
    if (stored === 'comfortable' || stored === 'normal') return 'default'
    if (stored === 'large') return 'spacious'
    return stored
  })
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('reduceMotion') === 'true')
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState(() => getLocalBoolean('messageSoundsEnabled', getLocalBoolean('soundEnabled', true)))
  const [callSoundsEnabled, setCallSoundsEnabled] = useState(() => getLocalBoolean('callSoundsEnabled', true))
  const [ringtoneSoundsEnabled, setRingtoneSoundsEnabled] = useState(() => getLocalBoolean('ringtoneSoundsEnabled', true))
  const [tactileFeedbackEnabled, setTactileFeedbackEnabled] = useState(() => getLocalBoolean('tactileFeedbackEnabled', true))
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
    let active = true
    getModeratorRole(supabase, session.user.id)
      .then(role => { if (active) setModeratorRole(role) })
      .catch(() => { if (active) setModeratorRole(null) })
    return () => { active = false }
  }, [session.user.id])

  useEffect(() => {
    let timer;
    if (resetCooldown > 0) {
      timer = setTimeout(() => setResetCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resetCooldown]);

  useEffect(() => {
      async function getProfile() {
        const [{ data }, { data: profileSecrets }] = await Promise.all([
          supabase.from('profiles').select('avatar_url, banner_url, username, unique_tag, bio, pronouns, allow_dms, allow_friend_requests').eq('id', session.user.id).single(),
          loadMyProfileSecrets(supabase, session.user.id)
        ])
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
          if (profileSecrets?.encrypted_private_key) setHasSecureStorage(true)
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
    const appliedTint = applySurfaceTint(surfaceTint)
    if (appliedTint !== surfaceTint) setSurfaceTint(appliedTint)
  }, [surfaceTint])

  useEffect(() => {
    applyUiStyle(uiStyle)
  }, [uiStyle])

  useEffect(() => {
    applyGlassRefraction(glassRefraction ? 'on' : 'off')
  }, [glassRefraction])

  /* Downscaled to 1600px JPEG so it fits in localStorage alongside the rest. */
  const pickGlassWallpaper = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      const bitmap = await createImageBitmap(file)
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * ratio)
      canvas.height = Math.round(bitmap.height * ratio)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      if (!saveGlassWallpaper(canvas.toDataURL('image/jpeg', 0.8))) {
        toast.error('That image is too large to keep on this device.')
        return
      }
      setHasGlassWallpaper(true)
    } catch {
      toast.error('Could not read that image.')
    }
  }

  useEffect(() => {
    localStorage.setItem('uiDensity', uiDensity)
    localStorage.setItem('chatMessageScale', uiDensity)
    document.documentElement.setAttribute('data-ui-density', uiDensity)
  }, [uiDensity])

  useEffect(() => {
    localStorage.setItem('reduceMotion', String(reduceMotion))
    document.documentElement.setAttribute('data-reduce-motion', String(reduceMotion))
  }, [reduceMotion])

  useEffect(() => {
    localStorage.setItem('messageSoundsEnabled', String(messageSoundsEnabled))
    localStorage.setItem('soundEnabled', String(messageSoundsEnabled))
  }, [messageSoundsEnabled])
  useEffect(() => { localStorage.setItem('callSoundsEnabled', String(callSoundsEnabled)) }, [callSoundsEnabled])
  useEffect(() => {
    localStorage.setItem('ringtoneSoundsEnabled', String(ringtoneSoundsEnabled))
    if (!ringtoneSoundsEnabled) audioSys.stopRing()
  }, [ringtoneSoundsEnabled])
  useEffect(() => { localStorage.setItem('tactileFeedbackEnabled', String(tactileFeedbackEnabled)) }, [tactileFeedbackEnabled])
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
      const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', session.user.id);
      if (error) throw error
    } catch (_e) {
      setter(!value)
      toast.error("Failed to update privacy settings.");
    }
  }

  const requestDesktopNotifs = async (enabled) => {
    if (!enabled) { 
      setDesktopNotifs(false); 
      localStorage.setItem('notificationsEnabled', 'false');
      try {
        await stopNativePushRegistration()
        await disableCurrentPushDevice({ profileId: session.user.id, reason: 'notifications_disabled' })
      } catch (error) {
        reportPushError('disable_notifications', error)
      }
      return toast.success("Notifications disabled."); 
    }
    
    try {
      if (Capacitor.isNativePlatform()) {
        if (!Capacitor.isPluginAvailable('PushNotifications')) {
            return toast.error("Push plugin not available.");
        }

        try {
          const registration = await configureNativePushRegistration({ profileId: session.user.id, requestPermission: true })
          if (registration.permission !== 'granted') {
            toast.error("Permission denied by device settings.");
            return;
          }

          setDesktopNotifs(true);
          localStorage.setItem('notificationsEnabled', 'true');
          toast.success("Native push initialized!");

        } catch (nativeError) {
          reportPushError('native_setup', nativeError)
          toast.error(`Native push failed: ${nativeError?.message || 'unknown error'}`);
        }

      } else {
        if (!("Notification" in window)) return toast.error("This browser does not support notifications.");
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
        debug.info('PUSH_PERMISSION', { platform: 'web', state: permission })
        if (permission !== 'granted') {
          await disableCurrentPushDevice({ profileId: session.user.id, reason: 'permission_denied' }).catch(error => reportPushError('permission_denied_disable', error))
          return toast.error("Permission denied.")
        }
        const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY
        await registerWebPushDevice({ profileId: session.user.id, vapidPublicKey })
        setDesktopNotifs(true);
        localStorage.setItem('notificationsEnabled', 'true');
        toast.success("Desktop notifications enabled!");
      }
    } catch (error) {
      reportPushError('permission_or_registration', error)
      toast.error(error?.message || "Notifications could not be enabled.");
    }
  }

  const selectAvatarForEditing = (event) => {
    try {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      assertAvatarFile(file, { maxBytes: MAX_AVATAR_SOURCE_SIZE_BYTES })
      setAvatarEditorFile(file)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const editCurrentAvatar = async () => {
    if (!avatarUrl) return
    setLoading(true)
    try {
      const response = await fetch(avatarUrl)
      if (!response.ok) throw new Error('Current avatar could not be loaded for editing.')
      const blob = await response.blob()
      setAvatarEditorFile(new File([blob], 'current-avatar', { type: blob.type || 'image/jpeg' }))
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const uploadAvatar = async (file) => {
    try {
      setLoading(true)
      const previousAvatarUrl = avatarUrl
      const publicUrl = await uploadAvatarImage(supabase, file, avatarObjectName(session.user.id, file))
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      if (updateError) throw updateError
      // Only once the profile points at the new file — a failed update must
      // leave the old avatar reachable.
      await deleteAvatarImage(supabase, previousAvatarUrl)

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setAvatarUrl(publicUrl)
      localStorage.setItem(`profile_cache_${session.user.id}`, JSON.stringify({ ...(JSON.parse(localStorage.getItem(`profile_cache_${session.user.id}`)) || {}), avatar_url: publicUrl }))
      onProfileUpdated?.({ avatar_url: publicUrl })
      setAvatarEditorFile(null)
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
    const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: `${window.location.origin}/update-password`, captchaToken });
    setCaptchaReset(n => n + 1);

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
  
  /* Shared with MenuPage — see src/lib/signOut.js for why this is not inlined. */
  const handleLogout = async () => {
    try {
      await signOutAndReset({ profileId: session.user.id })
    }
    catch (e) { toast.error("Failed to log out: " + e.message); }
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_user_account')
      if (error) throw error
      await supabase.auth.signOut()
      const installationId = localStorage.getItem(PUSH_INSTALLATION_ID_KEY)
      localStorage.clear()
      if (installationId) localStorage.setItem(PUSH_INSTALLATION_ID_KEY, installationId)
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
      ...(moderatorRole ? [{ id: 'moderation', label: 'Moderation', icon: ShieldAlert }] : []),
    ]

  return (
    <div data-ui-overlay-owner="UserSettings:settings-modal" className="settings-soft-dividers premium-backdrop fixed inset-0 flex items-start md:items-center justify-center z-[100] md:p-4 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      
      {showLogoutConfirm && (
        <div data-ui-overlay-owner="UserSettings:logout-confirm" className="premium-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="premium-modal w-full max-w-xs rounded-2xl p-5 text-center animate-settings-sheet">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <LogOut size={22} className="text-red-400" />
            </div>
            <h3 className="relative z-10 type-title font-semibold text-[var(--text-main)] mb-1.5">Ready to leave?</h3>
            <p className="relative z-10 text-gray-400 type-label mb-5">Are you sure you want to log out of MessApp?</p>
            <div className="relative z-10 flex flex-col gap-3">
              <button onClick={handleLogout} className="premium-danger-button w-full h-12 font-bold cursor-pointer type-body">Yes, Log Out</button>
              <button onClick={() => setShowLogoutConfirm(false)} className="premium-secondary-button w-full h-12 font-bold cursor-pointer type-body">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div data-ui-overlay-owner="UserSettings:delete-confirm" className="premium-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="premium-modal w-full max-w-xs rounded-2xl p-5 text-center animate-settings-sheet">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <h3 className="relative z-10 type-title font-semibold text-[var(--text-main)] mb-1.5">Delete Account?</h3>
            <p className="relative z-10 text-gray-400 type-label mb-5">This action is <span className="text-red-400 font-bold">permanent</span> and cannot be undone. All data will be wiped.</p>
            <div className="relative z-10 flex flex-col gap-3">
              <button onClick={handleDeleteAccount} disabled={isDeleting} className="premium-danger-button w-full h-12 font-bold cursor-pointer type-body flex items-center justify-center disabled:opacity-50">
                {isDeleting ? <Loader2 className="animate-spin" size={20} /> : 'Permanently Delete'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} className="premium-secondary-button w-full h-12 font-bold cursor-pointer type-body disabled:opacity-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="premium-modal w-full h-full md:max-w-3xl md:h-[min(660px,82vh)] flex flex-col md:flex-row overflow-hidden md:rounded-2xl animate-settings-sheet">
        
        <aside className={`relative z-10 hidden md:flex w-full md:w-64 bg-[var(--surface-strong)] md:bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex-col shrink-0 h-full backdrop-blur-xl`}>
          <h3 className="hidden md:block type-meta font-bold text-gray-500 uppercase tracking-widest mb-2 px-3 pt-5">User Settings</h3>
          
          <div className="settings-nav flex flex-col p-4 md:p-0 gap-4 md:gap-1 flex-1 overflow-y-auto">
            <div className="seg-group px-3">
              {TABS.map(tab => (
                <GroupItem
                  key={tab.id}
                  data-settings-tab
                  selected={settingsConfig.tab === tab.id}
                  onClick={() => setSettingsConfig(prev => ({ ...prev, tab: tab.id }))}
                  className="min-h-12 py-1.5 pl-1.5"
                >
                  <TonalIcon icon={tab.icon} size={18} />
                  <span className="min-w-0 flex-1 truncate type-body font-semibold">{tab.label}</span>
                </GroupItem>
              ))}
            </div>
            <div className="seg-group px-3 pb-3 mt-3">
              <GroupItem onClick={() => setShowLogoutConfirm(true)} className="min-h-12 py-1.5 pl-1.5 text-red-400">
                <span className="tonal-icon bg-red-500/10 text-red-400" aria-hidden="true"><LogOut size={18} /></span>
                <span className="type-body font-bold">Log Out</span>
              </GroupItem>
            </div>
          </div>
        </aside>

        <main className={`relative z-10 flex flex-1 flex-col overflow-hidden bg-[var(--bg-base)] relative`}>
          <div className="md:hidden flex items-center justify-between px-4 h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 sticky top-0 z-50 shadow-sm backdrop-blur-xl">
            <button onClick={closeWithUnsavedGuard} aria-label="Back to menu" className="flex items-center text-[var(--text-main)] font-medium p-2 -ml-2 cursor-pointer">
              <ChevronLeft size={28} /><span className="ml-1 type-body">Menu</span>
            </button>
            <span className="font-bold text-[var(--text-main)] type-body absolute left-0 right-0 text-center pointer-events-none">{TABS.find(t => t.id === settingsConfig.tab)?.label}</span>
          </div>

          <div className="hidden md:flex absolute top-5 right-5 flex-col items-center gap-1 group z-50">
            <button onClick={closeWithUnsavedGuard} className="premium-icon-button w-9 h-9 flex items-center justify-center rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"><X size={18} aria-hidden="true" /></button>
            <span className="type-meta font-bold text-gray-600 uppercase">ESC</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative p-4 sm:p-6 md:p-8 pb-32 md:pb-8">
            <div className="max-w-xl mx-auto h-full">

              {settingsConfig.tab === 'account' && (
                <div className="space-y-6">
	                  <h2 className="hidden md:block type-view-title font-semibold tracking-tight text-[var(--text-main)] font-display">My Account</h2>
                  {hasUnsavedProfileChanges && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl px-4 py-3 type-body font-semibold shadow-sm">
                      You have unsaved profile changes.
                    </div>
                  )}
                  
	                  <div className="premium-section rounded-2xl overflow-hidden">
                    <div className="h-28 sm:h-32 transition-all duration-300" style={{ background: bannerUrl }}></div>
                    <div className="px-5 md:px-6 pb-6 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                      <div className="relative group cursor-pointer shrink-0 -mt-10 sm:-mt-12 z-10 w-fit">
                        <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-[var(--bg-base)] flex items-center justify-center border-4 border-[var(--bg-element)] shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden">
                          {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : <User size={48} className="text-gray-500" aria-hidden="true" />}
                        </div>
                        <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-pointer type-meta font-bold uppercase tracking-wider backdrop-blur-sm border-4 border-transparent">
                          <Upload size={18} className="mb-1 text-white" />
                          <span className="text-white">Change</span>
                          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={selectAvatarForEditing} disabled={loading} className="hidden" />
                        </label>
                      </div>
                      <div className="flex flex-col flex-1">
                        <h4 className="type-view-title font-bold text-[var(--text-main)] leading-tight">{username}</h4>
                        <p className="type-body text-gray-500 font-medium">{fullTag}</p>
                        {avatarUrl && (
                          <button type="button" onClick={editCurrentAvatar} disabled={loading} className="mt-2 w-fit type-label font-bold text-[var(--theme-base)] hover:text-[var(--text-main)] disabled:opacity-50">
                            Crop or modify current photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

	                  <form onSubmit={updateProfileDetails} className="premium-section p-5 sm:p-6 rounded-2xl space-y-6">
                    <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3"><Edit2 size={16} /> Public Profile</h4>
                    <div>
                      <label className="type-label font-bold text-gray-500 uppercase tracking-widest ml-1 mb-3 block">Banner Color</label>
                      <div className="flex flex-wrap gap-3">
                        {BANNER_OPTIONS.map(b => (
                          <button type="button" key={b.id} onClick={() => setBannerUrl(b.value)} className={`w-10 h-10 md:w-8 md:h-8 rounded-full border-2 transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${bannerUrl === b.value ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent hover:scale-105'}`} style={{ background: b.value }} title={`Select ${b.id} banner`} />
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="type-label font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Display Name</label>
	                        <input className="premium-input w-full px-4 h-14 md:h-12 rounded-xl ghost-border outline-none transition-all text-[var(--text-main)] font-medium type-body" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
                      </div>
                      <div>
                        <label className="type-label font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Pronouns</label>
	                        <input className="premium-input w-full px-4 h-14 md:h-12 rounded-xl ghost-border outline-none transition-all text-[var(--text-main)] font-medium type-body" type="text" placeholder="e.g. they/them" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="type-label font-bold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">About Me</label>
	                      <textarea className="premium-input w-full px-4 py-4 md:py-3 min-h-[100px] rounded-xl ghost-border outline-none transition-all text-[var(--text-main)] font-medium resize-none custom-scrollbar type-body" rows={3} placeholder="Write a little bit about yourself..." value={bio} onChange={(e) => setBio(e.target.value)} />
                    </div>
                    <div className="flex justify-end pt-2">
	                      <button type="submit" disabled={loading} className="premium-button w-full sm:w-auto px-8 h-14 md:h-12 font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 type-body">
                        {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Profile'}
                      </button>
                    </div>
                  </form>

                  <SettingsGroup title="Account information">
                    <GroupItem className="flex-col items-stretch p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="type-label font-bold text-gray-500 uppercase tracking-widest block mb-1">Account ID</span>
                          <button type="button" onClick={copyTag} className="text-[var(--text-main)] font-mono bg-[var(--bg-base)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] inline-flex items-center gap-2 hover:border-[var(--text-main)] transition-colors cursor-pointer">
                            <span>{fullTag}</span>{copied ? <Check size={14} className="text-[var(--text-main)]" /> : <Copy size={14} />}
                          </button>
                        </div>
                        <span className="type-label text-gray-500 sm:text-right">Click the ID to copy it.</span>
                    </GroupItem>
                    <GroupItem className="flex-col items-stretch p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 w-full sm:w-auto">
                          <Mail className="text-gray-500 mt-0.5 hidden sm:block" size={20} />
                          <div className="flex-1">
                            <span className="type-label font-bold text-gray-500 uppercase tracking-widest block mb-0.5">Email Address</span>
                            {isEditingEmail ? (
	                              <input type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="premium-input w-full text-[var(--text-main)] px-4 h-14 md:h-10 rounded-xl md:rounded-lg outline-none type-body mt-2 md:mt-0" />
                            ) : (
                              <span className="text-[var(--text-main)] font-medium type-body">{userEmail || 'No email attached'}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          {isEditingEmail ? (
	                            <><button type="button" onClick={() => { setIsEditingEmail(false); setNewEmail(userEmail) }} className="premium-secondary-button px-4 h-14 md:h-10 font-medium cursor-pointer flex-1 sm:flex-none type-body">Cancel</button><button type="button" onClick={handleUpdateEmail} disabled={loading} className="premium-button px-4 h-14 md:h-10 font-medium cursor-pointer flex-1 sm:flex-none flex items-center justify-center gap-2 type-body">{loading ? <Loader2 size={18} className="animate-spin"/> : 'Save'}</button></>
                          ) : (
	                            <button type="button" onClick={() => setIsEditingEmail(true)} className="premium-secondary-button px-4 h-14 md:h-10 font-medium cursor-pointer w-full sm:w-auto type-body">Edit Email</button>
                          )}
                        </div>
                    </GroupItem>
                  </SettingsGroup>

                  <SettingsGroup title="Password reset">
                    <GroupItem className="flex-col items-stretch gap-4 p-5">
                      <p className="type-body text-gray-400">Need a new password? We'll send a secure reset link to your registered email address.</p>
                      <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
                      <button type="button" onClick={handlePasswordReset} disabled={loading || resetCooldown > 0 || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}className="premium-secondary-button w-full text-[var(--text-main)] h-16 md:h-14 px-4 flex items-center justify-between cursor-pointer group disabled:opacity-50">
                        <div className="flex items-center gap-3">
                          <Key size={20} className="text-[var(--text-main)]" />
                          <span className="font-bold type-body">
                            {resetCooldown > 0 ? `Wait ${resetCooldown}s to send again` : 'Send Reset Link'}
                          </span>
                        </div>
                        {loading ? <Loader2 size={18} className="animate-spin text-gray-400" /> : <span className="type-label text-gray-500 group-hover:text-[var(--text-main)] transition-colors hidden sm:block">Click to Send</span>}
                      </button>
                    </GroupItem>
                  </SettingsGroup>

                  <div className="bg-red-500/5 p-5 sm:p-6 rounded-2xl border border-red-500/20">
                    <h4 className="type-body font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Danger Zone</h4>
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="text-[var(--text-main)] font-bold mb-0.5 type-body">Disable Account</h5>
                          <p className="type-label text-gray-500">Temporarily hide your profile and messages.</p>
                        </div>
                        <button type="button" onClick={handleDeactivate} className="w-full sm:w-auto bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 h-14 md:h-10 rounded-full font-bold transition-all cursor-pointer type-body">Disable</button>
                      </div>
                      <div className="h-[1px] bg-red-500/20 w-full"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="text-[var(--text-main)] font-bold mb-0.5 type-body">Delete Account</h5>
                          <p className="type-label text-gray-500">Permanently erase your account and data.</p>
                        </div>
                        <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full sm:w-auto bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white px-6 h-14 md:h-10 rounded-full font-bold transition-all cursor-pointer type-body">Delete</button>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {settingsConfig.tab === 'moderation' && moderatorRole && <ModerationPanel />}

              {settingsConfig.tab === 'privacy' && (
                <div className="pb-10">
                  <h2 className="hidden md:block type-view-title font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Privacy & Safety</h2>
                  
                  <div className="space-y-4">
                    <SettingsGroup title="Interactions">
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
                    </SettingsGroup>

                    <SettingsGroup title="Blocked users" className="mt-8">
                      {blockedProfiles.length === 0 ? <GroupItem className="justify-center p-6 text-center text-gray-500 type-body">You haven't blocked anyone.</GroupItem> : (
                        blockedProfiles.map(profile => (
                          <GroupItem key={profile.id} className="flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-subtle)] shrink-0">
                                  {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-[var(--text-main)] uppercase type-title">{profile.username[0]}</span>}
                                </div>
                                <div className="flex flex-col"><span className="text-[var(--text-main)] font-bold type-body">{profile.username}</span><span className="text-gray-500 type-label font-mono">{profile.unique_tag}</span></div>
                              </div>
                              <button onClick={() => handleUnblock(profile.id)} className="bg-[var(--bg-base)] hover:bg-red-500/20 text-red-400 w-full sm:w-auto px-4 h-12 md:h-10 rounded-full font-bold transition-colors cursor-pointer border border-[var(--border-subtle)] hover:border-red-500/30 type-body">Unblock</button>
                          </GroupItem>
                        ))
                      )}
                    </SettingsGroup>

                    <SettingsGroup title="Muted accounts" className="mt-8">
                      {restrictedProfiles.length === 0 ? <GroupItem className="justify-center p-6 text-center text-gray-500 type-body">You haven't restricted anyone. Muting hides their messages from your active list.</GroupItem> : (
                        restrictedProfiles.map(profile => (
                          <GroupItem key={profile.id} className="flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-subtle)] shrink-0">
                                  {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-[var(--text-main)] uppercase type-title">{profile.username[0]}</span>}
                                </div>
                                <div className="flex flex-col"><span className="text-[var(--text-main)] font-bold type-body">{profile.username}</span><span className="text-gray-500 type-label font-mono">{profile.unique_tag}</span></div>
                              </div>
                              <button onClick={() => handleUnrestrict(profile.id)} className="bg-[var(--bg-base)] hover:bg-[var(--bg-element)] text-gray-300 w-full sm:w-auto px-4 h-12 md:h-10 rounded-full font-bold transition-colors cursor-pointer border border-[var(--border-subtle)] hover:border-gray-500 type-body">Unmute</button>
                          </GroupItem>
                        ))
                      )}
                    </SettingsGroup>
                  </div>
                </div>
              )}
              
              {settingsConfig.tab === 'security' && (
                <div className="pb-10">
                  <h2 className="hidden md:block type-view-title font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Security & Keys</h2>

	                  <div className="premium-section rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--bg-element)] text-[var(--text-main)]">
                        {hasSecureStorage ? <Check size={20} /> : <Lock size={20} />}
                      </div>
                      <div>
                        <h3 className="text-[var(--text-main)] font-bold type-body">{hasSecureStorage ? 'E2EE Cloud Backup Enabled' : 'Enable E2EE Backup'}</h3>
                        <p className="type-label text-gray-400">{hasSecureStorage ? 'Your encryption keys are safely backed up.' : 'Securely back up your keys'}</p>
                      </div>
                    </div>
                    
	                    <div className="bg-[var(--bg-element)] border border-[var(--border-subtle)] p-4 rounded-xl mb-6">
                      <p className="type-body leading-relaxed font-medium text-[var(--text-main)]">
                        {hasSecureStorage 
                          ? "Since you are on a trusted device with your keys currently loaded, resetting your PIN is simple. Enter a new 6-digit PIN below. We will instantly re-encrypt your local keys with the new PIN and update your cloud backup. You do not need to remember your old PIN to do this." 
                          : "Create a 6-digit PIN to securely back up your End-to-End Encryption keys to the cloud. When you log in on a new device, you will need this PIN to restore your chat history."}
                      </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
	                      <input id="pin-setup-input" type="password" maxLength="6" placeholder="••••••" className="premium-input rounded-xl px-4 py-3 text-[var(--text-main)] text-center tracking-[0.5em] font-mono type-view-title md:w-48 outline-none transition-all" />
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
                            
                            const { error } = await saveMyProfileKeyBackup(supabase, {
                              profileId: session.user.id,
                              encryptedPrivateKey: encryptedKey,
                              publicKey: pubKey
                            });
                            if (error) throw error;
                            toast.success(hasSecureStorage ? 'PIN Reset & Backup Updated!' : 'Secure Storage Enabled! Keys backed up.', { id: toastId });
                            setHasSecureStorage(true);
                            document.getElementById('pin-setup-input').value = '';
                          } catch (_e) {
                            toast.error('Failed to process backup key.', { id: toastId });
                          }
                        }} 
	                        className={`flex-1 px-6 py-3 font-bold cursor-pointer flex items-center justify-center gap-2 ${hasSecureStorage ? 'premium-secondary-button' : 'premium-button'}`}
                      >
                        <Shield size={18} /> {hasSecureStorage ? 'Reset / Update PIN' : 'Turn On Secure Storage'}
                      </button>
                    </div>
                  </div>

                  {hasSecureStorage && (
	                    <div className="premium-section p-6 rounded-2xl mt-6">
                      <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><History size={16} /> Restore Legacy Keys</h4>
                      <p className="type-body text-gray-400 mb-6 leading-relaxed">
                        If you skipped the PIN entry during login, you won't be able to read old messages. Enter your PIN here to fetch and restore your past encryption keys from the cloud.
                      </p>
                      <div className="flex flex-col md:flex-row gap-3">
	                        <input id="pin-restore-input" type="password" maxLength="6" placeholder="••••••" className="premium-input rounded-xl px-4 py-3 text-[var(--text-main)] text-center tracking-[0.5em] font-mono type-view-title md:w-48 outline-none transition-all" />
                        <button 
                          onClick={async () => {
                            const pin = document.getElementById('pin-restore-input').value;
                            if (pin.length !== 6 || isNaN(pin)) return toast.error('PIN must be exactly 6 digits.');
                            
                            const toastId = toast.loading('Restoring keys...');
                            try {
                              const { data, error } = await loadMyProfileSecrets(supabase, session.user.id);
                              if (error) throw error;
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
	                          className="premium-secondary-button flex-1 px-6 py-3 font-bold cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Key size={18} /> Restore Old Keys
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {settingsConfig.tab === 'appearance' && (
                <div className="pb-10">
                  <h2 className="hidden md:block type-view-title font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Appearance</h2>
                  <div className="space-y-5">
	                  <div className="premium-section p-5 sm:p-6 rounded-2xl space-y-6">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest">App Theme</h4>
                          <p className="type-body text-gray-500 mt-1">Changes settings, friend lists, and non-chat app surfaces.</p>
                        </div>
                        <Palette size={20} className="text-[var(--text-main)] shrink-0" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {THEME_MODES.map(theme => (
	                          <button key={theme} onClick={() => setAppTheme(theme)} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all cursor-pointer ${appTheme === theme ? 'border-[var(--accent)] bg-[var(--accent-glow)] shadow-md' : 'border-[var(--border-subtle)] hover:border-[var(--border-hover)]'}`}>
	                            <div className={`w-full h-16 rounded-lg ghost-border ${theme === 'dark' ? 'bg-black' : 'bg-gray-200'}`}></div>
                            <span className="type-body font-bold text-[var(--text-main)]">{theme === 'dark' ? 'Dark OLED' : 'Light'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-3">
                        <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest">Style</h4>
                        <p className="mt-1 type-body text-gray-500">Shape, material and type. Works with any palette.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {UI_STYLES.map(({ id, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setUiStyle(id)}
                            aria-pressed={uiStyle === id}
                            className={`appearance-tint-option rounded-2xl border p-2 text-left transition-colors ${uiStyle === id ? 'is-active' : ''}`}
                          >
                            <span className={`appearance-style-preview appearance-style-preview-${id}`} aria-hidden="true"><i /><i /></span>
                            <span className="mt-2 block type-label font-bold text-[var(--text-main)]">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {uiStyle === 'glass' && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest">Glass background</h4>
                          <p className="mt-1 type-body text-gray-500">Dark stays OLED black unless you pick an image. Light uses art from your palette.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label className="premium-secondary-button inline-flex cursor-pointer items-center gap-2 px-4 py-2 type-label font-bold focus-within:ring-2 focus-within:ring-[var(--app-accent)]">
                              <Upload size={16} aria-hidden="true" />
                              {hasGlassWallpaper ? 'Change image' : 'Use an image'}
                              <input type="file" accept="image/*" className="sr-only" onChange={pickGlassWallpaper} />
                            </label>
                            {hasGlassWallpaper && (
                              <button
                                type="button"
                                onClick={() => { saveGlassWallpaper(''); setHasGlassWallpaper(false) }}
                                className="premium-secondary-button px-4 py-2 type-label font-bold cursor-pointer"
                              >
                                Use palette art
                              </button>
                            )}
                          </div>
                        </div>
                        {isChromium() && !isLowPowerDevice() && (
                          <div className="seg-group">
                            <ToggleSwitch
                              label="Refraction"
                              description="Bends what's behind the glass at its edges. Turn off if scrolling stutters."
                              checked={glassRefraction}
                              onChange={setGlassRefraction}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <div className="mb-3 flex items-baseline justify-between gap-3">
                        <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest">Palette</h4>
                        <span className="type-label font-bold text-[var(--text-main)]">{PALETTES.find(palette => palette.id === surfaceTint)?.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Palette">
                        {PALETTES.map(({ id: tint, label }) => (
                          <button
                            key={tint}
                            type="button"
                            onClick={() => setSurfaceTint(tint)}
                            aria-pressed={surfaceTint === tint}
                            aria-label={label}
                            title={label}
                            className={`appearance-tint-dot appearance-tint-swatch-${tint} ${surfaceTint === tint ? 'is-active' : ''}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
	                  <div className="premium-section p-5 sm:p-6 rounded-2xl space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="type-body font-bold text-gray-400 uppercase tracking-widest">UI Scale</h4>
                        <p className="type-body text-gray-500 mt-1">Adjusts overall interface spacing and keeps chat readable.</p>
                      </div>
                      <MessageSquare size={20} className="text-[var(--text-main)] shrink-0" />
                    </div>
                    <div>
                      <label className="type-label font-bold text-gray-500 uppercase tracking-widest mb-3 block">Density</label>
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
	                            className={`h-11 type-body font-bold transition-all cursor-pointer ${uiDensity === option.id ? 'premium-button' : 'rounded-full text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)]'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="seg-group">
                    <ToggleSwitch
                      label="Reduce motion"
                      description="Removes decorative movement and keeps transitions nearly instant."
                      checked={reduceMotion}
                      onChange={setReduceMotion}
                    />
                    </div>
	                    <div className="premium-section rounded-xl p-4">
	                      <div className="mb-3 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                        <span className="type-body font-bold text-[var(--text-main)]">Chat Preview</span>
                        <span className="type-label text-gray-400">Independent from app theme</span>
                      </div>
                      <div className="space-y-2">
	                        <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-md border border-[var(--border-subtle)] bg-[var(--bg-element)] px-3 py-2 type-body text-[var(--text-main)]">
                          Dark messages stay readable in light mode.
                        </div>
	                        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md border border-[var(--text-main)] bg-[var(--text-main)] px-3 py-2 type-body text-[var(--lg-ground,var(--bg-base))]">
                          Topbar and input match the chat surface.
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              )}

              {settingsConfig.tab === 'notifications' && (
                <div className="pb-10">
                  <h2 className="hidden md:block type-view-title font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Notifications</h2>
                  <div className="space-y-2">
                    {/* Push is native-only: on web the tab has to stay open anyway,
                        and the in-app message sound already covers that case. */}
                    {Capacitor.isNativePlatform() && (
                      <div className="seg-group"><ToggleSwitch label="Enable Device Notifications" description="Receive push notifications for DMs and activity in servers you have not muted." checked={desktopNotifs} onChange={requestDesktopNotifs} /></div>
                    )}
                    <SettingsGroup title="Communication sounds" className="mt-8">
                    <ToggleSwitch label="Message sounds" description="Play subtle sent and received sounds while the app is open." checked={messageSoundsEnabled} onChange={setMessageSoundsEnabled} />
                    <ToggleSwitch label="Tactile feedback" description="Add short haptics alongside the subtle messaging sounds." checked={tactileFeedbackEnabled} onChange={setTactileFeedbackEnabled} />
                    <ToggleSwitch label="Call sounds" description="Play short tones when calls connect, end, or fail." checked={callSoundsEnabled} onChange={setCallSoundsEnabled} />
                    <ToggleSwitch label="Ringtones" description="Play incoming and outgoing call rings while calls are waiting." checked={ringtoneSoundsEnabled} onChange={setRingtoneSoundsEnabled} />
                    </SettingsGroup>
                  </div>
                </div>
              )}

              {settingsConfig.tab === 'voice' && (
                <div className="pb-10">
                  <h2 className="hidden md:block type-view-title font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Voice & Video</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                    <div className="premium-section p-5 rounded-2xl">
                      <div className="mb-4"><TonalIcon icon={Mic} /></div>
                      <h3 className="text-[var(--text-main)] font-bold type-body mb-1">Voice Processing</h3>
                      <p className="type-body text-gray-500 leading-relaxed">Tune browser call constraints for clearer WebRTC audio.</p>
                    </div>
                    <div className="premium-section p-5 rounded-2xl">
                      <div className="mb-4"><TonalIcon icon={Video} /></div>
                      <h3 className="text-[var(--text-main)] font-bold type-body mb-1">Video Preview</h3>
                      <p className="type-body text-gray-500 leading-relaxed">Keep video behavior predictable before joining a call.</p>
                    </div>
                  </div>
                  <div className="seg-group">
                    <ToggleSwitch label="Automatic gain control" description="Let the browser balance microphone volume during calls." checked={voiceAutoGain} onChange={setVoiceAutoGain} />
                    <ToggleSwitch label="Echo cancellation" description="Reduce speaker feedback and room echo during voice calls." checked={voiceEchoCancel} onChange={setVoiceEchoCancel} />
                    <ToggleSwitch label="Remember video preview preference" description="Keep your last video preview preference on this device." checked={videoPreviewEnabled} onChange={setVideoPreviewEnabled} />
                  </div>
                </div>
              )}

              {settingsConfig.tab === 'legal' && (
                <div className="pb-10">
                  <h2 className="hidden md:block type-view-title font-bold tracking-tight text-[var(--text-main)] mb-6 md:mb-8 font-display">Legal & Policies</h2>
                  
                  <div className="premium-section rounded-2xl overflow-hidden mb-6">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="type-body font-bold text-[var(--text-main)] uppercase tracking-widest">Terms of Service</h4>
                    </div>
                    <div className="p-5 sm:p-6 text-gray-400 type-body leading-relaxed space-y-4">
                      <p>Welcome to MessApp. By utilizing our platform, you agree to comply with our core operational standards. MessApp is built as a secure, decentralized-friendly communication platform. You maintain sole responsibility for the activity originating from your cryptographic identity.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Zero-Tolerance UGC Policy</h5>
                      <p>We maintain a strict zero-tolerance protocol regarding abusive content and harassment. You agree not to weaponize MessApp to transmit illicit, threatening, or rights-violating payloads.</p>
                      <p>In the event of network abuse, utilize the Block feature located in the Privacy & Safety tab. Violators flagged by network heuristics may face immediate permanent access revocation.</p>
                    </div>
                  </div>

                  <div className="premium-section rounded-2xl overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="type-body font-bold text-[var(--text-main)] uppercase tracking-widest">Privacy Protocol</h4>
                    </div>
                    <div className="p-5 sm:p-6 text-gray-400 type-body leading-relaxed space-y-4">
                      <p>Absolute privacy is the foundation of our architecture. MessApp deploys strictly implemented End-to-End Encryption (AES-GCM) across all direct communications. We physically lack the cryptographic keys required to decipher, read, or intercept your private data.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Data Minimization</h5>
                      <p>We capture only the bare minimum telemetry required for network stability: your authentication email and explicit public profile variables. Encrypted payloads are routed through our servers strictly for delivery synchronization and are inaccessible to our infrastructure.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Data Eradication</h5>
                      <p>You wield complete authority over your footprint. You may execute localized message deletion, full conversation wiping, or total account eradication at will. Account deletion triggers an immediate cascade purge across our active server arrays.</p>
                    </div>
                  </div>

                  {/* The MIT terms require the notice to travel with the build,
                      and a shipped app has no LICENSE file to open — so it
                      lives here, alongside the attribution for the bundled
                      dependencies and self-hosted fonts. */}
                  <div className="premium-section rounded-2xl overflow-hidden mt-6">
                    <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
                      <h4 className="type-body font-bold text-[var(--text-main)] uppercase tracking-widest">Copyright</h4>
                    </div>
                    <div className="p-5 sm:p-6 text-gray-400 type-body leading-relaxed space-y-4">
                      <p>© 2026 Shaiyon (Skibidevs). All rights reserved.</p>
                      <p>MessApp is released under the MIT License. Permission is granted, free of charge, to use, copy, modify, and distribute this software, provided this copyright notice and the permission notice travel with every copy. The software is provided “as is”, without warranty of any kind.</p>
                      <h5 className="text-[var(--text-main)] font-bold mt-4">Third-Party Notices</h5>
                      <p>This app bundles React, Tailwind CSS, Supabase JS, Lucide icons, Capacitor, and Tauri, each distributed under its own MIT, ISC, or Apache-2.0 terms. The Space Grotesk typeface is self-hosted under the SIL Open Font License 1.1. Their respective copyrights remain with their authors.</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
      {avatarEditorFile && (
        <MediaEditorModal
          file={avatarEditorFile}
          profile
          onCancel={() => setAvatarEditorFile(null)}
          onSave={uploadAvatar}
        />
      )}
    </div>
  )
}
