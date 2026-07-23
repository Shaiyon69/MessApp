/**
 * Renders message bodies, safe media, reactions, replies, delivery state, and
 * mobile action portals. Mutation state comes from useChatManager; temporary
 * signed media URLs must not be persisted or logged.
 */
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { createPortal } from 'react-dom'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CornerDownLeft, Ban, FileText, SmilePlus, Pen, Trash2, X, Check, Pin, Download, Clock3, CheckCheck, AlertCircle, RotateCcw, Plus } from 'lucide-react'
import { safeHttpUrl, safeMediaUrl } from '../../lib/security'
import { QUICK_REACTION_EMOJIS, REACTION_MENU_STATE, normalizeReactionEmoji, shouldCancelLongPress, shouldSuppressOriginClick, transitionReactionMenu } from '../../lib/reactions'
import ChatEmojiPicker from './ChatEmojiPicker'
import StatusAvatar from '../ui/StatusAvatar'
import { debug } from '../../lib/debug'

const QUICK_REACTION_COUNT = QUICK_REACTION_EMOJIS.length
const loadedMessageImageKeys = new Set()
const MAX_LOADED_MESSAGE_IMAGE_KEYS = 1000
const TOUCH_PORTAL_Z_INDEX = 2147483000
const TOUCH_ACTION_STYLE = { pointerEvents: 'auto', touchAction: 'manipulation' }
const ACTION_TOOLBAR_OWNER = Object.freeze({
  CLOSED: 'closed',
  DESKTOP_HOVER: 'desktop-hover',
  TOUCH_LONGPRESS: 'touch-longpress'
})

// One owner renders the action toolbar at a time. Responsive-mode browsers can
// report both hover and touch capability, so portal ownership cannot be inferred
// from CSS breakpoints alone.
const ActionToolbarHost = ({ owner, onBackdropPointerDown, children }) => owner === ACTION_TOOLBAR_OWNER.TOUCH_LONGPRESS
  ? createPortal(
      <div
        data-reaction-portal
        data-reaction-backdrop
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: TOUCH_PORTAL_Z_INDEX,
          pointerEvents: 'auto',
          touchAction: 'none'
        }}
        onPointerDown={onBackdropPointerDown}
        onTouchMove={(event) => event.preventDefault()}
        onWheel={(event) => event.preventDefault()}
      >
        {children}
      </div>,
      document.body,
      ACTION_TOOLBAR_OWNER.TOUCH_LONGPRESS
    )
  : <React.Fragment key={ACTION_TOOLBAR_OWNER.DESKTOP_HOVER}>{children}</React.Fragment>

const ReactionPickerPortal = ({ children }) => createPortal(children, document.body)

const normalizeQuickReactions = (value) => {
  const list = Array.isArray(value) ? value : []
  return [...list, ...QUICK_REACTION_EMOJIS]
    .map(item => normalizeReactionEmoji(typeof item === 'string' ? item : item?.emoji || item?.type || item?.reaction))
    .filter(Boolean)
    .filter((item, index, self) => self.indexOf(item) === index)
    .slice(0, QUICK_REACTION_COUNT)
}

const getQuickReactionStorageKey = (userId) => `messapp_quick_reactions_${userId || 'anon'}`

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
    .slice(0, 10)
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

const getAttachmentMediaType = (attachment) => String(attachment?.file_type || '').replace(/^encrypted:/i, '').toLowerCase()
const isImageAttachment = (attachment) => getAttachmentMediaType(attachment).startsWith('image/')
const isVideoAttachment = (attachment) => getAttachmentMediaType(attachment).startsWith('video/')

const formatAttachmentSize = (value) => {
  if (typeof value === 'string' && value.trim()) return value
  if (!Number.isFinite(value) || value <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const rememberLoadedMessageImage = (key) => {
  if (!key) return
  loadedMessageImageKeys.delete(key)
  loadedMessageImageKeys.add(key)
  while (loadedMessageImageKeys.size > MAX_LOADED_MESSAGE_IMAGE_KEYS) {
    loadedMessageImageKeys.delete(loadedMessageImageKeys.values().next().value)
  }
}

const MessageImage = ({ src, mediaKey, alt, className, style, blurWhileLoading, fill, onOpen }) => {
  const stableMediaKey = String(mediaKey || src)
  const [loaded, setLoaded] = useState(() => loadedMessageImageKeys.has(stableMediaKey))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(loadedMessageImageKeys.has(stableMediaKey))
    setFailed(false)
  }, [src, stableMediaKey])

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[var(--bg-element)] ${fill ? 'h-full w-full' : 'w-fit max-w-full'}`}>
      <img
        src={src}
        alt={alt || ''}
        className={`${className} transition-[filter,opacity] duration-300 ${failed ? 'opacity-0' : blurWhileLoading && !loaded ? 'scale-105 blur-xl opacity-70' : 'blur-0 opacity-100'}`}
        style={style}
        loading="eager"
        decoding="async"
        onLoad={() => {
          rememberLoadedMessageImage(stableMediaKey)
          setLoaded(true)
          setFailed(false)
        }}
        onError={() => setFailed(true)}
        onClick={onOpen}
      />
      {(!loaded || failed) && (
        <div
          className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.14),transparent_45%),linear-gradient(135deg,var(--bg-element-hover),var(--bg-element))] blur-md scale-110"
          aria-label="Image loading"
        />
      )}
    </div>
  )
}

const resolveAttachmentUrl = (attachment) => {
  const value = attachment?.file_url || ''
  return isImageAttachment(attachment)
    ? safeMediaUrl(value) || ''
    : safeDownloadUrl(value)
}

const getDeliveryStatus = (message, peerReadAt) => {
  if (message.__delivery_status === 'failed') return 'failed'
  if (message.__delivery_status === 'sending') return 'sending'
  if (message.seen_at || message.read_at) return 'seen'
  if (peerReadAt && message.created_at && new Date(peerReadAt) >= new Date(message.created_at)) return 'seen'
  return 'sent'
}

const deliveryStatusMeta = {
  sending: { label: 'Sending', icon: Clock3, className: 'text-gray-400' },
  sent: { label: 'Sent', icon: Check, className: 'text-gray-400' },
  seen: { label: 'Seen', icon: CheckCheck, className: 'text-[var(--theme-base)]' },
  failed: { label: 'Failed', icon: AlertCircle, className: 'text-red-400' }
}

const debugStack = () => new Error().stack?.split('\n').slice(2, 8).join('\n')

const logMenuDebug = (event, payload = {}) => {
  try {
    if (localStorage.getItem('messappDebugMenus') !== 'true') return
  } catch (_err) {
    return
  }
  console.debug('[MENU_DEBUG]', event, {
    componentPath: 'src/components/chat/MessageElements.jsx',
    ...payload,
    stack: debugStack()
  })
}

const describeTarget = (target) => {
  if (!target || target === window) return 'window'
  if (target === document) return 'document'
  const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target
  if (!element?.tagName) return 'unknown'
  const id = element.id ? `#${element.id}` : ''
  const classes = typeof element.className === 'string'
    ? `.${element.className.split(/\s+/).filter(Boolean).slice(0, 4).join('.')}`
    : ''
  return `${element.tagName.toLowerCase()}${id}${classes}`
}

