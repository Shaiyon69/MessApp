import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

export function useServerManager(session) {
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session?.user?.id) {
      fetchUserServers()
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (activeServer) {
      fetchServerChannels()
      fetchServerMembers()
    }
  }, [activeServer])

  const fetchUserServers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('server_members')
        .select(`
          role,
          joined_at,
          servers (
            id,
            name,
            icon_url,
            owner_id,
            created_at
          )
        `)
        .eq('profile_id', session.user.id)

      if (error) throw error

      const userServers = data.map(member => ({
        ...member.servers,
        userRole: member.role,
        joinedAt: member.joined_at
      }))

      setServers(userServers)
    } catch (err) {
      console.error('Failed to fetch servers:', err)
      toast.error('Failed to load servers')
    } finally {
      setLoading(false)
    }
  }

  const createServer = async (serverData) => {
    try {
      setLoading(true)
      
      // Create server
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .insert({
          name: serverData.name,
          icon_url: serverData.icon_url,
          owner_id: session.user.id
        })
        .select()
        .single()

      if (serverError) throw serverError

      // Add owner as member
      const { error: memberError } = await supabase
        .from('server_members')
        .insert({
          server_id: server.id,
          profile_id: session.user.id,
          role: 'owner'
        })

      if (memberError) throw memberError

      // Create default channels
      await createDefaultChannels(server.id)

      await fetchUserServers()
      toast.success('Server created successfully!')
      return server
    } catch (err) {
      console.error('Failed to create server:', err)
      toast.error('Failed to create server')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const createDefaultChannels = async (serverId) => {
    const defaultChannels = [
      { name: 'general', type: 'text', description: 'General discussion' },
      { name: 'random', type: 'text', description: 'Random chat' },
      { name: 'announcements', type: 'text', description: 'Server announcements' }
    ]

    const { error } = await supabase
      .from('channels')
      .insert(
        defaultChannels.map(channel => ({
          ...channel,
          server_id: serverId
        }))
      )

    if (error) throw error
  }

  const joinServer = async (inviteCode) => {
    try {
      setLoading(true)
      
      // Get server by invite code
      const { data: invite, error: inviteError } = await supabase
        .from('server_invites')
        .select(`
          server_id,
          servers (
            id,
            name,
            icon_url
          )
        `)
        .eq('code', inviteCode)
        .eq('active', true)
        .single()

      if (inviteError || !invite) {
        throw new Error('Invalid or expired invite code')
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('server_members')
        .select('id')
        .eq('server_id', invite.server_id)
        .eq('profile_id', session.user.id)
        .single()

      if (existingMember) {
        throw new Error('You are already a member of this server')
      }

      // Join server
      const { error: joinError } = await supabase
        .from('server_members')
        .insert({
          server_id: invite.server_id,
          profile_id: session.user.id,
          role: 'member'
        })

      if (joinError) throw joinError

      await fetchUserServers()
      toast.success(`Joined ${invite.servers.name}!`)
      return invite.servers
    } catch (err) {
      console.error('Failed to join server:', err)
      toast.error(err.message || 'Failed to join server')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const leaveServer = async (serverId) => {
    try {
      setLoading(true)
      
      const { error } = await supabase
        .from('server_members')
        .delete()
        .eq('server_id', serverId)
        .eq('profile_id', session.user.id)

      if (error) throw error

      if (activeServer?.id === serverId) {
        setActiveServer(null)
        setActiveChannel(null)
      }

      await fetchUserServers()
      toast.success('Left server')
    } catch (err) {
      console.error('Failed to leave server:', err)
      toast.error('Failed to leave server')
    } finally {
      setLoading(false)
    }
  }

  const fetchServerChannels = async () => {
    if (!activeServer) return

    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', activeServer.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setChannels(data || [])
    } catch (err) {
      console.error('Failed to fetch channels:', err)
    }
  }

  const createChannel = async (channelData) => {
    if (!activeServer) return

    try {
      const { data, error } = await supabase
        .from('channels')
        .insert({
          ...channelData,
          server_id: activeServer.id
        })
        .select()
        .single()

      if (error) throw error

      await fetchServerChannels()
      toast.success('Channel created!')
      return data
    } catch (err) {
      console.error('Failed to create channel:', err)
      toast.error('Failed to create channel')
      throw err
    }
  }

  const fetchServerMembers = async () => {
    if (!activeServer) return

    try {
      const { data, error } = await supabase
        .from('server_members')
        .select(`
          role,
          joined_at,
          profiles (
            id,
            username,
            avatar_url,
            unique_tag,
            status
          )
        `)
        .eq('server_id', activeServer.id)

      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      console.error('Failed to fetch members:', err)
    }
  }

  const updateMemberRole = async (profileId, newRole) => {
    if (!activeServer) return

    try {
      const { error } = await supabase
        .from('server_members')
        .update({ role: newRole })
        .eq('server_id', activeServer.id)
        .eq('profile_id', profileId)

      if (error) throw error

      await fetchServerMembers()
      toast.success('Member role updated')
    } catch (err) {
      console.error('Failed to update member role:', err)
      toast.error('Failed to update role')
    }
  }

  const kickMember = async (profileId) => {
    if (!activeServer) return

    try {
      const { error } = await supabase
        .from('server_members')
        .delete()
        .eq('server_id', activeServer.id)
        .eq('profile_id', profileId)

      if (error) throw error

      await fetchServerMembers()
      toast.success('Member removed from server')
    } catch (err) {
      console.error('Failed to kick member:', err)
      toast.error('Failed to remove member')
    }
  }

  const generateInviteCode = async (serverId) => {
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()
      
      const { data, error } = await supabase
        .from('server_invites')
        .insert({
          server_id: serverId,
          code: code,
          created_by: session.user.id,
          active: true
        })
        .select()
        .single()

      if (error) throw error

      return data.code
    } catch (err) {
      console.error('Failed to generate invite:', err)
      toast.error('Failed to generate invite code')
      throw err
    }
  }

  return {
    servers,
    activeServer,
    channels,
    activeChannel,
    members,
    loading,
    setActiveServer,
    setActiveChannel,
    fetchUserServers,
    createServer,
    joinServer,
    leaveServer,
    fetchServerChannels,
    createChannel,
    fetchServerMembers,
    updateMemberRole,
    kickMember,
    generateInviteCode
  }
}
