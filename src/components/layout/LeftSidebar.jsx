/**
 * Renders DM/server/category/channel navigation and profile controls. Dashboard
 * owns selection and permissions; Supabase policies still authorize every
 * server, invite, category, and channel mutation.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Camera, Gamepad2, GraduationCap, Hash, Search, Copy, Settings, MoreVertical, Trash2, Plus, LogIn, MicOff, MonitorUp, Sparkles, Volume2, VolumeX, X, Users, ChevronLeft, ChevronDown, Home, UserRound } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import toast from 'react-hot-toast'
import { safeMediaUrl } from '../../lib/security'
import { supabase } from '../../supabaseClient'
import { provisionServerPreset, SERVER_PRESETS } from '../../lib/serverPresets'
import { getConversationTheme, resolveConversationThemeId } from '../../lib/conversationThemes'

const SERVER_PRESET_OPTIONS = [
  { ...SERVER_PRESETS.gaming, Icon: Gamepad2, accent: 'text-violet-300', active: 'border-violet-400/70 bg-violet-500/15' },
  { ...SERVER_PRESETS.study, Icon: GraduationCap, accent: 'text-sky-300', active: 'border-sky-400/70 bg-sky-500/15' },
  { ...SERVER_PRESETS.simple, Icon: Sparkles, accent: 'text-gray-300', active: 'border-gray-400/60 bg-white/[0.07]' }
]

export default function LeftSidebar(props) {
  const [sidebarSection, setSidebarSection] = useState(() => props.view === 'server' ? 'servers' : 'people')
  const [serverPanelView, setServerPanelView] = useState('list')
  const [isEditingStatus, setIsEditingStatus] = useState(false)
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false)
  const [statusDraft, setStatusDraft] = useState(props.myBio || '')
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
  const cancelStatusCommitRef = useRef(false)
  const serverCreationRequestRef = useRef(null)
  const statusOptions = [
    { id: 'online', label: 'Online', color: '#23a559' },
    { id: 'idle', label: 'Idle', color: '#f0b232' },
    { id: 'dnd', label: 'Do Not Disturb', color: '#f23f43' }
  ]
  const currentStatus = props.userStatus || 'online'
  const currentStatusLabel = statusOptions.find(option => option.id === currentStatus)?.label || 'Online'
  const isHomeLanding = props.view === 'home' && !props.activeDm && !props.activeServer
  const canManageServer = Boolean(props.canManageActiveServer)
  const getVoiceParticipantsForChannel = (channelId) => {
    if (props.activeVoiceSession?.channelId !== channelId) return []
    return props.voiceSessionState?.participants || []
  }
  const openProfileSettings = () => {
    props.setShowProfilePopout(false)
    props.setSettingsModalConfig({ isOpen: true, tab: 'account', showMenu: false })
    props.setMobileMenuOpen(false)
  }
  const openApplicationSettings = () => {
    props.setShowProfilePopout(false)
    props.setSettingsModalConfig({ isOpen: true, tab: 'account', showMenu: true })
    props.setMobileMenuOpen(false)
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
    setChannelModalCategoryId(categoryId)
    setChannelName('')
    setChannelType('text')
  }
  const refreshServers = async (server) => {
    await props.fetchServers?.()
    if (server) {
      setSidebarSection('servers')
      setServerPanelView('detail')
      props.setView('home')
      props.setActiveServer(server)
      props.setActiveChannel(null)
    }
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
      toast.success(action === 'delete' ? 'Server deleted' : 'Server left')
    } catch (_err) {
      toast.error(action === 'delete' ? 'Could not delete server' : 'Could not leave server')
    }
  }

  useEffect(() => {
    if (!props.showProfilePopout) {
      setStatusDrawerOpen(false)
      return undefined
    }

    const handlePointerDown = (event) => {
      if (props.popoutRef.current?.contains(event.target)) return
      if (event.target?.closest?.('[data-profile-popout-trigger]')) return
      props.setShowProfilePopout(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [props.popoutRef, props.setShowProfilePopout, props.showProfilePopout])

  const getBannerStyle = () => {
    const banner = props.myBanner
    const themeColor = props.myThemeColor || '#6366f1'
    if (!banner) return { backgroundImage: 'none', backgroundColor: themeColor }
    const safeBannerUrl = safeMediaUrl(banner)
    if (safeBannerUrl) {
      return { backgroundImage: `url(${safeBannerUrl})`, backgroundColor: 'transparent' }
    }
    if (/^#[0-9a-f]{3,8}$/i.test(banner) || (/^linear-gradient\(/i.test(banner) && !/url\(/i.test(banner))) {
      return { background: banner }
    }
    return { backgroundImage: 'none', backgroundColor: themeColor }
  }

  const startEditingStatus = () => {
    setStatusDraft(props.myBio || '')
    setIsEditingStatus(true)
  }

  const commitStatus = async () => {
    if (cancelStatusCommitRef.current) {
      cancelStatusCommitRef.current = false
      return
    }
    const nextStatus = statusDraft.trim()
    setIsEditingStatus(false)
    if (nextStatus === (props.myBio || '')) return
    try {
      await props.updateProfileBio?.(nextStatus)
      toast.success('Thoughts updated')
    } catch (_err) {
      setStatusDraft(props.myBio || '')
      toast.error('Could not update thoughts')
    }
  }

  const renderStatusGlyph = (option) => {
    if (option.id === 'online') return <span className="h-3 w-3 rounded-full" style={{ backgroundColor: option.color }} aria-hidden="true"></span>
    if (option.id === 'idle') {
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
          <path d="M14.75 15.75A7 7 0 1 1 7.25 4.25a5.25 5.25 0 0 0 7.5 11.5Z" fill={option.color} />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill={option.color} />
        <rect x="5.5" y="9" width="9" height="2" rx="1" fill="white" />
      </svg>
    )
  }

  return (
    <>
      {props.mobileMenuOpen && (
        <button
          type="button"
          data-ui-overlay-owner="LeftSidebar:mobile-menu-backdrop"
          className="premium-backdrop fixed inset-0 z-40 md:hidden"
          onClick={() => props.setMobileMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className={`fixed left-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-50 flex transition-transform duration-300 md:relative md:inset-y-auto md:translate-x-0 ${props.mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <aside
          className="app-left-panel ios-glass-sidebar flex h-full w-screen max-w-none shrink-0 flex-col md:m-3 md:mr-0 md:h-[calc(100%-1.5rem)] md:w-72 md:rounded-[2rem] lg:w-80"
          style={props.scopedChatStyle}
          aria-label="MessApp navigation"
        >
          <header className="messapp-nav-header shrink-0 px-4 pb-3 pt-4">
            <div className="flex min-h-12 items-center gap-3">
              <span className="block min-w-0 flex-1 truncate font-display text-[1.35rem] font-extrabold lowercase tracking-[-0.045em] text-[var(--text-main)]">
                messapp
              </span>
              <button
                type="button"
                onClick={() => props.setMobileMenuOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] md:hidden"
                aria-label="Close navigation"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 px-3 py-4">
            {sidebarSection === 'people' ? (
              <div className="space-y-4">
                <section className="sidebar-glass-section rounded-[1.5rem] p-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 block px-2">Direct Messages</span>
                  <div className="space-y-1">
                    {props.dmsLoading && props.dms.length === 0 && Array.from({ length: 5 }, (_, index) => (
                      <div key={`dm-skeleton-${index}`} className="flex min-h-[4.5rem] items-center gap-4 px-3.5 py-3.5" aria-hidden="true">
                        <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[var(--bg-element)]" />
                        <div className="h-3.5 animate-pulse rounded-full bg-[var(--bg-element)]" style={{ width: `${58 + (index % 3) * 12}%` }} />
                      </div>
                    ))}
                    {props.dms.map((dm, i) => {
                      const isActive = props.activeDm?.dm_room_id === dm.dm_room_id && props.view === 'home';
                      const dmThemeId = resolveConversationThemeId(dm.dm_rooms?.theme_id, dm.dm_rooms?.theme_color)
                      const dmColor = getConversationTheme(dmThemeId, props.appThemeMode).palette.accent;
                      const presenceStatus = props.getPresenceStatus?.(dm.profiles.id) || (props.onlineUsersSet.has(dm.profiles.id) ? 'online' : 'offline');
                      const isMenuOpen = props.dmActionMenuId === `sidebar-${dm.dm_room_id}`;
                      const isUnread = dm.is_unread && !isActive;
                      const messagePreview = dm.last_message_preview || (isUnread ? 'New message' : '')

                      return (
                        <div key={`dm-list-${dm.dm_room_id || i}`} className="relative group flex items-center mb-1">
                          <button onClick={() => { setSidebarSection('people'); props.setView('home'); props.selectDm(dm); props.setMobileMenuOpen(false) }} className={`ios-sidebar-row min-h-[4.5rem] flex-1 flex items-center gap-4 px-3.5 py-3.5 rounded-2xl cursor-pointer transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'is-active' : isUnread ? 'is-unread text-[var(--text-main)]' : 'text-gray-400 hover:text-[var(--text-main)] border-transparent'}`}>
                            <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={presenceStatus} className="w-11 h-11" />
                            <div className="flex-1 min-w-0 text-left pr-6">
                              <p className={`text-base truncate transition-colors ${isUnread ? 'font-extrabold' : 'font-semibold'}`} style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                              {messagePreview && <p className={`mt-0.5 truncate text-[13px] ${isUnread ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{messagePreview}</p>}
                            </div>
                            {isUnread && <span className="absolute right-9 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--theme-base)]"></span>}
                          </button>
                          
                          <button 
                            data-dm-action-menu="sidebar-trigger"
                            onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(isMenuOpen ? null : `sidebar-${dm.dm_room_id}`); }}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors focus-visible:opacity-100 opacity-100`}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {isMenuOpen && (
                              <div data-dm-action-menu="sidebar-panel" className="premium-menu absolute right-8 top-10 w-48 rounded-xl z-[70] py-1 animate-fade-in origin-top-right">
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setView('home'); props.selectDm(dm); }} className="w-full text-left px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors">Open Chat</button>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.restrictedUsersSet.has(dm.profiles.id) ? 'unrestrict' : 'restrict', profile: dm.profiles }); }} className="w-full text-left px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors">{props.restrictedUsersSet.has(dm.profiles.id) ? 'Unrestrict' : 'Mute (Restrict)'}</button>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.blockedUsersSet.has(dm.profiles.id) ? 'unblock' : 'block', profile: dm.profiles }); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">{props.blockedUsersSet.has(dm.profiles.id) ? 'Unblock' : 'Block User'}</button>
                                <div className="h-[1px] bg-[var(--border-subtle)] my-1 mx-2"></div>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: 'delete_dm', profile: dm.profiles, dm_room_id: dm.dm_room_id }); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-between group"><span>Delete Chat</span><Trash2 size={14} className="opacity-50 group-hover:opacity-100"/></button>
                              </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {sidebarSection === 'servers' && serverPanelView === 'list' && (
              <section className="sidebar-glass-section rounded-[1.5rem] p-2">
                <div className="mb-2 flex min-h-10 items-center justify-between gap-3 px-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--text-muted)]">Servers</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{props.servers.length} joined</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setIsJoinModalOpen(true)} className="server-list-action" aria-label="Join server" title="Join server">
                      <LogIn size={18} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setIsCreateModalOpen(true)} className="server-list-action" aria-label="Create server" title="Create server">
                      <Plus size={19} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {props.serversLoading && props.servers.length === 0 && Array.from({ length: 4 }, (_, index) => (
                    <div key={`server-list-skeleton-${index}`} className="flex min-h-16 animate-pulse items-center gap-3.5 rounded-2xl px-3">
                      <span className="h-11 w-11 rounded-xl bg-[var(--bg-element)]" />
                      <span className="h-3 w-32 rounded-full bg-[var(--bg-element)]" />
                    </div>
                  ))}
                  {props.servers.map((server, i) => {
                    const isActive = props.activeServer?.id === server.id && serverPanelView === 'detail'
                    const iconUrl = safeMediaUrl(server.icon_url)
                    return (
                      <button
                        key={server.id || `server-list-${i}`}
                        type="button"
                        onClick={() => {
                          setSidebarSection('servers')
                          setServerPanelView('detail')
                          props.setView('home')
                          props.setActiveServer(server)
                          props.setActiveChannel(null)
                        }}
                        className={`server-list-row ${isActive ? 'is-active' : ''}`}
                        aria-pressed={isActive}
                      >
                        <span className="server-list-icon">
                          {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-cover" /> : server.name?.slice(0, 2)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-left">{server.name}</span>
                      </button>
                    )
                  })}
                  {!props.serversLoading && props.servers.length === 0 && (
                    <p className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">No servers yet</p>
                  )}
                </div>
              </section>
            )}

            {sidebarSection === 'servers' && serverPanelView === 'detail' && props.activeServer ? (
              <div className="space-y-3">
                <div className="relative flex min-h-14 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-element)]/70 px-3 py-2 shadow-sm">
                  <button type="button" onClick={() => setServerPanelView('list')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Back to servers" title="All servers">
                    <ChevronLeft size={19} aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Server</p>
                    <h3 className="truncate font-headline text-base font-bold text-[var(--text-main)]">{props.activeServer?.name || 'Server'}</h3>
                  </div>
                  {canManageServer && (
                    <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-gray-400 transition-colors hover:border-[var(--theme-base)]/50 hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Create category" title="Create Category">
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" onClick={() => setIsServerMenuOpen(open => !open)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Server menu" title="Server menu">
                    <MoreVertical size={17} aria-hidden="true" />
                  </button>
                  {isServerMenuOpen && (
                    <div className="absolute right-2 top-14 z-[80] w-64 rounded-xl border border-gray-700 bg-gray-900 p-2 shadow-2xl">
                      <div className="mb-2 rounded-lg border border-gray-700 bg-gray-800 p-2">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Invite Code</p>
                        <button type="button" onClick={copyInviteCode} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-sm text-white hover:bg-gray-700">
                          <span className="truncate">{isGeneratingInvite ? 'Creating...' : activeInviteCode || 'Create code'}</span>
                          <Copy size={14} aria-hidden="true" />
                        </button>
                      </div>
                      {canManageServer ? (
                        <button type="button" onClick={() => runServerAction('delete')} className="w-full rounded-md px-3 py-2 text-left text-sm font-bold text-red-400 hover:bg-red-500/10">Delete Server</button>
                      ) : (
                        <button type="button" onClick={() => runServerAction('leave')} className="w-full rounded-md px-3 py-2 text-left text-sm font-bold text-red-400 hover:bg-red-500/10">Leave Server</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {props.serverChannelsLoading && Array.from({ length: 3 }, (_, index) => (
                    <div key={`channel-group-skeleton-${index}`} className="rounded-2xl bg-[var(--surface-container)] p-3" aria-hidden="true">
                      <div className="mb-3 h-2.5 w-24 animate-pulse rounded-full bg-[var(--bg-element)]" />
                      <div className="h-10 animate-pulse rounded-xl bg-[var(--bg-element)]" />
                    </div>
                  ))}
                  {(props.serverCategories || []).map(category => (
                    <section key={category.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/45 p-1.5">
                      <div className="relative flex min-h-9 items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-2 pb-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">{category.name}</span>
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-element)] px-1.5 font-mono text-[9px] font-bold text-gray-500" aria-label={`${(category.channels || []).length} channels`}>
                            {(category.channels || []).length}
                          </span>
                        </div>
                        {canManageServer && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openChannelModal(category.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`Create channel in ${category.name}`} title="Create Channel">
                              <Plus size={14} aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => setServerItemMenuId(serverItemMenuId === `category-${category.id}` ? null : `category-${category.id}`)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`${category.name} menu`} title="Category menu">
                              <MoreVertical size={14} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                        {serverItemMenuId === `category-${category.id}` && (
                          <div className="absolute right-1 top-9 z-[80] w-44 rounded-xl border border-gray-700 bg-gray-900 p-1 shadow-2xl">
                            <button type="button" onClick={() => openEditServerItemModal('category', category)} className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800">Edit Category</button>
                            <button type="button" onClick={() => deleteServerItem('category', category)} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Delete Category</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 pt-1.5">
                        {(category.channels || []).map(channel => {
                          const isActive = props.activeChannel?.id === channel.id
                          const voiceParticipants = channel.type === 'voice' ? getVoiceParticipantsForChannel(channel.id) : []
                          return (
                            <div key={channel.id} className={`relative rounded-xl ${channel.type === 'voice' && voiceParticipants.length > 0 ? 'bg-[var(--bg-element)]/55' : ''}`}>
                              <button type="button" onClick={() => props.setActiveChannel(channel)} className={`group relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 pr-10 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[var(--bg-element)] text-[var(--text-main)] shadow-sm' : 'text-gray-400 hover:bg-[var(--bg-base)] hover:text-[var(--text-main)]'}`}>
                                <span className={`absolute inset-y-2 left-0 w-0.5 rounded-r-full ${isActive ? 'bg-[var(--theme-base)]' : 'bg-transparent'}`} aria-hidden="true" />
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${isActive ? 'border-[var(--theme-base)]/30 bg-[var(--theme-20)] text-[var(--theme-base)]' : channel.type === 'voice' && voiceParticipants.length > 0 ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-[var(--border-subtle)] bg-[var(--bg-element)]/60 text-gray-500 group-hover:text-gray-300'}`}>
                                  {channel.type === 'voice' ? <Volume2 size={14} aria-hidden="true" /> : <Hash size={14} aria-hidden="true" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                                {channel.type === 'voice' && voiceParticipants.length > 0 && (
                                  <span className="shrink-0 rounded-full border border-green-500/15 bg-green-500/10 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wide text-green-300">{voiceParticipants.length} live</span>
                                )}
                              </button>
                              {canManageServer && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); setServerItemMenuId(serverItemMenuId === `channel-${channel.id}` ? null : `channel-${channel.id}`) }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`${channel.name} menu`} title="Channel menu">
                                  <MoreVertical size={14} aria-hidden="true" />
                                </button>
                              )}
                              {serverItemMenuId === `channel-${channel.id}` && (
                                <div className="absolute right-2 top-10 z-[80] w-44 rounded-xl border border-gray-700 bg-gray-900 p-1 shadow-2xl">
                                  <button type="button" onClick={() => openEditServerItemModal('channel', channel)} className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800">Edit Channel</button>
                                  <button type="button" onClick={() => deleteServerItem('channel', channel)} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Delete Channel</button>
                                </div>
                              )}
                              {voiceParticipants.length > 0 && (
                                <div className="ml-5 space-y-1 border-l border-green-500/15 px-2 pb-2 pl-3 pt-1">
                                  {voiceParticipants.map(participant => {
                                    const hasStream = participant.cameraActive || participant.screenShareActive
                                    return (
                                      <button
                                        type="button"
                                        key={`${channel.id}-${participant.id}`}
                                        onClick={() => {
                                          props.onVoiceParticipantSelect?.(participant)
                                          props.setMobileMenuOpen(false)
                                        }}
                                        className={`flex min-h-8 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${participant.speaking ? 'bg-green-500/10 text-green-200' : participant.muted ? 'text-gray-600' : 'text-gray-400 hover:bg-[var(--bg-base)] hover:text-[var(--text-main)]'}`}
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
                            <p className="text-xs text-gray-500">No channels in this category</p>
                            {canManageServer && (
                              <button type="button" onClick={() => openChannelModal(category.id)} className="mt-1 text-[11px] font-bold text-[var(--theme-base)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]">
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
                      <p className="text-sm font-semibold text-gray-400">No categories yet</p>
                      <p className="mt-1 text-xs text-gray-600">Create one to start organizing channels.</p>
                      {canManageServer && (
                        <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-base)] px-3 py-2 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]">
                          <Plus size={14} aria-hidden="true" />
                          Create Category
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {props.showProfilePopout && (
            <div ref={props.popoutRef} className="premium-menu absolute bottom-[8.5rem] left-3 right-3 rounded-2xl overflow-hidden z-50 animate-profile-drawer flex flex-col origin-bottom">
              <div className="w-full h-24 bg-cover bg-center transition-all duration-300 shrink-0 relative" style={getBannerStyle()}>
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 items-start -mt-12 mb-3">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={openProfileSettings}
                      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] cursor-pointer"
                      aria-label="Edit profile"
                      title="Edit profile"
                    >
                      <StatusAvatar url={props.myAvatar} username={props.myUsername} status={currentStatus} className="w-24 h-24 bg-[var(--bg-surface)] rounded-full shadow-xl ring-4 ring-[var(--bg-surface)]" />
                    </button>
                  </div>
                  <div className="relative mt-14 ml-1 mr-1 min-h-12 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] px-4 py-2.5 text-left text-sm italic leading-relaxed text-gray-300 shadow-lg transition-colors focus-within:border-[var(--theme-base)] focus-within:ring-2 focus-within:ring-[var(--theme-base)]">
                    {isEditingStatus ? (
                      <input
                        type="text"
                        maxLength={60}
                        autoFocus
                        value={statusDraft}
                        onChange={(e) => setStatusDraft(e.target.value)}
                        onBlur={commitStatus}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') {
                            cancelStatusCommitRef.current = true
                            setStatusDraft(props.myBio || '')
                            setIsEditingStatus(false)
                          }
                        }}
                        className="relative z-10 w-full bg-transparent text-sm italic leading-relaxed text-[var(--text-main)] outline-none placeholder-gray-500"
                        placeholder="Share your thoughts"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={startEditingStatus}
                        className="relative z-10 block w-full text-left outline-none cursor-text"
                        aria-label="Edit thoughts"
                        title="Edit thoughts"
                      >
                        <span className="line-clamp-3">{props.myBio || 'Choose your character class'}</span>
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="bg-[var(--bg-element)] p-4 rounded-xl shadow-inner">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-bold text-[var(--text-main)] text-xl leading-tight truncate">{props.myUsername}</h3>
                      {props.myPronouns && <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">{props.myPronouns}</span>}
                    </div>
                    <p className="mt-1 truncate text-sm text-gray-400 font-mono">{props.myTag}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button type="button" onClick={openProfileSettings} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-[var(--bg-base)] text-[11px] font-bold text-gray-400 transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]">
                      <UserRound size={18} aria-hidden="true" />
                      Profile
                    </button>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(props.myTag); toast.success('User ID copied!') }} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-[var(--bg-base)] text-[11px] font-bold text-gray-400 transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]">
                      <Copy size={18} aria-hidden="true" />
                      Copy ID
                    </button>
                    <button type="button" onClick={openApplicationSettings} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-[var(--bg-base)] text-[11px] font-bold text-gray-400 transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]">
                      <Settings size={18} aria-hidden="true" />
                      Settings
                    </button>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-xl bg-[var(--bg-base)]">
                    <button
                      type="button"
                      onClick={() => setStatusDrawerOpen(open => !open)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-sm font-bold text-[var(--text-main)]"
                      aria-expanded={statusDrawerOpen}
                    >
                      <span>Status</span>
                      <span className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="flex h-5 w-5 items-center justify-center">{renderStatusGlyph(statusOptions.find(option => option.id === currentStatus) || statusOptions[0])}</span>
                        {currentStatusLabel}
                        <ChevronDown size={15} className={`transition-transform ${statusDrawerOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </span>
                    </button>
                    {statusDrawerOpen && (
                      <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] p-2 animate-fade-in" role="group" aria-label="Set presence status">
                        {statusOptions.map(option => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              props.setUserStatus?.(option.id)
                              setStatusDrawerOpen(false)
                            }}
                            className={`grid h-11 place-items-center rounded-xl transition-colors ${currentStatus === option.id ? 'bg-[var(--theme-20)] ring-1 ring-[var(--theme-base)]' : 'bg-[var(--bg-element)] hover:bg-[var(--bg-surface)]'}`}
                            aria-label={option.label}
                            title={option.label}
                            aria-pressed={currentStatus === option.id}
                          >
                            {renderStatusGlyph(option)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <nav className="mx-auto mb-2 flex shrink-0 items-center justify-center gap-1 rounded-2xl bg-[var(--surface-section)] p-1.5" aria-label="Browse MessApp">
            <button
              type="button"
              onClick={props.handleHomeClick}
              className={`grid h-11 w-11 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isHomeLanding ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]'}`}
              aria-label="Home"
              title="Home"
              aria-pressed={isHomeLanding}
            >
              <Home size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarSection('people')}
              className={`grid h-11 w-11 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${sidebarSection === 'people' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]'}`}
              aria-label="People"
              title="People"
              aria-pressed={sidebarSection === 'people'}
            >
              <Users size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => props.setShowQuickSwitcher(true)}
              className="grid h-11 w-11 place-items-center rounded-xl text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]"
              aria-label="Find or start"
              title="Find or start"
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => { setSidebarSection('servers'); setServerPanelView('list') }}
              className={`grid h-11 w-11 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${sidebarSection === 'servers' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]'}`}
              aria-label="Servers"
              title="Servers"
              aria-pressed={sidebarSection === 'servers'}
            >
              <Hash size={20} aria-hidden="true" />
            </button>
          </nav>

          <div className="ios-sidebar-footer mx-3 mb-[calc(1rem+env(safe-area-inset-bottom))] shrink-0 rounded-[1.35rem] p-1.5 relative z-50">
            <div className="flex items-center justify-between">
            <button data-profile-popout-trigger onClick={() => props.setShowProfilePopout(!props.showProfilePopout)} className={`flex items-center gap-2.5 min-w-0 p-1.5 rounded-xl transition-all text-left group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] flex-1 pr-2 ${props.showProfilePopout ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]'}`}>
              <StatusAvatar url={props.myAvatar} username={props.myUsername} status={currentStatus} className="w-9 h-9" />
              <div className="flex flex-col truncate">
                <span className="text-[13px] font-bold text-[var(--text-main)] truncate group-hover:text-[var(--color-primary)] transition-colors">{props.myUsername}</span>
                <span className="text-[10px] text-gray-500 truncate">{currentStatusLabel}</span>
              </div>
            </button>
            
            <button onClick={openApplicationSettings} className="p-2 text-gray-400 hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-surface)] transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] cursor-pointer" aria-label="Application Settings" title="App Settings">
              <Settings size={17} aria-hidden="true" />
            </button>
            </div>
          </div>
        </aside>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateServer} className="ios-sheet custom-scrollbar max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-[2rem] p-5 sm:p-6">
            <div className="mb-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Build your space</p>
              <h2 className="mt-1 text-2xl font-black text-white">Create a server</h2>
              <p className="mt-1 text-sm font-semibold text-gray-500">Pick a preset and MessApp will prepare its categories and channels.</p>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-500">Server name</span>
              <input value={serverName} onChange={(e) => setServerName(e.target.value)} className="ios-sheet-input w-full rounded-2xl px-4 py-3 text-[var(--text-main)] outline-none" placeholder="My community" autoFocus maxLength={100} />
            </label>

            <fieldset className="mt-5">
              <legend className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">Choose a preset</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {SERVER_PRESET_OPTIONS.map(option => (
                  <label key={option.id} className={`ios-choice-card cursor-pointer rounded-2xl p-3 transition-colors ${serverPreset === option.id ? 'is-active' : ''}`}>
                    <input type="radio" name="server-preset" value={option.id} checked={serverPreset === option.id} onChange={(event) => setServerPreset(event.target.value)} className="sr-only" />
                    {React.createElement(option.Icon, { size: 22, className: option.accent, 'aria-hidden': true })}
                    <span className="mt-3 block text-sm font-black text-white">{option.name}</span>
                    <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-gray-500">{option.description}</span>
                    <span className="mt-3 block text-[9px] font-black uppercase tracking-widest text-gray-600">
                      {option.categories.length} {option.categories.length === 1 ? 'category' : 'categories'} · {option.categories.reduce((total, category) => total + category.channels.length, 0)} channels
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeCreateModal} disabled={isCreatingServer} className="rounded-xl px-4 py-2.5 font-bold text-gray-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isCreatingServer || !serverName.trim()} className="rounded-xl bg-[var(--theme-base)] px-5 py-2.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isCreatingServer ? 'Creating…' : `Create ${SERVER_PRESETS[serverPreset]?.name || ''} server`}
              </button>
            </div>
          </form>
        </div>
      )}

      {isJoinModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleJoinServer} className="ios-sheet rounded-[2rem] p-6 w-96 max-w-full">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Invitation</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--text-main)]">Join a server</h2>
            <p className="mb-5 mt-1 text-sm text-[var(--text-muted)]">Enter the invite code shared with you.</p>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="ios-sheet-input w-full rounded-2xl px-4 py-3 text-[var(--text-main)] uppercase outline-none" placeholder="Invite code" autoFocus />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeJoinModal} className="rounded-xl px-4 py-2.5 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" className="rounded-xl bg-[var(--theme-base)] px-5 py-2.5 font-bold text-white">Join</button>
            </div>
          </form>
        </div>
      )}

      {channelModalCategoryId && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <form onSubmit={handleCreateChannelSubmit} className="bg-gray-900 rounded-lg border border-gray-700 p-6 w-96 max-w-[calc(100vw-2rem)]">
            <h2 className="text-xl font-bold text-white mb-4">Create Channel</h2>
            <input value={channelName} onChange={(e) => setChannelName(e.target.value)} className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white outline-none focus:border-indigo-500" placeholder="Channel name" autoFocus />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {['text', 'voice'].map(type => (
                <label key={type} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold capitalize cursor-pointer ${channelType === type ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                  <input type="radio" name="channel-type" value={type} checked={channelType === type} onChange={(e) => setChannelType(e.target.value)} className="sr-only" />
                  {type}
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeChannelModal} className="rounded-lg px-4 py-2 font-bold text-gray-300 hover:bg-gray-800">Cancel</button>
              <button type="submit" disabled={isCreatingChannel} className="rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white hover:bg-indigo-400 disabled:opacity-60">Create</button>
            </div>
          </form>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <form onSubmit={handleCreateCategorySubmit} className="bg-gray-900 rounded-lg border border-gray-700 p-6 w-96 max-w-[calc(100vw-2rem)]">
            <h2 className="text-xl font-bold text-white mb-4">Create Category</h2>
            <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white outline-none focus:border-indigo-500" placeholder="Category name" autoFocus />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeCategoryModal} className="rounded-lg px-4 py-2 font-bold text-gray-300 hover:bg-gray-800">Cancel</button>
              <button type="submit" disabled={isCreatingCategory} className="rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white hover:bg-indigo-400 disabled:opacity-60">Create</button>
            </div>
          </form>
        </div>
      )}

      {editingServerItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <form onSubmit={handleEditServerItemSubmit} className="bg-gray-900 rounded-lg border border-gray-700 p-6 w-96 max-w-[calc(100vw-2rem)]">
            <h2 className="text-xl font-bold text-white mb-4">{editingServerItem.type === 'category' ? 'Edit Category' : 'Edit Channel'}</h2>
            <input value={editingServerItemName} onChange={(e) => setEditingServerItemName(e.target.value)} className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white outline-none focus:border-indigo-500" placeholder="Name" autoFocus />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeEditServerItemModal} className="rounded-lg px-4 py-2 font-bold text-gray-300 hover:bg-gray-800">Cancel</button>
              <button type="submit" disabled={isSavingServerItem} className="rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white hover:bg-indigo-400 disabled:opacity-60">Save</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
