import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import imageCompression from 'browser-image-compression'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { Loader2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { cacheThumbnail } from '../lib/cacheManager'
import { generateEcdhKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm } from '../lib/crypto'
import { Settings, Pen, Send, Plus, Hash, Compass, Home, Users, ImagePlus, Search, Info, X, Bell, Trash2, Check, UserPlus, MessageSquare, CornerDownLeft, Edit3, Copy, LogOut, Menu, User, Ban, EyeOff, SmilePlus, Phone, Video, Mic, MicOff, VideoOff, PhoneOff, Activity, Minimize2, Maximize2, Download } from 'lucide-react'

import AddFriendView from './modals/AddFriendView'
import ServerActionPopout from './modals/ServerActionPopout'
import ServerSettingsModal from './modals/ServerSettings'
import ChannelCreationModal from './modals/ChannelCreation'
import ChannelSettingsModal from './modals/ChannelSettings'
import UserSettingsModal from './modals/UserSettings'

const THEME_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' }
]

const WALLPAPERS = [
  { id: 'default', name: 'Clean Dark', css: 'none' },
  { id: 'doodles', name: 'Doodles', css: 'url("https://www.transparenttextures.com/patterns/connected.png")' },
  { id: 'galaxy', name: 'Galaxy', css: 'radial-gradient(circle at top right, rgba(76, 29, 149, 0.4) 0%, transparent 60%)' },
  { id: 'emerald', name: 'Emerald', css: 'radial-gradient(circle at bottom left, rgba(6, 78, 59, 0.4) 0%, transparent 60%)' }
]

const QUICK_EMOJIS = ['🔥', '💀', '👍', '❤️', '😭', '👀']

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ringInterval = null;
    this.hasInteracted = false; 
    this.unlockHandler = () => this.unlock();
    document.addEventListener('click', this.unlockHandler, { once: true });
    document.addEventListener('touchstart', this.unlockHandler, { once: true });
  }
  unlock() {
    this.hasInteracted = true;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    document.removeEventListener('click', this.unlockHandler);
    document.removeEventListener('touchstart', this.unlockHandler);
  }
  init() {
    if (!this.hasInteracted) return false; 
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); 
    return true;
  }
  playPop() {
    try {
      if (!this.init()) return; 
      if (this.ctx.state !== 'running') return; 
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05); 
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.01); 
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t); osc.stop(t + 0.1);
    } catch(_err) { // Ignore err
    }
  }
  startRing(isOutgoing) {
    try {
      if (!this.init()) return; 
      this.stopRing();
      const vol = isOutgoing ? 0.01 : 0.05; 
      const ring = () => {
        if (this.ctx && this.ctx.state !== 'running') return; 
        const t = this.ctx.currentTime;
        [523.25, 659.25, 880.00].forEach((freq, i) => { 
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.type = 'sine'; 
          osc.frequency.setValueAtTime(freq, t + i * 0.15);
          gain.gain.setValueAtTime(0, t + i * 0.15);
          gain.gain.linearRampToValueAtTime(vol, t + i * 0.15 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.5);
          osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + 0.6);
        });
      };
      ring();
      this.ringInterval = setInterval(ring, 2000);
    } catch(_err) { // Ignore err
    }
  }
  stopRing() {
    if (this.ringInterval) clearInterval(this.ringInterval);
  }
}
const audioSys = new SoundEngine();

const StatusAvatar = ({ url, username, isOnline, showStatus = true, className = "" }) => {
  const maskId = `mask-${crypto.randomUUID()}`;
  const center = 50;
  const statusOffset = 85; 
  const statusRadius = 14; 
  const cutoutRadius = 19; 
  
  const statusColor = isOnline ? '#23a559' : '#80848e';

  return (
    <div className={`relative shrink-0 flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <mask id={maskId}>
            <circle cx={center} cy={center} r={center} fill="white" />
            {showStatus && <circle cx={statusOffset} cy={statusOffset} r={cutoutRadius} fill="black" />}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {url ? (
            <image href={url} width="100" height="100" preserveAspectRatio="xMidYMid slice" />
          ) : (
            <>
              <circle cx={center} cy={center} r={center} fill="var(--border-subtle)" />
              <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="white" fontSize="45" fontWeight="bold" fontFamily="sans-serif">
                {username?.[0]?.toUpperCase() || '?'}
              </text>
            </>
          )}
        </g>
        {showStatus && (
          <circle cx={statusOffset} cy={statusOffset} r={statusRadius} fill={statusColor} />
        )}
      </svg>
    </div>
  )
}

const MemoizedMessage = React.memo(({ 
  m, isMe, showHeader, alignRight, isHighlighted, currentUserId,
  isEditing, editContent, setEditContent, handleUpdateMessage, setEditingMessageId,
  inlineDeleteMessageId, inlineDeleteStep, setInlineDeleteMessageId, setInlineDeleteStep, executeInlineDelete,
  toggleReaction, setReplyingTo, repliedMsg, scrollToMessage, setSelectedImage
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showMobileActions, setShowMobileActions] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const touchTimer = useRef(null)

  const handleTouchStart = () => {
    touchTimer.current = setTimeout(() => {
      setShowMobileActions(true)
      if (navigator.vibrate) navigator.vibrate(50)
    }, 400)
  }

  const handleTouchEndOrMove = () => { if (touchTimer.current) clearTimeout(touchTimer.current) }
  
  const handleBubbleClick = () => { showMobileActions ? setShowMobileActions(false) : setShowDetails(!showDetails) }

  const groupedReactions = m.message_reactions?.reduce((acc, r) => {
    acc[r.emoji] = [...(acc[r.emoji] || []), r]
    return acc
  }, {}) || {}

  const exactTime = new Date(m.created_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div id={`message-${m.id}`} className={`flex gap-2.5 md:gap-3 transition-all duration-500 ${showHeader ? 'mt-4 md:mt-5' : 'mt-1'} ${isHighlighted ? 'bg-[var(--theme-20)] p-2 -mx-2 rounded-xl shadow-[0_0_15px_var(--theme-20)] scale-[1.01] z-20' : ''} ${alignRight ? 'flex-row-reverse' : ''}`} onMouseLeave={() => { setShowReactionPicker(false); setShowMobileActions(false); }}>
      
      {showHeader ? (
        <StatusAvatar url={m.profiles?.avatar_url} username={m.profiles?.username} showStatus={false} className="h-8 w-8 md:h-10 md:w-10 mt-1 shadow-md ghost-border rounded-full shrink-0" />
      ) : (
        <div className={`w-8 md:w-10 shrink-0 flex ${alignRight ? 'justify-start' : 'justify-center'} items-center opacity-0 text-[10px] text-gray-500 font-medium select-none`}></div>
      )}
      
      <div className={`flex flex-col w-full min-w-0 ${alignRight ? 'items-end' : ''}`}>
        
        {showHeader && (
          <div className={`flex items-baseline gap-2 mb-0.5 ${alignRight ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[13px] md:text-[14px] font-bold tracking-tight ${isMe ? 'text-[var(--theme-base)]' : 'text-[var(--text-main)]'}`}>{m.profiles?.username}</span>
            <span className="text-[10px] text-gray-500 font-medium">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        
        {isEditing ? (
          <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1 w-full max-w-3xl">
            <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full bg-[var(--bg-surface)] text-[var(--text-main)] px-4 py-2.5 rounded-xl ghost-border outline-none shadow-inner text-sm focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${alignRight ? 'text-right' : ''}`} autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
            <span className={`text-[10px] text-gray-500 mt-1.5 block ${alignRight ? 'text-right' : ''}`}>Press Enter to save, Esc to cancel</span>
          </form>
        ) : (
          <div className={`flex items-start gap-2 max-w-full w-fit ${alignRight ? 'flex-row-reverse ml-auto' : 'mr-auto'} mt-0.5 relative group/bubble`}>
            
            <div 
              className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%] shrink-0 cursor-pointer md:cursor-default`}
              onTouchStart={handleTouchStart} 
              onTouchEnd={handleTouchEndOrMove} 
              onTouchMove={handleTouchEndOrMove} 
              onClick={handleBubbleClick}
              onContextMenu={(e) => { if (window.innerWidth < 768) e.preventDefault(); }} 
            >
              
              {m.reply_to_message_id && repliedMsg && !m.is_deleted && (
                <div onClick={(e) => { e.stopPropagation(); scrollToMessage(repliedMsg); }} className={`flex items-center gap-1.5 mb-1 opacity-70 text-[11px] text-gray-400 select-none cursor-pointer hover:opacity-100 transition-opacity ${alignRight ? 'flex-row-reverse text-right' : 'text-left'}`}>
                  <CornerDownLeft size={12} className="shrink-0" />
                  <StatusAvatar url={repliedMsg.profiles?.avatar_url} username={repliedMsg.profiles?.username} showStatus={false} className="w-3 h-3 rounded-full shrink-0" />
                  <span className="font-bold truncate max-w-[80px]">{repliedMsg.profiles?.username}</span>
                  <span className="truncate max-w-[150px] md:max-w-[250px]">{repliedMsg.content || 'Attachment'}</span>
                </div>
              )}

              {m.is_deleted ? (
                <div className={`px-3 py-1.5 md:px-4 md:py-2 rounded-2xl border w-fit max-w-full ${alignRight ? 'rounded-tr-none border-[var(--theme-20)] text-gray-400/80' : 'rounded-tl-none border-[var(--border-subtle)] text-gray-500'} bg-transparent border-dashed shadow-sm text-left flex items-center gap-2 select-none`}>
                  <Ban size={14} className="opacity-50" />
                  <span className="italic text-[12px] md:text-[13px]">This message was unsent.</span>
                </div>
              ) : (
                <>
                  {m.content && m.content.trim() !== '' && (
                    <div className={`px-3 py-1.5 md:px-4 md:py-2 rounded-2xl border w-fit max-w-full ${alignRight ? 'rounded-tr-none bg-[var(--theme-10)] border-[var(--theme-20)] text-[var(--text-main)]' : 'rounded-tl-none bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-main)]'} shadow-sm backdrop-blur-md text-left transition-transform active:scale-[0.98] md:active:scale-100`}>
                      <div className="leading-relaxed markdown-body text-[13px] md:text-[14px] break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ inline, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 ghost-border text-sm shadow-lg bg-[var(--bg-base)]" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                              ) : <code className="bg-black/50 text-[var(--theme-base)] px-1.5 py-0.5 rounded-md font-mono text-[12px] border border-white/5" {...props}>{children}</code>
                            },
                            a({...props}) { return <a className="text-[var(--theme-base)] hover:underline underline-offset-2" target="_blank" rel="noreferrer" {...props} /> }
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {m.image_url && (
                    <div 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (showMobileActions) {
                          setShowMobileActions(false);
                        } else {
                          setSelectedImage({ url: m.image_url, user: m.profiles?.username, time: exactTime }); 
                        }
                      }}
                      className={`block ${m.content ? 'mt-1.5' : ''} w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden ghost-border hover:opacity-90 transition-opacity shadow-lg cursor-pointer bg-black/20`}
                    >
                      <img 
                        src={m.image_url} 
                        alt="User attachment" 
                        className="w-full h-auto max-h-[300px] object-cover" 
                        loading="lazy" 
                      />
                    </div>
                  )}

                  {showDetails && (
                    <div className={`mt-1 mb-1 flex items-center gap-1.5 text-[10px] text-gray-400 animate-fade-in ${alignRight ? 'flex-row-reverse' : ''}`}>
                      <span>{exactTime}</span>
                      {isMe && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                          <span className="text-[var(--theme-base)] font-bold">Delivered</span>
                        </>
                      )}
                    </div>
                  )}

                  {Object.keys(groupedReactions).length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1.5 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(groupedReactions).map(([emoji, reactions], idx) => {
                        const hasReacted = reactions.some(r => r.profile_id === currentUserId)
                        return (
                          <button key={`react-${m.id}-${idx}`} onClick={(e) => { e.stopPropagation(); toggleReaction(m.id, emoji, hasReacted); setShowReactionPicker(false); }} className={`px-1.5 py-0.5 rounded-lg text-xs flex items-center gap-1 border transition-colors cursor-pointer select-none ${hasReacted ? 'bg-[var(--theme-20)] border-[var(--theme-50)]' : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)]'}`}>
                            <span>{emoji}</span> <span className={`font-bold ${hasReacted ? 'text-[var(--text-main)]' : 'text-gray-400'}`}>{reactions.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {!m.is_deleted && (
              <div className={`flex items-center gap-1 transition-opacity duration-200 shrink-0 relative ${showMobileActions || showReactionPicker || inlineDeleteMessageId === m.id ? 'opacity-100' : 'opacity-0 md:group-hover/bubble:opacity-100'}`}>
                {showReactionPicker && (
                  <div className={`absolute ${alignRight ? 'right-full mr-2' : 'left-full ml-2'} top-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xl flex gap-1 p-1 z-50 animate-fade-in`}>
                    {QUICK_EMOJIS.map((emoji, idx) => {
                       const hasReacted = groupedReactions[emoji]?.some(r => r.profile_id === currentUserId)
                       return <button key={`quick-${m.id}-${idx}`} onClick={() => { toggleReaction(m.id, emoji, hasReacted); setShowReactionPicker(false); setShowMobileActions(false); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-element)] hover:scale-110 transition-all cursor-pointer text-lg">{emoji}</button>
                    })}
                  </div>
                )}

                {inlineDeleteMessageId === m.id ? (
                  <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2 py-1 rounded-full shadow-sm animate-fade-in">
                    {inlineDeleteStep === 'options' && (
                      <>
                        {isMe && <button onClick={() => setInlineDeleteStep('confirm_everyone')} className="text-[10px] font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors cursor-pointer">Unsend</button>}
                        <button onClick={() => setInlineDeleteStep('confirm_me')} className="text-[10px] font-bold text-gray-400 hover:text-[var(--text-main)] px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap">Hide</button>
                        <div className="w-[1px] h-3 bg-[var(--border-subtle)] mx-1"></div>
                        <button onClick={() => { setInlineDeleteMessageId(null); setShowMobileActions(false); }} className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </>
                    )}
                    {inlineDeleteStep === 'confirm_everyone' && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-red-400 whitespace-nowrap">Unsend?</span>
                        <button onClick={() => { executeInlineDelete(m, 'everyone'); setShowMobileActions(false); }} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><Check size={12}/></button>
                        <button onClick={() => setInlineDeleteStep('options')} className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </div>
                    )}
                    {inlineDeleteStep === 'confirm_me' && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">Hide?</span>
                        <button onClick={() => { executeInlineDelete(m, 'me'); setShowMobileActions(false); }} className="bg-[var(--text-main)]/10 text-[var(--text-main)] hover:bg-[var(--text-main)]/20 p-1 rounded-full transition-colors cursor-pointer"><Check size={12}/></button>
                        <button onClick={() => setInlineDeleteStep('options')} className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setReplyingTo(m); setShowMobileActions(false); }} className="p-1.5 text-gray-500 hover:text-[var(--theme-base)] bg-[var(--bg-surface)] md:bg-transparent md:hover:bg-[var(--border-subtle)] rounded-full transition-colors cursor-pointer" title="Reply"><CornerDownLeft size={14} aria-hidden="true" /></button>
                    <button onClick={() => setShowReactionPicker(!showReactionPicker)} className="p-1.5 text-gray-500 hover:text-yellow-400 bg-[var(--bg-surface)] md:bg-transparent md:hover:bg-[var(--border-subtle)] rounded-full transition-colors cursor-pointer" title="React"><SmilePlus size={14} aria-hidden="true" /></button>
                    {isMe && (
                      <button onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); setShowMobileActions(false); }} className="p-1.5 text-gray-500 hover:text-[var(--text-main)] bg-[var(--bg-surface)] md:bg-transparent md:hover:bg-[var(--border-subtle)] rounded-full transition-colors cursor-pointer" title="Edit"><Pen size={14} aria-hidden="true" /></button>
                    )}
                    <button onClick={() => { setInlineDeleteMessageId(m.id); setInlineDeleteStep('options'); }} className="p-1.5 text-gray-500 hover:text-red-400 bg-[var(--bg-surface)] md:bg-transparent md:hover:bg-red-500/10 rounded-full transition-colors cursor-pointer" title="Hide/Delete"><Trash2 size={14} aria-hidden="true" /></button>
                  </>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
})

