import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard({ session }) {
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newServerName, setNewServerName] = useState('')

  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')

  useEffect(() => { fetchServers() }, [])
  useEffect(() => { if (activeServer) fetchChannels() }, [activeServer])

  const fetchServers = async () => {
    const { data } = await supabase
      .from('servers')
      .select('*, server_members!inner(*)')
      .eq('server_members.profile_id', session.user.id)
    if (data?.length > 0) {
      setServers(data)
      if (!activeServer) setActiveServer(data[0])
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

  const handleCreateServer = async (e) => {
    e.preventDefault()
    if (!newServerName.trim()) return
    const { data: serverData } = await supabase
      .from('servers')
      .insert([{ name: newServerName.trim(), owner_id: session.user.id }])
      .select().single()
    if (serverData) {
      await supabase.from('server_members').insert([{ server_id: serverData.id, profile_id: session.user.id, role: 'owner' }])
      setShowCreateModal(false)
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

  return (
    <div className="flex h-screen w-screen bg-gray-700 text-gray-100 overflow-hidden">
      
      {/* PANE 1: Server Sidebar (Fireship Style) */}
      <div className="w-16 flex flex-col bg-gray-900 shadow-xl pt-3">
        {servers.map((server) => (
          <div 
            key={server.id} 
            onClick={() => setActiveServer(server)}
            className={`sidebar-icon group ${activeServer?.id === server.id ? 'active' : ''}`}
          >
            {server.name.charAt(0).toUpperCase()}
            <span className="sidebar-tooltip group-hover:scale-100">{server.name}</span>
          </div>
        ))}
        <div onClick={() => setShowCreateModal(true)} className="sidebar-icon group">
          <span className="text-2xl font-light">+</span>
          <span className="sidebar-tooltip group-hover:scale-100">Add Server</span>
        </div>
      </div>

      {/* PANE 2: Channels List */}
      <div className="w-60 flex flex-col bg-gray-800">
        <div className="h-12 flex items-center px-4 shadow-sm border-b border-gray-900">
          <h3 className="font-bold truncate text-white">{activeServer?.name || 'No Server'}</h3>
        </div>
        
        <div className="flex-1 p-3 overflow-y-auto">
          {activeServer && (
            <div className="flex items-center justify-between mb-2 px-2 text-gray-400 hover:text-gray-100 transition-colors">
              <span className="text-xs font-bold uppercase tracking-wider">Text Channels</span>
              <button onClick={() => setShowChannelModal(true)} className="text-xl cursor-pointer">+</button>
            </div>
          )}

          {channels.map((channel) => (
            <div 
              key={channel.id}
              onClick={() => setActiveChannel(channel)}
              className={`flex items-center gap-2 px-2 py-1.5 my-0.5 rounded-md cursor-pointer transition-colors group
                ${activeChannel?.id === channel.id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            >
              <span className="text-xl text-gray-500 font-semibold">#</span>
              <span className="truncate">{channel.name}</span>
            </div>
          ))}
        </div>

        {/* User Profile Area */}
        <div className="bg-gray-900 p-2 flex items-center justify-between h-14">
          <div className="flex flex-col overflow-hidden px-1">
            <span className="text-xs font-bold text-white truncate">{session.user.email.split('@')[0]}</span>
            <span className="text-[10px] text-gray-400 truncate">#Online</span>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-primary font-bold text-xs hover:underline p-1">Exit</button>
        </div>
      </div>

      {/* PANE 3: Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-700">
        <div className="h-12 flex items-center px-4 shadow-sm border-b border-gray-900 bg-gray-700">
          <span className="text-gray-400 text-2xl mr-2 font-semibold">#</span>
          <h2 className="font-bold text-white">{activeChannel?.name || 'select-a-channel'}</h2>
        </div>
        <div className="flex-1 p-6 flex flex-col justify-end">
          <div className="mb-4 text-gray-400 italic">This is the start of the #{activeChannel?.name} channel.</div>
          
          {/* Chat Input Placeholder */}
          <div className="bg-gray-600 rounded-lg p-3 flex items-center">
            <input 
              type="text" 
              placeholder={`Message #${activeChannel?.name || 'channel'}`}
              className="bg-transparent border-none outline-none text-white w-full placeholder-gray-400"
            />
          </div>
        </div>
      </div>

      {/* MODALS remain the same logic, but styled with Tailwind */}
      {showCreateModal && <ServerModal handleCreate={handleCreateServer} onClose={() => setShowCreateModal(false)} name={newServerName} setName={setNewServerName} />}
      {showChannelModal && <ChannelModal handleCreate={handleCreateChannel} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
    </div>
  )
}

// Sub-components for Modals (keep code clean)
function ServerModal({ handleCreate, onClose, name, setName }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white text-gray-800 p-8 rounded-lg w-full max-w-md shadow-2xl">
        <h3 className="text-2xl font-bold text-center mb-2">Create your server</h3>
        <p className="text-gray-500 text-center mb-6">Give your server a name. You can always change it later.</p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-600 uppercase">Server Name</label>
          <input 
            className="w-full p-2 mt-1 mb-6 bg-gray-200 rounded border-none focus:ring-2 focus:ring-primary outline-none"
            type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Awesome Server" autoFocus
          />
          <div className="flex justify-between items-center">
            <button type="button" onClick={onClose} className="text-gray-600 hover:underline">Cancel</button>
            <button type="submit" className="bg-primary text-white px-6 py-2 rounded font-bold hover:bg-opacity-90 transition-all">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChannelModal({ handleCreate, onClose, name, setName, serverName }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-700 text-white p-6 rounded-lg w-full max-w-md shadow-2xl">
        <h3 className="text-xl font-bold mb-1">Create Text Channel</h3>
        <p className="text-gray-400 text-sm mb-6">in {serverName}</p>
        <form onSubmit={handleCreate}>
          <label className="text-xs font-bold text-gray-300 uppercase">Channel Name</label>
          <div className="flex items-center bg-gray-900 rounded p-2 mt-1 mb-6">
            <span className="text-gray-500 text-xl mr-2">#</span>
            <input 
              className="bg-transparent border-none outline-none w-full"
              type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="new-channel" autoFocus
            />
          </div>
          <div className="flex justify-end gap-4">
            <button type="button" onClick={onClose} className="text-white hover:underline">Cancel</button>
            <button type="submit" className="bg-primary px-4 py-2 rounded font-bold hover:bg-opacity-90">Create Channel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
