import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { App as CapacitorApp } from '@capacitor/app'
import toast, { Toaster } from 'react-hot-toast'
import { Search, X, Download, Shield, Key } from 'lucide-react'

import { audioSys } from '../lib/SoundEngine'
import { useWebRTC } from '../hooks/useWebRTC'
import { useChatManager } from '../hooks/useChatManager'

import CallOverlay from './chat/CallOverlay'
import LeftSidebar from './layout/LeftSidebar'
import RightSidebar from './layout/RightSidebar'
import ChatArea from './layout/ChatArea'

import ServerActionPopout from './modals/ServerActionPopout'
import ServerSettingsModal from './modals/ServerSettings'
// import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'

import { generateEcdhKeyPair, exportPublicKey, exportPrivateKey, generateSecureRandomNumber } from '../lib/crypto'
import { normalizeProfileBaseName } from '../lib/security'
import { applyThemeMode } from '../lib/theme'
import StatusAvatar from './ui/StatusAvatar'
import { CornerDownLeft } from 'lucide-react'

const THEME_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' }
]

const WALLPAPERS = [
  {
    id: 'default',
    name: 'Soft Bloom',
    css: 'radial-gradient(circle at 18% 12%, var(--theme-10), transparent 28%), radial-gradient(circle at 86% 18%, rgba(45, 212, 191, 0.11), transparent 24%), radial-gradient(circle at 72% 88%, rgba(244, 114, 182, 0.10), transparent 30%), linear-gradient(135deg, rgba(148, 163, 184, 0.05), transparent 42%)',
    size: 'auto',
    repeat: 'no-repeat'
  },
  {
    id: 'doodles',
    name: 'Paper Lines',
    css: 'linear-gradient(135deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px), radial-gradient(circle at 12% 18%, rgba(251, 191, 36, 0.10), transparent 26%), radial-gradient(circle at 86% 78%, rgba(14, 165, 233, 0.10), transparent 28%)',
    size: '28px 28px, auto, auto',
    repeat: 'repeat, no-repeat, no-repeat'
  },
  {
    id: 'galaxy',
    name: 'Aurora',
    css: 'radial-gradient(ellipse at 12% 18%, rgba(56, 189, 248, 0.14), transparent 34%), radial-gradient(ellipse at 84% 20%, rgba(168, 85, 247, 0.12), transparent 32%), radial-gradient(ellipse at 56% 92%, rgba(16, 185, 129, 0.12), transparent 34%), linear-gradient(160deg, rgba(255, 255, 255, 0.03), transparent 48%)',
    size: 'auto',
    repeat: 'no-repeat'
  },
  {
    id: 'emerald',
    name: 'Terrace',
    css: 'repeating-linear-gradient(0deg, rgba(148, 163, 184, 0.07) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.045) 0 1px, transparent 1px 22px), radial-gradient(circle at 20% 90%, rgba(251, 113, 133, 0.10), transparent 26%), radial-gradient(circle at 90% 12%, rgba(34, 197, 94, 0.10), transparent 28%)',
    size: 'auto',
    repeat: 'repeat, repeat, no-repeat, no-repeat'
  }
]

const sortDmsByLastMessage = (items) => {
  return [...items].sort((a, b) => new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0))
}

