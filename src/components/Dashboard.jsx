import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Settings, Pen, Send, LogOut, Plus, Hash, Compass, Home, MessageSquare, Palette, Users, ImagePlus, Search, Info, X, Bell, Trash2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { createP2PSignalingChannel, createPeerConnection } from '../lib/p2pSignaling'
import { generateEcdhKeyPair, exportPublicKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm, encryptBinaryAesGcm, decryptBinaryAesGcm, fingerprintKey } from '../lib/crypto'
import { cacheMessage, getCachedMessages, pruneCache, cacheThumbnail } from '../lib/cacheManager'

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
  
  // Set Blue as default theme
  const [activeTheme, setActiveTheme] = useState('59 130 246')

  const [onlineUsers, setOnlineUsers] = useState([])
  const [serverMembers, setServerMembers] = useState([])
  const [channelReads, setChannelReads] = useState({})

  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [rightTab, setRightTab] = useState('members')
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
  const [p2pFingerprint, setP2pFingerprint] = useState('')

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const myAvatar = session.user.user_metadata?.avatar_url
  const p2pRef = useRef({ connection: null, dataChannel: null, sendSignal: null, currentRoom: null })
  const localEcdhRef = useRef(null)
  const peerEcdhRef = useRef(null)
  const sharedKeyRef = useRef(null)

  useEffect(() => {
    // 1. SELF-HEAL PROFILE DATA (Fixes the User Not Found error)
    const syncProfile = async () => {
      if (session?.user?.id && session?.user?.user_metadata) {
        const { username, unique_tag, avatar_url } = session.user.user_metadata
        
        await supabase.from('profiles').upsert({
          id: session.user.id,
          username: username || session.user.email.split('@')[0],
          unique_tag: unique_tag,
          avatar_url: avatar_url || null
        }, { onConflict: 'id' }) // This forces the database to update their public profile
      }
    }
    syncProfile()

    // 2. Fetch standard data
    fetchServers()
    fetchDms()
    
    // 3. Setup Theme
    const savedTheme = localStorage.getItem('dashboard-theme')
    if (savedTheme) {
      setActiveTheme(savedTheme)
      document.documentElement.style.setProperty('--accent', savedTheme)
    } else {
      document.documentElement.style.setProperty('--accent', '59 130 246')
      localStorage.setItem('dashboard-theme', '59 130 246')
    }

    // 4. Presence Sync
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

    return () => supabase.removeChannel(presenceChannel)
  }, [session]) // Depend on session so it runs when user logs in

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
              console.error('P2P decrypt error', e)
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

   
  // Message Fetching & Subscription
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
        is_encrypted: false,
        [field]: targetId
      }
      const { data, error } = await supabase.from('messages').insert([payload])
      if (error) {
        console.error('Send message error payload', payload, error)
        throw error
      }
      cacheMessage(targetId, { content: text, created_at: new Date().toISOString() })
      if (data?.[0]) {
        setMessages((prev) => [...prev, data[0]])
      }
    } catch (err) {
      console.error('Failed to send message', err)
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
          [field]: targetId,
          is_encrypted: false
        }])

        if (msgError) throw msgError
        cacheThumbnail(targetId || 'global', publicUrl)
        toast.success('Image uploaded')
      }
    } catch (err) {
      console.error(err)
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
        } catch (err) {
          console.error('P2P decoding error', err)
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
    } catch (err) {
      console.error(err)
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
      } catch (err) {
        console.error(err)
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
      } catch (err) {
        console.error('Delete channel failed', err)
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
      } catch (err) {
        console.error(err)
        toast.error('Could not delete server')
      } finally {
        setShowServerSettings(false)
      }
  }

  const filteredMessages = searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase())) : messages

  const glassPanel = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl flex flex-col overflow-hidden"

  return (
    <div className="flex h-screen w-screen bg-[#0B0F19] p-4 gap-4 text-gray-100 overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[rgb(var(--accent))]/10 via-[#0B0F19] to-[#05080f]">
      <Toaster position="top-center" toastOptions={{ style: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' } }} />
      
      <div className={`w-20 items-center py-4 gap-4 shrink-0 ${glassPanel}`}>
        <div 
          onClick={handleHomeClick} 
          className={`h-12 w-12 flex items-center justify-center rounded-2xl cursor-pointer transition-all border border-white/10 mb-2 ${view === 'home' ? 'bg-[rgb(var(--accent))] text-white shadow-[0_0_15px_rgba(var(--accent),0.5)]' : 'bg-white/5 text-gray-400 hover:bg-[rgb(var(--accent))]/20 hover:text-white'}`}
        >
          <Home size={22} />
        </div>
        <div className="w-8 h-[1px] bg-white/10 mb-2" />
        {servers.map(s => (
          <div key={s.id} onClick={() => handleServerClick(s)} className={`h-12 w-12 flex items-center justify-center rounded-2xl cursor-pointer transition-all mb-2 border border-white/10 font-bold text-lg ${activeServer?.id === s.id && view === 'server' ? 'bg-[rgb(var(--accent))] text-white shadow-[0_0_15px_rgba(var(--accent),0.5)]' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}>
            {s.name[0].toUpperCase()}
          </div>
        ))}
        <div onClick={() => setShowCreateModal(true)} className="h-12 w-12 flex items-center justify-center rounded-2xl cursor-pointer bg-white/5 text-[rgb(var(--accent))] border border-white/10 hover:bg-[rgb(var(--accent))] hover:text-white mt-auto mb-2 transition-all"><Plus size={22} /></div>
        <div onClick={() => setShowJoinModal(true)} className="h-12 w-12 flex items-center justify-center rounded-2xl cursor-pointer bg-white/5 text-green-400 border border-white/10 hover:bg-green-500 hover:text-white transition-all"><Compass size={22} /></div>
      </div>

      <div className={`w-72 shrink-0 ${glassPanel}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/[0.02]">
          <h3 className="font-bold text-lg truncate text-white">{view === 'home' ? 'Direct Messages' : activeServer?.name}</h3>
          {view === 'server' && activeServer?.owner_id === session.user.id && (
            <button onClick={() => { setServerSettingsName(activeServer.name); setShowServerSettings(true); }} className="text-gray-400 hover:text-white transition-colors cursor-pointer p-1.5 hover:bg-white/10 rounded-lg"><Settings size={18} /></button>
          )}
        </div>
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {view === 'home' ? (
             <div className="space-y-4">
                <button onClick={() => setShowDmModal(true)} className="w-full flex items-center gap-2 p-3 rounded-xl bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/20 transition-all font-bold text-sm border border-[rgb(var(--accent))]/20">
                  <Plus size={16}/> Start Conversation
                </button>
                <div className="space-y-1 mt-2">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 px-2 mb-2">Direct Messages</div>
                  {dms.map(dm => (
                    <div key={dm.dm_room_id} onClick={() => setActiveDm(dm)} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all border border-transparent ${activeDm?.dm_room_id === dm.dm_room_id ? 'bg-white/10 border-white/10 shadow-inner' : 'hover:bg-white/5 text-gray-400'}`}>
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-black/40 shrink-0 overflow-hidden border border-white/10">
                          {dm.profiles.avatar_url ? <img src={dm.profiles.avatar_url} className="h-full w-full object-cover"/> : <div className="h-full w-full flex items-center justify-center font-bold text-sm uppercase">{dm.profiles.username[0]}</div>}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#121826] ${onlineUsers.includes(dm.profiles.id) ? 'bg-green-500' : 'bg-gray-500'}`} />
                      </div>
                      <div className="flex flex-col truncate justify-center">
                        <span className={`truncate text-sm font-bold ${activeDm?.dm_room_id === dm.dm_room_id ? 'text-white' : ''}`}>{dm.profiles.username}</span>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          ) : (
            <>
               <div className="flex items-center justify-between mb-4 px-2 text-gray-400">
                <span className="text-xs font-bold uppercase tracking-widest">Text Channels</span>
                {activeServer?.owner_id === session.user.id && <button onClick={() => setShowChannelModal(true)} className="cursor-pointer hover:text-white p-1 hover:bg-white/10 rounded-md transition-all"><Plus size={16} /></button>}
              </div>
              <div className="space-y-1">
                {channels.map(c => {
                  const hasNewMessage = c.last_message_at && (!channelReads[c.id] || new Date(c.last_message_at) > new Date(channelReads[c.id]))
                  const isUnread = c.id !== activeChannel?.id && hasNewMessage

                  return (
                    <div key={c.id} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border border-transparent ${activeChannel?.id === c.id ? 'bg-white/10 border-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
                      <div onClick={() => setActiveChannel(c)} className="flex-1 flex items-center gap-2 min-w-0">
                        <Hash size={16} className={`shrink-0 ${activeChannel?.id === c.id ? 'text-[rgb(var(--accent))]' : 'text-gray-500'}`} />
                        <span className={`truncate ${isUnread ? 'text-white font-bold' : 'font-medium'}`}>{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeServer?.owner_id === session.user.id && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setChannelToEdit(c); setChannelSettingsName(c.name); setShowChannelSettings(true); }} 
                            className="text-gray-500 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            <Settings size={16}/>
                          </button>
                        )}
                        {isUnread && <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        
        <div className="p-4 border-t border-white/5 bg-black/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 overflow-hidden cursor-pointer group flex-1 p-1 hover:bg-white/5 rounded-xl transition-all" onClick={() => setShowUserSettings(true)}>
            <div className="h-10 w-10 rounded-full bg-[rgb(var(--accent))] flex items-center justify-center shadow-lg shrink-0 overflow-hidden border border-white/10 relative">
              {myAvatar ? <img src={myAvatar} alt="Avatar" className="h-full w-full object-cover" /> : <span className="font-bold text-sm text-white">{session.user.user_metadata?.username?.charAt(0) || 'U'}</span>}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={16} className="text-white" /></div>
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-white truncate">{session.user.user_metadata?.username}</span>
              <span className="text-[10px] text-[rgb(var(--accent))] font-bold tracking-wide">Online</span>
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              supabase.auth.signOut();
            }} 
            className="text-gray-400 hover:text-[rgb(var(--accent))] p-2.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className={`flex-1 ${glassPanel} flex flex-col relative`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-3">
            {view === 'home' && activeDm ? (
              <><span className="text-gray-500">@</span><h2 className="font-bold text-lg text-white">{activeDm.profiles.username}</h2></>
            ) : view === 'server' && activeChannel ? (
              <><Hash size={20} className="text-gray-500" /><h2 className="font-bold text-lg text-white">{activeChannel.name}</h2></>
            ) : (
              <h2 className="font-bold text-lg text-gray-400">Welcome</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowRightSidebar(true); setRightTab('search'); }} className={`p-2 rounded-lg transition-all ${rightTab === 'search' && showRightSidebar ? 'bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Search size={20}/></button>
            <button onClick={() => { setShowRightSidebar(true); setRightTab('info'); }} className={`p-2 rounded-lg transition-all ${rightTab === 'info' && showRightSidebar ? 'bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Bell size={20}/></button>
            {view === 'server' && (
              <button onClick={() => { setShowRightSidebar(true); setRightTab('members'); }} className={`p-2 rounded-lg transition-all ${rightTab === 'members' && showRightSidebar ? 'bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Users size={20}/></button>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6" ref={scrollContainerRef}>
              {messages.length === 0 && (activeChannel || activeDm) && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 opacity-50">
                  <div className="h-20 w-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4 border border-white/10 shadow-lg">
                    <MessageSquare size={40} className="text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">It's quiet here...</h3>
                  <p>Send a message to start the conversation.</p>
                </div>
              )}
              {filteredMessages.map(m => (
                <div key={m.id} className="flex gap-4 group relative hover:bg-white/[0.02] p-2 -mx-2 rounded-2xl transition-all">
                  <div className="h-10 w-10 rounded-full bg-black/40 shrink-0 overflow-hidden border border-white/10 shadow-md mt-1">
                    {m.profiles?.avatar_url ? <img src={m.profiles?.avatar_url} className="h-full w-full object-cover"/> : <div className="h-full w-full flex items-center justify-center font-bold text-lg uppercase text-white">{m.profiles?.username?.[0] || '?'}</div>}
                  </div>
                  <div className="flex flex-col w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[rgb(var(--accent))]">{m.profiles?.username}</span>
                      <span className="text-[10px] text-gray-500 font-medium">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {editingMessageId === m.id ? (
                      <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1">
                        <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full bg-black/40 text-white px-4 py-2.5 rounded-xl border border-[rgb(var(--accent))] outline-none shadow-inner text-sm" autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
                        <span className="text-[10px] text-gray-500 mt-1 block">Press Enter to save, Esc to cancel</span>
                      </form>
                    ) : (
                      <>
                        <div className="text-gray-200 leading-relaxed markdown-body text-sm">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ inline, className, children, ...props}) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 border border-white/10 text-sm shadow-lg" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                                ) : (
                                  <code className="bg-black/40 text-[rgb(var(--accent))] px-1.5 py-0.5 rounded-md font-mono text-xs border border-white/5" {...props}>{children}</code>
                                )
                              },
                              a({...props}) { return <a className="text-[rgb(var(--accent))] hover:underline" target="_blank" rel="noreferrer" {...props} /> }
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                        {m.image_url && (
                          <a href={m.image_url} target="_blank" rel="noreferrer">
                            <img src={m.image_url} alt="attachment" className="mt-3 rounded-xl max-w-xs md:max-w-sm max-h-72 object-cover border border-white/10 hover:opacity-90 transition-opacity cursor-pointer shadow-lg" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                  {m.profile_id === session.user.id && editingMessageId !== m.id && (
                    <div className="absolute -top-3 right-4 hidden group-hover:flex gap-1 bg-[#121826] border border-white/10 p-1 rounded-lg shadow-xl">
                      <button onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); }} className="text-gray-400 hover:text-white p-1.5 hover:bg-white/10 rounded-md transition-all"><Pen size={14}/></button>
                      <button onClick={() => handleDeleteMessage(m.id)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-500/20 rounded-md transition-all"><Trash2 size={14}/></button>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {(activeChannel || activeDm) && (
              <form onSubmit={handleSendMessage} className="p-4 bg-white/[0.02] border-t border-white/5 shrink-0 flex items-end gap-3 z-10">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`p-3.5 rounded-2xl bg-black/40 border border-white/10 transition-all mb-1 flex items-center justify-center shadow-inner ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 text-gray-400 hover:text-[rgb(var(--accent))] hover:border-[rgb(var(--accent))]/30'}`}
                >
                  <ImagePlus size={20} className={isUploading ? "animate-pulse" : ""} />
                </button>
                <div className="flex-1 relative">
                  <textarea 
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-[rgb(var(--accent))] focus:shadow-[0_0_15px_rgba(var(--accent),0.15)] text-white resize-none custom-scrollbar transition-all shadow-inner" 
                    placeholder={view === 'home' ? `Message @${activeDm?.profiles?.username}` : `Message #${activeChannel?.name}`} 
                    value={newMessage} 
                    onChange={(e) => setNewMessage(e.target.value)} 
                    onKeyDown={handleKeyDown}
                    rows={1}
                    style={{ minHeight: '56px', maxHeight: '150px' }}
                  />
                </div>
              </form>
            )}
          </div>

          {showRightSidebar && (
            <div className="w-72 bg-black/20 border-l border-white/5 flex flex-col shrink-0">
              <div className="h-[52px] flex items-center justify-between px-4 border-b border-white/5">
                <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {view === 'server' && (
                    <button onClick={() => setRightTab('members')} className={`p-1.5 rounded-md transition-all flex items-center gap-2 ${rightTab === 'members' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><Users size={14}/></button>
                  )}
                  <button onClick={() => setRightTab('search')} className={`p-1.5 rounded-md transition-all flex items-center gap-2 ${rightTab === 'search' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><Search size={14}/></button>
                  <button onClick={() => setRightTab('info')} className={`p-1.5 rounded-md transition-all flex items-center gap-2 ${rightTab === 'info' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><Info size={14}/></button>
                </div>
                <button onClick={() => setShowRightSidebar(false)} className="text-gray-500 hover:text-white p-1 rounded-md hover:bg-white/10 transition-all"><X size={16}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {rightTab === 'members' && view === 'server' && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Members — {serverMembers.length}</h4>
                    <div className="space-y-1">
                      {serverMembers.map(m => {
                        const isOnline = onlineUsers.includes(m.profiles.id)
                        return (
                          <div key={m.profiles.id} className={`flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer ${isOnline ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="relative shrink-0">
                              <div className="h-8 w-8 rounded-full bg-black/40 overflow-hidden border border-white/10">
                                {m.profiles.avatar_url ? <img src={m.profiles.avatar_url} className="h-full w-full object-cover"/> : <div className="h-full w-full flex items-center justify-center font-bold text-xs uppercase text-white">{m.profiles.username[0]}</div>}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#121826] ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                            </div>
                            <div className="flex flex-col truncate">
                              <span className={`truncate text-sm font-bold ${isOnline ? 'text-white' : 'text-gray-400'}`}>{m.profiles.username}</span>
                              {m.role === 'owner' && <span className="text-[9px] text-[rgb(var(--accent))] uppercase tracking-wider font-bold">Owner</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                {rightTab === 'search' && (
                  <div>
                    <div className="bg-black/40 border border-white/10 rounded-xl flex items-center px-3 py-2 mb-4 focus-within:border-[rgb(var(--accent))] transition-all shadow-inner">
                      <Search size={16} className="text-gray-500 mr-2" />
                      <input 
                        type="text" 
                        placeholder="Search messages..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-white text-sm w-full"
                      />
                    </div>
                    {searchQuery && filteredMessages.length === 0 && (
                      <div className="text-center text-gray-500 text-sm mt-8">No results found.</div>
                    )}
                    {searchQuery && filteredMessages.length > 0 && (
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{filteredMessages.length} Results</div>
                    )}
                  </div>
                )}

                {rightTab === 'info' && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Settings & Info</h4>
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5 mb-4">
                      <span className="text-xs font-bold text-white mb-2 block flex items-center gap-2"><Palette size={14} className="text-[rgb(var(--accent))]"/> Personal Theme</span>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {THEME_COLORS.map(c => (
                          <button key={c.name} onClick={() => handleThemeChange(c.value)} className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${activeTheme === c.value ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'}`} style={{ backgroundColor: `rgb(${c.value})` }} title={c.name} />
                        ))}
                      </div>
                    </div>
                    {view === 'home' && activeDm && (
                      <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                        <button onClick={startP2PHandshake} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all text-xs font-bold border border-green-500/20">
                          Secure P2P Connect
                        </button>
                        <div className="text-[10px] text-gray-500 mt-2 text-center">Status: {p2pStatus}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
