import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import '../style/Dashboard.css' 

export default function Dashboard({ session }) {
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  
  // NEW: State to control the popup modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newServerName, setNewServerName] = useState('')

  useEffect(() => {
    fetchServers()
  }, [])

  const fetchServers = async () => {
    const { data, error } = await supabase
      .from('servers')
      .select('*, server_members!inner(*)')
      .eq('server_members.profile_id', session.user.id)

    if (data && data.length > 0) {
      setServers(data)
      if (!activeServer) setActiveServer(data[0])
    }
  }

  // UPDATED: Now triggers from the custom form instead of a prompt
  const handleCreateServer = async (e) => {
    e.preventDefault() 
    if (!newServerName.trim()) return 

    const { data: serverData } = await supabase
      .from('servers')
      .insert([{ name: newServerName.trim(), owner_id: session.user.id }])
      .select()
      .single()

    if (serverData) {
      await supabase
        .from('server_members')
        .insert([{ server_id: serverData.id, profile_id: session.user.id, role: 'owner' }])
      
      // Close the modal and reset the input
      setNewServerName('')
      setShowCreateModal(false)
      fetchServers()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="dashboard-container">
      
      {/* PANE 1: Server Sidebar */}
      <div className="server-sidebar">
        {servers.map((server) => (
          <div 
            key={server.id} 
            onClick={() => setActiveServer(server)}
            className={`server-icon ${activeServer?.id === server.id ? 'active' : ''}`}
          >
            {server.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {/* UPDATED: Clicking this now opens the modal */}
        <div onClick={() => setShowCreateModal(true)} className="server-add-btn">
          +
        </div>
      </div>

      {/* PANE 2: Channels List */}
      <div className="channels-pane">
        <div className="channels-header">
          <h3>{activeServer ? activeServer.name : 'No Server'}</h3>
        </div>
        <div className="channels-content">
          {activeServer ? <p>Channels will go here...</p> : <p>Create a server to get started.</p>}
        </div>
        <div className="user-profile-area">
          <span className="user-profile-email">
            {session.user.email}
          </span>
          <button onClick={handleLogout} className="logout-btn">Exit</button>
        </div>
      </div>

      {/* PANE 3: Main Chat Area */}
      <div className="main-chat-pane">
        <h2>{activeServer ? `Welcome to ${activeServer.name}` : 'Welcome!'}</h2>
        <p>Messages will appear here once you select a channel.</p>
      </div>

      {/* NEW: CREATE SERVER MODAL OVERLAY */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Customize your server</h3>
            <p>Give your new server a personality with a name. You can always change it later.</p>
            
            <form onSubmit={handleCreateServer}>
              <label>SERVER NAME</label>
              <input 
                type="text" 
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="My Awesome Server"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" onClick={() => {
                  setShowCreateModal(false); 
                  setNewServerName(''); 
                }} className="btn-cancel">
                  Cancel
                </button>
                <button type="submit" className="btn-create">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  )
}
