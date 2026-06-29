import React, { useRef, useState } from 'react'
import { Home, Search, Copy, Settings, MoreVertical, Trash2 } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import toast from 'react-hot-toast'
import { safeMediaUrl } from '../../lib/security'

export default function LeftSidebar(props) {
  const [isEditingStatus, setIsEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState(props.myBio || '')
  const cancelStatusCommitRef = useRef(false)
  const statusOptions = [
    { id: 'online', label: 'Online', color: '#23a559' },
    { id: 'idle', label: 'Idle', color: '#f0b232' },
    { id: 'dnd', label: 'Do Not Disturb', color: '#f23f43' }
  ]
  const currentStatus = props.userStatus || 'online'
  const currentStatusLabel = statusOptions.find(option => option.id === currentStatus)?.label || 'Online'
  const openProfileSettings = () => {
    props.setShowProfilePopout(false)
    props.setSettingsModalConfig({ isOpen: true, tab: 'account', showMenu: false })
    props.setMobileMenuOpen(false)
  }

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
        <div className="premium-backdrop fixed inset-0 z-40 md:hidden" onClick={() => props.setMobileMenuOpen(false)} />
      )}

      {props.showProfilePopout && (
        <div className="fixed inset-0 z-[45]" onClick={() => props.setShowProfilePopout(false)}></div>
      )}

      <div className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 md:relative md:translate-x-0 ${props.mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="flex flex-col h-full w-20 bg-[var(--surface-strong)] border-r border-[var(--border-subtle)] py-4 items-center shrink-0 relative z-20 backdrop-blur-xl">
          <div className="flex-1"></div>
          <div className="w-8 h-[2px] bg-[var(--border-subtle)] mb-4 rounded-full shrink-0"></div>
          <div className="group">
            <button onClick={props.handleHomeClick} className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${props.view === 'home' || props.view === 'notifications' ? 'text-white shadow-lg' : 'bg-[var(--bg-surface)] text-indigo-500 hover:bg-[var(--bg-element)]'}`} style={props.view === 'home' || props.view === 'notifications' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}} aria-label="Home" title="Home">
              <Home size={22} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <aside className="app-left-panel w-80 h-full bg-[var(--bg-surface)]/95 flex flex-col border-r border-[var(--border-subtle)] shrink-0 z-10 relative backdrop-blur-xl" style={props.scopedChatStyle}>
          <header className="h-14 md:h-16 px-6 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)]/80 backdrop-blur-xl">
            <h2 className="font-headline font-bold text-[var(--text-main)] tracking-tight truncate">MESSAPP</h2>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8 px-4">
            {props.view === 'home' || props.view === 'notifications' ? (
              <div className="space-y-6">
                <button onClick={() => { props.setShowQuickSwitcher(true); props.setMobileMenuOpen(false); }} className="w-full bg-[var(--bg-element)] ghost-border text-[var(--text-main)] font-bold py-3.5 px-6 rounded-xl hover:bg-[var(--border-subtle)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                  <Search size={18} aria-hidden="true" /> Find or Start
                </button>
                
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 block px-2">Direct Messages</span>
                  <div className="space-y-1">
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
                            onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(isMenuOpen ? null : `sidebar-${dm.dm_room_id}`); }}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors focus-visible:opacity-100 opacity-100`}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); }}></div>
                              <div className="premium-menu absolute right-8 top-10 w-48 rounded-xl z-[70] py-1 animate-fade-in origin-top-right">
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setView('home'); props.selectDm(dm); }} className="w-full text-left px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors">Open Chat</button>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.restrictedUsersSet.has(dm.profiles.id) ? 'unrestrict' : 'restrict', profile: dm.profiles }); }} className="w-full text-left px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors">{props.restrictedUsersSet.has(dm.profiles.id) ? 'Unrestrict' : 'Mute (Restrict)'}</button>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.blockedUsersSet.has(dm.profiles.id) ? 'unblock' : 'block', profile: dm.profiles }); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">{props.blockedUsersSet.has(dm.profiles.id) ? 'Unblock' : 'Block User'}</button>
                                <div className="h-[1px] bg-[var(--border-subtle)] my-1 mx-2"></div>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: 'delete_dm', profile: dm.profiles, dm_room_id: dm.dm_room_id }); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-between group"><span>Delete Chat</span><Trash2 size={14} className="opacity-50 group-hover:opacity-100"/></button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
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
            <button onClick={() => props.setShowProfilePopout(!props.showProfilePopout)} className={`flex items-center gap-3 min-w-0 p-2 rounded-xl transition-all text-left group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] flex-1 pr-2 ${props.showProfilePopout ? 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl -translate-y-1 rounded-2xl' : 'hover:bg-[var(--bg-surface)] border border-transparent'}`}>
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
    </>
  )
}
