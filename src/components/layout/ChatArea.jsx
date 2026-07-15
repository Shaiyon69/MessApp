/**
 * Owns central chat presentation and composer-only UI state. Dashboard and the
 * chat hook supply data/actions. Mobile trays and viewport offsets stay aligned
 * with native keyboard and safe-area behavior.
 */
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { Loader2, Menu, Users, UserPlus, Hash, Phone, Video, Search, Info, ImagePlus, Paperclip, Send, X, Bell, MessageSquare, MoreVertical, Trash2, Check, SmilePlus, Plus, FileText, ChevronDown, Mic, MicOff, MonitorUp, PhoneOff, Radio, Volume2, VolumeX } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { MemoizedMessage } from '../chat/MessageElements'
import AddFriendView from '../modals/AddFriendView'
import GifPickerPopout from '../modals/GifPickerPopout'
import ChatEmojiPicker from '../chat/ChatEmojiPicker'
import SfuScreenShare from '../screen-share/SfuScreenShare'
import { debug } from '../../lib/debug'
import { openDmEntry } from '../../lib/chatActions'

const debugStack = () => new Error().stack?.split('\n').slice(2, 8).join('\n')

const logMenuDebug = (event, payload = {}) => {
  console.debug('[MENU_DEBUG]', event, {
    componentPath: 'src/components/layout/ChatArea.jsx',
    ...payload,
    stack: debugStack()
  })
}

export default function ChatArea(props) {
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState([]);
  
  const emojiPickerRef = useRef(null);
  const gifPickerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const previousChatKeyRef = useRef('');
  const initialPositionRef = useRef({ chatKey: '', positioned: false });
  const [positionedChatKey, setPositionedChatKey] = useState('');
  const formatPendingFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
  }
  const chatViewportStyle = props.isChatActive ? {
    backgroundColor: 'var(--chat-bg-base)',
    backgroundImage: props.wallpaperCSS && props.wallpaperCSS !== 'none' ? props.wallpaperCSS : 'none',
    backgroundSize: props.wallpaperSize || 'cover',
    backgroundRepeat: props.wallpaperRepeat || 'no-repeat',
    backgroundPosition: props.wallpaperPosition || 'center'
  } : undefined;
  const latestOutgoingMessageId = useMemo(() => {
    for (let index = props.visibleMessages.length - 1; index >= 0; index -= 1) {
      const message = props.visibleMessages[index]
      if (message?.profile_id === props.session.user.id) return message.id
    }
    return null
  }, [props.session.user.id, props.visibleMessages])
  const validMessagesById = useMemo(() => new Map(props.validMessages.map(message => [message.id, message])), [props.validMessages])
  const activeChatKey = `${props.view}:${props.activeChannel?.id || props.activeDm?.dm_room_id || 'none'}`
  const isInitialPositionReady = positionedChatKey === activeChatKey
  const isVoiceChannel = props.view === 'server' && props.activeChannel?.type === 'voice'
  const isActiveVoiceSession = isVoiceChannel && props.activeVoiceSession?.channelId === props.activeChannel?.id
  const messageListStyle = props.isCallMinimized
    ? { paddingBottom: 'calc(9.5rem + env(safe-area-inset-bottom, 0px))' }
    : undefined

  useLayoutEffect(() => {
    if (initialPositionRef.current.chatKey !== activeChatKey) {
      initialPositionRef.current = { chatKey: activeChatKey, positioned: false }
      setPositionedChatKey('')
    }

    if (initialPositionRef.current.positioned) return
    const container = props.scrollContainerRef.current
    if (!container) return

    if (props.visibleMessages.length > 0) {
      container.scrollTop = container.scrollHeight
      initialPositionRef.current.positioned = true
      setPositionedChatKey(activeChatKey)
      return
    }

    if (props.initialMessagesLoaded && !props.messagesLoading) {
      initialPositionRef.current.positioned = true
      setPositionedChatKey(activeChatKey)
    }
  }, [activeChatKey, props.initialMessagesLoaded, props.messagesLoading, props.scrollContainerRef, props.visibleMessages.length])

  const closeMessageActionMenu = useCallback((reason, payload = {}) => {
    if (!props.messageActionMenuId) return
    logMenuDebug('menu closed', { reason, messageId: props.messageActionMenuId, ...payload })
    props.setMessageActionMenuId(null)
  }, [props.messageActionMenuId, props.setMessageActionMenuId])

  // Dashboard owns the maintained create_or_get_dm flow; ChatArea only routes
  // validated contacts to that canonical handler.
  const openDmContact = useCallback((entry) => openDmEntry(entry, {
    selectDm: props.selectDm,
    createOrOpenDm: props.createOrOpenDm,
    onMissing: metadata => {
      if (import.meta.env.DEV) debug.warn('DM_LIST', { operation: 'missing-open-handler', ...metadata })
    }
  }), [props.createOrOpenDm, props.selectDm])

  const toggleEmojiPicker = () => {
    if (document.activeElement) document.activeElement.blur();
    props.setShowGifPicker(false);
    setShowAttachMenu(false);
    setShowInputEmojiPicker(prev => !prev);
  };

  const toggleGifPicker = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (document.activeElement) document.activeElement.blur();
    setShowInputEmojiPicker(false);
    setShowAttachMenu(false);
    props.setShowGifPicker(!props.showGifPicker);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowInputEmojiPicker(false)
      }

      if (gifPickerRef.current && !gifPickerRef.current.contains(event.target)) {
        props.setShowGifPicker(false)
      }

      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false)
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [props.setShowGifPicker])

  useEffect(() => {
    if (previousChatKeyRef.current && previousChatKeyRef.current !== activeChatKey) {
      closeMessageActionMenu('chat_target_changed', {
        from: previousChatKeyRef.current,
        to: activeChatKey
      })
    }
    previousChatKeyRef.current = activeChatKey
  }, [activeChatKey, closeMessageActionMenu])

