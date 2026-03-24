import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import imageCompression from 'browser-image-compression'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { createP2PSignalingChannel, createPeerConnection } from '../lib/p2pSignaling'
import { generateEcdhKeyPair, exportPublicKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm, encryptBinaryAesGcm, decryptBinaryAesGcm, fingerprintKey } from '../lib/crypto'
import { cacheMessage, cacheThumbnail } from '../lib/cacheManager'
import { Settings, Pen, Send, Plus, Hash, Compass, Home, Users, ImagePlus, Search, Info, X, Bell, Trash2, Check, UserPlus, MessageSquare, MoreVertical, Lock, User, Ban, EyeOff, CornerDownLeft, Edit3, Copy, LogOut, Menu } from 'lucide-react'

import AddFriendView from './modals/AddFriendView'
import ServerActionPopout from './modals/ServerActionPopout'
import ServerSettingsModal from './modals/ServerSettings'
import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'

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

// Atomic Memoized Component for Performance & Clean Message Rendering
const MemoizedMessage = React.memo(({ 
  m, isMe, showHeader, alignRight, isHighlighted, 
  isEditing, editContent, setEditContent, handleUpdateMessage, setEditingMessageId,
  inlineDeleteMessageId, inlineDeleteStep, setInlineDeleteMessageId, setInlineDeleteStep, executeInlineDelete
}) => {
  return (
    <div id={`message-${m.id}`} className={`flex gap-3 md:gap-4 group transition-all duration-500 ${showHeader ? 'mt-6 md:mt-8' : 'mt-1'} ${isHighlighted ? 'bg-[var(--theme-20)] p-2 -mx-2 rounded-xl shadow-[0_0_15px_var(--theme-20)] scale-[1.01] z-20' : ''} ${alignRight ? 'flex-row-reverse' : ''}`}>
      
      {/* Avatar Container */}
      {showHeader ? (
        <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-[#1c1e22] shrink-0 overflow-hidden shadow-md mt-1 ghost-border">
          {m.profiles?.avatar_url ? <img src={m.profiles?.avatar_url} className="h-full w-full object-cover" alt=""/> : <div className="h-full w-full flex items-center justify-center font-bold text-sm uppercase text-white" aria-hidden="true">{m.profiles?.username?.[0] || '?'}</div>}
        </div>
      ) : (
        <div className={`w-8 md:w-10 shrink-0 flex ${alignRight ? 'justify-start' : 'justify-center'} items-center opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 font-medium select-none hidden md:flex`}>
          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      
      {/* Message Content wrapper */}
      <div className={`flex flex-col w-full min-w-0 ${alignRight ? 'items-end' : ''}`}>
        
        {/* Username Header */}
        {showHeader && (
          <div className={`flex items-baseline gap-2 mb-1 ${alignRight ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[14px] md:text-[15px] font-bold tracking-tight ${isMe ? 'text-[var(--theme-base)]' : 'text-white'}`}>{m.profiles?.username}</span>
            <span className="text-[10px] text-gray-500 font-medium">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        
        {isEditing ? (
          <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1 w-full max-w-3xl">
            <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full bg-[#15171a] text-white px-4 py-3 rounded-xl ghost-border outline-none shadow-inner text-sm focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${alignRight ? 'text-right' : ''}`} autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
            <span className={`text-[10px] text-gray-500 mt-2 block ${alignRight ? 'text-right' : ''}`}>Press Enter to save, Esc to cancel</span>
          </form>
        ) : (
          /* Flex container to place actions directly beside the bubble */
          <div className={`flex items-center gap-2 max-w-full ${alignRight ? 'flex-row-reverse' : ''} mt-0.5`}>
            
            {/* Bubble & Image */}
            <div className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%] shrink-0`}>
              {m.is_deleted ? (
                <div className={`p-3 md:p-4 rounded-2xl border w-fit max-w-full ${alignRight ? 'rounded-tr-none border-[var(--theme-20)] text-gray-400/80' : 'rounded-tl-none border-[#23252a] text-gray-500'} bg-transparent border-dashed shadow-sm text-left flex items-center gap-2 select-none`}>
                  <Ban size={14} className="opacity-50" />
                  <span className="italic text-[13px] md:text-[14px]">This message was unsent.</span>
                </div>
              ) : (
                <>
                  {m.content && m.content.trim() !== '' && (
                    <div className={`p-3 md:p-4 rounded-2xl border w-fit max-w-full ${alignRight ? 'rounded-tr-none bg-[var(--theme-10)] border-[var(--theme-20)] text-white' : 'rounded-tl-none bg-[#15171a] border-[#23252a] text-gray-200'} shadow-sm backdrop-blur-md text-left`}>
                      <div className="leading-relaxed markdown-body text-[13px] md:text-[14px] break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ inline, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 ghost-border text-sm shadow-lg bg-[#0d0f12]" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                              ) : (
                                <code className="bg-black/50 text-[var(--theme-base)] px-1.5 py-0.5 rounded-md font-mono text-[12px] border border-white/5" {...props}>{children}</code>
                              )
                            },
                            a({...props}) { return <a className="text-[var(--theme-base)] hover:underline underline-offset-2" target="_blank" rel="noreferrer" {...props} /> }
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {m.image_url && (
                    <a href={m.image_url} target="_blank" rel="noreferrer" className={`block ${m.content ? 'mt-2' : ''} w-full max-w-xs md:max-w-sm rounded-xl overflow-hidden ghost-border hover:opacity-90 transition-opacity shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] focus-visible:outline-none`}><img src={m.image_url} alt="User attachment" className="w-full h-auto object-cover" /></a>
                  )}
                </>
              )}
            </div>

            {/* Inline Action Menu (Properly Anchored using Flexbox) */}
            {!m.is_deleted && (
              <div className={`flex items-center gap-1 opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 ${inlineDeleteMessageId === m.id ? 'opacity-100' : ''}`}>
                {inlineDeleteMessageId === m.id ? (
                  <div className="flex items-center gap-1 bg-[#15171a] border border-[#23252a] px-2 py-1 rounded-full shadow-sm animate-fade-in">
                    {inlineDeleteStep === 'options' && (
                      <>
                        {isMe && <button onClick={() => setInlineDeleteStep('confirm_everyone')} className="text-[10px] font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors cursor-pointer">Unsend</button>}
                        <button onClick={() => setInlineDeleteStep('confirm_me')} className="text-[10px] font-bold text-gray-400 hover:text-white px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap">Hide</button>
                        <div className="w-[1px] h-3 bg-[#23252a] mx-1"></div>
                        <button onClick={() => setInlineDeleteMessageId(null)} className="text-gray-500 hover:text-white p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </>
                    )}
                    {inlineDeleteStep === 'confirm_everyone' && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-red-400 whitespace-nowrap">Unsend?</span>
                        <button onClick={() => executeInlineDelete(m, 'everyone')} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white p-1 rounded-full transition-colors cursor-pointer"><Check size={12}/></button>
                        <button onClick={() => setInlineDeleteStep('options')} className="text-gray-500 hover:text-white p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </div>
                    )}
                    {inlineDeleteStep === 'confirm_me' && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">Hide?</span>
                        <button onClick={() => executeInlineDelete(m, 'me')} className="bg-white/10 text-white hover:bg-white/20 p-1 rounded-full transition-colors cursor-pointer"><Check size={12}/></button>
                        <button onClick={() => setInlineDeleteStep('options')} className="text-gray-500 hover:text-white p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {isMe && (
                      <button onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); }} className="p-1.5 text-gray-500 hover:text-white bg-[#15171a] md:bg-transparent md:hover:bg-[#23252a] rounded-full transition-colors cursor-pointer" title="Edit"><Pen size={14} aria-hidden="true" /></button>
                    )}
                    <button onClick={() => { setInlineDeleteMessageId(m.id); setInlineDeleteStep('options') }} className="p-1.5 text-gray-500 hover:text-red-400 bg-[#15171a] md:bg-transparent md:hover:bg-red-500/10 rounded-full transition-colors cursor-pointer" title="Hide/Delete"><Trash2 size={14} aria-hidden="true" /></button>
                  </>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
})

export default function Dashboard({ session }) {
  const [view, setView] = useState('home')
  const [homeTab, setHomeTab] = useState('online') 
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [dms, setDms] = useState([])
  const [activeDm, setActiveDm] = useState(null)

  const [onlineUsers, setOnlineUsers] = useState([])
  const [serverMembers, setServerMembers] = useState([])
  const [channelReads, setChannelReads] = useState({})
  const [friendRequests, setFriendRequests] = useState([])
  
  const [blockedUsers, setBlockedUsers] = useState(() => JSON.parse(localStorage.getItem(`blocked_${session.user.id}`) || '[]')) 
  const [restrictedUsers, setRestrictedUsers] = useState(() => JSON.parse(localStorage.getItem(`restricted_${session.user.id}`) || '[]'))
  const [localDeletedMessages, setLocalDeletedMessages] = useState(() => JSON.parse(localStorage.getItem(`deleted_msgs_${session.user.id}`) || '[]'))

  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [rightTab, setRightTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')

  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  const [serverAction, setServerAction] = useState(null)
  const [showProfilePopout, setShowProfilePopout] = useState(false)
  const [settingsModalConfig, setSettingsModalConfig] = useState({ isOpen: false, tab: 'account' })
  const popoutRef = useRef(null)
  
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) 

  const [serverSettingsName, setServerSettingsName] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [channelSettingsName, setChannelSettingsName] = useState('')
  
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  
  const [inlineDeleteMessageId, setInlineDeleteMessageId] = useState(null)
  const [inlineDeleteStep, setInlineDeleteStep] = useState('options') 
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const messageCacheRef = useRef({})

  const myAvatar = session.user.user_metadata?.avatar_url
  const myUsername = session.user.user_metadata?.username || session.user.email.split('@')[0]
  const myTag = session.user.user_metadata?.unique_tag || `${myUsername}#0000`

  useEffect(() => { localStorage.setItem(`blocked_${session.user.id}`, JSON.stringify(blockedUsers)) }, [blockedUsers, session.user.id])
  useEffect(() => { localStorage.setItem(`restricted_${session.user.id}`, JSON.stringify(restrictedUsers)) }, [restrictedUsers, session.user.id])
  useEffect(() => { localStorage.setItem(`deleted_msgs_${session.user.id}`, JSON.stringify(localDeletedMessages)) }, [localDeletedMessages, session.user.id])

  const selectDm = useCallback((dm) => {
    setActiveDm(dm)
    setMobileMenuOpen(false)
    if (dm) localStorage.setItem(`last_dm_${session.user.id}`, dm.dm_room_id)
    else localStorage.removeItem(`last_dm_${session.user.id}`)
  }, [session.user.id])

  const fetchSurroundingMessages = async (targetMessage) => {
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    const { data: olderMessages, error: olderError } = await supabase.from('messages').select('*, profiles(username, avatar_url)').eq(field, targetId).lt('created_at', targetMessage.created_at).order('created_at', { ascending: false }).limit(20)
    const { data: newerMessages, error: newerError } = await supabase.from('messages').select('*, profiles(username, avatar_url)').eq(field, targetId).gte('created_at', targetMessage.created_at).order('created_at', { ascending: true }).limit(20)

    if (!olderError && !newerError) {
      const combinedMessages = [...(olderMessages || []).reverse(), ...(newerMessages || [])]
      setMessages(combinedMessages)
      messageCacheRef.current[targetId] = combinedMessages
      
      setTimeout(() => {
        const messageElement = document.getElementById(`message-${targetMessage.id}`)
        if (messageElement && scrollContainerRef.current) {
          messageElement.scrollIntoView({ behavior: 'auto', block: 'center' })
          setHighlightedMessageId(targetMessage.id)
          setTimeout(() => setHighlightedMessageId(null), 2500)
        }
      }, 100)
    } else toast.error("Failed to load message context.")
  }

  const scrollToMessage = async (message) => {
    const messageElement = document.getElementById(`message-${message.id}`)
    if (messageElement && scrollContainerRef.current) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(message.id)
      setTimeout(() => setHighlightedMessageId(null), 2500)
    } else {
      await fetchSurroundingMessages(message)
    }
  }

  useEffect(() => {
    const syncProfile = async () => {
      if (session?.user?.id && session?.user?.user_metadata) {
        const { username, unique_tag, avatar_url } = session.user.user_metadata
        await supabase.from('profiles').upsert({ id: session.user.id, username: username || session.user.email.split('@')[0], unique_tag: unique_tag, avatar_url: avatar_url || null }, { onConflict: 'id' }) 
      }
    }
    syncProfile()
    fetchServers()
    fetchDms()
    fetchFriendRequests()
    
    const presenceChannel = supabase.channel('global-presence')
    presenceChannel.on('presence', { event: 'sync' }, () => setOnlineUsers(Object.keys(presenceChannel.presenceState()))).subscribe(async (status) => { if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: session.user.id }) })
    const requestsSub = supabase.channel('friend-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${session.user.id}` }, fetchFriendRequests).subscribe()

    return () => { supabase.removeChannel(presenceChannel); supabase.removeChannel(requestsSub) }
  }, [session]) 

  useEffect(() => {
    const roomSub = supabase.channel('dm-rooms-updates').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_rooms' }, (payload) => {
         setDms(current => current.map(dm => dm.dm_room_id === payload.new.id ? { ...dm, dm_rooms: { theme_color: payload.new.theme_color, wallpaper: payload.new.wallpaper } } : dm))
         if (activeDm && activeDm.dm_room_id === payload.new.id) setActiveDm(prev => ({ ...prev, dm_rooms: { theme_color: payload.new.theme_color, wallpaper: payload.new.wallpaper } }))
      }).subscribe()
    return () => supabase.removeChannel(roomSub)
  }, [activeDm])

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setShowQuickSwitcher(true) }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoutRef.current && !popoutRef.current.contains(event.target)) {
        setShowProfilePopout(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchFriendRequests = async () => {
    const { data } = await supabase.from('friendships').select('id, sender_id, profiles!fk_sender(username, avatar_url, unique_tag)').eq('receiver_id', session.user.id).eq('status', 'pending')
    if (data) setFriendRequests(data)
  }

  const handleAcceptRequest = async (request) => {
    try {
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', request.id)
      const { data: newRoom } = await supabase.from('dm_rooms').insert([{}]).select().maybeSingle()
      if (newRoom) await supabase.from('dm_members').insert([{ dm_room_id: newRoom.id, profile_id: session.user.id }, { dm_room_id: newRoom.id, profile_id: request.sender_id }])
      fetchFriendRequests()
      fetchDms()
      toast.success("Friend request accepted!")
    } catch { toast.error("Failed to accept request.") }
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

  const handleThemeChange = async (colorHex) => {
    if (!activeDm) return;
    const updatedDm = { ...activeDm, dm_rooms: { ...(activeDm.dm_rooms || {}), theme_color: colorHex } }
    setActiveDm(updatedDm)
    setDms(current => current.map(dm => dm.dm_room_id === activeDm.dm_room_id ? updatedDm : dm))
    try { await supabase.from('dm_rooms').update({ theme_color: colorHex }).eq('id', activeDm.dm_room_id) } catch (e) { toast.error("Database block") }
  }

  const handleWallpaperChange = async (wallpaperId) => {
    if (!activeDm) return;
    const updatedDm = { ...activeDm, dm_rooms: { ...(activeDm.dm_rooms || {}), wallpaper: wallpaperId } }
    setActiveDm(updatedDm)
    setDms(current => current.map(dm => dm.dm_room_id === activeDm.dm_room_id ? updatedDm : dm))
    try { await supabase.from('dm_rooms').update({ wallpaper: wallpaperId }).eq('id', activeDm.dm_room_id) } catch (e) { toast.error("Database block") }
  }

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, profile } = confirmAction;
    if (type === 'block') { setBlockedUsers(prev => [...prev, profile.id]); toast.error(`Blocked ${profile.username}`, { icon: '🚫' }); } 
    else if (type === 'unblock') { setBlockedUsers(prev => prev.filter(id => id !== profile.id)); toast.success(`Unblocked ${profile.username}`); } 
    else if (type === 'restrict') { setRestrictedUsers(prev => [...prev, profile.id]); toast.success(`Restricted ${profile.username}`, { icon: '🤫' }); } 
    else if (type === 'unrestrict') { setRestrictedUsers(prev => prev.filter(id => id !== profile.id)); toast.success(`Unrestricted ${profile.username}`); }
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
    const { data: otherMembers } = await supabase.from('dm_members').select('dm_room_id, dm_rooms (theme_color, wallpaper), profiles!inner(id, username, avatar_url, unique_tag)').in('dm_room_id', roomIds).neq('profile_id', session.user.id)
      
    if (otherMembers) {
      const uniqueDms = Array.from(new Map(otherMembers.map(item => [item.dm_room_id, item])).values())
      setDms(uniqueDms)
      const lastDmId = localStorage.getItem(`last_dm_${session.user.id}`)
      if (lastDmId && view === 'home') {
        const lastOpenDm = uniqueDms.find(d => d.dm_room_id === lastDmId);
        if (lastOpenDm) setActiveDm(lastOpenDm);
      }
    }
  }

  const handleHomeClick = () => { setView('home'); setHomeTab('online'); setActiveServer(null); setActiveChannel(null); selectDm(null); closeRightSidebar(); setMobileMenuOpen(false); }

  useEffect(() => {
    if (view === 'server' && activeServer) {
      const getServerData = async () => {
        const [channelsRes, membersRes, readsRes] = await Promise.all([
          supabase.from('channels').select('*').eq('server_id', activeServer.id).order('created_at', { ascending: true }),
          supabase.from('server_members').select('role, profiles!inner(id, username, avatar_url)').eq('server_id', activeServer.id),
          supabase.from('channel_reads').select('channel_id, last_read_at').eq('profile_id', session.user.id)
        ])
        setChannels(channelsRes.data || [])
        if (channelsRes.data?.length > 0) setActiveChannel(channelsRes.data[0])
        if (membersRes.data) setServerMembers(membersRes.data)
        if (readsRes.data) {
          const readsMap = {}
          readsRes.data.forEach(r => readsMap[r.channel_id] = r.last_read_at)
          setChannelReads(readsMap)
        }
      }
      getServerData()
    }
  }, [activeServer?.id, view, session.user.id])

  useEffect(() => {
    if (view !== 'server' || !activeServer) return
    const channelSub = supabase.channel('server-channels-updates').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels', filter: `server_id=eq.${activeServer.id}` }, (payload) => {
         setChannels(current => current.map(c => c.id === payload.new.id ? { ...c, last_message_at: payload.new.last_message_at } : c))
      }).subscribe()
    return () => supabase.removeChannel(channelSub)
  }, [activeServer?.id, view])

  const fetchCurrentMessages = useCallback(async () => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) return;

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const { data, error } = await supabase.from('messages').select('*, profiles(username, avatar_url)').eq(field, targetId).order('created_at', { ascending: true }).limit(50)
    
    if (data) {
      setMessages(data)
      messageCacheRef.current[targetId] = data
    }
    setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 100)
  }, [activeChannel?.id, activeDm?.dm_room_id, view])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchCurrentMessages()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchCurrentMessages])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) { setMessages([]); return; }
    
    if (messageCacheRef.current[targetId]) {
      setMessages(messageCacheRef.current[targetId])
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 10)
    } else {
      setMessages([])
    }

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    fetchCurrentMessages() 

    const sub = supabase.channel('chat-room').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      if (payload.eventType === 'INSERT' && payload.new[field] === targetId) {
        const newMsg = payload.new
        if (newMsg.profile_id === session.user.id) newMsg.profiles = { username: session.user.user_metadata.username, avatar_url: session.user.user_metadata.avatar_url }
        
        setMessages(prev => {
          const updated = [...prev, newMsg]
          messageCacheRef.current[targetId] = updated
          return updated
        })
        
        if (newMsg.profile_id !== session.user.id && localStorage.getItem('soundEnabled') !== 'false') {
          new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(()=> {})
        }
        
        setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
      }
      if (payload.eventType === 'UPDATE' && payload.new[field] === targetId) {
        setMessages(current => {
          const updated = current.map(msg => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg)
          messageCacheRef.current[targetId] = updated
          return updated
        })
      }
      if (payload.eventType === 'DELETE') {
        setMessages(current => {
          const updated = current.filter(msg => msg.id !== payload.old.id)
          messageCacheRef.current[targetId] = updated
          return updated
        })
      }
    }).subscribe()

    return () => supabase.removeChannel(sub)
  }, [activeChannel?.id, activeDm?.dm_room_id, view, session.user.id, session.user.user_metadata, fetchCurrentMessages])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const text = newMessage.trim()
    setNewMessage('')
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    try {
      const { data, error } = await supabase.from('messages').insert([{ profile_id: session.user.id, content: text, [field]: targetId }])
      if (error) throw error
      cacheMessage(targetId, { content: text, created_at: new Date().toISOString() })
    } catch {
      toast.error('Failed to send message.')
      setNewMessage(text)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsUploading(true)
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 }
      toast('Optimizing image...', { icon: '🪄', id: 'compress-toast' })
      const compressedFile = await imageCompression(file, options)
      toast.dismiss('compress-toast')

      const fileExt = compressedFile.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${session.user.id}/${fileName}`
      
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, compressedFile)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath)
      
      const field = view === 'server' ? 'channel_id' : 'dm_room_id'
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
      
      if (!targetId) return toast.error('Select a channel or DM before sending images.')
      await supabase.from('messages').insert([{ profile_id: session.user.id, content: '', image_url: publicUrl, [field]: targetId }])
      cacheThumbnail(targetId || 'global', publicUrl)
      toast.success('Image optimized and uploaded')
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
    } catch (error) { toast.error('Failed to upload image') } 
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleUpdateMessage = useCallback(async (e, id) => {
    e.preventDefault()
    if (!editContent.trim()) return
    try {
      await supabase.from('messages').update({ content: editContent.trim() }).eq('id', id)
      setEditingMessageId(null)
      toast.success("Message updated")
    } catch { toast.error("Failed to update message") }
  }, [editContent])

  const executeInlineDelete = useCallback(async (message, mode) => {
    try {
      if (mode === 'everyone') {
        const { error } = await supabase.from('messages').update({ is_deleted: true, content: '', image_url: null }).eq('id', message.id)
        if (error) throw error
        toast.success("Message unsent")
      } else {
        setLocalDeletedMessages(prev => [...prev, message.id])
        toast.success("Message hidden for you")
      }
    } catch { toast.error("Failed to delete message") }
    finally { 
      setInlineDeleteMessageId(null)
      setInlineDeleteStep('options')
    }
  }, [])

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e) } }
  const handleCreateServer = (e) => { e.preventDefault(); toast('Server features are currently in development!', { icon: '🚧' }) }

  const visibleMessages = messages.filter(m => !localDeletedMessages.includes(m.id))
  const searchResults = searchQuery ? visibleMessages.filter(m => !m.is_deleted && (m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase()))) : []
  
  const isBlocked = activeDm && blockedUsers.includes(activeDm.profiles.id)
  const isChatActive = (view === 'server' && activeChannel) || (view === 'home' && activeDm)

  const quickSwitcherResults = quickSwitcherQuery ? dms.filter(dm => dm.profiles.username.toLowerCase().includes(quickSwitcherQuery.toLowerCase()) && !restrictedUsers.includes(dm.profiles.id)) : dms.filter(dm => !restrictedUsers.includes(dm.profiles.id))
  
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
    <div className="flex h-screen w-screen bg-[#0d0f12] text-white overflow-hidden font-sans selection:bg-[var(--theme-50)] relative z-0">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      <Toaster position="top-center" toastOptions={{ style: { background: '#15171a', border: '1px solid #23252a', color: '#fff' } }} />
      
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <nav className="flex flex-col h-full w-20 bg-[#0d0f12] border-r border-[#23252a] py-4 items-center shrink-0 relative z-20">
          <div className="mb-6 group">
            <button onClick={handleHomeClick} className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${view === 'home' || view === 'notifications' ? 'text-white shadow-lg' : 'bg-[#15171a] text-indigo-500 hover:bg-white/10'}`} style={view === 'home' || view === 'notifications' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}}>
              <Home size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="w-8 h-[2px] bg-[#23252a] my-2 rounded-full shrink-0"></div>
          <div className="flex flex-col gap-4 items-center flex-1 overflow-y-auto custom-scrollbar w-full pt-2 pb-4 opacity-50 cursor-not-allowed">
            {servers.map(s => (
              <button key={s.id} className={`sidebar-icon group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none relative`}>
                <span className="font-headline font-bold text-lg">{s.name[0].toUpperCase()}</span>
              </button>
            ))}
          </div>
          
          <div className="mt-auto flex flex-col gap-4 items-center pt-4 border-t border-[#23252a] w-full shrink-0">
            <button onClick={() => setServerAction(serverAction === 'create' ? null : 'create')} className={`sidebar-icon group cursor-pointer transition-all ${serverAction === 'create' ? 'bg-indigo-500 text-white rounded-xl' : 'hover:bg-indigo-500 hover:text-white hover:rounded-xl text-gray-400'}`} title="Create Server">
              <Plus size={24} aria-hidden="true" />
            </button>
            <button onClick={() => setServerAction(serverAction === 'join' ? null : 'join')} className={`sidebar-icon group cursor-pointer transition-all ${serverAction === 'join' ? 'bg-green-500 text-white rounded-xl' : 'hover:bg-green-500 hover:text-white hover:rounded-xl text-gray-400'}`} title="Join Server">
              <Compass size={24} aria-hidden="true" />
            </button>
          </div>
        </nav>

        {serverAction && (
          <ServerActionPopout session={session} action={serverAction} onClose={() => setServerAction(null)} />
        )}

        <aside className="w-72 h-full bg-[#15171a] flex flex-col border-r border-[#23252a] shrink-0 z-10 shadow-xl relative" style={scopedChatStyle}>
          <header className="h-14 md:h-16 px-6 flex items-center justify-between border-b border-[#23252a] shrink-0 bg-[#0d0f12]/80 backdrop-blur-xl">
            <h2 className="font-headline font-bold text-white tracking-tight truncate">MESSAPP</h2>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8 px-4">
            {view === 'home' || view === 'notifications' ? (
              <div className="space-y-6">
                <button onClick={() => { setShowQuickSwitcher(true); setMobileMenuOpen(false); }} className="w-full bg-[#1c1e22] ghost-border text-white font-bold py-3.5 px-6 rounded-xl hover:bg-[#23252a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                  <Search size={18} aria-hidden="true" /> Find or Start
                </button>
                
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 block px-2">Direct Messages</span>
                  <div className="space-y-1">
                    {dms.map(dm => {
                      const isActive = activeDm?.dm_room_id === dm.dm_room_id && view === 'home';
                      const dmColor = dm.dm_rooms?.theme_color || '#6366f1';
                      return (
                        <button key={dm.dm_room_id} onClick={() => { setView('home'); selectDm(dm); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[#1c1e22] border-[#23252a] shadow-inner' : 'hover:bg-white/5 text-gray-400 hover:text-white border-transparent'}`}>
                          <div className="relative shrink-0">
                            <div className="h-8 w-8 rounded-full bg-[#23252a] flex items-center justify-center overflow-hidden ghost-border">
                              {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="h-full w-full object-cover" alt=""/> : <span className="font-bold text-xs uppercase text-white" aria-hidden="true">{dm.profiles.username[0]}</span>}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#15171a] rounded-full ${onlineUsers.includes(dm.profiles.id) ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium truncate transition-colors" style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 opacity-50 cursor-not-allowed">
                <div><div className="flex items-center justify-between px-2 mb-3"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Channels (WIP)</span></div><div className="text-xs text-gray-500 px-2">Servers are currently in development.</div></div>
              </div>
            )}
          </div>

          {showProfilePopout && (
            <div ref={popoutRef} className="absolute bottom-20 left-3 w-[264px] bg-[#111214] rounded-2xl border border-[#23252a] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden z-50 animate-fade-in">
              <div className="h-16 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
              <div className="px-4 pb-4">
                <div className="flex justify-between items-start">
                  <div className="relative -mt-8 mb-2">
                    <div className="w-16 h-16 rounded-full border-[6px] border-[#111214] bg-[#23252a] overflow-hidden flex items-center justify-center">
                       {myAvatar ? <img src={myAvatar} className="w-full h-full object-cover"/> : <span className="text-xl font-bold uppercase text-white">{myUsername[0]}</span>}
                    </div>
                    <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-[3px] border-[#111214] rounded-full"></div>
                  </div>
                </div>
                
                <div className="bg-[#1e1f22] p-3 rounded-xl mb-3 shadow-inner">
                  <h3 className="font-bold text-white text-lg leading-tight">{myUsername}</h3>
                  <p className="text-xs text-gray-400 font-mono">{myTag}</p>
                </div>

                <div className="space-y-1">
                  <button onClick={() => { setShowProfilePopout(false); setSettingsModalConfig({ isOpen: true, tab: 'account' }) }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#2b2d31] transition-colors cursor-pointer text-gray-300 hover:text-white">
                    <Edit3 size={16} /> <span className="text-sm font-medium">Edit Profile</span>
                  </button>
                  <div className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[#2b2d31] transition-colors cursor-pointer text-gray-300 hover:text-white">
                    <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-green-500 ml-0.5"></div> <span className="text-sm font-medium">Online</span></div>
                  </div>
                  <div className="h-[1px] bg-[#2b2d31] my-2"></div>
                  <button onClick={() => { navigator.clipboard.writeText(myTag); toast.success('ID Copied!'); setShowProfilePopout(false); }} className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[#2b2d31] transition-colors cursor-pointer text-gray-300 hover:text-white">
                    <div className="flex items-center gap-3"><Copy size={16} /> <span className="text-sm font-medium">Copy User ID</span></div>
                  </button>
                  <button onClick={() => { supabase.auth.signOut(); setShowProfilePopout(false); }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer text-red-400/80">
                    <LogOut size={16} /> <span className="text-sm font-medium">Log Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-[#0a0a0c] border-t border-[#23252a] flex items-center justify-between shrink-0">
            <button onClick={() => setShowProfilePopout(!showProfilePopout)} className="flex items-center gap-3 min-w-0 p-1.5 hover:bg-white/5 rounded-xl transition-colors text-left group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] flex-1 pr-2">
              <div className="h-9 w-9 rounded-full bg-[#23252a] flex items-center justify-center shrink-0 overflow-hidden relative">
                {myAvatar ? <img src={myAvatar} className="h-full w-full object-cover" alt=""/> : <span className="font-bold text-white text-xs" aria-hidden="true">{myUsername[0]}</span>}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#0a0a0c] rounded-full"></div>
              </div>
              <div className="flex flex-col truncate">
                <span className="text-[13px] font-bold text-white truncate group-hover:text-[var(--color-primary)] transition-colors">{myUsername}</span>
                <span className="text-[10px] text-gray-500 truncate">Online</span>
              </div>
            </button>
            
            <button onClick={() => setSettingsModalConfig({ isOpen: true, tab: 'appearance' })} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] cursor-pointer" aria-label="Application Settings" title="App Settings">
              <Settings size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>

      <main className="flex-1 flex flex-col min-w-0 relative bg-[#0d0f12]" style={scopedChatStyle}>
        <header className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6 bg-[#0d0f12]/80 backdrop-blur-xl border-b border-[#23252a] shrink-0 z-30 shadow-md">
          <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-gray-400 hover:text-white p-2 -ml-2 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
              <Menu size={24} />
            </button>
            {view === 'home' && !activeDm ? (
              <div className="flex items-center gap-4 md:gap-6 animate-fade-in w-full">
                <div className="flex items-center gap-2 md:gap-3 text-white font-bold"><Users size={20} className="text-gray-400 hidden sm:block" /><span className="hidden sm:inline">Friends</span></div>
                <div className="w-[1px] h-6 bg-[#23252a] hidden sm:block"></div>
                <div className="flex items-center gap-1 md:gap-2">
                  <button onClick={() => setHomeTab('online')} className={`px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer ${homeTab === 'online' ? 'bg-[#1c1e22] text-white ghost-border' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>Online</button>
                  <button onClick={() => setHomeTab('all')} className={`px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer ${homeTab === 'all' ? 'bg-[#1c1e22] text-white ghost-border' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>All</button>
                  <button onClick={() => setHomeTab('pending')} className={`px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer flex items-center gap-2 ${homeTab === 'pending' ? 'bg-[#1c1e22] text-white ghost-border' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>Pending {friendRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{friendRequests.length}</span>}</button>
                </div>
                <button 
                  onClick={() => { setHomeTab('add_friend'); selectDm(null); }} 
                  className={`ml-auto px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer hover:brightness-110 ${homeTab === 'add_friend' ? 'text-white shadow-lg' : 'bg-[#1c1e22] text-indigo-400 hover:bg-white/10'}`} 
                  style={homeTab === 'add_friend' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}}
                >
                  <UserPlus size={16} /> <span className="hidden sm:inline">Add Friend</span>
                </button>
              </div>
            ) : view === 'home' && activeDm ? (
              <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-dm-${activeDm.dm_room_id}`}>
                <span className="text-xl text-gray-500 font-light shrink-0">@</span><h2 className="font-headline font-bold text-white text-lg tracking-tight truncate">{activeDm.profiles.username}</h2>
              </div>
            ) : view === 'server' && activeChannel ? (
              <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-chan-${activeChannel.id}`}>
                <Hash size={20} className="text-gray-500 shrink-0" aria-hidden="true" />
                <h2 className="font-headline font-bold text-white text-lg tracking-tight truncate">{activeChannel.name}</h2>
              </div>
            ) : (
              <h2 className="font-headline font-bold text-transparent bg-clip-text text-xl tracking-tight shrink-0 truncate animate-fade-in" style={{ backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' }} key="header-dash">MESSY APPY</h2>
            )}
          </div>
          
          <div className="flex items-center gap-1 md:gap-2 shrink-0 ml-2 md:ml-4">
            {isChatActive && (
              <>
                <button onClick={() => toggleRightSidebar('search')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${rightTab === 'search' && showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-white/10 hover:text-[var(--theme-base)]'}`}><Search size={18} aria-hidden="true" /></button>
                <button onClick={() => toggleRightSidebar('info')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${rightTab === 'info' && showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-white/10 hover:text-[var(--theme-base)]'}`}><Info size={18} aria-hidden="true" /></button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10 relative" key={view + (activeChannel?.id || activeDm?.dm_room_id || '')}>
            
            {isChatActive && currentWallpaper !== 'default' && (
              <div className="absolute inset-0 pointer-events-none z-0 opacity-20" style={{ backgroundImage: wallpaperCSS, backgroundSize: currentWallpaper === 'doodles' ? '400px' : 'cover', backgroundPosition: 'center' }}/>
            )}

            {view === 'home' && !activeDm ? (
              <div className="flex-1 flex overflow-hidden bg-[#0d0f12]">
                
                {/* Center Panel wrapper */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {homeTab === 'add_friend' ? (
                    <AddFriendView session={session} />
                  ) : (
                    <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
                      <div className="bg-[#15171a] ghost-border rounded-xl flex items-center px-4 py-3 mb-6 shadow-inner focus-within:border-indigo-500 transition-colors">
                        <input id="dm-search-input" type="text" placeholder="Search for a conversation..." className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-gray-500" />
                        <Search size={18} className="text-gray-500 ml-2" />
                      </div>
                      
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                        {homeTab === 'online' && `Online — ${dms.filter(d => onlineUsers.includes(d.profiles.id) && !restrictedUsers.includes(d.profiles.id)).length}`}
                        {homeTab === 'all' && `All Friends — ${dms.filter(d => !restrictedUsers.includes(d.profiles.id)).length}`}
                        {homeTab === 'pending' && `Pending — ${friendRequests.length}`}
                      </div>

                      <div className="space-y-2">
                        {homeTab === 'pending' && friendRequests.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 opacity-50"><Bell size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">No pending friend requests.</p></div>
                        )}
                        {homeTab === 'pending' && friendRequests.map(req => (
                          <div key={req.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl group border-t border-transparent hover:border-white/5 transition-all">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-[#23252a] overflow-hidden border border-white/5">{req.profiles?.avatar_url ? <img src={req.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold uppercase">{req.profiles?.username?.[0]}</span>}</div>
                              <div><div className="font-bold text-white flex items-center gap-2">{req.profiles?.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{req.profiles?.unique_tag}</span></div><div className="text-xs text-gray-400">Incoming Friend Request</div></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleAcceptRequest(req)} className="p-2 sm:p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-green-500 hover:text-white transition-colors"><Check size={18} /></button>
                              <button onClick={() => handleDeclineRequest(req.id)} className="p-2 sm:p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-red-500 hover:text-white transition-colors"><X size={18} /></button>
                            </div>
                          </div>
                        ))}

                        {(homeTab === 'online' || homeTab === 'all') && dms.filter(d => (homeTab === 'all' || onlineUsers.includes(d.profiles.id)) && !restrictedUsers.includes(d.profiles.id)).length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 opacity-50"><Users size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">It's quiet in here.</p></div>
                        )}
                        {(homeTab === 'online' || homeTab === 'all') && dms.filter(d => (homeTab === 'all' || onlineUsers.includes(d.profiles.id)) && !restrictedUsers.includes(d.profiles.id)).map(dm => (
                          <div key={dm.dm_room_id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl group border-t border-transparent hover:border-white/5 cursor-pointer transition-all" onClick={() => selectDm(dm)}>
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div className="w-10 h-10 rounded-full bg-[#23252a] overflow-hidden border border-white/5">{dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold uppercase">{dm.profiles.username[0]}</span>}</div>
                                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-[3px] border-[#0d0f12] rounded-full ${onlineUsers.includes(dm.profiles.id) ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                              </div>
                              <div><div className="font-bold text-white flex items-center gap-2">{dm.profiles.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{dm.profiles.unique_tag}</span></div><div className="text-xs text-gray-400">{onlineUsers.includes(dm.profiles.id) ? 'Online' : 'Offline'}</div></div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-white/10 text-gray-300 transition-colors" onClick={(e) => { e.stopPropagation(); selectDm(dm); }}><MessageSquare size={18} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Side Active Now Panel - Independent Structural Pillar */}
                <div className="w-80 border-l border-[#23252a] hidden xl:flex flex-col bg-[#0d0f12] shrink-0" key="active-now-panel">
                  <div className="p-6 pb-4 shrink-0">
                    <h2 className="text-lg font-bold text-white font-display">Active Now</h2>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-4 pb-6">
                    {dms.filter(dm => onlineUsers.includes(dm.profiles.id) && !restrictedUsers.includes(dm.profiles.id)).length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500 border border-dashed border-[#23252a] rounded-2xl">It's quiet for now...</div>
                    ) : (
                      dms.filter(dm => onlineUsers.includes(dm.profiles.id) && !restrictedUsers.includes(dm.profiles.id)).map(dm => (
                        <div key={dm.dm_room_id} className="p-4 bg-[#15171a] rounded-xl ghost-border shadow-md cursor-pointer hover:border-indigo-500 transition-all" onClick={() => selectDm(dm)}>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-[#23252a] overflow-hidden border border-white/5">{dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold text-xs uppercase">{dm.profiles.username[0]}</span>}</div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#15171a] rounded-full bg-green-500 animate-pulse`}></div>
                            </div>
                            <span className="font-bold text-sm text-white">{dm.profiles.username}</span>
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 bg-[#0d0f12] p-2 rounded-lg shadow-inner"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online & Active</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 animate-fade-in relative z-10" ref={scrollContainerRef}>
                  {visibleMessages.length === 0 && (activeChannel || activeDm) && (
                    <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                      <h3 className="font-headline text-3xl font-bold tracking-tight mb-2 text-white">Welcome to {view === 'home' ? 'the beginning' : `#${activeChannel?.name}`}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">Your digital workspace is clear. Connect with your team or explore new horizons.</p>
                    </div>
                  )}

                  {visibleMessages.map((m, index) => {
                    const isMessageBlocked = blockedUsers.includes(m.profile_id);
                    if (isMessageBlocked) return (
                      <div key={m.id} className="text-center my-4"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-[#15171a] px-4 py-1.5 rounded-full ghost-border shadow-sm">Message Hidden (Blocked User)</span></div>
                    )

                    const showHeader = index === 0 || visibleMessages[index - 1].profile_id !== m.profile_id || new Date(m.created_at) - new Date(visibleMessages[index - 1].created_at) > 300000;
                    const isDM = view === 'home';
                    const isMe = m.profile_id === session.user.id;
                    const alignRight = isDM && isMe;
                    const isEditing = editingMessageId === m.id;
                    const isHighlighted = highlightedMessageId === m.id;
                    
                    return (
                      <MemoizedMessage 
                        key={m.id}
                        m={m}
                        isMe={isMe}
                        showHeader={showHeader}
                        alignRight={alignRight}
                        isHighlighted={isHighlighted}
                        isEditing={isEditing}
                        editContent={editContent}
                        setEditContent={setEditContent}
                        handleUpdateMessage={handleUpdateMessage}
                        setEditingMessageId={setEditingMessageId}
                        inlineDeleteMessageId={inlineDeleteMessageId}
                        inlineDeleteStep={inlineDeleteStep}
                        setInlineDeleteMessageId={setInlineDeleteMessageId}
                        setInlineDeleteStep={setInlineDeleteStep}
                        executeInlineDelete={executeInlineDelete}
                      />
                    )
                  })}
                  <div ref={messagesEndRef} className="h-4" />
                </div>

                {isBlocked ? (
                  <div className="p-4 mx-4 md:mx-6 mb-4 md:mb-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl font-bold text-sm shadow-inner z-10 relative">
                    You cannot reply to a blocked conversation. Unblock the user to send messages.
                  </div>
                ) : (
                  <div className="p-4 md:p-6 pt-0 shrink-0 bg-transparent z-10 relative">
                    <form onSubmit={handleSendMessage} className="bg-[#15171a] rounded-2xl ghost-border flex items-end gap-1 md:gap-2 p-1.5 md:p-2 focus-within:border-[var(--theme-50)] shadow-inner transition-colors">
                      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2.5 md:p-3 text-gray-500 hover:text-[var(--theme-base)] rounded-xl hover:bg-white/5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer">
                        {isUploading ? <Loader2 className="animate-spin text-[var(--theme-base)]" size={20} /> : <ImagePlus size={20} aria-hidden="true" />}
                      </button>
                      <textarea className="flex-1 bg-transparent border-none outline-none text-white resize-none py-2.5 md:py-3 custom-scrollbar text-[14px] md:text-[15px] font-body min-w-0 placeholder:text-gray-600" placeholder={`Message ${view === 'home' ? '@' + activeDm?.profiles?.username : '#' + activeChannel?.name}`} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} rows={1} style={{ minHeight: '44px', maxHeight: '200px' }} />
                      <button type="submit" disabled={!newMessage.trim() || isUploading} className="p-2.5 md:p-3 text-[var(--theme-base)] hover:text-[var(--theme-base)] rounded-xl hover:bg-[var(--theme-10)] transition-colors shrink-0 disabled:opacity-50 cursor-pointer">
                        <Send size={20} aria-hidden="true" />
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>

          {showRightSidebar && isChatActive && (
            <aside className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] md:relative md:w-80 md:max-w-none bg-[#15171a] border-l border-[#23252a] flex flex-col shrink-0 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-right" style={scopedChatStyle}>

              {rightTab === 'info' && view === 'home' && activeDm && (
                <div className="flex flex-col h-full overflow-hidden relative">
                  <button onClick={closeRightSidebar} className="absolute top-4 right-4 text-gray-500 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer z-10 focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                    <X size={20} aria-hidden="true" />
                  </button>

                  <div className="flex flex-col items-center pt-10 pb-6 px-6 text-center border-b border-[#23252a] shrink-0">
                    <div className="relative mb-3">
                      <div className="w-24 h-24 rounded-full bg-[#23252a] border-2 border-[var(--theme-base)] overflow-hidden flex items-center justify-center shadow-[0_0_15px_var(--theme-20)]">
                        {activeDm.profiles.avatar_url ? <img src={activeDm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="text-3xl font-bold uppercase text-white">{activeDm.profiles.username[0]}</span>}
                      </div>
                      {onlineUsers.includes(activeDm.profiles.id) && <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-[3px] border-[#15171a] rounded-full animate-pulse"></div>}
                    </div>
                    <h2 className="text-xl font-bold text-white">{activeDm.profiles.username}</h2>
                    <p className="text-xs text-[var(--theme-base)] font-mono mt-1">{activeDm.profiles.unique_tag}</p>

                    <div className="flex gap-4 mt-6">
                      <button className="flex flex-col items-center gap-1.5 group cursor-pointer"><div className="w-10 h-10 rounded-full bg-[#23252a] flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-[var(--theme-20)] transition-all"><User size={18}/></div><span className="text-[10px] text-gray-400 font-medium group-hover:text-white">Profile</span></button>
                      <button className="flex flex-col items-center gap-1.5 group cursor-pointer"><div className="w-10 h-10 rounded-full bg-[#23252a] flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-[var(--theme-20)] transition-all"><Bell size={18}/></div><span className="text-[10px] text-gray-400 font-medium group-hover:text-white">Mute</span></button>
                      <button onClick={() => toggleRightSidebar('search')} className="flex flex-col items-center gap-1.5 group cursor-pointer"><div className="w-10 h-10 rounded-full bg-[#23252a] flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-[var(--theme-20)] transition-all"><Search size={18}/></div><span className="text-[10px] text-gray-400 font-medium group-hover:text-white">Search</span></button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                    <div className="bg-[#1c1e22] rounded-xl overflow-hidden ghost-border p-4 space-y-5">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Customization</div>
                      <div>
                        <span className="text-xs font-bold text-gray-400 block mb-3">Message Color</span>
                        <div className="flex flex-wrap gap-2">
                          {THEME_COLORS.map(c => (
                            <button key={c.name} onClick={() => handleThemeChange(c.value)} title={c.name} className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${currentThemeHex === c.value ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`} style={{ backgroundColor: c.value }} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-400 block mb-3">Chat Wallpaper</span>
                        <div className="grid grid-cols-2 gap-2">
                          {WALLPAPERS.map(w => (
                            <button key={w.id} onClick={() => handleWallpaperChange(w.id)} className={`text-[10px] font-bold uppercase tracking-wide py-2 rounded-lg transition-all cursor-pointer ${currentWallpaper === w.id ? 'bg-[var(--theme-20)] text-[var(--theme-base)] border border-[var(--theme-50)] shadow-inner' : 'bg-black/20 text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'}`}>{w.name}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#1c1e22] rounded-xl overflow-hidden ghost-border">
                      <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#23252a]/50">Media & Files</div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left"><ImagePlus size={16} className="text-gray-400 group-hover:text-[var(--theme-base)]"/><span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">Media</span></button><div className="h-[1px] bg-white/5 mx-4"></div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left"><span className="material-symbols-outlined text-[16px] text-gray-400 group-hover:text-[var(--theme-base)]" aria-hidden="true">description</span><span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">Files</span></button>
                    </div>

                    <div className="bg-[#1c1e22] rounded-xl overflow-hidden ghost-border mb-6">
                      <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#23252a]/50">Privacy & Support</div>
                      <button onClick={() => setConfirmAction({ type: restrictedUsers.includes(activeDm.profiles.id) ? 'unrestrict' : 'restrict', profile: activeDm.profiles })} className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left">
                        <EyeOff size={16} className="text-gray-400 group-hover:text-white"/><span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">{restrictedUsers.includes(activeDm.profiles.id) ? 'Unrestrict' : 'Restrict'}</span>
                      </button><div className="h-[1px] bg-white/5 mx-4"></div>
                      <button onClick={() => setConfirmAction({ type: blockedUsers.includes(activeDm.profiles.id) ? 'unblock' : 'block', profile: activeDm.profiles })} className="w-full flex items-center gap-3 p-4 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                        <Ban size={16} className="text-red-400 group-hover:text-red-300"/><span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">{blockedUsers.includes(activeDm.profiles.id) ? `Unblock ${activeDm.profiles.username}` : `Block ${activeDm.profiles.username}`}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {rightTab === 'search' && (
                <div className="p-6 h-full flex flex-col overflow-hidden relative">
                  <button onClick={closeRightSidebar} className="absolute top-4 right-4 text-gray-500 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer z-10 focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                    <X size={20} aria-hidden="true" />
                  </button>

                  <div className="bg-[#0d0f12] ghost-border rounded-xl flex items-center px-4 py-3 mt-6 md:mt-8 mb-6 focus-within:border-[var(--theme-base)] shadow-inner transition-colors shrink-0">
                    <Search size={18} className="text-gray-500 mr-2 shrink-0" aria-hidden="true" />
                    <input type="text" placeholder="Search in chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-gray-600 font-medium min-w-0" autoFocus />
                  </div>
                  
                  {searchQuery && searchResults.length === 0 && <div className="text-center text-gray-500 text-sm mt-8">No messages match your query.</div>}
                  
                  {searchQuery && searchResults.length > 0 && (
                    <>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 shrink-0">{searchResults.length} Matches Found</div>
                      
                      <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 space-y-2 pb-4">
                        {searchResults.map(m => (
                          <button 
                            key={`search-res-${m.id}`}
                            onClick={() => scrollToMessage(m)}
                            className="w-full text-left p-3 bg-[#1c1e22] rounded-xl cursor-pointer hover:bg-white/10 border border-transparent hover:border-[var(--theme-50)] transition-all group focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none"
                          >
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-sm font-bold text-white group-hover:text-[var(--theme-base)] transition-colors truncate pr-2">{m.profiles?.username}</span>
                              <span className="text-[10px] text-gray-500 shrink-0">{new Date(m.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs text-gray-300 line-clamp-3 break-words">{m.content}</p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </main>

      {showQuickSwitcher && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-md animate-fade-in" onClick={() => setShowQuickSwitcher(false)}>
          <div className="bg-[#15171a]/95 w-full max-w-2xl rounded-2xl border border-[#23252a] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden animate-quick-switch" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center gap-4 bg-[#0d0f12]/50 border-b border-[#23252a]">
              <Search size={24} className="text-indigo-400 shrink-0" />
              <input type="text" autoFocus placeholder="Where would you like to go?" value={quickSwitcherQuery} onChange={(e) => setQuickSwitcherQuery(e.target.value)} className="w-full bg-transparent text-white outline-none text-xl font-display placeholder-gray-500" />
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
                      key={dm.dm_room_id} 
                      onClick={() => { setView('home'); selectDm(dm); setShowQuickSwitcher(false); setQuickSwitcherQuery('') }} 
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group cursor-pointer border border-transparent ${idx === 0 ? 'bg-indigo-500/10 border-indigo-500/20' : 'hover:bg-white/5 hover:border-white/10'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-[#0d0f12] overflow-hidden flex items-center justify-center border border-[#23252a]">
                            {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="w-full h-full object-cover" /> : <span className="text-white font-bold text-sm uppercase">{dm.profiles.username[0]}</span>}
                          </div>
                          {onlineUsers.includes(dm.profiles.id) && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#15171a] rounded-full"></div>}
                        </div>
                        <div className="flex flex-col">
                          <span className={`font-bold text-[15px] transition-colors ${idx === 0 ? 'text-indigo-400' : 'text-white group-hover:text-indigo-400'}`}>{dm.profiles.username}</span>
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
          <div className="bg-[#15171a] w-full max-w-md rounded-2xl border border-[#23252a] shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-2">
              {confirmAction.type === 'block' && `Block ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unblock' && `Unblock ${confirmAction.profile.username}?`}
              {confirmAction.type === 'restrict' && `Restrict ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unrestrict' && `Unrestrict ${confirmAction.profile.username}?`}
            </h3>
            <p className="text-gray-400 text-sm mb-8">
              {confirmAction.type === 'block' && "They won't be able to message you or see your online status."}
              {confirmAction.type === 'unblock' && "They will be able to message you again."}
              {confirmAction.type === 'restrict' && "We'll move the chat out of your main list."}
              {confirmAction.type === 'unrestrict' && "This chat will return to your main list."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-all focus-visible:ring-2 focus-visible:ring-white cursor-pointer">Cancel</button>
              <button onClick={executeConfirmAction} className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg focus-visible:ring-2 focus-visible:ring-white cursor-pointer ${confirmAction.type.includes('un') ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsModalConfig.isOpen && <UserSettingsModal session={session} initialTab={settingsModalConfig.tab} onClose={() => setSettingsModalConfig({ isOpen: false, tab: 'account' })} />}
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={handleUpdateServer} handleDelete={handleDeleteServer} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && <ChannelCreationModal handleCreate={handleCreateChannel} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={handleUpdateChannel} handleDelete={handleDeleteChannel} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}
