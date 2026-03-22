import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import toast, { Toaster } from 'react-hot-toast'
import { createP2PSignalingChannel, createPeerConnection } from '../lib/p2pSignaling'
import { generateEcdhKeyPair, exportPublicKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm, encryptBinaryAesGcm, decryptBinaryAesGcm, fingerprintKey, generateSecureRandomString } from '../lib/crypto'
import { cacheMessage, cacheThumbnail } from '../lib/cacheManager'

import CreationModal from './modals/CreationModal'
import ServerSettingsModal from './modals/ServerSettings'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'
import JoinServerModal from './modals/JoinServer'
import StartDMModal from './modals/StartDirectMessages'
import Sidebar from './Sidebar'

const THEME_COLORS = [
  { name: 'Blue', value: '133, 173, 255' },
  { name: 'Pink', value: '241, 153, 247' },
  { name: 'Purple', value: '168, 85, 247' },
  { name: 'Slate', value: '100, 116, 139' },
  { name: 'Emerald', value: '52, 211, 153' }
]

export default function Dashboard({ session }) {
  const [view, setView] = useState('home')
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [dms, setDms] = useState([])
  const [activeDm, setActiveDm] = useState(null)
  const [activeTheme, setActiveTheme] = useState('133, 173, 255')
  const [isDarkMode, setIsDarkMode] = useState(true)

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', activeTheme);
  }, [activeTheme])

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
    }
  }, [isDarkMode])

  const [onlineUsers, setOnlineUsers] = useState(new Set())
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
  const [p2pStatus, setP2pStatus] = useState('idle')
  const [, setP2pFingerprint] = useState('')

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const myAvatar = session.user.user_metadata?.avatar_url
  const p2pRef = useRef({ connection: null, dataChannel: null, sendSignal: null, currentRoom: null })
  const localEcdhRef = useRef(null)
  const peerEcdhRef = useRef(null)
  const sharedKeyRef = useRef(null)

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
        setOnlineUsers(new Set(Object.keys(state)))
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

  useEffect(() => {
    const cleanup = () => {
      const ps = p2pRef.current
      if (ps.connection) ps.connection.close()
      if (ps.channel) supabase.removeChannel(ps.channel)
    }

    const { channel, sendSignal } = createP2PSignalingChannel(supabase, async (payload) => {
      if (payload.to !== session.user.id) return

      if (payload.type === 'offer') {
        setP2pStatus('received-offer')
        const pc = createPeerConnection({
          onData: async (event) => {
            try {
              const decoded = JSON.parse(event.data)
              if (decoded.type === 'encrypted' && sharedKeyRef.current) {
                const decrypted = await decryptWithAesGcm(sharedKeyRef.current, decoded.payload)
                const parsed = JSON.parse(decrypted)
                if (parsed.type === 'text') {
                  setMessages((prev) => [...prev, { profile_id: payload.from, content: parsed.text, created_at: new Date().toISOString(), profiles: { username: 'Peer' } }])
                }
              }
            } catch (e) { console.error(e) }
          },
          onOpen: () => setP2pStatus('connected'),
          onClose: () => setP2pStatus('disconnected'),
          onIce: async (candidate) => await sendSignal({ type: 'ice-candidate', to: payload.from, from: session.user.id, candidate })
        })

        const dataChannel = pc.createDataChannel('messapp-datachannel')
        dataChannel.onmessage = async () => {}
        await pc.pc.setRemoteDescription(payload.offer)
        const answer = await pc.pc.createAnswer()
        await pc.pc.setLocalDescription(answer)
        await sendSignal({ type: 'answer', to: payload.from, from: session.user.id, answer })
        const localEcdh = await generateEcdhKeyPair()
        localEcdhRef.current = localEcdh
        const localPub = await exportPublicKey(localEcdh.publicKey)
        await sendSignal({ type: 'ecdh-key', to: payload.from, from: session.user.id, publicKey: localPub })
        p2pRef.current.connection = pc.pc
        p2pRef.current.channel = channel
      }

      if (payload.type === 'answer' && p2pRef.current.connection) await p2pRef.current.connection.setRemoteDescription(payload.answer)
      if (payload.type === 'ice-candidate' && payload.candidate && p2pRef.current.connection) await p2pRef.current.connection.addIceCandidate(payload.candidate)
      if (payload.type === 'ecdh-key') {
        if (!localEcdhRef.current) return
        peerEcdhRef.current = payload.publicKey
        const derivedKey = await deriveSharedAesKey(localEcdhRef.current.privateKey, payload.publicKey)
        sharedKeyRef.current = derivedKey
        const fingerprint = await fingerprintKey(derivedKey)
        setP2pFingerprint(fingerprint)
        setP2pStatus('secured')
      }
    })

    p2pRef.current.sendSignal = sendSignal
    return cleanup
  }, [session.user.id])

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
    setView('server')
    setActiveServer(server)
    setActiveDm(null)
    setRightTab('members')
  }

  const handleHomeClick = () => {
    setView('home')
    setActiveServer(null)
    setActiveChannel(null)
    setRightTab('search')
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
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100)
    }
    fetchCurrentMessages()

    const sub = supabase.channel('chat-room').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      if (payload.eventType === 'INSERT' && payload.new[field] === targetId) {
        const newMsg = payload.new
        if (newMsg.profile_id === session.user.id) newMsg.profiles = { username: session.user.user_metadata.username, avatar_url: session.user.user_metadata.avatar_url }
        setMessages(prev => [...prev, newMsg])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
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

    if (p2pRef.current?.connection && p2pRef.current?.connection.connectionState === 'connected' && sharedKeyRef.current) {
      try {
        const encrypted = await encryptWithAesGcm(sharedKeyRef.current, JSON.stringify({ type: 'text', text }))
        p2pRef.current.dataChannel?.send(JSON.stringify({ type: 'encrypted', payload: encrypted }))
        setMessages((prev) => [...prev, { id: `local-${Date.now()}`, profile_id: session.user.id, content: text, created_at: new Date().toISOString(), profiles: { username: session.user.user_metadata?.username } }])
        cacheMessage(activeDm?.dm_room_id || activeChannel?.id || 'global', { id: `local-${Date.now()}`, content: text, created_at: new Date().toISOString() })
      } catch { toast.error('Failed to send encrypted P2P message') }
      return
    }

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    try {
      const { data, error } = await supabase.from('messages').insert([{ profile_id: session.user.id, content: text, [field]: targetId }])
      if (error) throw error
      cacheMessage(targetId, { content: text, created_at: new Date().toISOString() })
      if (data?.[0]) setMessages((prev) => [...prev, data[0]])
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
      const fileBuffer = await file.arrayBuffer()
      if (p2pRef.current?.connection && p2pRef.current?.connection.connectionState === 'connected' && sharedKeyRef.current) {
        const encryptedImg = await encryptBinaryAesGcm(sharedKeyRef.current, fileBuffer)
        p2pRef.current.dataChannel?.send(JSON.stringify({ type: 'encrypted-image', fileName: file.name, fileType: file.type, payload: encryptedImg }))
        const thumbUrl = URL.createObjectURL(file)
        cacheThumbnail(activeDm?.dm_room_id || activeChannel?.id || 'global', thumbUrl)
        setMessages((prev) => [...prev, { id: `local-image-${Date.now()}`, profile_id: session.user.id, content: `[Encrypted image: ${file.name}]`, image_url: thumbUrl, created_at: new Date().toISOString(), profiles: { username: session.user.user_metadata?.username } }])
        toast.success('Encrypted image sent P2P')
      } else {
        const fileExt = file.name.split('.').pop()
        const fileName = `${generateSecureRandomString(12)}.${fileExt}`
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
      }
    } catch { toast.error('Failed to upload image') }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const startP2PHandshake = async () => {
    if (!activeDm?.profiles?.id) return toast.error('Select a direct message peer first')
    setP2pStatus('handshaking')
    const peerId = activeDm.profiles.id
    const localEcdh = await generateEcdhKeyPair()
    localEcdhRef.current = localEcdh

    const pc = createPeerConnection({
      onData: async (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'encrypted' && sharedKeyRef.current) {
            const decrypted = await decryptWithAesGcm(sharedKeyRef.current, payload.payload)
            const parsed = JSON.parse(decrypted)
            setMessages((prev) => [...prev, { id: `p2p-${Date.now()}`, profile_id: peerId, content: parsed.text, created_at: new Date().toISOString(), profiles: { username: activeDm.profiles.username } }])
          }
          if (payload.type === 'encrypted-image' && sharedKeyRef.current) {
            const decryptedBuffer = await decryptBinaryAesGcm(sharedKeyRef.current, payload.payload)
            const blob = new Blob([decryptedBuffer], { type: payload.fileType })
            const url = URL.createObjectURL(blob)
            cacheThumbnail(activeDm.dm_room_id, url)
            setMessages((prev) => [...prev, { id: `p2p-image-${Date.now()}`, profile_id: peerId, content: `[Image from peer]`, image_url: url, created_at: new Date().toISOString(), profiles: { username: activeDm.profiles.username } }])
          }
        } catch { // Ignore err
        }
      },
      onOpen: () => setP2pStatus('connected'),
      onClose: () => setP2pStatus('disconnected'),
      onIce: async (candidate) => await p2pRef.current.sendSignal({ type: 'ice-candidate', from: session.user.id, to: peerId, candidate })
    })

    p2pRef.current.connection = pc.pc
    p2pRef.current.dataChannel = pc.createDataChannel('messapp-datachannel')
    const offer = await pc.createOffer()
    await pc.pc.setLocalDescription(offer)
    await p2pRef.current.sendSignal({ type: 'offer', from: session.user.id, to: peerId, offer })
    const localPub = await exportPublicKey(localEcdh.publicKey)
    await p2pRef.current.sendSignal({ type: 'ecdh-key', from: session.user.id, to: peerId, publicKey: localPub })
    setP2pStatus('offer-sent')
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
    if (!newServerName.trim()) return
    try {
      const { data: serverData, error } = await supabase.from('servers').insert([{ name: newServerName.trim(), owner_id: session.user.id }]).select().single()
      if (error) throw error
      if (serverData) {
        await supabase.from('server_members').insert([{ server_id: serverData.id, profile_id: session.user.id, role: 'owner' }])
        setServers((prev) => [...prev, serverData])
        handleServerClick(serverData)
        setNewServerName('')
        setShowCreateModal(false)
        toast.success(`Server created successfully.`)
      }
    } catch { toast.error("Failed to create server") }
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
      if (!serverSettingsName.trim()) return
      const { error } = await supabase.from('servers').update({ name: serverSettingsName.trim() }).eq('id', activeServer.id)
      if (!error) {
        setServers((prev) => prev.map(s => s.id === activeServer.id ? { ...s, name: serverSettingsName.trim() } : s))
        setActiveServer((prev) => ({ ...prev, name: serverSettingsName.trim() }))
        setShowServerSettings(false)
      }
  }
  
  const handleDeleteServer = async () => {
      if (!activeServer) return
      try {
        const { error } = await supabase.from('servers').delete().eq('id', activeServer.id)
        if (error) throw error
        setMessages([])
        setActiveChannel(null)
        setActiveServer(null)
        setView('home')
        fetchServers()
      } catch { toast.error('Could not delete server') }
      finally { setShowServerSettings(false) }
  }

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages
    const lowerQuery = searchQuery.toLowerCase()
    return messages.filter(m =>
      m.content.toLowerCase().includes(lowerQuery) ||
      m.profiles?.username.toLowerCase().includes(lowerQuery)
    )
  }, [searchQuery, messages])

  return (
    <div className="flex h-screen w-full theme-bg theme-text overflow-hidden font-body selection:bg-[#85adff]/30">
      <Toaster position="top-right" toastOptions={{ className: 'glass-card theme-text' }} />
      
      {/* 1. SIDE NAV BAR (Vertical Rail) */}
      <Sidebar
        view={view}
        servers={servers}
        activeServer={activeServer}
        handleHomeClick={handleHomeClick}
        handleServerClick={handleServerClick}
        setShowCreateModal={setShowCreateModal}
        setShowJoinModal={setShowJoinModal}
        showRightSidebar={showRightSidebar}
        setShowRightSidebar={setShowRightSidebar}
        setRightTab={setRightTab}
        friendRequests={friendRequests}
        setShowUserSettings={setShowUserSettings}
      />

      {/* 2. SECONDARY SIDEBAR (Channels / DMs) */}
      <aside className="w-72 h-full bg-[#0c0e12] flex flex-col border-r border-white/5 shrink-0 z-40">
        <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
          <h2 className="font-headline font-bold text-white tracking-tight truncate">
            {view === 'home' ? 'MessApp Dashboard' : activeServer?.name}
          </h2>
          {view === 'server' && activeServer?.owner_id === session.user.id && (
            <button onClick={() => { setServerSettingsName(activeServer.name); setShowServerSettings(true); }} className="text-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-lg">
              <span className="material-symbols-outlined text-[18px]">settings</span>
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8 px-4">
          {view === 'home' ? (
            <div className="space-y-6">
              <button onClick={() => setShowDmModal(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-[#002a62] font-bold text-sm shadow-lg shadow-[#85adff]/20 hover:opacity-90 transition-all">
                <span className="material-symbols-outlined text-[18px]">add</span> New Message
              </button>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 block px-2">Direct Messages</span>
                <div className="space-y-1">
                  {dms.map(dm => (
                    <button
                      key={dm.dm_room_id}
                      onClick={() => setActiveDm(dm)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${activeDm?.dm_room_id === dm.dm_room_id ? 'bg-[#1d2025] border border-[#85adff]/30 text-white' : 'hover:bg-white/5 text-slate-400 hover:text-white border border-transparent'}`}
                    >
                      <div className="relative shrink-0">
                        <div className="h-8 w-8 rounded-full bg-[#23262c] flex items-center justify-center overflow-hidden border border-white/5">
                          {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="h-full w-full object-cover"/> : <span className="font-bold text-xs uppercase text-white">{dm.profiles.username[0]}</span>}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#0c0e12] rounded-full ${onlineUsers.has(dm.profiles.id) ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`text-sm font-medium truncate ${activeDm?.dm_room_id === dm.dm_room_id ? 'text-[#85adff]' : ''}`}>{dm.profiles.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between px-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Channels</span>
                  {activeServer?.owner_id === session.user.id && (
                    <button aria-label="Create Channel" onClick={() => setShowChannelModal(true)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all">
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {channels.map(c => {
                    const hasNewMessage = c.last_message_at && (!channelReads[c.id] || new Date(c.last_message_at) > new Date(channelReads[c.id]))
                    const isUnread = c.id !== activeChannel?.id && hasNewMessage

                    return (
                      <div key={c.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border ${activeChannel?.id === c.id ? 'bg-[#1d2025] border-[#85adff]/30 text-white' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                        <button onClick={() => setActiveChannel(c)} className="flex-1 flex items-center gap-3 min-w-0 text-left outline-none">
                          <span className={`text-[18px] transition-colors ${activeChannel?.id === c.id ? 'text-[#85adff]' : 'text-slate-500 group-hover:text-[#85adff]'}`}>#</span>
                          <span className={`text-sm truncate ${isUnread ? 'text-white font-bold' : 'font-medium'}`}>{c.name}</span>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {activeServer?.owner_id === session.user.id && (
                            <button onClick={(e) => { e.stopPropagation(); setChannelToEdit(c); setChannelSettingsName(c.name); setShowChannelSettings(true); }} className="text-slate-500 hover:text-white p-1 rounded-md hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100">
                              <span className="material-symbols-outlined text-[14px]">settings</span>
                            </button>
                          )}
                          {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-white/[0.02] border-t border-white/5 flex items-center gap-3">
          <button onClick={() => setShowUserSettings(true)} className="flex flex-1 items-center gap-3 min-w-0 p-1.5 hover:bg-white/5 rounded-xl transition-colors text-left group">
            <div className="h-9 w-9 rounded-lg bg-[#85adff]/10 border border-[#85adff]/20 flex items-center justify-center shrink-0 overflow-hidden relative">
              {myAvatar ? <img src={myAvatar} className="h-full w-full object-cover" /> : <span className="font-bold text-[#85adff] text-xs">{session.user.user_metadata?.username?.charAt(0) || 'U'}</span>}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="material-symbols-outlined text-white text-[16px]">settings</span></div>
            </div>
            <div className="flex flex-col truncate">
              <span className="text-[13px] font-bold text-white truncate">{session.user.user_metadata?.username}</span>
              <span className="text-[10px] text-slate-500 truncate">Online</span>
            </div>
          </button>
          <button onClick={() => supabase.auth.signOut()} className="text-slate-400 hover:text-error p-2 rounded-lg hover:bg-error/10 transition-colors shrink-0" title="Logout">
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </aside>

      {/* 3. MAIN CHAT INTERFACE (Right) */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-[#0c0e12]">

        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0 z-30 shadow-md">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {view === 'home' && activeDm ? (
              <div className="flex items-center gap-3 min-w-0"><span className="text-xl text-slate-500 font-light">@</span><h2 className="font-headline font-bold text-white text-lg tracking-tight truncate">{activeDm.profiles.username}</h2></div>
            ) : view === 'server' && activeChannel ? (
              <div className="flex items-center gap-3 min-w-0"><span className="text-xl text-slate-500 font-light">#</span><h2 className="font-headline font-bold text-white text-lg tracking-tight truncate">{activeChannel.name}</h2></div>
            ) : (
              <h2 className="font-headline font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#85adff] to-[#6e9fff] text-xl tracking-tight shrink-0 truncate">Digital Observatory</h2>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0 ml-4">
            <div className="hidden lg:flex gap-6 items-center border-r border-white/10 pr-6 mr-2">
              <button className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Dashboard</button>
              <button className="text-sm font-medium text-[#85adff] transition-colors">Messages</button>
              <button className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Contacts</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowRightSidebar(!showRightSidebar); setRightTab('search'); }} className={`p-2 rounded-full transition-all ${rightTab === 'search' && showRightSidebar ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                <span className="material-symbols-outlined text-[20px]">search</span>
              </button>
              {view === 'server' && (
                <button onClick={() => { setShowRightSidebar(!showRightSidebar); setRightTab('members'); }} className={`hidden sm:block p-2 rounded-full transition-all ${rightTab === 'members' && showRightSidebar ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                  <span className="material-symbols-outlined text-[20px]">group</span>
                </button>
              )}
              <button onClick={() => { setShowRightSidebar(!showRightSidebar); setRightTab('info'); }} className={`p-2 rounded-full transition-all ${rightTab === 'info' && showRightSidebar ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                <span className="material-symbols-outlined text-[20px]">info</span>
              </button>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#85adff]/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6" ref={scrollContainerRef}>
              {messages.length === 0 && (activeChannel || activeDm) && (
                <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                  <h3 className="font-headline text-3xl font-bold tracking-tight mb-2 text-white">Welcome to {view === 'home' ? 'the Observatory' : `#${activeChannel?.name}`}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">Your digital workspace is clear. Connect with your team or explore new horizons.</p>
                </div>
              )}

              {filteredMessages.map((m, index) => {
                const showHeader = index === 0 || messages[index - 1].profile_id !== m.profile_id || new Date(m.created_at) - new Date(messages[index - 1].created_at) > 300000;

                return (
                  <div key={m.id} className={`flex gap-4 group relative ${showHeader ? 'mt-8' : 'mt-1'}`}>
                    {showHeader ? (
                      <div className="h-10 w-10 rounded-full bg-[#23262c] shrink-0 overflow-hidden shadow-md mt-1 border border-white/5">
                        {m.profiles?.avatar_url ? <img src={m.profiles?.avatar_url} className="h-full w-full object-cover"/> : <div className="h-full w-full flex items-center justify-center font-bold text-sm uppercase text-white">{m.profiles?.username?.[0] || '?'}</div>}
                      </div>
                    ) : (
                      <div className="w-10 shrink-0 flex justify-center items-center opacity-0 group-hover:opacity-100 text-[10px] text-slate-600 font-medium select-none">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}

                    <div className="flex flex-col w-full min-w-0">
                      {showHeader && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className={`text-[15px] font-bold tracking-tight ${m.profile_id === session.user.id ? 'text-[#85adff]' : 'text-white'}`}>{m.profiles?.username}</span>
                          <span className="text-[10px] text-slate-500 font-medium">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      {editingMessageId === m.id ? (
                        <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1">
                          <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full max-w-3xl bg-[#111318] text-white px-4 py-3 rounded-xl border border-[#85adff] outline-none shadow-inner text-sm" autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
                          <span className="text-[10px] text-slate-500 mt-2 block">Press Enter to save, Esc to cancel</span>
                        </form>
                      ) : (
                        <>
                          <div className={`p-4 rounded-2xl rounded-tl-none border w-fit max-w-3xl ${m.profile_id === session.user.id ? 'bg-[#1d2025] border-white/5' : 'bg-white/[0.03] border-white/5'}`}>
                            <div className="text-slate-200 leading-relaxed markdown-body text-[14px] break-words">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ inline, className, children, ...props}) {
                                    const match = /language-(\w+)/.exec(className || '')
                                    return !inline && match ? (
                                      <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 border border-white/10 text-sm shadow-lg bg-[#0c0e12]!" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                    ) : (
                                      <code className="bg-black/50 text-[#85adff] px-1.5 py-0.5 rounded font-mono text-[12px] border border-white/5" {...props}>{children}</code>
                                    )
                                  },
                                  a({...props}) { return <a className="text-[#85adff] hover:underline underline-offset-2" target="_blank" rel="noreferrer" {...props} /> }
                                }}
                              >
                                {m.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noreferrer" className="block mt-3 max-w-sm rounded-xl overflow-hidden border border-white/10 hover:opacity-90 transition-opacity shadow-lg">
                              <img src={m.image_url} alt="attachment" className="w-full object-cover" />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                    {m.profile_id === session.user.id && editingMessageId !== m.id && (
                      <div className="absolute -top-3 right-4 hidden group-hover:flex gap-1 bg-[#1d2025] border border-white/10 p-1 rounded-lg shadow-xl">
                        <button onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); }} className="text-slate-400 hover:text-white p-1.5 hover:bg-white/10 rounded-md transition-all"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                        <button onClick={() => handleDeleteMessage(m.id)} className="text-error hover:text-error-dim p-1.5 hover:bg-error/10 rounded-md transition-all"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Bar */}
            {(activeChannel || activeDm) && (
              <div className="p-6 pt-0 shrink-0 bg-[#0c0e12]">
                <form onSubmit={handleSendMessage} className="bg-[#111318] rounded-2xl border border-white/5 flex items-end gap-2 p-2 focus-within:border-[#85adff]/50 focus-within:bg-[#171a1f] transition-all shadow-inner">
                  <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-3 text-slate-400 hover:text-[#85adff] rounded-xl hover:bg-white/5 transition-colors shrink-0 disabled:opacity-50">
                    <span className={`material-symbols-outlined ${isUploading ? 'animate-pulse' : ''}`}>add_circle</span>
                  </button>

                  <textarea
                    className="flex-1 bg-transparent border-none outline-none text-white resize-none py-3 custom-scrollbar text-[15px] font-body min-w-0"
                    placeholder={`Message ${view === 'home' ? '@' + activeDm?.profiles?.username : '#' + activeChannel?.name}`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}

                    rows={1}
                    style={{ minHeight: '48px', maxHeight: '200px' }}
                  />

                  <button type="submit" disabled={!newMessage.trim()} className="p-3 text-[#85adff] hover:text-[#6e9fff] rounded-xl hover:bg-[#85adff]/10 transition-colors shrink-0 disabled:opacity-50">
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Right Sidepanel */}
          {showRightSidebar && (
            <aside className="w-72 bg-[#111318] border-l border-white/5 flex flex-col shrink-0 z-30 shadow-2xl">
              <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 shrink-0 bg-white/[0.02]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {rightTab === 'members' ? `Members — ${serverMembers.length}` :
                   rightTab === 'notifications' ? 'Notifications' :
                   rightTab === 'info' ? 'Settings' : 'Search Logs'}
                </span>
                <button onClick={() => setShowRightSidebar(false)} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

                {rightTab === 'notifications' && (
                  <div>
                    {friendRequests.length === 0 ? (
                      <div className="text-center py-8 opacity-50">
                        <span className="material-symbols-outlined text-4xl mb-2 text-slate-500">inbox</span>
                        <p className="text-sm font-medium text-slate-400">No pending requests.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {friendRequests.map(req => (
                          <div key={req.id} className="bg-[#1d2025] p-4 rounded-2xl border border-white/5 shadow-lg">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-full bg-[#0c0e12] border border-white/10 overflow-hidden shrink-0">
                                {req.profiles?.avatar_url ? <img src={req.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="font-bold text-sm text-white flex items-center justify-center h-full">{req.profiles?.username?.[0]}</span>}
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-sm font-bold text-white truncate">{req.profiles?.username}</div>
                                <div className="text-[10px] text-[#85adff] font-mono truncate">{req.profiles?.unique_tag}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleAcceptRequest(req)} className="flex-1 bg-[#85adff] text-[#002a62] hover:brightness-110 text-xs py-2 rounded-lg font-bold transition-all shadow-md">Accept</button>
                              <button onClick={() => handleDeclineRequest(req.id)} className="flex-1 bg-error/10 text-error hover:bg-error/20 text-xs py-2 rounded-lg font-bold transition-all border border-error/10">Decline</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {rightTab === 'members' && view === 'server' && (
                  <div className="space-y-2">
                    {serverMembers.map(m => {
                      const isOnline = onlineUsers.has(m.profiles.id)
                      return (
                        <div key={m.profiles.id} className={`flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer ${isOnline ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-full bg-[#23262c] overflow-hidden border border-white/5 flex items-center justify-center">
                              {m.profiles.avatar_url ? <img src={m.profiles.avatar_url} className="h-full w-full object-cover"/> : <span className="font-bold text-xs uppercase text-white">{m.profiles.username[0]}</span>}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-[#111318] rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`truncate text-sm font-medium ${isOnline ? 'text-white' : 'text-slate-400'}`}>{m.profiles.username}</span>
                            {m.role === 'owner' && <span className="text-[9px] text-[#85adff] uppercase tracking-widest font-bold mt-0.5">Admin</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {rightTab === 'search' && (
                  <div>
                    <div className="bg-[#0c0e12] border border-white/5 rounded-xl flex items-center px-4 py-3 mb-6 focus-within:border-[#85adff]/50 transition-all shadow-inner">
                      <span className="material-symbols-outlined text-[18px] text-slate-500 mr-2 shrink-0">search</span>
                      <input 
                        type="text" 
                        placeholder="Search records..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-slate-600 font-medium min-w-0"
                      />
                    </div>
                    {searchQuery && filteredMessages.length === 0 && (
                      <div className="text-center text-slate-500 text-sm mt-8">No records match your query.</div>
                    )}
                    {searchQuery && filteredMessages.length > 0 && (
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{filteredMessages.length} Matches Found</div>
                    )}
                  </div>
                )}

                {rightTab === 'info' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Aesthetic Profile</h3>
                      <div className="glass-panel p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--glass-border)]">
                          <span className="text-sm font-medium theme-text">Dark Mode</span>
                          <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className={`w-10 h-5 rounded-full relative transition-colors ${isDarkMode ? 'bg-[rgb(var(--accent-color))]' : 'bg-slate-400'}`}
                          >
                            <span className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'left-[22px]' : 'left-[4px]'}`} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center">
                          {THEME_COLORS.map(c => (
                            <button
                              key={c.name}
                              onClick={() => setActiveTheme(c.value)}
                              title={c.name}
                              className={`w-8 h-8 rounded-full border-2 transition-all shadow-md ${activeTheme === c.value ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`}
                              style={{ backgroundColor: `rgb(${c.value})` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {view === 'home' && activeDm && (
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Security Protocol</h3>
                        <div className="bg-[#1d2025] p-4 rounded-2xl border border-white/5">
                          <button
                            onClick={startP2PHandshake}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-bold border border-emerald-500/20"
                          >
                            <span className="material-symbols-outlined text-[16px]">lock</span> P2P Connect
                          </button>
                          <div className="text-[10px] text-slate-500 mt-3 text-center uppercase tracking-widest font-bold">Status: <span className="text-white">{p2pStatus}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Modals */}
      {showCreateModal && (
        <CreationModal
          type="server"
          title="Create Your Galaxy"
          description="Servers are where you and your friends hang out. Set a name and launch your new workspace."
          icon="add_circle"
          inputLabel="Server Name"
          placeholder="The MessApp Hub"
          buttonText="Launch"
          value={newServerName}
          onChange={setNewServerName}
          onSubmit={handleCreateServer}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {showJoinModal && <JoinServerModal session={session} onClose={() => setShowJoinModal(false)} onJoinSuccess={fetchServers} />}
      {showDmModal && <StartDMModal session={session} onClose={() => setShowDmModal(false)} onChatStarted={() => { fetchDms(); setView('home'); }} />}
      {showUserSettings && <UserSettingsModal session={session} onClose={() => setShowUserSettings(false)} />}
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={handleUpdateServer} handleDelete={handleDeleteServer} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && (
        <CreationModal
          type="channel"
          title="Create New Channel"
          description={`Designate a new space for ${activeServer?.name || "your team"}'s collective focus.`}
          icon="#"
          inputLabel="Channel Name"
          placeholder="general-chat"
          buttonText="Create"
          value={newChannelName}
          onChange={setNewChannelName}
          onSubmit={handleCreateChannel}
          onClose={() => setShowChannelModal(false)}
        />
      )}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={handleUpdateChannel} handleDelete={handleDeleteChannel} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}
