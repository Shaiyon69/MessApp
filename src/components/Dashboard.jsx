import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard({ session }) {
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
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

  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editContent, setEditContent] = useState('')
  
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)

  useEffect(() => { fetchServers() }, [])

  useEffect(() => { if (activeServer) fetchChannels() }, [activeServer])

  useEffect(() => {
    if (activeChannel) {
      setMessages([])
      setHasMore(true)
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
                // Attach our own username manually so it renders instantly without a refresh
                newMsg.profiles = { username: session.user.user_metadata.username }
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
  }, [activeChannel])

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
      setActiveChannel(data.length > 0 ? data[0] : null)
    }
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(username)') // Join the profiles table to get the username
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
        .select('*, profiles(username)') // Join the profiles table here too
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
    const { data: serverData } = await supabase
      .from('servers')
      .insert([{ name: newServerName.trim(), owner_id: session.user.id }])
      .select().single()
    if (serverData) {
      await supabase.from('server_members').insert([{ server_id: serverData.id, profile_id: session.user.id, role: 'owner' }])
      setNewServerName('')
      setShowCreateModal(false)
      fetchServers()
    }
  }

  const handleUpdateServer = async (e) => {
    e.preventDefault()
    if (!serverSettingsName.trim()) return
    const { error } = await supabase.from('servers').update({ name: serverSettingsName.trim() }).eq('id', activeServer.id)
    if (!error) {
      setShowServerSettings(false)
      setActiveServer({ ...activeServer, name: serverSettingsName.trim() })
      fetchServers()
    }
  }

  const handleDeleteServer = async () => {
    const { error } = await supabase.from('servers').delete().eq('id', activeServer.id)
    if (!error) {
      setShowServerSettings(false)
      fetchServers()
    }
  }

  const handleCreateChannel = async (e) => {
    e.preventDefault()
    const formattedName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-')
    const { error } = await supabase.from('channels').insert([{ server_id: activeServer.id, name: formattedName, type: 'text' }])
    if (!error) {
      setNewChannelName('')
      setShowChannelModal(false)
      fetchChannels()
    }
  }

  const handleUpdateChannel = async (e) => {
    e.preventDefault()
    if (!channelSettingsName.trim()) return
    const formattedName = channelSettingsName.trim().toLowerCase().replace(/\s+/g, '-')
    const { error } = await supabase.from('channels').update({ name: formattedName }).eq('id', channelToEdit.id)
    if (!error) {
      setShowChannelSettings(false)
      if (activeChannel?.id === channelToEdit.id) {
        setActiveChannel({ ...activeChannel, name: formattedName })
      }
      fetchChannels()
    }
  }

  const handleDeleteChannel = async () => {
    const { error } = await supabase.from('channels').delete().eq('id', channelToEdit.id)
    if (!error) {
      setShowChannelSettings(false)
      if (activeChannel?.id === channelToEdit.id) setActiveChannel(null)
      fetchChannels()
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
        <div 
          onClick={() => setShowCreateModal(true)} 
          className="relative flex items-center justify-center h-12 w-12 mx-auto cursor-pointer transition-all duration-300 ease-linear rounded-2xl bg-white/5 text-primary border border-white/10 hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/30 group mt-auto"
        >
          <span className="text-2xl font-light">+</span>
          <span className="absolute left-16 min-w-max p-2 rounded-md shadow-md text-white bg-gray-900/90 backdrop-blur-md border border-white/10 text-xs font-bold transition-all duration-200 scale-0 origin-left group-hover:scale-100 z-50">
            Add Server
          </span>
        </div>
      </div>

      <div className={`w-64 shrink-0 ${glassPanelClass}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/5">
          <h3 className="font-bold text-lg truncate text-white drop-shadow-md">{activeServer?.name || 'No Server'}</h3>
          {activeServer && activeServer.owner_id === session.user.id && (
            <button 
              onClick={() => { setServerSettingsName(activeServer.name); setShowServerSettings(true); }} 
              className="text-gray-400 hover:text-white transition-colors cursor-pointer text-xl"
            >
              ⚙️
            </button>
          )}
        </div>

        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {activeServer && (
            <div className="flex items-center justify-between mb-4 px-2 text-gray-400 hover:text-white transition-colors">
              <span className="text-xs font-bold uppercase tracking-wider">Channels</span>
              {activeServer.owner_id === session.user.id && (
                <button onClick={() => setShowChannelModal(true)} className="text-xl cursor-pointer hover:scale-110 transition-transform">+</button>
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
                <div className="flex items-center gap-3 overflow-hidden w-full" onClick={() => setActiveChannel(channel)}>
                  <span className={`text-lg ${activeChannel?.id === channel.id ? 'text-primary' : 'text-gray-500'}`}>#</span>
                  <span className="font-medium truncate">{channel.name}</span>
                </div>
                {activeServer?.owner_id === session.user.id && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setChannelToEdit(channel); setChannelSettingsName(channel.name); setShowChannelSettings(true); }}
                    className="hidden group-hover:block text-gray-500 hover:text-white text-sm cursor-pointer ml-2"
                  >
                    ✏️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/5 bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-white font-bold text-xs">
                {session.user.user_metadata?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-white truncate">
                {session.user.user_metadata?.username || session.user.email.split('@')[0]}
              </span>
              <span className="text-[10px] text-green-400 font-medium tracking-wide">Online</span>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-gray-400 hover:text-primary transition-colors cursor-pointer p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`flex-1 ${glassPanelClass}`}>
        <div className="h-16 flex items-center px-6 border-b border-white/5 bg-white/5 z-10 shrink-0 shadow-sm">
          <span className="text-primary text-2xl mr-3 font-light">#</span>
          <h2 className="font-bold text-lg text-white drop-shadow-md">{activeChannel?.name || 'Welcome'}</h2>
        </div>

        <div 
          className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar relative"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          {!activeChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50">
              <span className="text-6xl mb-4 font-light">#</span>
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

              {!hasMore && messages.length > 0 && (
                <div className="mt-auto mb-6">
                  <div className="h-20 w-20 bg-primary/20 rounded-3xl flex items-center justify-center mb-6 border border-primary/30 shadow-lg shadow-primary/20">
                    <span className="text-5xl text-primary font-light">#</span>
                  </div>
                  <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Welcome to {activeChannel.name}</h1>
                  <p className="text-gray-400 text-lg">This is the beginning of your legendary conversation.</p>
                </div>
              )}

              {messages.map((msg) => {
                const isMe = msg.profile_id === session.user.id
                const username = msg.profiles?.username || (isMe ? session.user.user_metadata?.username : 'Unknown')

                return (
                  <div key={msg.id} className="flex gap-4 group relative hover:bg-white/5 p-3 -mx-3 rounded-xl transition-all">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-md border border-white/10 uppercase">
                      {username ? username.charAt(0) : '?'}
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
              <button type="button" className="h-10 w-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
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
      {showServerSettings && <ServerSettingsModal handleUpdate={handleUpdateServer} handleDelete={handleDeleteServer} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      
      {showChannelModal && <ChannelCreationModal handleCreate={handleCreateChannel} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={handleUpdateChannel} handleDelete={handleDeleteChannel} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}

function ServerCreationModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Create Server</h3>
        <p className="text-gray-400 text-center mb-8">Build your community's new home.</p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Server Name</label>
          <input className="w-full px-4 py-3 mt-2 mb-8 bg-black/30 rounded-xl border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder-gray-600" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Awesome Workspace" autoFocus />
          <div className="flex justify-end items-center gap-4">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
            <button type="submit" className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Launch</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ServerSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-3xl font-bold text-center mb-2 tracking-tight">Server Settings</h3>
        <p className="text-gray-400 text-center mb-8">Manage your workspace.</p>
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Rename Server</label>
          <input className="w-full px-4 py-3 mt-2 mb-8 bg-black/30 rounded-xl border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-white" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer">Delete Server</button>
            <div className="flex gap-4">
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
              <button type="submit" className="bg-primary text-white px-6 py-2 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChannelCreationModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-2xl font-bold mb-1 tracking-tight">Create Channel</h3>
        <p className="text-gray-400 text-sm mb-8">in <span className="text-primary font-medium">{serverName}</span></p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Channel Name</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 mt-2 mb-8 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-white placeholder-gray-600" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="new-channel" autoFocus />
          </div>
          <div className="flex justify-end gap-4">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
            <button type="submit" className="bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChannelSettingsModal({ handleUpdate, handleDelete, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Channel Settings</h3>
        <form onSubmit={handleUpdate}>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Rename Channel</label>
          <div className="flex items-center bg-black/30 rounded-xl border border-white/5 mt-2 mb-8 px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <span className="text-gray-500 text-xl mr-3 font-light">#</span>
            <input className="bg-transparent border-none outline-none w-full py-3 text-white" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer">Delete Channel</button>
            <div className="flex gap-4">
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer px-4 py-2 font-medium transition-colors">Cancel</button>
              <button type="submit" className="bg-primary text-white px-6 py-2 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-primary/30 cursor-pointer">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
