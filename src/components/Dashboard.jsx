import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { App as CapacitorApp } from '@capacitor/app'
import toast, { Toaster } from 'react-hot-toast'
import { Search, X, Download, Shield, Key } from 'lucide-react'

import { audioSys } from '../lib/SoundEngine'
import { useWebRTC } from '../hooks/useWebRTC'
import { useChatManager } from '../hooks/useChatManager'
import { useServerManager } from '../hooks/useServerManager'
import { useMessageReactions } from '../hooks/useMessageReactions'
import { usePWA } from '../hooks/usePWA'

import CallOverlay from './chat/CallOverlay'
import LeftSidebar from './layout/LeftSidebar'
import ServerSidebar from './layout/ServerSidebar'
import RightSidebar from './layout/RightSidebar'
import ChatArea from './layout/ChatArea'

import ServerActionPopout from './modals/ServerActionPopout'
import ServerSettingsModal from './modals/ServerSettings'
// import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'

import { generateEcdhKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey } from '../lib/crypto'
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
  { id: 'default', name: 'Clean Dark', css: 'none' },
  { id: 'doodles', name: 'Doodles', css: 'url("https://www.transparenttextures.com/patterns/connected.png")' },
  { id: 'galaxy', name: 'Galaxy', css: 'radial-gradient(circle at top right, rgba(76, 29, 149, 0.4) 0%, transparent 60%)' },
  { id: 'emerald', name: 'Emerald', css: 'radial-gradient(circle at bottom left, rgba(6, 78, 59, 0.4) 0%, transparent 60%)' }
]

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
  const [friendRequests, setFriendRequests] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([]) 
  const [restrictedUsers, setRestrictedUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`restricted_${session.user.id}`)) || [] } catch(e) { return [] }
  })
  const [deletedConversations, setDeletedConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`deleted_conversations_${session.user.id}`)) || [] } catch (e) { return [] }
  })
  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [rightTab, setRightTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [serverAction, setServerAction] = useState(null)
  const [showProfilePopout, setShowProfilePopout] = useState(false)
  
  const [settingsModalConfig, setSettingsModalConfig] = useState({ isOpen: false, tab: 'account', showMenu: true })
  
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

  const myAvatar = session.user.user_metadata?.avatar_url
  const myBanner = session.user.user_metadata?.banner_url
  const myBio = session.user.user_metadata?.bio
  const myPronouns = session.user.user_metadata?.pronouns
  const myUsername = session.user.user_metadata?.username || session.user.email.split('@')[0]
  const myTag = session.user.user_metadata?.unique_tag || `${myUsername}#0000`

  const chatManagerProps = useChatManager(session, activeChannel, activeDm, view, dms)
  const webRTCProps = useWebRTC(session, activeDm)
  const serverManagerProps = useServerManager(session)
  const messageReactionsProps = useMessageReactions(session)
  const pwaProps = usePWA()

  const stateRef = useRef({});
  const lastHomeClickRef = useRef(0);
  const acceptingRefs = useRef(new Set());
  const exitTimerRef = useRef(null);

  useEffect(() => {
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
    const theme = localStorage.getItem('appTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => { localStorage.setItem(`restricted_${session.user.id}`, JSON.stringify(restrictedUsers)) }, [restrictedUsers, session.user.id])
  useEffect(() => { localStorage.setItem(`deleted_conversations_${session.user.id}`, JSON.stringify(deletedConversations)) }, [deletedConversations, session.user.id])

  const createFreshDmRoom = useCallback(async (profile) => {
    try {
      const { data: newRoom, error: roomError } = await supabase.from('dm_rooms').insert([{}]).select().maybeSingle()
      if (roomError || !newRoom) throw roomError || new Error('Failed to create room')
      const { error: membersError } = await supabase.from('dm_members').insert([
        { dm_room_id: newRoom.id, profile_id: session.user.id },
        { dm_room_id: newRoom.id, profile_id: profile.id }
      ])
      if (membersError) throw membersError
      return {
        dm_room_id: newRoom.id,
        dm_rooms: { theme_color: null, wallpaper: null },
        profiles: profile
      }
    } catch (_err) {
      toast.error('Failed to start a new conversation')
      return null
    }
  }, [session.user.id])

  const selectDm = useCallback(async (dm) => {
    if (!dm) {
      setActiveDm(null)
      setMobileMenuOpen(false)
      localStorage.removeItem(`last_dm_${session.user.id}`)
      return
    }

    let nextDm = dm
    if (!dm.dm_room_id && dm.profiles?.id) {
      const createdDm = await createFreshDmRoom(dm.profiles)
      if (!createdDm) return
      setDms(prev => {
        const filtered = prev.filter(item => item.profiles?.id !== dm.profiles.id)
        return [...filtered, createdDm]
      })
      nextDm = createdDm
    }

    setActiveDm(nextDm)
    setMobileMenuOpen(false)
    if (nextDm.dm_room_id) localStorage.setItem(`last_dm_${session.user.id}`, nextDm.dm_room_id)
    else localStorage.removeItem(`last_dm_${session.user.id}`)
  }, [createFreshDmRoom, session.user.id])

  useEffect(() => {
    if (!session?.user?.id) return; 

    const syncProfile = async () => {
      if (session?.user?.id && session?.user?.user_metadata) {
        const { data: existingProfile } = await supabase.from('profiles').select('public_key, encrypted_private_key').eq('id', session.user.id).maybeSingle()

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
           } catch(e) {
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
          } catch(err) {}
        }
        pubKeyStr = pubKeyJwkStr || pubKeyStr;

        if (!encryptedPrivKey) {
            setShowPinSetupPrompt(true);
        }

        const { username, unique_tag, avatar_url, banner_url, bio, pronouns } = session.user.user_metadata
        await supabase.from('profiles').upsert({ 
          id: session.user.id, 
          username: username || session.user.email.split('@')[0], 
          unique_tag: unique_tag, 
          avatar_url: avatar_url || null, 
          banner_url: banner_url || null, 
          bio: bio || null, 
          pronouns: pronouns || null,
          public_key: pubKeyStr 
        }, { onConflict: 'id' }) 
      }
    }
    
    const fetchBlockedUsers = async () => {
      const { data } = await supabase.from('user_relationships').select('blocked_id').eq('blocker_id', session.user.id)
      if (data) setBlockedUsers(data.map(r => r.blocked_id))
    }

    syncProfile()
    fetchBlockedUsers()
    fetchServers()
    fetchDms()
    fetchFriendRequests()
    
    const presenceChannel = supabase.channel('global-presence')
    
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState()
      const activeUserIds = Object.values(state).flatMap(presences => presences.map(p => p.user_id))
      setOnlineUsers([...new Set(activeUserIds)])
    }).subscribe(async (status) => { 
      if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: session.user.id }) 
    })
    
    const requestsSub = supabase.channel('public:friendships').on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
         fetchFriendRequests();
         fetchDms();
    }).subscribe();

    const dmMembersSub = supabase.channel('public:dm_members').on('postgres_changes', { event: '*', schema: 'public', table: 'dm_members' }, () => {
         fetchDms();
    }).subscribe();

    return () => { 
      supabase.removeChannel(presenceChannel); 
      supabase.removeChannel(requestsSub);
      supabase.removeChannel(dmMembersSub);
    }
  }, [session]) 

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
        const roomId = confirmAction.dm_room_id;
        if (roomId) {
          setDeletedConversations(prev => prev.includes(roomId) ? prev : [...prev, roomId]);
          localStorage.removeItem(`local_chat_${roomId}`);
          if (activeDm?.dm_room_id === roomId) {
            setActiveDm(null);
            setView('home');
            setShowRightSidebar(false);
            localStorage.removeItem(`last_dm_${session.user.id}`);
          }
          await fetchDms();
        }
        toast.success("Conversation deleted for you");
      }
    } catch (_err) {
      toast.error("Failed to update user status or chat")
    }
    setConfirmAction(null);
  }

  const fetchServers = async () => {
    const { data } = await supabase.from('servers').select('*, server_members!inner(*)').eq('server_members.profile_id', session.user.id)
    if (data) setServers(data)
  }

  const fetchDms = async () => {
    const { data: myRooms } = await supabase.from('dm_members').select('dm_room_id').eq('profile_id', session.user.id)
    const roomIds = (myRooms || []).map(r => r.dm_room_id)

    let existingDms = []
    if (roomIds.length > 0) {
      const { data: otherMembers } = await supabase
        .from('dm_members')
        .select('dm_room_id, dm_rooms (theme_color, wallpaper), profiles!inner(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)')
        .in('dm_room_id', roomIds)
        .neq('profile_id', session.user.id)
      existingDms = (otherMembers || []).filter(item => !deletedConversations.includes(item.dm_room_id))
    }

    const [sentRes, receivedRes] = await Promise.all([
      supabase
        .from('friendships')
        .select('receiver_id, profiles!fk_receiver(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)')
        .eq('sender_id', session.user.id)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select('sender_id, profiles!fk_sender(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)')
        .eq('receiver_id', session.user.id)
        .eq('status', 'accepted')
    ])

    const friendProfiles = [
      ...((sentRes.data || []).map(row => row.profiles).filter(Boolean)),
      ...((receivedRes.data || []).map(row => row.profiles).filter(Boolean))
    ]

    const existingByProfileId = new Map(
      existingDms
        .filter(item => item?.profiles?.id)
        .map(item => [item.profiles.id, item])
    )

    const mergedFriends = Array.from(
      new Map(friendProfiles.map(profile => [profile.id, profile])).values()
    ).map(profile => (
      existingByProfileId.get(profile.id) || {
        dm_room_id: null,
        dm_rooms: { theme_color: null, wallpaper: null },
        profiles: profile
      }
    ))

    setDms(mergedFriends)
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
  const blockedUsersSet = useMemo(() => new Set(blockedUsers), [blockedUsers]);
  const allFriends = useMemo(() => dms.filter(dm => !restrictedUsersSet.has(dm.profiles.id)), [dms, restrictedUsersSet]);
  const onlineFriends = useMemo(() => allFriends.filter(dm => onlineUsersSet.has(dm.profiles.id)), [allFriends, onlineUsersSet]);

  const isBlocked = activeDm && blockedUsersSet.has(activeDm.profiles.id)
  const isChatActive = (view === 'server' && activeChannel) || (view === 'home' && activeDm)

  const quickSwitcherResults = quickSwitcherQuery ? allFriends.filter(dm => dm.profiles.username.toLowerCase().includes(quickSwitcherQuery.toLowerCase())) : allFriends
  const currentThemeHex = (activeDm?.dm_rooms?.theme_color || '#6366f1')
  const currentWallpaper = activeDm?.dm_rooms?.wallpaper || 'default'
  const wallpaperCSS = WALLPAPERS.find(w => w.id === currentWallpaper)?.css || 'none'

  const scopedChatStyle = isChatActive ? { 
    '--theme-base': currentThemeHex,
    '--theme-10': currentThemeHex + '1a',
    '--theme-20': currentThemeHex + '33',
    '--theme-50': currentThemeHex + '80',
  } : {
    '--theme-base': '#6366f1',
    '--theme-10': '#6366f11a',
    '--theme-20': '#6366f133',
    '--theme-50': '#6366f180',
  }

  return (
    <div className="flex h-[100dvh] w-full bg-[var(--bg-base)] text-[var(--text-main)] overflow-hidden font-sans selection:bg-[var(--theme-50)] relative z-0">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>

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
        wallpaperCSS={wallpaperCSS}
        isBlocked={isBlocked}
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
        {...chatManagerProps}
      />

      {showRightSidebar && isChatActive && (
        <RightSidebar 
          activeDm={activeDm}
          closeRightSidebar={closeRightSidebar}
          rightTab={rightTab}
          onlineUsersSet={onlineUsersSet}
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
        />
      )}

      {showQuickSwitcher && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-md animate-fade-in" onClick={() => setShowQuickSwitcher(false)}>
          <div className="bg-[var(--bg-surface)]/95 w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden animate-quick-switch" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center gap-4 bg-[var(--bg-base)]/50 border-b border-[var(--border-subtle)]">
              <Search size={24} className="text-indigo-400 shrink-0" />
              <input type="text" autoFocus placeholder="Where would you like to go?" value={quickSwitcherQuery} onChange={(e) => setQuickSwitcherQuery(e.target.value)} className="w-full bg-transparent text-[var(--text-main)] outline-none text-xl font-display placeholder-gray-500" />
              <div className="text-[10px] font-bold text-gray-500 bg-white/5 px-2 py-1 rounded-md border border-white/10 shrink-0 select-none">ESC</div>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto p-3 custom-scrollbar">
              {quickSwitcherQuery && quickSwitcherResults.length === 0 ? (
                 <div className="text-center py-12 flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl text-gray-600 mb-2">search_off</span>
                    <span className="text-gray-400 font-medium">No friends match that query.</span>
                 </div>
              ) : (
                <>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-2 mt-2">Previous Conversations</div>
                  {quickSwitcherResults.map((dm, idx) => (
                    <button 
                      key={dm.dm_room_id ? `qs-${dm.dm_room_id}` : `qs-fallback-${idx}`} 
                      onClick={() => { setView('home'); selectDm(dm); setShowQuickSwitcher(false); setQuickSwitcherQuery('') }} 
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group cursor-pointer border border-transparent ${idx === 0 ? 'bg-indigo-500/10 border-indigo-500/20' : 'hover:bg-[var(--bg-base)] hover:border-[var(--border-subtle)]'}`}
                    >
                      <div className="flex items-center gap-4">
                        <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={onlineUsersSet.has(dm.profiles.id)} className="w-10 h-10" />
                        <div className="flex flex-col">
                          <span className={`font-bold text-[15px] transition-colors ${idx === 0 ? 'text-indigo-400' : 'text-[var(--text-main)] group-hover:text-indigo-400'}`}>{dm.profiles.username}</span>
                          <span className="text-[11px] text-gray-500 font-mono tracking-wide">{dm.profiles.unique_tag}</span>
                        </div>
                      </div>
                      <div className={`opacity-0 transition-opacity flex items-center gap-1 text-[10px] font-bold uppercase text-gray-500 ${idx === 0 ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                        Jump To <CornerDownLeft size={12} className="text-indigo-400 ml-1" />
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" style={scopedChatStyle}>
          <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">
              {confirmAction.type === 'block' && `Block ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unblock' && `Unblock ${confirmAction.profile.username}?`}
              {confirmAction.type === 'restrict' && `Restrict ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unrestrict' && `Unrestrict ${confirmAction.profile.username}?`}
              {confirmAction.type === 'delete_dm' && `Delete conversation with ${confirmAction.profile.username}?`}
            </h3>
            <p className="text-gray-400 text-sm mb-8">
              {confirmAction.type === 'block' && "They won't be able to message you or see your online status."}
              {confirmAction.type === 'unblock' && "They will be able to message you again."}
              {confirmAction.type === 'restrict' && "We'll move the chat out of your main list."}
              {confirmAction.type === 'unrestrict' && "This chat will return to your main list."}
              {confirmAction.type === 'delete_dm' && "This removes this conversation and its messages only for you. Your friend keeps their full history, and messaging again starts a new chat."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-300 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-all focus-visible:ring-2 focus-visible:ring-white cursor-pointer">Cancel</button>
              <button onClick={executeConfirmAction} className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg focus-visible:ring-2 focus-visible:ring-white cursor-pointer ${confirmAction.type.includes('un') ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {chatManagerProps.selectedImage && (
        <div 
          className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in"
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
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl cursor-default animate-slide-up"
              onClick={e => e.stopPropagation()} 
              decoding="async"
              fetchPriority="high"
            />
          
          <button 
            className="absolute bottom-8 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold text-sm backdrop-blur-md transition-colors border border-white/10 flex items-center gap-2 cursor-pointer shadow-lg mb-4"
            onClick={(e) => { 
              e.stopPropagation();
              toast('Saving image...', { icon: '⬇️', id: 'save-toast' })
              fetch(chatManagerProps.selectedImage.url)
                .then(response => response.blob())
                .then(blob => {
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.style.display = 'none';
                  a.href = blobUrl;
                  a.download = `messapp_image_${crypto.randomUUID().substring(0, 8)}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(blobUrl);
                  toast.success('Image saved!', { id: 'save-toast' })
                })
                .catch(() => toast.error('Failed to download image', { id: 'save-toast' }));
            }}
          >
            <Download size={18} /> Save Image
          </button>
        </div>
      )}

      {showPinSetupPrompt && !showRecoveryPrompt && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in text-[var(--text-main)]">
          <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-3xl border border-indigo-500/50 shadow-[0_0_50px_rgba(99,102,241,0.15)] p-6 md:p-8 text-center">
            <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-6 mx-auto">
               <Key size={32} />
            </div>
            <h3 className="text-2xl font-bold mb-2 font-display">Secure Your Messages</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              MessApp uses <strong>End-to-End Encryption</strong>. Before you can chat, create a 6-Digit PIN to securely back up your keys so you don't lose your messages if you clear your browser.
            </p>
            
            <input
              type="password"
              maxLength="6"
              value={setupPinInput}
              onChange={(e) => setSetupPinInput(e.target.value)}
              placeholder="••••••"
              className="w-48 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 text-white text-center tracking-[0.5em] font-mono text-2xl mb-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 transition-all mx-auto block"
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
                } catch (e) {
                  toast.error('Failed to secure keys.', { id: toastId });
                }
              }}
              className="w-full py-4 rounded-xl font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-all shadow-lg cursor-pointer"
            >
              Set PIN & Continue
            </button>
          </div>
        </div>
      )}

      {showRecoveryPrompt && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in text-[var(--text-main)]">
          <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-3xl border border-[var(--border-subtle)] shadow-2xl p-6 md:p-8 text-center">
            <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-6 mx-auto shadow-[0_0_30px_rgba(99,102,241,0.3)]">
               <Shield size={32} />
            </div>
            <h3 className="text-2xl font-bold mb-2 font-display">Enter Your PIN</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              You are logging in from a new device. Enter your <strong>6-Digit PIN</strong> to unlock your Secure Storage and restore your messages.
            </p>
            
            <input
              type="password"
              maxLength="6"
              value={recoveryCodeInput}
              onChange={(e) => setRecoveryCodeInput(e.target.value)}
              placeholder="••••••"
              className="w-48 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 text-white text-center tracking-[0.5em] font-mono text-2xl mb-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 transition-all mx-auto block"
            />
            
            <div className="flex flex-col gap-3">
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
                    } catch (err) {
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
                  } catch (e) {
                    toast.error('Incorrect PIN. Please try again.');
                  }
                }}
                className="w-full py-4 rounded-xl font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-all shadow-lg cursor-pointer"
              >
                Unlock & Enter
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(`e2ee_force_new_key_${session.user.id}`, 'true');
                  toast('Generating new keys...', { icon: '⚠️' });
                  setTimeout(() => window.location.reload(), 1000);
                }}
                className="w-full py-4 rounded-xl font-bold text-gray-400 hover:text-white bg-[var(--bg-element)] hover:bg-[var(--border-subtle)] transition-all cursor-pointer"
              >
                Skip (Lose old messages)
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsModalConfig.isOpen && <UserSettingsModal session={session} settingsConfig={settingsModalConfig} setSettingsConfig={setSettingsModalConfig} onClose={() => setSettingsModalConfig({ isOpen: false, tab: 'account', showMenu: true })} />}
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={() => {}} handleDelete={() => {}} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && <ChannelCreationModal handleCreate={() => {}} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={() => {}} handleDelete={() => {}} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}
