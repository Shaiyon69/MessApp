/**
 * Renders DM/server/category/channel navigation and profile controls. Dashboard
 * owns selection and permissions; Supabase policies still authorize every
 * server, invite, category, and channel mutation.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Camera, Hash, Home, Search, Copy, Settings, MoreVertical, Trash2, Plus, LogIn, MicOff, MonitorUp, Volume2, VolumeX } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import toast from 'react-hot-toast'
import { safeMediaUrl } from '../../lib/security'
import { supabase } from '../../supabaseClient'

export default function LeftSidebar(props) {
  const [isEditingStatus, setIsEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState(props.myBio || '')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)
  const [serverName, setServerName] = useState('')
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
  const statusOptions = [
    { id: 'online', label: 'Online', color: '#23a559' },
    { id: 'idle', label: 'Idle', color: '#f0b232' },
    { id: 'dnd', label: 'Do Not Disturb', color: '#f23f43' }
  ]
  const currentStatus = props.userStatus || 'online'
  const currentStatusLabel = statusOptions.find(option => option.id === currentStatus)?.label || 'Online'
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
  const closeCreateModal = () => {
    setServerName('')
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
      props.setView('server')
      props.setActiveServer(server)
      props.setActiveChannel(null)
      props.selectDm(null)
      props.setMobileMenuOpen(false)
    }
  }
  const handleCreateServer = async (e) => {
    e.preventDefault()
    const name = serverName.trim()
    if (!name) return toast.error('Enter a server name')
    try {
      const { data: server, error } = await supabase.rpc('create_server', {
        server_name: name,
        idempotency_key: crypto.randomUUID()
      })
      if (error) throw error

      closeCreateModal()
      await refreshServers(server)
      toast.success('Server created')
    } catch (_err) {
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
    if (!props.showProfilePopout) return undefined

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
        <div data-ui-overlay-owner="LeftSidebar:mobile-menu-backdrop" className="premium-backdrop fixed inset-0 z-40 md:hidden" onClick={() => props.setMobileMenuOpen(false)} />
      )}

      <div className={`fixed left-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-50 flex transition-transform duration-300 md:relative md:inset-y-auto md:translate-x-0 ${props.mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="flex h-full w-16 flex-col items-center border-r border-[var(--border-subtle)] bg-[#0f1117] py-3 shrink-0 relative z-20">
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto custom-scrollbar px-2">
            {props.serversLoading && props.servers.length === 0 && Array.from({ length: 4 }, (_, index) => (
              <div key={`server-skeleton-${index}`} className="h-12 w-12 animate-pulse rounded-2xl bg-gray-800/80" aria-hidden="true" />
            ))}
            {props.servers.map((server, i) => {
              const isActive = props.activeServer?.id === server.id && props.view === 'server'
              const iconUrl = safeMediaUrl(server.icon_url)

              return (
                <button
                  key={server.id || `server-${i}`}
                  type="button"
                  onClick={() => { props.setView('server'); props.setActiveServer(server); props.setActiveChannel(null); props.selectDm(null); props.setMobileMenuOpen(false) }}
                  className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl text-sm font-black uppercase transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${isActive ? 'bg-indigo-500 text-white shadow-lg' : 'bg-[var(--bg-surface)] text-gray-300 hover:bg-[var(--bg-element)] hover:text-white'}`}
                  title={server.name}
                  aria-label={server.name}
                >
                  {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-cover" /> : server.name?.slice(0, 2)}
                </button>
              )
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 px-2">
            <button type="button" onClick={() => setIsJoinModalOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-surface)] text-green-400 transition-all hover:bg-green-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 cursor-pointer" aria-label="Join Server" title="Join Server">
              <LogIn size={22} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setIsCreateModalOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-surface)] text-green-400 transition-all hover:bg-green-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 cursor-pointer" aria-label="Create Server" title="Create Server">
              <Plus size={24} aria-hidden="true" />
            </button>
            <hr className="w-8 border-gray-700 mx-auto my-2" />
            <button onClick={props.handleHomeClick} className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 text-white transition-all focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none cursor-pointer ${props.view === 'home' || props.view === 'notifications' ? 'shadow-lg shadow-indigo-500/25' : 'hover:bg-indigo-400'}`} aria-label="Home" title="Home">
              <Home size={22} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <aside className="app-left-panel h-full w-[calc(100vw-4rem)] max-w-80 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-xl md:w-64 md:max-w-none lg:w-72 xl:w-80 flex flex-col z-10 relative" style={props.scopedChatStyle}>
          {props.view !== 'server' && (
            <header className="h-14 md:h-16 px-6 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)]/80 backdrop-blur-xl">
              <h2 className="font-headline font-bold text-[var(--text-main)] tracking-tight truncate">MESSAPP</h2>
            </header>
          )}

          <div className={`flex-1 overflow-y-auto custom-scrollbar space-y-8 px-4 ${props.view === 'server' ? 'py-4' : 'py-6'}`}>
            {props.view === 'home' || props.view === 'notifications' ? (
              <div className="space-y-6">
                <button onClick={() => { props.setShowQuickSwitcher(true); props.setMobileMenuOpen(false); }} className="w-full bg-[var(--bg-element)] ghost-border text-[var(--text-main)] font-bold py-3.5 px-6 rounded-xl hover:bg-[var(--border-subtle)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                  <Search size={18} aria-hidden="true" /> Find or Start
                </button>
                
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 block px-2">Direct Messages</span>
                  <div className="space-y-1">
                    {props.dmsLoading && props.dms.length === 0 && Array.from({ length: 5 }, (_, index) => (
                      <div key={`dm-skeleton-${index}`} className="flex items-center gap-3.5 px-3.5 py-3" aria-hidden="true">
                        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--bg-element)]" />
                        <div className="h-3.5 animate-pulse rounded-full bg-[var(--bg-element)]" style={{ width: `${58 + (index % 3) * 12}%` }} />
                      </div>
                    ))}
                    {props.dms.map((dm, i) => {
                      const isActive = props.activeDm?.dm_room_id === dm.dm_room_id && props.view === 'home';
                      const dmColor = dm.dm_rooms?.theme_color || '#6366f1';
                      const presenceStatus = props.getPresenceStatus?.(dm.profiles.id) || (props.onlineUsersSet.has(dm.profiles.id) ? 'online' : 'offline');
                      const isMenuOpen = props.dmActionMenuId === `sidebar-${dm.dm_room_id}`;
                      const isUnread = dm.is_unread && !isActive;

                      return (
                        <div key={`dm-list-${dm.dm_room_id || i}`} className="relative group flex items-center mb-1">
                          <button onClick={() => { props.setView('home'); props.selectDm(dm); }} className={`flex-1 flex items-center gap-3.5 px-3.5 py-3 rounded-xl cursor-pointer transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[var(--bg-element)] border-[var(--border-subtle)] shadow-inner' : isUnread ? 'bg-indigo-500/10 text-[var(--text-main)] border-indigo-400/20 shadow-[0_0_18px_rgba(99,102,241,0.12)]' : 'hover:bg-[var(--bg-base)] text-gray-400 hover:text-[var(--text-main)] border-transparent'}`}>
                            <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={presenceStatus} className="w-10 h-10" />
                            <div className="flex-1 min-w-0 text-left pr-6">
                              <p className={`text-[15px] truncate transition-colors ${isUnread ? 'font-extrabold' : 'font-semibold'}`} style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                            </div>
                            {isUnread && <span className="absolute right-9 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-300 shadow-[0_0_10px_rgba(165,180,252,0.9)]"></span>}
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
                </div>
              </div>
            ) : null}

            {props.view === 'server' ? (
              <div className="space-y-5">
                <div className="relative flex items-center justify-between gap-2 px-2">
                  <h3 className="font-headline text-lg font-bold text-[var(--text-main)] truncate">{props.activeServer?.name || 'Server'}</h3>
                  <button type="button" onClick={() => setIsServerMenuOpen(open => !open)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Server menu" title="Server menu">
                    <MoreVertical size={18} aria-hidden="true" />
                  </button>
                  {isServerMenuOpen && (
                    <div className="absolute right-2 top-11 z-[80] w-64 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-2xl">
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
                {canManageServer && (
                  <div className="px-2">
                    <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-bold text-gray-200 transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                      <Plus size={16} aria-hidden="true" />
                      Create Category
                    </button>
                  </div>
                )}
                <div className="space-y-4">
                  {(props.serverCategories || []).map(category => (
                    <section key={category.id} className="space-y-1 rounded-xl border border-transparent px-1 py-1">
                      <div className="relative flex min-h-8 items-center justify-between gap-2 px-2">
                        <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.08em] text-gray-500">{category.name}</span>
                        {canManageServer && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openChannelModal(category.id)} className="rounded-md p-1 text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`Create channel in ${category.name}`} title="Create Channel">
                              <Plus size={14} aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => setServerItemMenuId(serverItemMenuId === `category-${category.id}` ? null : `category-${category.id}`)} className="rounded-md p-1 text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`${category.name} menu`} title="Category menu">
                              <MoreVertical size={14} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                        {serverItemMenuId === `category-${category.id}` && (
                          <div className="absolute right-2 top-7 z-[80] w-44 rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-2xl">
                            <button type="button" onClick={() => openEditServerItemModal('category', category)} className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800">Edit Category</button>
                            <button type="button" onClick={() => deleteServerItem('category', category)} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Delete Category</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        {(category.channels || []).map(channel => {
                          const isActive = props.activeChannel?.id === channel.id
                          const voiceParticipants = channel.type === 'voice' ? getVoiceParticipantsForChannel(channel.id) : []
                          return (
                            <div key={channel.id} className={`relative overflow-hidden rounded-lg ${channel.type === 'voice' && voiceParticipants.length > 0 ? 'bg-[var(--bg-element)]/65' : ''}`}>
                              <button type="button" onClick={() => { props.setActiveChannel(channel); props.setMobileMenuOpen(false) }} className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 pr-10 text-left text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[var(--bg-element)] text-[var(--text-main)] shadow-inner' : 'text-gray-400 hover:bg-[var(--bg-base)] hover:text-[var(--text-main)]'}`}>
                                <span className={`flex w-4 shrink-0 justify-center ${channel.type === 'voice' && voiceParticipants.length > 0 ? 'text-green-400' : 'text-gray-500'}`}>{channel.type === 'voice' ? <Volume2 size={15} aria-hidden="true" /> : <Hash size={15} aria-hidden="true" />}</span>
                                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                                {channel.type === 'voice' && voiceParticipants.length > 0 && (
                                  <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-green-300">{voiceParticipants.length} live</span>
                                )}
                              </button>
                              {canManageServer && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); setServerItemMenuId(serverItemMenuId === `channel-${channel.id}` ? null : `channel-${channel.id}`) }} className="absolute right-2 top-2 rounded-md p-1 text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label={`${channel.name} menu`} title="Channel menu">
                                  <MoreVertical size={14} aria-hidden="true" />
                                </button>
                              )}
                              {serverItemMenuId === `channel-${channel.id}` && (
                                <div className="absolute right-2 top-9 z-[80] w-44 rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-2xl">
                                  <button type="button" onClick={() => openEditServerItemModal('channel', channel)} className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800">Edit Channel</button>
                                  <button type="button" onClick={() => deleteServerItem('channel', channel)} className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Delete Channel</button>
                                </div>
                              )}
                              {voiceParticipants.length > 0 && (
                                <div className="space-y-1 px-2 pb-2 pl-7">
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
                      </div>
                    </section>
                  ))}
                  {(props.serverCategories || []).length === 0 && (
                    <p className="px-2 text-sm text-gray-500">No categories yet.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {props.showProfilePopout && (
            <div ref={props.popoutRef} className="premium-menu absolute bottom-[5.75rem] left-3 right-3 rounded-2xl overflow-hidden z-50 animate-profile-drawer flex flex-col origin-bottom">
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
                    <button onClick={() => { navigator.clipboard.writeText(props.myTag); toast.success('User ID copied!'); }} className="mt-1 inline-flex max-w-full items-center gap-2 rounded-lg text-sm text-gray-400 font-mono hover:text-[var(--theme-base)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                      <span className="truncate">{props.myTag}</span><Copy size={14} className="shrink-0" />
                    </button>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-3 gap-2">
                    {statusOptions.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => props.setUserStatus?.(option.id)}
                        className={`min-h-12 rounded-xl border px-2 py-2 text-[11px] font-bold leading-tight transition-all cursor-pointer ${currentStatus === option.id ? 'border-[var(--theme-base)] bg-[var(--theme-20)] text-[var(--text-main)]' : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]'}`}
                      >
                        <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center text-transparent">
                          {renderStatusGlyph(option)}
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0 relative z-50">
            <button data-profile-popout-trigger onClick={() => props.setShowProfilePopout(!props.showProfilePopout)} className={`flex items-center gap-3 min-w-0 p-2 rounded-xl transition-all text-left group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] flex-1 pr-2 ${props.showProfilePopout ? 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl -translate-y-1 rounded-2xl' : 'hover:bg-[var(--bg-surface)] border border-transparent'}`}>
              <StatusAvatar url={props.myAvatar} username={props.myUsername} status={currentStatus} className="w-11 h-11" />
              <div className="flex flex-col truncate">
                <span className="text-[15px] font-bold text-[var(--text-main)] truncate group-hover:text-[var(--color-primary)] transition-colors">{props.myUsername}</span>
                <span className="text-[11px] text-gray-500 truncate">{currentStatusLabel}</span>
              </div>
            </button>
            
            <button onClick={() => { props.setSettingsModalConfig({ isOpen: true, tab: 'account', showMenu: true }); props.setMobileMenuOpen(false); }} className="p-2 text-gray-400 hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-surface)] transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] cursor-pointer" aria-label="Application Settings" title="App Settings">
              <Settings size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <form onSubmit={handleCreateServer} className="bg-gray-900 rounded-lg border border-gray-700 p-6 w-96 max-w-[calc(100vw-2rem)]">
            <h2 className="text-xl font-bold text-white mb-4">Create Server</h2>
            <input value={serverName} onChange={(e) => setServerName(e.target.value)} className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white outline-none focus:border-indigo-500" placeholder="Server name" autoFocus />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeCreateModal} className="rounded-lg px-4 py-2 font-bold text-gray-300 hover:bg-gray-800">Cancel</button>
              <button type="submit" className="rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white hover:bg-indigo-400">Submit</button>
            </div>
          </form>
        </div>
      )}

      {isJoinModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <form onSubmit={handleJoinServer} className="bg-gray-900 rounded-lg border border-gray-700 p-6 w-96 max-w-[calc(100vw-2rem)]">
            <h2 className="text-xl font-bold text-white mb-4">Join Server</h2>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white uppercase outline-none focus:border-indigo-500" placeholder="Invite code" autoFocus />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeJoinModal} className="rounded-lg px-4 py-2 font-bold text-gray-300 hover:bg-gray-800">Cancel</button>
              <button type="submit" className="rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white hover:bg-indigo-400">Submit</button>
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
