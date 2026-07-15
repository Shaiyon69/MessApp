/**
 * Renders members, search, pins, and conversation media from parent-owned state.
 * Attachment URLs are treated as ephemeral capabilities and opened only after
 * media safety validation.
 */
import React, { useMemo, useState } from 'react'
import { X, Search, ImagePlus, EyeOff, Ban, Trash2, FileText, Pin, Users } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { safeMediaUrl } from '../../lib/security'

const safeDocumentUrl = (value) => {
  const mediaUrl = safeMediaUrl(value, { allowDataImages: false })
  if (mediaUrl) return mediaUrl
  if (typeof value === 'string' && /^data:application\/octet-stream;base64,[a-z0-9+/=\s]+$/i.test(value.trim())) return value.trim()
  return null
}

export default function RightSidebar({
  activeDm,
  activeServer,
  serverMembers = [],
  closeRightSidebar,
  rightTab,
  onlineUsersSet,
  getPresenceStatus,
  getPresenceLabel,
  handleThemeChange,
  currentThemeHex,
  handleWallpaperChange,
  currentWallpaper,
  setConfirmAction,
  restrictedUsersSet,
  blockedUsersSet,
  searchQuery,
  setSearchQuery,
  searchResults,
  scrollToMessage,
  THEME_COLORS,
  WALLPAPERS,
  scopedChatStyle,
  messages = [],
  pinnedMessages = [],
  togglePinnedMessage,
  setSelectedImage
}) {
  const [mediaTab, setMediaTab] = useState('images')

  const attachmentGroups = useMemo(() => {
    if (rightTab !== 'info' || !activeDm) return { images: [], documents: [] }
    const items = messages.flatMap(message => (message.message_attachments || []).map(attachment => ({ message, attachment })))
    return {
      images: items.filter(item => item.attachment.file_type?.startsWith('image/') && safeMediaUrl(item.attachment.file_url)),
      documents: items.filter(item => !item.attachment.file_type?.startsWith('image/') && safeDocumentUrl(item.attachment.file_url))
    }
  }, [activeDm, messages, rightTab])

  const activeAttachments = mediaTab === 'images' ? attachmentGroups.images : attachmentGroups.documents
  const formatMessagePreview = (message) => {
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
      
      <aside className="fixed right-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-50 w-80 max-w-[85vw] bg-[var(--bg-surface)]/95 border-l border-[var(--border-subtle)] flex flex-col shrink-0 shadow-[-20px_0_56px_rgba(0,0,0,0.42)] backdrop-blur-xl animate-slide-right transition-all duration-300 ease-out transform md:relative md:inset-y-auto md:z-20 md:h-full md:w-96 md:max-w-none md:shadow-none md:backdrop-blur-none" style={scopedChatStyle}>
        
        {rightTab === 'info' && activeServer && !activeDm && (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Server Info</p>
                <h2 className="truncate text-xl font-bold text-[var(--text-main)]">{activeServer.name}</h2>
              </div>
              <button onClick={closeRightSidebar} className="rounded-xl p-2 text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                <Users size={14} />
                {serverMembers.length} Member{serverMembers.length === 1 ? '' : 's'}
              </div>
              <div className="space-y-2">
                {serverMembers.map(member => {
                  const profile = member.profiles || {}
                  const status = getPresenceStatus?.(profile.id) || (onlineUsersSet.has(profile.id) ? 'online' : 'offline')
                  return (
                    <div key={member.id || member.profile_id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-section)] p-3">
                      <div className="flex items-center gap-3">
                        <StatusAvatar url={profile.avatar_url} username={profile.username} status={status} className="h-10 w-10" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-[var(--text-main)]">{profile.username || 'Unknown user'}</p>
                            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">{member.role || 'member'}</span>
                          </div>
                          <p className="truncate text-[11px] text-gray-500">{profile.unique_tag || 'No tag'} • {getPresenceLabel?.(profile.id) || 'Offline'}</p>
                        </div>
                      </div>
                      <p className="mt-3 rounded-lg bg-[var(--bg-element)] px-3 py-2 text-xs italic leading-relaxed text-gray-400">
                        {profile.bio || 'No profile thought/status yet.'}
                      </p>
                    </div>
                  )
                })}
                {serverMembers.length === 0 && <p className="text-sm text-gray-500">No server users found.</p>}
              </div>
            </div>
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

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
              <div className="premium-section rounded-xl overflow-hidden p-4 space-y-5">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Customization</div>
                <div>
                  <span className="text-xs font-bold text-gray-400 block mb-3">Message Color</span>
                  <div className="flex flex-wrap gap-2">
                    {THEME_COLORS.map(c => (
                      <button key={`theme-${c.name}`} onClick={() => handleThemeChange(c.value)} title={c.name} className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${currentThemeHex === c.value ? 'border-[var(--text-main)] scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`} style={{ backgroundColor: c.value }} />
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-400 block mb-3">Chat Wallpaper</span>
                  <div className="grid grid-cols-2 gap-2">
                    {WALLPAPERS.map(w => (
                      <button key={`wall-${w.id}`} onClick={() => handleWallpaperChange(w.id)} className={`rounded-lg p-1.5 text-left transition-all cursor-pointer ${currentWallpaper === w.id ? 'bg-[var(--theme-20)] text-[var(--theme-base)] border border-[var(--theme-50)] shadow-inner' : 'bg-[var(--surface-section)] text-gray-500 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>
                        <span
                          className="block h-10 rounded-md border border-[var(--border-subtle)] bg-[var(--chat-bg-base)]"
                          style={{
                            backgroundImage: w.css,
                            backgroundSize: w.size || 'cover',
                            backgroundRepeat: w.repeat || 'no-repeat',
                            backgroundPosition: w.position || 'center'
                          }}
                          aria-hidden="true"
                        ></span>
                        <span className="mt-1.5 block truncate px-0.5 text-[10px] font-bold uppercase tracking-wide">{w.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="premium-section rounded-xl overflow-hidden">
                <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[var(--border-subtle)]/50">Pinned Messages</div>
                <div className="p-3 space-y-2">
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
              </div>

              <div className="premium-section rounded-xl overflow-hidden">
                <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[var(--border-subtle)]/50">Media & Files</div>
                <div className="grid grid-cols-2 gap-1 p-2">
                  <button onClick={() => setMediaTab('images')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-300 ease-out transform cursor-pointer ${mediaTab === 'images' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-500 hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'}`}><ImagePlus size={14} /> Images</button>
                  <button onClick={() => setMediaTab('documents')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-300 ease-out transform cursor-pointer ${mediaTab === 'documents' ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-500 hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'}`}><FileText size={14} /> Documents</button>
                </div>
                <div className="p-3 pt-1">
                  {activeAttachments.length === 0 ? (
                    <div className="text-xs text-gray-500 px-1 py-4">No {mediaTab === 'images' ? 'images' : 'documents'} in this conversation.</div>
                  ) : mediaTab === 'images' ? (
                    <div className="grid grid-cols-3 gap-2">
                      {activeAttachments.map(({ message, attachment }) => (
                        <button key={`media-${attachment.id || attachment.file_url}`} onClick={() => setSelectedImage?.({ url: safeMediaUrl(attachment.file_url), user: message.profiles?.username, time: new Date(message.created_at).toLocaleString() })} className="aspect-square rounded-lg overflow-hidden border border-current text-[var(--theme-base)] opacity-90 bg-[var(--surface-section)] transition-all duration-300 ease-out transform hover:scale-[1.03] cursor-pointer">
                          <img src={safeMediaUrl(attachment.file_url)} alt={attachment.file_name || 'Image'} className="w-full h-full object-cover" loading="lazy" />
                        </button>
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
              </div>

              <div className="premium-section rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[var(--border-subtle)]/50">Privacy & Support</div>
                <button onClick={() => setConfirmAction({ type: restrictedUsersSet.has(activeDm.profiles.id) ? 'unrestrict' : 'restrict', profile: activeDm.profiles })} className="w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group text-left">
                  <EyeOff size={16} className="text-gray-400 group-hover:text-[var(--text-main)]"/><span className="text-sm font-medium text-gray-300 group-hover:text-[var(--text-main)] flex-1">{restrictedUsersSet.has(activeDm.profiles.id) ? 'Unrestrict' : 'Restrict'}</span>
                </button><div className="h-[1px] bg-[var(--border-subtle)]/50 mx-4"></div>
                <button onClick={() => setConfirmAction({ type: blockedUsersSet.has(activeDm.profiles.id) ? 'unblock' : 'block', profile: activeDm.profiles })} className="w-full flex items-center gap-3 p-4 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                  <Ban size={16} className="text-red-400 group-hover:text-red-300"/><span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">{blockedUsersSet.has(activeDm.profiles.id) ? `Unblock ${activeDm.profiles.username}` : `Block ${activeDm.profiles.username}`}</span>
                </button>
                <div className="h-[1px] bg-[var(--border-subtle)]/50 mx-4"></div>
                <button onClick={() => setConfirmAction({ type: 'delete_dm', profile: activeDm.profiles, dm_room_id: activeDm.dm_room_id })} className="w-full flex items-center gap-3 p-4 hover:bg-red-500/10 transition-colors cursor-pointer group text-left">
                  <Trash2 size={16} className="text-red-400 group-hover:text-red-300"/><span className="text-sm font-bold text-red-400 group-hover:text-red-300 flex-1">Delete Conversation</span>
                </button>
              </div>
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
                      <p className="text-xs text-gray-300 line-clamp-3 break-words">{m.content}</p>
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
