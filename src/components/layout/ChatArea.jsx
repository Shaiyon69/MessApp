import React, { useState, useEffect, useRef } from 'react'
import { Loader2, Menu, Users, UserPlus, Hash, Phone, Video, Search, Info, ImagePlus, Paperclip, Send, X, Bell, MessageSquare, MoreVertical, Trash2, Check, SmilePlus } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { MemoizedMessage } from '../chat/MessageElements'
import AddFriendView from '../modals/AddFriendView'
import GifPickerPopout from '../modals/GifPickerPopout'
import EmojiPicker from 'emoji-picker-react' 
import toast from 'react-hot-toast'

export default function ChatArea(props) {
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const gifPickerRef = useRef(null);

  const toggleEmojiPicker = (e) => {
    e.stopPropagation();
    props.setShowGifPicker(false);
    setShowInputEmojiPicker(!showInputEmojiPicker);
  };

  const toggleGifPicker = (e) => {
    e.stopPropagation();
    setShowInputEmojiPicker(false);
    props.setShowGifPicker(!props.showGifPicker);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) setShowInputEmojiPicker(false);
      if (gifPickerRef.current && !gifPickerRef.current.contains(event.target)) props.setShowGifPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [props]);

  const handleEmojiSelect = (emojiData) => {
    const input = props.messageInputRef.current;
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.substring(0, start) + emojiData.emoji + input.value.substring(end);
      
      const newPos = start + emojiData.emoji.length;
      input.selectionStart = input.selectionEnd = newPos;
      input.focus();
    }
    setShowInputEmojiPicker(false);
  };

  return (
    <main 
      className="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-base)]" 
      style={props.scopedChatStyle}
      onPaste={props.handlePaste}
    >
      <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)] shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
          <button onClick={() => props.setMobileMenuOpen(true)} className="md:hidden text-gray-400 hover:text-[var(--text-main)] p-2 -ml-2 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer">
            <Menu size={32} />
          </button>
          {props.view === 'home' && !props.activeDm ? (
            <div className="flex items-center gap-3 md:gap-6 animate-fade-in w-full overflow-x-auto custom-scrollbar pb-1 -mb-1">
              <div className="flex items-center gap-2 text-[var(--text-main)] font-bold shrink-0">
                <Users size={24} className="text-gray-400 hidden sm:block" />
                <span className="hidden sm:inline text-base">Friends</span>
              </div>
              <div className="w-[1px] h-6 bg-[var(--border-subtle)] hidden sm:block shrink-0"></div>
              
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => props.setHomeTab('online')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer ${props.homeTab === 'online' ? 'bg-[var(--bg-element)] text-[var(--text-main)] ghost-border' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>Online</button>
                <button onClick={() => props.setHomeTab('all')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer ${props.homeTab === 'all' ? 'bg-[var(--bg-element)] text-[var(--text-main)] ghost-border' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>All</button>
                <button onClick={() => props.setHomeTab('pending')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer flex items-center gap-2 ${props.homeTab === 'pending' ? 'bg-[var(--bg-element)] text-[var(--text-main)] ghost-border' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>
                  Pending {props.friendRequests.length > 0 && <span className="bg-red-500 text-[var(--text-main)] text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-bold">{props.friendRequests.length}</span>}
                </button>
              </div>
              
              <button 
                onClick={() => { props.setHomeTab('add_friend'); props.selectDm(null); }} 
                className={`ml-auto px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer hover:brightness-110 shrink-0 ${props.homeTab === 'add_friend' ? 'text-[var(--text-main)] shadow-lg' : 'bg-[var(--bg-element)] text-indigo-400 hover:bg-[var(--bg-surface)]'}`} 
                style={props.homeTab === 'add_friend' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}}
              >
                <UserPlus size={20} /> <span className="hidden sm:inline">Add Friend</span>
              </button>
            </div>
          ) : props.view === 'home' && props.activeDm ? (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-dm-${props.activeDm.dm_room_id}`}>
              <span className="text-xl text-gray-500 font-light shrink-0">@</span><h2 className="font-headline font-bold text-[var(--text-main)] text-lg tracking-tight truncate">{props.activeDm.profiles.username}</h2>
            </div>
          ) : props.view === 'server' && props.activeChannel ? (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-chan-${props.activeChannel.id}`}>
              <Hash size={20} className="text-gray-500 shrink-0" aria-hidden="true" />
              <h2 className="font-headline font-bold text-[var(--text-main)] text-lg tracking-tight truncate">{props.activeChannel.name}</h2>
            </div>
          ) : (
            <h2 className="font-headline font-bold text-transparent bg-clip-text text-xl tracking-tight shrink-0 truncate animate-fade-in" style={{ backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' }} key="header-dash">MESSY APPY</h2>
          )}
        </div>
        
        <div className="flex items-center gap-1 md:gap-2 shrink-0 ml-2 md:ml-4">
          {props.isChatActive && (
            <>
              <button onClick={() => props.startCall(false)} className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]"><Phone size={20} aria-hidden="true" /></button>
              <button onClick={() => props.startCall(true)} className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]"><Video size={20} aria-hidden="true" /></button>
              <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1"></div>
              <button onClick={() => props.toggleRightSidebar('search')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${props.rightTab === 'search' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`}><Search size={20} aria-hidden="true" /></button>
              <button onClick={() => props.toggleRightSidebar('info')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${props.rightTab === 'info' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`}><Info size={20} aria-hidden="true" /></button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10 relative" key={props.view + (props.activeChannel?.id || props.activeDm?.dm_room_id || '')}>
          
          {props.isChatActive && props.currentWallpaper !== 'default' && (
            <div className="absolute inset-0 pointer-events-none z-0 opacity-20" style={{ backgroundImage: props.wallpaperCSS, backgroundSize: props.currentWallpaper === 'doodles' ? '400px' : 'cover', backgroundPosition: 'center' }}/>
          )}

          {props.view === 'home' && !props.activeDm ? (
            <div className="flex-1 flex overflow-hidden bg-[var(--bg-base)]">
              <div className="flex-1 flex flex-col overflow-hidden">
                {props.homeTab === 'add_friend' ? (
                  <AddFriendView session={props.session} />
                ) : (
                  <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
                    <div className="bg-[var(--bg-surface)] ghost-border rounded-xl flex items-center px-4 py-3 mb-6 shadow-inner focus-within:border-indigo-500 transition-colors">
                      <input id="dm-search-input" type="text" placeholder="Search for a conversation..." className="bg-transparent border-none outline-none text-[var(--text-main)] text-sm w-full placeholder-gray-500" />
                      <Search size={18} className="text-gray-500 ml-2" />
                    </div>
                    
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                      {props.homeTab === 'online' && `Online — ${props.onlineFriends.length}`}
                      {props.homeTab === 'all' && `All Friends — ${props.allFriends.length}`}
                      {props.homeTab === 'pending' && `Pending — ${props.friendRequests.length}`}
                    </div>

                    <div className="space-y-2">
                      {props.homeTab === 'pending' && props.friendRequests.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 opacity-50"><Bell size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">No pending friend requests.</p></div>
                      )}
                      {props.homeTab === 'pending' && props.friendRequests.map((req, i) => (
                        <div key={req.id ? `req-${req.id}` : `fallback-req-${i}`} className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface)] rounded-xl group border-t border-transparent hover:border-[var(--bg-surface)] transition-all">
                          <div className="flex items-center gap-4">
                            <StatusAvatar url={req.profiles?.avatar_url} username={req.profiles?.username} showStatus={false} className="w-10 h-10" />
                            <div><div className="font-bold text-[var(--text-main)] flex items-center gap-2">{req.profiles?.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{req.profiles?.unique_tag}</span></div><div className="text-xs text-gray-400">Incoming Friend Request</div></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => props.handleAcceptRequest(req)} className="p-2 sm:p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-green-500 hover:text-[var(--text-main)] transition-colors"><Check size={18} /></button>
                            <button onClick={() => props.handleDeclineRequest(req.id)} className="p-2 sm:p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-red-500 hover:text-[var(--text-main)] transition-colors"><X size={18} /></button>
                          </div>
                        </div>
                      ))}

                      {(props.homeTab === 'online' || props.homeTab === 'all') && (props.homeTab === 'all' ? props.allFriends : props.onlineFriends).length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 opacity-50"><Users size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">It's quiet in here.</p></div>
                      )}
                      {(props.homeTab === 'online' || props.homeTab === 'all') && (props.homeTab === 'all' ? props.allFriends : props.onlineFriends).map((dm, i) => {
                        const isMenuOpen = props.dmActionMenuId === `main-${dm.dm_room_id}`;
                        return (
                          <div key={dm.dm_room_id ? `dm-list-${dm.dm_room_id}` : `fallback-dm-list-${i}`} className="relative flex items-center justify-between p-3 hover:bg-[var(--bg-surface)] rounded-xl group border-t border-transparent hover:border-[var(--bg-surface)] transition-all">
                            <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => props.selectDm(dm)}>
                              <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={props.onlineUsersSet.has(dm.profiles.id)} className="w-10 h-10" />
                              <div>
                                <div className="font-bold text-[var(--text-main)] flex items-center gap-2">{dm.profiles.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{dm.profiles.unique_tag}</span></div>
                                <div className="text-xs text-gray-400">{props.onlineUsersSet.has(dm.profiles.id) ? 'Online' : 'Offline'}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-[var(--bg-element)] text-gray-300 transition-colors" onClick={(e) => { e.stopPropagation(); props.selectDm(dm); }}><MessageSquare size={18} /></button>
                              <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(isMenuOpen ? null : `main-${dm.dm_room_id}`); }} className={`p-2.5 rounded-full ghost-border transition-colors ${isMenuOpen ? 'opacity-100 bg-[var(--bg-element)] text-[var(--text-main)]' : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-element)] text-gray-300'}`}>
                                <MoreVertical size={18} />
                              </button>
                            </div>

                            {isMenuOpen && (
                              <>
                                <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); }}></div>
                                <div className="absolute right-12 top-12 w-48 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-[70] py-1 animate-fade-in origin-top-right">
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
                )}
              </div>

              <div className="w-80 border-l border-[var(--border-subtle)] hidden xl:flex flex-col bg-[var(--bg-base)] shrink-0" key="active-now-panel">
                <div className="p-6 pb-4 shrink-0">
                  <h2 className="text-lg font-bold text-[var(--text-main)] font-display">Active Now</h2>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-4 pb-6">
                  {props.onlineFriends.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 border border-dashed border-[var(--border-subtle)] rounded-2xl">It's quiet for now...</div>
                  ) : (
                    props.onlineFriends.map((dm, i) => (
                      <div key={dm.dm_room_id ? `dm-act-${dm.dm_room_id}` : `fallback-dm-act-${i}`} className="p-4 bg-[var(--bg-surface)] rounded-xl ghost-border shadow-md cursor-pointer hover:border-indigo-500 transition-all" onClick={() => props.selectDm(dm)}>
                        <div className="flex items-center gap-3 mb-3">
                          <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={true} className="w-8 h-8" />
                          <span className="font-bold text-sm text-[var(--text-main)]">{dm.profiles.username}</span>
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-2 bg-[var(--bg-base)] p-2 rounded-lg shadow-inner"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online & Active</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div 
                className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 animate-fade-in relative z-10" 
                ref={props.scrollContainerRef} 
                onScroll={props.handleScroll}
              >
                {props.isLoadingMore && (
                  <div className="flex justify-center py-4 absolute top-0 left-0 right-0 z-50">
                    <Loader2 className="animate-spin text-[var(--theme-base)]" size={24} />
                  </div>
                )}

                {props.visibleMessages.length === 0 && (props.activeChannel || props.activeDm) && !props.isLoadingMore && (
                  <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                    <h3 className="font-headline text-3xl font-bold tracking-tight mb-2 text-[var(--text-main)]">Welcome to {props.view === 'home' ? 'the beginning' : `#${props.activeChannel?.name}`}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">Your digital workspace is clear. Connect with your team or explore new horizons.</p>
                  </div>
                )}

                {/* 🚀 THE ULTIMATE SHIELD: Pre-filters the array before rendering */}
                {props.visibleMessages.filter(m => {
                    const text = String(m.content || '');
                    // Annihilates any literal DB string containing "Encrypted Message"
                    return !text.includes('Encrypted Message');
                }).map((m, index) => {
                  const uniqueKey = m.id ? `msg-${m.id}` : `fallback-${index}-${crypto.randomUUID()}`;
                  const isMessageBlocked = props.blockedUsersSet.has(m.profile_id);
                  if (isMessageBlocked) return (
                    <div key={uniqueKey} className="text-center my-4"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-[var(--bg-surface)] px-4 py-1.5 rounded-full ghost-border shadow-sm">Message Hidden (Blocked User)</span></div>
                  )

                  const showHeader = index === 0 || props.visibleMessages[index - 1].profile_id !== m.profile_id || new Date(m.created_at) - new Date(props.visibleMessages[index - 1].created_at) > 300000;
                  const isDM = props.view === 'home';
                  const isMe = m.profile_id === props.session.user.id;
                  const alignRight = isDM && isMe;
                  const isEditing = props.editingMessageId === m.id;
                  const isHighlighted = props.highlightedMessageId === m.id;
                  
                  const repliedMsg = m.reply_to_message_id ? props.validMessages.find(msg => msg.id === m.reply_to_message_id) : null;
                  
                  return (
                    <MemoizedMessage 
                      key={uniqueKey}
                      m={m}
                      isMe={isMe}
                      showHeader={showHeader}
                      alignRight={alignRight}
                      isHighlighted={isHighlighted}
                      currentUserId={props.session.user.id}
                      isEditing={isEditing}
                      editContent={props.editContent}
                      setEditContent={props.setEditContent}
                      handleUpdateMessage={props.handleUpdateMessage}
                      setEditingMessageId={props.setEditingMessageId}
                      inlineDeleteMessageId={props.inlineDeleteMessageId}
                      inlineDeleteStep={props.inlineDeleteStep}
                      setInlineDeleteMessageId={props.setInlineDeleteMessageId}
                      setInlineDeleteStep={props.setInlineDeleteStep}
                      executeInlineDelete={props.executeInlineDelete}
                      toggleReaction={props.toggleReaction}
                      setReplyingTo={props.setReplyingTo}
                      repliedMsg={repliedMsg}
                      scrollToMessage={props.scrollToMessage}
                      setSelectedImage={props.setSelectedImage}
                    />
                  )
                })}
                <div ref={props.messagesEndRef} className="h-4" />
              </div>

              {props.isBlocked ? (
                <div className="p-4 mx-4 md:mx-6 mb-4 md:mb-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl font-bold text-sm shadow-inner z-10 relative">
                  You cannot reply to a blocked conversation. Unblock the user to send messages.
                </div>
              ) : (
                <div className="p-4 md:p-6 pt-0 shrink-0 bg-transparent z-10 relative flex flex-col">
                  
                  {props.typingUsers.length > 0 && (
                    <div className="absolute -top-5 left-6 flex items-center gap-2 text-[11px] font-bold text-[var(--theme-base)] animate-fade-in pointer-events-none z-20">
                      <div className="flex items-center gap-1 px-1">
                        <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                      <span>{props.typingUsers.length === 1 ? `${props.typingUsers[0].username} is typing...` : `${props.typingUsers.length} people are typing...`}</span>
                    </div>
                  )}

                  {props.replyingTo && (
                    <div className="bg-[var(--theme-20)] backdrop-blur-md border-l-4 border-[var(--theme-base)] px-4 py-2 mb-2 mx-2 rounded-r-xl flex items-center justify-between text-sm animate-fade-in shadow-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[var(--theme-base)] whitespace-nowrap">Replying to {props.replyingTo.profiles?.username}</span>
                        <span className="truncate text-gray-300 max-w-[150px] md:max-w-[300px]">{props.replyingTo.content || 'Attachment'}</span>
                      </div>
                      <button onClick={() => props.setReplyingTo(null)} className="text-gray-400 hover:text-[var(--text-main)] ml-2 p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer shrink-0"><X size={14}/></button>
                    </div>
                  )}

                  {props.pendingFile && (
                    <div className="mx-2 mb-3 p-3 bg-[var(--bg-surface)] border border-[var(--theme-base)] rounded-2xl flex items-center gap-4 animate-slide-up shadow-2xl relative">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/10">
                        <img src={props.pendingFile.previewUrl} className="w-full h-full object-cover" alt="Paste preview" />
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-[var(--theme-base)] uppercase tracking-tighter">Ready to send</span>
                        <p className="text-[11px] text-gray-500 italic">Add a caption below or hit Enter</p>
                      </div>
                      <button onClick={() => props.setPendingFile(null)} className="p-2 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-colors"><X size={18}/></button>
                    </div>
                  )}

                  <form onSubmit={props.handleSendMessage} className="bg-[var(--bg-surface)] rounded-2xl ghost-border flex items-end gap-1 md:gap-2 p-1.5 md:p-2 focus-within:border-[var(--theme-50)] shadow-inner transition-colors relative">
                    
                    <div ref={gifPickerRef}>
                      {props.showGifPicker && (
                        <GifPickerPopout 
                          onSelectGif={props.handleSendGif} 
                          onClose={() => props.setShowGifPicker(false)} 
                        />
                      )}
                    </div>

                    <div ref={emojiPickerRef} className="relative">
                      {showInputEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-4 z-50 shadow-2xl rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                          <EmojiPicker 
                            theme="dark" 
                            emojiStyle="native"
                            lazyLoadEmojis={true}
                            width={320}
                            height={380}
                            previewConfig={{showPreview: false}}
                            onEmojiClick={handleEmojiSelect} 
                          />
                        </div>
                      )}
                      <button type="button" onClick={toggleEmojiPicker} disabled={props.isUploading} className={`p-2.5 md:p-3 font-bold text-sm rounded-xl transition-colors shrink-0 disabled:opacity-50 cursor-pointer ${showInputEmojiPicker ? 'text-[var(--theme-base)] bg-[var(--theme-10)]' : 'text-gray-500 hover:text-[var(--theme-base)] hover:bg-[var(--bg-base)]'}`} title="Insert Emoji">
                        <SmilePlus size={20} aria-hidden="true" />
                      </button>
                    </div>

                    <input type="file" accept="image/*" ref={props.fileInputRef} onChange={props.handleFileUpload} className="hidden" />
                    <input type="file" ref={props.genericFileInputRef} onChange={props.handleGenericFileUpload} className="hidden" />
                    
                    <button type="button" onClick={() => props.fileInputRef.current?.click()} disabled={props.isUploading} className="p-2.5 md:p-3 text-gray-500 hover:text-[var(--theme-base)] rounded-xl hover:bg-[var(--bg-base)] transition-colors shrink-0 disabled:opacity-50 cursor-pointer" title="Upload Image">
                      {props.isUploading ? <Loader2 className="animate-spin text-[var(--theme-base)]" size={20} /> : <ImagePlus size={20} aria-hidden="true" />}
                    </button>

                    <button type="button" onClick={() => props.genericFileInputRef.current?.click()} disabled={props.isUploading} className="p-2.5 md:p-3 text-gray-500 hover:text-[var(--theme-base)] rounded-xl hover:bg-[var(--bg-base)] transition-colors shrink-0 disabled:opacity-50 cursor-pointer" title="Upload File">
                      {props.isUploading ? <Loader2 className="animate-spin text-[var(--theme-base)]" size={20} /> : <Paperclip size={20} aria-hidden="true" />}
                    </button>

                    <button 
                      type="button" 
                      onClick={toggleGifPicker} 
                      disabled={props.isUploading} 
                      className={`p-2.5 md:p-3 font-bold text-sm rounded-xl transition-colors shrink-0 disabled:opacity-50 cursor-pointer ${props.showGifPicker ? 'text-[var(--theme-base)] bg-[var(--theme-10)]' : 'text-gray-500 hover:text-[var(--theme-base)] hover:bg-[var(--bg-base)]'}`} 
                      title="Send GIF"
                    >
                      GIF
                    </button>

                    <textarea 
                      ref={props.messageInputRef}
                      onFocus={() => { setShowInputEmojiPicker(false); props.setShowGifPicker(false); }}
                      onPaste={props.handlePaste}
                      className="flex-1 bg-transparent border-none outline-none text-[var(--text-main)] resize-none py-2.5 md:py-3 custom-scrollbar text-[14px] md:text-[15px] font-body min-w-0 placeholder:text-gray-600" 
                      placeholder={props.pendingFile ? "Add a caption..." : `Message ${props.view === 'home' ? '@' + props.activeDm?.profiles?.username : '#' + props.activeChannel?.name}`} 
                      onChange={props.handleTyping} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          props.handleSendMessage(e); 
                        }
                      }} 
                      rows={1} 
                      style={{ minHeight: '44px', maxHeight: '200px' }} 
                    />
                    <button type="submit" disabled={props.isUploading} className="p-2.5 md:p-3 text-[var(--theme-base)] hover:text-[var(--theme-base)] rounded-xl hover:bg-[var(--theme-10)] transition-colors shrink-0 disabled:opacity-50 cursor-pointer">
                      <Send size={20} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
