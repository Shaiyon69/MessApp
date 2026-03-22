import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
// Added UserPlus to the import list below
import { Settings, Pen, Send, LogOut, Plus, Hash, Compass, Home, MessageSquare, Palette, Users, ImagePlus, Search, Info, X, Bell, Trash2, Check, UserX, UserPlus } from 'lucide-react'
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
    } catch (_err) { // Ignore err

      toast.error("Failed to accept request.")
    }
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await supabase.from('friendships').delete().eq('id', requestId)
      fetchFriendRequests()
    } catch (_err) { // Ignore err

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
            } catch (_e) {
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
    } catch (_err) { // Ignore err

      toast.error("Failed to load servers")
    }
  }

  const fetchDms = async () => {
    const { data } = await supabase
      .from('dm_members')
      .select('dm_room_id, profiles!inner(id, username, avatar_url, unique_tag)')
      .neq('profile_id', session.user.id)
    if (data) setDms(data)
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
        } catch (_err) { // Ignore err

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
      } catch (_err) { // Ignore err

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
    } catch (_err) { // Ignore err

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
    } catch (_err) { // Ignore err

      toast.error('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
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
        } catch (_err) { // Ignore err

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
    } catch (_err) { // Ignore err

      toast.error("Failed to update message")
    }
  }

  const handleDeleteMessage = async (id) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', id)
      if (error) throw error
      toast.success("Message deleted")
    } catch (_err) { // Ignore err

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
    } catch (_err) { // Ignore err

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
      } catch (_err) { // Ignore err

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
      } catch (_err) { // Ignore err

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
      } catch (_err) { // Ignore err

        toast.error('Could not delete server')
      } finally {
        setShowServerSettings(false)
      }
  }

  const filteredMessages = searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase())) : messages



  return (
    <div className="flex h-screen w-screen bg-surface text-on-surface overflow-hidden">
      <Toaster position="top-center" toastOptions={{ style: { background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface)' } }} />
      
      {/* SIDEBAR RAIL */}
      <aside className="fixed left-0 top-0 h-full flex flex-col items-center py-6 z-50 bg-slate-50 dark:bg-slate-900 w-20 border-r-0 font-body text-sm antialiased shrink-0">
        <div className="mb-10">
          <span className="text-indigo-700 dark:text-indigo-300 font-semibold tracking-tight text-xl">M</span>
        </div>
        <nav className="flex flex-col gap-8 flex-1">
          {/* Active Tab: DMs (Dashboard Home) */}
          <button
            onClick={handleHomeClick}
            className={`group flex flex-col items-center gap-1 relative ${view === 'home' ? 'text-indigo-600 dark:text-indigo-400 after:absolute after:left-0 after:h-8 after:w-1 after:bg-indigo-600 after:rounded-r-full active:scale-95 transition-transform duration-150' : 'text-slate-400 hover:text-indigo-400 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded-lg'}`}
          >
            <span className="material-symbols-outlined text-[28px]" aria-hidden="true" style={view === 'home' ? {fontVariationSettings: "'FILL' 1"} : {}}>forum</span>
            <span className="text-[10px] font-medium">DMs</span>
          </button>

          {/* Servers list mapping in nav (simplified visually for rail) */}
          {servers.map(s => (
            <button
              key={s.id}
              onClick={() => handleServerClick(s)}
              title={s.name}
              className={`group flex flex-col items-center gap-1 relative ${activeServer?.id === s.id && view === 'server' ? 'text-indigo-600 dark:text-indigo-400 after:absolute after:left-0 after:h-8 after:w-1 after:bg-indigo-600 after:rounded-r-full active:scale-95 transition-transform duration-150' : 'text-slate-400 hover:text-indigo-400 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded-lg'}`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-xs uppercase text-on-surface">
                {s.name[0].toUpperCase()}
              </div>
            </button>
          ))}

          <button
            className="group flex flex-col items-center gap-1 text-slate-400 hover:text-indigo-400 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded-lg relative"
            onClick={() => { setShowRightSidebar(true); setRightTab('notifications'); }}
          >
            <span className="material-symbols-outlined text-[28px]" aria-hidden="true">notifications</span>
            {friendRequests.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>}
            <span className="text-[10px] font-medium">Alerts</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col items-center gap-6">
          <button
            onClick={() => setShowJoinModal(true)}
            aria-label="Join Server"
            title="Join Server"
            className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
          >
            <span className="material-symbols-outlined" aria-hidden="true">add_comment</span>
          </button>

          <div className="flex flex-col items-center gap-4 text-slate-400">
            <button onClick={() => setShowUserSettings(true)} aria-label="Settings" title="Settings" className="cursor-pointer hover:text-indigo-400 transition-colors">
              <span className="material-symbols-outlined" aria-hidden="true">settings</span>
            </button>
            <button onClick={() => setShowCreateModal(true)} aria-label="Create Server" title="Create Server" className="cursor-pointer hover:text-indigo-400 transition-colors">
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
            <button onClick={() => setShowUserSettings(true)} className="w-10 h-10 rounded-full bg-surface-container-highest overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
              {myAvatar ? <img src={myAvatar} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-sm uppercase text-on-surface">{session.user.user_metadata?.username?.charAt(0) || 'U'}</div>}
            </button>
          </div>
        </div>
      </aside>

      {/* MIDDLE SIDEBAR (Channels / DMs) */}
      <section className="ml-20 w-[360px] flex flex-col bg-surface-container-low border-r border-outline-variant/10 shrink-0">
        <header className="p-6 pb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-on-surface truncate">{view === 'home' ? 'Direct Messages' : activeServer?.name}</h1>
          {view === 'server' && activeServer?.owner_id === session.user.id && (
            <button
              onClick={() => { setServerSettingsName(activeServer.name); setShowServerSettings(true); }}
              aria-label="Server Settings"
              title="Server Settings"
              className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer p-1.5 hover:bg-surface-container-high rounded-lg"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">settings</span>
            </button>
          )}
        </header>

        <div className="px-6 mb-4">
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl" aria-hidden="true">search</span>
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 placeholder:text-outline/60"
              placeholder="Search conversations"
              type="text"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar">
          {view === 'home' ? (
             <div className="space-y-4">
                <button
                  onClick={() => setShowDmModal(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-primary-container text-on-primary-container hover:bg-primary-container/80 transition-all font-bold text-sm mx-1"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">person_add</span> Add Friend
                </button>
                <div className="space-y-1 mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-outline px-3 mb-2">Direct Messages</div>
                  {dms.map(dm => {
                    const isActive = activeDm?.dm_room_id === dm.dm_room_id;
                    const isOnline = onlineUsers.includes(dm.profiles.id);
                    return (
                      <div
                        key={dm.dm_room_id}
                        onClick={() => setActiveDm(dm)}
                        className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-colors border border-transparent ${isActive ? 'bg-surface-bright shadow-sm border-outline-variant/5' : 'hover:bg-surface-container-high text-on-surface-variant'}`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className={`w-12 h-12 rounded-full overflow-hidden ${!isActive ? 'opacity-80' : ''}`}>
                            {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} alt="" className="h-full w-full object-cover"/> : <div className="h-full w-full flex items-center justify-center font-bold text-sm uppercase bg-surface-container-highest text-on-surface">{dm.profiles.username[0]}</div>}
                          </div>
                          <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-surface-bright rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <h3 className={`font-semibold truncate ${isActive ? 'text-on-surface' : 'text-on-surface/80'}`}>{dm.profiles.username}</h3>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
             </div>
          ) : (
            <>
               <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[10px] font-bold tracking-widest text-outline uppercase">Text Channels</span>
                {activeServer?.owner_id === session.user.id && (
                  <button onClick={() => setShowChannelModal(true)} className="material-symbols-outlined text-sm text-outline cursor-pointer hover:text-primary transition-colors" aria-hidden="true" title="Create Channel">add</button>
                )}
              </div>
              <div className="space-y-0.5">
                {channels.map(c => {
                  const hasNewMessage = c.last_message_at && (!channelReads[c.id] || new Date(c.last_message_at) > new Date(channelReads[c.id]))
                  const isUnread = c.id !== activeChannel?.id && hasNewMessage
                  const isActive = activeChannel?.id === c.id

                  return (
                    <div
                      key={c.id}
                      className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all text-sm ${isActive ? 'bg-primary-dim text-white font-medium' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`}
                    >
                      <div onClick={() => setActiveChannel(c)} className="flex-1 flex items-center gap-2 min-w-0">
                        <span className={`material-symbols-outlined text-lg ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} aria-hidden="true">tag</span>
                        <span className={`truncate ${isUnread ? 'font-bold' : ''}`}>{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeServer?.owner_id === session.user.id && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setChannelToEdit(c); setChannelSettingsName(c.name); setShowChannelSettings(true); }} 
                            aria-label="Edit Channel"
                            title="Edit Channel"
                            className="text-on-surface-variant hover:text-primary p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">settings</span>
                          </button>
                        )}
                        {isUnread && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        
        {/* Profile Bottom Bar */}
        <div className="mt-auto bg-surface-container p-3 flex items-center gap-3 border-t border-outline-variant/10">
          <div className="relative flex-shrink-0 cursor-pointer group" onClick={() => setShowUserSettings(true)}>
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm border border-outline-variant/10 overflow-hidden relative">
              {myAvatar ? <img src={myAvatar} alt="Avatar" className="w-full h-full object-cover" /> : session.user.user_metadata?.username?.charAt(0) || 'U'}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="material-symbols-outlined text-white text-sm" aria-hidden="true">settings</span></div>
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-surface-container"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-on-surface truncate">{session.user.user_metadata?.username}</p>
            <p className="text-[10px] text-outline uppercase tracking-tighter truncate">{session.user.user_metadata?.unique_tag}</p>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              supabase.auth.signOut();
            }} 
            className="text-outline hover:text-error transition-colors p-1.5 rounded-lg hover:bg-error/10"
            title="Log Out"
            aria-label="Log Out"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">logout</span>
          </button>
        </div>
      </section>

      {/* CHAT CANVAS */}
      <section className="flex-1 flex flex-col min-w-0 bg-surface relative">
        <header className="h-16 px-8 flex justify-between items-center border-b border-outline-variant/10 backdrop-blur-md bg-white/80 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {view === 'home' && activeDm ? (
              <>
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                  {activeDm.profiles.avatar_url ? <img src={activeDm.profiles.avatar_url} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-xs bg-surface-container-highest text-on-surface uppercase">{activeDm.profiles.username[0]}</div>}
                </div>
                <div className="truncate">
                  <h2 className="text-lg font-semibold leading-tight truncate">{activeDm.profiles.username}</h2>
                  {onlineUsers.includes(activeDm.profiles.id) && (
                    <p className="text-[11px] text-primary flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
                    </p>
                  )}
                </div>
              </>
            ) : view === 'server' && activeChannel ? (
              <><span className="material-symbols-outlined text-outline" aria-hidden="true">tag</span><h2 className="text-lg font-semibold leading-tight truncate">{activeChannel.name}</h2></>
            ) : (
              <h2 className="text-lg font-semibold leading-tight text-on-surface-variant">Welcome</h2>
            )}
          </div>
          <div className="flex items-center gap-4 text-outline shrink-0 ml-4">
            <button onClick={() => { setShowRightSidebar(true); setRightTab('search'); }} aria-label="Search" title="Search" className={`cursor-pointer hover:text-primary transition-colors ${rightTab === 'search' && showRightSidebar ? 'text-primary' : ''}`}><span className="material-symbols-outlined" aria-hidden="true">search</span></button>
            <button onClick={() => { setShowRightSidebar(true); setRightTab('notifications'); }} aria-label="Notifications" title="Notifications" className={`relative cursor-pointer hover:text-primary transition-colors ${rightTab === 'notifications' && showRightSidebar ? 'text-primary' : ''}`}>
              <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
              {friendRequests.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-error rounded-full shadow-sm"></span>}
            </button>
            {view === 'server' && (
              <button onClick={() => { setShowRightSidebar(true); setRightTab('members'); }} aria-label="Members" title="Members" className={`cursor-pointer hover:text-primary transition-colors ${rightTab === 'members' && showRightSidebar ? 'text-primary' : ''}`}><span className="material-symbols-outlined" aria-hidden="true">group</span></button>
            )}
            <button onClick={() => { setShowRightSidebar(true); setRightTab('info'); }} aria-label="Info" title="Info" className={`cursor-pointer hover:text-primary transition-colors ${rightTab === 'info' && showRightSidebar ? 'text-primary' : ''}`}><span className="material-symbols-outlined" aria-hidden="true">info</span></button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden min-w-0">
          <div className="flex-1 flex flex-col relative overflow-hidden min-w-0">
            <div className="flex-1 overflow-y-auto p-8 space-y-8 flex flex-col custom-scrollbar" ref={scrollContainerRef}>
              {messages.length === 0 && (activeChannel || activeDm) && (
                <div className="flex-1 flex flex-col items-center justify-center text-outline/50">
                  <span className="material-symbols-outlined text-6xl mb-4" aria-hidden="true">chat</span>
                  <h3 className="text-xl font-bold text-on-surface mb-2">It's quiet here...</h3>
                  <p>Send a message to start the conversation.</p>
                </div>
              )}
              {filteredMessages.map(m => {
                const isMine = m.profile_id === session.user.id;
                return (
                <div key={m.id} className={`flex gap-4 max-w-[85%] group ${isMine ? 'flex-row-reverse ml-auto' : ''}`}>
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-1">
                    {m.profiles?.avatar_url ? <img src={m.profiles?.avatar_url} className="w-full h-full object-cover" alt=""/> : <div className="w-full h-full flex items-center justify-center font-bold text-sm bg-surface-container-highest text-on-surface uppercase">{m.profiles?.username?.[0] || '?'}</div>}
                  </div>
                  <div className={`space-y-1 flex flex-col ${isMine ? 'items-end' : ''} min-w-0`}>
                    {!isMine && <span className="text-xs font-semibold text-on-surface-variant ml-1">{m.profiles?.username}</span>}

                    {editingMessageId === m.id ? (
                      <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="w-full min-w-[200px]">
                        <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full bg-surface-container-low text-on-surface px-4 py-2 rounded-xl border border-primary outline-none shadow-sm text-sm focus:ring-2 focus:ring-primary/20" autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
                        <span className="text-[10px] text-outline mt-1 block">Press Enter to save, Esc to cancel</span>
                      </form>
                    ) : (
                      <>
                        <div className={`${isMine ? 'bg-primary text-on-primary rounded-tr-none' : 'bg-secondary-container text-on-secondary-container rounded-tl-none'} px-5 py-3 rounded-2xl leading-relaxed break-words text-sm`}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ inline, className, children, ...props}) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-lg my-2 text-xs" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                ) : (
                                  <code className="bg-black/10 px-1 rounded-md font-mono text-xs" {...props}>{children}</code>
                                )
                              },
                              a({...props}) { return <a className="underline hover:opacity-80 break-all" target="_blank" rel="noreferrer" {...props} /> }
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                        {m.image_url && (
                          <a href={m.image_url} target="_blank" rel="noreferrer">
                            <img src={m.image_url} alt="attachment" className={`mt-2 rounded-xl max-w-full md:max-w-sm max-h-72 object-cover border border-outline-variant/10 shadow-sm ${isMine ? 'rounded-tr-none' : 'rounded-tl-none'}`} />
                          </a>
                        )}
                        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-outline">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMine && <span className="material-symbols-outlined text-[12px] text-primary" aria-hidden="true">done_all</span>}
                          {isMine && editingMessageId !== m.id && (
                            <div className="flex gap-1 ml-2">
                              <button onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); }} aria-label="Edit" title="Edit" className="text-outline hover:text-primary"><span className="material-symbols-outlined text-[14px]" aria-hidden="true">edit</span></button>
                              <button onClick={() => handleDeleteMessage(m.id)} aria-label="Delete" title="Delete" className="text-outline hover:text-error"><span className="material-symbols-outlined text-[14px]" aria-hidden="true">delete</span></button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )})}
              <div ref={messagesEndRef} />
            </div>

            {(activeChannel || activeDm) && (
              <footer className="p-6 bg-surface shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-end gap-3 bg-surface-container-low rounded-[24px] p-2 pr-4 shadow-sm border border-outline-variant/10 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    aria-label="Upload file"
                    title="Upload file"
                    className={`p-2 transition-colors mb-0.5 ${isUploading ? 'opacity-50 cursor-not-allowed' : 'text-outline hover:text-primary'}`}
                  >
                    <span className={`material-symbols-outlined ${isUploading ? 'animate-pulse' : ''}`} aria-hidden="true">add_circle</span>
                  </button>
                  <textarea 
                    className="flex-1 py-3 bg-transparent border-none focus:ring-0 resize-none text-sm placeholder:text-outline/60 outline-none custom-scrollbar"
                    placeholder={view === 'home' ? `Message @${activeDm?.profiles?.username}` : `Message #${activeChannel?.name}`} 
                    value={newMessage} 
                    onChange={(e) => setNewMessage(e.target.value)} 
                    onKeyDown={handleKeyDown}
                    rows={1}
                    style={{ minHeight: '44px', maxHeight: '150px' }}
                  />
                  <div className="flex items-center gap-2 pb-1.5 shrink-0">
                    <button type="button" aria-label="Emoji" title="Emoji" className="p-2 text-outline hover:text-primary transition-colors hidden sm:block">
                      <span className="material-symbols-outlined" aria-hidden="true">mood</span>
                    </button>
                    <button
                      type="submit"
                      aria-label="Send Message"
                      title="Send Message"
                      className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md shadow-primary/20 hover:scale-105 transition-transform"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true" style={{fontVariationSettings: "'FILL' 1"}}>send</span>
                    </button>
                  </div>
                </form>
              </footer>
            )}
          </div>

          {/* RIGHT SIDEBAR (Info/Context) */}
          {showRightSidebar && (
            <div className="w-[320px] bg-surface border-l border-outline-variant/10 flex flex-col shrink-0">
              <div className="flex items-center justify-between p-4 border-b border-outline-variant/10">
                <div className="flex gap-1">
                  {view === 'server' && (
                    <button onClick={() => setRightTab('members')} aria-label="Members" title="Members" className={`p-1.5 rounded-md transition-colors ${rightTab === 'members' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-low'} flex items-center`}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">group</span></button>
                  )}
                  <button onClick={() => setRightTab('search')} aria-label="Search" title="Search" className={`p-1.5 rounded-md transition-colors ${rightTab === 'search' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-low'} flex items-center`}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">search</span></button>
                  <button onClick={() => setRightTab('notifications')} aria-label="Notifications" title="Notifications" className={`p-1.5 rounded-md transition-colors ${rightTab === 'notifications' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-low'} flex items-center relative`}>
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">notifications</span>
                    {friendRequests.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>}
                  </button>
                  <button onClick={() => setRightTab('info')} aria-label="Info" title="Info" className={`p-1.5 rounded-md transition-colors ${rightTab === 'info' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-low'} flex items-center`}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">info</span></button>
                </div>
                <button onClick={() => setShowRightSidebar(false)} aria-label="Close Sidebar" title="Close Sidebar" className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-container-low transition-colors"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                {rightTab === 'notifications' && (
                  <div>
                    <h4 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">Friend Requests</h4>
                    {friendRequests.length === 0 ? (
                      <p className="text-outline text-sm text-center mt-4">No pending requests.</p>
                    ) : (
                      <div className="space-y-3">
                        {friendRequests.map(req => (
                          <div key={req.id} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="h-10 w-10 rounded-full bg-surface-container-high overflow-hidden shrink-0">
                                {req.profiles?.avatar_url ? (
                                  <img src={req.profiles.avatar_url} className="h-full w-full object-cover" alt=""/>
                                ) : (
                                  <span className="font-bold text-sm text-on-surface flex items-center justify-center h-full uppercase">{req.profiles?.username?.[0]}</span>
                                )}
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-sm font-bold text-on-surface truncate">{req.profiles?.username}</div>
                                <div className="text-[10px] text-on-surface-variant font-mono truncate">{req.profiles?.unique_tag}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleAcceptRequest(req)} className="flex-1 bg-primary hover:bg-primary-dim text-on-primary text-xs py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer">
                                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">check</span> Accept
                              </button>
                              <button onClick={() => handleDeclineRequest(req.id)} className="flex-1 bg-error/10 hover:bg-error/20 text-error text-xs py-2 rounded-lg font-bold transition-colors border border-error/20 flex items-center justify-center gap-1 cursor-pointer">
                                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">close</span> Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {rightTab === 'members' && view === 'server' && (
                  <div>
                    <h4 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">Members — {serverMembers.length}</h4>
                    <div className="space-y-1">
                      {serverMembers.map(m => {
                        const isOnline = onlineUsers.includes(m.profiles.id)
                        return (
                          <div key={m.profiles.id} className={`flex items-center gap-3 p-2 rounded-xl transition-colors hover:bg-surface-container-low cursor-pointer ${isOnline ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="relative shrink-0">
                              <div className="h-8 w-8 rounded-full bg-surface-container-high overflow-hidden">
                                {m.profiles.avatar_url ? <img src={m.profiles.avatar_url} className="h-full w-full object-cover" alt=""/> : <div className="h-full w-full flex items-center justify-center font-bold text-xs uppercase text-on-surface">{m.profiles.username[0]}</div>}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            </div>
                            <div className="flex flex-col truncate min-w-0">
                              <span className="truncate text-sm font-medium text-on-surface">{m.profiles.username}</span>
                              {m.role === 'owner' && <span className="text-[9px] text-primary uppercase tracking-wider font-bold">Owner</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                {rightTab === 'search' && (
                  <div>
                    <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl flex items-center px-3 py-2 mb-4 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm">
                      <span className="material-symbols-outlined text-outline mr-2 text-[18px]" aria-hidden="true">search</span>
                      <input 
                        type="text" 
                        placeholder="Search messages..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-on-surface text-sm w-full"
                      />
                    </div>
                    {searchQuery && filteredMessages.length === 0 && (
                      <div className="text-center text-outline text-sm mt-8">No results found.</div>
                    )}
                    {searchQuery && filteredMessages.length > 0 && (
                      <div className="text-[10px] font-bold text-outline uppercase tracking-widest mb-3">{filteredMessages.length} Results</div>
                    )}
                  </div>
                )}

                {rightTab === 'info' && (
                  <div>
                    <h4 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">Settings & Info</h4>
                    <div className="bg-surface-container-low p-4 rounded-xl mb-4">
                      <span className="text-xs font-bold text-on-surface mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">palette</span> Personal Theme</span>
                      <div className="flex flex-wrap gap-2">
                        {THEME_COLORS.map(c => (
                          <button
                            key={c.name}
                            onClick={() => handleThemeChange(c.value)}
                            className={`w-6 h-6 rounded-full transition-all hover:scale-110 ${activeTheme === c.value ? 'ring-2 ring-offset-2 ring-primary ring-offset-surface-container-low' : 'opacity-70 hover:opacity-100'}`}
                            style={{ backgroundColor: `rgb(${c.value})` }}
                            title={c.name}
                            aria-label={`Select ${c.name} theme`}
                          />
                        ))}
                      </div>
                    </div>
                    {view === 'home' && activeDm && (
                      <div className="bg-surface-container-low p-4 rounded-xl">
                        <button onClick={startP2PHandshake} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-bold border border-emerald-500/20 cursor-pointer">
                          Secure P2P Connect
                        </button>
                        <div className="text-[10px] text-outline mt-2 text-center">Status: <span className="font-mono">{p2pStatus}</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

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
