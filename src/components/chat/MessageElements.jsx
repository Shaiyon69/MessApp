import React, { useState, useRef, useMemo, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CornerDownLeft, Ban, FileText, SmilePlus, Pen, Trash2, X, Check, Pin } from 'lucide-react'
import EmojiPicker from 'emoji-picker-react' 
import { safeHttpUrl, safeMediaUrl } from '../../lib/security'
import StatusAvatar from '../ui/StatusAvatar'

const trimUrlToken = (value) => value.replace(/[),.!?;:'"\]]+$/g, '')

const extractPreviewLinks = (content) => {
  if (!content || typeof content !== 'string') return []
  const matches = content.match(/https?:\/\/[^\s<>"`]+/g) || []
  return matches
    .map(raw => {
      const trimmed = trimUrlToken(raw)
      const url = safeHttpUrl(trimmed)
      if (!url) return null
      return { raw, url }
    })
    .filter(Boolean)
}

const uniquePreviewLinks = (links) => {
  const seen = new Set()
  return links
    .filter(link => {
      if (seen.has(link.url)) return false
      seen.add(link.url)
      return true
    })
    .slice(0, 3)
}

const stripPreviewLinks = (content, links) => {
  if (!links.length) return content
  return links
    .reduce((text, link) => text.split(link.raw).join(''), content)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const safeDownloadUrl = (value) => {
  const mediaUrl = safeMediaUrl(value, { allowDataImages: false })
  if (mediaUrl) return mediaUrl
  if (typeof value === 'string' && /^data:application\/octet-stream;base64,[a-z0-9+/=\s]+$/i.test(value.trim())) return value.trim()
  return ''
}

const resolveAttachmentUrl = (attachment) => {
  const value = attachment?.file_url || ''
  return attachment?.file_type?.startsWith('image/')
    ? safeMediaUrl(value) || ''
    : safeDownloadUrl(value)
}

const getYouTubeEmbedUrl = (value) => {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.replace(/^www\./, '')
    let videoId = null

    if (hostname === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0]
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v')
      if (parsed.pathname.startsWith('/shorts/')) videoId = parsed.pathname.split('/').filter(Boolean)[1]
      if (parsed.pathname.startsWith('/embed/')) videoId = parsed.pathname.split('/').filter(Boolean)[1]
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null
    return `https://www.youtube-nocookie.com/embed/${videoId}`
  } catch (_err) {
    return null
  }
}

export const LinkPreview = ({ url }) => {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const safeUrl = useMemo(() => safeHttpUrl(url), [url])
  const youtubeEmbedUrl = useMemo(() => safeUrl ? getYouTubeEmbedUrl(safeUrl) : null, [safeUrl])
  const fallbackHost = useMemo(() => {
    if (!safeUrl) return ''
    try {
      return new URL(safeUrl).hostname.replace(/^www\./, '')
    } catch (_err) {
      return safeUrl
    }
  }, [safeUrl])

  useEffect(() => {
    if (!safeUrl) {
      setLoading(false)
      return
    }

    if (youtubeEmbedUrl) {
      setPreview(null)
      setLoading(false)
      return
    }

    let active = true
    setPreview(null)
    setLoading(true)

    const fetchPreview = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(safeUrl)}`)
        const { data } = await res.json()
        if (active && data && data.title) setPreview(data)
      } catch (e) {
        console.error("Failed to fetch link preview", e)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchPreview()
    return () => {
      active = false
    }
  }, [safeUrl, youtubeEmbedUrl])

  if (!safeUrl) return null

  if (youtubeEmbedUrl) {
    return (
      <div className="block mt-2 w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden border border-current text-[var(--theme-base)] shadow-sm">
        <iframe src={youtubeEmbedUrl} title={fallbackHost || 'YouTube preview'} className="w-[240px] sm:w-[320px] md:w-96 aspect-video border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy"></iframe>
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block px-2 py-1 text-[11px] font-bold text-current hover:underline truncate">{fallbackHost || safeUrl}</a>
      </div>
    )
  }

  if (loading) {
    return (
      <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden border border-current text-[var(--theme-base)] shadow-sm no-underline">
        <div className="px-2 py-1">
          <div className="h-3 w-36 rounded bg-current/20 animate-pulse mb-2"></div>
          <div className="h-2 w-48 max-w-full rounded bg-current/10 animate-pulse"></div>
          <div className="text-[10px] text-current mt-2 uppercase tracking-widest font-bold truncate">{fallbackHost || safeUrl}</div>
        </div>
      </a>
    )
  }

  if (!preview) {
    return (
      <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden border border-current text-[var(--theme-base)] transition-colors shadow-sm cursor-pointer no-underline">
        <div className="px-2 py-1">
          <h4 className="text-[13px] font-bold text-current truncate mb-1">{fallbackHost || safeUrl}</h4>
          <p className="text-[11px] text-current/80 line-clamp-2 leading-relaxed break-words">{safeUrl}</p>
        </div>
      </a>
    )
  }

  return (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden border border-current text-[var(--theme-base)] transition-colors shadow-sm group cursor-pointer no-underline">
      {safeHttpUrl(preview.image?.url) && (
        <div className="w-full h-32 overflow-hidden border-b border-current">
          <img src={safeHttpUrl(preview.image.url)} alt="Preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" fetchPriority="low" />
        </div>
      )}
      <div className="px-2 py-1">
        <h4 className="text-[13px] font-bold text-current truncate mb-1">{preview.title}</h4>
        <p className="text-[11px] text-current/80 line-clamp-2 leading-relaxed">{preview.description}</p>
        <div className="text-[10px] text-current mt-2 uppercase tracking-widest font-bold flex items-center gap-1.5">
          {safeHttpUrl(preview.logo?.url) && <img src={safeHttpUrl(preview.logo.url)} className="w-3.5 h-3.5 rounded-sm" alt="Logo" />}
          <span className="truncate">{preview.publisher || fallbackHost}</span>
        </div>
      </div>
    </a>
  )
}

export const MemoizedMessage = React.memo(({ 
  m, isMe, showHeader, alignRight, isHighlighted, currentUserId,
  isEditing, editContent, setEditContent, handleUpdateMessage, setEditingMessageId,
  inlineDeleteMessageId, inlineDeleteStep, setInlineDeleteMessageId, setInlineDeleteStep, executeInlineDelete,
  toggleReaction, togglePinnedMessage, setReplyingTo, repliedMsg, scrollToMessage, setSelectedImage, presenceStatus
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showMobileActions, setShowMobileActions] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const touchTimer = useRef(null)
  const message = m
  const { previewLinks, renderedContent } = useMemo(() => {
    if (!m.content || m.is_deleted || typeof m.content !== 'string') {
      return { previewLinks: [], renderedContent: typeof m.content === 'string' ? m.content : '' }
    }
    const links = extractPreviewLinks(m.content)
    const previews = uniquePreviewLinks(links)
    const previewUrls = new Set(previews.map(link => link.url))
    return {
      previewLinks: previews,
      renderedContent: stripPreviewLinks(m.content, links.filter(link => previewUrls.has(link.url)))
    }
  }, [m.content, m.is_deleted])

  if (m.is_unreadable || (typeof m.content === 'string' && m.content.includes('[Encrypted Message]'))) {
    return null
  }

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

  const visibleContent = renderedContent ?? (typeof m.content === 'string' ? m.content : '')
  const isEmojiOnly = typeof visibleContent === 'string' && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(visibleContent.trim());
  const hasVisibleContent = typeof visibleContent === 'string' && visibleContent.trim() !== ''
  const hasAttachments = message.message_attachments && message.message_attachments.length > 0
  const bubbleStyle = {
    backgroundColor: isMe ? 'var(--theme-base)' : 'var(--chat-bg-element,var(--bg-element))',
    borderColor: isMe ? 'var(--theme-base)' : 'var(--chat-border,var(--border-subtle))',
    color: isMe ? '#ffffff' : 'var(--chat-text,var(--text-main))'
  }
  const attachmentBorderStyle = { borderColor: 'var(--theme-base)' }

  return (
    <div id={`message-${m.id}`} className={`flex gap-2 transition-all duration-300 ease-out transform ${showHeader ? 'mt-2.5 md:mt-3' : 'mt-0.5'} ${isHighlighted ? 'bg-[var(--theme-20)] p-2 -mx-2 rounded-xl shadow-[0_0_15px_var(--theme-20)] scale-[1.01] z-20' : ''} ${alignRight ? 'flex-row-reverse ml-6 sm:ml-12 md:ml-20' : 'mr-6 sm:mr-12 md:mr-20'}`} onMouseLeave={() => { setShowReactionPicker(false); setShowMobileActions(false); }}>
      
      {showHeader ? (
        <StatusAvatar url={m.profiles?.avatar_url} username={m.profiles?.username} status={presenceStatus} showStatus={Boolean(presenceStatus && presenceStatus !== 'offline')} className="h-9 w-9 mt-1 shadow-md ghost-border rounded-full shrink-0" />
      ) : (
        <div className={`w-8 shrink-0 flex ${alignRight ? 'justify-start' : 'justify-center'} items-center opacity-0 text-[10px] text-gray-500 font-medium select-none`}></div>
      )}
      
      <div className={`flex flex-col w-full min-w-0 ${alignRight ? 'items-end' : ''}`}>
        
        {showHeader && (
        <div className={`flex items-baseline gap-2 mb-1 ${alignRight ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[14px] md:text-[15px] font-bold tracking-tight ${isMe ? 'text-[var(--theme-base)]' : 'text-[var(--chat-text,var(--text-main))]'}`}>{m.profiles?.username}</span>
            <span className="text-[10px] text-gray-500 font-medium">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        
        {isEditing ? (
          <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1 w-full max-w-3xl">
            <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full bg-[var(--bg-surface)] text-[var(--text-main)] px-4 py-2.5 rounded-xl ghost-border outline-none shadow-inner text-sm focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${alignRight ? 'text-right' : ''}`} autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
            <span className={`text-[10px] text-gray-500 mt-1.5 block ${alignRight ? 'text-right' : ''}`}>Press Enter to save, Esc to cancel</span>
          </form>
        ) : (
          <div className={`flex items-start gap-1.5 max-w-full w-fit ${alignRight ? 'flex-row-reverse ml-auto' : 'mr-auto'} relative group/bubble`}>
            
            <div 
              className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'} max-w-[min(72vw,36rem)] sm:max-w-[min(68vw,38rem)] shrink-0 min-w-0 cursor-pointer md:cursor-default`}
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
                  {hasVisibleContent && isEmojiOnly && !hasAttachments ? (
                    <div className={`text-5xl md:text-6xl py-1 w-fit ${alignRight ? 'ml-auto text-right' : 'mr-auto text-left'} transition-transform active:scale-[0.95] md:active:scale-100 cursor-default select-none`} style={{ lineHeight: '1.2' }}>
                      {visibleContent.trim()}
                    </div>
                  ) : hasVisibleContent && (
                    <div className={`px-3 py-2 rounded-2xl max-w-full w-fit border text-left transition-all duration-300 ease-out transform active:scale-[0.98] md:active:scale-100 shadow-sm ${alignRight ? 'rounded-tr-md ml-auto' : 'rounded-tl-md mr-auto'}`} style={bubbleStyle}>
                      <div className="leading-relaxed text-current markdown-body whitespace-pre-wrap [&>p]:mb-0 [&>p:not(:last-child)]:mb-2" style={{ overflowWrap: 'break-word', wordBreak: 'normal', fontSize: 'var(--chat-message-font-size, 15px)' }}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ inline, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl my-2 ghost-border text-sm shadow-lg bg-[var(--bg-base)]" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                              ) : <code className="bg-[var(--surface-section)] text-[var(--theme-base)] px-1.5 py-0.5 rounded-md font-mono text-[12px] border border-[var(--border-subtle)]" {...props}>{children}</code>
                            },
                            a({href, ...props}) {
                              const safeHref = safeHttpUrl(href)
                              if (!safeHref) return <span {...props} />
                              return <a className="text-[var(--theme-base)] hover:underline underline-offset-2" target="_blank" rel="noreferrer" href={safeHref} {...props} />
                            },
                            img() { return null }
                          }}
                        >
                          {visibleContent}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {hasAttachments && (
                    <div className={`flex flex-col gap-1 ${hasVisibleContent ? 'mt-1' : ''} w-full ${alignRight ? 'items-end' : 'items-start'}`}>
                      {message.message_attachments.map((attachment) => {
                        const attachmentUrl = resolveAttachmentUrl(attachment, message)
                        return (
                        <div key={attachment.id || attachment.file_url || attachmentUrl} className="max-w-full text-[var(--theme-base)]">
                          {!attachmentUrl ? (
                            <div className="flex items-center gap-2 max-w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-section)] px-3 py-2 text-gray-500 shadow-sm">
                              <FileText size={18} className="shrink-0" />
                              <span className="text-sm truncate min-w-0">{attachment.file_name || 'Attachment unavailable'}</span>
                            </div>
                          ) : attachment.file_type?.startsWith('image/') ? (
                              <img
                                src={attachmentUrl}
                                alt={attachment.file_name || 'Attachment'}
                                className="w-auto max-w-[min(68vw,220px)] sm:max-w-[260px] md:max-w-[300px] max-h-[42vh] sm:max-h-[320px] rounded-2xl object-contain border"
                                style={attachmentBorderStyle}
                                loading="lazy"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedImage({ url: attachmentUrl, user: message.profiles?.username, time: exactTime })
                                }}
                              />
                          ) : (
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={attachment.file_name || true}
                              className="flex items-center gap-2 max-w-full rounded-xl border shadow-sm transition-all duration-300 ease-out transform px-2 py-1"
                              style={attachmentBorderStyle}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText size={18} className="shrink-0 text-blue-400" />
                              <span className="text-sm text-blue-400 underline truncate min-w-0">{attachment.file_name || 'Attachment'}</span>
                            </a>
                          )}
                        </div>
                      )})}
                    </div>
                  )}

                  {previewLinks?.map((link, i) => (
                    <div key={`link-prev-${m.id}-${i}`} className={`${visibleContent ? 'mt-1' : ''} ${alignRight ? 'flex justify-end' : 'flex justify-start'}`}>
                      <LinkPreview url={link.url} />
                    </div>
                  ))}

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
              <div className={`flex items-center gap-1 transition-all duration-300 ease-out transform shrink-0 absolute -top-10 ${alignRight ? 'right-0' : 'left-0'} md:relative md:top-auto md:right-auto md:left-auto premium-menu md:bg-transparent md:border-transparent md:shadow-none rounded-xl p-1.5 md:p-0 z-[60] md:z-auto ${showMobileActions || showReactionPicker || inlineDeleteMessageId === m.id ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none md:pointer-events-auto md:group-hover/bubble:opacity-100 scale-95 md:scale-100'}`}>
                
                {showReactionPicker && (
                  <div 
                    className={`premium-menu fixed bottom-20 left-1/2 -translate-x-1/2 sm:absolute sm:translate-x-0 ${alignRight ? 'sm:right-8' : 'sm:left-8'} sm:bottom-full sm:mb-2 z-[100] animate-fade-in rounded-xl overflow-hidden`}
                    onTouchStartCapture={() => { if (document.activeElement) document.activeElement.blur(); }}
                    onMouseDown={(e) => { e.preventDefault(); }}
                  >
                    <div className="fixed inset-0 z-0 cursor-pointer sm:hidden" onClick={(e) => { e.stopPropagation(); setShowReactionPicker(false); }}></div>
                    <div className="relative z-10 rounded-xl overflow-hidden">
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
                      onTouchStartCapture={() => { 
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
                    <button onClick={() => { togglePinnedMessage(m); setShowMobileActions(false); }} className={`p-1.5 bg-[var(--bg-surface)] md:bg-transparent md:hover:bg-[var(--border-subtle)] rounded-full transition-colors cursor-pointer ${m.is_pinned ? 'text-[var(--theme-base)]' : 'text-gray-500 hover:text-[var(--theme-base)]'}`} title={m.is_pinned ? 'Unpin' : 'Pin'}><Pin size={14} aria-hidden="true" /></button>
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