const formatReceiptTime = (value) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const getSeenTimestamp = (message, peerReadAt) => {
  if (message.seen_at || message.read_at) return message.seen_at || message.read_at
  if (peerReadAt && message.created_at && new Date(peerReadAt) >= new Date(message.created_at)) return peerReadAt
  return null
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
        <div className="text-[10px] text-current mt-2 uppercase tracking-widest font-bold flex items-center gap-0.5">
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
  toggleReaction, togglePinnedMessage, setReplyingTo, repliedMsg, scrollToMessage, setSelectedImage, presenceStatus,
  peerReadAt, retryFailedMessage, showDeliveryStatus, messageActionMenuId, setMessageActionMenuId,
  setMessageActionMenuPosition, closeMessageInteraction
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showMoreReactions, setShowMoreReactions] = useState(false)
  const [isReactionSubmitting, setIsReactionSubmitting] = useState(false)
  const [reactionMenuState, setReactionMenuState] = useState(REACTION_MENU_STATE.CLOSED)
  const [reactionInputMode, setReactionInputMode] = useState(null)
  const [isDesktopHovered, setIsDesktopHovered] = useState(false)
  const [editingQuickReactions, setEditingQuickReactions] = useState(false)
  const [quickReactionSlot, setQuickReactionSlot] = useState(0)
  const [quickReactions, setQuickReactions] = useState(() => {
    try {
      return normalizeQuickReactions(JSON.parse(localStorage.getItem(getQuickReactionStorageKey(currentUserId)) || '[]'))
    } catch (_err) {
      return QUICK_REACTION_EMOJIS
    }
  })
  const [showInlineTime, setShowInlineTime] = useState(false)
  const [showReceiptDetails, setShowReceiptDetails] = useState(false)
  const touchTimer = useRef(null)
  const desktopHoverExitTimer = useRef(null)
  const lastReactionTouchRef = useRef(0)
  const lastReactionPickerTouchRef = useRef(0)
  const suppressBubbleClickUntilRef = useRef(0)
  const bubbleRef = useRef(null)
  const actionMenuRef = useRef(null)
  const reactionPopoverRef = useRef(null)
  const gestureRef = useRef(null)
  const longPressActivatedRef = useRef(false)
  const lastToolbarPointerUpRef = useRef(0)
  const [actionMenuPosition, setActionMenuPosition] = useState(null)
  const [reactionPopoverPosition, setReactionPopoverPosition] = useState(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const message = m
  const hasAttachments = message.message_attachments && message.message_attachments.length > 0
  const attachments = message.message_attachments || []
  const imageAttachments = attachments.filter(isImageAttachment)
  const mediaAttachments = attachments.filter(attachment => isImageAttachment(attachment) || isVideoAttachment(attachment))
  const hasImageAttachments = imageAttachments.length > 0
  const imageGallery = imageAttachments
    .map(attachment => ({
      url: resolveAttachmentUrl(attachment),
      name: attachment.file_name || 'Image'
    }))
    .filter(item => item.url)
  const isActionMenuOpen = messageActionMenuId === m.id
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

  const closeActionMenu = useCallback((reason, payload = {}) => {
    if (touchTimer.current) {
      clearTimeout(touchTimer.current)
      touchTimer.current = null
    }
    const pointerId = payload.pointerId ?? gestureRef.current?.pointerId
    if (bubbleRef.current?.hasPointerCapture && pointerId !== undefined) {
      try {
        if (bubbleRef.current.hasPointerCapture(pointerId)) bubbleRef.current.releasePointerCapture(pointerId)
      } catch (_err) {}
    }
    gestureRef.current = null
    longPressActivatedRef.current = false
    setSwipeOffset(0)
    if (messageActionMenuId === m.id) {
      logMenuDebug('menu closed', { reason, messageId: m.id, ...payload })
      closeMessageInteraction?.(reason, { messageId: m.id, ...payload })
      setMessageActionMenuId(null)
      setMessageActionMenuPosition?.(null)
    }
    setShowReactionPicker(false)
    setShowMoreReactions(false)
    setEditingQuickReactions(false)
    setActionMenuPosition(null)
    setReactionPopoverPosition(null)
    setShowReceiptDetails(false)
    setReactionInputMode(null)
    setReactionMenuState(current => transitionReactionMenu(current, 'CLOSE'))
    debug.debug('REACTION_MENU_CLOSE', { reason, messageId: m.id })
    debug.debug('REACTION_CLEANUP', { reason, messageId: m.id, pointerType: payload.pointerType })
    if (inlineDeleteMessageId === m.id) {
      setInlineDeleteMessageId(null)
      setInlineDeleteStep('options')
    }
  }, [closeMessageInteraction, inlineDeleteMessageId, m.id, messageActionMenuId, setInlineDeleteMessageId, setInlineDeleteStep, setMessageActionMenuId, setMessageActionMenuPosition])

  useEffect(() => {
    try {
      setQuickReactions(normalizeQuickReactions(JSON.parse(localStorage.getItem(getQuickReactionStorageKey(currentUserId)) || '[]')))
    } catch (_err) {
      setQuickReactions(QUICK_REACTION_EMOJIS)
    }
  }, [currentUserId])

  const saveQuickReaction = (emoji) => {
    setQuickReactions(current => {
      const next = normalizeQuickReactions(current.map((item, index) => index === quickReactionSlot ? normalizeReactionEmoji(emoji) : item))
      try {
        localStorage.setItem(getQuickReactionStorageKey(currentUserId), JSON.stringify(next))
      } catch (_err) {}
      return next
    })
    setEditingQuickReactions(false)
  }

  const captureBubbleAnchor = useCallback(() => {
    const rect = bubbleRef.current?.getBoundingClientRect?.()
    if (!rect) return null
    return {
      messageId: m.id,
      rect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      alignRight
    }
  }, [alignRight, m.id])

  const calculateActionMenuPositionFromAnchor = useCallback((anchor, menuSize = {}) => {
    const rect = anchor?.rect
    if (!rect) return null
    const isMobileViewport = window.innerWidth < 768
    const width = menuSize.width || (hasImageAttachments ? 40 : isMobileViewport ? (isMe ? 244 : 200) : 210)
    const height = menuSize.height || (isMobileViewport ? 52 : 44)
    const gap = 8
    const margin = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const anchorAlignRight = Boolean(anchor.alignRight)
    const preferredLeft = anchorAlignRight ? rect.left - width - gap : rect.right + gap
    const flippedLeft = anchorAlignRight ? rect.right + gap : rect.left - width - gap
    const hasPreferredSpace = preferredLeft >= margin && preferredLeft + width <= viewportWidth - margin
    const hasFlippedSpace = flippedLeft >= margin && flippedLeft + width <= viewportWidth - margin
    const useAbove = !hasPreferredSpace && !hasFlippedSpace
    const rawLeft = useAbove ? rect.left + ((rect.width - width) / 2) : hasPreferredSpace ? preferredLeft : flippedLeft
    const maxLeft = Math.max(margin, viewportWidth - width - margin)
    const left = Math.min(Math.max(rawLeft, margin), maxLeft)
    const preferredTop = useAbove ? rect.top - height - gap : rect.top + ((rect.height - height) / 2)
    const fallbackTop = rect.bottom + gap
    const rawTop = useAbove && preferredTop < margin ? fallbackTop : preferredTop
    const maxTop = Math.max(margin, viewportHeight - height - margin)
    const top = Math.min(Math.max(rawTop, margin), maxTop)
    return {
      messageId: anchor.messageId,
      left,
      top,
      alignRight: anchorAlignRight,
      placement: useAbove ? 'above' : hasPreferredSpace ? 'preferred' : 'flipped',
      rect: {
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    }
  }, [hasImageAttachments, isMe])

  const getReactionPopoverPosition = useCallback((expanded = showMoreReactions || editingQuickReactions) => {
    const rect = actionMenuRef.current?.getBoundingClientRect?.() || bubbleRef.current?.getBoundingClientRect?.()
    if (!rect) return null
    const margin = 8
    const width = Math.min(300, window.innerWidth - margin * 2)
    const height = expanded ? 410 : 48
    const rawLeft = rect.left + (rect.width - width) / 2
    const left = Math.min(Math.max(rawLeft, margin), window.innerWidth - width - margin)
    const aboveTop = rect.top - height - margin
    const belowTop = rect.bottom + margin
    const top = aboveTop >= margin ? aboveTop : Math.min(belowTop, window.innerHeight - height - margin)
    return { left, top: Math.max(margin, top), width }
  }, [editingQuickReactions, showMoreReactions])

  const updateReactionPopoverPosition = useCallback(() => {
    const nextPosition = getReactionPopoverPosition()
    if (nextPosition) setReactionPopoverPosition(nextPosition)
  }, [getReactionPopoverPosition])

  const openMobileActions = useCallback((event, reason = 'long_press') => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    suppressBubbleClickUntilRef.current = Date.now() + 500
    setShowInlineTime(false)
    setShowReceiptDetails(false)
    setInlineDeleteMessageId(null)
    setInlineDeleteStep('options')
    if (messageActionMenuId && messageActionMenuId !== m.id) {
      closeMessageInteraction?.(reason, { messageId: messageActionMenuId, nextMessageId: m.id, pointerId: event?.pointerId })
    }
    const nextAnchor = captureBubbleAnchor()
    if (!nextAnchor?.rect) return
    const nextPosition = calculateActionMenuPositionFromAnchor(nextAnchor)
    if (!nextPosition) return
    setReactionInputMode(event?.pointerType === 'touch' || event?.pointerType === 'pen' ? 'touch' : 'desktop')
    setActionMenuPosition(nextPosition)
    setMessageActionMenuPosition?.(nextPosition)
    setMessageActionMenuId(m.id)
    setReactionMenuState(current => transitionReactionMenu(current, 'OPEN_TOOLBAR'))
    // The quick strip is the touch toolbar; the full emoji grid remains closed
    // until the user explicitly presses +.
    setShowReactionPicker(event?.pointerType === 'touch' || event?.pointerType === 'pen')
    setShowMoreReactions(false)
    setEditingQuickReactions(false)
    const nextReactionPosition = getReactionPopoverPosition(false)
    if (nextReactionPosition) setReactionPopoverPosition(nextReactionPosition)
    else requestAnimationFrame(updateReactionPopoverPosition)
    logMenuDebug('menu opened', {
      reason,
      messageId: m.id,
      isMe,
      pointerType: event?.pointerType,
      eventType: event?.type,
      target: describeTarget(event?.target),
      bubbleRect: nextAnchor.rect
    })
    debug.debug('REACTION_MENU_OPEN', { reason, messageId: m.id })
    if (navigator.vibrate) navigator.vibrate(50)
  }, [calculateActionMenuPositionFromAnchor, captureBubbleAnchor, closeMessageInteraction, getReactionPopoverPosition, isMe, m.id, messageActionMenuId, setInlineDeleteMessageId, setInlineDeleteStep, setMessageActionMenuId, setMessageActionMenuPosition, updateReactionPopoverPosition])

  const handlePointerDown = (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    // Links (including file attachments) share the same gesture. A normal tap
    // still navigates; only an activated long press suppresses its click.
    if (event.target?.closest?.('button, textarea, input, select, [contenteditable="true"]')) return
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode: 'pending',
      offset: 0,
      triggeredReply: false
    }
    debug.debug('REACTION_POINTER_START', { messageId: m.id, pointerType: event.pointerType })
    longPressActivatedRef.current = false
    touchTimer.current = setTimeout(() => {
      touchTimer.current = null
      longPressActivatedRef.current = true
      const pointerId = gestureRef.current?.pointerId ?? event.pointerId
      let hadPointerCapture = false
      try {
        hadPointerCapture = Boolean(bubbleRef.current?.hasPointerCapture?.(pointerId))
        if (hadPointerCapture) bubbleRef.current.releasePointerCapture(pointerId)
      } catch (_err) {}
      if (import.meta.env.DEV) debug.debug('REACTION_POINTER_RELEASE', {
        eventType: event.type,
        pointerType: event.pointerType,
        messageId: m.id,
        hadPointerCapture
      })
      // Activation completes ownership of the original message gesture. Later
      // pointermove/up events must not continue the swipe/long-press state.
      gestureRef.current = null
      debug.debug('REACTION_LONG_PRESS_ACTIVATED', { messageId: m.id, pointerType: event.pointerType })
      openMobileActions(event, 'pointer_long_press')
    }, 420)
  }

  const clearLongPressTimer = useCallback(() => {
    if (touchTimer.current) {
      clearTimeout(touchTimer.current)
      touchTimer.current = null
    }
  }, [])

  const keepDesktopToolbarOpen = useCallback(() => {
    if (desktopHoverExitTimer.current) {
      clearTimeout(desktopHoverExitTimer.current)
      desktopHoverExitTimer.current = null
    }
    setIsDesktopHovered(true)
  }, [])

  const scheduleDesktopToolbarClose = useCallback(() => {
    if (desktopHoverExitTimer.current) clearTimeout(desktopHoverExitTimer.current)
    // Keep ownership while the pointer crosses the small message/toolbar gap.
    desktopHoverExitTimer.current = setTimeout(() => {
      desktopHoverExitTimer.current = null
      setIsDesktopHovered(false)
    }, 160)
  }, [])

  const resetSwipe = useCallback(() => {
    gestureRef.current = null
    setSwipeOffset(0)
  }, [])

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (isActionMenuOpen) {
      clearLongPressTimer()
      resetSwipe()
      return
    }
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (gesture.mode === 'pending' && shouldCancelLongPress(gesture.startX, gesture.startY, event.clientX, event.clientY)) clearLongPressTimer()
    // Cancel before scrolling/swiping once movement exceeds touch slop; this
    // prevents a delayed long press from firing after the list starts moving.
    if (gesture.mode === 'pending' && Math.hypot(dx, dy) > 10 && absY >= absX) {
      clearLongPressTimer()
      gesture.mode = 'scroll'
      setSwipeOffset(0)
      return
    }
    if (gesture.mode === 'scroll') return
    if (absX > 8 && absX > absY * 1.2) {
      clearLongPressTimer()
      gesture.mode = 'swipe'
      gesture.offset = dx
      event.preventDefault()
      setSwipeOffset(Math.max(-88, Math.min(88, dx)))
    }
  }

  const handlePointerEndOrCancel = (event) => {
    const gesture = gestureRef.current
    clearLongPressTimer()
    if (gesture?.mode === 'swipe' && Math.abs(gesture.offset || swipeOffset) >= 64 && !isActionMenuOpen) {
      suppressBubbleClickUntilRef.current = Date.now() + 500
      setReplyingTo(m)
      gesture.triggeredReply = true
      if (navigator.vibrate) navigator.vibrate(20)
    }
    if (event?.currentTarget?.hasPointerCapture && event.pointerId !== undefined) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      } catch (_err) {}
    }
    resetSwipe()
  }

  const handleContextMenu = (event) => {
    if (!longPressActivatedRef.current) return
    event.preventDefault()
    longPressActivatedRef.current = false
  }

  const handleBubbleClick = (event) => {
    if (shouldSuppressOriginClick(suppressBubbleClickUntilRef.current)) {
      event?.preventDefault()
      event?.stopPropagation()
      logMenuDebug('suppressed bubble click after long press', { messageId: m.id, target: describeTarget(event?.target) })
      return
    }
    if (isActionMenuOpen) {
      event?.stopPropagation()
      closeActionMenu('bubble_click', { target: describeTarget(event?.target) })
      return
    }
    setShowInlineTime(!showInlineTime)
  }
  const openReactionPicker = (event) => {
    event.stopPropagation()
    event.preventDefault()
    if (reactionInputMode !== 'touch') setReactionInputMode('desktop')
    if (import.meta.env.DEV) debug.debug('REACTION_PORTAL_ACTION', {
      action: 'open_picker', eventType: event.type, pointerType: event.pointerType, messageId: m.id
    })
    if (touchTimer.current) clearTimeout(touchTimer.current)
    if (Date.now() - lastReactionPickerTouchRef.current < 120) return
    lastReactionPickerTouchRef.current = Date.now()
    setInlineDeleteMessageId(null)
    setShowReceiptDetails(false)
    if (!isActionMenuOpen) {
      const nextAnchor = captureBubbleAnchor()
      if (!nextAnchor?.rect) return
    const nextPosition = calculateActionMenuPositionFromAnchor(nextAnchor)
    if (!nextPosition) return

    setActionMenuPosition(nextPosition)
    setMessageActionMenuPosition?.(nextPosition)
    setMessageActionMenuId(m.id)
      logMenuDebug('menu opened', { reason: 'reaction_picker', messageId: m.id, eventType: event.type, target: describeTarget(event.target) })
    }
    setShowReactionPicker(true)
    setReactionMenuState(current => transitionReactionMenu(current, 'OPEN_TOOLBAR'))
    setShowMoreReactions(false)
    setEditingQuickReactions(false)
    const nextPosition = getReactionPopoverPosition(false)
    if (nextPosition) setReactionPopoverPosition(nextPosition)
    else requestAnimationFrame(updateReactionPopoverPosition)
  }
  const submitReaction = async (event, emoji, reason) => {
    event.stopPropagation()
    event.preventDefault?.()
    if (isReactionSubmitting) return
    setIsReactionSubmitting(true)
    setReactionMenuState(current => transitionReactionMenu(current, 'SUBMIT'))
    debug.debug('REACTION_TOOLBAR_ACTION', { action: reason, messageId: m.id })
    if (import.meta.env.DEV) debug.debug('REACTION_PORTAL_ACTION', {
      action: reason, eventType: event.type, pointerType: event.pointerType, messageId: m.id
    })
    try {
      await toggleReaction(m.id, normalizeReactionEmoji(emoji))
    } finally {
      // Portal cleanup must run even when Supabase rejects the mutation; an
      // orphaned fixed layer would otherwise intercept the whole chat surface.
      setIsReactionSubmitting(false)
      closeActionMenu(reason)
    }
  }
  const handleReactionButtonClick = (event, emoji) => {
    if (Date.now() - lastReactionTouchRef.current < 500) return
    void submitReaction(event, emoji, 'action_react')
  }
  const handleReactionButtonTouchEnd = (event, emoji) => {
    lastReactionTouchRef.current = Date.now()
    void submitReaction(event, emoji, 'action_react_touch')
  }

  const logReactionHitTest = (event) => {
    if (import.meta.env.DEV) {
      let hadPointerCapture = false
      try {
        hadPointerCapture = Boolean(event.currentTarget?.hasPointerCapture?.(event.pointerId))
      } catch (_err) {}
      const hitElement = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? document.elementFromPoint(event.clientX, event.clientY)
        : null
      const action = event.target?.closest?.('[data-reaction-action]')
      const toolbar = event.target?.closest?.('[data-reaction-toolbar]') || actionMenuRef.current
      const portal = document.querySelector('[data-reaction-portal]')
      const backdrop = document.querySelector('[data-reaction-backdrop]')
      const describeLayer = (element) => element instanceof Element ? {
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : undefined,
        data: { ...element.dataset },
        pointerEvents: getComputedStyle(element).pointerEvents,
        position: getComputedStyle(element).position,
        zIndex: getComputedStyle(element).zIndex,
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
        touchAction: getComputedStyle(element).touchAction
      } : null
      const composedPath = typeof event.composedPath === 'function'
        ? event.composedPath()
        : typeof event.nativeEvent?.composedPath === 'function'
          ? event.nativeEvent.composedPath()
          : []
      const diagnosticLabel = event.type === 'pointerdown'
        ? 'REACTION_ACTION_POINTER_DOWN'
        : event.type === 'pointerup'
          ? 'REACTION_ACTION_POINTER_UP'
          : event.type === 'click'
            ? 'REACTION_ACTION_CLICK'
            : 'REACTION_HIT_TEST'
      debug.debug(diagnosticLabel, {
        eventType: event.type, pointerType: event.pointerType, messageId: m.id,
        activeMessageId: messageActionMenuId,
        insideToolbar: true,
        hadPointerCapture,
        clickFollowedPointerUp: event.type === 'click' && performance.now() - lastToolbarPointerUpRef.current < 750,
        disabled: Boolean(action?.disabled),
        reactionSubmissionPending: isReactionSubmitting,
        hitElement: describeLayer(hitElement),
        action: describeLayer(action),
        toolbar: describeLayer(toolbar),
        portal: describeLayer(portal),
        backdrop: describeLayer(backdrop),
        composedPath: composedPath.map(element => describeLayer(element)).filter(Boolean)
      })
    }
  }

  const isolateReactionSurfaceEvent = (event) => {
    event.stopPropagation()
    if (event.type === 'pointerup') lastToolbarPointerUpRef.current = performance.now()
    logReactionHitTest(event)
  }

  const handleBackdropPointerDown = (event) => {
    if (event.target !== event.currentTarget) return
    event.stopPropagation()
    if (import.meta.env.DEV) debug.debug('REACTION_BACKDROP_CLOSE', {
      eventType: event.type,
      pointerType: event.pointerType,
      messageId: m.id,
      hitElement: document.elementFromPoint(event.clientX, event.clientY)?.tagName
    })
    closeActionMenu('portal_backdrop', { pointerType: event.pointerType })
  }

  const groupedReactions = m.message_reactions?.reduce((acc, r) => {
    const emoji = normalizeReactionEmoji(r.emoji)
    if (!emoji) return acc
    acc[emoji] = [...(acc[emoji] || []), { ...r, emoji }]
    return acc
  }, {}) || {}

  const exactTime = new Date(m.created_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const visibleContent = renderedContent ?? (typeof m.content === 'string' ? m.content : '')
  const isEmojiOnly = typeof visibleContent === 'string' && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(visibleContent.trim());
  const hasVisibleContent = typeof visibleContent === 'string' && visibleContent.trim() !== ''
  const firstImageUrl = hasImageAttachments ? resolveAttachmentUrl(imageAttachments[0], message) : ''
  const isEditingCaption = isEditing && hasImageAttachments
  const showCaptionBelowMedia = hasImageAttachments && hasVisibleContent
  const deliveryStatus = isMe ? getDeliveryStatus(m, peerReadAt) : null
  const deliveryMeta = deliveryStatus ? deliveryStatusMeta[deliveryStatus] : null
  const DeliveryIcon = deliveryMeta?.icon
  const shouldShowDeliveryStatus = isMe && deliveryMeta && (showDeliveryStatus || deliveryStatus === 'failed')
  const actionToolbarOwner = isActionMenuOpen && reactionInputMode === 'touch'
    ? ACTION_TOOLBAR_OWNER.TOUCH_LONGPRESS
    : isDesktopHovered || isActionMenuOpen
      ? ACTION_TOOLBAR_OWNER.DESKTOP_HOVER
      : ACTION_TOOLBAR_OWNER.CLOSED
  const seenTimestamp = getSeenTimestamp(m, peerReadAt)
  const receiptRows = isMe ? [
    { label: 'Sent', value: formatReceiptTime(m.created_at) },
    { label: 'Seen', value: formatReceiptTime(seenTimestamp) }
  ] : [
    { label: 'Sent', value: formatReceiptTime(m.created_at) }
  ]
  const bubbleStyle = {
    backgroundColor: isMe ? 'var(--theme-base)' : 'var(--chat-bg-element,var(--bg-element))',
    borderColor: isMe ? 'var(--theme-base)' : 'var(--chat-border,var(--border-subtle))',
    color: isMe ? '#ffffff' : 'var(--chat-text,var(--text-main))'
  }
  const attachmentBorderStyle = { borderColor: 'var(--theme-base)' }

  useEffect(() => {
    const handleCloseMessageInteraction = (event) => {
      const detail = event.detail || {}
      if (detail.messageId && detail.messageId !== m.id) return
      clearLongPressTimer()
      gestureRef.current = null
      setSwipeOffset(0)
      setShowReactionPicker(false)
      setShowMoreReactions(false)
      setEditingQuickReactions(false)
      setReactionPopoverPosition(null)
      setShowReceiptDetails(false)
      if (bubbleRef.current?.hasPointerCapture && detail.pointerId !== undefined) {
        try {
          if (bubbleRef.current.hasPointerCapture(detail.pointerId)) bubbleRef.current.releasePointerCapture(detail.pointerId)
        } catch (_err) {}
      }
    }

    window.addEventListener('messapp:close-message-interaction', handleCloseMessageInteraction)
    return () => window.removeEventListener('messapp:close-message-interaction', handleCloseMessageInteraction)
  }, [clearLongPressTimer, m.id])

  useEffect(() => {
    if (!isActionMenuOpen) {
      setReactionInputMode(null)
      setShowReactionPicker(false)
      setShowMoreReactions(false)
      setEditingQuickReactions(false)
      setReactionPopoverPosition(null)
      setShowReceiptDetails(false)
    }
  }, [isActionMenuOpen])

  useEffect(() => {
    if (actionToolbarOwner !== ACTION_TOOLBAR_OWNER.TOUCH_LONGPRESS) return undefined
    const frame = requestAnimationFrame(() => {
      const anchor = captureBubbleAnchor()
      const rect = actionMenuRef.current?.getBoundingClientRect?.()
      if (!anchor || !rect) return
      const nextPosition = calculateActionMenuPositionFromAnchor(anchor, {
        width: rect.width,
        height: rect.height
      })
      if (nextPosition) {
        setActionMenuPosition(nextPosition)
        setMessageActionMenuPosition?.(nextPosition)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [actionToolbarOwner, calculateActionMenuPositionFromAnchor, captureBubbleAnchor, setMessageActionMenuPosition])

  useEffect(() => {
    if (!import.meta.env.DEV || !isActionMenuOpen || reactionInputMode !== 'touch') return undefined
    const frame = requestAnimationFrame(() => {
      const samples = [
        ...document.querySelectorAll('[data-reaction-action]'),
        document.querySelector('[data-reaction-toolbar]'),
        document.querySelector('[data-reaction-picker]')
      ].filter(Boolean)
      for (const sample of samples) {
        const rect = sample.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const hit = document.elementFromPoint(x, y)
        const style = getComputedStyle(sample)
        debug.debug('REACTION_HIT_TEST', {
          eventType: 'portal_mount',
          action: sample.dataset.reactionAction,
          messageId: m.id,
          hitElement: hit ? { tag: hit.tagName, className: typeof hit.className === 'string' ? hit.className : undefined, data: { ...hit.dataset } } : null,
          expectedElement: { tag: sample.tagName, data: { ...sample.dataset } },
          pointerEvents: style.pointerEvents,
          position: style.position,
          zIndex: style.zIndex,
          display: style.display,
          visibility: style.visibility,
          touchAction: style.touchAction,
          hitInsideExpected: Boolean(hit && (hit === sample || sample.contains(hit)))
        })
      }
      const backdrop = document.querySelector('[data-reaction-backdrop]')
      const outsideHit = document.elementFromPoint(4, 4)
      if (backdrop) debug.debug('REACTION_HIT_TEST', {
        eventType: 'portal_mount',
        action: 'backdrop',
        messageId: m.id,
        hitElement: outsideHit ? { tag: outsideHit.tagName, className: typeof outsideHit.className === 'string' ? outsideHit.className : undefined, data: { ...outsideHit.dataset } } : null,
        hitInsideExpected: outsideHit === backdrop
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [isActionMenuOpen, m.id, reactionInputMode, showReactionPicker])

  useEffect(() => {
    if (m.is_deleted && isActionMenuOpen) closeActionMenu('message_deleted')
  }, [closeActionMenu, isActionMenuOpen, m.is_deleted])

  useEffect(() => {
    if (!isActionMenuOpen) return undefined

    const handlePointerDownOutside = (event) => {
      const touchBackdrop = document.querySelector('[data-reaction-backdrop]')
      if (reactionInputMode === 'touch' && event.target === touchBackdrop) return
      if (actionMenuRef.current?.contains(event.target)) return
      if (reactionPopoverRef.current?.contains(event.target)) return
      if (bubbleRef.current?.contains(event.target)) return
      debug.debug('REACTION_OUTSIDE_CLOSE', { messageId: m.id, pointerType: event.pointerType })
      if (import.meta.env.DEV) debug.debug('REACTION_BACKDROP_CLOSE', {
        eventType: event.type, pointerType: event.pointerType, messageId: m.id, insideToolbar: false
      })
      closeActionMenu('click_away', {
        pointerType: event.pointerType,
        target: describeTarget(event.target)
      })
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (showMoreReactions || editingQuickReactions) {
        setShowMoreReactions(false)
        setEditingQuickReactions(false)
        setReactionMenuState(current => transitionReactionMenu(current, 'BACK'))
      } else if (showReactionPicker) {
        setShowReactionPicker(false)
        setReactionPopoverPosition(null)
      } else closeActionMenu('escape_key')
    }

    const handleBack = (event) => {
      if (showMoreReactions || editingQuickReactions) {
        event.preventDefault()
        setShowMoreReactions(false)
        setEditingQuickReactions(false)
        setReactionMenuState(current => transitionReactionMenu(current, 'BACK'))
      } else if (showReactionPicker) {
        event.preventDefault()
        setShowReactionPicker(false)
        setReactionPopoverPosition(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('messapp:reaction-back', handleBack)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('messapp:reaction-back', handleBack)
    }
  }, [closeActionMenu, editingQuickReactions, isActionMenuOpen, m.id, reactionInputMode, showMoreReactions, showReactionPicker])

  useEffect(() => {
    if (!showReactionPicker) return undefined
    updateReactionPopoverPosition()

    const reposition = () => updateReactionPopoverPosition()
    const closeOnScroll = () => closeActionMenu('message_list_scroll')
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', closeOnScroll, true)
      if (import.meta.env.DEV) debug.debug('REACTION_PORTAL_UNMOUNT', { messageId: m.id })
    }
  }, [closeActionMenu, m.id, showReactionPicker, showMoreReactions, editingQuickReactions, updateReactionPopoverPosition])

  useEffect(() => () => {
    clearLongPressTimer()
    if (desktopHoverExitTimer.current) clearTimeout(desktopHoverExitTimer.current)
    gestureRef.current = null
    longPressActivatedRef.current = false
    debug.debug('REACTION_CLEANUP', { reason: 'message_unmounted', messageId: m.id })
    if (messageActionMenuId === m.id) {
      logMenuDebug('menu closed', { reason: 'message_unmounted', messageId: m.id })
    }
  }, [clearLongPressTimer, m.id, messageActionMenuId])

  if (m.is_unreadable || (typeof m.content === 'string' && m.content.includes('[Encrypted Message]'))) {
    return null
  }

  return (
    <div id={`message-${m.id}`} className={`flex gap-2 transition-all duration-300 ease-out transform ${showHeader ? 'mt-2.5 md:mt-3' : 'mt-0.5'} ${isHighlighted ? 'bg-[var(--theme-20)] p-2 -mx-2 rounded-xl shadow-[0_0_15px_var(--theme-20)] scale-[1.01] z-20' : ''} ${alignRight ? 'flex-row-reverse ml-6 sm:ml-12 md:ml-20' : 'mr-6 sm:mr-12 md:mr-20'}`}>
      
      {showHeader ? (
        <StatusAvatar url={m.profiles?.avatar_url} username={m.profiles?.username} status={presenceStatus} showStatus={Boolean(presenceStatus && presenceStatus !== 'offline')} className="h-8 w-8 mt-1 shadow-md ghost-border rounded-full shrink-0" />
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
        
        {isEditing && !isEditingCaption && window.innerWidth >= 768 ? (
          <form onSubmit={(e) => handleUpdateMessage(e, m.id)} className="mt-1 w-full max-w-3xl">
            <input type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full bg-[var(--bg-surface)] text-[var(--text-main)] px-4 py-2.5 rounded-xl ghost-border outline-none shadow-inner text-sm focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${alignRight ? 'text-right' : ''}`} autoFocus onKeyDown={(e) => e.key === 'Escape' && setEditingMessageId(null)} />
            <span className={`text-[10px] text-gray-500 mt-1.5 block ${alignRight ? 'text-right' : ''}`}>Press Enter to save, Esc to cancel</span>
          </form>
        ) : (
          <div
            className={`flex items-start gap-0.5 max-w-full w-fit ${alignRight ? 'flex-row-reverse ml-auto' : 'mr-auto'} relative group/bubble`}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') keepDesktopToolbarOpen()
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') scheduleDesktopToolbarClose()
            }}
          >
            
            <div 
              ref={bubbleRef}
              className={`message-touch-target relative flex flex-col ${alignRight ? 'items-end' : 'items-start'} max-w-[min(72vw,36rem)] sm:max-w-[min(68vw,38rem)] shrink-0 min-w-0 cursor-pointer md:cursor-default ${isActionMenuOpen ? 'message-action-selected' : ''}`}
              style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerEndOrCancel}
              onPointerCancel={handlePointerEndOrCancel}
              onPointerMove={handlePointerMove}
              onTouchEnd={clearLongPressTimer}
              onTouchCancel={clearLongPressTimer}
              onClick={handleBubbleClick}
              onContextMenu={handleContextMenu}
            >
              {swipeOffset !== 0 && (
                <div className={`message-reply-swipe-affordance ${swipeOffset > 0 ? 'is-left' : 'is-right'}`}>
                  <CornerDownLeft size={16} aria-hidden="true" />
                </div>
              )}
              
              {m.reply_to_message_id && repliedMsg && !m.is_deleted && (
                <div onClick={(e) => { e.stopPropagation(); scrollToMessage(repliedMsg); }} className={`flex items-center gap-0.5 mb-1 opacity-70 text-[11px] text-gray-400 select-none cursor-pointer hover:opacity-100 transition-opacity ${alignRight ? 'flex-row-reverse text-right' : 'text-left'}`}>
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
                  ) : hasVisibleContent && !showCaptionBelowMedia && (
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
                    <div className={`${mediaAttachments.length > 1 ? 'grid grid-cols-2 gap-1 max-w-[min(86vw,520px)]' : 'flex flex-col gap-1'} ${hasVisibleContent ? 'mt-1' : ''} w-full ${mediaAttachments.length > 1 ? '' : alignRight ? 'items-end' : 'items-start'}`}>
                      {message.message_attachments.map((attachment, attachmentIndex) => {
                        const attachmentUrl = resolveAttachmentUrl(attachment, message)
                        const attachmentSize = formatAttachmentSize(attachment.file_size || message.file_size)
                        const attachmentIsImage = isImageAttachment(attachment)
                        const attachmentIsVideo = isVideoAttachment(attachment)
                        const attachmentIsMedia = attachmentIsImage || attachmentIsVideo
                        const imageIndex = attachmentIsImage ? imageAttachments.indexOf(attachment) : -1
                        if (imageIndex >= 4) return null
                        return (
                        <div key={attachment.id || attachment.file_url || attachmentUrl} className={`max-w-full text-[var(--theme-base)] ${mediaAttachments.length > 1 && !attachmentIsMedia ? 'col-span-2' : ''}`}>
                          {!attachmentUrl && attachmentIsImage ? (
                            <div className={`${mediaAttachments.length > 1 ? 'aspect-square h-full w-full' : 'h-40 w-[min(68vw,260px)]'} animate-pulse scale-[0.98] rounded-2xl border bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.14),transparent_45%),linear-gradient(135deg,var(--bg-element-hover),var(--bg-element))] blur-md`} style={attachmentBorderStyle} aria-label="Image loading" />
                          ) : !attachmentUrl ? (
                            <div className="file-message-card flex min-w-[220px] max-w-[min(76vw,360px)] items-center gap-3 rounded-2xl border px-4 py-3.5 text-gray-500">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                                <FileText size={24} className="text-[var(--theme-base)]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-[var(--chat-text,var(--text-main))] truncate">{attachment.file_name || 'Attachment unavailable'}</span>
                                <span className="block text-[11px] font-semibold text-gray-500">Unavailable{attachmentSize ? ` • ${attachmentSize}` : ''}</span>
                              </div>
                            </div>
                          ) : attachmentIsImage ? (
                              <div className="relative h-full w-full">
                                <MessageImage
                                  src={attachmentUrl}
                                  mediaKey={`${message.id}:${attachment.id || attachment.file_name || attachmentIndex}`}
                                  alt={attachment.file_name || 'Attachment'}
                                  className={mediaAttachments.length > 1
                                    ? 'aspect-square h-full w-full rounded-xl border object-cover'
                                    : 'w-auto max-w-[min(68vw,220px)] sm:max-w-[260px] md:max-w-[300px] max-h-[42vh] sm:max-h-[320px] rounded-2xl object-contain border'}
                                  style={attachmentBorderStyle}
                                  blurWhileLoading={!isMe}
                                  fill={mediaAttachments.length > 1}
                                  onOpen={(e) => {
                                    e.stopPropagation()
                                    setSelectedImage({
                                      url: attachmentUrl,
                                      items: imageGallery,
                                      index: Math.max(0, imageGallery.findIndex(item => item.url === attachmentUrl)),
                                      user: message.profiles?.username,
                                      time: exactTime
                                    })
                                  }}
                                />
                                {imageIndex === 3 && imageAttachments.length > 4 && (
                                  <button
                                    type="button"
                                    className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-2xl font-black text-white backdrop-blur-[1px]"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedImage({ url: attachmentUrl, items: imageGallery, index: 3, user: message.profiles?.username, time: exactTime })
                                    }}
                                    aria-label={`View ${imageAttachments.length - 4} more images`}
                                  >
                                    +{imageAttachments.length - 4}
                                  </button>
                                )}
                              </div>
                          ) : attachmentIsVideo ? (
                            <video
                              src={attachmentUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className={`${mediaAttachments.length > 1 ? 'aspect-square h-full w-full rounded-xl object-cover' : 'max-h-[50vh] w-[min(78vw,420px)] rounded-2xl'} border bg-black`}
                              style={attachmentBorderStyle}
                              onClick={(event) => event.stopPropagation()}
                            >
                              Your browser cannot play this video.
                            </video>
                          ) : (
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={attachment.file_name || true}
                              className="file-message-card flex min-w-[220px] max-w-[calc(100vw-2rem)] overflow-hidden items-center gap-3 rounded-2xl border px-4 py-3.5 text-[var(--chat-text,var(--text-main))] transition-all duration-300 ease-out transform hover:-translate-y-0.5 hover:border-[var(--theme-50)]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-20)] border border-[var(--theme-50)]">
                                <FileText size={25} className="text-[var(--theme-base)]" />
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <span className="block text-sm font-bold leading-tight truncate">{attachment.file_name || 'Attachment'}</span>
                                <span className="mt-1 block text-[11px] font-semibold text-gray-500">{attachmentSize || 'File attachment'}</span>
                              </div>
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--theme-base)] text-white shadow-lg shadow-[var(--theme-20)]">
                                <Download size={16} aria-hidden="true" />
                              </span>
                            </a>
                          )}
                        </div>
                      )})}
                    </div>
                  )}

                  {hasImageAttachments && (
                    isEditingCaption && window.innerWidth >= 768 ? (
                      <form onSubmit={(e) => handleUpdateMessage(e, m.id, { allowEmpty: true })} className={`mt-2 w-full max-w-[min(72vw,32rem)] ${alignRight ? 'text-right' : 'text-left'}`}>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className={`w-full resize-none bg-[var(--bg-surface)] text-[var(--text-main)] px-4 py-3 rounded-2xl ghost-border outline-none shadow-inner text-sm focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${alignRight ? 'text-right' : ''}`}
                          autoFocus
                          rows={2}
                          placeholder="Add a caption"
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingMessageId(null)
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleUpdateMessage(e, m.id, { allowEmpty: true })
                            }
                          }}
                        />
                        <div className={`mt-1.5 flex items-center gap-2 text-[10px] text-gray-500 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                          <span>Enter to save, Shift+Enter for newline</span>
                          <button type="button" onClick={() => setEditingMessageId(null)} className="font-bold text-gray-400 hover:text-[var(--text-main)] cursor-pointer">Cancel</button>
                        </div>
                      </form>
                    ) : showCaptionBelowMedia ? (
                      <div className={`mt-1.5 px-3 py-2 rounded-2xl max-w-full w-fit border text-left transition-all shadow-sm ${alignRight ? 'rounded-tr-md ml-auto' : 'rounded-tl-md mr-auto'}`} style={bubbleStyle}>
                        <div className="leading-relaxed text-current markdown-body whitespace-pre-wrap [&>p]:mb-0 [&>p:not(:last-child)]:mb-2" style={{ overflowWrap: 'break-word', wordBreak: 'normal', fontSize: 'var(--chat-message-font-size, 15px)' }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
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
                    ) : null
                  )}

                  {previewLinks?.map((link, i) => (
                    <div key={`link-prev-${m.id}-${i}`} className={`${visibleContent ? 'mt-1' : ''} ${alignRight ? 'flex justify-end' : 'flex justify-start'}`}>
                      <LinkPreview url={link.url} />
                    </div>
                  ))}

                  {showInlineTime && (
                    <div className={`mt-1 mb-1 rounded-lg border border-[var(--chat-border,var(--border-subtle))] bg-[var(--chat-bg-element,var(--bg-element))]/80 px-2.5 py-2 text-[10px] text-gray-400 shadow-inner animate-fade-in ${alignRight ? 'text-right' : 'text-left'}`}>
                      <div className="font-semibold text-[var(--chat-text,var(--text-main))]">{exactTime}</div>
                      {isMe && receiptRows.slice(1).map(row => (
                        <div key={row.label} className={`mt-0.5 flex items-center gap-2 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                          <span className="font-bold text-gray-500">{row.label}</span>
                          <span>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {shouldShowDeliveryStatus && (
                    <div className={`mt-1 flex items-center gap-0.5 text-[10px] font-bold ${deliveryMeta.className} ${alignRight ? 'justify-end' : 'justify-start'}`}>
                      {DeliveryIcon && <DeliveryIcon size={12} strokeWidth={2.4} aria-hidden="true" />}
                      <span>{deliveryMeta.label}</span>
                      {deliveryStatus === 'failed' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            retryFailedMessage?.(m)
                          }}
                          className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300 transition-colors hover:bg-red-500/20 cursor-pointer"
                        >
                          <RotateCcw size={11} aria-hidden="true" />
                          Retry
                        </button>
                      )}
                    </div>
                  )}

                  {Object.keys(groupedReactions).length > 0 && (
                    <div className={`flex flex-wrap gap-0.5 mt-1.5 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(groupedReactions).map(([emoji, reactions], idx) => {
                        const hasReacted = reactions.some(r => r.profile_id === currentUserId)
                        return (
                          <button key={`react-${m.id}-${idx}`} onClick={(e) => handleReactionButtonClick(e, emoji)} onTouchEnd={(e) => handleReactionButtonTouchEnd(e, emoji)} className={`px-1.5 py-0.5 rounded-lg text-xs flex items-center gap-0.5 border transition-colors cursor-pointer select-none ${hasReacted ? 'bg-[var(--theme-20)] border-[var(--theme-50)]' : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)]'}`}>
                            <span>{emoji}</span> <span className={`font-bold ${hasReacted ? 'text-[var(--text-main)]' : 'text-gray-400'}`}>{reactions.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {!m.is_deleted && !m.__local && actionToolbarOwner !== ACTION_TOOLBAR_OWNER.CLOSED && (
              <>
              {/* Desktop hover and touch long-press are exclusive owners. The
                  quick-reaction picker below is a separate, single surface. */}
              <ActionToolbarHost owner={actionToolbarOwner} onBackdropPointerDown={handleBackdropPointerDown}>
              <div
                ref={actionMenuRef}
                data-reaction-toolbar
                data-toolbar-owner={actionToolbarOwner}
                data-message-id={m.id}
                className={`message-action-toolbar transition-all duration-200 ease-out shrink-0 premium-menu rounded-2xl p-1 ${reactionInputMode === 'touch' ? 'z-[160]' : 'z-[80]'}
                  ${isActionMenuOpen && reactionInputMode === 'touch' ? 'fixed' : `absolute top-1/2 -translate-y-1/2 ${alignRight ? 'right-full mr-2' : 'left-full ml-2'}`}
                  ${hasImageAttachments ? 'flex-col h-auto w-10 py-1 gap-0.5' : 'flex-row h-9 px-1 gap-0.5'}
                  ${isActionMenuOpen || showReactionPicker || inlineDeleteMessageId === m.id
                    ? 'flex items-center opacity-100 pointer-events-auto scale-100'
                    : 'flex items-center opacity-0 pointer-events-none md:pointer-events-auto md:group-hover/bubble:opacity-100 scale-95 md:scale-100'
                  }`}
                style={isActionMenuOpen && reactionInputMode === 'touch' && actionMenuPosition ? {
                  position: 'fixed',
                  left: actionMenuPosition.left,
                  top: actionMenuPosition.top,
                  zIndex: 1,
                  pointerEvents: 'auto',
                  touchAction: 'manipulation'
                } : undefined}
                onPointerDown={isolateReactionSurfaceEvent}
                onPointerUp={isolateReactionSurfaceEvent}
                onPointerCancel={isolateReactionSurfaceEvent}
                onClick={isolateReactionSurfaceEvent}
                onPointerDownCapture={logReactionHitTest}
                onPointerUpCapture={logReactionHitTest}
                onClickCapture={logReactionHitTest}
                onContextMenu={isolateReactionSurfaceEvent}
                onTouchStart={isolateReactionSurfaceEvent}
                onTouchEnd={isolateReactionSurfaceEvent}
                onTouchCancel={isolateReactionSurfaceEvent}
              >
                
                {showReactionPicker && reactionPopoverPosition && (
                  <ReactionPickerPortal>
                    <div
                      ref={reactionPopoverRef}
                      data-reaction-picker
                      className="messapp-reaction-popover premium-menu fixed z-[170] animate-fade-in rounded-2xl overflow-hidden p-1.5"
                      style={{
                        left: reactionPopoverPosition.left,
                        top: reactionPopoverPosition.top,
                        width: reactionPopoverPosition.width,
                        pointerEvents: 'auto',
                        touchAction: 'manipulation',
                        zIndex: reactionInputMode === 'touch' ? TOUCH_PORTAL_Z_INDEX + 1 : 160
                      }}
                      onPointerDown={isolateReactionSurfaceEvent}
                      onPointerUp={isolateReactionSurfaceEvent}
                      onPointerCancel={isolateReactionSurfaceEvent}
                      onClick={isolateReactionSurfaceEvent}
                      onPointerDownCapture={logReactionHitTest}
                      onPointerUpCapture={logReactionHitTest}
                      onClickCapture={logReactionHitTest}
                      onContextMenu={isolateReactionSurfaceEvent}
                      onTouchStart={isolateReactionSurfaceEvent}
                      onTouchEnd={isolateReactionSurfaceEvent}
                      onTouchCancel={isolateReactionSurfaceEvent}
                      onTouchStartCapture={() => { if (document.activeElement) document.activeElement.blur(); }}
                    >
                    <div className="relative z-10">
                      <div className="flex items-center gap-1">
                        {quickReactions.map((emoji, index) => {
                          const hasReacted = groupedReactions[emoji]?.some(r => r.profile_id === currentUserId)
                          const isSelectedSlot = editingQuickReactions && quickReactionSlot === index
                          return (
                            <button
                              key={`${emoji}-${index}`}
                              type="button"
                              data-reaction-action="quick-reaction"
                              style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined}
                              disabled={reactionMenuState === REACTION_MENU_STATE.SUBMITTING}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (editingQuickReactions) {
                                  setQuickReactionSlot(index)
                                  return
                                }
                                handleReactionButtonClick(event, emoji)
                              }}
                              onTouchEnd={(event) => {
                                if (editingQuickReactions) return
                                handleReactionButtonTouchEnd(event, emoji)
                              }}
                              className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition-all hover:bg-[var(--bg-element-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${hasReacted ? 'bg-[var(--theme-20)] ring-1 ring-[var(--theme-50)]' : 'bg-[var(--bg-element)]'} ${isSelectedSlot ? 'scale-110 ring-2 ring-[var(--theme-base)]' : ''}`}
                              title={editingQuickReactions ? `Change quick reaction ${index + 1}` : `React with ${emoji}`}
                              aria-label={editingQuickReactions ? `Change quick reaction ${index + 1}` : `React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          data-reaction-action="more-emojis"
                          style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined}
                          disabled={reactionMenuState === REACTION_MENU_STATE.SUBMITTING}
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditingQuickReactions(false)
                            setShowMoreReactions(value => {
                              const next = !value
                              setReactionMenuState(current => transitionReactionMenu(current, next ? 'OPEN_PICKER' : 'BACK'))
                              const nextPosition = getReactionPopoverPosition(next)
                              if (nextPosition) setReactionPopoverPosition(nextPosition)
                              return next
                            })
                          }}
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[var(--bg-element-hover)] hover:text-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${showMoreReactions ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'bg-[var(--bg-element)]'}`}
                          title="More emojis"
                          aria-label="More emojis"
                        >
                          <Plus size={17} aria-hidden="true" />
                        </button>
                      </div>

                      {(showMoreReactions || editingQuickReactions) && (
                        <div className="mt-1.5 rounded-xl overflow-hidden">
                          {showMoreReactions && !editingQuickReactions && (
                            <div className="flex items-center justify-end bg-[var(--bg-element)] px-3 py-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  const nextPosition = getReactionPopoverPosition(true)
                                  if (nextPosition) setReactionPopoverPosition(nextPosition)
                                  setEditingQuickReactions(true)
                                }}
                                className="text-[11px] font-bold text-[var(--theme-base)] hover:text-[var(--text-main)]"
                              >
                                Edit quick reactions
                              </button>
                            </div>
                          )}
                          {editingQuickReactions && (
                            <div className="flex items-center justify-between gap-3 bg-[var(--bg-element)] px-3 py-2 text-[11px] font-bold text-gray-400">
                              <span>Pick replacement for {quickReactions[quickReactionSlot]}</span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setEditingQuickReactions(false)
                                }}
                                className="rounded-full p-1 text-gray-500 hover:bg-[var(--bg-element-hover)] hover:text-[var(--text-main)]"
                                aria-label="Close quick reaction editor"
                                title="Close editor"
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                          <ChatEmojiPicker
                            width={typeof window !== 'undefined' && window.innerWidth < 350 ? Math.min(window.innerWidth - 32, 280) : 300}
                            height={editingQuickReactions ? 300 : 350}
                            searchDisabled={false}
                            onEmojiClick={(emojiData) => {
                              if (editingQuickReactions) {
                                saveQuickReaction(emojiData.emoji)
                                return
                              }
                              const emoji = normalizeReactionEmoji(emojiData.emoji)
                              void submitReaction({ stopPropagation() {}, preventDefault() {} }, emoji, 'action_react_picker')
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  </ReactionPickerPortal>
                )}

                {inlineDeleteMessageId === m.id ? (
                  <div className="flex items-center gap-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2 py-1 rounded-full shadow-sm animate-fade-in">
                    {inlineDeleteStep === 'options' && (
                      <>
                        {isMe && <button onClick={() => setInlineDeleteStep('confirm_everyone')} className="text-[10px] font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors cursor-pointer">Unsend</button>}
                        <button onClick={() => setInlineDeleteStep('confirm_me')} className="text-[10px] font-bold text-gray-400 hover:text-[var(--text-main)] px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap">Hide</button>
                        <div className="w-[1px] h-3 bg-[var(--border-subtle)] mx-1"></div>
	                        <button onClick={() => closeActionMenu('delete_cancel')} className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </>
                    )}
                    {inlineDeleteStep === 'confirm_everyone' && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-red-400 whitespace-nowrap">Unsend?</span>
	                        <button onClick={() => { executeInlineDelete(m, 'everyone'); closeActionMenu('action_delete_everyone'); }} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><Check size={12}/></button>
                        <button onClick={() => setInlineDeleteStep('options')} className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </div>
                    )}
                    {inlineDeleteStep === 'confirm_me' && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">Hide?</span>
	                        <button onClick={() => { executeInlineDelete(m, 'me'); closeActionMenu('action_delete_me'); }} className="bg-[var(--text-main)]/10 text-[var(--text-main)] hover:bg-[var(--text-main)]/20 p-1 rounded-full transition-colors cursor-pointer"><Check size={12}/></button>
                        <button onClick={() => setInlineDeleteStep('options')} className="text-gray-500 hover:text-[var(--text-main)] p-1 rounded-full transition-colors cursor-pointer"><X size={12}/></button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <button type="button" data-reaction-action="reply" style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined} onClick={() => { setReplyingTo(m); closeActionMenu('action_reply'); }} className="message-action-button text-gray-500 hover:text-[var(--theme-base)] md:hover:bg-[var(--border-subtle)]" title="Reply" aria-label="Reply"><CornerDownLeft size={15} aria-hidden="true" /></button>
                    <button 
                      type="button"
                      data-reaction-action="open-picker"
                      style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined}
                      onClick={openReactionPicker}
                      onTouchStartCapture={() => { 
                        if (document.activeElement) document.activeElement.blur(); 
                      }}
                      onMouseDown={(e) => { e.preventDefault(); }}
                      className="message-action-button text-gray-500 hover:text-yellow-400 md:hover:bg-[var(--border-subtle)]" 
                      title="React"
                      aria-label="React"
                    >
                      <SmilePlus size={15} aria-hidden="true" />
                    </button>
	                    {isMe && !hasAttachments && (
	                      <button type="button" data-reaction-action="edit" style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined} onClick={() => { setEditingMessageId(m.id); setEditContent(m.content); closeActionMenu('action_edit'); }} className="message-action-button text-gray-500 hover:text-[var(--text-main)] md:hover:bg-[var(--border-subtle)]" title="Edit" aria-label="Edit"><Pen size={15} aria-hidden="true" /></button>
	                    )}
	                    {isMe && hasImageAttachments && (
	                      <button type="button" data-reaction-action="edit-caption" style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined} onClick={() => { setEditingMessageId(m.id); setEditContent(visibleContent || ''); closeActionMenu('action_edit_caption'); }} className="message-action-button text-gray-500 hover:text-[var(--text-main)] md:hover:bg-[var(--border-subtle)]" title={hasVisibleContent ? 'Edit Caption' : 'Add Caption'} aria-label={hasVisibleContent ? 'Edit Caption' : 'Add Caption'}><Pen size={15} aria-hidden="true" /></button>
	                    )}
	                    <button type="button" data-reaction-action="pin" style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined} onClick={() => { togglePinnedMessage(m); closeActionMenu('action_pin'); }} className={`message-action-button md:hover:bg-[var(--border-subtle)] ${m.is_pinned ? 'text-[var(--theme-base)]' : 'text-gray-500 hover:text-[var(--theme-base)]'}`} title={m.is_pinned ? 'Unpin' : 'Pin'} aria-label={m.is_pinned ? 'Unpin' : 'Pin'}><Pin size={15} aria-hidden="true" /></button>
	                    {firstImageUrl && (
	                      <a href={firstImageUrl} target="_blank" rel="noopener noreferrer" download={imageAttachments[0]?.file_name || true} onClick={(e) => { e.stopPropagation(); closeActionMenu('action_download'); }} className="message-action-button text-gray-500 hover:text-[var(--theme-base)] md:hover:bg-[var(--border-subtle)]" title="Download" aria-label="Download">
	                        <Download size={15} aria-hidden="true" />
	                      </a>
	                    )}
	                    <button type="button" data-reaction-action="delete" style={reactionInputMode === 'touch' ? TOUCH_ACTION_STYLE : undefined} onClick={() => { setShowReceiptDetails(false); setInlineDeleteMessageId(m.id); setInlineDeleteStep('options'); }} className="message-action-button text-gray-500 hover:text-red-400 md:hover:bg-red-500/10" title="Hide/Delete" aria-label="Hide or Delete"><Trash2 size={15} aria-hidden="true" /></button>
	                    {showReceiptDetails && (
	                      <div className="mt-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 px-2.5 py-2 text-[11px] text-gray-400 shadow-inner md:col-span-full">
	                        {receiptRows.map(row => (
	                          <div key={row.label} className="flex items-center justify-between gap-4 py-0.5">
	                            <span className="font-bold text-gray-500">{row.label}</span>
	                            <span className="text-right text-[var(--text-main)]">{row.value}</span>
	                          </div>
	                        ))}
	                      </div>
	                    )}
                  </>
                )}
              </div>
              </ActionToolbarHost>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  )
})
