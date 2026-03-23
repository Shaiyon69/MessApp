import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { cacheMessage, cacheThumbnail } from '../lib/cacheManager'
import { Settings, Pen, Send, LogOut, Plus, Hash, Compass, Home, Users, ImagePlus, Search, Info, X, Bell, Trash2, Check, UserPlus, MessageSquare, MoreVertical, Lock, User } from 'lucide-react'

import ServerCreationModal from './modals/ServerCreation'
import ServerSettingsModal from './modals/ServerSettings'
import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'
import JoinServerModal from './modals/JoinServer'
import StartDMModal from './modals/StartDirectMessages'

const THEME_COLORS = [
  { name: 'Indigo', value: '99 102 241' },
  { name: 'Pink', value: '241 153 247' },
  { name: 'Green', value: '16 185 129' },
  { name: 'Purple', value: '168 85 247' }
]

export default function Dashboard({ session }) {
  const [view, setView] = useState('home')
  const [homeTab, setHomeTab] = useState('online') 
  
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [dms, setDms] = useState([])
  const [activeDm, setActiveDm] = useState(null)
  const [activeTheme, setActiveTheme] = useState('99 102 241')

  const [onlineUsers, setOnlineUsers] = useState([])
  const [serverMembers, setServerMembers] = useState([])
  const [channelReads, setChannelReads] = useState({})
  const [friendRequests, setFriendRequests] = useState([])

  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [rightTab, setRightTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')

  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showDmModal, setShowDmModal] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)

  const [newServerName, setNewServerName] = useState('')
  const [serverSettingsName, setServerSettingsName] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [channelToEdit, setChannelToEdit] = useState(null)
  const [channelSettingsName, setChannelSettingsName] = useState('')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editContent, setEditContent] = useState('')

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const myAvatar = session.user.user_metadata?.avatar_url

  useEffect(() => {
    const syncProfile = async () => {
      if (session?.user?.id && session?.user?.user_metadata) {
        const { username, unique_tag, avatar_url } = session.user.user_metadata
        await supabase.from('profiles').upsert({
          id: session.user.id,
          username: username || session.user.email.split('@')[0],
          unique_tag: unique_tag,
          avatar_url: avatar_url || null
        }, { onConflict: 'id' }) 
      }
    }
    syncProfile()
    fetchServers()
    fetchDms()
    fetchFriendRequests()
    
    const presenceChannel = supabase.channel('global-presence')
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        setOnlineUsers(Object.keys(state))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: session.user.id })
        }
      })

    const requestsSub = supabase.channel('friend-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${session.user.id}` }, () => {
        fetchFriendRequests()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(presenceChannel)
      supabase.removeChannel(requestsSub)
    }
  }, [session]) 

  const fetchFriendRequests = async () => {
    const { data } = await supabase.from('friendships').select('id, sender_id, profiles!fk_sender(username, avatar_url, unique_tag)').eq('receiver_id', session.user.id).eq('status', 'pending')
    if (data) setFriendRequests(data)
  }

  const handleAcceptRequest = async (request) => {
    try {
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
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await supabase.from('friendships').delete().eq('id', requestId)
      fetchFriendRequests()
    } catch { toast.error("Failed to decline request.") }
  }

  const toggleRightSidebar = (tab) => {
    if (showRightSidebar && rightTab === tab) {
      setShowRightSidebar(false)
    } else {
      setShowRightSidebar(true)
      setRightTab(tab)
    }
  }

  const handleThemeChange = (colorValue) => {
    setActiveTheme(colorValue)
    document.documentElement.style.setProperty('--color-primary', `#${colorValue.replace(/ /g, '')}`)
    localStorage.setItem('dashboard-theme', colorValue)
  }

  const fetchServers = async () => {
    try {
      const { data, error } = await supabase.from('servers').select('*, server_members!inner(*)').eq('server_members.profile_id', session.user.id)
      if (error) throw error
      if (data) setServers(data)
    } catch { toast.error("Failed to load servers") }
  }

  const fetchDms = async () => {
    const { data: myRooms } = await supabase.from('dm_members').select('dm_room_id').eq('profile_id', session.user.id)
    if (!myRooms || myRooms.length === 0) { setDms([]); return }
    const roomIds = myRooms.map(r => r.dm_room_id)
    const { data: otherMembers } = await supabase.from('dm_members').select('dm_room_id, profiles!inner(id, username, avatar_url, unique_tag)').in('dm_room_id', roomIds).neq('profile_id', session.user.id)
    if (otherMembers) {
      const uniqueDms = Array.from(new Map(otherMembers.map(item => [item.dm_room_id, item])).values())
      setDms(uniqueDms)
    }
  }

  const handleServerClick = (server) => {
    toast('Servers are currently a Work in Progress!')
  }

  const handleHomeClick = () => {
    setView('home')
    setActiveServer(null)
    setActiveChannel(null)
    setActiveDm(null)
    setShowRightSidebar(false)
  }

  const handleNotificationsClick = () => {
    setView('notifications')
    setActiveServer(null)
    setActiveChannel(null)
    setActiveDm(null)
    setShowRightSidebar(false)
  }

  useEffect(() => {
    if (view === 'server' && activeServer) {
      const getServerData = async () => {
        try {
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
        } catch { toast.error("Failed to load server data") }
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

  useEffect(() => {
    if (view === 'server' && activeChannel) {
      const markAsRead = async () => {
        const now = new Date().toISOString()
        setChannelReads(prev => ({ ...prev, [activeChannel.id]: now }))
        await supabase.from('channel_reads').upsert({ profile_id: session.user.id, channel_id: activeChannel.id, last_read_at: now }, { onConflict: 'profile_id, channel_id' })
      }
      markAsRead()
    }
  }, [activeChannel?.id, activeChannel, view, messages, session.user.id])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) { setMessages([]); return; }
    
    setMessages([])
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'

    const fetchCurrentMessages = async () => {
      const { data, error } = await supabase.from('messages').select('*, profiles(username, avatar_url)').eq(field, targetId).order('created_at', { ascending: true }).limit(50)
      if (error) toast.error("Could not load messages")
      if (data) setMessages(data)
      
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100)
    }
    fetchCurrentMessages()

    const sub = supabase.channel('chat-room').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      if (payload.eventType === 'INSERT' && payload.new[field] === targetId) {
        const newMsg = payload.new
        if (newMsg.profile_id === session.user.id) {
          newMsg.profiles = { username: session.user.user_metadata.username, avatar_url: session.user.user_metadata.avatar_url }
        }
        setMessages(prev => [...prev, newMsg])
        
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
          }
        }, 50)
      }
      if (payload.eventType === 'UPDATE' && payload.new[field] === targetId) setMessages((current) => current.map((msg) => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg))
      if (payload.eventType === 'DELETE') setMessages((current) => current.filter((msg) => msg.id !== payload.old.id))
    }).subscribe()

    return () => supabase.removeChannel(sub)
  }, [activeChannel?.id, activeDm?.dm_room_id, view, session.user.id, session.user.user_metadata])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const text = newMessage.trim()
    setNewMessage('')

    if (view === 'server' && !activeChannel?.id) return toast.error('Select a channel first')
    if (view === 'home' && !activeDm?.dm_room_id) return toast.error('Select a direct message chat first')

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    try {
      const { data, error } = await supabase.from('messages').insert([{ profile_id: session.user.id, content: text, [field]: targetId }])
      if (error) throw error
      cacheMessage(targetId, { content: text, created_at: new Date().toISOString() })
      if (data?.[0]) setMessages((prev) => [...prev, data[0]])
      
      setTimeout(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
      }, 50)
    } catch {
      toast.error('Failed to send message. Please try again.')
      setNewMessage(text)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${session.user.id}/${fileName}`
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath)
      const field = view === 'server' ? 'channel_id' : 'dm_room_id'
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
      if (!targetId) { toast.error('Select a channel or DM before sending images.'); return; }
      await supabase.from('messages').insert([{ profile_id: session.user.id, content: '', image_url: publicUrl, [field]: targetId }])
      cacheThumbnail(targetId || 'global', publicUrl)
      toast.success('Image uploaded')
    } catch { toast.error('Failed to upload image') } 
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleUpdateMessage = async (e, id) => {
    e.preventDefault()
    if (!editContent.trim()) return
    try {
      const { error } = await supabase.from('messages').update({ content: editContent.trim() }).eq('id', id)
      if (error) throw error
      setEditingMessageId(null)
      toast.success("Message updated")
    } catch { toast.error("Failed to update message") }
  }

  const handleDeleteMessage = async (id) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', id)
      if (error) throw error
      toast.success("Message deleted")
    } catch { toast.error("Failed to delete message") }
  }

  const handleCreateServer = async (e) => {
    e.preventDefault()
    toast('Server creation is currently in development!')
  }

  const handleCreateChannel = async (e) => {
      e.preventDefault()
      if (!activeServer) return toast.error('Select a server first')
      const cleaned = newChannelName.trim().toLowerCase().replace(/\s+/g, '-')
      if (!cleaned) return toast.error('Channel name is required')
      try {
        const { data: channelData, error } = await supabase.from('channels').insert([{ server_id: activeServer.id, name: cleaned, type: 'text' }]).select().single()
        if (error) throw error
        setChannels((prev) => [...prev, channelData])
        setActiveChannel(channelData)
        setNewChannelName('')
        setShowChannelModal(false)
      } catch { toast.error('Could not create channel') }
  }
  
  const handleUpdateChannel = async (e) => {
      e.preventDefault()
      if (!channelSettingsName.trim()) return
      const selectedChannel = channelToEdit || activeChannel
      if (!selectedChannel) return
      const formattedName = channelSettingsName.trim().toLowerCase().replace(/\s+/g, '-')
      const { error } = await supabase.from('channels').update({ name: formattedName }).eq('id', selectedChannel.id)
      if (!error) {
        setChannels((prev) => prev.map(c => c.id === selectedChannel.id ? { ...c, name: formattedName } : c))
        if (activeChannel?.id === selectedChannel.id) setActiveChannel((prev) => ({ ...prev, name: formattedName }))
        setShowChannelSettings(false)
      }
  }
  
  const handleDeleteChannel = async () => {
      const selectedChannel = channelToEdit || activeChannel
      if (!selectedChannel) return
      try {
        const { error } = await supabase.from('channels').delete().eq('id', selectedChannel.id)
        if (error) throw error
        const remainingChannels = channels.filter(c => c.id !== selectedChannel.id)
        setChannels(remainingChannels)
        if (activeChannel?.id === selectedChannel.id) {
          setActiveChannel(remainingChannels[0] || null)
          if (remainingChannels[0]) setMessages([])
        }
      } catch { toast.error('Failed to delete channel') } 
      finally { setShowChannelSettings(false) }
  }
  
  const handleUpdateServer = async (e) => {
      e.preventDefault()
      toast('Server settings are currently in development!')
  }
  
  const handleDeleteServer = async () => {
      toast('Server deletion is currently in development!')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  const filteredMessages = searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase())) : messages
  const isChatActive = (view === 'server' && activeChannel) || (view === 'home' && activeDm)

  return (
    <div className="flex h-screen w-screen bg-[#0d0f12] text-white overflow-hidden font-sans selection:bg-indigo-500/30 relative z-0">
      
      {/* Ambient Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      <Toaster position="top-center" toastOptions={{ style: { background: '#15171a', border: '1px solid #23252a', color: '#fff' } }} />
      
      {/* 1. SIDE NAV BAR (Vertical Rail) */}
      <nav className="hidden md:flex flex-col h-full w-20 bg-[#0d0f12] border-r border-[#23252a] py-4 items-center shrink-0 z-50">
        <div className="mb-6 group">
          <button
            onClick={handleHomeClick}
            aria-label="Home Dashboard"
            title="Dashboard"
            className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${view === 'home' || view === 'notifications' ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-[#15171a] text-indigo-500 hover:bg-white/10'}`}
          >
            <Home size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="w-8 h-[2px] bg-[#23252a] my-2 rounded-full shrink-0"></div>

        <div className="flex flex-col gap-4 items-center flex-1 overflow-y-auto custom-scrollbar w-full pt-2 pb-4 opacity-50 cursor-not-allowed">
          {servers.map(s => (
            <button
              key={s.id}
              onClick={() => handleServerClick(s)}
              aria-label={`Open Server: ${s.name}`}
              title={s.name}
              className={`sidebar-icon group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none relative`}
            >
              <span className="font-headline font-bold text-lg">{s.name[0].toUpperCase()}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-4 items-center pt-4 border-t border-[#23252a] w-full shrink-0">
          <button 
            onClick={() => toast('Server creation is currently in development!')} 
            aria-label="Create new server (WIP)" 
            title="Create Server (WIP)"
            className="sidebar-icon group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none opacity-50 cursor-not-allowed"
          >
            <Plus size={24} className="text-gray-400 group-hover:text-white" aria-hidden="true" />
            <span className="sidebar-tooltip group-hover:scale-100 flex items-center gap-1"><Lock size={12}/> WIP: Create Server</span>
          </button>
          
          <button 
            onClick={() => toast('Server exploration is currently in development!')} 
            aria-label="Join server (WIP)" 
            title="Explore Servers (WIP)"
            className="sidebar-icon group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none opacity-50 cursor-not-allowed"
          >
            <Compass size={24} className="text-gray-400 group-hover:text-white" aria-hidden="true" />
            <span className="sidebar-tooltip group-hover:scale-100 flex items-center gap-1"><Lock size={12}/> WIP: Explore Servers</span>
          </button>
        </div>
      </nav>

      {/* 2. SECONDARY SIDEBAR (Channels / DMs) */}
      <aside className="w-72 h-full bg-[#15171a] flex flex-col border-r border-[#23252a] shrink-0 z-40 shadow-xl">
        <header className="h-16 px-6 flex items-center justify-between border-b border-[#23252a] shrink-0 bg-[#0d0f12]/80 backdrop-blur-xl">
          <h2 className="font-headline font-bold text-white tracking-tight truncate">
            {view === 'home' || view === 'notifications' ? 'MESSAPP' : activeServer?.name}
          </h2>
          {view === 'server' && activeServer?.owner_id === session.user.id && (
            <button 
              aria-label="Server Settings"
              title="Server Settings"
              onClick={() => toast('Server settings are currently in development!')} 
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shrink-0 cursor-pointer"
            >
              <Settings size={18} aria-hidden="true" />
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8 px-4">
          {view === 'home' || view === 'notifications' ? (
            <div className="space-y-6">
              <button 
                onClick={() => document.getElementById('dm-search-input')?.focus()} 
                aria-label="Start a conversation"
                className="w-full bg-[#1c1e22] ghost-border text-white font-bold py-3.5 px-6 rounded-xl hover:bg-[#23252a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none text-sm cursor-pointer"
              >
                <MessageSquare size={18} aria-hidden="true" /> Start Conversation
              </button>
              
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 block px-2">Direct Messages</span>
                <div className="space-y-1">
                  {dms.map(dm => (
                    <button 
                      key={dm.dm_room_id} 
                      onClick={() => { setView('home'); setActiveDm(dm); }} 
                      aria-label={`Direct message with ${dm.profiles.username}`}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${activeDm?.dm_room_id === dm.dm_room_id && view === 'home' ? 'bg-[#1c1e22] border-[#23252a] text-white shadow-inner' : 'hover:bg-white/5 text-gray-400 hover:text-white border-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none'}`}
                    >
                      <div className="relative shrink-0">
                        <div className="h-8 w-8 rounded-full bg-[#23252a] flex items-center justify-center overflow-hidden ghost-border">
                          {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="h-full w-full object-cover" alt=""/> : <span className="font-bold text-xs uppercase text-white" aria-hidden="true">{dm.profiles.username[0]}</span>}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#15171a] rounded-full ${onlineUsers.includes(dm.profiles.id) ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`text-sm font-medium truncate ${activeDm?.dm_room_id === dm.dm_room_id && view === 'home' ? 'text-indigo-400' : ''}`}>{dm.profiles.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 opacity-50 cursor-not-allowed">
              <div>
                <div className="flex items-center justify-between px-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Channels (WIP)</span>
                </div>
                <div className="text-xs text-gray-500 px-2">Servers are currently in development.</div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-[#0d0f12] border-t border-[#23252a] flex items-center gap-3 shrink-0">
          <button 
            aria-label="Open User Settings"
            onClick={() => setShowUserSettings(true)} 
            className="flex flex-1 items-center gap-3 min-w-0 p-1.5 hover:bg-white/5 rounded-xl transition-colors text-left group cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <div className="h-9 w-9 rounded-lg bg-[#23252a] ghost-border flex items-center justify-center shrink-0 overflow-hidden relative">
              {myAvatar ? <img src={myAvatar} className="h-full w-full object-cover" alt=""/> : <span className="font-bold text-white text-xs" aria-hidden="true">{session.user.user_metadata?.username?.charAt(0) || 'U'}</span>}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Settings size={16} className="text-white" aria-hidden="true" />
              </div>
            </div>
            <div className="flex flex-col truncate">
              <span className="text-[13px] font-bold text-white truncate">{session.user.user_metadata?.username}</span>
              <span className="text-[10px] text-gray-500 truncate">Online</span>
            </div>
          </button>
        </div>
      </aside>

      {/* 3. MAIN INTERFACE (Right) */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-[#0d0f12]">
        <header className="h-16 flex items-center justify-between px-6 bg-[#0d0f12]/80 backdrop-blur-xl border-b border-[#23252a] shrink-0 z-30 shadow-md">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {view === 'home' && !activeDm ? (
              <div className="flex items-center gap-6 animate-fade-in w-full">
                <div className="flex items-center gap-3 text-white font-bold">
                  <Users size={20} className="text-gray-400" />
                  Friends
                </div>
                <div className="w-[1px] h-6 bg-[#23252a]"></div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setHomeTab('online')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none cursor-pointer ${homeTab === 'online' ? 'bg-[#1c1e22] text-white ghost-border' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>Online</button>
                  <button onClick={() => setHomeTab('all')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none cursor-pointer ${homeTab === 'all' ? 'bg-[#1c1e22] text-white ghost-border' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>All</button>
                  <button onClick={() => setHomeTab('pending')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none cursor-pointer flex items-center gap-2 ${homeTab === 'pending' ? 'bg-[#1c1e22] text-white ghost-border' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                    Pending
                    {friendRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{friendRequests.length}</span>}
                  </button>
                </div>
                <button 
                  onClick={() => setShowDmModal(true)} 
                  className="ml-auto bg-gradient-to-r from-indigo-500 to-indigo-600 hover:brightness-110 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-white outline-none cursor-pointer"
                >
                  <UserPlus size={16} /> Add Friend
                </button>
              </div>
            ) : view === 'home' && activeDm ? (
              <div className="flex items-center gap-3 min-w-0 animate-fade-in" key={`header-dm-${activeDm.dm_room_id}`}>
                <span className="text-xl text-gray-500 font-light shrink-0">@</span>
                <h2 className="font-headline font-bold text-white text-lg tracking-tight truncate">{activeDm.profiles.username}</h2>
              </div>
            ) : view === 'server' && activeChannel ? (
              <div className="flex items-center gap-3 min-w-0 animate-fade-in" key={`header-chan-${activeChannel.id}`}>
                <Hash size={20} className="text-gray-500 shrink-0" aria-hidden="true" />
                <h2 className="font-headline font-bold text-white text-lg tracking-tight truncate">{activeChannel.name}</h2>
              </div>
            ) : (
              <h2 className="font-headline font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-indigo-600 text-xl tracking-tight shrink-0 truncate animate-fade-in" key="header-dash">MessApp Observatory</h2>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {isChatActive && (
              <>
                <button 
                  aria-label="Search Messages"
                  title="Search"
                  onClick={() => toggleRightSidebar('search')} 
                  className={`p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${rightTab === 'search' && showRightSidebar ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:bg-white/10 hover:text-indigo-400'}`}
                >
                  <Search size={18} aria-hidden="true" />
                </button>
                {view === 'server' && (
                  <button 
                    aria-label="View Members"
                    title="Members"
                    onClick={() => toggleRightSidebar('members')} 
                    className={`hidden sm:flex p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${rightTab === 'members' && showRightSidebar ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:bg-white/10 hover:text-indigo-400'}`}
                  >
                    <Users size={18} aria-hidden="true" />
                  </button>
                )}
                <button 
                  aria-label="View Info & Settings"
                  title="Info"
                  onClick={() => toggleRightSidebar('info')} 
                  className={`p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${rightTab === 'info' && showRightSidebar ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:bg-white/10 hover:text-indigo-400'}`}
                >
                  <Info size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10" key={view + homeTab + (activeChannel?.id || activeDm?.dm_room_id || '')}>
            
            {view === 'home' && !activeDm ? (
              <div className="flex-1 flex overflow-hidden animate-fade-in bg-[#0d0f12]">
                <div className="flex-1 flex flex-col p-6 md:p-8 overflow-y-auto custom-scrollbar border-r border-[#23252a]">
                  <div className="bg-[#15171a] ghost-border rounded-xl flex items-center px-4 py-3 mb-6 shadow-inner focus-within:border-indigo-500 transition-colors">
                    <input 
                      id="dm-search-input"
                      type="text" 
                      placeholder="Search for a conversation..." 
                      className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-gray-500" 
                    />
                    <Search size={18} className="text-gray-500 ml-2" />
                  </div>
                  
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                    {homeTab === 'online' && `Online — ${dms.filter(d => onlineUsers.includes(d.profiles.id)).length}`}
                    {homeTab === 'all' && `All Friends — ${dms.length}`}
                    {homeTab === 'pending' && `Pending — ${friendRequests.length}`}
                  </div>

                  <div className="space-y-2">
                    {homeTab === 'pending' && friendRequests.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 opacity-50">
                        <Bell size={48} className="text-gray-500 mb-4" />
                        <p className="text-gray-400 font-medium">No pending friend requests.</p>
                      </div>
                    )}
                    {homeTab === 'pending' && friendRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl group border-t border-transparent hover:border-white/5 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#23252a] overflow-hidden border border-white/5">
                            {req.profiles?.avatar_url ? <img src={req.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold uppercase">{req.profiles?.username?.[0]}</span>}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">{req.profiles?.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{req.profiles?.unique_tag}</span></div>
                            <div className="text-xs text-gray-400">Incoming Friend Request</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleAcceptRequest(req)} className="p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-green-500 hover:text-white hover:border-green-500 text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-green-400 outline-none" title="Accept"><Check size={18} /></button>
                          <button onClick={() => handleDeclineRequest(req.id)} className="p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-red-500 hover:text-white hover:border-red-500 text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-red-400 outline-none" title="Decline"><X size={18} /></button>
                        </div>
                      </div>
                    ))}

                    {(homeTab === 'online' || homeTab === 'all') && dms.filter(d => homeTab === 'all' || onlineUsers.includes(d.profiles.id)).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 opacity-50">
                        <Users size={48} className="text-gray-500 mb-4" />
                        <p className="text-gray-400 font-medium">It's quiet in here.</p>
                      </div>
                    )}
                    {(homeTab === 'online' || homeTab === 'all') && dms.filter(d => homeTab === 'all' || onlineUsers.includes(d.profiles.id)).map(dm => (
                      <div key={dm.dm_room_id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl group border-t border-transparent hover:border-white/5 cursor-pointer transition-all" onClick={() => setActiveDm(dm)}>
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-[#23252a] overflow-hidden border border-white/5">
                              {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold uppercase">{dm.profiles.username[0]}</span>}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-[3px] border-[#0d0f12] rounded-full ${onlineUsers.includes(dm.profiles.id) ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">{dm.profiles.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{dm.profiles.unique_tag}</span></div>
                            <div className="text-xs text-gray-400">{onlineUsers.includes(dm.profiles.id) ? 'Online' : 'Offline'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-white/10 text-gray-300 transition-colors" onClick={(e) => { e.stopPropagation(); setActiveDm(dm); }} title="Message"><MessageSquare size={18} /></button>
                          <button className="p-2.5 rounded-full bg-[#15171a] ghost-border hover:bg-white/10 text-gray-300 transition-colors" title="More Options"><MoreVertical size={18} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Area: Active Now */}
                <div className="w-80 p-6 hidden xl:block bg-[#0d0f12]" key="active-now-panel">
                  <h2 className="text-lg font-bold text-white mb-6 font-display">Active Now</h2>
                  <div className="space-y-4">
                    {dms.filter(dm => onlineUsers.includes(dm.profiles.id)).length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500 border border-dashed border-[#23252a] rounded-2xl">It's quiet for now...</div>
                    ) : (
                      dms.filter(dm => onlineUsers.includes(dm.profiles.id)).map(dm => (
                        <div key={dm.dm_room_id} className="p-4 bg-[#15171a] rounded-xl ghost-border shadow-md">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-[#23252a] overflow-hidden border border-white/5">
                                {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold text-xs uppercase">{dm.profiles.username[0]}</span>}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#15171a] rounded-full bg-green-500 animate-pulse`}></div>
                            </div>
                            <span className="font-bold text-sm text-white">{dm.profiles.username}</span>
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 bg-[#0d0f12] p-2 rounded-lg shadow-inner">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online & Active
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

            ) : (
              <>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6 animate-fade-in" ref={scrollContainerRef}>
                  {messages.length === 0 && (activeChannel || activeDm) && (
                    <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                      <h3 className="font-headline text-3xl font-bold tracking-tight mb-2 text-white">Welcome to {view === 'home' ? 'the beginning' : `#${activeChannel?.name}`}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">Your digital workspace is clear. Connect with your team or explore new horizons.</p>
                    </div>
                  )}

                  {filteredMessages.map((m, index) => {
                    const showHeader = index === 0 || messages[index - 1].profile_id !== m.profile_id || new Date(m.created_at) - new Date(messages[index - 1].created_at) > 300000;
                    
                    return (
                      <div key={m.id} className={`flex gap-4 group relative ${showHeader ? 'mt-8' : 'mt-1'}`}>
                        {showHeader ? (
                          <div className="h-10 w-10 rounded-full bg-[#1c1e22] shrink-0 overflow-hidden shadow-md mt-1 ghost-border">
                            {m.profiles?.avatar_url ? <img src={m.profiles?.avatar_url} className="h-full w-full object-cover" alt=""/> : <div className="h-full w-full flex items-center justify-center font-bold text-sm uppercase text-white" aria-hidden="true">{m.profiles?.username?.[0] || '?'}</div>}
                          </div>
                        ) : (
                          <div className="w-10 shrink-0 flex justify-center items-center opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 font-medium select-none">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        
                        <div className="flex flex-col w-full min-w-0">
                          {showHeader && (
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className={`text-[15px] font-bold tracking-tight ${m.profile_id === session.user.id ? 'text-indigo-400' : 'text-white'}`}>{m.profiles?.username}</span>
                              <span className="text-[10px] text-gray-500 font-medium">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                          {editingMessageId === m.id ? (
                            <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1">
                              <input 
                                type="text" 
                                value={editContent} 
                                onChange={(e) => setEditContent(e.target.value)} 
                                className="w-full max-w-3xl bg-[#15171a] text-white px-4 py-3 rounded-xl ghost-border outline-none shadow-inner text-sm focus-visible:ring-2 focus-visible:ring-indigo-500" 
                                autoFocus 
                                onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} 
                              />
                              <span className="text-[10px] text-gray-500 mt-2 block">Press Enter to save, Esc to cancel</span>
                            </form>
                          ) : (
                            <>
                              <div className={`p-4 rounded-2xl rounded-tl-none border w-fit max-w-3xl ${m.profile_id === session.user.id ? 'bg-[#1c1e22] border-[#23252a]' : 'bg-[#15171a] border-[#23252a]'}`}>
                                <div className="text-gray-200 leading-relaxed markdown-body text-[14px] break-words">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      code({ inline, className, children, ...props}) {
                                        const match = /language-(\w+)/.exec(className || '')
                                        return !inline && match ? (
                                          <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 ghost-border text-sm shadow-lg bg-[#0d0f12]" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                        ) : (
                                          <code className="bg-black/50 text-indigo-400 px-1.5 py-0.5 rounded-md font-mono text-[12px] border border-white/5" {...props}>{children}</code>
                                        )
                                      },
                                      a({...props}) { return <a className="text-indigo-400 hover:underline underline-offset-2" target="_blank" rel="noreferrer" {...props} /> }
                                    }}
                                  >
                                    {m.content}
                                  </ReactMarkdown>
                                </div>
                              </div>
                              {m.image_url && (
                                <a href={m.image_url} target="_blank" rel="noreferrer" className="block mt-3 max-w-sm rounded-xl overflow-hidden ghost-border hover:opacity-90 transition-opacity shadow-lg focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none">
                                  <img src={m.image_url} alt="User attachment" className="w-full object-cover" />
                                </a>
                              )}
                            </>
                          )}
                        </div>
                        {m.profile_id === session.user.id && editingMessageId !== m.id && (
                          <div className="absolute -top-3 right-4 hidden group-hover:flex gap-1 bg-[#1c1e22] ghost-border p-1 rounded-lg shadow-xl">
                            <button 
                              aria-label="Edit Message" 
                              onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); }} 
                              className="text-gray-400 hover:text-white p-1.5 hover:bg-white/5 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
                            >
                              <Pen size={14} aria-hidden="true" />
                            </button>
                            <button 
                              aria-label="Delete Message" 
                              onClick={() => handleDeleteMessage(m.id)} 
                              className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none cursor-pointer"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} className="h-4" />
                </div>

                <div className="p-6 pt-0 shrink-0 bg-[#0d0f12]">
                  <form onSubmit={handleSendMessage} className="bg-[#15171a] rounded-2xl ghost-border flex items-end gap-2 p-2 focus-within:border-indigo-500/50 shadow-inner transition-colors">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                    <button 
                      type="button" 
                      aria-label="Upload Image" 
                      title="Upload Image"
                      onClick={() => fileInputRef.current?.click()} 
                      disabled={isUploading} 
                      className="p-3 text-gray-500 hover:text-indigo-400 rounded-xl hover:bg-white/5 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
                    >
                      {isUploading ? <Loader2 className="animate-spin text-indigo-400" size={20} /> : <ImagePlus size={20} aria-hidden="true" />}
                    </button>
                    
                    <textarea 
                      className="flex-1 bg-transparent border-none outline-none text-white resize-none py-3 custom-scrollbar text-[15px] font-body min-w-0 placeholder:text-gray-600" 
                      placeholder={`Message ${view === 'home' ? '@' + activeDm?.profiles?.username : '#' + activeChannel?.name}`} 
                      value={newMessage} 
                      onChange={(e) => setNewMessage(e.target.value)} 
                      onKeyDown={handleKeyDown}
                      rows={1}
                      style={{ minHeight: '48px', maxHeight: '200px' }}
                    />
                    
                    <button 
                      type="submit" 
                      aria-label="Send Message" 
                      title="Send"
                      disabled={!newMessage.trim() || isUploading} 
                      className="p-3 text-indigo-500 hover:text-indigo-400 rounded-xl hover:bg-indigo-500/10 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
                    >
                      <Send size={20} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* Right Sidepanel */}
          {showRightSidebar && isChatActive && (
            <aside className="w-80 bg-[#15171a] ghost-border flex flex-col shrink-0 z-30 shadow-2xl animate-fade-in">
              <div className="h-16 flex items-center justify-between px-6 border-b border-[#23252a] shrink-0 bg-[#0d0f12]/80 backdrop-blur-xl">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {rightTab === 'members' ? `Members — ${serverMembers.length}` : 
                   rightTab === 'info' ? 'Details' : 'Search'}
                </span>
                <button 
                  aria-label="Close Sidebar"
                  onClick={() => setShowRightSidebar(false)} 
                  className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              {/* MESSENGER STYLE INFO TAB */}
              {rightTab === 'info' && view === 'home' && activeDm && (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex flex-col items-center pt-8 pb-6 px-6 text-center border-b border-[#23252a] shrink-0">
                    <div className="relative mb-3">
                      <div className="w-20 h-20 rounded-full bg-[#23252a] border-2 border-indigo-500 overflow-hidden flex items-center justify-center">
                        {activeDm.profiles.avatar_url ? <img src={activeDm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="text-2xl font-bold uppercase">{activeDm.profiles.username[0]}</span>}
                      </div>
                      {onlineUsers.includes(activeDm.profiles.id) && <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-[#15171a] rounded-full animate-pulse"></div>}
                    </div>
                    <h2 className="text-xl font-bold text-white">{activeDm.profiles.username}</h2>
                    <p className="text-xs text-indigo-400 font-mono mt-1">{activeDm.profiles.unique_tag}</p>

                    <div className="flex gap-4 mt-6">
                      <button className="flex flex-col items-center gap-1.5 group cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-[#23252a] flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-all"><User size={18}/></div>
                        <span className="text-[10px] text-gray-400 font-medium group-hover:text-white">Profile</span>
                      </button>
                      <button className="flex flex-col items-center gap-1.5 group cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-[#23252a] flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-all"><Bell size={18}/></div>
                        <span className="text-[10px] text-gray-400 font-medium group-hover:text-white">Mute</span>
                      </button>
                      <button onClick={() => toggleRightSidebar('search')} className="flex flex-col items-center gap-1.5 group cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-[#23252a] flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-all"><Search size={18}/></div>
                        <span className="text-[10px] text-gray-400 font-medium group-hover:text-white">Search</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                    <div className="bg-[#1c1e22] rounded-xl overflow-hidden ghost-border">
                      <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#23252a]/50">Customization</div>
                      <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer group">
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white">Chat Theme</span>
                        <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: `rgb(${activeTheme})`}}></div>
                      </button>
                    </div>

                    <div className="bg-[#1c1e22] rounded-xl overflow-hidden ghost-border">
                      <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#23252a]/50">Media & Files</div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left">
                        <ImagePlus size={16} className="text-gray-400 group-hover:text-indigo-400"/>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">Media</span>
                      </button>
                      <div className="h-[1px] bg-white/5 mx-4"></div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left">
                        <span className="material-symbols-outlined text-[16px] text-gray-400 group-hover:text-indigo-400" aria-hidden="true">description</span>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">Files</span>
                      </button>
                    </div>

                    <div className="bg-[#1c1e22] rounded-xl overflow-hidden ghost-border">
                      <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#23252a]/50">Privacy & Support</div>
                      <div className="p-4 flex items-center gap-3 bg-indigo-500/10 border-b border-indigo-500/20">
                        <Lock size={16} className="text-indigo-400" aria-hidden="true"/>
                        <div className="flex-1 text-left">
                          <p className="text-xs font-bold text-indigo-400">End-to-End Encrypted</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Messages and calls are secured.</p>
                        </div>
                      </div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left">
                        <Bell size={16} className="text-gray-400 group-hover:text-white"/>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">Mute Notifications</span>
                      </button>
                      <div className="h-[1px] bg-white/5 mx-4"></div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer group text-left">
                        <span className="material-symbols-outlined text-[16px] text-gray-400 group-hover:text-white" aria-hidden="true">visibility_off</span>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white flex-1">Restrict</span>
                      </button>
                      <div className="h-[1px] bg-white/5 mx-4"></div>
                      <button className="w-full flex items-center gap-3 p-4 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                        <span className="material-symbols-outlined text-[16px] text-red-400 group-hover:text-red-300" aria-hidden="true">block</span>
                        <span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">Block {activeDm.profiles.username}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* OTHER TABS */}
              {rightTab !== 'info' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                  {rightTab === 'members' && view === 'server' && (
                    <div className="space-y-2">
                      {serverMembers.map(m => {
                        const isOnline = onlineUsers.includes(m.profiles.id)
                        return (
                          <div key={m.profiles.id} className={`flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer ${isOnline ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                            <div className="relative shrink-0">
                              <div className="w-8 h-8 rounded-full bg-[#23252a] overflow-hidden border border-white/5 flex items-center justify-center">
                                {m.profiles.avatar_url ? <img src={m.profiles.avatar_url} className="h-full w-full object-cover" alt=""/> : <span className="font-bold text-xs uppercase text-white" aria-hidden="true">{m.profiles.username[0]}</span>}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#15171a] rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className={`truncate text-sm font-medium ${isOnline ? 'text-white' : 'text-gray-400'}`}>{m.profiles.username}</span>
                              {m.role === 'owner' && <span className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold mt-0.5">Admin</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {rightTab === 'search' && (
                    <div>
                      <div className="bg-[#0d0f12] ghost-border rounded-xl flex items-center px-4 py-3 mb-6 focus-within:border-indigo-500 shadow-inner transition-colors">
                        <Search size={18} className="text-gray-500 mr-2 shrink-0" aria-hidden="true" />
                        <input 
                          type="text" 
                          placeholder="Search records..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-gray-600 font-medium min-w-0"
                        />
                      </div>
                      {searchQuery && filteredMessages.length === 0 && (
                        <div className="text-center text-gray-500 text-sm mt-8">No records match your query.</div>
                      )}
                      {searchQuery && filteredMessages.length > 0 && (
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">{filteredMessages.length} Matches Found</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </main>

      {/* Modals */}
      {showCreateModal && <ServerCreationModal onClose={() => setShowCreateModal(false)} handleCreate={handleCreateServer} name={newServerName} setName={setNewServerName} />}
      {showJoinModal && <JoinServerModal session={session} onClose={() => setShowJoinModal(false)} onJoinSuccess={fetchServers} />}
      {showDmModal && <StartDMModal session={session} onClose={() => setShowDmModal(false)} onChatStarted={() => { fetchDms(); setView('home'); }} />}
      {showUserSettings && <UserSettingsModal session={session} onClose={() => setShowUserSettings(false)} />}
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={handleUpdateServer} handleDelete={handleDeleteServer} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && <ChannelCreationModal handleCreate={handleCreateChannel} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={handleUpdateChannel} handleDelete={handleDeleteChannel} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}
