/**
 * Renders members, search, pins, and conversation media from parent-owned state.
 * Attachment URLs are treated as ephemeral capabilities and opened only after
 * media safety validation.
 */
import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Search, ImagePlus, Eye, EyeOff, Ban, Trash2, FileText, Pin, Users, Flag, MoreHorizontal, UserMinus, ShieldCheck, Loader2, Bell, BellOff, ChevronDown, Link as LinkIcon } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { safeMediaUrl } from '../../lib/security'
import { supabase } from '../../supabaseClient'
import { SERVER_ROLES, canBanMember, canModerateMember } from '../../lib/serverModeration'
import { createServerNotificationPreferencesRepository } from '../../lib/serverNotificationPreferences'

const serverNotificationPreferences = createServerNotificationPreferencesRepository(supabase, {
  enabled: import.meta.env?.VITE_SERVER_NOTIFICATION_PREFERENCES_ENABLED === 'true'
})

const safeDocumentUrl = (value) => {
  const mediaUrl = safeMediaUrl(value, { allowDataImages: false })
  if (mediaUrl) return mediaUrl
  if (typeof value === 'string' && /^data:application\/octet-stream;base64,[a-z0-9+/=\s]+$/i.test(value.trim())) return value.trim()
  return null
}

const AccordionSection = ({ id, label, open, onToggle, children }) => {
  const panelId = `right-sidebar-section-${id}`
  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--surface-section)]">
      <button type="button" onClick={() => onToggle(id)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold text-[var(--text-main)]" aria-expanded={open} aria-controls={panelId}>
      <span>{label}</span>
      <ChevronDown size={17} className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div id={panelId} role="region" aria-label={label} className="px-4 pb-4 animate-fade-in">{children}</div>}
    </section>
  )
}

