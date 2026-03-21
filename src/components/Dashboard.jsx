import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import toast, { Toaster } from 'react-hot-toast'
import { createP2PSignalingChannel, createPeerConnection } from '../lib/p2pSignaling'
import { generateEcdhKeyPair, exportPublicKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm, encryptBinaryAesGcm, decryptBinaryAesGcm, fingerprintKey } from '../lib/crypto'
import { cacheMessage, cacheThumbnail } from '../lib/cacheManager'

import ServerCreationModal from './modals/ServerCreation'
import ServerSettingsModal from './modals/ServerSettings'
import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'
import JoinServerModal from './modals/JoinServer'
import StartDMModal from './modals/StartDirectMessages'

const THEME_COLORS = [
  { name: 'Blue', value: '59 130 246' },
  { name: 'Pink', value: '236 72 153' },
  { name: 'Green', value: '16 185 129' },
  { name: 'Purple', value: '139 92 246' },
  { name: 'Orange', value: '245 158 11' },
  { name: 'Red', value: '239 68 68' },
  { name: 'Slate', value: '100 116 139' }
]

export default function Dashboard({ session }) {
  const [view, setView] = useState('home')
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [dms, setDms] = useState([])
  const [activeDm, setActiveDm] = useState(null)
  const [activeTheme, setActiveTheme] = useState('59 130 246')

  const [onlineUsers, setOnlineUsers] = useState([])
  const [serverMembers, setServerMembers] = useState([])
  const [channelReads, setChannelReads] = useState({})
  const [friendRequests, setFriendRequests] = useState([])

  const [showRightSidebar, setShowRightSidebar] = useState(true)
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
    
    const savedTheme = localStorage.getItem('dashboard-theme')
    if (savedTheme) {
      setActiveTheme(savedTheme)
      document.documentElement.style.setProperty('--accent', savedTheme)
    } else {
      document.documentElement.style.setProperty('--accent', '59 130 246')
      localStorage.setItem('dashboard-theme', '59 130 246')
    }

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
    const { data } = await supabase
      .from('friendships')
      .select('id, sender_id, profiles!fk_sender(username, avatar_url, unique_tag)')
      .eq('receiver_id', session.user.id)
      .eq('status', 'pending')
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
    } catch {
      toast.error("Failed to accept request.")
    }
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await supabase.from('friendships').delete().eq('id', requestId)
      fetchFriendRequests()
    } catch {
      toast.error("Failed to decline request.")
    }
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
              if (decoded.type === 'encrypted') {
                if (!sharedKeyRef.current) return
                const decrypted = await decryptWithAesGcm(sharedKeyRef.current, decoded.payload)
                const parsed = JSON.parse(decrypted)
                if (parsed.type === 'text') {
                  setMessages((prev) => [...prev, { profile_id: payload.from, content: parsed.text, created_at: new Date().toISOString(), profiles: { username: 'Peer' } }])
                }
              }
            } catch (e) {
              console.error(e)
            }
          },
          onOpen: () => setP2pStatus('connected'),
          onClose: () => setP2pStatus('disconnected'),
          onIce: async (candidate) => {
            await sendSignal({ type: 'ice-candidate', to: payload.from, from: session.user.id, candidate })
          }
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

      if (payload.type === 'answer') {
        if (!p2pRef.current.connection) return
        await p2pRef.current.connection.setRemoteDescription(payload.answer)
      }

      if (payload.type === 'ice-candidate') {
        if (payload.candidate && p2pRef.current.connection) {
          await p2pRef.current.connection.addIceCandidate(payload.candidate)
        }
      }

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

  const handleThemeChange = (colorValue) => {
    setActiveTheme(colorValue)
    document.documentElement.style.setProperty('--accent', colorValue)
    localStorage.setItem('dashboard-theme', colorValue)
  }

  const fetchServers = async () => {
    try {
      const { data, error } = await supabase.from('servers').select('*, server_members!inner(*)').eq('server_members.profile_id', session.user.id)
      if (error) throw error
      if (data) setServers(data)
    } catch {
      toast.error("Failed to load servers")
    }
  }

 const fetchDms = async () => {
    const { data: myRooms, error: roomError } = await supabase
      .from('dm_members')
      .select('dm_room_id')
      .eq('profile_id', session.user.id)

    if (roomError || !myRooms || myRooms.length === 0) {
      setDms([])
      return
    }

    const roomIds = myRooms.map(r => r.dm_room_id)
    const { data: otherMembers } = await supabase
      .from('dm_members')
      .select('dm_room_id, profiles!inner(id, username, avatar_url, unique_tag)')
      .in('dm_room_id', roomIds)
      .neq('profile_id', session.user.id)

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
          
          if (channelsRes.error) throw channelsRes.error
          
          setChannels(channelsRes.data || [])
          if (channelsRes.data?.length > 0) setActiveChannel(channelsRes.data[0])
          
          if (membersRes.data) setServerMembers(membersRes.data)
          
          if (readsRes.data) {
            const readsMap = {}
            readsRes.data.forEach(r => readsMap[r.channel_id] = r.last_read_at)
            setChannelReads(readsMap)
          }
        } catch {
          toast.error("Failed to load server data")
        }
      }
      getServerData()
    }
  }, [activeServer?.id, view, session.user.id])

  useEffect(() => {
    if (view !== 'server' || !activeServer) return
    
    const channelSub = supabase.channel('server-channels-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels', filter: `server_id=eq.${activeServer.id}` }, (payload) => {
         setChannels(current => current.map(c => c.id === payload.new.id ? { ...c, last_message_at: payload.new.last_message_at } : c))
      })
      .subscribe()
      
    return () => supabase.removeChannel(channelSub)
  }, [activeServer?.id, view])

  useEffect(() => {
    if (view === 'server' && activeChannel) {
      const markAsRead = async () => {
        const now = new Date().toISOString()
        setChannelReads(prev => ({ ...prev, [activeChannel.id]: now }))
        
        await supabase.from('channel_reads').upsert({
          profile_id: session.user.id,
          channel_id: activeChannel.id,
          last_read_at: now
        }, { onConflict: 'profile_id, channel_id' })
      }
      markAsRead()
    }
  }, [activeChannel?.id, activeChannel, view, messages, session.user.id])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    
    if (!targetId) {
      setMessages([])
      return
    }

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
        if (newMsg.profile_id === session.user.id) {
          newMsg.profiles = { username: session.user.user_metadata.username, avatar_url: session.user.user_metadata.avatar_url }
        }
        setMessages(prev => [...prev, newMsg])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
      if (payload.eventType === 'UPDATE' && payload.new[field] === targetId) {
        setMessages((current) => current.map((msg) => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg))
      }
      if (payload.eventType === 'DELETE') {
        setMessages((current) => current.filter((msg) => msg.id !== payload.old.id))
      }
    }).subscribe()

    return () => supabase.removeChannel(sub)
  }, [activeChannel?.id, activeDm?.dm_room_id, view, session.user.id, session.user.user_metadata])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const text = newMessage.trim()
    setNewMessage('')

    if (view === 'server' && !activeChannel?.id) {
      toast.error('Select a channel first')
      return
    }
    if (view === 'home' && !activeDm?.dm_room_id) {
      toast.error('Select a direct message chat first')
      return
    }

    if (p2pRef.current?.connection && p2pRef.current?.connection.connectionState === 'connected' && sharedKeyRef.current) {
      try {
        const encrypted = await encryptWithAesGcm(sharedKeyRef.current, JSON.stringify({ type: 'text', text }))
        p2pRef.current.dataChannel?.send(JSON.stringify({ type: 'encrypted', payload: encrypted }))
        setMessages((prev) => [...prev, {
          id: `local-${Date.now()}`,
          profile_id: session.user.id,
          content: text,
          created_at: new Date().toISOString(),
          profiles: { username: session.user.user_metadata?.username }
        }])
        cacheMessage(activeDm?.dm_room_id || activeChannel?.id || 'global', { id: `local-${Date.now()}`, content: text, created_at: new Date().toISOString() })
      } catch {
        toast.error('Failed to send encrypted P2P message')
      }
      return
    }

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) {
      toast.error('Select a channel or DM first before sending messages.')
      setNewMessage(text)
      return
    }

    try {
      const payload = {
        profile_id: session.user.id,
        content: text,
        [field]: targetId
      }
      const { data, error } = await supabase.from('messages').insert([payload])
      if (error) {
        throw error
      }
      cacheMessage(targetId, { content: text, created_at: new Date().toISOString() })
      if (data?.[0]) {
        setMessages((prev) => [...prev, data[0]])
      }
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
        setMessages((prev) => [...prev, {
          id: `local-image-${Date.now()}`,
          profile_id: session.user.id,
          content: `[Encrypted image: ${file.name}]`,
          image_url: thumbUrl,
          created_at: new Date().toISOString(),
          profiles: { username: session.user.user_metadata?.username }
        }])
        toast.success('Encrypted image sent P2P')
      } else {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${session.user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = await supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath)

        const field = view === 'server' ? 'channel_id' : 'dm_room_id'
        const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
        if (!targetId) {
          toast.error('Select a channel or DM before sending images.')
          return
        }
        const { error: msgError } = await supabase.from('messages').insert([{
          profile_id: session.user.id,
          content: '',
          image_url: publicUrl,
          [field]: targetId
        }])

        if (msgError) throw msgError
        cacheThumbnail(targetId || 'global', publicUrl)
        toast.success('Image uploaded')
      }
    } catch {
      toast.error('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const startP2PHandshake = async () => {
    if (!activeDm?.profiles?.id) {
      toast.error('Select a direct message peer first')
      return
    }

    setP2pStatus('handshaking')
    const peerId = activeDm.profiles.id
    const localEcdh = await generateEcdhKeyPair()
    localEcdhRef.current = localEcdh

    const pc = createPeerConnection({
      onData: async (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'encrypted') {
            if (!sharedKeyRef.current) return
            const decrypted = await decryptWithAesGcm(sharedKeyRef.current, payload.payload)
            const parsed = JSON.parse(decrypted)
            setMessages((prev) => [...prev, {
              id: `p2p-${Date.now()}`,
              profile_id: peerId,
              content: parsed.text,
              created_at: new Date().toISOString(),
              profiles: { username: activeDm.profiles.username }
            }])
          }
          if (payload.type === 'encrypted-image') {
            if (!sharedKeyRef.current) return
            const decryptedBuffer = await decryptBinaryAesGcm(sharedKeyRef.current, payload.payload)
            const blob = new Blob([decryptedBuffer], { type: payload.fileType })
            const url = URL.createObjectURL(blob)
            cacheThumbnail(activeDm.dm_room_id, url)
            setMessages((prev) => [...prev, {
              id: `p2p-image-${Date.now()}`,
              profile_id: peerId,
              content: `[Image from peer]`,
              image_url: url,
              created_at: new Date().toISOString(),
              profiles: { username: activeDm.profiles.username }
            }])
          }
        } catch {
          // Ignore err
        }
      },
      onOpen: () => setP2pStatus('connected'),
      onClose: () => setP2pStatus('disconnected'),
      onIce: async (candidate) => {
        await p2pRef.current.sendSignal({
          type: 'ice-candidate',
          from: session.user.id,
          to: peerId,
          candidate
        })
      }
    })

    p2pRef.current.connection = pc.pc
    const dataChannel = pc.createDataChannel('messapp-datachannel')
    p2pRef.current.dataChannel = dataChannel

    const offer = await pc.createOffer()
    await pc.pc.setLocalDescription(offer)
    await p2pRef.current.sendSignal({
      type: 'offer',
      from: session.user.id,
      to: peerId,
      offer
    })

    const localPub = await exportPublicKey(localEcdh.publicKey)
    await p2pRef.current.sendSignal({
      type: 'ecdh-key',
      from: session.user.id,
      to: peerId,
      publicKey: localPub
    })

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
    } catch {
      toast.error("Failed to update message")
    }
  }

  const handleDeleteMessage = async (id) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', id)
      if (error) throw error
      toast.success("Message deleted")
    } catch {
      toast.error("Failed to delete message")
    }
  }

  const handleCreateServer = async (e) => {
    e.preventDefault()
    if (!newServerName.trim()) return
    try {
      const { data: serverData, error } = await supabase.from('servers').insert([{ name: newServerName.trim(), owner_id: session.user.id }]).select().single()
      if (error) throw error
      
      if (serverData) {
        const memberRes = await supabase.from('server_members').insert([{ server_id: serverData.id, profile_id: session.user.id, role: 'owner' }])
        if (memberRes.error) throw memberRes.error
        setServers((prev) => [...prev, serverData])
        handleServerClick(serverData)
        setNewServerName('')
        setShowCreateModal(false)
        toast.success(`Server created successfully.`)
      }
    } catch {
      toast.error("Failed to create server")
    }
  }

  const handleCreateChannel = async (e) => {
      e.preventDefault()
      if (!activeServer) {
        toast.error('Select a server first')
        return
      }
      const cleaned = newChannelName.trim().toLowerCase().replace(/\s+/g, '-')
      if (!cleaned) {
        toast.error('Channel name is required')
        return
      }
      try {
        const { data: channelData, error } = await supabase.from('channels').insert([{ server_id: activeServer.id, name: cleaned, type: 'text' }]).select().single()
        if (error) throw error
        setChannels((prev) => [...prev, channelData])
        setActiveChannel(channelData)
        setNewChannelName('')
        setShowChannelModal(false)
      } catch {
        toast.error('Could not create channel')
      }
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
          if (remainingChannels[0]) {
            setMessages([])
          }
        }
      } catch {
        toast.error('Failed to delete channel')
      } finally {
        setShowChannelSettings(false)
      }
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
      } catch {
        toast.error('Could not delete server')
      } finally {
        setShowServerSettings(false)
      }
  }

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const lowerQuery = searchQuery.toLowerCase();
    return messages.filter(m =>
      m.content.toLowerCase().includes(lowerQuery) ||
      m.profiles?.username?.toLowerCase().includes(lowerQuery)
    );
  }, [messages, searchQuery]);

  return (
    <div className="flex h-screen w-full bg-surface text-on-surface overflow-hidden text-on-background selection:bg-primary/30 min-h-screen">
      <Toaster position="top-center" toastOptions={{ style: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' } }} />
      
      {/* SIDE NAV BAR (Vertical Rail) */}
      <nav className="fixed left-0 top-0 h-full flex flex-col items-center py-6 z-50 bg-slate-950/70 backdrop-blur-xl docked w-20 border-r border-white/5">
        <div className="mb-8 group cursor-pointer" onClick={handleHomeClick}>
          <div className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 ${view === 'home' ? 'bg-primary shadow-[0_0_15px_rgba(184,196,255,0.3)] text-on-primary-fixed' : 'bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10'}`}>
            <span className="material-symbols-outlined font-bold">home_app_logo</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 items-center flex-1 overflow-y-auto custom-scrollbar w-full">
          {servers.map(s => (
            <button
              key={s.id}
              onClick={() => handleServerClick(s)}
              className={`relative group p-3 rounded-xl transition-all duration-300 scale-95 active:scale-90 ${activeServer?.id === s.id && view === 'server' ? 'bg-[#b8c4ff]/10 text-[#b8c4ff] shadow-[0_0_15px_rgba(184,196,255,0.2)]' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
            >
              {activeServer?.id === s.id && view === 'server' && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"></span>
              )}
              <span className="font-bold text-lg">{s.name[0].toUpperCase()}</span>
            </button>
          ))}

          <div className="w-8 h-[1px] bg-outline-variant/30 my-2"></div>

          <button onClick={() => setShowCreateModal(true)} className="group p-3 text-slate-500 hover:text-slate-300 transition-colors hover:bg-white/5 rounded-xl duration-300 scale-95 active:scale-90">
            <span className="material-symbols-outlined">add</span>
          </button>
          <button onClick={() => setShowJoinModal(true)} className="group p-3 text-slate-500 hover:text-slate-300 transition-colors hover:bg-white/5 rounded-xl duration-300 scale-95 active:scale-90">
            <span className="material-symbols-outlined">explore</span>
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-4 items-center">
          <button onClick={() => { setShowRightSidebar(true); setRightTab('notifications'); }} className="group p-3 text-slate-500 hover:text-slate-300 transition-colors hover:bg-white/5 rounded-xl duration-300 scale-95 active:scale-90 relative">
            <span className="material-symbols-outlined">notifications</span>
            {friendRequests.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
          </button>
          <button onClick={() => setShowUserSettings(true)} className="group p-3 text-slate-500 hover:text-slate-300 transition-colors hover:bg-white/5 rounded-xl duration-300 scale-95 active:scale-90">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </nav>

      {/* CHANNEL LIST SIDEBAR (Left-Middle) */}
      <aside className="ml-20 w-72 h-full bg-surface-container-low flex flex-col border-r border-white/5 shrink-0 z-40">
        <header className="h-16 px-6 flex items-center justify-between border-b border-white/5">
          <h2 className="font-headline font-bold text-on-surface tracking-tight truncate">
            {view === 'home' ? 'Direct Messages' : activeServer?.name}
          </h2>
          {view === 'server' && activeServer?.owner_id === session.user.id && (
            <button onClick={() => { setServerSettingsName(activeServer.name); setShowServerSettings(true); }} className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer p-1.5 hover:bg-white/10 rounded-lg">
              <span className="material-symbols-outlined text-sm">settings</span>
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8">
          {view === 'home' ? (
            <section className="px-3">
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Direct Messages</span>
                <span className="material-symbols-outlined text-xs text-on-surface-variant cursor-pointer hover:text-white" onClick={() => setShowDmModal(true)}>add</span>
              </div>
              <div className="space-y-1">
                {dms.map(dm => (
                  <div key={dm.dm_room_id} onClick={() => setActiveDm(dm)} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group ${activeDm?.dm_room_id === dm.dm_room_id ? 'bg-surface-container-high text-primary font-medium' : 'hover:bg-white/5 text-on-surface-variant hover:text-on-surface'}`}>
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest object-cover flex items-center justify-center overflow-hidden">
                        {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="font-bold text-sm uppercase">{dm.profiles.username[0]}</span>}
                      </div>
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-surface-container-low rounded-full ${onlineUsers.includes(dm.profiles.id) ? 'bg-emerald-500' : 'bg-outline'}`}></span>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className={`text-sm font-medium truncate ${activeDm?.dm_room_id === dm.dm_room_id ? 'text-primary' : 'text-on-surface'}`}>{dm.profiles.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="px-3">
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">Channels</span>
                {activeServer?.owner_id === session.user.id && (
                  <span className="material-symbols-outlined text-xs text-on-surface-variant cursor-pointer hover:text-white" onClick={() => setShowChannelModal(true)}>add</span>
                )}
              </div>
              <div className="space-y-0.5">
                {channels.map(c => {
                  const hasNewMessage = c.last_message_at && (!channelReads[c.id] || new Date(c.last_message_at) > new Date(channelReads[c.id]))
                  const isUnread = c.id !== activeChannel?.id && hasNewMessage

                  return (
                    <div key={c.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all ${activeChannel?.id === c.id ? 'bg-surface-container-high text-primary font-medium' : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface'}`}>
                      <div onClick={() => setActiveChannel(c)} className="flex-1 flex items-center gap-3 min-w-0">
                        <span className={`text-on-surface-variant transition-colors ${activeChannel?.id === c.id ? 'text-primary' : 'group-hover:text-primary'}`}>#</span>
                        <span className={`text-sm truncate ${isUnread ? 'text-white font-bold' : ''}`}>{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeServer?.owner_id === session.user.id && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setChannelToEdit(c); setChannelSettingsName(c.name); setShowChannelSettings(true); }} 
                            className="text-on-surface-variant hover:text-white p-1 rounded-md hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">settings</span>
                          </button>
                        )}
                        {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="p-4 bg-surface-container border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setShowUserSettings(true)}>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-primary-container object-cover flex items-center justify-center overflow-hidden">
                  {myAvatar ? <img src={myAvatar} className="w-full h-full object-cover"/> : <span className="font-bold text-sm text-white">{session.user.user_metadata?.username?.charAt(0) || 'U'}</span>}
                </div>
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-surface-container rounded-full"></div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-on-surface tracking-tight truncate max-w-[100px]">{session.user.user_metadata?.username}</span>
                <span className="text-[10px] text-on-surface-variant truncate max-w-[100px]">{session.user.user_metadata?.unique_tag}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  supabase.auth.signOut();
                }}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-all"
                title="Log Out"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
              </button>
            </div>
          </div>
        </footer>
      </aside>

      {/* MAIN CHAT INTERFACE (Right) */}
      <main className="flex-1 h-screen flex flex-col bg-surface relative min-w-0">
        <header className="h-16 flex items-center justify-between px-8 z-40 bg-slate-950/80 backdrop-blur-md border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {view === 'home' && activeDm ? (
              <div className="flex items-center gap-4 min-w-0 shrink-0"><span className="text-2xl text-on-surface-variant font-light shrink-0">@</span><h1 className="font-headline font-black text-white text-lg tracking-tight truncate">{activeDm.profiles.username}</h1></div>
            ) : view === 'server' && activeChannel ? (
              <div className="flex items-center gap-4 min-w-0 shrink-0"><span className="text-2xl text-on-surface-variant font-light shrink-0">#</span><h1 className="font-headline font-black text-white text-lg tracking-tight truncate">{activeChannel.name}</h1></div>
            ) : (
              <h1 className="font-headline font-black text-white text-lg tracking-tight shrink-0 truncate">Welcome</h1>
            )}
            <div className="w-[1px] h-6 bg-outline-variant/30 mx-2 shrink-0 hidden sm:block"></div>
          </div>
          <div className="flex items-center gap-6 shrink-0 ml-4">
            <div className="hidden md:flex gap-6 items-center">
              {view === 'server' && <button onClick={() => { setShowRightSidebar(true); setRightTab('members'); }} className={`font-['Plus_Jakarta_Sans'] font-medium text-sm tracking-wide transition-all ${rightTab === 'members' && showRightSidebar ? 'text-primary' : 'text-on-surface-variant hover:text-slate-200'}`}>Members</button>}
              <button onClick={() => { setShowRightSidebar(true); setRightTab('search'); }} className={`font-['Plus_Jakarta_Sans'] font-medium text-sm tracking-wide transition-all ${rightTab === 'search' && showRightSidebar ? 'text-primary' : 'text-on-surface-variant hover:text-slate-200'}`}>Search</button>
              <button onClick={() => { setShowRightSidebar(true); setRightTab('info'); }} className={`font-['Plus_Jakarta_Sans'] font-medium text-sm tracking-wide transition-all ${rightTab === 'info' && showRightSidebar ? 'text-primary' : 'text-on-surface-variant hover:text-slate-200'}`}>Library</button>
            </div>
            <div className="flex items-center gap-3 relative">
              <button onClick={() => { setShowRightSidebar(true); setRightTab('notifications'); }} className={`material-symbols-outlined p-2 rounded-lg transition-all relative ${rightTab === 'notifications' && showRightSidebar ? 'text-primary bg-white/5' : 'text-on-surface-variant hover:bg-white/5'}`}>
                notifications
                {friendRequests.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10" ref={scrollContainerRef}>
              {(activeChannel || activeDm) && (
                <section className="max-w-2xl mb-10">
                  <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center mb-4">
                    <span className="text-3xl font-bold text-on-primary-container">{view === 'home' ? '@' : '#'}</span>
                  </div>
                  <h2 className="text-4xl font-black font-headline tracking-tighter mb-2">Welcome to {view === 'home' ? `@${activeDm.profiles.username}` : `#${activeChannel.name}`}</h2>
                  <p className="text-on-surface-variant font-medium leading-relaxed">This is the beginning of your conversation on MessApp. Say hello, start a topic, and connect without the mess. Keep it secure, fun, and clutter-free.</p>
                </section>
              )}

              <div className="space-y-8">
                {filteredMessages.map(m => (
                  <div key={m.id} className="flex gap-5 group">
                    <div className="relative">
                      <div className="w-11 h-11 rounded-xl bg-surface-container-highest mt-1 shadow-lg overflow-hidden flex items-center justify-center">
                        {m.profiles?.avatar_url ? <img src={m.profiles?.avatar_url} className="w-full h-full object-cover"/> : <span className="font-bold text-lg uppercase text-white">{m.profiles?.username?.[0] || '?'}</span>}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className={`font-bold tracking-tight ${m.profile_id === session.user.id ? 'text-primary' : 'text-on-surface'}`}>{m.profiles?.username}</span>
                        <span className="text-[10px] font-medium text-on-surface-variant">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {editingMessageId === m.id ? (
                        <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1">
                          <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full bg-surface-container-low text-white px-4 py-2.5 rounded-xl border border-primary outline-none text-sm" autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
                          <span className="text-[10px] text-on-surface-variant mt-1 block">Press Enter to save, Esc to cancel</span>
                        </form>
                      ) : (
                        <>
                          <div className={`max-w-3xl p-5 rounded-2xl rounded-tl-none border backdrop-blur-sm ${m.profile_id === session.user.id ? 'bg-surface-container-low border-white/[0.03]' : 'bg-surface-container-high/40 border-white/[0.05]'}`}>
                            <div className="text-on-surface leading-relaxed text-[15px] markdown-body">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ inline, className, children, ...props}) {
                                    const match = /language-(\w+)/.exec(className || '')
                                    return !inline && match ? (
                                      <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 border border-white/10 text-sm shadow-lg" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                    ) : (
                                      <code className="bg-black/40 text-primary px-1.5 py-0.5 rounded-md font-mono text-xs border border-white/5" {...props}>{children}</code>
                                    )
                                  },
                                  a({...props}) { return <a className="text-primary hover:underline" target="_blank" rel="noreferrer" {...props} /> }
                                }}
                              >
                                {m.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                          {m.image_url && (
                            <div className="max-w-lg mt-3">
                              <div className="aspect-video w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative group/img cursor-zoom-in">
                                <a href={m.image_url} target="_blank" rel="noreferrer">
                                  <img src={m.image_url} alt="attachment" className="w-full h-full object-cover transition-all duration-700" />
                                  <div className="absolute inset-0 bg-primary/10 mix-blend-overlay opacity-0 group-hover/img:opacity-100 transition-opacity"></div>
                                </a>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {m.profile_id === session.user.id && editingMessageId !== m.id && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 items-start mt-2 bg-surface-container-highest p-1 rounded-lg border border-white/5 shadow-lg h-fit">
                        <button onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); }} className="text-on-surface-variant hover:text-white p-1 hover:bg-white/5 rounded-md transition-all"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                        <button onClick={() => handleDeleteMessage(m.id)} className="text-error hover:text-error-dim p-1 hover:bg-error/10 rounded-md transition-all"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {(activeChannel || activeDm) && (
              <footer className="p-6 bg-gradient-to-t from-surface to-transparent shrink-0">
                <div className="max-w-5xl mx-auto relative">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-4 bg-surface-container-low border border-white/5 rounded-2xl p-3 shadow-2xl focus-within:border-primary/30 transition-all duration-300">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-on-surface-variant hover:text-on-surface transition-all"
                    >
                      <span className={`material-symbols-outlined ${isUploading ? 'animate-pulse' : ''}`}>add_circle</span>
                    </button>
                    <textarea
                      className="flex-1 bg-transparent border-none focus:ring-0 text-sm placeholder-on-surface-variant font-medium outline-none text-white resize-none h-[22px] max-h-[150px] custom-scrollbar pt-[1px]"
                      placeholder={view === 'home' ? `Message @${activeDm?.profiles?.username}` : `Message #${activeChannel?.name}`}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage(e)
                        }
                      }}
                      rows={1}
                    />
                    <div className="flex items-center gap-2 pr-2">
                      <button type="submit" className="material-symbols-outlined p-2 text-on-surface-variant hover:text-primary transition-all">send</button>
                    </div>
                  </form>
                </div>
              </footer>
            )}
          </div>

          {showRightSidebar && (
            <aside className="w-64 h-full bg-surface-container-low border-l border-white/5 hidden lg:flex flex-col shrink-0">
              <header className="h-16 flex items-center px-6 border-b border-white/5 justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {rightTab === 'members' ? `Members — ${serverMembers.length}` :
                   rightTab === 'search' ? 'Search' :
                   rightTab === 'notifications' ? 'Notifications' : 'Info'}
                </span>
                <button onClick={() => setShowRightSidebar(false)} className="text-on-surface-variant hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                {rightTab === 'notifications' && (
                  <div>
                    <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-4">Friend Requests</h3>
                    {friendRequests.length === 0 ? (
                      <p className="text-on-surface-variant text-sm mt-4">No pending requests.</p>
                    ) : (
                      <div className="space-y-4">
                        {friendRequests.map(req => (
                          <div key={req.id} className="bg-surface-container-highest p-4 rounded-xl border border-white/5">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="h-10 w-10 rounded-xl bg-surface-container-lowest overflow-hidden border border-white/5 shrink-0 flex items-center justify-center">
                                {req.profiles?.avatar_url ? (
                                  <img src={req.profiles.avatar_url} className="h-full w-full object-cover"/>
                                ) : (
                                  <span className="font-bold text-sm text-white flex items-center justify-center h-full uppercase">{req.profiles?.username?.[0]}</span>
                                )}
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-sm font-bold text-white truncate">{req.profiles?.username}</div>
                                <div className="text-[10px] text-on-surface-variant font-mono truncate">{req.profiles?.unique_tag}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleAcceptRequest(req)} className="flex-1 bg-primary text-on-primary-fixed text-xs py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 cursor-pointer">
                                Accept
                              </button>
                              <button onClick={() => handleDeclineRequest(req.id)} className="flex-1 bg-surface-container-lowest text-on-surface text-xs py-2 rounded-lg font-bold transition-all border border-white/5 flex items-center justify-center gap-1 cursor-pointer hover:bg-error hover:text-on-error hover:border-error">
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {rightTab === 'members' && view === 'server' && (
                  <div className="space-y-4">
                    {serverMembers.map(m => {
                      const isOnline = onlineUsers.includes(m.profiles.id)
                      return (
                        <div key={m.profiles.id} className={`flex items-center gap-3 group cursor-pointer transition-opacity ${isOnline ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-surface-container-highest object-cover flex items-center justify-center overflow-hidden">
                              {m.profiles.avatar_url ? <img src={m.profiles.avatar_url} className="w-full h-full object-cover"/> : <span className="font-bold text-xs uppercase text-white">{m.profiles.username[0]}</span>}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-surface-container-low rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-outline'}`} />
                          </div>
                          <div className="flex flex-col truncate">
                            <span className={`text-xs font-medium truncate ${isOnline ? 'text-white' : 'text-on-surface'}`}>{m.profiles.username}</span>
                            {m.role === 'owner' && <span className="text-[9px] text-primary uppercase tracking-wider font-bold">Owner</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                
                {rightTab === 'search' && (
                  <div>
                    <div className="bg-surface-container-highest border border-white/5 rounded-xl flex items-center px-3 py-2 mb-4 focus-within:border-primary/50 transition-all">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant mr-2">search</span>
                      <input 
                        type="text" 
                        placeholder="Search messages..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-white text-sm w-full"
                      />
                    </div>
                    {searchQuery && filteredMessages.length === 0 && (
                      <div className="text-center text-on-surface-variant text-sm mt-8">No results found.</div>
                    )}
                    {searchQuery && filteredMessages.length > 0 && (
                      <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-3">{filteredMessages.length} Results</div>
                    )}
                  </div>
                )}

                {rightTab === 'info' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-4">Settings</h3>
                      <div className="bg-surface-container-highest p-4 rounded-xl border border-white/5">
                        <span className="text-xs font-bold text-white mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-primary">palette</span> Personal Theme</span>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {THEME_COLORS.map(c => (
                            <button key={c.name} onClick={() => handleThemeChange(c.value)} className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${activeTheme === c.value ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'}`} style={{ backgroundColor: `rgb(${c.value})` }} title={c.name} />
                          ))}
                        </div>
                      </div>
                    </div>
                    {view === 'home' && activeDm && (
                      <div>
                        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-4">Security</h3>
                        <div className="bg-surface-container-highest p-4 rounded-xl border border-white/5">
                          <button onClick={startP2PHandshake} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-bold border border-emerald-500/20">
                            Secure P2P Connect
                          </button>
                          <div className="text-[10px] text-on-surface-variant mt-3 text-center uppercase tracking-widest">Status: {p2pStatus}</div>
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
