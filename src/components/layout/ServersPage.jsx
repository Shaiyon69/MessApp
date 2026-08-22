/**
 * Servers and group chats: the joined-server list, the channel/category tree of
 * the selected server, and the create/join/invite/channel/category mutations.
 * Lifted wholesale out of the old LeftSidebar. Dashboard owns selection and
 * permissions; Supabase policies still authorize every mutation here — the
 * canManageServer checks below are convenience, never the security boundary.
 */
import React, { useEffect, useState, useRef } from 'react'
import { Camera, ChevronLeft, Copy, Gamepad2, GraduationCap, Hash,  MicOff, MonitorUp, MoreVertical, Plus, Sparkles, Volume2, VolumeX } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import toast from 'react-hot-toast'
import { safeMediaUrl } from '../../lib/security'
import { supabase } from '../../supabaseClient'
import { provisionServerPreset, SERVER_PRESETS } from '../../lib/serverPresets'

const SERVER_PRESET_OPTIONS = [
  { ...SERVER_PRESETS.gaming, Icon: Gamepad2, accent: 'text-indigo-300', active: 'border-indigo-400/70 bg-indigo-500/15' },
  { ...SERVER_PRESETS.study, Icon: GraduationCap, accent: 'text-sky-300', active: 'border-sky-400/70 bg-sky-500/15' },
  { ...SERVER_PRESETS.simple, Icon: Sparkles, accent: 'text-gray-300', active: 'border-gray-400/60 bg-white/[0.07]' }
]

