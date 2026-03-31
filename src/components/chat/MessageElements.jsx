import React, { useState, useRef, useMemo, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CornerDownLeft, Ban, Download, FileText, SmilePlus, Pen, Trash2, X, Check } from 'lucide-react'
import EmojiPicker from 'emoji-picker-react' 

export const StatusAvatar = ({ url, username, isOnline, showStatus = true, className = "" }) => {
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
            <image href={url} width="100" height="100" preserveAspectRatio="xMidYMid slice" decoding="async" />
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

export const LinkPreview = ({ url }) => {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`)
        const { data } = await res.json()
        if (data && data.title) setPreview(data)
      } catch (e) {
        console.error("Failed to fetch link preview", e)
      } finally {
        setLoading(false)
      }
    }
    fetchPreview()
  }, [url])

  if (loading || !preview) return null

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2 w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden bg-[var(--bg-element)] border border-[var(--border-subtle)] hover:border-indigo-500 transition-colors shadow-sm group cursor-pointer no-underline">
      {preview.image?.url && (
        <div className="w-full h-32 bg-[#0d0f12] overflow-hidden border-b border-[var(--border-subtle)]">
          <img src={preview.image.url} alt="Preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" fetchPriority="low" />
        </div>
      )}
      <div className="p-3">
        <h4 className="text-[13px] font-bold text-[var(--text-main)] truncate mb-1">{preview.title}</h4>
        <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">{preview.description}</p>
        <div className="text-[10px] text-indigo-400 mt-2 uppercase tracking-widest font-bold flex items-center gap-1.5">
          {preview.logo?.url && <img src={preview.logo.url} className="w-3.5 h-3.5 rounded-sm" alt="Logo" />}
          <span className="truncate">{preview.publisher || new URL(url).hostname}</span>
        </div>
      </div>
    </a>
  )
}

export const MemoizedMessage = React.memo(({ 
  m, isMe, showHeader, alignRight, isHighlighted, currentUserId,
  isEditing, editContent, setEditContent, handleUpdateMessage, setEditingMessageId,
  inlineDeleteMessageId, inlineDeleteStep, setInlineDeleteMessageId, setInlineDeleteStep, executeInlineDelete,
  toggleReaction, setReplyingTo, repliedMsg, scrollToMessage, setSelectedImage
}) => {
  
  if (m.is_unreadable || (typeof m.content === 'string' && m.content.includes('[Encrypted Message]'))) {
    return null;
  }

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

  const extractedUrls = useMemo(() => {
    if (!m.content || m.is_deleted || typeof m.content !== 'string') return null;
    const urls = m.content.match(/https?:\/\/[^\s]+/g);
    return urls ? Array.from(new Set(urls)).slice(0, 3) : null;
  }, [m.content, m.is_deleted]);

  const isEmojiOnly = typeof m.content === 'string' && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(m.content.trim());

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
              className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'} max-w-[82vw] md:max-w-[65vw] shrink-0 min-w-0 cursor-pointer md:cursor-default`}
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
                  {typeof m.content === 'string' && m.content.trim() !== '' && (
                    isEmojiOnly ? (
                      <div className={`text-5xl md:text-6xl py-1 w-fit ${alignRight ? 'ml-auto text-right' : 'mr-auto text-left'} transition-transform active:scale-[0.95] md:active:scale-100 cursor-default select-none`} style={{ lineHeight: '1.2' }}>
                        {m.content.trim()}
                      </div>
                    ) : (
                      <div className={`px-3 py-2 md:px-4 md:py-2.5 rounded-[20px] border w-fit max-w-full ${alignRight ? 'rounded-tr-none bg-[var(--theme-10)] border-[var(--theme-20)] text-[var(--text-main)]' : 'rounded-tl-none bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-main)]'} shadow-sm backdrop-blur-md text-left transition-transform active:scale-[0.98] md:active:scale-100 break-words`}>
                        <div className="leading-relaxed markdown-body text-[14.5px] whitespace-pre-wrap [&>p]:mb-0 [&>p:not(:last-child)]:mb-3">
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
                    )
                  )}

                  {extractedUrls && extractedUrls.map((url, i) => (
                    <div key={`link-prev-${m.id}-${i}`} className={`mt-1 ${alignRight ? 'flex justify-end' : 'flex justify-start'}`}>
                      <LinkPreview url={url} />
                    </div>
                  ))}

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
                        decoding="async" 
                        fetchPriority="low"
                      />
                    </div>
                  )}

                  {m.file_url && (
                    <div 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (showMobileActions) {
                          setShowMobileActions(false);
                        } else {
                          const a = document.createElement('a');
                          a.href = m.file_url;
                          a.download = m.file_name || 'download';
                          document.body.appendChild(a);
                          a.click();
                        }
                      }}
                      className={`flex items-center gap-3 p-3 mt-1.5 w-fit min-w-[200px] max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl border ${alignRight ? 'border-[var(--theme-20)] bg-[var(--theme-10)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'} hover:opacity-90 transition-opacity shadow-sm cursor-pointer`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${alignRight ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'bg-[var(--bg-element)] text-[var(--text-main)]'}`}>
                        <FileText size={20} />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                        <span className={`font-bold text-sm truncate ${alignRight ? 'text-[var(--text-main)]' : 'text-[var(--text-main)]'}`}>{m.file_name || 'Attachment'}</span>
                        <span className="text-[10px] text-gray-500">{m.file_size || 'Unknown Size'}</span>
                      </div>
                      <button className={`p-1.5 rounded-md shrink-0 transition-colors ${alignRight ? 'hover:bg-[var(--theme-20)] text-[var(--theme-base)]' : 'hover:bg-[var(--bg-element)] text-gray-400 hover:text-[var(--text-main)]'}`}>
                        <Download size={16} />
                      </button>
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
              <div className={`flex items-center gap-1 transition-all duration-200 shrink-0 absolute -top-10 ${alignRight ? 'right-0' : 'left-0'} md:relative md:top-auto md:right-auto md:left-auto bg-[var(--bg-surface)] md:bg-transparent border border-[var(--border-subtle)] md:border-transparent shadow-2xl md:shadow-none rounded-xl p-1.5 md:p-0 z-[60] md:z-auto ${showMobileActions || showReactionPicker || inlineDeleteMessageId === m.id ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none md:pointer-events-auto md:group-hover/bubble:opacity-100 scale-95 md:scale-100'}`}>
                
                {showReactionPicker && (
                  <div 
                    className={`fixed bottom-20 left-1/2 -translate-x-1/2 sm:absolute sm:translate-x-0 ${alignRight ? 'sm:right-8' : 'sm:left-8'} sm:bottom-full sm:mb-2 z-[100] animate-fade-in shadow-2xl bg-[var(--bg-surface)] rounded-xl overflow-hidden border border-[var(--border-subtle)]`}
                    onTouchStartCapture={(e) => { if (document.activeElement) document.activeElement.blur(); }}
                    onMouseDown={(e) => { e.preventDefault(); }}
                  >
                    <div className="fixed inset-0 z-0 cursor-pointer sm:hidden" onClick={(e) => { e.stopPropagation(); setShowReactionPicker(false); }}></div>
                    <div className="relative z-10 border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-2xl bg-[var(--bg-surface)]">
                      <EmojiPicker 
                        theme={document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'} 
                        emojiStyle="native"
                        lazyLoadEmojis={true}
                        width={typeof window !== 'undefined' && window.innerWidth < 350 ? Math.min(window.innerWidth - 32, 280) : 300}
                        height={350}
                        searchDisabled={true}
                        autoFocusSearch={false}
                        previewConfig={{ showPreview: false }} 
                        onEmojiClick={(emojiData) => {
                          const hasReacted = groupedReactions[emojiData.emoji]?.some(r => r.profile_id === currentUserId);
                          toggleReaction(m.id, emojiData.emoji, hasReacted);
                          setShowReactionPicker(false);
                          setShowMobileActions(false);
                        }} 
                      />
                    </div>
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
                    <button 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        if (document.activeElement) document.activeElement.blur();
                        setShowReactionPicker(!showReactionPicker); 
                      }} 
                      onTouchStartCapture={(e) => { 
                        if (document.activeElement) document.activeElement.blur(); 
                      }}
                      onMouseDown={(e) => { e.preventDefault(); }}
                      className="p-1.5 text-gray-500 hover:text-yellow-400 bg-[var(--bg-surface)] md:bg-transparent md:hover:bg-[var(--border-subtle)] rounded-full transition-colors cursor-pointer" 
                      title="React"
                    >
                      <SmilePlus size={14} aria-hidden="true" />
                    </button>
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