useEffect(() => {
  if (!props.messageActionMenuId) return

  const selectedEl = document.getElementById(`message-${props.messageActionMenuId}`)

  if (!selectedEl) {
    const frame = requestAnimationFrame(() => {
      const retryEl = document.getElementById(`message-${props.messageActionMenuId}`)
      if (!retryEl) {
        closeMessageActionMenu('message_dom_missing_after_frame')
      }
    })

    return () => cancelAnimationFrame(frame)
  }
}, [props.messageActionMenuId, closeMessageActionMenu])

  useEffect(() => {
    setPinnedMessages(props.pinnedMessages || []);
  }, [props.pinnedMessages]);

  useEffect(() => {
    const urls = (props.pendingFiles || []).map(item => item.file?.type?.startsWith('image/') ? URL.createObjectURL(item.file) : '')
    setPendingPreviewUrls(urls)
    return () => urls.filter(Boolean).forEach(url => URL.revokeObjectURL(url))
  }, [props.pendingFiles]);

  const handleEmojiSelect = (emojiData) => {
    const input = props.messageInputRef.current;
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.setRangeText(emojiData.emoji, start, end, 'end');
      const newPos = start + emojiData.emoji.length;
      input.selectionStart = input.selectionEnd = newPos;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  };

  const renderHomeTabBar = () => (
    <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-xl px-3 py-3 md:px-6">
      <div className="premium-menu mx-auto grid max-w-3xl grid-cols-4 gap-2 rounded-2xl p-1.5">
        <button onClick={() => props.setHomeTab('online')} data-active={props.homeTab === 'online'} data-tab-tone="online" className="home-tab-button min-h-12 rounded-xl text-sm font-bold transition-all focus-visible:ring-2 focus-visible:ring-green-400 outline-none cursor-pointer border">Online</button>
        <button onClick={() => props.setHomeTab('all')} data-active={props.homeTab === 'all'} data-tab-tone="all" className="home-tab-button min-h-12 rounded-xl text-sm font-bold transition-all focus-visible:ring-2 focus-visible:ring-sky-400 outline-none cursor-pointer border">All</button>
        <button onClick={() => props.setHomeTab('pending')} data-active={props.homeTab === 'pending'} data-tab-tone="pending" className="home-tab-button relative min-h-12 rounded-xl text-sm font-bold transition-all focus-visible:ring-2 focus-visible:ring-amber-400 outline-none cursor-pointer border">
          Pending
          {props.friendRequests.length > 0 && <span className="absolute right-2 top-2 bg-red-500 text-white text-[10px] min-w-5 h-5 px-1 flex items-center justify-center rounded-full font-bold">{props.friendRequests.length}</span>}
        </button>
        <button
          onClick={() => { props.setHomeTab('add_friend'); props.selectDm(null); }}
          data-active={props.homeTab === 'add_friend'}
          data-tab-tone="add"
          className="home-tab-button min-h-12 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border"
        >
          <UserPlus size={18} /><span className="hidden sm:inline">Add</span>
        </button>
      </div>
    </div>
  )

  return (
      <main
        className="flex-1 flex flex-col min-h-0 min-w-0 max-w-full overflow-hidden relative bg-[var(--bg-base)]"
        style={props.scopedChatStyle}
        onPaste={props.handlePaste}
        onPointerDownCapture={(e) => {
          if (!props.messageActionMenuId) return

          const target = e.target

          if (
            target.closest?.('.message-action-toolbar') ||
            target.closest?.('.messapp-reaction-popover') ||
            target.closest?.('.message-touch-target') ||
            target.closest?.('.EmojiPickerReact')
          ) {
            return
          }

          props.setMessageActionMenuId(null)
        }}
      >
      <header className={`h-16 flex items-center justify-between px-4 md:px-6 backdrop-blur-xl border-b shrink-0 z-30 shadow-md ${props.isChatActive ? 'bg-[var(--chat-bg-base)] border-[var(--chat-border)]' : 'bg-[var(--bg-base)]/80 border-[var(--border-subtle)]'}`}>
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
          <button onClick={() => props.setMobileMenuOpen(true)} className="md:hidden text-gray-400 hover:text-[var(--text-main)] p-2 -ml-2 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer">
            <Menu size={32} />
          </button>
          {props.view === 'home' && !props.activeDm ? (
            <div className="flex items-center gap-3 md:gap-6 animate-fade-in w-full min-w-0">
              <div className="flex items-center gap-2 text-[var(--text-main)] font-bold shrink-0">
                <Users size={24} className="text-gray-400 hidden sm:block" />
                <span className="text-lg">Friends</span>
              </div>
            </div>
          ) : props.view === 'home' && props.activeDm ? (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-dm-${props.activeDm.dm_room_id}`}>
                <StatusAvatar url={props.activeDm.profiles.avatar_url} username={props.activeDm.profiles.username} status={props.getPresenceStatus?.(props.activeDm.profiles.id)} className="w-9 h-9" loading="eager" />
                <div className="min-w-0">
                  <h2 className="font-headline font-bold text-[var(--chat-text,var(--text-main))] text-xl tracking-tight truncate">{props.activeDm.profiles.username}</h2>
                  <p className="text-[11px] font-semibold text-gray-500 leading-none">{props.getPresenceLabel?.(props.activeDm.profiles.id) || 'Offline'}</p>
                </div>
            </div>
          ) : props.view === 'server' && props.activeChannel ? (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-chan-${props.activeChannel.id}`}>
              {isVoiceChannel ? <Volume2 size={20} className="text-gray-500 shrink-0" aria-hidden="true" /> : <Hash size={20} className="text-gray-500 shrink-0" aria-hidden="true" />}
              <h2 className="font-headline font-bold text-[var(--chat-text,var(--text-main))] text-xl tracking-tight truncate">{props.activeChannel.name}</h2>
            </div>
          ) : (
            <h2 className="font-headline font-bold text-transparent bg-clip-text text-xl tracking-tight shrink-0 truncate animate-fade-in" style={{ backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' }} key="header-dash">MESSY APPY</h2>
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0 ml-2 md:ml-4">
          {props.isChatActive && (
            <>
              {props.view === 'home' && props.activeDm && <button onClick={() => props.startCall(false)} className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]"><Phone size={20} aria-hidden="true" /></button>}
              {props.view === 'home' && props.activeDm && <button onClick={() => props.startCall(true)} className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]"><Video size={20} aria-hidden="true" /></button>}
              {props.view === 'home' && props.activeDm && <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1"></div>}
              <button onClick={() => props.toggleRightSidebar('search')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${props.rightTab === 'search' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`}><Search size={20} aria-hidden="true" /></button>
              <button onClick={() => props.toggleRightSidebar('info')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${props.rightTab === 'info' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`}><Info size={20} aria-hidden="true" /></button>
            </>
          )}
        </div>
      </header>

      {props.activeVoiceSession && (
        <SfuScreenShare
          roomId={props.activeVoiceSession.roomId}
          createClient={props.screenShareClientFactory}
          variant={props.isViewingActiveVoiceChannel ? 'full' : 'mini'}
          title={`${props.activeVoiceSession.serverName} / ${props.activeVoiceSession.channelName}`}
          currentUser={{
            id: props.session.user.id,
            displayName: props.session.user.user_metadata?.username || props.session.user.email?.split('@')[0],
            avatarUrl: props.session.user.user_metadata?.avatar_url
          }}
          focusRequest={props.voiceFocusRequest}
          muted={props.voiceMuted}
          deafened={props.voiceDeafened}
          onToggleMute={() => props.setVoiceMuted?.(value => !value)}
          onToggleDeafen={() => props.setVoiceDeafened?.(value => !value)}
          onLeave={props.leaveActiveVoice}
          onOpen={props.openActiveVoiceChannel}
          onStateChange={props.setVoiceSessionState}
        />
      )}

      {!props.isViewingActiveVoiceChannel && (
      <div className="flex-1 flex min-w-0 max-w-full overflow-hidden relative transition-all duration-300 ease-out transform" style={chatViewportStyle} data-pinned-count={pinnedMessages.length}>
        <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden z-10 relative transition-all duration-300 ease-out transform" key={props.view + (props.activeChannel?.id || props.activeDm?.dm_room_id || '')}>
          {isVoiceChannel ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-36 md:p-8">
              <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 p-5 shadow-xl md:p-7">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${isActiveVoiceSession ? 'bg-green-500/15 text-green-300' : 'bg-[var(--theme-20)] text-[var(--theme-base)]'}`}>
                        <Radio size={28} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">Voice channel</p>
                        <h3 className="truncate text-2xl font-black text-[var(--text-main)]">{props.activeChannel.name}</h3>
                        <p className={`mt-1 text-sm font-bold ${isActiveVoiceSession ? 'text-green-300' : 'text-gray-400'}`}>
                          {isActiveVoiceSession ? `Connected - ${props.voiceSessionState?.status || 'connecting'}` : 'Not connected'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isActiveVoiceSession ? (
                        <button
                          type="button"
                          onClick={() => props.selectChannel?.(props.activeChannel)}
                          className="inline-flex items-center gap-2 rounded-xl bg-[var(--theme-base)] px-4 py-2.5 text-sm font-black text-white shadow-lg"
                        >
                          <Phone size={18} aria-hidden="true" />
                          Join voice
                        </button>
                      ) : (
                        <>
                          <button type="button" onClick={() => props.setVoiceMuted?.(value => !value)} className={`rounded-xl p-2.5 ${props.voiceMuted ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={props.voiceMuted ? 'Unmute' : 'Mute'}>
                            {props.voiceMuted ? <MicOff size={18} /> : <Mic size={18} />}
                          </button>
                          <button type="button" onClick={() => props.setVoiceDeafened?.(value => !value)} className={`rounded-xl p-2.5 ${props.voiceDeafened ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={props.voiceDeafened ? 'Undeafen' : 'Deafen'}>
                            {props.voiceDeafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
                          </button>
                          <button type="button" onClick={props.openActiveVoiceChannel} className="inline-flex items-center gap-2 rounded-xl bg-green-500/15 px-4 py-2.5 text-sm font-black text-green-300">
                            <MonitorUp size={18} aria-hidden="true" />
                            Expanded
                          </button>
                          <button type="button" onClick={props.leaveActiveVoice} className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-black text-red-300">
                            <PhoneOff size={18} aria-hidden="true" />
                            Leave
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Participants</p>
                      <p className="mt-2 text-2xl font-black text-[var(--text-main)]">{isActiveVoiceSession ? 1 + (props.voiceSessionState?.remoteCount || 0) : 0}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Screen share</p>
                      <p className={`mt-2 text-sm font-black ${props.voiceSessionState?.isSharing ? 'text-green-300' : 'text-gray-400'}`}>{props.voiceSessionState?.isSharing ? 'Live' : 'Idle'}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">You</p>
                      <div className="mt-3 flex items-center gap-3">
                        <StatusAvatar url={props.session.user.user_metadata?.avatar_url} username={props.session.user.user_metadata?.username || props.session.user.email} status="online" className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--text-main)]">{props.session.user.user_metadata?.username || props.session.user.email?.split('@')[0]}</p>
                          <p className="text-xs text-gray-500">{props.voiceMuted ? 'Muted' : 'Mic ready'} / {props.voiceDeafened ? 'Deafened' : 'Listening'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : props.view === 'home' && !props.activeDm ? (
            <div className="flex-1 flex overflow-hidden bg-[var(--bg-base)]">
              <div className="flex-1 flex flex-col overflow-hidden">
                {props.homeTab === 'add_friend' ? (
                  <>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <AddFriendView session={props.session} />
                    </div>
                    {renderHomeTabBar()}
                  </>
                ) : (
                  <>
                    <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
                      <div className="premium-input ghost-border rounded-xl flex items-center px-4 py-3 mb-6 transition-all">
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
                        const isMenuOpen = Boolean(dm.dm_room_id && props.dmActionMenuId === `main-${dm.dm_room_id}`);
                        return (
                          <div key={dm.dm_room_id ? `dm-list-${dm.dm_room_id}` : `fallback-dm-list-${i}`} className="relative flex items-center justify-between p-3 hover:bg-[var(--bg-surface)] rounded-xl group border-t border-transparent hover:border-[var(--bg-surface)] transition-all">
                            <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => openDmContact(dm)}>
                              <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={props.getPresenceStatus?.(dm.profiles.id)} className="w-10 h-10" />
                              <div>
                                <div className="font-bold text-[var(--text-main)] flex items-center gap-2">{dm.profiles.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{dm.profiles?.unique_tag}</span></div>
                                <div className="text-xs text-gray-400">{props.getPresenceLabel?.(dm.profiles.id) || 'Offline'}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-100 transition-opacity">
                              <button disabled={props.startingDmProfileId === dm.profiles.id || (!dm.dm_room_id && typeof props.createOrOpenDm !== 'function')} className="p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-[var(--bg-element)] text-gray-300 transition-colors disabled:opacity-50" onClick={(e) => { e.stopPropagation(); openDmContact(dm); }}><MessageSquare size={18} /></button>
                              {dm.dm_room_id && <button data-dm-action-menu="main-trigger" onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(isMenuOpen ? null : `main-${dm.dm_room_id}`); }} className={`p-2.5 rounded-full ghost-border transition-colors ${isMenuOpen ? 'bg-[var(--bg-element)] text-[var(--text-main)]' : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-element)] text-gray-300'}`}>
                                <MoreVertical size={18} />
                              </button>}
                            </div>
                            {isMenuOpen && (
                              <div data-dm-action-menu="main-panel" className="premium-menu absolute right-12 top-12 w-48 rounded-xl z-[70] py-1 animate-fade-in origin-top-right">
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
                    {renderHomeTabBar()}
                  </>
                )}
              </div>
              <div className="w-80 border-l border-[var(--border-subtle)] hidden xl:flex flex-col bg-[var(--surface-strong)] backdrop-blur-xl shrink-0" key="active-now-panel">
                <div className="p-6 pb-4 shrink-0">
                  <h2 className="text-lg font-bold text-[var(--text-main)] font-display">Active Now</h2>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-4 pb-6">
                  {props.onlineFriends.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 border border-dashed border-[var(--border-subtle)] rounded-2xl">It's quiet for now...</div>
                  ) : (
                    props.onlineFriends.map((dm, i) => (
                      <div key={dm.dm_room_id ? `dm-act-${dm.dm_room_id}` : `fallback-dm-act-${i}`} className="premium-section p-4 rounded-xl cursor-pointer hover:border-[var(--theme-base)] transition-all" onClick={() => props.selectDm(dm)}>
                        <div className="flex items-center gap-3 mb-3">
                          <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={props.getPresenceStatus?.(dm.profiles.id)} className="w-8 h-8" />
                          <span className="font-bold text-sm text-[var(--text-main)]">{dm.profiles.username}</span>
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-2 bg-[var(--bg-base)] p-2 rounded-lg shadow-inner"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> {props.getPresenceLabel?.(dm.profiles.id) || 'Online'}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div 
                className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden custom-scrollbar p-4 md:p-8 relative z-10 transition-[padding] duration-300 ease-out"
                ref={props.scrollContainerRef} 
                onScroll={props.handleScroll}
                style={{ ...messageListStyle, visibility: isInitialPositionReady ? 'visible' : 'hidden' }}
                data-call-minimized={props.isCallMinimized ? 'true' : undefined}
              >
                {props.isLoadingMore && (
                  <div className="flex justify-center py-4 absolute top-0 left-0 right-0 z-50">
                    <Loader2 className="animate-spin text-[var(--theme-base)]" size={24} />
                  </div>
                )}
                {props.messagesLoading && props.visibleMessages.length === 0 && (
                  <div className="flex min-h-full flex-col justify-end gap-4 pb-6" aria-label="Loading messages">
                    {Array.from({ length: 7 }, (_, index) => {
                      const isOwn = index % 3 === 1
                      return (
                        <div key={`message-skeleton-${index}`} className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`} aria-hidden="true">
                          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--bg-element)]" />
                          <div className={`animate-pulse rounded-2xl bg-[var(--bg-element)] ${index % 2 === 0 ? 'h-14 w-[min(72%,28rem)]' : 'h-10 w-[min(52%,20rem)]'}`} />
                        </div>
                      )
                    })}
                  </div>
                )}
                {props.visibleMessages.length === 0 && (props.activeChannel || props.activeDm) && !props.isLoadingMore && !props.messagesLoading && (
                  <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                    <h3 className="font-headline text-3xl font-bold tracking-tight mb-2 text-[var(--chat-text,var(--text-main))]">Welcome to {props.view === 'home' ? 'the beginning' : `#${props.activeChannel?.name}`}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">Your digital workspace is clear. Connect with your team or explore new horizons.</p>
                  </div>
                )}
                {props.visibleMessages.map((m, index, renderedMessages) => {
                  const uniqueKey = m.id ? `msg-${m.id}` : `fallback-${index}`;
                  const isMessageBlocked = props.blockedUsersSet.has(m.profile_id);
                  if (isMessageBlocked) return (
                    <div key={uniqueKey} className="text-center my-4"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-[var(--bg-surface)] px-4 py-1.5 rounded-full ghost-border shadow-sm">Message Hidden (Blocked User)</span></div>
                  )
                  const previousMessage = renderedMessages[index - 1]
                  const showHeader = index === 0 || previousMessage.profile_id !== m.profile_id || new Date(m.created_at) - new Date(previousMessage.created_at) > 300000;
                  const isDM = props.view === 'home';
                  const isMe = m.profile_id === props.session.user.id;
                  const alignRight = isDM && isMe;
                  const isEditing = props.editingMessageId === m.id;
                  const isHighlighted = props.highlightedMessageId === m.id;
                  const repliedMsg = m.reply_to_message_id ? validMessagesById.get(m.reply_to_message_id) : null;
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
                      togglePinnedMessage={props.togglePinnedMessage}
                      presenceStatus={props.getPresenceStatus?.(m.profile_id)}
	                      peerReadAt={props.peerReadAt}
	                      retryFailedMessage={props.retryFailedMessage}
	                      showDeliveryStatus={m.id === latestOutgoingMessageId}
	                      messageActionMenuId={props.messageActionMenuId}
	                      setMessageActionMenuId={props.setMessageActionMenuId}
	                      setMessageActionMenuPosition={props.setMessageActionMenuPosition}
	                    />
                  )
                })}
                <div ref={props.messagesEndRef} className="h-4" />
              </div>
              {props.showLatestMessagesButton && (
                <div className="pointer-events-none relative z-30 h-0">
                  <button
                    type="button"
                    onClick={props.scrollToLatestMessages}
                    className="premium-menu pointer-events-auto absolute left-1/2 bottom-3 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[var(--text-main)] shadow-xl transition-all hover:border-[var(--theme-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] cursor-pointer"
                  >
                    <ChevronDown size={18} className="text-[var(--theme-base)]" aria-hidden="true" />
                    <span className="hidden sm:inline">Latest messages</span>
                    <span className="sm:hidden">Latest</span>
                  </button>
                </div>
              )}
              {props.isBlocked ? (
                <div className="p-4 mx-4 md:mx-6 mb-4 md:mb-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl font-bold text-sm shadow-inner z-10 relative">
                  You cannot reply to this conversation. {props.blockReason}
                </div>
              ) : (
                <div className="p-2 md:p-4 pt-0 shrink-0 bg-transparent z-10 relative flex flex-col">
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
                  {props.pendingFiles?.length > 0 && (
                    <div className="premium-section mx-2 mb-3 rounded-2xl p-3 animate-slide-up">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-bold uppercase tracking-tighter text-[var(--theme-base)]">{props.isUploading ? 'Uploading' : 'Ready to send'}</span>
                          <p className="truncate text-[11px] italic text-gray-500">{props.pendingFiles.length} {props.pendingFiles.length === 1 ? 'attachment' : 'images'} • Add a caption below</p>
                        </div>
                        <button type="button" onClick={() => props.setPendingFiles([])} className="rounded-full bg-red-500/10 p-2 text-red-500 transition-colors hover:bg-red-500 hover:text-white" aria-label="Remove all attachments"><X size={18}/></button>
                      </div>
                      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {props.pendingFiles.map((item, index) => (
                          <div key={`${item.name}-${item.size}-${index}`} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                            {pendingPreviewUrls[index] ? <img src={pendingPreviewUrls[index]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><FileText size={28} className="text-[var(--theme-base)]" /></div>}
                            <button type="button" onClick={() => props.removePendingFile(index)} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" aria-label={`Remove ${item.name}`}><X size={12}/></button>
                            {props.isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Loader2 size={24} className="animate-spin text-white" /></div>}
                            <span className="absolute bottom-0 left-0 right-0 truncate bg-black/65 px-1 py-0.5 text-[9px] text-white">{formatPendingFileSize(item.size)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {props.editingMessageId && (
                    <div className="premium-section mx-2 md:mx-4 mb-2 rounded-2xl border border-[var(--theme-50)] bg-[var(--theme-20)] px-3 py-2.5 animate-slide-up">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-black uppercase tracking-widest text-[var(--theme-base)]">
                            Editing message
                          </div>
                          <div className="mt-1 truncate text-sm font-medium text-[var(--chat-text,var(--text-main))]">
                            {props.editContent || 'Add a caption'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            props.setEditingMessageId(null)
                            props.setEditContent('')
                          }}
                          className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-[var(--text-main)]"
                          aria-label="Cancel edit"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="mt-2 flex justify-end gap-2 md:hidden">
                        <button
                          type="button"
                          onClick={() => {
                            props.setEditingMessageId(null)
                            props.setEditContent('')
                          }}
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[var(--text-main)]"
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={(e) => props.handleUpdateMessage(e, props.editingMessageId, { allowEmpty: true })}
                          className="rounded-full bg-[var(--theme-base)] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                        if (props.editingMessageId) {
                          props.handleUpdateMessage(e, props.editingMessageId, { allowEmpty: true })
                        } else {
                          props.handleSendMessage(e)
                        }
                      }
                    } 
                    className="premium-composer rounded-3xl flex items-center gap-2 p-1.5 transition-all duration-300 ease-out transform relative mt-1 mx-2 md:mx-4 mb-2 md:mb-4">
                    <div ref={gifPickerRef} onTouchStartCapture={() => { if (document.activeElement) document.activeElement.blur(); }}>
                      {props.showGifPicker && (
                        <GifPickerPopout 
                          onSelectGif={props.handleSendGif} 
                          onClose={() => props.setShowGifPicker(false)} 
                        />
                      )}
                    </div>
                    <div ref={attachMenuRef} className="relative shrink-0 flex items-center justify-center w-[44px] h-[44px]">
                      {showAttachMenu && (
                        <div className="premium-menu absolute bottom-full left-0 mb-3 rounded-xl z-50 flex flex-col p-1.5 animate-slide-up origin-bottom-left min-w-[160px]" onTouchStartCapture={() => { if (document.activeElement) document.activeElement.blur(); }}>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAttachMenu(false); setTimeout(() => props.fileInputRef.current?.click(), 0); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-main)] font-medium hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer">
                            <ImagePlus size={18} className="text-indigo-400" /> Upload Image
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAttachMenu(false); setTimeout(() => props.genericFileInputRef.current?.click(), 0); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-main)] font-medium hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer">
                            <Paperclip size={18} className="text-green-400" /> Upload File
                          </button>
                          <div className="h-[1px] bg-[var(--border-subtle)] my-1 mx-2"></div>
                          <button type="button" onClick={(e) => { setShowAttachMenu(false); toggleGifPicker(e); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-main)] font-medium hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer">
                            <div className="bg-pink-500/20 text-pink-400 rounded p-0.5 text-[10px] font-black">GIF</div> Send a GIF
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (document.activeElement) document.activeElement.blur(); setShowAttachMenu(!showAttachMenu); }} disabled={props.isUploading} className="premium-icon-button w-full h-full flex items-center justify-center rounded-full cursor-pointer hover:text-[var(--theme-base)]">
                        {props.isUploading ? <Loader2 className="animate-spin text-[var(--text-main)]" size={20} /> : <Plus size={22} className="transition-transform duration-200" />}
                      </button>
                    </div>
                    <input type="file" accept="image/*,.gif" multiple ref={props.fileInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="*/*" ref={props.genericFileInputRef} onChange={props.handleGenericFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center bg-[var(--chat-bg-element)] rounded-[22px] relative min-w-0 border border-transparent min-h-[44px]">
                      <textarea 
                        data-message-composer="true"
                        ref={props.messageInputRef}
                        onFocus={() => { 
                          setShowInputEmojiPicker(false); 
                          props.setShowGifPicker(false); 
                          setShowAttachMenu(false); 
                        }}
                        onPaste={props.handlePaste}
                        onBeforeInput={props.handleBeforeInput}
                        className="flex-1 bg-transparent border-none outline-none text-[var(--chat-text,var(--text-main))] resize-none py-2.5 px-4 custom-scrollbar text-[15px] md:text-[16px] font-body min-w-0 placeholder:text-gray-500 transition-all duration-300 ease-out transform" 
                        placeholder={
                          props.editingMessageId
                            ? 'Edit message...'
                            : props.pendingFiles?.length > 0
                              ? 'Add a caption...'
                              : `Message ${props.view === 'home' ? '@' + props.activeDm?.profiles?.username : '#' + props.activeChannel?.name}`
                        }
                        value={props.editingMessageId ? props.editContent : undefined}
                        onChange={(e) => {
                          if (props.editingMessageId) props.setEditContent(e.target.value)
                          else props.handleTyping(e)
                        }}
                        onKeyDown={(e) => {
                          if (props.editingMessageId) {
                            if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
                              e.preventDefault()
                              props.handleUpdateMessage(e, props.editingMessageId, { allowEmpty: true })
                            }
                            if (e.key === 'Escape') {
                              props.setEditingMessageId(null)
                              props.setEditContent('')
                            }
                            return
                          }

                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            props.handleSendMessage(e)
                          }
                        }} 
                        rows={1} 
                        style={{ minHeight: '44px', maxHeight: '200px' }} 
                      />
                      <div ref={emojiPickerRef} className="flex items-center justify-center h-[44px] w-[44px] shrink-0">
                        {showInputEmojiPicker && (
                          <div 
                            className="premium-menu fixed bottom-20 right-2 sm:absolute sm:bottom-full sm:right-0 md:right-4 sm:mb-2 z-[100] rounded-xl overflow-hidden"
                            onTouchStartCapture={() => { if (document.activeElement) document.activeElement.blur(); }}
                          >
                            <ChatEmojiPicker
                              width={typeof window !== 'undefined' && window.innerWidth < 360 ? Math.min(window.innerWidth - 16, 320) : 320}
                              height={380}
                              searchDisabled={true}
                              onEmojiClick={handleEmojiSelect} 
                            />
                          </div>
                        )}
                        <button 
                          type="button" 
                          onClick={toggleEmojiPicker} 
                          onTouchStartCapture={() => { if (document.activeElement) document.activeElement.blur(); }} 
                          disabled={props.isUploading} 
                          className={`w-[36px] h-[36px] flex items-center justify-center rounded-full transition-colors cursor-pointer ${showInputEmojiPicker ? 'text-[var(--theme-base)] bg-[var(--theme-10)]' : 'premium-icon-button hover:text-[var(--theme-base)]'}`} 
                          title="Insert Emoji"
                        >
                          <SmilePlus size={20} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {props.keyboardImageFallbackMessage && (
                      <p className="px-4 pt-1 text-[11px] font-medium text-amber-300/90">
                        {props.keyboardImageFallbackMessage}
                      </p>
                    )}
                    </div>
                    <button type="submit" disabled={props.isUploading} className="w-[44px] h-[44px] flex items-center justify-center rounded-full bg-[var(--theme-base)] text-white hover:brightness-110 shadow-lg shadow-[var(--theme-50)] transition-all shrink-0 disabled:opacity-50 cursor-pointer">
                      <Send size={18} className="translate-x-[-1px] translate-y-[1px]" aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
    </main>
  )
}