const ConversationThemePicker = ({ themes, value, onChange, disabled = false }) => (
  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Conversation theme">
    {themes.map(theme => {
      const selected = value === theme.id
      return (
        <button
          key={theme.id}
          type="button"
          onClick={() => onChange(theme.id)}
          disabled={disabled}
          aria-pressed={selected}
          className={`rounded-2xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${
            selected
              ? 'border-[var(--theme-base)] bg-[var(--theme-10)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)]'
          } ${disabled ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
        >
          <span className="mb-2 grid h-11 grid-cols-2 overflow-hidden rounded-xl border border-[var(--border-subtle)]" aria-hidden="true">
            <span className="relative" style={{ backgroundColor: theme.light.base }}>
              <span className="absolute bottom-1.5 left-1.5 h-3 w-6 rounded-full" style={{ backgroundColor: theme.light.element }} />
              <span className="absolute right-1.5 top-1.5 h-3 w-6 rounded-full" style={{ backgroundColor: theme.light.outgoingBackground || theme.light.accent, boxShadow: `inset 0 0 0 1px ${theme.light.outgoingBorder || theme.light.accent}` }} />
            </span>
            <span className="relative" style={{ backgroundColor: theme.dark.base }}>
              <span className="absolute bottom-1.5 left-1.5 h-3 w-6 rounded-full" style={{ backgroundColor: theme.dark.element }} />
              <span className="absolute right-1.5 top-1.5 h-3 w-6 rounded-full" style={{ backgroundColor: theme.dark.outgoingBackground || theme.dark.accent, boxShadow: `inset 0 0 0 1px ${theme.dark.outgoingBorder || theme.dark.accent}` }} />
            </span>
          </span>
          <span className="block truncate text-xs font-bold text-[var(--text-main)]">{theme.name}</span>
          <span className="mt-0.5 block truncate text-[10px] text-gray-500">{theme.description}</span>
        </button>
      )
    })}
  </div>
)

export default function RightSidebar({
  activeDm,
  activeServer,
  activeServerRole,
  currentUserId,
  serverMembers = [],
  onServerMembersChanged,
  toggleRightSidebar,
  closeRightSidebar,
  rightTab,
  onlineUsersSet,
  getPresenceStatus,
  getPresenceLabel,
  handleConversationThemeChange,
  currentConversationThemeId,
  conversationThemeSchemaAvailable,
  currentThemeHex,
  handleWallpaperChange,
  handleCustomWallpaperUpload,
  customWallpaperBusy,
  customWallpaperSelected,
  currentWallpaper,
  setConfirmAction,
  restrictedUsersSet,
  blockedUsersSet,
  searchQuery,
  setSearchQuery,
  searchResults,
  scrollToMessage,
  CONVERSATION_THEMES,
  WALLPAPERS,
  scopedChatStyle,
  messages = [],
  pinnedMessages = [],
  togglePinnedMessage,
  setSelectedImage,
  onReportTarget
}) {
  const [mediaTab, setMediaTab] = useState('images')
  const [revealedSpoilerAttachments, setRevealedSpoilerAttachments] = useState(() => new Set())
  const [moderatingMember, setModeratingMember] = useState(null)
  const [moderationReason, setModerationReason] = useState('')
  const [moderationBusy, setModerationBusy] = useState('')
  const [moderationError, setModerationError] = useState('')
  const [openInfoSections, setOpenInfoSections] = useState(() => new Set())
  const [serverMuted, setServerMuted] = useState(false)
  const [serverNotificationsAvailable, setServerNotificationsAvailable] = useState(
    serverNotificationPreferences.isAvailable()
  )

  useEffect(() => {
    if (!activeServer?.id || !currentUserId) {
      setServerMuted(false)
      return
    }
    let active = true
    serverNotificationPreferences.load(activeServer.id, currentUserId)
      .then(({ data, error, unavailable }) => {
        if (!active) return
        if (unavailable) {
          setServerNotificationsAvailable(false)
          return
        }
        if (error) {
          console.warn('[SERVER_NOTIFICATIONS]', { operation: 'load', code: error.code, message: error.message })
          return
        }
        setServerNotificationsAvailable(true)
        setServerMuted(Boolean(data?.muted))
      })
    return () => { active = false }
  }, [activeServer?.id, currentUserId])

  const toggleInfoSection = id => {
    setOpenInfoSections(current => (
      current.has(id) ? new Set() : new Set([id])
    ))
  }

  const toggleServerMute = async () => {
    if (!activeServer?.id) return
    if (!serverNotificationsAvailable) {
      toast.error('Server mute needs the pending database update.')
      return
    }
    const nextMuted = !serverMuted
    setServerMuted(nextMuted)
    const { error, unavailable } = await serverNotificationPreferences.upsert({
      server_id: activeServer.id,
      profile_id: currentUserId,
      muted: nextMuted,
      updated_at: new Date().toISOString()
    })
    if (unavailable) {
      setServerMuted(!nextMuted)
      setServerNotificationsAvailable(false)
      toast.error('Server mute needs the pending database update.')
      return
    }
    if (error) {
      setServerMuted(!nextMuted)
      if (!serverNotificationPreferences.isAvailable()) {
        setServerNotificationsAvailable(false)
        toast.error('Server mute needs the pending database update.')
      } else {
        toast.error('Could not update mute preference')
      }
      return
    }
    toast.success(nextMuted ? 'Server muted' : 'Server unmuted')
  }

  const closeModeration = () => {
    setModeratingMember(null)
    setModerationReason('')
    setModerationError('')
  }

  const runMemberAction = async (action, role = null) => {
    if (!activeServer?.id || !moderatingMember?.profile_id) return
    setModerationBusy(action)
    setModerationError('')
    try {
      const args = action === 'role'
        ? { target_server_id: activeServer.id, target_profile_id: moderatingMember.profile_id, new_role: role }
        : action === 'ban'
          ? { target_server_id: activeServer.id, target_profile_id: moderatingMember.profile_id, ban_reason: moderationReason.trim() || null }
          : { target_server_id: activeServer.id, target_profile_id: moderatingMember.profile_id, kick_reason: moderationReason.trim() || null }
      const rpc = action === 'role' ? 'set_server_member_role' : action === 'ban' ? 'ban_server_member' : 'kick_server_member'
      const { error } = await supabase.rpc(rpc, args)
      if (error) throw error
      toast.success(action === 'role' ? `Role changed to ${role}` : action === 'ban' ? 'Member banned' : 'Member removed')
      try {
        await onServerMembersChanged?.()
      } catch (refreshError) {
        console.warn('[SERVER_MODERATION]', { operation: 'refresh-members', message: refreshError?.message })
      }
      closeModeration()
    } catch (error) {
      setModerationError(error?.message || 'Moderation action failed')
    } finally {
      setModerationBusy('')
    }
  }

  const attachmentGroups = useMemo(() => {
    if (rightTab !== 'info' || (!activeDm && !activeServer)) return { images: [], documents: [], links: [] }
    const items = messages.flatMap(message => (message.message_attachments || []).map(attachment => ({ message, attachment })))
    const links = messages.flatMap(message => {
      if (message?.is_spoiler || typeof message?.content !== 'string') return []
      return [...message.content.matchAll(/https?:\/\/[^\s<]+/gi)].map(match => ({ message, url: match[0] }))
    })
    return {
      images: items.filter(item => item.attachment.file_type?.startsWith('image/') && safeMediaUrl(item.attachment.file_url)),
      documents: items.filter(item => !item.attachment.file_type?.startsWith('image/') && safeDocumentUrl(item.attachment.file_url)),
      links
    }
  }, [activeDm, activeServer, messages, rightTab])

  const activeAttachments = mediaTab === 'images'
    ? attachmentGroups.images
    : mediaTab === 'documents'
      ? attachmentGroups.documents
      : attachmentGroups.links
  const formatMessagePreview = (message) => {
    if (message?.is_spoiler) return 'Spoiler'
    if (!message?.content) return 'Attachment'
    const value = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    return value.length > 90 ? `${value.slice(0, 90)}...` : value
  }

  const getBannerStyle = (profile) => {
    const banner = profile?.banner_url
    const themeColor = profile?.theme_color || currentThemeHex || '#6366f1'
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

  if (!activeDm && !activeServer) return null;

  return (
    <>
      <div data-ui-overlay-owner="RightSidebar:backdrop" className="fixed inset-0 z-40 bg-[var(--bg-deep)]/20 backdrop-blur-[2px] animate-fade-in cursor-pointer transition-all duration-300 ease-out transform md:hidden" onClick={closeRightSidebar}></div>
      
      <aside className="fixed right-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-50 w-[min(22rem,92vw)] bg-[var(--chat-bg-surface)] border-l border-[var(--chat-border)] flex flex-col shrink-0 shadow-[-20px_0_56px_rgba(0,0,0,0.42)] backdrop-blur-xl animate-slide-right transition-all duration-300 ease-out transform md:relative md:inset-y-auto md:z-20 md:h-full md:w-72 md:max-w-none md:shadow-none md:backdrop-blur-none lg:w-80 xl:w-96" style={scopedChatStyle}>
        
        {rightTab === 'info' && activeServer && !activeDm && (
          <div className="relative flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="truncate text-lg font-bold text-[var(--text-main)]">{activeServer.name}</h2>
              <button onClick={closeRightSidebar} className="grid h-10 w-10 place-items-center rounded-full text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]" aria-label="Close server info">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="flex justify-center gap-8 px-5 py-4">
              <button type="button" onClick={toggleServerMute} disabled={!serverNotificationsAvailable} className="group flex min-w-14 flex-col items-center gap-1.5 text-xs font-medium text-gray-400 disabled:cursor-not-allowed disabled:opacity-50" aria-pressed={serverMuted} title={serverNotificationsAvailable ? undefined : 'Database update required'}>
                <span className={`grid h-11 w-11 place-items-center rounded-full transition-colors ${serverMuted ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'bg-[var(--bg-element)] text-[var(--text-main)] group-hover:bg-[var(--bg-element-hover)]'}`}>
                  {serverMuted ? <BellOff size={20} /> : <Bell size={20} />}
                </span>
                {serverNotificationsAvailable ? (serverMuted ? 'Unmute' : 'Mute') : 'Unavailable'}
              </button>
              <button type="button" onClick={() => toggleRightSidebar?.('search')} className="group flex min-w-14 flex-col items-center gap-1.5 text-xs font-medium text-gray-400">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg-element)] text-[var(--text-main)] transition-colors group-hover:bg-[var(--bg-element-hover)]">
                  <Search size={20} />
                </span>
                Search
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-5 pt-2 custom-scrollbar">
              <AccordionSection id="chat-info" label="Chat info" open={openInfoSections.has('chat-info')} onToggle={toggleInfoSection}>
                <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-element)] p-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--theme-20)] text-lg font-bold text-[var(--theme-base)]">
                    {activeServer.name?.slice(0, 1)?.toUpperCase() || 'S'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text-main)]">{activeServer.name}</p>
                    <p className="text-xs text-gray-500">{serverMembers.length} member{serverMembers.length === 1 ? '' : 's'} · {activeServerRole || 'member'}</p>
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection id="customize-chat" label="Customize chat" open={openInfoSections.has('customize-chat')} onToggle={toggleInfoSection}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-main)]">Server theme</p>
                      <p className="text-xs text-gray-500">
                        {conversationThemeSchemaAvailable === false
                          ? 'Database update required'
                          : ['owner', 'admin'].includes(activeServerRole) ? 'Visible to everyone' : 'Managed by server admins'}
                      </p>
                    </div>
                    <span className="h-7 w-7 shrink-0 rounded-full border-2 border-[var(--text-main)]/20" style={{ backgroundColor: currentThemeHex }} aria-hidden="true" />
                  </div>
                  <ConversationThemePicker
                    themes={CONVERSATION_THEMES}
                    value={currentConversationThemeId}
                    onChange={handleConversationThemeChange}
                    disabled={conversationThemeSchemaAvailable === false || !['owner', 'admin'].includes(activeServerRole)}
                  />
                </div>
              </AccordionSection>

              <AccordionSection id="chat-members" label="Chat members" open={openInfoSections.has('chat-members')} onToggle={toggleInfoSection}>
                <div className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Users size={15} />
                  {serverMembers.length} member{serverMembers.length === 1 ? '' : 's'}
                </div>
                <div className="space-y-2">
                  {serverMembers.map(member => {
                    const profile = member.profiles || {}
                    const status = getPresenceStatus?.(profile.id) || (onlineUsersSet.has(profile.id) ? 'online' : 'offline')
                    const canManageMember = canModerateMember(activeServerRole, member.role || 'member', member.profile_id === currentUserId)
                    return (
                      <div key={member.id || member.profile_id} className="flex items-center gap-3 rounded-xl bg-[var(--bg-element)] p-2.5">
                        <StatusAvatar url={profile.avatar_url} username={profile.username} status={status} className="h-10 w-10" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--text-main)]">{profile.username || 'Unknown user'}</p>
                          <p className="truncate text-xs capitalize text-gray-500">{member.role || 'member'} · {getPresenceLabel?.(profile.id) || 'Offline'}</p>
                        </div>
                        {canManageMember && (
                          <button type="button" onClick={() => setModeratingMember(member)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]" aria-label={`Moderate ${profile.username || 'member'}`}>
                            <MoreHorizontal size={18} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {serverMembers.length === 0 && <p className="py-2 text-sm text-gray-500">No members found.</p>}
                </div>
              </AccordionSection>

              <AccordionSection id="media" label="Media, files and links" open={openInfoSections.has('media')} onToggle={toggleInfoSection}>
                <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--bg-element)] p-1">
                  {[
                    ['images', 'Media', attachmentGroups.images.length],
                    ['documents', 'Files', attachmentGroups.documents.length],
                    ['links', 'Links', attachmentGroups.links.length]
                  ].map(([id, label, count]) => (
                    <button key={id} type="button" onClick={() => setMediaTab(id)} className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors ${mediaTab === id ? 'bg-[var(--bg-surface)] text-[var(--text-main)]' : 'text-gray-500'}`}>
                      {label} <span className="ml-0.5 opacity-70">{count}</span>
                    </button>
                  ))}
                </div>
                {mediaTab === 'images' && (
                  <div className="grid grid-cols-3 gap-2">
                    {attachmentGroups.images.map(({ attachment }, index) => (
                      <button key={attachment.id || index} type="button" onClick={() => setSelectedImage?.(safeMediaUrl(attachment.file_url))} className="aspect-square overflow-hidden rounded-xl bg-[var(--bg-element)]">
                        <img src={safeMediaUrl(attachment.file_url)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {mediaTab === 'documents' && (
                  <div className="space-y-2">
                    {attachmentGroups.documents.map(({ attachment }, index) => (
                      <a key={attachment.id || index} href={safeDocumentUrl(attachment.file_url)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-[var(--bg-element)] p-3 text-sm text-[var(--text-main)]">
                        <FileText size={17} className="shrink-0 text-gray-500" />
                        <span className="truncate">{attachment.file_name || 'File'}</span>
                      </a>
                    ))}
                  </div>
                )}
                {mediaTab === 'links' && (
                  <div className="space-y-2">
                    {attachmentGroups.links.map(({ url }, index) => (
                      <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-[var(--bg-element)] p-3 text-sm text-[var(--theme-base)]">
                        <LinkIcon size={17} className="shrink-0" />
                        <span className="truncate">{url}</span>
                      </a>
                    ))}
                  </div>
                )}
                {activeAttachments.length === 0 && <p className="py-2 text-sm text-gray-500">Nothing shared yet.</p>}
              </AccordionSection>

              <AccordionSection id="privacy" label="Privacy & support" open={openInfoSections.has('privacy')} onToggle={toggleInfoSection}>
                <p className="mb-3 text-xs leading-relaxed text-gray-500">Manage unwanted content and ask the MessApp moderation team for support.</p>
                {activeServer.owner_id !== currentUserId && (
                  <button type="button" onClick={() => onReportTarget?.({ targetType: 'server', id: activeServer.id, label: 'server' })} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-red-500/10 px-3 text-sm font-bold text-red-400">
                    <Flag size={17} /> Report server
                  </button>
                )}
              </AccordionSection>
            </div>

            {moderatingMember && (
              <div className="absolute inset-x-3 bottom-3 z-30 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Member controls</p>
                    <p className="truncate font-bold text-[var(--text-main)]">{moderatingMember.profiles?.username || 'Unknown user'}</p>
                  </div>
                  <button type="button" onClick={closeModeration} disabled={Boolean(moderationBusy)} className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]" aria-label="Close member controls"><X size={18} /></button>
                </div>

                {activeServerRole === 'owner' && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Role</p>
                    <div className="grid grid-cols-3 gap-2">
                      {SERVER_ROLES.map(role => (
                        <button key={role} type="button" onClick={() => runMemberAction('role', role)} disabled={Boolean(moderationBusy) || moderatingMember.role === role} className={`rounded-xl px-2 py-2 text-xs font-bold capitalize transition-colors disabled:opacity-40 ${moderatingMember.role === role ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'bg-[var(--bg-element)] text-gray-400 hover:text-[var(--text-main)]'}`}>
                          {moderationBusy === 'role' ? <Loader2 size={14} className="mx-auto animate-spin" /> : role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="mt-4 block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-gray-500">Reason (optional)</span>
                  <textarea value={moderationReason} onChange={event => setModerationReason(event.target.value.slice(0, 500))} rows={2} placeholder="Visible in the moderation log" className="w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--theme-base)]" />
                </label>

                {moderationError && <p role="alert" className="mt-2 text-xs text-red-400">{moderationError}</p>}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => runMemberAction('kick')} disabled={Boolean(moderationBusy)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--bg-element)] px-3 text-sm font-bold text-[var(--text-main)] disabled:opacity-50">
                    {moderationBusy === 'kick' ? <Loader2 size={16} className="animate-spin" /> : <UserMinus size={16} />} Remove
                  </button>
                  {canBanMember(activeServerRole, moderatingMember.role || 'member') && (
                    <button type="button" onClick={() => runMemberAction('ban')} disabled={Boolean(moderationBusy)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 text-sm font-bold text-red-400 disabled:opacity-50">
                      {moderationBusy === 'ban' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Ban
                    </button>
                  )}
                  {!canBanMember(activeServerRole, moderatingMember.role || 'member') && (
                    <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--surface-section)] px-3 text-xs font-bold text-gray-500">
                      <ShieldCheck size={15} /> Limited moderator
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {rightTab === 'info' && activeDm && (
          <div className="flex flex-col h-full overflow-hidden relative">
            <button onClick={closeRightSidebar} className="absolute top-4 right-4 text-gray-500 hover:text-[var(--text-main)] p-2 rounded-xl hover:bg-[var(--bg-element)] transition-colors cursor-pointer z-20 focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
              <X size={20} aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center pt-0 pb-6 text-center border-b border-[var(--border-subtle)] shrink-0 relative">
              <div className="h-28 w-full bg-cover bg-center transition-all duration-300 absolute top-0 left-0 z-0 border-b border-[var(--border-subtle)]" style={getBannerStyle(activeDm.profiles)}>
              </div>
              
              <div className="relative mt-16 mb-3 z-10">
                <StatusAvatar url={activeDm.profiles.avatar_url} username={activeDm.profiles.username} status={getPresenceStatus?.(activeDm.profiles.id) || (onlineUsersSet.has(activeDm.profiles.id) ? 'online' : 'offline')} className="w-24 h-24 bg-[var(--bg-surface)] rounded-full" />
              </div>
              
              <div className="relative z-10 px-6 w-full flex flex-col items-center">
                <div className="flex items-center justify-center gap-2 mb-0.5">
                  <h2 className="text-xl font-bold text-[var(--text-main)]">{activeDm.profiles.username}</h2>
                  {activeDm.profiles.pronouns && <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">{activeDm.profiles.pronouns}</span>}
                </div>
                <p className="text-xs text-[var(--theme-base)] font-mono">{activeDm.profiles.unique_tag}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">{getPresenceLabel?.(activeDm.profiles.id) || 'Offline'}</p>
                
                {activeDm.profiles.bio && (
                  <div className="relative mt-5 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] px-5 py-3.5 text-left shadow-inner">
                    <p className="relative z-10 text-[13px] italic text-gray-300 leading-relaxed whitespace-pre-wrap">{activeDm.profiles.bio}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-5 pt-3 custom-scrollbar">
              <AccordionSection id="dm-customization" label="Customization" open={openInfoSections.has('dm-customization')} onToggle={toggleInfoSection}>
                <div className="space-y-5">
                  <div>
                  <span className="text-xs font-bold text-gray-400 block mb-3">Conversation Theme</span>
                  <ConversationThemePicker
                    themes={CONVERSATION_THEMES}
                    value={currentConversationThemeId}
                    onChange={handleConversationThemeChange}
                  />
                </div>
                  <div>
                    <span className="text-xs font-bold text-gray-400 block mb-1">Chat Wallpaper</span>
                    <span className="mb-3 block text-[10px] leading-relaxed text-gray-500">Mix any wallpaper with the conversation theme above.</span>
                    <div className="grid grid-cols-2 gap-2">
                      {WALLPAPERS.map(w => (
                        <button key={`wall-${w.id}`} onClick={() => handleWallpaperChange(w.id)} aria-pressed={currentWallpaper === w.id} className={`group rounded-2xl border p-1.5 text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${currentWallpaper === w.id ? 'bg-[var(--theme-20)] text-[var(--theme-base)] border-[var(--theme-50)] shadow-lg shadow-black/10' : 'bg-[var(--surface-section)] text-gray-500 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border-transparent hover:border-[var(--border-subtle)]'}`}>
                          <span
                            className="relative block h-16 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--chat-bg-base)] shadow-inner"
                            style={{
                              backgroundImage: w.css,
                              backgroundSize: w.size || 'cover',
                              backgroundRepeat: w.repeat || 'no-repeat',
                              backgroundPosition: w.position || 'center'
                            }}
                            aria-hidden="true"
                          >
                            <span className="absolute bottom-2 left-2 h-2.5 w-10 rounded-full border border-[var(--chat-border)] bg-[var(--chat-bg-element)] shadow-sm" />
                            <span className="absolute right-2 top-2 h-3 w-12 rounded-full border border-[var(--chat-outgoing-border)] bg-[var(--chat-outgoing-bg)] shadow-sm" />
                          </span>
                          <span className="mt-2 block truncate px-1 text-[11px] font-bold">{w.name}</span>
                          <span className="mb-1 block truncate px-1 text-[9px] text-gray-500">{w.description}</span>
                        </button>
                      ))}
                      <label
                        tabIndex={customWallpaperBusy ? -1 : 0}
                        role="button"
                        aria-label="Upload a custom chat wallpaper"
                        aria-busy={customWallpaperBusy}
                        onKeyDown={event => {
                          if (!customWallpaperBusy && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault()
                            event.currentTarget.querySelector('input')?.click()
                          }
                        }}
                        className={`rounded-2xl border p-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${customWallpaperSelected ? 'border-[var(--theme-50)] bg-[var(--theme-20)] text-[var(--theme-base)] shadow-lg shadow-black/10' : 'cursor-pointer border-transparent bg-[var(--surface-section)] text-gray-500 hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'} ${customWallpaperBusy ? 'pointer-events-none opacity-60' : ''}`}
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={customWallpaperBusy}
                          onChange={event => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) handleCustomWallpaperUpload(file)
                          }}
                        />
                        <span className="flex h-16 items-center justify-center rounded-xl border border-dashed border-[var(--theme-50)] bg-gradient-to-br from-[var(--theme-20)] via-[var(--chat-bg-base)] to-[var(--chat-bg-element)] shadow-inner" aria-hidden="true">
                          {customWallpaperBusy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                        </span>
                        <span className="mt-2 block truncate px-1 text-[11px] font-bold">Your photo</span>
                        <span className="mb-1 block truncate px-1 text-[9px] text-gray-500">JPG, PNG, or WebP</span>
                      </label>
                    </div>
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection id="dm-pinned" label={`Pinned messages (${pinnedMessages.length})`} open={openInfoSections.has('dm-pinned')} onToggle={toggleInfoSection}>
                <div className="space-y-2">
                  {pinnedMessages.length === 0 ? (
                    <div className="text-xs text-gray-500 px-1 py-2">No pinned messages yet.</div>
                  ) : pinnedMessages.map(message => (
                    <button key={`pinned-${message.id}`} onClick={() => { scrollToMessage(message); closeRightSidebar(); }} className="w-full text-left p-3 rounded-xl bg-[var(--surface-section)] hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--theme-50)] transition-all duration-300 ease-out transform group">
                      <div className="flex items-start gap-2">
                        <Pin size={14} className="text-[var(--theme-base)] shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-[var(--text-main)] truncate">{message.profiles?.username || 'User'}</span>
                            <span className="text-[10px] text-gray-500 shrink-0">{new Date(message.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-2 break-words">{formatMessagePreview(message)}</p>
                        </div>
                        <span onClick={(e) => { e.stopPropagation(); togglePinnedMessage?.(message); }} className="text-[10px] font-bold text-gray-500 group-hover:text-[var(--theme-base)] px-1 py-0.5 rounded cursor-pointer">Unpin</span>
                      </div>
                    </button>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection id="dm-media" label="Media & files" open={openInfoSections.has('dm-media')} onToggle={toggleInfoSection}>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg-element)] p-1">
                  <button onClick={() => setMediaTab('images')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-300 ease-out transform cursor-pointer ${mediaTab === 'images' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-500 hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'}`}><ImagePlus size={14} /> Images</button>
                  <button onClick={() => setMediaTab('documents')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-300 ease-out transform cursor-pointer ${mediaTab === 'documents' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-500 hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'}`}><FileText size={14} /> Documents</button>
                </div>
                <div className="pt-3">
                  {activeAttachments.length === 0 ? (
                    <div className="text-xs text-gray-500 px-1 py-4">No {mediaTab === 'images' ? 'images' : 'documents'} in this conversation.</div>
                  ) : mediaTab === 'images' ? (
                    <div className="grid grid-cols-3 gap-2">
                      {activeAttachments.map(({ message, attachment }) => (
                        <div key={`media-${attachment.id || attachment.file_url}`} className="relative aspect-square">
                          <button
                            type="button"
                            onClick={() => {
                              if (attachment.is_spoiler && !revealedSpoilerAttachments.has(attachment.id)) {
                                setRevealedSpoilerAttachments(previous => new Set(previous).add(attachment.id))
                                return
                              }
                              setSelectedImage?.({ url: safeMediaUrl(attachment.file_url), user: message.profiles?.username, time: new Date(message.created_at).toLocaleString() })
                            }}
                            className="relative h-full w-full overflow-hidden rounded-lg border border-current bg-[var(--surface-section)] text-[var(--theme-base)] opacity-90 transition-all duration-300 ease-out hover:scale-[1.03] cursor-pointer"
                            aria-label={attachment.is_spoiler && !revealedSpoilerAttachments.has(attachment.id) ? 'Reveal spoiler image' : `Open ${attachment.file_name || 'image'}`}
                          >
                            <img src={safeMediaUrl(attachment.file_url)} alt={attachment.file_name || 'Image'} className={`h-full w-full object-cover ${attachment.is_spoiler && !revealedSpoilerAttachments.has(attachment.id) ? 'scale-110 blur-xl' : ''}`} loading="lazy" />
                            {attachment.is_spoiler && !revealedSpoilerAttachments.has(attachment.id) && (
                              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-[9px] font-black uppercase tracking-widest text-white">
                                <EyeOff size={16} aria-hidden="true" />
                                Spoiler
                              </span>
                            )}
                          </button>
                          {attachment.is_spoiler && revealedSpoilerAttachments.has(attachment.id) && (
                            <button
                              type="button"
                              className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-white"
                              onClick={(event) => {
                                event.stopPropagation()
                                setRevealedSpoilerAttachments(previous => {
                                  const next = new Set(previous)
                                  next.delete(attachment.id)
                                  return next
                                })
                              }}
                              aria-label="Hide spoiler image"
                            >
                              <Eye size={11} aria-hidden="true" />
                              Hide
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeAttachments.map(({ attachment }) => (
                        <a key={`doc-${attachment.id || attachment.file_url}`} href={safeDocumentUrl(attachment.file_url)} target="_blank" rel="noopener noreferrer" download={attachment.file_name || true} className="flex items-center gap-3 p-3 rounded-xl border border-current text-[var(--theme-base)] opacity-90 bg-[var(--surface-section)] hover:bg-[var(--bg-surface)] transition-all duration-300 ease-out transform">
                          <FileText size={16} className="shrink-0" />
                          <span className="text-xs text-gray-300 truncate min-w-0">{attachment.file_name || 'Document'}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionSection>

              <AccordionSection id="dm-privacy" label="Privacy & support" open={openInfoSections.has('dm-privacy')} onToggle={toggleInfoSection}>
                <button onClick={() => setConfirmAction({ type: restrictedUsersSet.has(activeDm.profiles.id) ? 'unrestrict' : 'restrict', profile: activeDm.profiles })} className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group text-left">
                  <EyeOff size={16} className="text-gray-400 group-hover:text-[var(--text-main)]"/><span className="text-sm font-medium text-gray-300 group-hover:text-[var(--text-main)] flex-1">{restrictedUsersSet.has(activeDm.profiles.id) ? 'Unrestrict' : 'Restrict'}</span>
                </button>
                <button onClick={() => setConfirmAction({ type: blockedUsersSet.has(activeDm.profiles.id) ? 'unblock' : 'block', profile: activeDm.profiles })} className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                  <Ban size={16} className="text-red-400 group-hover:text-red-300"/><span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">{blockedUsersSet.has(activeDm.profiles.id) ? `Unblock ${activeDm.profiles.username}` : `Block ${activeDm.profiles.username}`}</span>
                </button>
                <button onClick={() => onReportTarget?.({ targetType: 'user', id: activeDm.profiles.id, label: activeDm.profiles.username || 'user' })} className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                  <Flag size={16} className="text-red-400 group-hover:text-red-300"/><span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">Report {activeDm.profiles.username}</span>
                </button>
                <button onClick={() => setConfirmAction({ type: 'delete_dm', profile: activeDm.profiles, dm_room_id: activeDm.dm_room_id })} className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                  <Trash2 size={16} className="text-red-400 group-hover:text-red-300"/><span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">Delete Conversation</span>
                </button>
              </AccordionSection>
            </div>
          </div>
        )}

        {rightTab === 'search' && (
          <div className="p-6 h-full flex flex-col overflow-hidden relative">
            <button onClick={closeRightSidebar} className="absolute top-4 right-4 text-gray-500 hover:text-[var(--text-main)] p-2 rounded-xl hover:bg-[var(--bg-element)] transition-colors cursor-pointer z-10 focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
              <X size={20} aria-hidden="true" />
            </button>

            <div className="premium-input ghost-border rounded-xl flex items-center px-4 py-3 mt-6 md:mt-8 mb-6 transition-all shrink-0">
              <Search size={18} className="text-gray-500 mr-2 shrink-0" aria-hidden="true" />
              <input type="text" placeholder="Search in chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-[var(--text-main)] text-sm w-full placeholder-gray-600 font-medium min-w-0" autoFocus />
            </div>
            
            {searchQuery && searchResults.length === 0 && <div className="text-center text-gray-500 text-sm mt-8">No messages match your query.</div>}
            
            {searchQuery && searchResults.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 shrink-0">{searchResults.length} Matches Found</div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 space-y-2 pb-4">
                  {searchResults.map((m, i) => (
                    <button 
                      key={m.id ? `search-res-${m.id}` : `search-fallback-${i}`}
                      onClick={() => { scrollToMessage(m); closeRightSidebar(); }}
                      className="w-full text-left p-3 bg-[var(--surface-section)] rounded-xl cursor-pointer hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--theme-50)] transition-all duration-300 ease-out transform group focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none"
                    >
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm font-bold text-[var(--text-main)] group-hover:text-[var(--theme-base)] transition-colors truncate pr-2">{m.profiles?.username}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-gray-300 line-clamp-3 break-words">{m.is_spoiler ? 'Spoiler' : m.content}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