export default function Dashboard({ session }) {
  const [view, setView] = useState('home')
  const [homeTab, setHomeTab] = useState('online') 
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const [servers, setServers] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [activeChannel, setActiveChannel] = useState(null)
  const [dms, setDms] = useState([])
  const [activeDm, setActiveDm] = useState(null)

  const [onlineUsers, setOnlineUsers] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  
  const [blockedUsers, setBlockedUsers] = useState([]) 
  const [restrictedUsers, setRestrictedUsers] = useState(() => JSON.parse(localStorage.getItem(`restricted_${session.user.id}`) || '[]'))
  const [localDeletedMessages, setLocalDeletedMessages] = useState(() => JSON.parse(localStorage.getItem(`deleted_msgs_${session.user.id}`) || '[]'))

  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [rightTab, setRightTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')

  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)
  const messageInputRef = useRef(null)

  const [selectedImage, setSelectedImage] = useState(null)

  const [serverAction, setServerAction] = useState(null)
  const [showProfilePopout, setShowProfilePopout] = useState(false)
  const [settingsModalConfig, setSettingsModalConfig] = useState({ isOpen: false, tab: 'account' })
  const popoutRef = useRef(null)
  
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) 

  const [serverSettingsName, setServerSettingsName] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [channelSettingsName, setChannelSettingsName] = useState('')
  
  const [messages, setMessages] = useState([])
  const [replyingTo, setReplyingTo] = useState(null)
  
  const [inlineDeleteMessageId, setInlineDeleteMessageId] = useState(null)
  const [inlineDeleteStep, setInlineDeleteStep] = useState('options') 
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [typingUsers, setTypingUsers] = useState([])

  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)

  const [callActive, setCallActive] = useState(false)
  const [callMinimized, setCallMinimized] = useState(false)
  const [callDirection, setCallDirection] = useState(null)
  const [remoteCaller, setRemoteCaller] = useState(null)
  const [ncEnabled, setNcEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  
  const callChannelRef = useRef(null)
  const activeCallTargetRef = useRef(null)

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const typingChannelRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const myAvatar = session.user.user_metadata?.avatar_url
  const myBanner = session.user.user_metadata?.banner_url
  const myBio = session.user.user_metadata?.bio
  const myPronouns = session.user.user_metadata?.pronouns
  const myUsername = session.user.user_metadata?.username || session.user.email.split('@')[0]
  const myTag = session.user.user_metadata?.unique_tag || `${myUsername}#0000`

  // 🛡️ SKIBIDI E2EE ARCHITECTURE: Dynamic Shared Key Derivation
  const getSharedKeyForTarget = useCallback(async (targetId, isDm) => {
    if (!isDm) return null;
    const dm = dms.find(d => d.dm_room_id === targetId);
    if (!dm || !dm.profiles?.public_key) return null;
    try {
      const privKeyStr = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
      if (!privKeyStr) return null;
      const privJwk = JSON.parse(privKeyStr);
      const importedPriv = await importPrivateKey(privJwk);
      const pubJwk = JSON.parse(dm.profiles.public_key);
      return await deriveSharedAesKey(importedPriv, pubJwk);
    } catch (e) {
      console.warn('E2EE Derivation Error:', e);
      return null;
    }
  }, [dms, session.user.id]);

  // 🛡️ SKIBIDI E2EE ARCHITECTURE: Batch Message Decryption
  const decryptMessageList = useCallback(async (msgList, sharedKey) => {
    return await Promise.all(msgList.map(async (msg) => {
      if (msg.content && msg.content.startsWith('{') && msg.content.includes('ciphertext')) {
        if (!sharedKey) return { ...msg, content: '🔒 [Encrypted Message]' };
        try {
          const encObj = JSON.parse(msg.content);
          if (encObj.iv && encObj.ciphertext) {
            const decrypted = await decryptWithAesGcm(sharedKey, encObj);
            return { ...msg, content: decrypted };
          }
        } catch (e) {
          return { ...msg, content: '🔒 [Encrypted Message - Unreadable]' };
        }
      }
      return msg;
    }));
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    const theme = localStorage.getItem('appTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');
  }, []);

  const uiStateRef = useRef({})
  useEffect(() => {
    uiStateRef.current = {
      mobileMenuOpen, showRightSidebar, showProfilePopout, settingsIsOpen: settingsModalConfig.isOpen,
      activeDm, activeChannel, view, callActive, callMinimized,
      hasModals: !!(serverAction || showServerSettings || showChannelModal || showChannelSettings || showQuickSwitcher || confirmAction)
    }
  }, [mobileMenuOpen, showRightSidebar, showProfilePopout, settingsModalConfig.isOpen, activeDm, activeChannel, view, serverAction, showServerSettings, showChannelModal, showChannelSettings, showQuickSwitcher, confirmAction, callActive, callMinimized])

  useEffect(() => {
    window.history.pushState({ page: 'app' }, '', window.location.href)
    let backPressCount = 0
    let backPressTimeout

    const handlePopState = () => {
      const state = uiStateRef.current
      if (state.callActive && !state.callMinimized) {
        setCallMinimized(true)
        window.history.pushState({ page: 'app' }, '', window.location.href)
        return
      }
      if (state.mobileMenuOpen || state.showRightSidebar || state.showProfilePopout || state.settingsIsOpen || state.hasModals) {
        setMobileMenuOpen(false)
        setShowRightSidebar(false)
        setShowProfilePopout(false)
        setSettingsModalConfig({ isOpen: false, tab: 'account' })
        setServerAction(null)
        setShowServerSettings(false)
        setShowChannelModal(false)
        setShowChannelSettings(false)
        setShowQuickSwitcher(false)
        setConfirmAction(null)
        window.history.pushState({ page: 'app' }, '', window.location.href)
        return
      }
      if ((state.activeDm || state.activeChannel || state.view !== 'home') && window.innerWidth < 768) {
        setActiveDm(null)
        setActiveChannel(null)
        setView('home')
        window.history.pushState({ page: 'app' }, '', window.location.href)
        return
      }
      backPressCount++
      if (backPressCount === 1) {
        toast('Press back again to exit', { icon: '🚪', id: 'exit-toast', duration: 2000 })
        window.history.pushState({ page: 'app' }, '', window.location.href)
        backPressTimeout = setTimeout(() => { backPressCount = 0 }, 2000)
      } else {
        window.history.back() 
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      clearTimeout(backPressTimeout)
    }
  }, [])

  useEffect(() => { localStorage.setItem(`restricted_${session.user.id}`, JSON.stringify(restrictedUsers)) }, [restrictedUsers, session.user.id])
  useEffect(() => { localStorage.setItem(`deleted_msgs_${session.user.id}`, JSON.stringify(localDeletedMessages)) }, [localDeletedMessages, session.user.id])

  useEffect(() => {
    if (callActive && callDirection === 'incoming') audioSys.startRing(false);
    else if (callActive && callDirection === 'outgoing') audioSys.startRing(true);
    else audioSys.stopRing();
    return () => audioSys.stopRing();
  }, [callActive, callDirection])

  useEffect(() => {
    const sigChannel = supabase.channel('global-signaling')
    
    sigChannel.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
      if (payload.targetId !== session.user.id) return;

      if (payload.type === 'offer') {
        if (uiStateRef.current.callActive) {
          sendSignal(payload.callerId, 'busy', {})
          return
        }
        setRemoteCaller(payload.caller)
        activeCallTargetRef.current = payload.callerId
        setCallDirection('incoming')
        setCallActive(true)
        setCallMinimized(false)
        
        if (!pcRef.current) {
          pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
          pcRef.current.onicecandidate = (e) => {
            if (e.candidate) sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate })
          }
          pcRef.current.ontrack = (e) => {
            if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream()
            if (!remoteStreamRef.current.getTracks().find(t => t.id === e.track.id)) {
              remoteStreamRef.current.addTrack(e.track)
            }
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStreamRef.current
              remoteAudioRef.current.play().catch(()=>{})
            }
          }
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.offer))
      }

      if (payload.type === 'answer') {
        if (pcRef.current && pcRef.current.signalingState !== 'stable') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer))
          setCallDirection('connected')
        }
      }

      if (payload.type === 'ice-candidate') {
        if (pcRef.current && pcRef.current.remoteDescription) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch (_err) { // Ignore err
          }
        }
      }

      if (payload.type === 'end') {
        endCallLocal()
        toast('Call ended')
      }
      
      if (payload.type === 'busy') {
        endCallLocal()
        toast.error('User is busy in another call')
      }
    })

    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') callChannelRef.current = sigChannel
    })

    return () => { supabase.removeChannel(sigChannel) }
  }, [session.user.id])

  const sendSignal = (targetId, type, data) => {
    if (callChannelRef.current && targetId) {
      callChannelRef.current.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: { targetId, type, callerId: session.user.id, ...data }
      }).catch(()=>{})
    }
  }

  const startCall = async () => {
    if (!activeDm) return
    setRemoteCaller(activeDm.profiles)
    activeCallTargetRef.current = activeDm.profiles.id
    setCallDirection('outgoing')
    setCallActive(true)
    setCallMinimized(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: false, 
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled } 
      })
      localStreamRef.current = stream

      pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream))

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) sendSignal(activeCallTargetRef.current, 'ice-candidate', { candidate: e.candidate })
      }
      
      pcRef.current.ontrack = (e) => {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream()
        if (!remoteStreamRef.current.getTracks().find(t => t.id === e.track.id)) {
          remoteStreamRef.current.addTrack(e.track)
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStreamRef.current
          remoteAudioRef.current.play().catch(()=>{})
        }
      }

      const offer = await pcRef.current.createOffer()
      await pcRef.current.setLocalDescription(offer)

      sendSignal(activeCallTargetRef.current, 'offer', {
        offer,
        caller: { id: session.user.id, username: myUsername, avatar_url: myAvatar }
      })
    } catch (_err) {
      endCallLocal()
      toast.error("Microphone permission denied")
    }
  }

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: false, 
        audio: { noiseSuppression: ncEnabled, echoCancellation: ncEnabled, autoGainControl: ncEnabled } 
      })
      localStreamRef.current = stream
      
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream))
      
      const answer = await pcRef.current.createAnswer()
      await pcRef.current.setLocalDescription(answer)
      
      sendSignal(activeCallTargetRef.current, 'answer', { answer })
      setCallDirection('connected')
    } catch (_err) {
      endCallLocal()
      sendSignal(activeCallTargetRef.current, 'end', {})
      toast.error("Microphone permission denied")
    }
  }

  const endCallNetwork = () => {
    if (activeCallTargetRef.current) sendSignal(activeCallTargetRef.current, 'end', {})
    endCallLocal()
  }

  const endCallLocal = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(t => t.stop())
      remoteStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setCallActive(false)
    setCallMinimized(false)
    setCallDirection(null)
    setRemoteCaller(null)
    activeCallTargetRef.current = null
    setMicEnabled(true)
    audioSys.stopRing()
  }

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !micEnabled
        setMicEnabled(!micEnabled)
      }
    }
  }

  const toggleNoiseCancellation = async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        const nextState = !ncEnabled
        try {
          await audioTrack.applyConstraints({ noiseSuppression: nextState, echoCancellation: nextState, autoGainControl: nextState })
          setNcEnabled(nextState)
          toast(nextState ? "Hardware Noise Cancellation On" : "Noise Cancellation Off", { icon: nextState ? '🎙️' : '⚠️' })
        } catch (_err) {
          toast.error("Browser does not support dynamic constraints")
        }
      }
    }
  }

  const safeCacheSave = (targetId, dataArray) => {
    try { localStorage.setItem(`local_chat_${targetId}`, JSON.stringify(dataArray)) } catch (_err) { // Ignore err
    }
  }

  const safeCacheLoad = (targetId) => {
    try { return JSON.parse(localStorage.getItem(`local_chat_${targetId}`)) || [] } catch (_err) { return [] }
  }

  const selectDm = useCallback((dm) => {
    setActiveDm(dm)
    setMobileMenuOpen(false)
    if (dm) localStorage.setItem(`last_dm_${session.user.id}`, dm.dm_room_id)
    else localStorage.removeItem(`last_dm_${session.user.id}`)
  }, [session.user.id])

  const fetchSurroundingMessages = async (targetMessage) => {
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    const { data: olderMessages } = await supabase.from('messages').select('*, profiles(username, avatar_url, public_key), message_reactions(*)').eq(field, targetId).lt('created_at', targetMessage.created_at).order('created_at', { ascending: false }).limit(20)
    const { data: newerMessages } = await supabase.from('messages').select('*, profiles(username, avatar_url, public_key), message_reactions(*)').eq(field, targetId).gte('created_at', targetMessage.created_at).order('created_at', { ascending: true }).limit(20)

    if (olderMessages || newerMessages) {
      const combinedMessages = [...(olderMessages || []).reverse(), ...(newerMessages || [])]
      
      const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
      const decryptedData = await decryptMessageList(combinedMessages, sharedKey);

      setMessages(prev => {
        // 🚨 FIX: Strong isolation for context loading
        const safePrev = prev.filter(m => m[field] === targetId);
        const merged = [...safePrev, ...decryptedData];
        const uniqueData = Array.from(new Map(merged.filter(m => m && m.id).map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, uniqueData);
        return uniqueData;
      })
      
      setTimeout(() => {
        const messageElement = document.getElementById(`message-${targetMessage.id}`)
        if (messageElement && scrollContainerRef.current) {
          messageElement.scrollIntoView({ behavior: 'auto', block: 'center' })
          setHighlightedMessageId(targetMessage.id)
          setTimeout(() => setHighlightedMessageId(null), 2500)
        }
      }, 100)
    } else toast.error("Failed to load message context.")
  }

  const scrollToMessage = async (message) => {
    const messageElement = document.getElementById(`message-${message.id}`)
    if (messageElement && scrollContainerRef.current) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(message.id)
      setTimeout(() => setHighlightedMessageId(null), 2500)
    } else {
      await fetchSurroundingMessages(message)
    }
  }

  const fetchOlderMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages || messages.length === 0) return;
    
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;
    if (!targetId) return;

    setIsLoadingMore(true);
    const oldestMessage = messages[0];
    const field = view === 'server' ? 'channel_id' : 'dm_room_id';

    const { data, error } = await supabase.from('messages')
      .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
      .eq(field, targetId)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      setIsLoadingMore(false);
      return;
    }

    if (data.length < 50) setHasMoreMessages(false);

    if (data.length > 0) {
      const chronoData = data.reverse();
      
      const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
      const decryptedData = await decryptMessageList(chronoData, sharedKey);

      const container = scrollContainerRef.current;
      const previousScrollHeight = container ? container.scrollHeight : 0;

      setMessages(prev => {
        // 🚨 FIX: Strict isolation during pagination scrolling
        const safePrev = prev.filter(m => m[field] === targetId);
        const merged = [...decryptedData, ...safePrev];
        const uniqueData = Array.from(new Map(merged.filter(m => m && m.id).map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, uniqueData);
        return uniqueData;
      });

      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - previousScrollHeight;
        }
      }, 0);
    }
    setIsLoadingMore(false);
  }, [activeChannel?.id, activeDm?.dm_room_id, view, isLoadingMore, hasMoreMessages, messages, getSharedKeyForTarget, decryptMessageList]);

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0) {
      fetchOlderMessages();
    }
  };

  useEffect(() => {
    const syncProfile = async () => {
      if (session?.user?.id && session?.user?.user_metadata) {
        
        // 🛡️ SKIBIDI E2EE ARCHITECTURE: Identity Key Generation
        let pubKeyStr = null;
        let privKeyJwkStr = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
        let pubKeyJwkStr = localStorage.getItem(`e2ee_public_key_${session.user.id}`);

        if (!privKeyJwkStr || !pubKeyJwkStr) {
          try {
            const keyPair = await generateEcdhKeyPair();
            const privJwk = await exportPrivateKey(keyPair.privateKey);
            const pubJwk = await exportPublicKey(keyPair.publicKey);
            privKeyJwkStr = JSON.stringify(privJwk);
            pubKeyJwkStr = JSON.stringify(pubJwk);
            localStorage.setItem(`e2ee_private_key_${session.user.id}`, privKeyJwkStr);
            localStorage.setItem(`e2ee_public_key_${session.user.id}`, pubKeyJwkStr);
          } catch(err) {
            console.error('Failed to generate keys', err);
          }
        }
        pubKeyStr = pubKeyJwkStr;

        const { username, unique_tag, avatar_url, banner_url, bio, pronouns } = session.user.user_metadata
        await supabase.from('profiles').upsert({ 
          id: session.user.id, 
          username: username || session.user.email.split('@')[0], 
          unique_tag: unique_tag, 
          avatar_url: avatar_url || null, 
          banner_url: banner_url || null, 
          bio: bio || null, 
          pronouns: pronouns || null,
          public_key: pubKeyStr
        }, { onConflict: 'id' }) 
      }
    }
    
    const fetchBlockedUsers = async () => {
      const { data } = await supabase.from('user_relationships').select('blocked_id').eq('blocker_id', session.user.id)
      if (data) setBlockedUsers(data.map(r => r.blocked_id))
    }

    syncProfile()
    fetchBlockedUsers()
    fetchServers()
    fetchDms()
    fetchFriendRequests()
    
    const presenceChannel = supabase.channel('global-presence')
    
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState()
      const activeUserIds = Object.values(state).flatMap(presences => presences.map(p => p.user_id))
      setOnlineUsers([...new Set(activeUserIds)])
    }).subscribe(async (status) => { 
      if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: session.user.id }) 
    })
    
    const requestsSub = supabase.channel('friend-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${session.user.id}` }, fetchFriendRequests).subscribe()

    return () => { supabase.removeChannel(presenceChannel); supabase.removeChannel(requestsSub) }
  }, [session]) 

  useEffect(() => {
    const roomSub = supabase.channel('dm-rooms-updates').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_rooms' }, (payload) => {
         setDms(current => current.map(dm => dm.dm_room_id === payload.new.id ? { ...dm, dm_rooms: { theme_color: payload.new.theme_color, wallpaper: payload.new.wallpaper } } : dm))
         if (activeDm && activeDm.dm_room_id === payload.new.id) setActiveDm(prev => ({ ...prev, dm_rooms: { theme_color: payload.new.theme_color, wallpaper: payload.new.wallpaper } }))
      }).subscribe()
    return () => supabase.removeChannel(roomSub)
  }, [activeDm])

  const fetchFriendRequests = async () => {
    const { data } = await supabase.from('friendships').select('id, sender_id, profiles!fk_sender(username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)').eq('receiver_id', session.user.id).eq('status', 'pending')
    if (data) setFriendRequests(data)
  }

  const handleAcceptRequest = async (request) => {
    try {
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', request.id)
      const { data: newRoom } = await supabase.from('dm_rooms').insert([{}]).select().maybeSingle()
      if (newRoom) await supabase.from('dm_members').insert([{ dm_room_id: newRoom.id, profile_id: session.user.id }, { dm_room_id: newRoom.id, profile_id: request.sender_id }])
      fetchFriendRequests()
      fetchDms()
      toast.success("Friend request accepted!")
    } catch { toast.error("Failed to accept request.") }
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await supabase.from('friendships').delete().eq('id', requestId)
      fetchFriendRequests()
    } catch { toast.error("Failed to decline request.") }
  }

  const closeRightSidebar = () => {
    setShowRightSidebar(false)
    setSearchQuery('')
  }

  const toggleRightSidebar = (tab) => {
    if (showRightSidebar && rightTab === tab) {
      closeRightSidebar()
    } else { 
      setShowRightSidebar(true); 
      setRightTab(tab); 
    }
  }

  const handleThemeChange = async (colorHex) => {
    if (!activeDm) return;
    const updatedDm = { ...activeDm, dm_rooms: { ...(activeDm.dm_rooms || {}), theme_color: colorHex } }
    setActiveDm(updatedDm)
    setDms(current => current.map(dm => dm.dm_room_id === activeDm.dm_room_id ? updatedDm : dm))
    try { await supabase.from('dm_rooms').update({ theme_color: colorHex }).eq('id', activeDm.dm_room_id) } catch (_err) { // Ignore err
    }
  }

  const handleWallpaperChange = async (wallpaperId) => {
    if (!activeDm) return;
    const updatedDm = { ...activeDm, dm_rooms: { ...(activeDm.dm_rooms || {}), wallpaper: wallpaperId } }
    setActiveDm(updatedDm)
    setDms(current => current.map(dm => dm.dm_room_id === activeDm.dm_room_id ? updatedDm : dm))
    try { await supabase.from('dm_rooms').update({ wallpaper: wallpaperId }).eq('id', activeDm.dm_room_id) } catch (_err) { // Ignore err
    }
  }

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, profile } = confirmAction;
    
    try {
      if (type === 'block') { 
        const { error } = await supabase.from('user_relationships').insert([{ blocker_id: session.user.id, blocked_id: profile.id }])
        if (error) throw error
        setBlockedUsers(prev => [...prev, profile.id]); 
        toast.error(`Blocked ${profile.username}`, { icon: '🚫' }); 
      } 
      else if (type === 'unblock') { 
        const { error } = await supabase.from('user_relationships').delete().match({ blocker_id: session.user.id, blocked_id: profile.id })
        if (error) throw error
        setBlockedUsers(prev => prev.filter(id => id !== profile.id)); 
        toast.success(`Unblocked ${profile.username}`); 
      } 
      else if (type === 'restrict') { 
        setRestrictedUsers(prev => [...prev, profile.id]); 
        toast.success(`Restricted ${profile.username}`, { icon: '🤫' }); 
      } 
      else if (type === 'unrestrict') { 
        setRestrictedUsers(prev => prev.filter(id => id !== profile.id)); 
        toast.success(`Unrestricted ${profile.username}`); 
      }
    } catch (_err) {
      toast.error("Failed to update user status")
    }
    setConfirmAction(null);
  }

  const fetchServers = async () => {
    const { data } = await supabase.from('servers').select('*, server_members!inner(*)').eq('server_members.profile_id', session.user.id)
    if (data) setServers(data)
  }

  const fetchDms = async () => {
    const { data: myRooms } = await supabase.from('dm_members').select('dm_room_id').eq('profile_id', session.user.id)
    if (!myRooms || myRooms.length === 0) { setDms([]); return }
    const roomIds = myRooms.map(r => r.dm_room_id)
    const { data: otherMembers } = await supabase.from('dm_members').select('dm_room_id, dm_rooms (theme_color, wallpaper), profiles!inner(id, username, avatar_url, unique_tag, banner_url, bio, pronouns, public_key)').in('dm_room_id', roomIds).neq('profile_id', session.user.id)
      
    if (otherMembers) {
      const uniqueDms = Array.from(new Map(otherMembers.map(item => [item.dm_room_id, item])).values())
      setDms(uniqueDms)
      const lastDmId = localStorage.getItem(`last_dm_${session.user.id}`)
      if (lastDmId && view === 'home') {
        const lastOpenDm = uniqueDms.find(d => d.dm_room_id === lastDmId);
        if (lastOpenDm) setActiveDm(lastOpenDm);
      }
    }
  }

  const handleHomeClick = () => { setView('home'); setHomeTab('online'); setActiveServer(null); setActiveChannel(null); selectDm(null); closeRightSidebar(); setMobileMenuOpen(false); }

  useEffect(() => {
    if (view === 'server' && activeServer) {
      const getServerData = async () => {
        const [channelsRes] = await Promise.all([
          supabase.from('channels').select('*').eq('server_id', activeServer.id).order('created_at', { ascending: true }),
          supabase.from('channel_reads').select('channel_id, last_read_at').eq('profile_id', session.user.id)
        ])
        if (channelsRes.data?.length > 0) setActiveChannel(channelsRes.data[0])
      }
      getServerData()
    }
  }, [activeServer?.id, view, session.user.id])

  const fetchCurrentMessages = useCallback(async () => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) return;

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    
    // 🚨 FIX 1: Instantly clear memory of cross-chat contamination
    setMessages(prev => prev.filter(m => m[field] === targetId))

    const cachedData = safeCacheLoad(targetId)
    if (cachedData.length > 0) {
      const validCache = Array.from(new Map(cachedData.filter(m => m && m.id).map(item => [item.id, item])).values());
      setMessages(validCache)
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 10)
    }

    const { data } = await supabase.from('messages')
      .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
      .eq(field, targetId)
      .order('created_at', { ascending: false }) 
      .limit(100)
      
    if (data) {
      if (data.length < 100) setHasMoreMessages(false);
      const chronoData = data.reverse() 

      const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
      const decryptedData = await decryptMessageList(chronoData, sharedKey);

      setMessages(prev => {
        // 🚨 FIX 2: Strict filter before merging
        const safePrev = prev.filter(m => m[field] === targetId);
        const merged = [...safePrev, ...decryptedData];
        const uniqueData = Array.from(new Map(merged.filter(m => m && m.id).map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, uniqueData) 
        return uniqueData;
      })
    }
    setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 100)
  }, [activeChannel?.id, activeDm?.dm_room_id, view, getSharedKeyForTarget, decryptMessageList])

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') fetchCurrentMessages() }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchCurrentMessages])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) { setMessages([]); setTypingUsers([]); return; }
    
    setHasMoreMessages(true);
    setMessages(safeCacheLoad(targetId))
    setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 10)

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    fetchCurrentMessages() 

    const roomChannel = supabase.channel(`room:${targetId}`)
    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState()
      const typers = Object.values(state).flatMap(p => p).filter(p => p.user_id !== session.user.id)
      setTypingUsers(typers)
    })

    roomChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `${field}=eq.${targetId}` }, async (payload) => {
      if (payload.eventType === 'INSERT') {
        const { data: fullMsg } = await supabase.from('messages')
          .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
          .eq('id', payload.new.id)
          .single()

        if (fullMsg) {
          const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
          const [decryptedMsg] = await decryptMessageList([fullMsg], sharedKey);

          setMessages(prev => {
            if (prev.some(msg => msg.id === decryptedMsg.id)) return prev; 
            
            // 🚨 FIX 3: Double-check the incoming WS message matches the active view
            const safePrev = prev.filter(m => m[field] === targetId);
            if (decryptedMsg[field] !== targetId) return safePrev;

            const updated = [...safePrev, decryptedMsg];
            updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            safeCacheSave(targetId, updated);
            return updated;
          })
          
          if (decryptedMsg.profile_id !== session.user.id) {
            if (localStorage.getItem('soundEnabled') !== 'false') audioSys.playPop();
          }
          setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
        }
      }
      
      if (payload.eventType === 'UPDATE') {
        const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
        const [decryptedMsg] = await decryptMessageList([payload.new], sharedKey);

        setMessages(current => {
          const updated = current.map(msg => msg.id === decryptedMsg.id ? { ...msg, ...decryptedMsg } : msg)
          safeCacheSave(targetId, updated)
          return updated
        })
      }
      
      if (payload.eventType === 'DELETE') {
        setMessages(current => {
          const updated = current.filter(msg => msg.id !== payload.old.id)
          safeCacheSave(targetId, updated)
          return updated
        })
      }
    })

    roomChannel.subscribe()
    typingChannelRef.current = roomChannel

    return () => {
      supabase.removeChannel(roomChannel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [activeChannel?.id, activeDm?.dm_room_id, view, session.user.id, session.user.user_metadata, fetchCurrentMessages, getSharedKeyForTarget, decryptMessageList])

  const toggleReaction = async (messageId, emoji, hasReacted) => {
    try {
      if (hasReacted) {
        await supabase.from('message_reactions').delete().match({ message_id: messageId, profile_id: session.user.id, emoji: emoji })
      } else {
        await supabase.from('message_reactions').insert([{ message_id: messageId, profile_id: session.user.id, emoji: emoji }])
      }
      
      setMessages(current => {
        const updated = current.map(msg => {
          if (msg.id === messageId) {
            const currentReactions = msg.message_reactions || []
            const newReactions = hasReacted 
              ? currentReactions.filter(r => !(r.profile_id === session.user.id && r.emoji === emoji))
              : [...currentReactions, { profile_id: session.user.id, emoji: emoji }]
            return { ...msg, message_reactions: newReactions }
          }
          return msg
        })
        const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
        if (targetId) safeCacheSave(targetId, updated)
        return updated
      })
    } catch (_err) { toast.error('Failed to update reaction') }
  }

  const handleTyping = async () => {
    if (!typingChannelRef.current) return
    if (!typingTimeoutRef.current) typingChannelRef.current.track({ user_id: session.user.id, username: myUsername }).catch(()=>{})
    else clearTimeout(typingTimeoutRef.current)
    
    typingTimeoutRef.current = setTimeout(() => {
      typingChannelRef.current?.untrack().catch(()=>{})
      typingTimeoutRef.current = null
    }, 3000)
  }

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault()
    const text = messageInputRef.current?.value.trim()
    if (!text) return

    messageInputRef.current.value = ''
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
      typingChannelRef.current?.untrack().catch(()=>{})
    }

    try {
      // 🛡️ SKIBIDI E2EE ARCHITECTURE: Encrypt Output Payload
      const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
      let contentToSave = text;
      
      if (sharedKey) {
        const encrypted = await encryptWithAesGcm(sharedKey, text);
        contentToSave = JSON.stringify(encrypted);
      }

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, [field]: targetId, reply_to_message_id: replyingTo?.id || null }])
        .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
        .single()
        
      if (insertError) throw insertError

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKey);

      setMessages(prev => {
        if (prev.some(msg => msg.id === decryptedMsg.id)) return prev;
        const updated = [...prev, decryptedMsg];
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, updated);
        return updated;
      })

      setReplyingTo(null)
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
    } catch (_err) {
      toast.error('Failed to send message.')
      if (messageInputRef.current) messageInputRef.current.value = text
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsUploading(true)
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 }
      toast('Optimizing image...', { icon: '🪄', id: 'compress-toast' })
      const compressedFile = await imageCompression(file, options)
      toast.dismiss('compress-toast')

      const fileExt = file.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const filePath = `${session.user.id}/${fileName}`
      
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, compressedFile)
      if (uploadError) {
        console.error("Storage Error:", uploadError)
        throw uploadError
      }
      
      const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath)
      
      const field = view === 'server' ? 'channel_id' : 'dm_room_id'
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
      if (!targetId) return toast.error('Select a channel or DM before sending images.')
      
      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: '', image_url: publicUrl, [field]: targetId }])
        .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
        .single()
        
      if (insertError) {
        console.error("Database Insert Error:", insertError)
        throw insertError
      }

      setMessages(prev => {
        if (prev.some(msg => msg.id === newMsg.id)) return prev;
        const updated = [...prev, newMsg];
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, updated);
        return updated;
      })

      cacheThumbnail(targetId || 'global', publicUrl)
      toast.success('Image optimized and uploaded')
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
    } catch (_err) {
      toast.error('Failed to upload image') 
    } finally { 
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = '' 
    }
  }

  const handleUpdateMessage = useCallback(async (e, id) => {
    e.preventDefault()
    if (!editContent.trim()) return
    try {
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;
      const sharedKey = await getSharedKeyForTarget(targetId, view === 'home');
      let contentToSave = editContent.trim();
      
      if (sharedKey) {
        const encrypted = await encryptWithAesGcm(sharedKey, contentToSave);
        contentToSave = JSON.stringify(encrypted);
      }

      await supabase.from('messages').update({ content: contentToSave }).eq('id', id)
      setEditingMessageId(null)
      toast.success("Message updated")
    } catch (_err) { toast.error("Failed to update message") }
  }, [editContent, activeChannel, activeDm, view, getSharedKeyForTarget])

  const executeInlineDelete = useCallback(async (message, mode) => {
    try {
      if (mode === 'everyone') {
        const { error: deleteError } = await supabase.from('messages').update({ is_deleted: true, content: '', image_url: null }).eq('id', message.id)
        if (deleteError) throw deleteError
        toast.success("Message unsent")
      } else {
        setLocalDeletedMessages(prev => [...prev, message.id])
        toast.success("Message hidden for you")
      }
    } catch (_err) { toast.error("Failed to delete message") }
    finally { 
      setInlineDeleteMessageId(null)
      setInlineDeleteStep('options')
    }
  }, [])

  const validMessages = Array.from(new Map(messages.filter(m => m && m.id != null).map(item => [item.id, item])).values())
  const visibleMessages = validMessages.filter(m => !localDeletedMessages.includes(m.id))
  
  const searchResults = searchQuery ? validMessages.filter(m => !m.is_deleted && (m.content?.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase()))) : []
  
  // ⚡ Bolt Optimization: Converted O(N) array .includes() lookups to O(1) Set .has() lookups inside loops.
  // Reduces time complexity from O(N * M) to O(N) during heavy render cycles, saving massive computation overhead.
  const restrictedUsersSet = useMemo(() => new Set(restrictedUsers), [restrictedUsers]);
  const onlineUsersSet = useMemo(() => new Set(onlineUsers), [onlineUsers]);
  const blockedUsersSet = useMemo(() => new Set(blockedUsers), [blockedUsers]);

  // ⚡ Bolt Optimization: Memoized expensive array filtering computations.
  // Prevents the app from recalculating large friends lists on every single React component re-render.
  const allFriends = useMemo(() => dms.filter(dm => !restrictedUsersSet.has(dm.profiles.id)), [dms, restrictedUsersSet]);
  const onlineFriends = useMemo(() => allFriends.filter(dm => onlineUsersSet.has(dm.profiles.id)), [allFriends, onlineUsersSet]);

  const isBlocked = activeDm && blockedUsersSet.has(activeDm.profiles.id)
  const isChatActive = (view === 'server' && activeChannel) || (view === 'home' && activeDm)

  const quickSwitcherResults = quickSwitcherQuery ? allFriends.filter(dm => dm.profiles.username.toLowerCase().includes(quickSwitcherQuery.toLowerCase())) : allFriends
  
  const currentThemeHex = (activeDm?.dm_rooms?.theme_color || '#6366f1')
  const currentWallpaper = activeDm?.dm_rooms?.wallpaper || 'default'
  const wallpaperCSS = WALLPAPERS.find(w => w.id === currentWallpaper)?.css || 'none'

  const scopedChatStyle = isChatActive ? { 
    '--theme-base': currentThemeHex,
    '--theme-10': currentThemeHex + '1a',
    '--theme-20': currentThemeHex + '33',
    '--theme-50': currentThemeHex + '80',
  } : {
    '--theme-base': '#6366f1',
    '--theme-10': '#6366f11a',
    '--theme-20': '#6366f133',
    '--theme-50': '#6366f180',
  }

  return (
    <div className="flex h-screen w-screen bg-[var(--bg-base)] text-[var(--text-main)] overflow-hidden font-sans selection:bg-[var(--theme-50)] relative z-0">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      {callActive && (
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      )}

      {callActive && !callMinimized && (
        <div className="fixed inset-0 z-[100] bg-[var(--bg-base)]/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-fade-in">
          
          <div className="absolute top-6 right-6 flex gap-4">
            <button onClick={() => setCallMinimized(true)} className="text-gray-400 hover:text-[var(--text-main)] bg-white/5 p-3 rounded-full border border-white/10 transition-colors cursor-pointer shadow-lg hover:bg-white/10"><Minimize2 size={20}/></button>
          </div>

          <div className="relative w-full max-w-sm flex flex-col items-center justify-center mb-8">
            <div className="relative w-40 h-40 rounded-full shadow-[0_0_100px_var(--theme-20)] flex items-center justify-center">
              {callDirection === 'connected' && <div className="absolute inset-0 rounded-full border-4 border-[var(--theme-base)] animate-ping opacity-30"></div>}
              <StatusAvatar url={remoteCaller?.avatar_url} username={remoteCaller?.username} showStatus={false} className="w-32 h-32 rounded-full bg-[var(--bg-surface)] border-2 border-white/10 relative z-10" />
            </div>
            <h2 className="text-4xl font-bold text-[var(--text-main)] mt-8 mb-2 tracking-tight">{remoteCaller?.username}</h2>
            <p className="text-[var(--theme-base)] font-bold text-base tracking-widest uppercase">
              {callDirection === 'incoming' ? 'Incoming Call...' : callDirection === 'outgoing' ? 'Ringing...' : 'Connected'}
            </p>
          </div>

          <div className="flex gap-4 p-3 bg-white/5 border border-white/10 rounded-full backdrop-blur-3xl shadow-2xl mt-12">
            <button onClick={toggleMic} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
              {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            
            <button onClick={() => toast('Video calls are currently in development!', { icon: '🚧' })} className="w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer bg-white/5 text-gray-500 opacity-50">
              <VideoOff size={24} />
            </button>

            <button onClick={toggleNoiseCancellation} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${ncEnabled ? 'bg-[var(--theme-base)] text-white shadow-lg shadow-[var(--theme-50)]' : 'bg-white/5 text-gray-400'}`} title="Hardware Noise Cancellation">
              <Activity size={24} />
            </button>
            
            <div className="w-[1px] h-10 bg-white/10 mx-1 my-auto"></div>

            {callDirection === 'incoming' ? (
              <button onClick={acceptCall} className="w-14 h-14 rounded-full flex items-center justify-center bg-green-500 hover:bg-green-600 text-white transition-all shadow-lg shadow-green-500/30 cursor-pointer animate-pulse">
                <Phone size={24} />
              </button>
            ) : (
              <button onClick={endCallNetwork} className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg shadow-red-500/30 cursor-pointer">
                <PhoneOff size={24} />
              </button>
            )}
          </div>
        </div>
      )}

      <Toaster position="top-center" toastOptions={{ style: { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' } }} />
      
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <nav className="flex flex-col h-full w-20 bg-[var(--bg-base)] border-r border-[var(--border-subtle)] py-4 items-center shrink-0 relative z-20">
          <div className="mb-6 group">
            <button onClick={handleHomeClick} className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${view === 'home' || view === 'notifications' ? 'text-[var(--text-main)] shadow-lg' : 'bg-[var(--bg-surface)] text-indigo-500 hover:bg-white/10'}`} style={view === 'home' || view === 'notifications' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}}>
              <Home size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="w-8 h-[2px] bg-[var(--border-subtle)] my-2 rounded-full shrink-0"></div>
          <div className="flex flex-col gap-4 items-center flex-1 overflow-y-auto custom-scrollbar w-full pt-2 pb-4 opacity-50 cursor-not-allowed">
            {servers.map((s, i) => (
              <button key={`server-${s.id || i}`} className={`sidebar-icon group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none relative`}>
                <span className="font-headline font-bold text-lg">{s.name[0].toUpperCase()}</span>
              </button>
            ))}
          </div>
          
          <div className="mt-auto flex flex-col gap-4 items-center pt-4 border-t border-[var(--border-subtle)] w-full shrink-0">
            <button onClick={() => setServerAction(serverAction === 'create' ? null : 'create')} className={`sidebar-icon group cursor-pointer transition-all ${serverAction === 'create' ? 'bg-indigo-500 text-[var(--text-main)] rounded-xl' : 'hover:bg-indigo-500 hover:text-[var(--text-main)] hover:rounded-xl text-gray-400'}`} title="Create Server">
              <Plus size={24} aria-hidden="true" />
            </button>
            <button onClick={() => setServerAction(serverAction === 'join' ? null : 'join')} className={`sidebar-icon group cursor-pointer transition-all ${serverAction === 'join' ? 'bg-green-500 text-[var(--text-main)] rounded-xl' : 'hover:bg-green-500 hover:text-[var(--text-main)] hover:rounded-xl text-gray-400'}`} title="Join Server">
              <Compass size={24} aria-hidden="true" />
            </button>
          </div>
        </nav>

        {serverAction && (
          <ServerActionPopout session={session} action={serverAction} onClose={() => setServerAction(null)} />
        )}

        <aside className="w-72 h-full bg-[var(--bg-surface)] flex flex-col border-r border-[var(--border-subtle)] shrink-0 z-10 shadow-xl relative" style={scopedChatStyle}>
          <header className="h-14 md:h-16 px-6 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)]/80 backdrop-blur-xl">
            <h2 className="font-headline font-bold text-[var(--text-main)] tracking-tight truncate">MESSAPP</h2>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8 px-4">
            {view === 'home' || view === 'notifications' ? (
              <div className="space-y-6">
                <button onClick={() => { setShowQuickSwitcher(true); setMobileMenuOpen(false); }} className="w-full bg-[var(--bg-element)] ghost-border text-[var(--text-main)] font-bold py-3.5 px-6 rounded-xl hover:bg-[var(--border-subtle)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none">
                  <Search size={18} aria-hidden="true" /> Find or Start
                </button>
                
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 block px-2">Direct Messages</span>
                  <div className="space-y-1">
                    {dms.map((dm, i) => {
                      const isActive = activeDm?.dm_room_id === dm.dm_room_id && view === 'home';
                      const dmColor = dm.dm_rooms?.theme_color || '#6366f1';
                      const isOnline = onlineUsersSet.has(dm.profiles.id);
                      return (
                        <button key={`dm-list-${dm.dm_room_id || i}`} onClick={() => { setView('home'); selectDm(dm); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'bg-[var(--bg-element)] border-[var(--border-subtle)] shadow-inner' : 'hover:bg-[var(--bg-base)] text-gray-400 hover:text-[var(--text-main)] border-transparent'}`}>
                          <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={isOnline} className="w-8 h-8" />
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium truncate transition-colors" style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                          </div>
                        </button>
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

          {showProfilePopout && (
            <div ref={popoutRef} className="absolute bottom-16 left-3 right-3 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden z-50 animate-fade-in flex flex-col">
              <div className="h-20 bg-[var(--bg-element)] shrink-0 relative" style={{ background: myBanner || 'linear-gradient(to right, #4f46e5, #9333ea)' }}>
              </div>
              <div className="px-4 pb-4">
                <div className="flex justify-between items-start">
                  <div className="relative -mt-10 mb-2">
                     <StatusAvatar url={myAvatar} username={myUsername} isOnline={true} className="w-[72px] h-[72px] bg-[var(--bg-surface)] rounded-full" />
                  </div>
                </div>
                
                <div className="bg-[var(--bg-element)] p-3 rounded-xl mb-3 shadow-inner">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-[var(--text-main)] text-lg leading-tight truncate">{myUsername}</h3>
                    {myPronouns && <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shrink-0">{myPronouns}</span>}
                  </div>
                  <p className="text-xs text-gray-400 font-mono">{myTag}</p>
                  {myBio && <div className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-300 line-clamp-3">{myBio}</div>}
                </div>

                <div className="space-y-1">
                  <button onClick={() => { setShowProfilePopout(false); setSettingsModalConfig({ isOpen: true, tab: 'account' }) }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--border-subtle)] transition-colors cursor-pointer text-gray-300 hover:text-[var(--text-main)]">
                    <Edit3 size={16} /> <span className="text-sm font-medium">Edit Profile</span>
                  </button>
                  <div className="h-[1px] bg-[var(--border-subtle)] my-2"></div>
                  <button onClick={() => { navigator.clipboard.writeText(myTag); toast.success('ID Copied!'); setShowProfilePopout(false); }} className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--border-subtle)] transition-colors cursor-pointer text-gray-300 hover:text-[var(--text-main)]">
                    <div className="flex items-center gap-3"><Copy size={16} /> <span className="text-sm font-medium">Copy User ID</span></div>
                  </button>
                  <button onClick={() => { supabase.auth.signOut(); setShowProfilePopout(false); }} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer text-red-400/80">
                    <LogOut size={16} /> <span className="text-sm font-medium">Log Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
            <button onClick={() => setShowProfilePopout(!showProfilePopout)} className="flex items-center gap-3 min-w-0 p-1.5 hover:bg-[var(--bg-surface)] rounded-xl transition-colors text-left group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] flex-1 pr-2">
              <StatusAvatar url={myAvatar} username={myUsername} isOnline={true} className="w-9 h-9" />
              <div className="flex flex-col truncate">
                <span className="text-[13px] font-bold text-[var(--text-main)] truncate group-hover:text-[var(--color-primary)] transition-colors">{myUsername}</span>
                <span className="text-[10px] text-gray-500 truncate">Online</span>
              </div>
            </button>
            
            <button onClick={() => setSettingsModalConfig({ isOpen: true, tab: 'appearance' })} className="p-2 text-gray-400 hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-surface)] transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] cursor-pointer" aria-label="Application Settings" title="App Settings">
              <Settings size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>

      <main className="flex-1 flex flex-col min-w-0 relative bg-[var(--bg-base)]" style={scopedChatStyle}>
        <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)] shrink-0 z-30 shadow-md">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-gray-400 hover:text-[var(--text-main)] p-2 -ml-2 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer">
              <Menu size={32} />
            </button>
            {view === 'home' && !activeDm ? (
              <div className="flex items-center gap-3 md:gap-6 animate-fade-in w-full overflow-x-auto custom-scrollbar pb-1 -mb-1">
                <div className="flex items-center gap-2 text-[var(--text-main)] font-bold shrink-0">
                  <Users size={24} className="text-gray-400 hidden sm:block" />
                  <span className="hidden sm:inline text-base">Friends</span>
                </div>
                <div className="w-[1px] h-6 bg-[var(--border-subtle)] hidden sm:block shrink-0"></div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setHomeTab('online')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer ${homeTab === 'online' ? 'bg-[var(--bg-element)] text-[var(--text-main)] ghost-border' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>Online</button>
                  <button onClick={() => setHomeTab('all')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer ${homeTab === 'all' ? 'bg-[var(--bg-element)] text-[var(--text-main)] ghost-border' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>All</button>
                  <button onClick={() => setHomeTab('pending')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] outline-none cursor-pointer flex items-center gap-2 ${homeTab === 'pending' ? 'bg-[var(--bg-element)] text-[var(--text-main)] ghost-border' : 'text-gray-400 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-transparent'}`}>
                    Pending {friendRequests.length > 0 && <span className="bg-red-500 text-[var(--text-main)] text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-bold">{friendRequests.length}</span>}
                  </button>
                </div>
                
                <button 
                  onClick={() => { setHomeTab('add_friend'); selectDm(null); }} 
                  className={`ml-auto px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer hover:brightness-110 shrink-0 ${homeTab === 'add_friend' ? 'text-[var(--text-main)] shadow-lg' : 'bg-[var(--bg-element)] text-indigo-400 hover:bg-[var(--bg-surface)]'}`} 
                  style={homeTab === 'add_friend' ? { backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' } : {}}
                >
                  <UserPlus size={20} /> <span className="hidden sm:inline">Add Friend</span>
                </button>
              </div>
            ) : view === 'home' && activeDm ? (
              <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-dm-${activeDm.dm_room_id}`}>
                <span className="text-xl text-gray-500 font-light shrink-0">@</span><h2 className="font-headline font-bold text-[var(--text-main)] text-lg tracking-tight truncate">{activeDm.profiles.username}</h2>
              </div>
            ) : view === 'server' && activeChannel ? (
              <div className="flex items-center gap-2 md:gap-3 min-w-0 animate-fade-in" key={`header-chan-${activeChannel.id}`}>
                <Hash size={20} className="text-gray-500 shrink-0" aria-hidden="true" />
                <h2 className="font-headline font-bold text-[var(--text-main)] text-lg tracking-tight truncate">{activeChannel.name}</h2>
              </div>
            ) : (
              <h2 className="font-headline font-bold text-transparent bg-clip-text text-xl tracking-tight shrink-0 truncate animate-fade-in" style={{ backgroundImage: 'linear-gradient(to right, #6366f1, #818cf8)' }} key="header-dash">MESSY APPY</h2>
            )}
          </div>
          
          <div className="flex items-center gap-1 md:gap-2 shrink-0 ml-2 md:ml-4">
            {isChatActive && (
              <>
                <button onClick={() => startCall()} className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]"><Phone size={20} aria-hidden="true" /></button>
                <button onClick={() => toast('Video calls are currently in development!', { icon: '🚧' })} className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]"><Video size={20} aria-hidden="true" /></button>
                <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1"></div>
                <button onClick={() => toggleRightSidebar('search')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${rightTab === 'search' && showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`}><Search size={20} aria-hidden="true" /></button>
                <button onClick={() => toggleRightSidebar('info')} className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer ${rightTab === 'info' && showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`}><Info size={20} aria-hidden="true" /></button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10 relative" key={view + (activeChannel?.id || activeDm?.dm_room_id || '')}>
            
            {isChatActive && currentWallpaper !== 'default' && (
              <div className="absolute inset-0 pointer-events-none z-0 opacity-20" style={{ backgroundImage: wallpaperCSS, backgroundSize: currentWallpaper === 'doodles' ? '400px' : 'cover', backgroundPosition: 'center' }}/>
            )}

            {view === 'home' && !activeDm ? (
              <div className="flex-1 flex overflow-hidden bg-[var(--bg-base)]">
                
                <div className="flex-1 flex flex-col overflow-hidden">
                  {homeTab === 'add_friend' ? (
                    <AddFriendView session={session} />
                  ) : (
                    <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
                      <div className="bg-[var(--bg-surface)] ghost-border rounded-xl flex items-center px-4 py-3 mb-6 shadow-inner focus-within:border-indigo-500 transition-colors">
                        <input id="dm-search-input" type="text" placeholder="Search for a conversation..." className="bg-transparent border-none outline-none text-[var(--text-main)] text-sm w-full placeholder-gray-500" />
                        <Search size={18} className="text-gray-500 ml-2" />
                      </div>
                      
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                        {homeTab === 'online' && `Online — ${onlineFriends.length}`}
                        {homeTab === 'all' && `All Friends — ${allFriends.length}`}
                        {homeTab === 'pending' && `Pending — ${friendRequests.length}`}
                      </div>

                      <div className="space-y-2">
                        {homeTab === 'pending' && friendRequests.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 opacity-50"><Bell size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">No pending friend requests.</p></div>
                        )}
                        {homeTab === 'pending' && friendRequests.map((req, i) => (
                          <div key={req.id ? `req-${req.id}` : `fallback-req-${i}`} className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface)] rounded-xl group border-t border-transparent hover:border-[var(--bg-surface)] transition-all">
                            <div className="flex items-center gap-4">
                              <StatusAvatar url={req.profiles?.avatar_url} username={req.profiles?.username} showStatus={false} className="w-10 h-10" />
                              <div><div className="font-bold text-[var(--text-main)] flex items-center gap-2">{req.profiles?.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{req.profiles?.unique_tag}</span></div><div className="text-xs text-gray-400">Incoming Friend Request</div></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleAcceptRequest(req)} className="p-2 sm:p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-green-500 hover:text-[var(--text-main)] transition-colors"><Check size={18} /></button>
                              <button onClick={() => handleDeclineRequest(req.id)} className="p-2 sm:p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-red-500 hover:text-[var(--text-main)] transition-colors"><X size={18} /></button>
                            </div>
                          </div>
                        ))}

                        {(homeTab === 'online' || homeTab === 'all') && (homeTab === 'all' ? allFriends : onlineFriends).length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 opacity-50"><Users size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">It's quiet in here.</p></div>
                        )}
                        {(homeTab === 'online' || homeTab === 'all') && (homeTab === 'all' ? allFriends : onlineFriends).map((dm, i) => (
                          <div key={dm.dm_room_id ? `dm-list-${dm.dm_room_id}` : `fallback-dm-list-${i}`} className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface)] rounded-xl group border-t border-transparent hover:border-[var(--bg-surface)] cursor-pointer transition-all" onClick={() => selectDm(dm)}>
                            <div className="flex items-center gap-4">
                              <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={onlineUsersSet.has(dm.profiles.id)} className="w-10 h-10" />
                              <div><div className="font-bold text-[var(--text-main)] flex items-center gap-2">{dm.profiles.username} <span className="hidden group-hover:inline text-xs text-gray-500 font-normal">{dm.profiles.unique_tag}</span></div><div className="text-xs text-gray-400">{onlineUsersSet.has(dm.profiles.id) ? 'Online' : 'Offline'}</div></div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-2.5 rounded-full bg-[var(--bg-surface)] ghost-border hover:bg-[var(--bg-element)] text-gray-300 transition-colors" onClick={(e) => { e.stopPropagation(); selectDm(dm); }}><MessageSquare size={18} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-80 border-l border-[var(--border-subtle)] hidden xl:flex flex-col bg-[var(--bg-base)] shrink-0" key="active-now-panel">
                  <div className="p-6 pb-4 shrink-0">
                    <h2 className="text-lg font-bold text-[var(--text-main)] font-display">Active Now</h2>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-4 pb-6">
                    {onlineFriends.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500 border border-dashed border-[var(--border-subtle)] rounded-2xl">It's quiet for now...</div>
                    ) : (
                      onlineFriends.map((dm, i) => (
                        <div key={dm.dm_room_id ? `dm-act-${dm.dm_room_id}` : `fallback-dm-act-${i}`} className="p-4 bg-[var(--bg-surface)] rounded-xl ghost-border shadow-md cursor-pointer hover:border-indigo-500 transition-all" onClick={() => selectDm(dm)}>
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
                  ref={scrollContainerRef} 
                  onScroll={handleScroll}
                >
                  {isLoadingMore && (
                    <div className="flex justify-center py-4 absolute top-0 left-0 right-0 z-50">
                      <Loader2 className="animate-spin text-[var(--theme-base)]" size={24} />
                    </div>
                  )}

                  {visibleMessages.length === 0 && (activeChannel || activeDm) && !isLoadingMore && (
                    <div className="flex flex-col justify-end h-full min-h-[300px] max-w-2xl pb-10">
                      <h3 className="font-headline text-3xl font-bold tracking-tight mb-2 text-[var(--text-main)]">Welcome to {view === 'home' ? 'the beginning' : `#${activeChannel?.name}`}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">Your digital workspace is clear. Connect with your team or explore new horizons.</p>
                    </div>
                  )}

                  {visibleMessages.map((m, index) => {
                    const uniqueKey = m.id ? `msg-${m.id}` : `fallback-${index}-${crypto.randomUUID()}`;
                    const isMessageBlocked = blockedUsersSet.has(m.profile_id);
                    if (isMessageBlocked) return (
                      <div key={uniqueKey} className="text-center my-4"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-[var(--bg-surface)] px-4 py-1.5 rounded-full ghost-border shadow-sm">Message Hidden (Blocked User)</span></div>
                    )

                    const showHeader = index === 0 || visibleMessages[index - 1].profile_id !== m.profile_id || new Date(m.created_at) - new Date(visibleMessages[index - 1].created_at) > 300000;
                    const isDM = view === 'home';
                    const isMe = m.profile_id === session.user.id;
                    const alignRight = isDM && isMe;
                    const isEditing = editingMessageId === m.id;
                    const isHighlighted = highlightedMessageId === m.id;
                    
                    const repliedMsg = m.reply_to_message_id ? validMessages.find(msg => msg.id === m.reply_to_message_id) : null;
                    
                    return (
                      <MemoizedMessage 
                        key={uniqueKey}
                        m={m}
                        isMe={isMe}
                        showHeader={showHeader}
                        alignRight={alignRight}
                        isHighlighted={isHighlighted}
                        currentUserId={session.user.id}
                        isEditing={isEditing}
                        editContent={editContent}
                        setEditContent={setEditContent}
                        handleUpdateMessage={handleUpdateMessage}
                        setEditingMessageId={setEditingMessageId}
                        inlineDeleteMessageId={inlineDeleteMessageId}
                        inlineDeleteStep={inlineDeleteStep}
                        setInlineDeleteMessageId={setInlineDeleteMessageId}
                        setInlineDeleteStep={setInlineDeleteStep}
                        executeInlineDelete={executeInlineDelete}
                        toggleReaction={toggleReaction}
                        setReplyingTo={setReplyingTo}
                        repliedMsg={repliedMsg}
                        scrollToMessage={scrollToMessage}
                        setSelectedImage={setSelectedImage}
                      />
                    )
                  })}
                  <div ref={messagesEndRef} className="h-4" />
                </div>

                {isBlocked ? (
                  <div className="p-4 mx-4 md:mx-6 mb-4 md:mb-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl font-bold text-sm shadow-inner z-10 relative">
                    You cannot reply to a blocked conversation. Unblock the user to send messages.
                  </div>
                ) : (
                  <div className="p-4 md:p-6 pt-0 shrink-0 bg-transparent z-10 relative flex flex-col">
                    
                    {typingUsers.length > 0 && (
                      <div className="absolute -top-5 left-6 flex items-center gap-2 text-[11px] font-bold text-[var(--theme-base)] animate-fade-in pointer-events-none z-20">
                        <div className="flex items-center gap-1 px-1">
                          <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-1 h-1 bg-[var(--theme-base)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span>{typingUsers.length === 1 ? `${typingUsers[0].username} is typing...` : `${typingUsers.length} people are typing...`}</span>
                      </div>
                    )}

                    {callActive && callMinimized && (
                       <div className="mx-0 md:mx-2 mb-3 bg-[#111214]/90 backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl p-2.5 flex items-center justify-between shadow-2xl animate-fade-in">
                         <div className="flex items-center gap-3 px-2 min-w-0">
                           <div className="relative shrink-0">
                             <StatusAvatar url={remoteCaller?.avatar_url} username={remoteCaller?.username} showStatus={false} className="w-10 h-10 rounded-full" />
                             {callDirection === 'connected' && <div className="absolute inset-0 rounded-full ring-2 ring-green-500 animate-pulse"></div>}
                           </div>
                           <div className="flex flex-col truncate">
                             <span className="text-sm font-bold text-white truncate">{remoteCaller?.username}</span>
                             <span className={`text-[10px] uppercase tracking-widest font-bold ${callDirection === 'connected' ? 'text-green-400' : 'text-[var(--theme-base)]'}`}>
                               {callDirection === 'incoming' ? 'Incoming...' : callDirection === 'outgoing' ? 'Ringing...' : 'Active Call'}
                             </span>
                           </div>
                         </div>
                         <div className="flex items-center gap-1.5 md:gap-2 pr-1 shrink-0">
                           <button onClick={toggleMic} className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/20 text-red-500'}`}>
                             {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                           </button>
                           {callDirection === 'incoming' ? (
                             <button onClick={acceptCall} className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 h-8 md:h-10 rounded-full transition-all animate-pulse">Accept</button>
                           ) : (
                             <button onClick={endCallNetwork} className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all"><PhoneOff size={14}/></button>
                           )}
                           <div className="w-[1px] h-6 bg-white/10 mx-0.5"></div>
                           <button onClick={() => setCallMinimized(false)} className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-white bg-white/5 transition-colors cursor-pointer"><Maximize2 size={14}/></button>
                         </div>
                       </div>
                    )}

                    {replyingTo && (
                      <div className="bg-[var(--theme-20)] backdrop-blur-md border-l-4 border-[var(--theme-base)] px-4 py-2 mb-2 mx-2 rounded-r-xl flex items-center justify-between text-sm animate-fade-in shadow-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-[var(--theme-base)] whitespace-nowrap">Replying to {replyingTo.profiles?.username}</span>
                          <span className="truncate text-gray-300 max-w-[150px] md:max-w-[300px]">{replyingTo.content || 'Attachment'}</span>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-[var(--text-main)] ml-2 p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer shrink-0"><X size={14}/></button>
                      </div>
                    )}

                    <form onSubmit={handleSendMessage} className="bg-[var(--bg-surface)] rounded-2xl ghost-border flex items-end gap-1 md:gap-2 p-1.5 md:p-2 focus-within:border-[var(--theme-50)] shadow-inner transition-colors relative">
                      
                      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                      
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2.5 md:p-3 text-gray-500 hover:text-[var(--theme-base)] rounded-xl hover:bg-[var(--bg-base)] transition-colors shrink-0 disabled:opacity-50 cursor-pointer" title="Upload Image">
                        {isUploading ? <Loader2 className="animate-spin text-[var(--theme-base)]" size={20} /> : <ImagePlus size={20} aria-hidden="true" />}
                      </button>

                      <textarea 
                        ref={messageInputRef}
                        className="flex-1 bg-transparent border-none outline-none text-[var(--text-main)] resize-none py-2.5 md:py-3 custom-scrollbar text-[14px] md:text-[15px] font-body min-w-0 placeholder:text-gray-600" 
                        placeholder={`Message ${view === 'home' ? '@' + activeDm?.profiles?.username : '#' + activeChannel?.name}`} 
                        onChange={handleTyping} 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { 
                            e.preventDefault(); 
                            handleSendMessage(e); 
                          }
                        }} 
                        rows={1} 
                        style={{ minHeight: '44px', maxHeight: '200px' }} 
                      />
                      <button type="submit" disabled={isUploading} className="p-2.5 md:p-3 text-[var(--theme-base)] hover:text-[var(--theme-base)] rounded-xl hover:bg-[var(--theme-10)] transition-colors shrink-0 disabled:opacity-50 cursor-pointer">
                        <Send size={20} aria-hidden="true" />
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>

          {showRightSidebar && isChatActive && (
            <aside className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] md:relative md:w-80 md:max-w-none bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] flex flex-col shrink-0 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-right" style={scopedChatStyle}>

              {rightTab === 'info' && view === 'home' && activeDm && (
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
                            onClick={() => scrollToMessage(m)}
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
          )}
        </div>
      </main>

      {showQuickSwitcher && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-md animate-fade-in" onClick={() => setShowQuickSwitcher(false)}>
          <div className="bg-[var(--bg-surface)]/95 w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden animate-quick-switch" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center gap-4 bg-[var(--bg-base)]/50 border-b border-[var(--border-subtle)]">
              <Search size={24} className="text-indigo-400 shrink-0" />
              <input type="text" autoFocus placeholder="Where would you like to go?" value={quickSwitcherQuery} onChange={(e) => setQuickSwitcherQuery(e.target.value)} className="w-full bg-transparent text-[var(--text-main)] outline-none text-xl font-display placeholder-gray-500" />
              <div className="text-[10px] font-bold text-gray-500 bg-white/5 px-2 py-1 rounded-md border border-white/10 shrink-0 select-none">ESC</div>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto p-3 custom-scrollbar">
              {quickSwitcherQuery && quickSwitcherResults.length === 0 ? (
                 <div className="text-center py-12 flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl text-gray-600 mb-2">search_off</span>
                    <span className="text-gray-400 font-medium">No friends match that query.</span>
                 </div>
              ) : (
                <>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-2 mt-2">Previous Conversations</div>
                  {quickSwitcherResults.map((dm, idx) => (
                    <button 
                      key={dm.dm_room_id ? `qs-${dm.dm_room_id}` : `qs-fallback-${idx}`} 
                      onClick={() => { setView('home'); selectDm(dm); setShowQuickSwitcher(false); setQuickSwitcherQuery('') }} 
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group cursor-pointer border border-transparent ${idx === 0 ? 'bg-indigo-500/10 border-indigo-500/20' : 'hover:bg-[var(--bg-base)] hover:border-[var(--border-subtle)]'}`}
                    >
                      <div className="flex items-center gap-4">
                        <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} isOnline={onlineUsersSet.has(dm.profiles.id)} className="w-10 h-10" />
                        <div className="flex flex-col">
                          <span className={`font-bold text-[15px] transition-colors ${idx === 0 ? 'text-indigo-400' : 'text-[var(--text-main)] group-hover:text-indigo-400'}`}>{dm.profiles.username}</span>
                          <span className="text-[11px] text-gray-500 font-mono tracking-wide">{dm.profiles.unique_tag}</span>
                        </div>
                      </div>
                      <div className={`opacity-0 transition-opacity flex items-center gap-1 text-[10px] font-bold uppercase text-gray-500 ${idx === 0 ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                        Jump To <CornerDownLeft size={12} className="text-indigo-400 ml-1" />
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" style={scopedChatStyle}>
          <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6">
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">
              {confirmAction.type === 'block' && `Block ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unblock' && `Unblock ${confirmAction.profile.username}?`}
              {confirmAction.type === 'restrict' && `Restrict ${confirmAction.profile.username}?`}
              {confirmAction.type === 'unrestrict' && `Unrestrict ${confirmAction.profile.username}?`}
            </h3>
            <p className="text-gray-400 text-sm mb-8">
              {confirmAction.type === 'block' && "They won't be able to message you or see your online status."}
              {confirmAction.type === 'unblock' && "They will be able to message you again."}
              {confirmAction.type === 'restrict' && "We'll move the chat out of your main list."}
              {confirmAction.type === 'unrestrict' && "This chat will return to your main list."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-300 hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] transition-all focus-visible:ring-2 focus-visible:ring-white cursor-pointer">Cancel</button>
              <button onClick={executeConfirmAction} className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg focus-visible:ring-2 focus-visible:ring-white cursor-pointer ${confirmAction.type.includes('un') ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Lightbox Overlay Engine */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          {/* Header with Timestamp */}
          <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
            <div className="flex flex-col">
              <span className="text-white font-bold">{selectedImage.user}</span>
              <span className="text-gray-400 text-xs">{selectedImage.time}</span>
            </div>
            <button 
              className="text-white/50 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
            >
              <X size={24} />
            </button>
          </div>
          
          <img 
            src={selectedImage.url} 
            alt="Expanded view" 
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl cursor-default animate-slide-up"
            onClick={e => e.stopPropagation()} 
          />
          
          {/* Download Action (Forces local download, bypasses new tab) */}
          <button 
            className="absolute bottom-8 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold text-sm backdrop-blur-md transition-colors border border-white/10 flex items-center gap-2 cursor-pointer shadow-lg"
            onClick={(e) => { 
              e.stopPropagation();
              toast('Saving image...', { icon: '⬇️', id: 'save-toast' })
              fetch(selectedImage.url)
                .then(response => response.blob())
                .then(blob => {
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.style.display = 'none';
                  a.href = blobUrl;
                  a.download = `messapp_image_${crypto.randomUUID().substring(0, 8)}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(blobUrl);
                  toast.success('Image saved!', { id: 'save-toast' })
                })
                .catch(() => toast.error('Failed to download image', { id: 'save-toast' }));
            }}
          >
            <Download size={18} /> Save Image
          </button>
        </div>
      )}

      {settingsModalConfig.isOpen && <UserSettingsModal session={session} initialTab={settingsModalConfig.tab} onClose={() => setSettingsModalConfig({ isOpen: false, tab: 'account' })} />}
      {showServerSettings && <ServerSettingsModal session={session} activeServer={activeServer} handleUpdate={() => {}} handleDelete={() => {}} onClose={() => setShowServerSettings(false)} name={serverSettingsName} setName={setServerSettingsName} />}
      {showChannelModal && <ChannelCreationModal handleCreate={() => {}} onClose={() => setShowChannelModal(false)} name={newChannelName} setName={setNewChannelName} serverName={activeServer?.name} />}
      {showChannelSettings && <ChannelSettingsModal handleUpdate={() => {}} handleDelete={() => {}} onClose={() => setShowChannelSettings(false)} name={channelSettingsName} setName={setChannelSettingsName} />}
    </div>
  )
}
