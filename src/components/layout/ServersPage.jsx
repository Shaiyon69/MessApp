/**
 * Servers and group chats: the joined-server list, the channel/category tree of
 * the selected server, and the create/join/invite/channel/category mutations.
 * Lifted wholesale out of the old LeftSidebar. Dashboard owns selection and
 * permissions; Supabase policies still authorize every mutation here — the
 * canManageServer checks below are convenience, never the security boundary.
 */
import React, { useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react'
import { AtSign, Bell, BellOff, Camera, CheckCheck, ChevronDown, ChevronLeft, Lock, Settings, FolderPlus, Gamepad2, GraduationCap, Hash, ImagePlus, LogOut, MailOpen, MicOff, MonitorUp, MoreVertical, Pencil, Pin, PinOff, Plus, Sparkles, Trash2, UserPlus, Volume2, VolumeX, X } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import ServerIcon from '../ui/ServerIcon'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import useLongPress from '../../hooks/useLongPress'
import useStoredSet from '../../hooks/useStoredSet'
import useFirstReveal from '../../hooks/useFirstReveal'
import ActionSheet from '../ui/ActionSheet'
import { NOTIFICATION_LEVELS, createServerNotificationPreferencesRepository, notificationLevelOf } from '../../lib/serverNotificationPreferences'
import ConfirmDialog from '../ui/ConfirmDialog'
import { provisionServerPreset, SERVER_PRESETS } from '../../lib/serverPresets'
import { assertAvatarFile, avatarObjectName, deleteAvatarImage, uploadAvatarImage, MAX_AVATAR_SOURCE_SIZE_BYTES } from '../../lib/avatarUpload'
import { debug } from '../../lib/debug'
import { parseInviteCode } from '../../lib/invites'
import ServerSettings from '../modals/ServerSettings'
import ChannelEditor from '../modals/ChannelEditor'

// Same flag and table as RightSidebar's mute button; separate instance, same rows.
const serverNotificationPreferences = createServerNotificationPreferencesRepository(supabase, {
  enabled: import.meta.env?.VITE_SERVER_NOTIFICATION_PREFERENCES_ENABLED === 'true'
})

// Only mounts while cropping a server icon — kept out of the boot bundle.
const MediaEditorModal = lazy(() => import('../media/MediaEditorModal'))

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
  /* The options sheet: opened from the detail bar's ⋮ for the active server, or
     by holding a row in the server list for that row's server. */
  const [sheetServer, setSheetServer] = useState(null)
  const [sheetServerLevel, setSheetServerLevel] = useState(null)
  const [pinnedServers, togglePinnedServer] = useStoredSet(`messapp:pinnedServers:${props.session?.user?.id}`)
  const [settingsServer, setSettingsServer] = useState(null)
  const [editingChannel, setEditingChannel] = useState(null)
  const [collapsedCategories, toggleCategory] = useStoredSet(`messapp:collapsedCategories:${props.session?.user?.id}`)
  const [serverItemSheet, setServerItemSheet] = useState(null)
  /* Every destructive row here parks its work in one prompt: `{ title, body,
     confirmLabel, run }`, cleared when the prompt closes. */
  const [dangerPrompt, setDangerPrompt] = useState(null)
  const [isRunningDangerAction, setIsRunningDangerAction] = useState(false)
  const [editingServerItem, setEditingServerItem] = useState(null)
  const [editingServerItemName, setEditingServerItemName] = useState('')
  const [isSavingServerItem, setIsSavingServerItem] = useState(false)
  /* Icon edits stage locally: the picked file goes through the editor, the
     upload returns a URL, and only the sheet's Save writes it to the server.
     `''` means "cleared" so it stays distinguishable from "untouched" (null). */
  const [serverIconFile, setServerIconFile] = useState(null)
  const [stagedServerIcon, setStagedServerIcon] = useState(null)
  const [isUploadingServerIcon, setIsUploadingServerIcon] = useState(false)
  const serverCreationRequestRef = useRef(null)
  /* One picker for both the create form and the edit sheet — they are on
     different panes and can never be open at the same time. */
  const serverIconInputRef = useRef(null)

  /* The quick-actions FAB lives outside this component, so create/join arrive
     as a one-shot prop instead of a callback into local modal state. */
  useEffect(() => {
    if (!props.pendingServerAction) return
    setPanelView('list')
    if (props.pendingServerAction === 'create') setIsCreateModalOpen(true)
    if (props.pendingServerAction === 'join') setIsJoinModalOpen(true)
    props.onServerActionHandled?.()
  }, [props.pendingServerAction, props.onServerActionHandled])

  const unreadChannels = useMemo(() => new Set(props.unreadChannelIds || []), [props.unreadChannelIds])
  // Mentions need a reply in a way plain unread does not, so they get their own marker.
  // Roving tab stop over text channels: the active one, else the first.
  const textChannelIds = (props.serverCategories || []).flatMap(category => (category.channels || []).filter(channel => channel.type !== 'voice').map(channel => channel.id))
  const channelTabStop = textChannelIds.includes(props.activeChannel?.id) ? props.activeChannel.id : textChannelIds[0]
  const mentionedChannels = useMemo(() => new Set((props.notificationFeed || []).filter(row => row.kind === 'mention' && !row.read_at && row.channel_id).map(row => row.channel_id)), [props.notificationFeed])
  const canManageServer = Boolean(props.canManageActiveServer)
  const bindServerLongPress = useLongPress(setSheetServer)
  const servers = [...props.servers].sort((a, b) => pinnedServers.has(b.id) - pinnedServers.has(a.id))
  const revealRow = useFirstReveal('servers', servers.length > 0)
  const isSheetActive = sheetServer?.id === props.activeServer?.id

  // null = unknown or the preferences table is not deployed; the row hides.
  useEffect(() => {
    setSheetServerLevel(null)
    if (!sheetServer?.id || !props.session?.user?.id) return undefined
    let active = true
    serverNotificationPreferences.load(sheetServer.id, props.session.user.id).then(({ data, error, unavailable }) => {
      if (active && !unavailable && !error) setSheetServerLevel(notificationLevelOf(data))
    })
    return () => { active = false }
  }, [sheetServer?.id, props.session?.user?.id])

  const setSheetServerNotificationLevel = async (server, level) => {
    const { error, unavailable } = await serverNotificationPreferences.upsert({
      server_id: server.id,
      profile_id: props.session.user.id,
      level,
      updated_at: new Date().toISOString()
    })
    if (error || unavailable) return toast.error('Could not update notifications')
    toast.success(`Notifications: ${NOTIFICATION_LEVELS[level].label}`)
  }
  /* The server menu has no category picker, so Create Channel drops into the
     first category — same default the per-category button would give. */
  const firstCategoryId = (props.serverCategories || [])[0]?.id
  /* Holding a category or channel row — or right-clicking it — opens its
     options sheet: `{ type: 'category' | 'channel', item }`. */
  const bindLongPress = useLongPress(setServerItemSheet)

  // Server-wide voice presence resolves occupancy for every channel; the local
  // fallback only knows about the channel this client joined.
  const getVoiceParticipantsForChannel = (channelId) => {
    if (props.getVoiceParticipantsForChannel) return props.getVoiceParticipantsForChannel(channelId)
    if (props.activeVoiceSession?.channelId !== channelId) return []
    return props.voiceSessionState?.participants || []
  }

  const clearStagedServerIcon = () => {
    setServerIconFile(null)
    setStagedServerIcon(null)
    setIsUploadingServerIcon(false)
  }
  const closeCreateModal = () => {
    setServerName('')
    setServerPreset('gaming')
    setIsCreatingServer(false)
    serverCreationRequestRef.current = null
    clearStagedServerIcon()
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
    clearStagedServerIcon()
  }
  const openEditServerItemModal = (type, item) => {
    if (!canManageServer) return toast.error(type === 'server' ? 'Only server admins can edit this server.' : 'Only server admins can manage channels.')
    if (!item) return
    setServerItemSheet(null)
    setSheetServer(null)
    clearStagedServerIcon()
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

  /* Server pictures reuse the public `avatars` bucket, so the object name has to
     keep the uploader's `${uid}-avatar-` prefix the bucket policy requires. */
  const selectServerIcon = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      assertAvatarFile(file, { maxBytes: MAX_AVATAR_SOURCE_SIZE_BYTES })
      setServerIconFile(file)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const uploadServerIcon = async (editedFile) => {
    setIsUploadingServerIcon(true)
    try {
      const url = await uploadAvatarImage(supabase, editedFile, avatarObjectName(props.session.user.id, editedFile, 'server-'))
      /* Picking twice before saving would otherwise strand the first upload —
         it was never written to the server, so nothing else can reach it. */
      if (stagedServerIcon) await deleteAvatarImage(supabase, stagedServerIcon)
      setStagedServerIcon(url)
      setServerIconFile(null)
    } catch (error) {
      toast.error(error.message || 'Could not upload the picture')
    } finally {
      setIsUploadingServerIcon(false)
    }
  }

  /* update_server rewrites name and icon together, so both values always go on
     every call — sending one alone would blank the other. */
  const saveServerDetails = async (serverId, name, iconUrl) => {
    const { data, error } = await supabase.rpc('update_server', {
      target_server_id: serverId,
      new_name: name,
      new_icon_url: iconUrl || null
    })
    if (error) throw error
    return data
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

      /* A failed picture must not sink a created server — same treatment the
         preset provisioning above gets. */
      let createdServer = server
      if (stagedServerIcon) {
        try {
          createdServer = { ...server, ...(await saveServerDetails(server.id, name, stagedServerIcon)) }
        } catch (iconError) {
          toast.error('Server created, but the picture could not be saved.')
          console.warn('[SERVER_ICON] Server created without its picture.', { name: iconError?.name, code: iconError?.code })
        }
      }

      closeCreateModal()
      await refreshServers(createdServer)
      if (presetApplied) toast.success(`${SERVER_PRESETS[serverPreset]?.name || 'Server'} space created`)
      else toast('Server created with the default channels. You can add the remaining preset channels manually.', { icon: '⚠️', duration: 6000 })
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'create-server', error })
      setIsCreatingServer(false)
      toast.error('Could not create server')
    }
  }

  const handleJoinServer = async (e) => {
    e.preventDefault()
    // A pasted link or a bare code both open the invite preview, which joins.
    const code = parseInviteCode(inviteCode)
    if (!code) return toast.error('Paste an invite link or code')
    closeJoinModal()
    props.onOpenInvite?.(code)
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
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'create-channel', error })
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
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'create-category', error })
      setIsCreatingCategory(false)
      toast.error('Could not create category')
    }
  }

  const handleEditServerItemSubmit = async (e) => {
    e.preventDefault()
    const isServerEdit = editingServerItem?.type === 'server'
    if (!canManageServer) return toast.error(isServerEdit ? 'Only server admins can edit this server.' : 'Only server admins can manage channels.')
    const name = editingServerItemName.trim()
    if (!editingServerItem || !name) return toast.error('Enter a name')
    setIsSavingServerItem(true)
    try {
      if (isServerEdit) {
        /* `''` is a deliberate clear; `null` means the icon was left alone. */
        const iconUrl = stagedServerIcon === null ? editingServerItem.item.icon_url : stagedServerIcon
        const previousIconUrl = editingServerItem.item.icon_url
        const updated = await saveServerDetails(editingServerItem.item.id, name, iconUrl)
        /* Only after the save lands: a failed RPC must leave the live picture
           where it is. */
        if (previousIconUrl && previousIconUrl !== updated?.icon_url) await deleteAvatarImage(supabase, previousIconUrl)
        /* The RPC returns a bare servers row — merge so the server_members join
           Dashboard loaded survives, or an admin loses manage rights until the
           next fetch. */
        props.setActiveServer?.({ ...editingServerItem.item, ...updated })
        await props.fetchServers?.()
        closeEditServerItemModal()
        toast.success('Server updated')
        return
      }
      if (editingServerItem.type === 'category') {
        await props.handleUpdateCategory?.(editingServerItem.item.id, name)
        toast.success('Category updated')
      } else {
        await props.handleUpdateChannel?.(editingServerItem.item.id, name)
        toast.success('Channel updated')
      }
      closeEditServerItemModal()
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'update-server-item', error })
      setIsSavingServerItem(false)
      if (isServerEdit) toast.error('Could not update server')
      else toast.error(editingServerItem.type === 'category' ? 'Could not update category' : 'Could not update channel')
    }
  }

  const askDeleteServerItem = (type, item) => {
    setServerItemSheet(null)
    if (!canManageServer) return toast.error('Only server admins can manage channels.')
    setDangerPrompt({
      title: `Delete ${item.name}?`,
      body: type === 'category'
        ? 'The category and every channel inside it are removed. This cannot be undone.'
        : 'The channel and its messages are removed. This cannot be undone.',
      confirmLabel: type === 'category' ? 'Delete Category' : 'Delete Channel',
      run: () => deleteServerItem(type, item)
    })
  }

  const deleteServerItem = async (type, item) => {
    try {
      if (type === 'category') {
        await props.handleDeleteCategory?.(item.id)
        toast.success('Category deleted')
      } else {
        await props.handleDeleteChannel?.(item.id)
        toast.success('Channel deleted')
      }
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'delete-server-item', error })
      toast.error(type === 'category' ? 'Could not delete category' : 'Could not delete channel')
    }
  }

  const askServerAction = (action, server) => {
    const serverName = server?.name || 'this server'
    setDangerPrompt(action === 'delete'
      ? {
        title: `Delete ${serverName}?`,
        body: 'Every channel, message, and member of this server is removed for everyone. This cannot be undone.',
        confirmLabel: 'Delete Server',
        run: () => runServerAction('delete', server)
      }
      : {
        title: `Leave ${serverName}?`,
        body: 'You lose access to its channels until someone invites you back.',
        confirmLabel: 'Leave Server',
        run: () => runServerAction('leave', server)
      })
  }

  const runServerAction = async (action, server) => {
    try {
      if (action === 'delete') await props.handleDeleteServer?.(server)
      else await props.handleLeaveServer?.(server)
      setPanelView('list')
      toast.success(action === 'delete' ? 'Server deleted' : 'Server left')
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'server-action', error })
      toast.error(action === 'delete' ? 'Could not delete server' : 'Could not leave server')
    }
  }

  const showDetail = panelView === 'detail' && props.activeServer

  return (
    <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 pt-4 md:px-2 ${showDetail ? 'min-h-full md:pt-0' : 'md:pt-3'} pb-[var(--dock-clear)] md:pb-4`}>
      {!showDetail ? (
        <>
          <div className="seg-group seg-plain">
            {props.serversLoading && props.servers.length === 0 && Array.from({ length: 4 }, (_, index) => (
              <div key={`server-skeleton-${index}`} className="flex min-h-16 items-center gap-3.5 rounded-2xl px-3" aria-hidden="true">
                <span className="skeleton h-11 w-11 rounded-xl" />
                <span className="skeleton h-3 w-32 rounded-full" />
              </div>
            ))}
            {servers.map((server, i) => (
              <div key={server.id || `server-${i}`} style={revealRow(i).style} className={`seg-item long-press-target p-0 ${revealRow(i).className}`} {...bindServerLongPress(server)}>
                <button
                  type="button"
                  onClick={() => openServer(server)}
                  className="server-list-row"
                >
                  <ServerIcon url={server.icon_url} name={server.name} />
                  <span className="min-w-0 flex-1 truncate text-left">{server.name}</span>
                  {pinnedServers.has(server.id) && <Pin size={14} className="shrink-0 text-[var(--text-muted)]" aria-label="Pinned" />}
                </button>
              </div>
            ))}
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
          {/* The server bar sits above the channel list: the server you are in is the
              heading for everything under it, so it stays pinned to the top while
              channels scroll beneath. */}
          <div className="sticky top-0 z-20 -mx-4 mb-1 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 md:-mx-2 md:px-3">
            <div className="relative flex min-h-14 items-center gap-2 py-2 md:min-h-12 md:py-1">
              {/* The desktop rail already lists every server, so only phones need the way back. */}
              <button type="button" onClick={() => setPanelView('list')} className="flex md:hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Back to servers" title="All servers">
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <ServerIcon url={props.activeServer?.icon_url} name={props.activeServer?.name} className="server-list-icon h-9 w-9 shrink-0 rounded-xl md:hidden" />
              <h3 className="min-w-0 flex-1 truncate font-display type-body font-bold text-[var(--text-main)]">{props.activeServer?.name || 'Server'}</h3>
              <button type="button" onClick={() => props.onInvite?.(props.activeServer)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--state-hover)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] md:h-9 md:w-9" aria-label="Invite people" title="Invite people">
                <UserPlus size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setSheetServer(props.activeServer)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Server menu" title="Server menu">
                <MoreVertical size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {props.serverChannelsLoading && Array.from({ length: 3 }, (_, index) => (
              <div key={`channel-group-skeleton-${index}`} className="rounded-2xl bg-[var(--surface-container)] p-3" aria-hidden="true">
                <div className="skeleton mb-3 h-2.5 w-24 rounded-full" />
                <div className="skeleton h-10 rounded-xl" />
              </div>
            ))}
            {(props.serverCategories || []).map(category => (
              <section key={category.id} className="server-channel-group">
                <div
                  className="server-channel-group-header long-press-target relative flex items-center pt-3"
                  {...(canManageServer ? bindLongPress({ type: 'category', item: category }) : null)}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    aria-expanded={!collapsedCategories.has(category.id)}
                    className="flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]"
                  >
                    <ChevronDown size={12} className={`shrink-0 transition-transform duration-150 ${collapsedCategories.has(category.id) ? '-rotate-90' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 truncate">{category.name}</span>
                  </button>
                </div>
                <div className="seg-group seg-plain">
                  {(category.channels || []).filter(channel => (
                    // A collapsed category still shows the open channel, like Discord.
                    !collapsedCategories.has(category.id) || channel.id === props.activeChannel?.id
                  )).map(channel => {
                    const isActive = props.activeChannel?.id === channel.id
                    const isUnread = !isActive && unreadChannels.has(channel.id)
                    const voiceParticipants = channel.type === 'voice' ? getVoiceParticipantsForChannel(channel.id) : []
                    return (
                      <div
                        key={channel.id}
                        data-selected={isActive || undefined}
                        className="seg-item long-press-target relative min-h-0 flex-col items-stretch gap-0 p-0"
                        {...bindLongPress({ type: 'channel', item: channel })}
                      >
                        <button
                          type="button"
                          onClick={() => props.setActiveChannel(channel)}
                          {...(channel.type !== 'voice' ? {
                            'data-conv-row': '',
                            'data-unread': isUnread || undefined,
                            'data-active': isActive || undefined,
                            tabIndex: channel.id === channelTabStop ? 0 : -1,
                          } : null)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`m3-press group relative flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-[inherit] px-2 py-1.5 pr-7 text-left type-body font-medium md:min-h-9 transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'text-[var(--text-main)]' : isUnread ? 'text-[var(--text-main)] hover:bg-[var(--state-hover)]' : 'text-gray-400 hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]'}`}>
                          <span className={`shrink-0 ${isActive ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
                            {channel.type === 'voice' ? <Volume2 size={18} aria-hidden="true" /> : <Hash size={18} aria-hidden="true" />}
                          </span>
                          <span className={`min-w-0 flex-1 truncate ${isUnread ? 'font-extrabold' : ''}`}>{channel.name}</span>
                          {channel.is_private && <Lock size={12} className="shrink-0 text-[var(--text-muted)]" aria-label="Private channel" />}
                          {/* Weight AND a dot — colour is never the only signal (design.md §6). */}
                          {/* Gated on unread: the notification row stays unread until the Notifications tab opens. */}
                          {isUnread && mentionedChannels.has(channel.id)
                            ? <AtSign size={14} strokeWidth={3} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-base)]" aria-label="You were mentioned" />
                            : isUnread && <span className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--theme-base)]" aria-label="Unread" />}
                        </button>
                        {voiceParticipants.length > 0 && (
                          <div data-no-long-press className="voice-participant-list space-y-0.5 pb-1.5 pl-9 pr-1.5">
                            {voiceParticipants.map(participant => {
                              const hasStream = participant.cameraActive || participant.screenShareActive
                              return (
                                <button
                                  type="button"
                                  key={`${channel.id}-${participant.id}`}
                                  onClick={() => props.onVoiceParticipantSelect?.(participant)}
                                  className={`flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left type-label transition-colors hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${participant.speaking ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                  title={hasStream ? `Watch ${participant.displayName}` : participant.displayName}
                                  aria-label={`${participant.displayName}${participant.speaking ? ', speaking' : ''}`}
                                >
                                  {/* Speaking is the green ring on the avatar, nothing else. */}
                                  <span className={`shrink-0 rounded-full ring-2 transition-shadow duration-150 ${participant.speaking ? 'ring-green-500' : 'ring-transparent'}`}>
                                    <StatusAvatar url={participant.avatarUrl} username={participant.displayName} showStatus={false} className="h-6 w-6" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-medium">{participant.displayName}</span>
                                  <span className="flex shrink-0 items-center gap-1 text-[var(--text-muted)]">
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
                  {(category.channels || []).length === 0 && !collapsedCategories.has(category.id) && (
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
        </div>
      )}

      {isCreateModalOpen && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-end justify-center px-4 pb-[var(--dock-space)] md:items-center md:p-4">
          <form onSubmit={handleCreateServer} className="ios-sheet custom-scrollbar max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-3xl p-5">
            <h2 className="mb-4 type-title font-bold text-[var(--text-main)]">Create a server</h2>

            <div className="flex items-end gap-3">
              <button type="button" onClick={() => serverIconInputRef.current?.click()} disabled={isUploadingServerIcon} className="relative shrink-0 rounded-[.875rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] disabled:opacity-60" aria-label="Choose a server picture" title="Choose a server picture">
                <ServerIcon url={stagedServerIcon} name={serverName || '?'} />
                <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--theme-base)] text-[var(--accent-contrast)]">
                  <ImagePlus size={11} aria-hidden="true" />
                </span>
              </button>
              <label className="block min-w-0 flex-1">
                <span className="mb-2 block type-meta font-bold uppercase tracking-widest text-[var(--text-muted)]">Server name</span>
                <input value={serverName} onChange={(e) => setServerName(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="My community" autoFocus maxLength={100} />
              </label>
            </div>

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
        <div className="premium-backdrop fixed inset-0 z-50 flex items-end justify-center px-4 pb-[var(--dock-space)] md:items-center md:p-4">
          <form onSubmit={handleJoinServer} className="ios-sheet w-80 max-w-full rounded-3xl p-5">
            <h2 className="type-title font-bold text-[var(--text-main)]">Join a server</h2>
            <p className="mb-4 mt-1 type-label text-[var(--text-muted)]">Paste the invite link or code someone shared with you.</p>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="https://…/invite/AB12CD34EF56" aria-label="Invite link or code" autoFocus />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeJoinModal} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)]">Join</button>
            </div>
          </form>
        </div>
      )}

      {channelModalCategoryId && (
        <div className="premium-backdrop fixed inset-0 z-50 flex items-end justify-center px-4 pb-[var(--dock-space)] md:items-center md:p-4">
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
        <div className="premium-backdrop fixed inset-0 z-50 flex items-end justify-center px-4 pb-[var(--dock-space)] md:items-center md:p-4">
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
        <div className="premium-backdrop fixed inset-0 z-50 flex items-end justify-center px-4 pb-[var(--dock-space)] md:items-center md:p-4">
          <form onSubmit={handleEditServerItemSubmit} className="ios-sheet w-80 max-w-full rounded-3xl p-5">
            <h2 className="mb-4 type-title font-bold text-[var(--text-main)]">{editingServerItem.type === 'server' ? 'Edit Server' : editingServerItem.type === 'category' ? 'Edit Category' : 'Edit Channel'}</h2>
            {editingServerItem.type === 'server' && (
              <div className="mb-4 flex items-center gap-3">
                <ServerIcon
                  url={stagedServerIcon === null ? editingServerItem.item.icon_url : stagedServerIcon}
                  name={editingServerItemName || editingServerItem.item.name}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <button type="button" onClick={() => serverIconInputRef.current?.click()} disabled={isUploadingServerIcon} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 h-9 type-label font-bold text-[var(--text-main)] hover:bg-white/5 disabled:opacity-60">
                    <ImagePlus size={14} aria-hidden="true" />
                    {isUploadingServerIcon ? 'Uploading...' : 'Change picture'}
                  </button>
                  {(stagedServerIcon === null ? editingServerItem.item.icon_url : stagedServerIcon) && (
                    <button type="button" onClick={() => setStagedServerIcon('')} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-8 type-label font-bold text-gray-400 hover:bg-white/5">
                      <X size={14} aria-hidden="true" />
                      Remove picture
                    </button>
                  )}
                </div>
              </div>
            )}
            <input value={editingServerItemName} onChange={(e) => setEditingServerItemName(e.target.value)} className="ios-sheet-input w-full rounded-xl px-4 h-11 text-[var(--text-main)] outline-none" placeholder="Name" maxLength={100} autoFocus />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeEditServerItemModal} className="rounded-xl px-4 h-10 font-bold text-gray-300 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={isSavingServerItem || isUploadingServerIcon} className="rounded-xl bg-[var(--theme-base)] px-5 h-10 font-bold text-[var(--accent-contrast)] disabled:opacity-60">Save</button>
            </div>
          </form>
        </div>
      )}

      {settingsServer && (
        <ServerSettings
          server={settingsServer}
          categories={props.serverCategories || []}
          members={props.serverMembers || []}
          canManage={canManageServer}
          onEditServer={() => { setSettingsServer(null); openEditServerItemModal('server', settingsServer) }}
          onInvite={() => props.onInvite?.(settingsServer)}
          onEditChannel={channel => setEditingChannel(channel)}
          onClose={() => setSettingsServer(null)}
        />
      )}
      {editingChannel && (
        <ChannelEditor
          channel={editingChannel}
          members={props.serverMembers || []}
          currentUserId={props.session?.user?.id}
          appThemeMode={props.appThemeMode}
          onSaved={() => props.onChannelsChanged?.()}
          onClose={() => setEditingChannel(null)}
        />
      )}
      <input ref={serverIconInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" onChange={selectServerIcon} className="hidden" />
      {serverIconFile && (
        <Suspense fallback={null}>
          <MediaEditorModal
            file={serverIconFile}
            profile
            onCancel={() => setServerIconFile(null)}
            onSave={uploadServerIcon}
          />
        </Suspense>
      )}

      {sheetServer && (
        <ActionSheet
          aria-label={`${sheetServer.name} options`}
          onClose={() => setSheetServer(null)}
          header={<>
            <ServerIcon url={sheetServer.icon_url} name={sheetServer.name} className="server-list-icon h-10 w-10 shrink-0 rounded-xl" />
            <p className="truncate type-title font-semibold text-[var(--text-main)]">{sheetServer.name}</p>
          </>}
          items={[
            pinnedServers.has(sheetServer.id)
              ? { label: 'Unpin', Icon: PinOff, onSelect: () => togglePinnedServer(sheetServer.id, false) }
              : { label: 'Pin', Icon: Pin, onSelect: () => togglePinnedServer(sheetServer.id, true) },
            // Tapping steps all, mentions, muted; the label names the current level.
            sheetServerLevel !== null && {
              label: `Notifications: ${NOTIFICATION_LEVELS[sheetServerLevel].label}`,
              Icon: sheetServerLevel === 'none' ? BellOff : sheetServerLevel === 'mentions' ? AtSign : Bell,
              onSelect: () => setSheetServerNotificationLevel(sheetServer, NOTIFICATION_LEVELS[sheetServerLevel].next)
            },
            { label: 'Invite people', Icon: UserPlus, onSelect: () => props.onInvite?.(sheetServer) },
            /* Channel/category/edit mutations target Dashboard's activeServer, so
               they only appear for the server that is open. RLS still gates them. */
            isSheetActive && canManageServer && { label: 'Create category', Icon: FolderPlus, onSelect: () => setIsCategoryModalOpen(true) },
            isSheetActive && canManageServer && { label: 'Create channel', Icon: Hash, onSelect: () => openChannelModal(firstCategoryId) },
            isSheetActive && { label: 'Server settings', Icon: Settings, onSelect: () => setSettingsServer(sheetServer) },
            isSheetActive && canManageServer && { label: 'Edit server', Icon: Pencil, onSelect: () => openEditServerItemModal('server', sheetServer) },
            /* Deleting is the owner's alone — the delete_server RPC raises for
               anyone else, so an admin gets Leave instead of a button that fails. */
            sheetServer.owner_id === props.session?.user?.id
              ? { label: 'Delete server', Icon: Trash2, danger: true, onSelect: () => askServerAction('delete', sheetServer) }
              : { label: 'Leave server', Icon: LogOut, danger: true, onSelect: () => askServerAction('leave', sheetServer) }
          ]}
        />
      )}

      {serverItemSheet && (
        <ActionSheet
          aria-label={`${serverItemSheet.item.name} options`}
          onClose={() => setServerItemSheet(null)}
          header={<>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-element)] text-gray-400">
              {serverItemSheet.type === 'category' ? <FolderPlus size={18} aria-hidden="true" /> : serverItemSheet.item.type === 'voice' ? <Volume2 size={18} aria-hidden="true" /> : <Hash size={18} aria-hidden="true" />}
            </span>
            <p className="truncate type-title font-semibold text-[var(--text-main)]">{serverItemSheet.item.name}</p>
          </>}
          items={serverItemSheet.type === 'category' ? [
            { label: 'Create channel', Icon: Hash, onSelect: () => openChannelModal(serverItemSheet.item.id) },
            { label: 'Edit category', Icon: Pencil, onSelect: () => openEditServerItemModal('category', serverItemSheet.item) },
            { label: 'Delete category', Icon: Trash2, danger: true, onSelect: () => askDeleteServerItem('category', serverItemSheet.item) }
          ] : [
            serverItemSheet.item.type === 'voice'
              ? { label: 'Invite to voice', Icon: UserPlus, onSelect: () => props.onInvite?.(props.activeServer, serverItemSheet.item) }
              : { label: 'Invite people', Icon: UserPlus, onSelect: () => props.onInvite?.(props.activeServer) },
            // Voice channels carry no read pointer, so they get no read toggle.
            serverItemSheet.item.type !== 'voice' && (unreadChannels.has(serverItemSheet.item.id)
              ? { label: 'Mark as read', Icon: CheckCheck, onSelect: () => props.setChannelRead(serverItemSheet.item, true) }
              : { label: 'Mark as unread', Icon: MailOpen, onSelect: () => props.setChannelRead(serverItemSheet.item, false) }),
            canManageServer && { label: 'Channel settings', Icon: Pencil, onSelect: () => setEditingChannel(serverItemSheet.item) },
            canManageServer && { label: 'Delete channel', Icon: Trash2, danger: true, onSelect: () => askDeleteServerItem('channel', serverItemSheet.item) }
          ]}
        />
      )}

      {dangerPrompt && (
        <ConfirmDialog
          owner="ServersPage:danger-confirm"
          title={dangerPrompt.title}
          body={dangerPrompt.body}
          confirmLabel={dangerPrompt.confirmLabel}
          busy={isRunningDangerAction}
          onConfirm={async () => {
            setIsRunningDangerAction(true)
            /* `run` reports its own outcome through toasts, so the prompt just
               closes either way rather than second-guessing the result. */
            try { await dangerPrompt.run() } finally {
              setIsRunningDangerAction(false)
              setDangerPrompt(null)
            }
          }}
          onCancel={() => setDangerPrompt(null)}
        />
      )}
    </div>
  )
}