export default function Dashboard({ session }) {
  const [view, setView] = useState('home')
  const [homeTab, setHomeTab] = useState('online') 
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [activeChannel, setActiveChannel] = useState(null)
  const [dms, setDms] = useState([])
  const [activeDm, setActiveDm] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [userPresence, setUserPresence] = useState({})
  const [friendRequests, setFriendRequests] = useState([])
  const [acceptedFriends, setAcceptedFriends] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([]) 
  const [blockedByUsers, setBlockedByUsers] = useState([])
  const [restrictedUsers, setRestrictedUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`restricted_${session.user.id}`)) || [] } catch (_e) { return [] }
  })
  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [rightTab, setRightTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [serverAction, setServerAction] = useState(null)
  const [showProfilePopout, setShowProfilePopout] = useState(false)
  
  const [settingsModalConfig, setSettingsModalConfig] = useState({ isOpen: false, tab: 'account', showMenu: true })
  const [userStatus, setUserStatus] = useState(() => localStorage.getItem(`user_status_${session.user.id}`) || 'online')
  
  const popoutRef = useRef(null)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false)
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  
  const [showPinSetupPrompt, setShowPinSetupPrompt] = useState(false)
  const [setupPinInput, setSetupPinInput] = useState('')

  const [dmActionMenuId, setDmActionMenuId] = useState(null) 
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) 
  const [serverSettingsName, setServerSettingsName] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [channelSettingsName, setChannelSettingsName] = useState('')
  const profileCacheKey = `profile_cache_${session.user.id}`
  const [profileOverride, setProfileOverride] = useState(() => {
    try {
      return { ...(session.user.user_metadata || {}), ...(JSON.parse(localStorage.getItem(profileCacheKey)) || {}) }
    } catch (_err) {
      return session.user.user_metadata || {}
    }
  })

  const profileData = { ...(session.user.user_metadata || {}), ...profileOverride }
  const myAvatar = profileData.avatar_url
  const myBanner = profileData.banner_url
  const myBio = profileData.bio
  const myPronouns = profileData.pronouns
  const myUsername = profileData.username || session.user.email.split('@')[0]
  const myTag = profileData.unique_tag || `${myUsername}#0000`

  const chatManagerProps = useChatManager(session, activeChannel, activeDm, view, dms)
  const webRTCProps = useWebRTC(session, activeDm)

  const stateRef = useRef({});
  const activeDmRef = useRef(null);
  const presenceChannelRef = useRef(null);
  const lastHomeClickRef = useRef(0);
  const acceptingRefs = useRef(new Set());
  const exitTimerRef = useRef(null);

  useEffect(() => {
    try {
      setProfileOverride({ ...(session.user.user_metadata || {}), ...(JSON.parse(localStorage.getItem(profileCacheKey)) || {}) })
    } catch (_err) {
      setProfileOverride(session.user.user_metadata || {})
    }
  }, [session.user.user_metadata, profileCacheKey])

  useEffect(() => {
    const unlockAudio = () => {
      void audioSys.unlock();
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
    };
    
    document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
    document.addEventListener('keydown', unlockAudio, { once: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
    }
  }, []);

  useEffect(() => {
    activeDmRef.current = activeDm;
    stateRef.current = { 
      mobileMenuOpen, 
      showRightSidebar, 
      settingsModalConfig, 
      selectedImage: chatManagerProps.selectedImage,
      showProfilePopout,
      showQuickSwitcher,
      confirmAction,
      showServerSettings,
      showChannelModal,
      showChannelSettings,
      activeDm,
      view
    };
  }, [mobileMenuOpen, showRightSidebar, settingsModalConfig, chatManagerProps.selectedImage, showProfilePopout, showQuickSwitcher, confirmAction, showServerSettings, showChannelModal, showChannelSettings, activeDm, view]);

  useEffect(() => {
    const setupBackButton = async () => {
      await CapacitorApp.addListener('backButton', () => {
        const state = stateRef.current;
        
        if (state.selectedImage) chatManagerProps.setSelectedImage(null);
        else if (state.confirmAction) setConfirmAction(null);
        else if (state.showQuickSwitcher) setShowQuickSwitcher(false);
        else if (state.showProfilePopout) setShowProfilePopout(false);
        else if (state.showServerSettings) setShowServerSettings(false);
        else if (state.showChannelModal) setShowChannelModal(false);
        else if (state.showChannelSettings) setShowChannelSettings(false);
        else if (state.settingsModalConfig.isOpen) {
            if (!state.settingsModalConfig.showMenu && window.innerWidth < 768) {
                setSettingsModalConfig(prev => ({ ...prev, showMenu: true }));
            } else {
                setSettingsModalConfig({ isOpen: false, tab: 'account', showMenu: true });
            }
        }
        else if (state.showRightSidebar) { setShowRightSidebar(false); setSearchQuery(''); }
        else if (!state.mobileMenuOpen) {
            setMobileMenuOpen(true);
        } else {
            if (exitTimerRef.current) {
                CapacitorApp.exitApp();
            } else {
                toast("Press back again to exit", { duration: 2000, position: 'bottom-center' });
                exitTimerRef.current = setTimeout(() => { exitTimerRef.current = null; }, 2000);
            }
        }
      });
    };
    setupBackButton();
    return () => { CapacitorApp.removeAllListeners('backButton'); };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT' || !currentSession) {
        window.location.reload();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) registration.unregister();
      });
    }
  }, []);

  useEffect(() => {
    applyThemeMode(localStorage.getItem('appTheme') || 'dark');

    const storedDensity = localStorage.getItem('uiDensity') || localStorage.getItem('chatMessageScale') || 'default';
    const uiDensity = storedDensity === 'comfortable' || storedDensity === 'normal' ? 'default' : storedDensity === 'large' ? 'spacious' : storedDensity;
    const chatMessageSize = uiDensity === 'spacious' ? '16px' : uiDensity === 'compact' ? '14px' : '15px';
    document.documentElement.setAttribute('data-ui-density', uiDensity);
    document.documentElement.style.setProperty('--chat-message-font-size', chatMessageSize);
  }, []);

  useEffect(() => { localStorage.setItem(`restricted_${session.user.id}`, JSON.stringify(restrictedUsers)) }, [restrictedUsers, session.user.id])
  useEffect(() => { localStorage.setItem(`user_status_${session.user.id}`, userStatus) }, [userStatus, session.user.id])

  const selectDm = useCallback((dm) => {
    setActiveDm(dm)
    setMobileMenuOpen(false)
    if (dm) {
      const readAt = new Date().toISOString()
      localStorage.setItem(`last_dm_${session.user.id}`, dm.dm_room_id)
      setDms(current => current.map(item => item.dm_room_id === dm.dm_room_id ? { ...item, last_read_at: readAt, is_unread: false } : item))
      void supabase.from('dm_reads').upsert({ profile_id: session.user.id, dm_room_id: dm.dm_room_id, last_read_at: readAt })
    } else {
      localStorage.removeItem(`last_dm_${session.user.id}`)
    }
  }, [session.user.id])

  const updateProfileBio = useCallback(async (newStatus) => {
    const nextBio = newStatus.trim()
    setProfileOverride(prev => {
      const next = { ...prev, bio: nextBio }
      localStorage.setItem(profileCacheKey, JSON.stringify(next))
      return next
    })
    const { error } = await supabase.from('profiles').update({ bio: nextBio }).eq('id', session.user.id)
    if (error) throw error
  }, [profileCacheKey, session.user.id])

  useEffect(() => {
    if (!session?.user?.id) return; 

    const syncProfile = async () => {
      if (session?.user?.id && session?.user?.user_metadata) {
        const { data: existingProfile, error: profileFetchError } = await supabase.from('profiles').select('public_key, encrypted_private_key, username, unique_tag, avatar_url, banner_url, bio, pronouns').eq('id', session.user.id).maybeSingle()
        if (profileFetchError) {
          console.warn('Profile sync lookup failed', profileFetchError.message)
          return
        }

        let pubKeyStr = existingProfile?.public_key || null;
        let encryptedPrivKey = existingProfile?.encrypted_private_key || null;
        let privKeyJwkStr = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
        let pubKeyJwkStr = localStorage.getItem(`e2ee_public_key_${session.user.id}`);
        let forceNew = localStorage.getItem(`e2ee_force_new_key_${session.user.id}`) === 'true';

        if (encryptedPrivKey && !privKeyJwkStr && !forceNew) {
          setShowRecoveryPrompt(true);
          return; 
        }

        if (privKeyJwkStr && !pubKeyJwkStr) {
           try {
             const parsedPriv = JSON.parse(privKeyJwkStr);
             const reconstructedPub = { kty: parsedPriv.kty, crv: parsedPriv.crv, x: parsedPriv.x, y: parsedPriv.y, ext: true };
             pubKeyJwkStr = JSON.stringify(reconstructedPub);
             localStorage.setItem(`e2ee_public_key_${session.user.id}`, pubKeyJwkStr);
           } catch (_e) {
             if (pubKeyStr) {
               pubKeyJwkStr = pubKeyStr;
               localStorage.setItem(`e2ee_public_key_${session.user.id}`, pubKeyStr);
             }
           }
        }

        if (!privKeyJwkStr || !pubKeyJwkStr || forceNew) {
          try {
            localStorage.removeItem(`e2ee_force_new_key_${session.user.id}`);
            const keyPair = await generateEcdhKeyPair();
            const privJwk = await exportPrivateKey(keyPair.privateKey);
            const pubJwk = await exportPublicKey(keyPair.publicKey);
            privKeyJwkStr = JSON.stringify(privJwk);
            pubKeyJwkStr = JSON.stringify(pubJwk);
            localStorage.setItem(`e2ee_private_key_${session.user.id}`, privKeyJwkStr);
            localStorage.setItem(`e2ee_public_key_${session.user.id}`, pubKeyJwkStr);
          } catch (_err) {}
        }
        pubKeyStr = pubKeyJwkStr || pubKeyStr;

        if (!encryptedPrivKey) {
            setShowPinSetupPrompt(true);
        }

        const metadata = session.user.user_metadata || {}
        const fallbackUsername = metadata.username || session.user.email.split('@')[0]
        const fallbackTag = `${normalizeProfileBaseName(fallbackUsername) || 'user'}#${generateSecureRandomNumber(1000, 9999)}`
        const profilePayload = {
          username: existingProfile?.username || fallbackUsername,
          unique_tag: existingProfile?.unique_tag || metadata.unique_tag || fallbackTag,
          avatar_url: existingProfile?.avatar_url || metadata.avatar_url || null,
          banner_url: existingProfile?.banner_url || metadata.banner_url || null,
          bio: existingProfile?.bio || metadata.bio || null,
          pronouns: existingProfile?.pronouns || metadata.pronouns || null
        }
        setProfileOverride(prev => ({ ...prev, ...profilePayload }))
        localStorage.setItem(profileCacheKey, JSON.stringify(profilePayload))
        if (existingProfile) {
          const { error: updateProfileError } = await supabase.from('profiles').update({ public_key: pubKeyStr }).eq('id', session.user.id)
          if (updateProfileError) console.warn('Profile key sync failed', updateProfileError.message)
        } else {
          const { error: insertProfileError } = await supabase.from('profiles').insert({ id: session.user.id, ...profilePayload, public_key: pubKeyStr })
          if (insertProfileError) console.warn('Profile creation failed', insertProfileError.message)
        }
      }
    }
    
    const fetchRelationships = async () => {
      const [{ data: outboundBlocks }, { data: inboundBlocks }] = await Promise.all([
        supabase.from('user_relationships').select('blocked_id').eq('blocker_id', session.user.id),
        supabase.from('user_relationships').select('blocker_id').eq('blocked_id', session.user.id)
      ])
      if (outboundBlocks) setBlockedUsers(outboundBlocks.map(r => r.blocked_id))
      if (inboundBlocks) setBlockedByUsers(inboundBlocks.map(r => r.blocker_id))
    }

    syncProfile()
    fetchRelationships()
    fetchServers()
    fetchDms()
    fetchFriendRequests()
    fetchAcceptedFriends()
    
    const presenceChannel = supabase.channel('global-presence')
    presenceChannelRef.current = presenceChannel
    
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState()
      const presences = Object.values(state).flatMap(presenceList => presenceList)
      const activeUserIds = presences.map(presence => presence.user_id).filter(Boolean)
      const nextPresence = {}
      for (const presence of presences) {
        if (!presence.user_id) continue
        const status = ['online', 'idle', 'dnd'].includes(presence.status) ? presence.status : 'online'
        nextPresence[presence.user_id] = { status, online_at: presence.online_at || null }
      }
      setOnlineUsers([...new Set(activeUserIds)])
      setUserPresence(nextPresence)
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: session.user.id, status: userStatus, online_at: new Date().toISOString() })
    })
    
    const requestsSub = supabase.channel('public:friendships').on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
         fetchFriendRequests();
         fetchAcceptedFriends();
         fetchDms();
    }).subscribe();

    const dmMembersSub = supabase.channel('public:dm_members').on('postgres_changes', { event: '*', schema: 'public', table: 'dm_members' }, () => {
         fetchDms();
    }).subscribe();

    const relationshipsSub = supabase.channel('public:user_relationships').on('postgres_changes', { event: '*', schema: 'public', table: 'user_relationships' }, (payload) => {
      const row = payload.new?.id ? payload.new : payload.old;
      if (row?.blocker_id === session.user.id || row?.blocked_id === session.user.id) fetchRelationships();
    }).subscribe();

    const dmMessagesSub = supabase.channel('public:dm-messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const roomId = payload.new?.dm_room_id;
      if (!roomId) return;
      const messageAt = payload.new.created_at || new Date().toISOString();
      const isOwnMessage = payload.new.profile_id === session.user.id;
      const isOpenRoom = activeDmRef.current?.dm_room_id === roomId;
      if (isOpenRoom) {
        void supabase.from('dm_reads').upsert({ profile_id: session.user.id, dm_room_id: roomId, last_read_at: messageAt })
      }
      setDms(current => {
        const next = current.map(dm => dm.dm_room_id === roomId ? {
          ...dm,
          last_message_at: messageAt,
          last_read_at: isOpenRoom ? messageAt : dm.last_read_at,
          is_unread: !isOwnMessage && !isOpenRoom
        } : dm)
        return sortDmsByLastMessage(next)
      })
    }).subscribe();

    return () => { 
      presenceChannelRef.current = null;
      supabase.removeChannel(presenceChannel); 
      supabase.removeChannel(requestsSub);
      supabase.removeChannel(dmMembersSub);
      supabase.removeChannel(relationshipsSub);
      supabase.removeChannel(dmMessagesSub);
    }
  }, [session]) 

  useEffect(() => {
    if (!presenceChannelRef.current) return
    void presenceChannelRef.current.track({ user_id: session.user.id, status: userStatus, online_at: new Date().toISOString() })
  }, [session.user.id, userStatus])

  useEffect(() => {
    const roomSub = supabase.channel('dm-rooms-updates').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_rooms' }, (payload) => {
         setDms(current => current.map(dm => dm.dm_room_id === payload.new.id ? { ...dm, dm_rooms: { theme_color: payload.new.theme_color, wallpaper: payload.new.wallpaper } } : dm))
         if (activeDm && activeDm.dm_room_id === payload.new.id) setActiveDm(prev => ({ ...prev, dm_rooms: { theme_color: payload.new.theme_color, wallpaper: payload.new.wallpaper } }))
      }).subscribe()
    return () => supabase.removeChannel(roomSub)
  }, [activeDm])

  const fetchFriendRequests = async () => {
    const { data } = await supabase.from('friendships').select('id, sender_id, profiles!fk_sender(username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)').eq('receiver_id', session.user.id).eq('status', 'pending')
    if (data) setFriendRequests(data)
  }

  const fetchAcceptedFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id, sender_id, receiver_id, sender:profiles!fk_sender(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key), receiver:profiles!fk_receiver(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)')
      .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
      .eq('status', 'accepted')

    if (data) {
      setAcceptedFriends(data.map(item => item.sender_id === session.user.id ? item.receiver : item.sender).filter(Boolean))
    }
  }

  const handleAcceptRequest = async (request) => {
    if (acceptingRefs.current.has(request.id)) return;
    acceptingRefs.current.add(request.id);
    try {
      const { data: check } = await supabase.from('friendships').select('status').eq('id', request.id).single()
      if (check?.status === 'accepted') return;

      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', request.id)
      const { data: newRoom } = await supabase.from('dm_rooms').insert([{}]).select().maybeSingle()
      if (newRoom) {
        await supabase.from('dm_members').insert([
          { dm_room_id: newRoom.id, profile_id: session.user.id }, 
          { dm_room_id: newRoom.id, profile_id: request.sender_id }
        ])
      }
      fetchFriendRequests()
      fetchAcceptedFriends()
      fetchDms()
      toast.success("Friend request accepted!")
    } catch { toast.error("Failed to accept request.") }
    finally { acceptingRefs.current.delete(request.id); }
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await supabase.from('friendships').delete().eq('id', requestId)
      fetchFriendRequests()
    } catch { toast.error("Failed to decline request.") }
  }

  const closeRightSidebar = () => {
    setShowRightSidebar(false)
    setSearchQuery('')
  }

  const toggleRightSidebar = (tab) => {
    if (showRightSidebar && rightTab === tab) {
      closeRightSidebar()
    } else { 
      setShowRightSidebar(true); 
      setRightTab(tab); 
    }
  }

  const handleHomeClick = () => {
    const now = Date.now();
    const isDoubleClick = now - lastHomeClickRef.current < 400;
    lastHomeClickRef.current = now;

    if (isDoubleClick) {
      setView('home'); 
      setHomeTab('online'); 
      setActiveServer(null); 
      setActiveChannel(null); 
      selectDm(null); 
      closeRightSidebar(); 
      setMobileMenuOpen(false); 
    } else {
      setView('home'); 
      setActiveServer(null); 
      setActiveChannel(null); 
    }
  }

  const handleThemeChange = async (colorHex) => {
    if (!activeDm) return;
    const updatedDm = { ...activeDm, dm_rooms: { ...(activeDm.dm_rooms || {}), theme_color: colorHex } }
    setActiveDm(updatedDm)
    setDms(current => current.map(dm => dm.dm_room_id === activeDm.dm_room_id ? updatedDm : dm))
    try { await supabase.from('dm_rooms').update({ theme_color: colorHex }).eq('id', activeDm.dm_room_id) } catch (_err) {}
  }

  const handleWallpaperChange = async (wallpaperId) => {
    if (!activeDm) return;
    const updatedDm = { ...activeDm, dm_rooms: { ...(activeDm.dm_rooms || {}), wallpaper: wallpaperId } }
    setActiveDm(updatedDm)
    setDms(current => current.map(dm => dm.dm_room_id === activeDm.dm_room_id ? updatedDm : dm))
    try { await supabase.from('dm_rooms').update({ wallpaper: wallpaperId }).eq('id', activeDm.dm_room_id) } catch (_err) {}
  }

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, profile } = confirmAction;
    
    try {
      if (type === 'block') { 
        const { error } = await supabase.from('user_relationships').insert([{ blocker_id: session.user.id, blocked_id: profile.id }])
        if (error) throw error
        setBlockedUsers(prev => [...prev, profile.id]); 
        toast.error(`Blocked ${profile.username}`, { icon: '🚫' }); 
      } 
      else if (type === 'unblock') { 
        const { error } = await supabase.from('user_relationships').delete().match({ blocker_id: session.user.id, blocked_id: profile.id })
        if (error) throw error
        setBlockedUsers(prev => prev.filter(id => id !== profile.id)); 
        toast.success(`Unblocked ${profile.username}`); 
      } 
      else if (type === 'restrict') { 
        setRestrictedUsers(prev => [...prev, profile.id]); 
        toast.success(`Restricted ${profile.username}`, { icon: '🤫' }); 
      } 
      else if (type === 'unrestrict') { 
        setRestrictedUsers(prev => prev.filter(id => id !== profile.id)); 
        toast.success(`Unrestricted ${profile.username}`); 
      }
      else if (type === 'delete_dm') {
        const { error } = await supabase.from('dm_members').delete().match({ dm_room_id: confirmAction.dm_room_id, profile_id: session.user.id });
        if (error) throw error;

        setDms(prev => prev.filter(dm => dm.dm_room_id !== confirmAction.dm_room_id));
        if (activeDm?.dm_room_id === confirmAction.dm_room_id) {
          setActiveDm(null);
          setView('home');
          setShowRightSidebar(false);
        }
        toast.success("Conversation removed from your list");
      }
    } catch (_err) {
      toast.error("Failed to update user status or delete chat")
    }
    setConfirmAction(null);
  }

  const fetchServers = async () => {
    const { data } = await supabase.from('servers').select('*, server_members!inner(*)').eq('server_members.profile_id', session.user.id)
    if (data) setServers(data)
  }

  const fetchDms = async () => {
    const { data: myRooms } = await supabase.from('dm_members').select('dm_room_id').eq('profile_id', session.user.id)
    if (!myRooms || myRooms.length === 0) { setDms([]); return }
    const roomIds = myRooms.map(r => r.dm_room_id)
    const [otherMembersRes, latestMessagesRes, readsRes] = await Promise.all([
      supabase.from('dm_members').select('dm_room_id, dm_rooms (theme_color, wallpaper), profiles!inner(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)').in('dm_room_id', roomIds).neq('profile_id', session.user.id),
      supabase.from('messages').select('dm_room_id, profile_id, created_at').in('dm_room_id', roomIds).order('created_at', { ascending: false }).limit(Math.max(roomIds.length * 5, 50)),
      supabase.from('dm_reads').select('dm_room_id, last_read_at').eq('profile_id', session.user.id).in('dm_room_id', roomIds)
    ])
    const otherMembers = otherMembersRes.data
      
    if (otherMembers) {
      const latestByRoom = new Map()
      const readByRoom = new Map((readsRes.data || []).map(item => [item.dm_room_id, item.last_read_at]))
      for (const message of latestMessagesRes.data || []) {
        if (message.dm_room_id && !latestByRoom.has(message.dm_room_id)) latestByRoom.set(message.dm_room_id, message)
      }
      const uniqueDms = Array.from(new Map(otherMembers.map(item => {
        const latestMessage = latestByRoom.get(item.dm_room_id)
        const lastReadAt = readByRoom.get(item.dm_room_id) || null
        const lastMessageAt = latestMessage?.created_at || null
        const isUnread = Boolean(lastMessageAt && latestMessage?.profile_id !== session.user.id && (!lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)))
        return [item.dm_room_id, { ...item, last_message_at: lastMessageAt, last_read_at: lastReadAt, is_unread: isUnread }]
      })).values())
      setDms(sortDmsByLastMessage(uniqueDms))
    }
  }

  const createOrOpenDm = async (entry) => {
    try {
      const targetProfile = entry.profiles
      if (!targetProfile?.id) throw new Error('Missing target user')

      const { data: myRooms, error: myRoomsError } = await supabase
        .from('dm_members')
        .select('dm_room_id')
        .eq('profile_id', session.user.id)
      if (myRoomsError) throw myRoomsError

      const roomIds = Array.from(new Set((myRooms || []).map(room => room.dm_room_id).filter(Boolean)))
      if (roomIds.length > 0) {
        const { data: roomMembers, error: membersError } = await supabase
          .from('dm_members')
          .select('dm_room_id, profile_id')
          .in('dm_room_id', roomIds)
        if (membersError) throw membersError

        const membersByRoom = new Map()
        for (const member of roomMembers || []) {
          const members = membersByRoom.get(member.dm_room_id) || []
          members.push(member.profile_id)
          membersByRoom.set(member.dm_room_id, members)
        }

        const existingRoomId = roomIds.find(roomId => {
          const members = membersByRoom.get(roomId) || []
          return members.length === 2 && members.includes(session.user.id) && members.includes(targetProfile.id)
        })

        if (existingRoomId) {
          const existingDm = dms.find(dm => dm.dm_room_id === existingRoomId) || {
            dm_room_id: existingRoomId,
            dm_rooms: entry.dm_rooms || { theme_color: '#6366f1', wallpaper: 'default' },
            profiles: targetProfile,
            last_message_at: entry.last_message_at || null,
            last_read_at: entry.last_read_at || null,
            is_unread: false
          }
          setDms(current => sortDmsByLastMessage([existingDm, ...current.filter(dm => dm.dm_room_id !== existingRoomId)]))
          setView('home')
          selectDm(existingDm)
          setShowQuickSwitcher(false)
          setQuickSwitcherQuery('')
          return
        }
      }

      const { data: newRoom, error: roomError } = await supabase.from('dm_rooms').insert([{}]).select().single()
      if (roomError) throw roomError
      const { error: selfMemberError } = await supabase.from('dm_members').insert([{ dm_room_id: newRoom.id, profile_id: session.user.id }])
      if (selfMemberError) throw selfMemberError
      const { error: peerMemberError } = await supabase.from('dm_members').insert([{ dm_room_id: newRoom.id, profile_id: targetProfile.id }])
      if (peerMemberError) throw peerMemberError

      const newDm = {
        dm_room_id: newRoom.id,
        dm_rooms: { theme_color: newRoom.theme_color, wallpaper: newRoom.wallpaper },
        profiles: targetProfile,
        last_message_at: null,
        last_read_at: null,
        is_unread: false
      }
      setDms(current => sortDmsByLastMessage([newDm, ...current.filter(dm => dm.profiles.id !== targetProfile.id)]))
      setView('home')
      selectDm(newDm)
      setShowQuickSwitcher(false)
      setQuickSwitcherQuery('')
      toast.success(`Started chat with ${targetProfile.username}`)
    } catch (_err) {
      toast.error('Could not start this chat.')
    }
  }

  useEffect(() => {
    if (view === 'server' && activeServer) {
      const getServerData = async () => {
        const [channelsRes] = await Promise.all([
          supabase.from('channels').select('*').eq('server_id', activeServer.id).order('created_at', { ascending: true }),
          supabase.from('channel_reads').select('channel_id, last_read_at').eq('profile_id', session.user.id)
        ])
        if (channelsRes.data?.length > 0) setActiveChannel(channelsRes.data[0])
      }
      getServerData()
    }
  }, [activeServer?.id, view, session.user.id])

  const searchResults = searchQuery ? chatManagerProps.validMessages.filter(m => !m.is_deleted && (m.content?.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase()))) : []
  const restrictedUsersSet = useMemo(() => new Set(restrictedUsers), [restrictedUsers]);
  const onlineUsersSet = useMemo(() => new Set(onlineUsers), [onlineUsers]);
  const getPresenceStatus = useCallback((profileId) => {
    if (!profileId) return 'offline'
    return userPresence[profileId]?.status || (onlineUsersSet.has(profileId) ? 'online' : 'offline')
  }, [onlineUsersSet, userPresence])
  const getPresenceLabel = useCallback((profileId) => {
    const status = getPresenceStatus(profileId)
    if (status === 'dnd') return 'Do Not Disturb'
    if (status === 'idle') return 'Idle'
    if (status === 'online') return 'Online'
    return 'Offline'
  }, [getPresenceStatus])
  const blockedUsersSet = useMemo(() => new Set(blockedUsers), [blockedUsers]);
  const blockedByUsersSet = useMemo(() => new Set(blockedByUsers), [blockedByUsers]);
  const allFriends = useMemo(() => dms.filter(dm => !restrictedUsersSet.has(dm.profiles.id)), [dms, restrictedUsersSet]);
  const onlineFriends = useMemo(() => allFriends.filter(dm => onlineUsersSet.has(dm.profiles.id)), [allFriends, onlineUsersSet]);

  const quickSwitcherBase = useMemo(() => {
    const existingIds = new Set(dms.map(dm => dm.profiles.id))
    const friendEntries = acceptedFriends
      .filter(profile => !existingIds.has(profile.id) && !restrictedUsersSet.has(profile.id))
      .map(profile => ({ dm_room_id: null, profiles: profile, is_new_chat: true }))
    return [...allFriends, ...friendEntries]
  }, [acceptedFriends, allFriends, dms, restrictedUsersSet])

  const activeDmPeerId = activeDm?.profiles?.id
  const isBlocked = Boolean(activeDmPeerId && (blockedUsersSet.has(activeDmPeerId) || blockedByUsersSet.has(activeDmPeerId)))
  const blockReason = activeDmPeerId && blockedByUsersSet.has(activeDmPeerId) ? 'This user has blocked you.' : 'You blocked this user.'
  const isChatActive = (view === 'server' && activeChannel) || (view === 'home' && activeDm)

  const quickSwitcherResults = quickSwitcherQuery ? quickSwitcherBase.filter(dm => dm.profiles.username.toLowerCase().includes(quickSwitcherQuery.toLowerCase()) || dm.profiles.unique_tag?.toLowerCase().includes(quickSwitcherQuery.toLowerCase())) : quickSwitcherBase
  const currentThemeHex = (activeDm?.dm_rooms?.theme_color || '#6366f1')
  const currentWallpaper = activeDm?.dm_rooms?.wallpaper || 'default'
  const currentWallpaperConfig = WALLPAPERS.find(w => w.id === currentWallpaper) || WALLPAPERS[0]
  const wallpaperCSS = currentWallpaperConfig.css || 'none'

  const scopedChatStyle = isChatActive ? { 
    '--theme-base': currentThemeHex,
    '--theme-10': currentThemeHex + '1a',
    '--theme-20': currentThemeHex + '33',
    '--theme-50': currentThemeHex + '80',
    '--chat-bg-base': 'var(--bg-base)',
    '--chat-bg-surface': 'var(--bg-surface)',
    '--chat-bg-element': 'var(--bg-element)',
    '--chat-border': 'var(--border-subtle)',
    '--chat-text': 'var(--text-main)',
  } : {
    '--theme-base': '#6366f1',
    '--theme-10': '#6366f11a',
    '--theme-20': '#6366f133',
    '--theme-50': '#6366f180',
    '--chat-bg-base': 'var(--bg-base)',
    '--chat-bg-surface': 'var(--bg-surface)',
    '--chat-bg-element': 'var(--bg-element)',
    '--chat-border': 'var(--border-subtle)',
    '--chat-text': 'var(--text-main)',
  }

  return (
    <div className="ambient-shell flex h-[100dvh] w-full text-[var(--text-main)] overflow-hidden font-sans selection:bg-[var(--theme-50)] relative z-0">
      <CallOverlay 
        {...webRTCProps}
        acceptCall={webRTCProps.acceptCall}
        endCallNetwork={webRTCProps.endCallNetwork}
        toggleMic={webRTCProps.toggleMic}
        toggleVideo={webRTCProps.toggleVideo}
        toggleNoiseCancellation={webRTCProps.toggleNoiseCancellation}
        acceptVideoRequest={webRTCProps.acceptVideoRequest}
        declineVideoRequest={webRTCProps.declineVideoRequest}
      />

      <Toaster position="top-center" toastOptions={{ style: { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' } }} />
      
      <LeftSidebar 
        session={session}
        view={view}
        setView={setView}
        homeTab={homeTab}
        setHomeTab={setHomeTab}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        servers={servers}
        activeServer={activeServer}
        setActiveServer={setActiveServer}
        activeChannel={activeChannel}
        setActiveChannel={setActiveChannel}
        dms={dms}
        activeDm={activeDm}
        selectDm={selectDm}
        onlineUsersSet={onlineUsersSet}
        userPresence={userPresence}
        getPresenceStatus={getPresenceStatus}
        getPresenceLabel={getPresenceLabel}
        friendRequests={friendRequests}
        handleAcceptRequest={handleAcceptRequest}
        handleDeclineRequest={handleDeclineRequest}
        serverAction={serverAction}
        setServerAction={setServerAction}
        showProfilePopout={showProfilePopout}
        setShowProfilePopout={setShowProfilePopout}
        settingsModalConfig={settingsModalConfig}
        setSettingsModalConfig={setSettingsModalConfig}
        dmActionMenuId={dmActionMenuId}
        setDmActionMenuId={setDmActionMenuId}
        setConfirmAction={setConfirmAction}
        restrictedUsersSet={restrictedUsersSet}
        blockedUsersSet={blockedUsersSet}
        myAvatar={myAvatar}
        myUsername={myUsername}
        myTag={myTag}
        myBio={myBio}
        myPronouns={myPronouns}
        myBanner={myBanner}
        userStatus={userStatus}
        setUserStatus={setUserStatus}
        updateProfileBio={updateProfileBio}
        popoutRef={popoutRef}
        setShowQuickSwitcher={setShowQuickSwitcher}
        allFriends={allFriends}
        onlineFriends={onlineFriends}
        scopedChatStyle={scopedChatStyle}
        handleHomeClick={handleHomeClick}
      />

      <ChatArea 
        session={session}
        view={view}
        activeDm={activeDm}
        activeChannel={activeChannel}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        homeTab={homeTab}
        setHomeTab={setHomeTab}
        friendRequests={friendRequests}
        onlineFriends={onlineFriends}
        allFriends={allFriends}
        selectDm={selectDm}
        startCall={webRTCProps.startCall}
        toggleRightSidebar={toggleRightSidebar}
        rightTab={rightTab}
        showRightSidebar={showRightSidebar}
        currentWallpaper={currentWallpaper}
        currentThemeHex={currentThemeHex}
        wallpaperCSS={wallpaperCSS}
        wallpaperSize={currentWallpaperConfig.size}
        wallpaperRepeat={currentWallpaperConfig.repeat}
        wallpaperPosition={currentWallpaperConfig.position}
        isBlocked={isBlocked}
        blockReason={blockReason}
        blockedUsersSet={blockedUsersSet}
        scopedChatStyle={scopedChatStyle}
        isChatActive={isChatActive}
        handleAcceptRequest={handleAcceptRequest}
        handleDeclineRequest={handleDeclineRequest}
        dmActionMenuId={dmActionMenuId}
        setDmActionMenuId={setDmActionMenuId}
        setConfirmAction={setConfirmAction}
        restrictedUsersSet={restrictedUsersSet}
        onlineUsersSet={onlineUsersSet}
        userPresence={userPresence}
        getPresenceStatus={getPresenceStatus}
        getPresenceLabel={getPresenceLabel}
        {...chatManagerProps}
      />

      {showRightSidebar && isChatActive && (
        <RightSidebar 
          activeDm={activeDm}
          closeRightSidebar={closeRightSidebar}
          rightTab={rightTab}
          onlineUsersSet={onlineUsersSet}
          userPresence={userPresence}
          getPresenceStatus={getPresenceStatus}
          getPresenceLabel={getPresenceLabel}
          handleThemeChange={handleThemeChange}
          currentThemeHex={currentThemeHex}
          handleWallpaperChange={handleWallpaperChange}
          currentWallpaper={currentWallpaper}
          setConfirmAction={setConfirmAction}
          restrictedUsersSet={restrictedUsersSet}
          blockedUsersSet={blockedUsersSet}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          scrollToMessage={chatManagerProps.scrollToMessage}
          THEME_COLORS={THEME_COLORS}
          WALLPAPERS={WALLPAPERS}
          scopedChatStyle={scopedChatStyle}
          messages={chatManagerProps.validMessages}
          pinnedMessages={chatManagerProps.pinnedMessages}
          togglePinnedMessage={chatManagerProps.togglePinnedMessage}
          setSelectedImage={chatManagerProps.setSelectedImage}
        />
      )}

      {showQuickSwitcher && (
        <div className="premium-backdrop fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] sm:pt-[15vh] animate-fade-in px-4" onClick={() => setShowQuickSwitcher(false)}>
          <div className="premium-modal w-full max-w-md sm:max-w-xl md:max-w-2xl rounded-2xl flex flex-col overflow-hidden animate-quick-switch" onClick={e => e.stopPropagation()}>
            <div className="relative z-10 px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4 bg-[var(--surface-strong)] border-b border-[var(--border-subtle)]">
              <Search size={22} className="text-indigo-400 shrink-0" />
              <input type="text" autoFocus placeholder="Where would you like to go?" value={quickSwitcherQuery} onChange={(e) => setQuickSwitcherQuery(e.target.value)} className="w-full min-w-0 bg-transparent text-[var(--text-main)] outline-none text-base sm:text-xl font-display placeholder-gray-500" />
              <div className="hidden sm:block text-[10px] font-bold text-gray-500 bg-white/5 px-2 py-1 rounded-md border border-white/10 shrink-0 select-none">ESC</div>
            </div>
            
            <div className="relative z-10 max-h-[60vh] sm:max-h-[400px] overflow-y-auto p-2 sm:p-3 custom-scrollbar">
              {quickSwitcherQuery && quickSwitcherResults.length === 0 ? (
                 <div className="text-center py-12 flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl text-gray-600 mb-2">search_off</span>
                    <span className="text-gray-400 font-medium">No friends match that query.</span>
                 </div>
              ) : (
                <>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-2 mt-2">Friends & Conversations</div>
                  {quickSwitcherResults.map((dm, idx) => (
                    <button 
                      key={dm.dm_room_id ? `qs-${dm.dm_room_id}` : `qs-fallback-${idx}`} 
                      onClick={() => createOrOpenDm(dm)} 
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group cursor-pointer border border-transparent ${idx === 0 ? 'bg-indigo-500/10 border-indigo-500/20' : 'hover:bg-[var(--bg-base)] hover:border-[var(--border-subtle)]'}`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={getPresenceStatus(dm.profiles.id)} className="w-10 h-10" />
                        <div className="flex flex-col min-w-0">
                          <span className={`font-bold text-[15px] transition-colors ${idx === 0 ? 'text-indigo-400' : 'text-[var(--text-main)] group-hover:text-indigo-400'}`}>{dm.profiles.username}</span>
                          <span className="text-[11px] text-gray-500 font-mono tracking-wide">{dm.profiles.unique_tag}</span>
                        </div>
                      </div>
                      <div className={`hidden sm:flex opacity-0 transition-opacity items-center gap-1 text-[10px] font-bold uppercase text-gray-500 ${idx === 0 ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                        {dm.is_new_chat ? 'Start' : 'Jump To'} <CornerDownLeft size={12} className="text-indigo-400 ml-1" />
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="premium-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in" style={scopedChatStyle}>
          <div className="premium-modal w-full max-w-md rounded-2xl p-6">
            <h3 className="gradient-text relative z-10 text-xl font-semibold mb-2">
              {confirmAction.type === 'block' && `Block ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unblock' && `Unblock ${confirmAction.profile.username}?`}
              {confirmAction.type === 'restrict' && `Restrict ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unrestrict' && `Unrestrict ${confirmAction.profile.username}?`}
              {confirmAction.type === 'delete_dm' && `Delete conversation with ${confirmAction.profile.username}?`}
            </h3>
            <p className="relative z-10 text-gray-400 text-sm mb-8">
              {confirmAction.type === 'block' && "They won't be able to message you or see your online status."}
              {confirmAction.type === 'unblock' && "They will be able to message you again."}
              {confirmAction.type === 'restrict' && "We'll move the chat out of your main list."}
              {confirmAction.type === 'unrestrict' && "This chat will return to your main list."}
              {confirmAction.type === 'delete_dm' && "This removes the conversation from your list. Your friendship will remain intact."}
            </p>
            <div className="relative z-10 flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="premium-secondary-button flex-1 py-3 rounded-xl font-bold cursor-pointer">Cancel</button>
              <button onClick={executeConfirmAction} className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg focus-visible:ring-2 focus-visible:ring-white cursor-pointer ${confirmAction.type.includes('un') ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : 'premium-danger-button'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {chatManagerProps.selectedImage && (
        <div 
          className="premium-backdrop fixed inset-0 z-[400] flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => chatManagerProps.setSelectedImage(null)}
        >
          <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 pt-4">
            <div className="flex flex-col">
              <span className="text-white font-bold">{chatManagerProps.selectedImage.user}</span>
              <span className="text-gray-400 text-xs">{chatManagerProps.selectedImage.time}</span>
            </div>
            <button 
              className="text-white/50 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all cursor-pointer"
              onClick={(e) => { e.stopPropagation(); chatManagerProps.setSelectedImage(null); }}
            >
              <X size={24} />
            </button>
          </div>
          
            <img 
              src={chatManagerProps.selectedImage.url} 
              alt="Expanded view" 
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-[0_22px_70px_rgba(0,0,0,0.55)] cursor-default animate-slide-up"
              onClick={e => e.stopPropagation()} 
              decoding="async"
              fetchPriority="high"
            />
          
          <button 
            className="absolute bottom-8 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold text-sm backdrop-blur-md transition-colors border border-white/10 flex items-center gap-2 cursor-pointer shadow-lg mb-4"
            onClick={(e) => { 
              e.stopPropagation();
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = chatManagerProps.selectedImage.url;
              a.download = `messapp_image_${crypto.randomUUID().substring(0, 8)}.jpg`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              toast.success('Image download started')
            }}
          >
            <Download size={18} /> Save Image
          </button>
        </div>
      )}

      {showPinSetupPrompt && !showRecoveryPrompt && (
        <div className="premium-backdrop fixed inset-0 z-[500] flex items-center justify-center p-4 animate-fade-in text-[var(--text-main)]">
          <div className="premium-modal w-full max-w-md rounded-3xl p-6 md:p-8 text-center">
            <div className="premium-brand-mark relative z-10 w-16 h-16 text-white rounded-full flex items-center justify-center mb-6 mx-auto">
               <Key size={32} />
            </div>
            <h3 className="gradient-text relative z-10 text-2xl font-semibold mb-2 font-display">Secure Your Messages</h3>
            <p className="relative z-10 text-gray-400 text-sm mb-6 leading-relaxed">
              MessApp uses <strong>End-to-End Encryption</strong>. Before you can chat, create a 6-Digit PIN to securely back up your keys so you don't lose your messages if you clear your browser.
            </p>
            
            <input
              type="password"
              maxLength="6"
              value={setupPinInput}
              onChange={(e) => setSetupPinInput(e.target.value)}
              placeholder="••••••"
              className="premium-input relative z-10 w-48 rounded-xl p-4 text-white text-center tracking-[0.5em] font-mono text-2xl mb-6 outline-none transition-all mx-auto block"
            />
            
            <button
              onClick={async () => {
                if (setupPinInput.length !== 6 || isNaN(setupPinInput)) return toast.error('PIN must be exactly 6 digits.');
                const priv = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
                const pubKey = localStorage.getItem(`e2ee_public_key_${session.user.id}`);
                if (!priv) return toast.error('Fatal error: No local keys found. Refresh page.');

                const toastId = toast.loading('Encrypting and securing keys...');
                try {
                  const { encryptKeyWithPin } = await import('../lib/crypto');
                  const encryptedKey = await encryptKeyWithPin(setupPinInput, priv);
                  
                  const updatePayload = { encrypted_private_key: encryptedKey };
                  if (pubKey) updatePayload.public_key = pubKey;

                  const { error } = await supabase.from('profiles').update(updatePayload).eq('id', session.user.id);
                  if (error) throw error;
                  
                  toast.success('Security setup complete!', { id: toastId });
                  setShowPinSetupPrompt(false);
                } catch (_e) {
                  toast.error('Failed to secure keys.', { id: toastId });
                }
              }}
              className="premium-button relative z-10 w-full py-4 rounded-xl font-bold cursor-pointer"
            >
              Set PIN & Continue
            </button>
          </div>
        </div>
      )}

      {showRecoveryPrompt && (
        <div className="premium-backdrop fixed inset-0 z-[500] flex items-center justify-center p-4 animate-fade-in text-[var(--text-main)]">
          <div className="premium-modal w-full max-w-md rounded-3xl p-6 md:p-8 text-center">
            <div className="premium-brand-mark relative z-10 w-16 h-16 text-white rounded-full flex items-center justify-center mb-6 mx-auto">
               <Shield size={32} />
            </div>
            <h3 className="gradient-text relative z-10 text-2xl font-semibold mb-2 font-display">Enter Your PIN</h3>
            <p className="relative z-10 text-gray-400 text-sm mb-6 leading-relaxed">
              You are logging in from a new device. Enter your <strong>6-Digit PIN</strong> to unlock your Secure Storage and restore your messages.
            </p>
            
            <input
              type="password"
              maxLength="6"
              value={recoveryCodeInput}
              onChange={(e) => setRecoveryCodeInput(e.target.value)}
              placeholder="••••••"
              className="premium-input relative z-10 w-48 rounded-xl p-4 text-white text-center tracking-[0.5em] font-mono text-2xl mb-6 outline-none transition-all mx-auto block"
            />
            
            <div className="relative z-10 flex flex-col gap-3">
              <button
                onClick={async () => {
                  try {
                    if (recoveryCodeInput.length !== 6) throw new Error("Invalid PIN length");
                    const { data } = await supabase.from('profiles').select('encrypted_private_key, public_key').eq('id', session.user.id).single();
                    if (!data?.encrypted_private_key) throw new Error("No backup found");
                    
                    const { decryptKeyWithPin, importPrivateKey } = await import('../lib/crypto');
                    const decryptedKeyStr = await decryptKeyWithPin(recoveryCodeInput, data.encrypted_private_key);
                    
                    if (!decryptedKeyStr) throw new Error("Decryption failed");
                    
                    let parsedKey;
                    try {
                      parsedKey = JSON.parse(decryptedKeyStr);
                      if (!parsedKey.kty) throw new Error();
                      await importPrivateKey(parsedKey); 
                    } catch (_err) {
                      throw new Error("Incorrect PIN");
                    }
                    
                    localStorage.setItem(`e2ee_private_key_${session.user.id}`, decryptedKeyStr);
                    
                    const recoveredPubJwk = {
                      kty: parsedKey.kty,
                      crv: parsedKey.crv,
                      x: parsedKey.x,
                      y: parsedKey.y,
                      ext: true
                    };
                    localStorage.setItem(`e2ee_public_key_${session.user.id}`, JSON.stringify(recoveredPubJwk));

                    toast.success('Keys restored! Reloading system...');
                    setTimeout(() => window.location.reload(), 1000);
                  } catch (_e) {
                    toast.error('Incorrect PIN. Please try again.');
                  }
                }}
                className="premium-button w-full py-4 rounded-xl font-bold cursor-pointer"
              >
                Unlock & Enter
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(`e2ee_force_new_key_${session.user.id}`, 'true');
                  toast('Generating new keys...', { icon: '⚠️' });
                  setTimeout(() => window.location.reload(), 1000);
                }}
                className="premium-secondary-button w-full py-4 rounded-xl font-bold cursor-pointer"
              >
                Skip (Lose old messages)
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsModalConfig.isOpen && <UserSettingsModal session={session} settingsConfig={settingsModalConfig} setSettingsConfig={setSettingsModalConfig} onProfileUpdated={(updates) => {
        setProfileOverride(prev => {
          const next = { ...prev, ...updates }
          localStorage.setItem(profileCacheKey, JSON.stringify(next))
          return next
        })
      }} onClose={() => setSettingsModalConfig({ isOpen: false, tab: 'account', showMenu: true })} />}
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={() => {}} handleDelete={() => {}} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && <ChannelCreationModal handleCreate={() => {}} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={() => {}} handleDelete={() => {}} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}