export default function ServersPage(props) {
  /* 'list' vs 'detail' is presentation only — which of the two panes is on
     screen. Dashboard's activeServer is the real selection. The state itself
     lives in ChatArea because the quick-actions FAB moves between the corner
     and this pane's docked bar. */
  const { panelView, setPanelView } = props
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)
  const [serverName, setServerName] = useState('')
  const [serverPreset, setServerPreset] = useState('gaming')
  const [isCreatingServer, setIsCreatingServer] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [channelModalCategoryId, setChannelModalCategoryId] = useState(null)
  const [channelName, setChannelName] = useState('')
  const [channelType, setChannelType] = useState('text')
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [activeInviteCode, setActiveInviteCode] = useState('')
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false)
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false)
  const [serverItemMenuId, setServerItemMenuId] = useState(null)
  const [editingServerItem, setEditingServerItem] = useState(null)
  const [editingServerItemName, setEditingServerItemName] = useState('')
  const [isSavingServerItem, setIsSavingServerItem] = useState(false)
  const serverCreationRequestRef = useRef(null)

  /* The quick-actions FAB lives outside this component, so create/join arrive
     as a one-shot prop instead of a callback into local modal state. */
  useEffect(() => {
    if (!props.pendingServerAction) return
    setPanelView('list')
    if (props.pendingServerAction === 'create') setIsCreateModalOpen(true)
    if (props.pendingServerAction === 'join') setIsJoinModalOpen(true)
    props.onServerActionHandled?.()
  }, [props.pendingServerAction, props.onServerActionHandled])

  const canManageServer = Boolean(props.canManageActiveServer)
  /* The server menu has no category picker, so Create Channel drops into the
     first category — same default the per-category button would give. */
  const firstCategoryId = (props.serverCategories || [])[0]?.id

  // Server-wide voice presence resolves occupancy for every channel; the local
  // fallback only knows about the channel this client joined.
  const getVoiceParticipantsForChannel = (channelId) => {
    if (props.getVoiceParticipantsForChannel) return props.getVoiceParticipantsForChannel(channelId)
    if (props.activeVoiceSession?.channelId !== channelId) return []
    return props.voiceSessionState?.participants || []
  }

  const closeCreateModal = () => {
    setServerName('')
    setServerPreset('gaming')
    setIsCreatingServer(false)
    serverCreationRequestRef.current = null
    setIsCreateModalOpen(false)
  }
  const closeJoinModal = () => {
    setInviteCode('')
    setIsJoinModalOpen(false)
  }
  const closeChannelModal = () => {
    setChannelModalCategoryId(null)
    setChannelName('')
    setChannelType('text')
    setIsCreatingChannel(false)
  }
  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false)
    setCategoryName('')
    setIsCreatingCategory(false)
  }
  const closeEditServerItemModal = () => {
    setEditingServerItem(null)
    setEditingServerItemName('')
    setIsSavingServerItem(false)
  }
  const openEditServerItemModal = (type, item) => {
    if (!canManageServer) return toast.error('Only server admins can manage channels.')
    setServerItemMenuId(null)
    setEditingServerItem({ type, item })
    setEditingServerItemName(item.name || '')
  }
  const openChannelModal = (categoryId) => {
    if (!canManageServer) return toast.error('Only server admins can add channels.')
    if (!categoryId) return toast.error('Create a category first.')
    setChannelModalCategoryId(categoryId)
    setChannelName('')
    setChannelType('text')
  }

  const openServer = (server) => {
    setPanelView('detail')
    props.setView('home')
    props.setActiveServer(server)
    props.setActiveChannel(null)
  }

  const refreshServers = async (server) => {
    await props.fetchServers?.()
    if (server) openServer(server)
  }

  const handleCreateServer = async (e) => {
    e.preventDefault()
    const name = serverName.trim()
    if (!name) return toast.error('Enter a server name')
    setIsCreatingServer(true)
    const requestId = serverCreationRequestRef.current || crypto.randomUUID()
    serverCreationRequestRef.current = requestId
    try {
      const { data: server, error } = await supabase.rpc('create_server', {
        server_name: name,
        idempotency_key: requestId
      })
      if (error) throw error

      let presetApplied = true
      try {
        await provisionServerPreset(supabase, server.id, serverPreset)
      } catch (presetError) {
        presetApplied = false
        console.warn('[SERVER_PRESET] Server created but preset provisioning was incomplete.', {
          preset: serverPreset,
          name: presetError?.name,
          code: presetError?.code
        })
      }

      closeCreateModal()
      await refreshServers(server)
      if (presetApplied) toast.success(`${SERVER_PRESETS[serverPreset]?.name || 'Server'} space created`)
      else toast('Server created with the default channels. You can add the remaining preset channels manually.', { icon: '⚠️', duration: 6000 })
    } catch (_err) {
      setIsCreatingServer(false)
      toast.error('Could not create server')
    }
  }

  const handleJoinServer = async (e) => {
    e.preventDefault()
    const code = inviteCode.trim().toUpperCase()
    if (!code) return toast.error('Enter an invite code')
    try {
      const { data: server, error } = await supabase.rpc('join_server_by_code', { invite: code })
      if (error) throw error
      if (!server) throw new Error('Server not found')

      closeJoinModal()
      await refreshServers(server)
      toast.success('Server joined')
    } catch (_err) {
      toast.error('Could not join server')
    }
  }

  const handleCreateChannelSubmit = async (e) => {
    e.preventDefault()
    if (!canManageServer) return toast.error('Only server admins can add channels.')
    if (!channelName.trim()) return toast.error('Enter a channel name')
    setIsCreatingChannel(true)
    try {
      const channel = await props.handleCreateChannel?.({ name: channelName, type: channelType, category_id: channelModalCategoryId, server_id: props.activeServer?.id })
      if (!channel) throw new Error('Channel was not created')
      closeChannelModal()
      toast.success('Channel created')
    } catch (_err) {
      setIsCreatingChannel(false)
      toast.error('Could not create channel')
    }
  }

  const handleCreateCategorySubmit = async (e) => {
    e.preventDefault()
    if (!canManageServer) return toast.error('Only server admins can add categories.')
    if (!categoryName.trim()) return toast.error('Enter a category name')
    setIsCreatingCategory(true)
    try {
      const category = await props.handleCreateCategory?.(categoryName)
      if (!category) throw new Error('Category was not created')
      closeCategoryModal()
      toast.success('Category created')
    } catch (_err) {
      setIsCreatingCategory(false)
      toast.error('Could not create category')
    }
  }

  const handleEditServerItemSubmit = async (e) => {
    e.preventDefault()
    if (!canManageServer) return toast.error('Only server admins can manage channels.')
    const name = editingServerItemName.trim()
    if (!editingServerItem || !name) return toast.error('Enter a name')
    setIsSavingServerItem(true)
    try {
      if (editingServerItem.type === 'category') {
        await props.handleUpdateCategory?.(editingServerItem.item.id, name)
        toast.success('Category updated')
      } else {
        await props.handleUpdateChannel?.(editingServerItem.item.id, name)
        toast.success('Channel updated')
      }
      closeEditServerItemModal()
    } catch (_err) {
      setIsSavingServerItem(false)
      toast.error(editingServerItem.type === 'category' ? 'Could not update category' : 'Could not update channel')
    }
  }

  const deleteServerItem = async (type, item) => {
    setServerItemMenuId(null)
    if (!canManageServer) return toast.error('Only server admins can manage channels.')
    if (!window.confirm(`Delete ${item.name}?`)) return
    try {
      if (type === 'category') {
        await props.handleDeleteCategory?.(item.id)
        toast.success('Category deleted')
      } else {
        await props.handleDeleteChannel?.(item.id)
        toast.success('Channel deleted')
      }
    } catch (_err) {
      toast.error(type === 'category' ? 'Could not delete category' : 'Could not delete channel')
    }
  }

  const copyInviteCode = async () => {
    if (!props.activeServer?.id || isGeneratingInvite) return
    setIsGeneratingInvite(true)
    try {
      const { data, error } = await supabase.rpc('create_server_invite', {
        target_server_id: props.activeServer.id,
        requested_uses: 100,
        requested_expires_at: null
      })
      if (error) throw error
      setActiveInviteCode(data.code)
      await navigator.clipboard.writeText(data.code)
      toast.success('Invite code copied')
    } catch (_err) {
      toast.error('Could not create invite')
    } finally {
      setIsGeneratingInvite(false)
    }
  }

  const runServerAction = async (action) => {
    if (action === 'delete' && !canManageServer) return toast.error('Only server admins can delete this server.')
    try {
      if (action === 'delete') await props.handleDeleteServer?.()
      else await props.handleLeaveServer?.()
      setIsServerMenuOpen(false)
      setPanelView('list')
      toast.success(action === 'delete' ? 'Server deleted' : 'Server left')
    } catch (_err) {
      toast.error(action === 'delete' ? 'Could not delete server' : 'Could not leave server')
    }
  }

  const showDetail = panelView === 'detail' && props.activeServer

  return (
    <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 pt-4 md:px-6 md:pt-6 ${showDetail ? 'min-h-full pb-0' : 'pb-24'}`}>
      {/* Popouts here are click-away: one shared backdrop under them all
          (they sit at z-80) closes whichever is open. */}
      {(isServerMenuOpen || serverItemMenuId) && (
        <div className="fixed inset-0 z-[70]" onClick={() => { setIsServerMenuOpen(false); setServerItemMenuId(null) }} aria-hidden="true" />
      )}
      {!showDetail ? (
        <>
          <div className="space-y-1">
            {props.serversLoading && props.servers.length === 0 && Array.from({ length: 4 }, (_, index) => (
              <div key={`server-skeleton-${index}`} className="flex min-h-16 animate-pulse items-center gap-3.5 rounded-2xl px-3" aria-hidden="true">
                <span className="h-11 w-11 rounded-xl bg-[var(--bg-element)]" />
                <span className="h-3 w-32 rounded-full bg-[var(--bg-element)]" />
              </div>
            ))}
            {props.servers.map((server, i) => {
              const iconUrl = safeMediaUrl(server.icon_url)
              return (
                <button
                  key={server.id || `server-${i}`}
                  type="button"
                  onClick={() => openServer(server)}
                  className="server-list-row"
                >
                  <span className="server-list-icon">
                    {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-cover" /> : server.name?.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{server.name}</span>
                </button>
              )
            })}
            {!props.serversLoading && props.servers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 opacity-60">
                <Hash size={44} className="mb-4 text-[var(--text-muted)]" aria-hidden="true" />
                <p className="type-body font-medium text-[var(--text-muted)]">No servers yet.</p>
                <button type="button" onClick={() => setIsCreateModalOpen(true)} className="mt-2 type-body font-bold text-[var(--app-accent)] hover:underline">
                  Create your first one
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="space-y-3">
            {props.serverChannelsLoading && Array.from({ length: 3 }, (_, index) => (
              <div key={`channel-group-skeleton-${index}`} className="rounded-2xl bg-[var(--surface-container)] p-3" aria-hidden="true">
                <div className="mb-3 h-2.5 w-24 animate-pulse rounded-full bg-[var(--bg-element)]" />
                <div className="h-10 animate-pulse rounded-xl bg-[var(--bg-element)]" />
              </div>
            ))}
            {(props.serverCategories || []).map(category => (
              <section key={category.id} className="server-channel-group first:[&>div]:border-t-0">
                <div className="server-channel-group-header relative flex min-h-9 items-center justify-between gap-2 border-t-2 border-[var(--border-hover)] px-1 pb-1.5 pt-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate type-meta font-black uppercase tracking-[0.12em] text-gray-400">{category.name}</span>
                    <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-element)] px-1.5 font-mono type-meta font-bold text-gray-500" aria-label={`${(category.channels || []).length} channels`}>
                      {(category.channels || []).length}
                    </span>
                  </div>
                  {canManageServer && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openChannelModal(category.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`Create channel in ${category.name}`} title="Create Channel">
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setServerItemMenuId(serverItemMenuId === `category-${category.id}` ? null : `category-${category.id}`)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`${category.name} menu`} title="Category menu">
                        <MoreVertical size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {serverItemMenuId === `category-${category.id}` && (
                    <div className="premium-menu absolute right-1 top-9 z-[80] w-44 rounded-xl p-1">
                      <button type="button" onClick={() => openEditServerItemModal('category', category)} className="w-full rounded-md px-3 py-2 text-left type-body text-[var(--text-main)] hover:bg-[var(--bg-element)]">Edit Category</button>
                      <button type="button" onClick={() => deleteServerItem('category', category)} className="w-full rounded-md px-3 py-2 text-left type-body text-red-400 hover:bg-red-500/10">Delete Category</button>
                    </div>
                  )}
                </div>
                <div className="space-y-1 pt-1.5">
                  {(category.channels || []).map(channel => {
                    const isActive = props.activeChannel?.id === channel.id
                    const voiceParticipants = channel.type === 'voice' ? getVoiceParticipantsForChannel(channel.id) : []
                    return (
                      <div key={channel.id} className={`relative rounded-xl ${channel.type === 'voice' && voiceParticipants.length > 0 ? 'bg-[var(--bg-element)]/55' : ''}`}>
                        <button type="button" onClick={() => props.setActiveChannel(channel)} className={`group relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 pr-10 text-left type-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[var(--bg-element)] text-[var(--text-main)]' : 'text-gray-400 hover:bg-[var(--bg-base)] hover:text-[var(--text-main)]'}`}>
                          <span className={`absolute inset-y-2 left-0 w-0.5 rounded-r-full ${isActive ? 'bg-[var(--theme-base)]' : 'bg-transparent'}`} aria-hidden="true" />
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${isActive ? 'border-[var(--theme-base)]/30 bg-[var(--theme-20)] text-[var(--theme-base)]' : channel.type === 'voice' && voiceParticipants.length > 0 ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-[var(--border-subtle)] bg-[var(--bg-element)]/60 text-gray-500 group-hover:text-gray-300'}`}>
                            {channel.type === 'voice' ? <Volume2 size={14} aria-hidden="true" /> : <Hash size={14} aria-hidden="true" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                          {channel.type === 'voice' && voiceParticipants.length > 0 && (
                            <span className="shrink-0 rounded-full border border-green-500/15 bg-green-500/10 px-1.5 py-0.5 font-mono type-meta font-black uppercase tracking-wide text-green-300">{voiceParticipants.length} live</span>
                          )}
                        </button>
                        {canManageServer && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setServerItemMenuId(serverItemMenuId === `channel-${channel.id}` ? null : `channel-${channel.id}`) }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`${channel.name} menu`} title="Channel menu">
                            <MoreVertical size={14} aria-hidden="true" />
                          </button>
                        )}
                        {serverItemMenuId === `channel-${channel.id}` && (
                          <div className="premium-menu absolute right-2 top-10 z-[80] w-44 rounded-xl p-1">
                            <button type="button" onClick={() => openEditServerItemModal('channel', channel)} className="w-full rounded-md px-3 py-2 text-left type-body text-[var(--text-main)] hover:bg-[var(--bg-element)]">Edit Channel</button>
                            <button type="button" onClick={() => deleteServerItem('channel', channel)} className="w-full rounded-md px-3 py-2 text-left type-body text-red-400 hover:bg-red-500/10">Delete Channel</button>
                          </div>
                        )}
                        {voiceParticipants.length > 0 && (
                          <div className="voice-participant-list ml-5 space-y-1 border-l border-green-500/15 px-2 pb-2 pl-3 pt-1">
                            {voiceParticipants.map(participant => {
                              const hasStream = participant.cameraActive || participant.screenShareActive
                              return (
                                <button
                                  type="button"
                                  key={`${channel.id}-${participant.id}`}
                                  onClick={() => props.onVoiceParticipantSelect?.(participant)}
                                  className={`flex min-h-8 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left type-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${participant.speaking ? 'bg-green-500/10 text-green-200' : participant.muted ? 'text-gray-600' : 'text-gray-400 hover:bg-[var(--bg-base)] hover:text-[var(--text-main)]'}`}
                                  title={hasStream ? `Watch ${participant.displayName}` : participant.displayName}
                                >
                                  <StatusAvatar url={participant.avatarUrl} username={participant.displayName} status="online" className="h-6 w-6" />
                                  <span className="min-w-0 flex-1 truncate font-bold">{participant.displayName}</span>
                                  <span className="flex h-3 shrink-0 items-end gap-0.5" aria-label={participant.speaking ? 'Speaking' : 'Listening'}>
                                    {[0.6, 1, 0.75].map((weight, levelIndex) => (
                                      <span key={`${participant.id}-level-${levelIndex}`} className={`w-0.5 rounded-full transition-[height,background-color] duration-150 ease-out ${participant.speaking ? 'bg-green-400' : 'bg-gray-700'}`} style={{ height: `${Math.max(2, Math.round((participant.voiceLevel || 0) * 12 * weight))}px` }} />
                                    ))}
                                  </span>
                                  <span className="flex min-w-12 shrink-0 items-center justify-end gap-1 text-gray-500">
                                    <span className="flex h-3 w-3 items-center justify-center" aria-hidden={!participant.speaking}>
                                      {participant.speaking && <Volume2 size={12} aria-label="Speaking" />}
                                    </span>
                                    {participant.muted && <MicOff size={12} aria-label="Muted" />}
                                    {participant.deafened && <VolumeX size={12} aria-label="Deafened" />}
                                    {participant.cameraActive && <Camera size={12} aria-label="Camera active" />}
                                    {participant.screenShareActive && <MonitorUp size={12} aria-label="Screen sharing" />}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {(category.channels || []).length === 0 && (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] px-3 py-3 text-center">
                      <p className="type-label text-gray-500">No channels in this category</p>
                      {canManageServer && (
                        <button type="button" onClick={() => openChannelModal(category.id)} className="mt-1 type-label font-bold text-[var(--theme-base)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]">
                          Create a channel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            ))}
            {!props.serverChannelsLoading && (props.serverCategories || []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-6 text-center">
                <p className="type-body font-semibold text-gray-400">No categories yet</p>
                <p className="mt-1 type-label text-gray-600">Create one to start organizing channels.</p>
                {canManageServer && (
                  <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-base)] px-3 py-2 type-label font-bold text-[var(--accent-contrast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                    <Plus size={14} aria-hidden="true" />
                    Create Category
                  </button>
                )}
              </div>
            )}
          </div>

          {/* The server bar is docked above the bottom nav: it is the thumb
              target on this screen, so channels scroll behind it rather than
              pushing it off the top. The row keeps an equal gutter each side
              so it stays centred under the fixed quick-actions button. */}
          <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-[var(--bg-base)] px-4 pb-2 md:-mx-6 md:px-6 md:pb-3">
            <div className="relative flex min-h-14 items-center gap-2 px-16 py-2">
              <button type="button" onClick={() => setPanelView('list')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Back to servers" title="All servers">
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display type-body font-bold text-[var(--text-main)]">{props.activeServer?.name || 'Server'}</h3>
                {/* Role, not a static label: the manage buttons below hinge on it,
                    so "member" explains their absence without a trip to the DB. */}
                <p className="type-meta font-black uppercase tracking-[0.18em] text-gray-500">{props.activeServerRole || 'Server'}</p>
              </div>
              {canManageServer && (
                <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-gray-400 transition-colors hover:border-[var(--theme-base)]/50 hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Create category" title="Create Category">
                  <Plus size={16} aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => setIsServerMenuOpen(open => !open)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Server menu" title="Server menu">
                <MoreVertical size={17} aria-hidden="true" />
              </button>
              {isServerMenuOpen && (
                <div className="premium-menu absolute bottom-full right-2 z-[80] mb-2 w-64 rounded-xl p-2">
                  <div className="mb-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-element)] p-2">
                    <p className="mb-1 type-meta font-bold uppercase tracking-widest text-[var(--text-muted)]">Invite Code</p>
                    <button type="button" onClick={copyInviteCode} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono type-body text-[var(--text-main)] hover:bg-[var(--bg-element-hover)]">
                      <span className="truncate">{isGeneratingInvite ? 'Creating...' : activeInviteCode || 'Create code'}</span>
                      <Copy size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {/* Shown to everyone: a member who taps gets told why it failed,
                      which beats an entry that silently is not there. RLS is the
                      real gate either way. */}
                  <button type="button" onClick={() => { setIsServerMenuOpen(false); canManageServer ? setIsCategoryModalOpen(true) : toast.error('Only server admins can add categories.') }} className="w-full rounded-md px-3 py-2 text-left type-body text-[var(--text-main)] hover:bg-[var(--bg-element)]">Create Category</button>
                  <button type="button" onClick={() => { setIsServerMenuOpen(false); openChannelModal(firstCategoryId) }} className="w-full rounded-md px-3 py-2 text-left type-body text-[var(--text-main)] hover:bg-[var(--bg-element)]">Create Channel</button>
                  {canManageServer ? (
                    <button type="button" onClick={() => runServerAction('delete')} className="w-full rounded-md px-3 py-2 text-left type-body font-bold text-red-400 hover:bg-red-500/10">Delete Server</button>
                  ) : (
                    <button type="button" onClick={() => runServerAction('leave')} className="w-full rounded-md px-3 py-2 text-left type-body font-bold text-red-400 hover:bg-red-500/10">Leave Server</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateServer} className="ios-sheet custom-scrollbar max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-3xl p-5">
            <h2 className="mb-4 type-title font-bold text-[var(--text-main)]">Create a server</h2>

            <label className="block">
              <span className="mb-2 block type-meta font-bold uppercase tracking-widest text-[var(--text-muted)]">Server name</span>
              <input value={serverName} onChange={(e) => setServerName(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="My community" autoFocus maxLength={100} />
            </label>

            <fieldset className="mt-4">
              <legend className="mb-2 type-meta font-bold uppercase tracking-widest text-[var(--text-muted)]">Choose a preset</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {SERVER_PRESET_OPTIONS.map(option => (
                  <label key={option.id} className={`ios-choice-card flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors sm:block ${serverPreset === option.id ? 'is-active' : ''}`}>
                    <input type="radio" name="server-preset" value={option.id} checked={serverPreset === option.id} onChange={(event) => setServerPreset(event.target.value)} className="sr-only" />
                    {React.createElement(option.Icon, { size: 18, className: `${option.accent} mt-0.5 shrink-0`, 'aria-hidden': true })}
                    <span className="min-w-0 sm:mt-2 sm:block">
                      <span className="block type-body font-bold text-[var(--text-main)]">{option.name}</span>
                      <span className="mt-0.5 block type-label leading-snug text-[var(--text-muted)]">{option.description}</span>
                      <span className="mt-1 block type-meta font-bold text-gray-600">
                        {option.categories.length} {option.categories.length === 1 ? 'category' : 'categories'} · {option.categories.reduce((total, category) => total + category.channels.length, 0)} channels
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeCreateModal} disabled={isCreatingServer} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isCreatingServer || !serverName.trim()} className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50">
                {isCreatingServer ? 'Creating…' : `Create ${SERVER_PRESETS[serverPreset]?.name || ''} server`}
              </button>
            </div>
          </form>
        </div>
      )}

      {isJoinModalOpen && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleJoinServer} className="ios-sheet w-80 max-w-full rounded-3xl p-5">
            <h2 className="type-title font-bold text-[var(--text-main)]">Join a server</h2>
            <p className="mb-4 mt-1 type-label text-[var(--text-muted)]">Enter the invite code shared with you.</p>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 uppercase text-[var(--text-main)] outline-none" placeholder="Invite code" autoFocus />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeJoinModal} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)]">Join</button>
            </div>
          </form>
        </div>
      )}

      {channelModalCategoryId && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateChannelSubmit} className="ios-sheet w-80 max-w-full rounded-3xl p-5">
            <h2 className="mb-4 type-title font-bold text-[var(--text-main)]">Create Channel</h2>
            <input value={channelName} onChange={(e) => setChannelName(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="Channel name" autoFocus />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {['text', 'voice'].map(type => (
                <label key={type} className={`ios-choice-card flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 h-10 type-body font-bold capitalize ${channelType === type ? 'is-active' : ''}`}>
                  <input type="radio" name="channel-type" value={type} checked={channelType === type} onChange={(e) => setChannelType(e.target.value)} className="sr-only" />
                  {type}
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeChannelModal} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={isCreatingChannel} className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)] disabled:opacity-60">Create</button>
            </div>
          </form>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateCategorySubmit} className="ios-sheet w-80 max-w-full rounded-3xl p-5">
            <h2 className="mb-4 type-title font-bold text-[var(--text-main)]">Create Category</h2>
            <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="Category name" autoFocus />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeCategoryModal} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={isCreatingCategory} className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)] disabled:opacity-60">Create</button>
            </div>
          </form>
        </div>
      )}

      {editingServerItem && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleEditServerItemSubmit} className="ios-sheet w-80 max-w-full rounded-3xl p-5">
            <h2 className="mb-4 type-title font-bold text-[var(--text-main)]">{editingServerItem.type === 'category' ? 'Edit Category' : 'Edit Channel'}</h2>
            <input value={editingServerItemName} onChange={(e) => setEditingServerItemName(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="Name" autoFocus />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeEditServerItemModal} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={isSavingServerItem} className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)] disabled:opacity-60">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
