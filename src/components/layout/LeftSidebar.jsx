import React, { useState } from 'react'
import { Home, Plus, Compass, Search, Edit3, Copy, LogOut, Settings, MoreVertical, MessageSquare, Trash2, Ban, EyeOff, HelpCircle } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { supabase } from '../../supabaseClient'
import toast from 'react-hot-toast'
import Help from '../Help'

export default function LeftSidebar(props) {
  const [showHelp, setShowHelp] = useState(false)
  return (
    <>
      {props.mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => props.setMobileMenuOpen(false)} />
      )}

      {/* Profile Popout Click-Outside Interceptor */}
      {props.showProfilePopout && (
        <div className="fixed inset-0 z-[45]" onClick={() => props.setShowProfilePopout(false)}></div>
      )}

      <div className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 md:relative md:translate-x-0 ${props.mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="flex flex-col h-full w-20 bg-[var(--bg-base)] border-r border-[var(--border-subtle)] py-4 items-center shrink-0 relative z-20">
          <div className="mb-6 group">
            <button onClick={props.handleHomeClick} className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${props.view === 'home' || props.view === 'notifications' ? 'text-[var(--text-main)] shadow-lg' : 'bg-[var(--bg-surface)] text-indigo-500 hover:bg-white/10'}`} style={props.view === 'home' || props.view === 'notifications' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}}>
              <Home size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="w-8 h-[2px] bg-[var(--border-subtle)] my-2 rounded-full shrink-0"></div>
          <div className="flex flex-col gap-4 items-center flex-1 overflow-y-auto custom-scrollbar w-full pt-2 pb-4 opacity-50 cursor-not-allowed">
            {props.servers.map((s, i) => (
              <button key={`server-${s.id || i}`} className="sidebar-icon group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none relative">
                <span className="font-headline font-bold text-lg">{s.name[0].toUpperCase()}</span>
              </button>
            ))}
          </div>
          
          <div className="mt-auto flex flex-col gap-4 items-center pt-4 border-t border-[var(--border-subtle)] w-full shrink-0">
            <button onClick={() => props.setServerAction(props.serverAction === 'create' ? null : 'create')} className={`sidebar-icon group cursor-pointer transition-all ${props.serverAction === 'create' ? 'bg-indigo-500 text-[var(--text-main)] rounded-xl' : 'hover:bg-indigo-500 hover:text-[var(--text-main)] hover:rounded-xl text-gray-400'}`} title="Create Server">
              <Plus size={24} aria-hidden="true" />
            </button>
            <button onClick={() => props.setServerAction(props.serverAction === 'join' ? null : 'join')} className={`sidebar-icon group cursor-pointer transition-all ${props.serverAction === 'join' ? 'bg-green-500 text-[var(--text-main)] rounded-xl' : 'hover:bg-green-500 hover:text-[var(--text-main)] hover:rounded-xl text-gray-400'}`} title="Join Server">
              <Compass size={24} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <aside className="w-72 h-full bg-[var(--bg-surface)] flex flex-col border-r border-[var(--border-subtle)] shrink-0 z-10 shadow-xl relative" style={props.scopedChatStyle}>
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
                      const dmKey = dm.dm_room_id || `friend-${dm.profiles?.id || i}`;
                      const isActive = props.activeDm?.dm_room_id === dm.dm_room_id && props.view === 'home';
                      const dmColor = dm.dm_rooms?.theme_color || '#6366f1';
                      const isOnline = props.onlineUsersSet.has(dm.profiles.id);
                      const isMenuOpen = props.dmActionMenuId === `sidebar-${dmKey}`;

                      return (
                        <div key={`dm-list-${dmKey}`} className="relative group flex items-center mb-1">
                          <button onClick={() => { props.setView('home'); props.selectDm(dm); }} className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[var(--bg-element)] border-[var(--border-subtle)] shadow-inner' : 'hover:bg-[var(--bg-base)] text-gray-400 hover:text-[var(--text-main)] border-transparent'}`}>
                            <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={isOnline} className="w-8 h-8" />
                            <div className="flex-1 min-w-0 text-left pr-6">
                              <p className="text-sm font-medium truncate transition-colors" style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                            </div>
                          </button>
                          
                          <button 
                            onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(isMenuOpen ? null : `sidebar-${dmKey}`); }}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors focus-visible:opacity-100 opacity-100`}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); }}></div>
                              <div className="absolute right-8 top-10 w-48 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-[70] py-1 animate-fade-in origin-top-right">
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setView('home'); props.selectDm(dm); }} className="w-full text-left px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors">Open Chat</button>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.restrictedUsersSet.has(dm.profiles.id) ? 'unrestrict' : 'restrict', profile: dm.profiles }); }} className="w-full text-left px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-colors">{props.restrictedUsersSet.has(dm.profiles.id) ? 'Unrestrict' : 'Mute (Restrict)'}</button>
                                <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.blockedUsersSet.has(dm.profiles.id) ? 'unblock' : 'block', profile: dm.profiles }); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">{props.blockedUsersSet.has(dm.profiles.id) ? 'Unblock' : 'Block User'}</button>
                                <div className="h-[1px] bg-[var(--border-subtle)] my-1 mx-2"></div>
                                {dm.dm_room_id && (
                                  <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: 'delete_dm', profile: dm.profiles, dm_room_id: dm.dm_room_id }); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-between group"><span>Delete Chat</span><Trash2 size={14} className="opacity-50 group-hover:opacity-100"/></button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 opacity-50 cursor-not-allowed">
                <div><div className="flex items-center justify-between px-2 mb-3"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Channels (WIP)</span></div><div className="text-xs text-gray-500 px-2">Servers are currently in development.</div></div>
              </div>
            )}
          </div>

          {props.showProfilePopout && (
            <div ref={props.popoutRef} className="absolute bottom-16 left-3 right-3 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden z-50 animate-fade-in flex flex-col">
              <div className="h-20 bg-[var(--bg-element)] shrink-0 relative" style={{ background: props.myBanner || 'linear-gradient(to right, #4f46e5, #9333ea)' }}>
              </div>
              <div className="px-4 pb-4">
                <div className="flex justify-between items-start">
                  <div className="relative -mt-10 mb-2">
                     <StatusAvatar url={props.myAvatar} username={props.myUsername} isOnline={true} className="w-[72px] h-[72px] bg-[var(--bg-surface)] rounded-full" />
                  </div>
                </div>
                
                <div className="bg-[var(--bg-element)] p-3 rounded-xl mb-3 shadow-inner">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-[var(--text-main)] text-lg leading-tight truncate">{props.myUsername}</h3>
                    {props.myPronouns && <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">{props.myPronouns}</span>}
                  </div>
                  <p className="text-xs text-gray-400 font-mono">{props.myTag}</p>
                  {props.myBio && <div className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-300 line-clamp-3">{props.myBio}</div>}
                </div>

                <div className="space-y-1">
                  <button onClick={() => { props.setShowProfilePopout(false); props.setSettingsModalConfig({ isOpen: true, tab: 'account', showMenu: false }); props.setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--border-subtle)] transition-colors cursor-pointer text-gray-300 hover:text-[var(--text-main)]">
                    <Edit3 size={16} /> <span className="text-sm font-medium">Edit Profile</span>
                  </button>
                  <div className="h-[1px] bg-[var(--border-subtle)] my-2"></div>
                  <button onClick={() => { navigator.clipboard.writeText(props.myTag); toast.success('ID Copied!'); props.setShowProfilePopout(false); }} className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--border-subtle)] transition-colors cursor-pointer text-gray-300 hover:text-[var(--text-main)]">
                    <div className="flex items-center gap-3"><Copy size={16} /> <span className="text-sm font-medium">Copy User ID</span></div>
                  </button>
                  <button onClick={() => { supabase.auth.signOut(); props.setShowProfilePopout(false); }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer text-red-400/80">
                    <LogOut size={16} /> <span className="text-sm font-medium">Log Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0 relative z-50">
            <button onClick={() => props.setShowProfilePopout(!props.showProfilePopout)} className="flex items-center gap-3 min-w-0 p-1.5 hover:bg-[var(--bg-surface)] rounded-xl transition-colors text-left group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] flex-1 pr-2">
              <StatusAvatar url={props.myAvatar} username={props.myUsername} isOnline={true} className="w-9 h-9" />
              <div className="flex flex-col truncate">
                <span className="text-[13px] font-bold text-[var(--text-main)] truncate group-hover:text-[var(--color-primary)] transition-colors">{props.myUsername}</span>
                <span className="text-[10px] text-gray-500 truncate">Online</span>
              </div>
            </button>
            
            <button onClick={() => { props.setSettingsModalConfig({ isOpen: true, tab: 'account', showMenu: true }); props.setMobileMenuOpen(false); }} className="p-2 text-gray-400 hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-surface)] transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] cursor-pointer" aria-label="Application Settings" title="App Settings">
              <Settings size={18} aria-hidden="true" />
            </button>
            
            <button onClick={() => setShowHelp(true)} className="p-2 text-gray-400 hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-surface)] transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] cursor-pointer" aria-label="Help and Support" title="Help & Support">
              <HelpCircle size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>
      
      {showHelp && <Help onClose={() => setShowHelp(false)} />}
    </>
  )
}
