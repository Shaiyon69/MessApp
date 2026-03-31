import React from 'react'
import { X, Search, ImagePlus, EyeOff, Ban, Trash2, Palette, Shield, UserX, AlertTriangle, VolumeX } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'

export default function RightSidebar({
  activeDm,
  closeRightSidebar,
  rightTab,
  onlineUsersSet,
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
  scopedChatStyle
}) {
  if (!activeDm) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] animate-fade-in cursor-pointer" onClick={closeRightSidebar}></div>
      
      <aside className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] md:w-96 md:max-w-none bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] flex flex-col shrink-0 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] animate-slide-right" style={scopedChatStyle}>
        
        {rightTab === 'info' && (
          <div className="flex flex-col h-full overflow-hidden relative">
            <button onClick={closeRightSidebar} className="absolute top-4 right-4 text-gray-500 hover:text-[var(--text-main)] p-2 rounded-xl hover:bg-[var(--bg-element)] transition-colors cursor-pointer z-20 focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
              <X size={20} aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center pt-0 pb-6 text-center border-b border-[var(--border-subtle)] shrink-0 relative">
              <div className="h-28 w-full bg-[var(--bg-element)] absolute top-0 left-0 z-0 border-b border-[var(--border-subtle)]" style={{ background: activeDm.profiles.banner_url || 'linear-gradient(to right, #4f46e5, #9333ea)' }}>
              </div>
              
              <div className="relative mt-16 mb-3 z-10">
                <StatusAvatar url={activeDm.profiles.avatar_url} username={activeDm.profiles.username} isOnline={onlineUsersSet.has(activeDm.profiles.id)} className="w-24 h-24 bg-[var(--bg-surface)] rounded-full" />
              </div>
              
              <div className="relative z-10 px-6 w-full flex flex-col items-center">
                <div className="flex items-center justify-center gap-2 mb-0.5">
                  <h2 className="text-xl font-bold text-[var(--text-main)]">{activeDm.profiles.username}</h2>
                  {activeDm.profiles.pronouns && <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">{activeDm.profiles.pronouns}</span>}
                </div>
                <p className="text-xs text-[var(--theme-base)] font-mono">{activeDm.profiles.unique_tag}</p>
                
                {activeDm.profiles.bio && (
                  <div className="mt-4 bg-[var(--bg-element)] ghost-border p-3.5 rounded-xl w-full text-left shadow-inner">
                    <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{activeDm.profiles.bio}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
              <div className="bg-[var(--bg-element)] rounded-xl overflow-hidden ghost-border p-4 space-y-5">
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
                      <button key={`wall-${w.id}`} onClick={() => handleWallpaperChange(w.id)} className={`text-[10px] font-bold uppercase tracking-wide py-2 rounded-lg transition-all cursor-pointer ${currentWallpaper === w.id ? 'bg-[var(--theme-20)] text-[var(--theme-base)] border border-[var(--theme-50)] shadow-inner' : 'bg-black/20 text-gray-500 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>{w.name}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-element)] rounded-xl overflow-hidden ghost-border">
                <div className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[var(--border-subtle)]/50">Media & Files</div>
                <button className="w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group text-left"><ImagePlus size={16} className="text-gray-400 group-hover:text-[var(--theme-base)]"/><span className="text-sm font-medium text-gray-300 group-hover:text-[var(--text-main)] flex-1">Media</span></button><div className="h-[1px] bg-[var(--border-subtle)]/50 mx-4"></div>
                <button className="w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group text-left"><span className="material-symbols-outlined text-[16px] text-gray-400 group-hover:text-[var(--theme-base)]" aria-hidden="true">description</span><span className="text-sm font-medium text-gray-300 group-hover:text-[var(--text-main)] flex-1">Files</span></button>
              </div>

              <div className="bg-[var(--bg-element)] rounded-xl overflow-hidden ghost-border mb-6">
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

            <div className="bg-[var(--bg-base)] ghost-border rounded-xl flex items-center px-4 py-3 mt-6 md:mt-8 mb-6 focus-within:border-[var(--theme-base)] shadow-inner transition-colors shrink-0">
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
                      key={m.id ? `search-res-${m.id}` : `search-fallback-${i}-${crypto.randomUUID()}`}
                      onClick={() => { scrollToMessage(m); closeRightSidebar(); }}
                      className="w-full text-left p-3 bg-[var(--bg-element)] rounded-xl cursor-pointer hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--theme-50)] transition-all group focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none"
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
