import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Settings, Pen, Send, LogOut, Plus, Hash, Compass } from 'lucide-react'

// Modals
import ServerCreationModal from './modals/ServerCreation'
import ServerSettingsModal from './modals/ServerSettings'
import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'
import JoinServerModal from './modals/JoinServer.jsx'

export default function Dashboard({ session }) {
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [newServerName, setNewServerName] = useState('')

  const [showServerSettings, setShowServerSettings] = useState(false)
  const [serverSettingsName, setServerSettingsName] = useState('')

  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')

  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [channelToEdit, setChannelToEdit] = useState(null)
  const [channelSettingsName, setChannelSettingsName] = useState('')

  const [showUserSettings, setShowUserSettings] = useState(false)

  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editContent, setEditContent] = useState('')
  
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)

  // Quick reference for the current user's profile image
  const myAvatar = session.user.user_metadata?.avatar_url

  useEffect(() => { 
    fetchServers() 
  }, [])

  useEffect(() => { 
    if (activeServer) {
      fetchChannels() 
    }
  }, [activeServer?.id])

  useEffect(() => {
    if (activeChannel) {
      setMessages([])
      setHasMore(true)
      setIsLoadingMore(false)
      fetchMessages()

      const channelName = `room-${activeChannel.id}`

      const messageSubscription = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannel.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newMsg = payload.new
              if (newMsg.profile_id === session.user.id) {
                newMsg.profiles = { 
                  username: session.user.user_metadata.username,
                  avatar_url: session.user.user_metadata.avatar_url 
                }
              }
              setMessages((current) => [...current, newMsg])
              requestAnimationFrame(() => {
                const container = scrollContainerRef.current
                if (container && container.scrollHeight - container.scrollTop <= container.clientHeight + 150) {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              })
            }
            if (payload.eventType === 'UPDATE') {
              setMessages((current) => current.map((msg) => msg.id === payload.new.id ? payload.new : msg))
            }
            if (payload.eventType === 'DELETE') {
              setMessages((current) => current.filter((msg) => msg.id !== payload.old.id))
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(messageSubscription)
      }
    }
  }, [activeChannel?.id])

  const fetchServers = async () => {
    const { data } = await supabase
      .from('servers')
      .select('*, server_members!inner(*)')
      .eq('server_members.profile_id', session.user.id)
    if (data?.length > 0) {
      setServers(data)
      if (!activeServer) setActiveServer(data[0])
    } else {
      setServers([])
      setActiveServer(null)
      setChannels([])
      setActiveChannel(null)
    }
  }

  const fetchChannels = async () => {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('server_id', activeServer.id)
      .order('created_at', { ascending: true })
    if (data) {
      setChannels(data)
      if (!activeChannel) setActiveChannel(data.length > 0 ? data[0] : null)
    }
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(username, avatar_url)') // <-- Now fetching the avatars!
      .eq('channel_id', activeChannel.id)
      .order('created_at', { ascending: false })
      .limit(30)
      
    if (data) {
      setMessages(data.reverse())
      setHasMore(data.length === 30)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 100)
    }
  }

  const handleScroll = async (e) => {
    if (e.target.scrollTop < 150 && hasMore && !isLoadingMore && messages.length > 0) {
      setIsLoadingMore(true)
      
      const container = scrollContainerRef.current
      const previousHeight = container?.scrollHeight || 0

      const { data } = await supabase
        .from('messages')
        .select('*, profiles(username, avatar_url)') 
        .eq('channel_id', activeChannel.id)
        .lt('created_at', messages[0].created_at)
        .order('created_at', { ascending: false })
        .limit(30)

      if (data && data.length > 0) {
        setMessages((prev) => [...data.reverse(), ...prev])
        setHasMore(data.length === 30)
        
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - previousHeight
          }
        })
      } else {
        setHasMore(false)
      }
      setIsLoadingMore(false)
    }
  }

  const handleCreateServer = async (e) => {
    e.preventDefault()
    if (!newServerName.trim()) return

    const { data: serverData, error } = await supabase
      .from('servers')
      .insert([{ name: newServerName.trim(), owner_id: session.user.id }])
      .select().single()

    if (serverData && !error) {
      await supabase.from('server_members').insert([{ server_id: serverData.id, profile_id: session.user.id, role: 'owner' }])
      
      setServers((prev) => [...prev, serverData])
      setActiveServer(serverData)
      setNewServerName('')
      setShowCreateModal(false)
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
    const { error } = await supabase.from('servers').delete().eq('id', activeServer.id)
    
    if (!error) {
      const remainingServers = servers.filter(s => s.id !== activeServer.id)
      setServers(remainingServers)
      setActiveServer(remainingServers.length > 0 ? remainingServers[0] : null)
      setShowServerSettings(false)
    }
  }

  const handleCreateChannel = async (e) => {
    e.preventDefault()
    const formattedName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-')
    
    const { data: channelData, error } = await supabase
      .from('channels')
      .insert([{ server_id: activeServer.id, name: formattedName, type: 'text' }])
      .select().single()

    if (channelData && !error) {
      setChannels((prev) => [...prev, channelData])
      setActiveChannel(channelData)
      setNewChannelName('')
      setShowChannelModal(false)
    }
  }

  const handleUpdateChannel = async (e) => {
    e.preventDefault()
    if (!channelSettingsName.trim()) return
    const formattedName = channelSettingsName.trim().toLowerCase().replace(/\s+/g, '-')
    
    const { error } = await supabase.from('channels').update({ name: formattedName }).eq('id', channelToEdit.id)
    
    if (!error) {
      setChannels((prev) => prev.map(c => c.id === channelToEdit.id ? { ...c, name: formattedName } : c))
      if (activeChannel?.id === channelToEdit.id) {
        setActiveChannel((prev) => ({ ...prev, name: formattedName }))
      }
      setShowChannelSettings(false)
    }
  }

  const handleDeleteChannel = async () => {
    const { error } = await supabase.from('channels').delete().eq('id', channelToEdit.id)
    
    if (!error) {
      const remainingChannels = channels.filter(c => c.id !== channelToEdit.id)
      setChannels(remainingChannels)
      if (activeChannel?.id === channelToEdit.id) {
        setActiveChannel(remainingChannels.length > 0 ? remainingChannels[0] : null)
      }
      setShowChannelSettings(false)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !activeChannel) return

    const { error } = await supabase
      .from('messages')
      .insert([{
        channel_id: activeChannel.id,
        profile_id: session.user.id,
        content: newMessage.trim()
      }])

    if (!error) {
      setNewMessage('')
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }

  const startEditing = (msg) => {
    setEditingMessageId(msg.id)
    setEditContent(msg.content)
  }

  const handleUpdateMessage = async (e, id) => {
    e.preventDefault()
    if (!editContent.trim()) return

    await supabase
      .from('messages')
      .update({ content: editContent.trim() })
      .eq('id', id)

    setEditingMessageId(null)
  }

  const handleDeleteMessage = async (id) => {
    await supabase
      .from('messages')
      .delete()
      .eq('id', id)
  }

  const glassPanelClass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl flex flex-col overflow-hidden"

  return (
    <div className="flex h-screen w-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-black p-4 gap-4 text-gray-100 overflow-hidden">
      
      {/* SERVER SIDEBAR */}
      <div className={`w-20 items-center py-4 gap-4 shrink-0 ${glassPanelClass}`}>
        {servers.map((server) => (
          <div
            key={server.id}
            onClick={() => setActiveServer(server)}
            className={`relative flex items-center justify-center h-12 w-12 mx-auto cursor-pointer transition-all duration-300 ease-linear rounded-2xl hover:bg-primary hover:text-white group
              ${activeServer?.id === server.id ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-white/5 text-gray-300 border border-white/10'}`}
          >
            <span className="font-bold text-lg">{server.name.charAt(0).toUpperCase()}</span>
            <span className="absolute left-16 min-w-max p-2 rounded-md shadow-md text-white bg-gray-900/90 backdrop-blur-md border border-white/10 text-xs font-bold transition-all duration-200 scale-0 origin-left group-hover:scale-100 z-50">
              {server.name}
            </span>
          </div>
        ))}
        
        {/* ADD SERVER */}
        <div 
          onClick={() => setShowCreateModal(true)} 
          className="relative flex items-center justify-center h-12 w-12 mx-auto cursor-pointer transition-all duration-300 ease-linear rounded-2xl bg-white/5 text-primary border border-white/10 hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/30 group mt-auto"
        >
          <Plus size={24} strokeWidth={2} />
          <span className="absolute left-16 min-w-max p-2 rounded-md shadow-md text-white bg-gray-900/90 backdrop-blur-md border border-white/10 text-xs font-bold transition-all duration-200 scale-0 origin-left group-hover:scale-100 z-50">
            Create Server
          </span>
        </div>

        {/* JOIN SERVER */}
        <div 
          onClick={() => setShowJoinModal(true)} 
          className="relative flex items-center justify-center h-12 w-12 mx-auto cursor-pointer transition-all duration-300 ease-linear rounded-2xl bg-white/5 text-green-400 border border-white/10 hover:bg-green-500 hover:text-white hover:shadow-lg hover:shadow-green-500/30 group"
        >
          <Compass size={24} strokeWidth={2} />
          <span className="absolute left-16 min-w-max p-2 rounded-md shadow-md text-white bg-gray-900/90 backdrop-blur-md border border-white/10 text-xs font-bold transition-all duration-200 scale-0 origin-left group-hover:scale-100 z-50">
            Join Server
          </span>
        </div>
      </div>

      {/* CHANNEL SIDEBAR */}
      <div className={`w-64 shrink-0 ${glassPanelClass}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/5">
          <h3 className="font-bold text-lg truncate text-white drop-shadow-md">{activeServer?.name || 'No Server'}</h3>
          {activeServer && activeServer.owner_id === session.user.id && (
            <button 
              onClick={() => { setServerSettingsName(activeServer.name); setShowServerSettings(true); }} 
              className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Settings size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {activeServer && (
            <div className="flex items-center justify-between mb-4 px-2 text-gray-400 hover:text-white transition-colors">
              <span className="text-xs font-bold uppercase tracking-wider">Channels</span>
              {activeServer.owner_id === session.user.id && (
                <button onClick={() => setShowChannelModal(true)} className="cursor-pointer hover:scale-110 transition-transform">
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all duration-200
                  ${activeChannel?.id === channel.id ? 'bg-white/15 text-white shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
              >
                <div className="flex items-center gap-2 overflow-hidden w-full" onClick={() => setActiveChannel(channel)}>
                  <Hash size={16} className={activeChannel?.id === channel.id ? 'text-primary' : 'text-gray-500'} />
                  <span className="font-medium truncate">{channel.name}</span>
                </div>
                {activeServer?.owner_id === session.user.id && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setChannelToEdit(channel); setChannelSettingsName(channel.name); setShowChannelSettings(true); }}
                    className="hidden group-hover:block text-gray-500 hover:text-white cursor-pointer ml-2"
                  >
                    <Pen size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ACTIVE USER PROFILE IN BOTTOM LEFT */}
        <div className="p-4 border-t border-white/5 bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden cursor-pointer group" onClick={() => setShowUserSettings(true)}>
            
            {/* THIS IS THE FIXED AVATAR DISPLAY */}
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center shadow-lg shrink-0 overflow-hidden relative border border-white/10">
              {myAvatar ? (
                <img src={myAvatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-white font-bold text-xs uppercase">
                  {session.user.user_metadata?.username?.charAt(0) || 'U'}
                </span>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Settings size={14} className="text-white" />
              </div>
            </div>

            <div className="flex flex-col truncate group-hover:opacity-80 transition-opacity">
              <span className="text-sm font-bold text-white truncate">
                {session.user.user_metadata?.username || session.user.email.split('@')[0]}
              </span>
              <span className="text-[10px] text-green-400 font-medium tracking-wide">Online</span>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-gray-400 hover:text-primary transition-colors cursor-pointer p-1">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className={`flex-1 ${glassPanelClass}`}>
        <div className="h-16 flex items-center px-6 border-b border-white/5 bg-white/5 z-10 shrink-0 shadow-sm">
          <Hash size={24} className="text-primary mr-3" strokeWidth={2} />
          <h2 className="font-bold text-lg text-white drop-shadow-md">{activeChannel?.name || 'Welcome'}</h2>
        </div>

        <div 
          className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar relative"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          {!activeChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50">
              <Hash size={64} className="mb-4" strokeWidth={1} />
              <p className="text-lg">Select a channel to start messaging</p>
            </div>
          ) : (
            <>
              {isLoadingMore && (
                <div className="flex justify-center py-2 absolute top-0 left-0 right-0 z-20 pointer-events-none">
                  <div className="bg-gray-900/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-gray-300 font-bold tracking-widest uppercase">Loading History</span>
                  </div>
                </div>
              )}

              {!hasMore && (
                <div className="mt-auto mb-6">
                  <div className="h-20 w-20 bg-primary/20 rounded-3xl flex items-center justify-center mb-6 border border-primary/30 shadow-lg shadow-primary/20">
                    <Hash size={48} className="text-primary" strokeWidth={1.5} />
                  </div>
                  <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Welcome to {activeChannel.name}</h1>
                  <p className="text-gray-400 text-lg">This is the beginning of your legendary conversation.</p>
                </div>
              )}

              {messages.map((msg) => {
                const isMe = msg.profile_id === session.user.id
                const username = msg.profiles?.username || (isMe ? session.user.user_metadata?.username : 'Unknown')
                
                // Fetch the avatar from the message profile data!
                const msgAvatar = msg.profiles?.avatar_url || (isMe ? session.user.user_metadata?.avatar_url : null)

                return (
                  <div key={msg.id} className="flex gap-4 group relative hover:bg-white/5 p-3 -mx-3 rounded-xl transition-all">
                    
                    {/* MESSAGE AVATAR RENDERER */}
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-md border border-white/10 overflow-hidden uppercase">
                      {msgAvatar ? (
                        <img src={msgAvatar} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        username ? username.charAt(0) : '?'
                      )}
                    </div>

                    <div className="flex flex-col w-full justify-center">
                      <div className="flex items-baseline gap-3 mb-1">
                        <span className={`font-bold tracking-wide ${isMe ? 'text-primary' : 'text-blue-400'}`}>
                          {username}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {editingMessageId === msg.id ? (
                        <form onSubmit={(e) => handleUpdateMessage(e, msg.id)} className="mt-1">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-black/30 text-white px-4 py-2 rounded-lg border border-primary/50 outline-none focus:ring-2 focus:ring-primary/50 transition-all backdrop-blur-md"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditingMessageId(null) }}
                          />
                          <p className="text-[10px] text-gray-400 mt-2 font-medium">press <kbd className="bg-white/10 px-1 rounded">Enter</kbd> to save, <kbd className="bg-white/10 px-1 rounded">Esc</kbd> to cancel</p>
                        </form>
                      ) : (
                        <p className="text-gray-200 leading-relaxed drop-shadow-sm">{msg.content}</p>
                      )}
                    </div>

                    {isMe && editingMessageId !== msg.id && (
                      <div className="absolute top-3 right-4 hidden group-hover:flex gap-1 bg-gray-900/80 backdrop-blur-md p-1 rounded-lg shadow-xl border border-white/10">
                        <button onClick={() => startEditing(msg)} className="text-gray-400 hover:text-white text-xs cursor-pointer px-3 py-1.5 hover:bg-white/10 rounded-md transition-colors">Edit</button>
                        <button onClick={() => handleDeleteMessage(msg.id)} className="text-red-400 hover:text-red-300 text-xs cursor-pointer px-3 py-1.5 hover:bg-red-500/20 rounded-md transition-colors">Delete</button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {activeChannel && (
          <div className="p-6 pt-2 shrink-0">
            <form onSubmit={handleSendMessage} className="bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl p-2 flex items-center shadow-inner transition-all focus-within:bg-black/30 focus-within:border-white/10">
              <button type="submit" className="h-10 w-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer">
                <Send size={20} strokeWidth={1.5} />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message #${activeChannel.name}`}
                className="bg-transparent border-none outline-none text-white w-full px-4 placeholder-gray-500"
                autoComplete="off"
              />
            </form>
          </div>
        )}
      </div>

      {showCreateModal && <ServerCreationModal handleCreate={handleCreateServer} onClose={() => setShowCreateModal(false)} name={newServerName} setName={setNewServerName} />}
      
      {/* JOIN SERVER MODAL DROPPED IN */}
      {showJoinModal && <JoinServerModal session={session} onClose={() => setShowJoinModal(false)} onJoinSuccess={fetchServers} />}
      
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={handleUpdateServer} handleDelete={handleDeleteServer} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && <ChannelCreationModal handleCreate={handleCreateChannel} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={handleUpdateChannel} handleDelete={handleDeleteChannel} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
      {showUserSettings && <UserSettingsModal session={session} onClose={() => setShowUserSettings(false)} />}
    </div>
  )
}
