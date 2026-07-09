import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import imageCompression from 'browser-image-compression'
import { cacheThumbnail } from '../lib/cacheManager'
import { importPrivateKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm, encryptBinaryAesGcm, decryptBinaryAesGcm } from '../lib/crypto'
import { audioSys } from '../lib/SoundEngine'
import { safeHttpUrl } from '../lib/security'
import { normalizeReactionEmoji } from '../lib/reactions'

const KeyboardImage =
  window.__messappKeyboardImagePlugin ||
  registerPlugin('KeyboardImage')

window.__messappKeyboardImagePlugin = KeyboardImage
const MESSAGE_SELECT_BASE = '*, profiles!fk_messages_profile(username, avatar_url, public_key), message_reactions(*)'
const MESSAGE_SELECT = `${MESSAGE_SELECT_BASE}, message_attachments(*)`
const INITIAL_MESSAGE_LIMIT = 50

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

const safeCacheSave = (targetId, dataArray) => {
  try {
    const persisted = dataArray
      .filter(message => message && !message.__local && !message.__retry_payload)
      .slice(-INITIAL_MESSAGE_LIMIT)
      .map(message => {
        const persistedMessage = { ...message }
        delete persistedMessage.__delivery_status
        delete persistedMessage.__local
        delete persistedMessage.__retry_payload
        return persistedMessage
      })
    localStorage.setItem(`local_chat_${targetId}`, JSON.stringify(persisted))
  } catch (_err) {}
}

const safeCacheLoad = (targetId) => {
  try { return (JSON.parse(localStorage.getItem(`local_chat_${targetId}`)) || []).slice(-INITIAL_MESSAGE_LIMIT) } catch (_err) { return [] }
}

const mergeMessageLists = (previous = [], incoming = [], field, targetId) => {
  const map = new Map()

  previous
    .filter(message => message && message.id && message[field] === targetId)
    .forEach(message => map.set(message.id, message))

  incoming
    .filter(message => message && message.id && message[field] === targetId)
    .forEach(message => {
      const existing = map.get(message.id)
      map.set(message.id, {
        ...existing,
        ...message,
        profiles: message.profiles || existing?.profiles,
        message_reactions: message.message_reactions || existing?.message_reactions || [],
        message_attachments: message.message_attachments?.length
          ? message.message_attachments
          : existing?.message_attachments || []
      })
    })

  return Array.from(map.values())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

const getAttachmentKind = (file) => file.type?.startsWith('image/') ? 'image' : 'file'
const isReadableDecryptedContent = (value) => value !== null && value !== undefined && !String(value).includes('[Encrypted Message - Unreadable]')
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
const BLOCKED_FILE_TYPES = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript', 'text/javascript'])
const BLOCKED_FILE_EXTENSIONS = /\.(?:svg|html?|xhtml|js|mjs)$/i
const isNativeAndroidKeyboardImageCandidate = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const normalizeFileType = (value) => (value || 'application/octet-stream').toLowerCase()
const isDebugEnabled = (key) => {
  try { return localStorage.getItem(key) === 'true' } catch (_err) { return false }
}
const createLocalMessageId = () => `local-${crypto.randomUUID()}`
const getLocalProfile = (session, myUsername) => ({
  username: myUsername,
  avatar_url: session?.user?.user_metadata?.avatar_url || null,
  public_key: localStorage.getItem(`e2ee_public_key_${session?.user?.id}`) || null
})

const asMessageId = (value) => {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim()) return value.id
  return null
}

const logMessageSendError = (scope, err, payload = {}) => {
  console.error('[MESSAGE_SEND_ERROR]', scope, {
    error: err ? {
      name: err.name,
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint
    } : null,
    payload
  })
}

const findMatchingLocalMessage = (messageList, nextMessage) => {
  return messageList.find(message => {
    if (!message?.__local || message.profile_id !== nextMessage.profile_id) return false
    if (message.reply_to_message_id !== nextMessage.reply_to_message_id) return false
    const sameText = String(message.content || '') === String(nextMessage.content || '')
    const localHasAttachment = (message.message_attachments || []).length > 0
    const nextHasAttachment = (nextMessage.message_attachments || []).length > 0
    return sameText || (localHasAttachment && nextHasAttachment)
  })
}

const validateAttachmentFile = (file, expectedKind = 'file') => {
  if (!file) throw new Error('Select a file before sending.')
  const type = normalizeFileType(file.type)
  const name = file.name || ''
  const kind = getAttachmentKind(file)

  if (expectedKind === 'image' || kind === 'image') {
    if (!ALLOWED_IMAGE_TYPES.has(type)) throw new Error('Only JPG, PNG, GIF, WebP, and AVIF images can be sent.')
    if (file.size > MAX_IMAGE_SIZE_BYTES) throw new Error('Images must be 10 MB or smaller.')
    return
  }

  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('Files must be 25 MB or smaller.')
  if (BLOCKED_FILE_TYPES.has(type) || BLOCKED_FILE_EXTENSIONS.test(name)) {
    throw new Error('This file type is blocked for security.')
  }
}

const bufferToDataUrl = (buffer, type = 'application/octet-stream') => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:${type};base64,${btoa(binary)}`
}

const decryptAttachmentPayload = async (sharedKeys, encryptedPayload) => {
  const keysToTry = [sharedKeys?.main, ...(sharedKeys?.legacy || [])].filter(Boolean)
  for (const key of keysToTry) {
    try {
      return await decryptBinaryAesGcm(key, encryptedPayload)
    } catch (_err) {}
  }
  throw new Error('Attachment could not be decrypted')
}

export function useChatManager(session, activeChannel, activeDm, view, dms) {
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
  const [isUploading, setIsUploading] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [localDeletedMessages, setLocalDeletedMessages] = useState(() => JSON.parse(localStorage.getItem(`deleted_msgs_${session.user.id}`) || '[]'))
  const [pendingFile, setPendingFile] = useState(null)
  const [keyboardImageFallbackMessage, setKeyboardImageFallbackMessage] = useState('')
  const [showLatestMessagesButton, setShowLatestMessagesButton] = useState(false)
  const [peerReadAt, setPeerReadAt] = useState(null)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false)

  const fileInputRef = useRef(null)
  const genericFileInputRef = useRef(null)
  const messageInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const typingChannelRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const seenReceiptWriteRef = useRef('')
  const ownSendScrollRef = useRef({ targetId: null, active: false })
  
  const sharedKeysCacheRef = useRef({})

  const myUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0]

  useEffect(() => { localStorage.setItem(`deleted_msgs_${session.user.id}`, JSON.stringify(localDeletedMessages)) }, [localDeletedMessages, session.user.id])

  const getScrollSnapshot = useCallback(() => {
    const target = scrollContainerRef.current
    if (!target) return null
    const { scrollTop, scrollHeight, clientHeight } = target
    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      distanceFromBottom: scrollHeight - scrollTop - clientHeight
    }
  }, [])

  const isNearBottom = useCallback((threshold = 150) => {
    const snapshot = getScrollSnapshot()
    return !snapshot || snapshot.distanceFromBottom < threshold
  }, [getScrollSnapshot])

  const instantScrollToBottom = useCallback((reason = 'instant') => {
    const before = getScrollSnapshot()
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
        }
        setShowLatestMessagesButton(false)
        if (isDebugEnabled('messappDebugScroll')) {
          console.debug('[SCROLL_DEBUG]', { handler: 'instantScrollToBottom', reason, before, after: getScrollSnapshot() })
        }
      })
    }, 10)
  }, [getScrollSnapshot])

  const smoothScrollToBottom = useCallback((reason = 'smooth') => {
    const before = getScrollSnapshot()
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' })
        }
        setShowLatestMessagesButton(false)
        if (isDebugEnabled('messappDebugScroll')) {
          console.debug('[SCROLL_DEBUG]', { handler: 'smoothScrollToBottom', reason, before, after: getScrollSnapshot() })
        }
      })
    }, 10)
  }, [getScrollSnapshot])

  const fetchPeerReadAt = useCallback(async (targetId) => {
    if (!targetId || view !== 'home' || !activeDm?.profiles?.id) {
      setPeerReadAt(null)
      return
    }

      const { data } = await supabase
      .from('dm_reads')
      .select('last_read_at')
      .eq('dm_room_id', targetId)
      .eq('profile_id', activeDm.profiles.id)
      .maybeSingle()
    setPeerReadAt(data?.last_read_at || null)
  }, [activeDm?.profiles?.id, view])

  const markIncomingSeen = useCallback(async (targetId, messageList) => {
    if (view !== 'home' || !targetId || document.visibilityState !== 'visible') {
      if (isDebugEnabled('messappDebugReceipts')) console.debug('[RECEIPT_DEBUG]', { handler: 'markIncomingSeen', earlyReturn: true, view, targetId, visibilityState: document.visibilityState })
      return
    }
    const latestIncoming = messageList
      .filter(message => message?.dm_room_id === targetId && message.profile_id !== session.user.id && message.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    if (!latestIncoming?.created_at) {
      if (isDebugEnabled('messappDebugReceipts')) console.debug('[RECEIPT_DEBUG]', { handler: 'markIncomingSeen', earlyReturn: true, reason: 'no-incoming-created-at', currentUserId: session.user.id, targetId })
      return
    }

    const readAt = latestIncoming.created_at
    if (seenReceiptWriteRef.current === `${targetId}:${readAt}`) return
    seenReceiptWriteRef.current = `${targetId}:${readAt}`

    const { error } = await supabase
      .from('dm_reads')
      .upsert({ profile_id: session.user.id, dm_room_id: targetId, last_read_at: readAt })
    if (error) {
      seenReceiptWriteRef.current = ''
      console.warn('[RECEIPT_DEBUG] seen receipt write failed.', { targetId, currentUserId: session.user.id, readAt, error })
    } else if (isDebugEnabled('messappDebugReceipts')) {
      console.debug('[RECEIPT_DEBUG]', { handler: 'markIncomingSeen', targetId, currentUserId: session.user.id, readAt, writeSucceeded: true })
    }
  }, [session.user.id, view])

  const getSharedKeysForTarget = useCallback(async (targetId, isDm, rawMsgData = []) => {
    if (!isDm) return null;
    if (sharedKeysCacheRef.current[targetId]) return sharedKeysCacheRef.current[targetId];
    
    let targetPubStr = null;
    
    if (activeDm && activeDm.dm_room_id === targetId && activeDm.profiles?.public_key) {
      targetPubStr = activeDm.profiles.public_key;
    } else {
      const dm = dms.find(d => d.dm_room_id === targetId);
      if (dm?.profiles?.public_key) {
        targetPubStr = dm.profiles.public_key;
      } else {
        const theirMsg = rawMsgData.find(m => m.profile_id !== session.user.id && m.profiles?.public_key);
        if (theirMsg) targetPubStr = theirMsg.profiles.public_key;
      }
    }

    const isSelfDM = activeDm?.profiles?.id === session.user.id;
    if (!targetPubStr && isSelfDM) {
       targetPubStr = localStorage.getItem(`e2ee_public_key_${session.user.id}`);
    }

    try {
      const keys = { main: null, legacy: [] };
      const privKeyStr = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
      let mainImpPriv = null;
      
      if (privKeyStr) {
        const privJwk = JSON.parse(privKeyStr);
        mainImpPriv = await importPrivateKey(privJwk);
        
        if (targetPubStr) {
           const pubJwk = JSON.parse(targetPubStr);
           try { keys.main = await deriveSharedAesKey(mainImpPriv, { ...pubJwk, ext: true }); } catch(_err){}
        }
        
        try {
            const selfPubJwk = { kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y, ext: true };
            keys.legacy.push(await deriveSharedAesKey(mainImpPriv, selfPubJwk));
        } catch(_err){}
      }

      const legacyKeysStr = localStorage.getItem(`e2ee_legacy_keys_${session.user.id}`);
      if (legacyKeysStr) {
        const legacyJwks = JSON.parse(legacyKeysStr);
        for (const ljwk of legacyJwks) {
          try {
            const impL = await importPrivateKey({ ...ljwk, ext: true });
            if (targetPubStr) {
               const pubJwk = JSON.parse(targetPubStr);
               try { keys.legacy.push(await deriveSharedAesKey(impL, { ...pubJwk, ext: true })); } catch(_err){}
            }
            
            try {
                const legacyPubJwk = { kty: ljwk.kty, crv: ljwk.crv, x: ljwk.x, y: ljwk.y, ext: true };
                keys.legacy.push(await deriveSharedAesKey(impL, legacyPubJwk));
                if (mainImpPriv) keys.legacy.push(await deriveSharedAesKey(mainImpPriv, legacyPubJwk));
            } catch(_err){}
          } catch(_err) {}
        }
      }
      
      sharedKeysCacheRef.current[targetId] = keys;
      return keys;
    } catch (_err) {
      return null;
    }
  }, [activeDm, dms, session.user.id]);

  const buildEncryptedPayload = useCallback(async (content, targetId, sharedKeys, rawMsgData = []) => {
    if (!sharedKeys?.main) {
      if (view === 'home') throw new Error('DM encryption key unavailable')
      return content
    }
    try {
      const encrypted = await encryptWithAesGcm(sharedKeys.main, content);
      if (view === 'home') {
        let targetPubStr = null;
        if (activeDm?.dm_room_id === targetId && activeDm?.profiles?.public_key) {
            targetPubStr = activeDm.profiles.public_key;
        } else {
            const dm = dms.find(d => d.dm_room_id === targetId);
            if (dm?.profiles?.public_key) {
                targetPubStr = dm.profiles.public_key;
            } else {
              const theirMsg = rawMsgData.find(m => m.profile_id !== session.user.id && m.profiles?.public_key);
              if (theirMsg) targetPubStr = theirMsg.profiles.public_key;
            }
        }

        const myPubStr = localStorage.getItem(`e2ee_public_key_${session.user.id}`);
        if (targetPubStr && myPubStr) {
          encrypted.spub = { ...JSON.parse(myPubStr), ext: true }; 
          encrypted.tpub = { ...JSON.parse(targetPubStr), ext: true }; 
        }
      }
      return JSON.stringify(encrypted);
    } catch (e) {
      if (view === 'home') throw e
      return content
    }
  }, [activeDm, dms, session.user.id, view]);

  const decryptMessageList = useCallback(async (msgList, sharedKeys) => {
    return await Promise.all(msgList.map(async (msg) => {
      const attachments = msg.message_attachments || []
      let attachmentPatch = {}
      let resolvedAttachments = attachments
      if (attachments.length > 0) {
        const attachment = attachments[0]
        const encryptedAttachment = attachment.file_type?.startsWith('encrypted:')
        try {
          if (encryptedAttachment) {
            const response = await fetch(attachment.file_url)
            const encryptedPayload = await response.json()
            const decryptedBuffer = await decryptAttachmentPayload(sharedKeys, encryptedPayload)
            const originalType = normalizeFileType(attachment.file_type.replace('encrypted:', '') || encryptedPayload.type || 'application/octet-stream')
            const safeType = ALLOWED_IMAGE_TYPES.has(originalType) ? originalType : 'application/octet-stream'
            const dataUrl = bufferToDataUrl(decryptedBuffer, safeType)
            const resolvedSize = encryptedPayload.size || attachment.file_size
            const resolvedAttachment = {
              ...attachment,
              file_url: dataUrl,
              file_type: safeType,
              file_name: encryptedPayload.name || attachment.file_name,
              file_size: resolvedSize
            }
            resolvedAttachments = attachments.map(item => item.id === attachment.id ? resolvedAttachment : item)
            attachmentPatch = safeType.startsWith('image/')
              ? { image_url: dataUrl, file_name: resolvedAttachment.file_name, file_size: formatBytes(resolvedSize), decrypted_attachment_url: dataUrl }
              : { file_url: dataUrl, file_name: resolvedAttachment.file_name, file_size: formatBytes(resolvedSize), decrypted_attachment_url: dataUrl }
          } else if (!encryptedAttachment) {
            attachmentPatch = attachment.file_type?.startsWith('image/')
              ? { image_url: attachment.file_url, file_name: attachment.file_name, file_size: formatBytes(attachment.file_size) }
              : { file_url: attachment.file_url, file_name: attachment.file_name, file_size: formatBytes(attachment.file_size) }
          }
        } catch (_err) {
          resolvedAttachments = attachments.map(item => item.id === attachment.id ? { ...item, file_url: '', is_unavailable: true } : item)
          attachmentPatch = { message_attachments: resolvedAttachments, attachment_error: true }
        }
        attachmentPatch = { ...attachmentPatch, message_attachments: resolvedAttachments }
      }
      const contentStr = typeof msg.content === 'object' && msg.content !== null ? JSON.stringify(msg.content) : msg.content;
      
      if (contentStr && typeof contentStr === 'string' && contentStr.startsWith('{') && contentStr.includes('ciphertext')) {
        try {
          const encObj = JSON.parse(contentStr);
          if (encObj.iv && encObj.ciphertext) {
            let decryptedContent = null;
            let unlocked = false;

            if (encObj.spub && encObj.tpub) {
              const amISender = msg.profile_id === session.user.id;
              const rawHistoricalPub = amISender ? encObj.tpub : encObj.spub;
              const theirHistoricalPub = { ...rawHistoricalPub, ext: true };
              
              const keysToTry = [];
              const privKeyStr = localStorage.getItem(`e2ee_private_key_${session.user.id}`);
              if (privKeyStr) keysToTry.push(JSON.parse(privKeyStr));
              const legacyKeysStr = localStorage.getItem(`e2ee_legacy_keys_${session.user.id}`);
              if (legacyKeysStr) keysToTry.push(...JSON.parse(legacyKeysStr));

              for (const privJwk of keysToTry) {
                 try {
                    const impPriv = await importPrivateKey({ ...privJwk, ext: true });
                    const historicalShared = await deriveSharedAesKey(impPriv, theirHistoricalPub);
                    const attempt = await decryptWithAesGcm(historicalShared, encObj);
                    
                    if (isReadableDecryptedContent(attempt)) {
                        decryptedContent = attempt;
                        unlocked = true;
                        break;
                    }
                 } catch(_err) {}
              }
            }

            if (!unlocked && sharedKeys?.main) {
              try { 
                const attempt = await decryptWithAesGcm(sharedKeys.main, encObj); 
                if (isReadableDecryptedContent(attempt)) {
                    decryptedContent = attempt; 
                    unlocked = true; 
                }
              } catch(_err) {}
            }
            if (!unlocked && sharedKeys?.legacy) {
              for (const lKey of sharedKeys.legacy) {
                try { 
                  const attempt = await decryptWithAesGcm(lKey, encObj); 
                  if (isReadableDecryptedContent(attempt)) {
                      decryptedContent = attempt; 
                      unlocked = true; 
                      break; 
                  }
                } catch(_err) {}
              }
            }

            if (unlocked) {
               const finalMsg = { ...msg, ...attachmentPatch, content: decryptedContent };
               delete finalMsg.is_unreadable;
               return finalMsg;
            } else {
               if (msg.image_url || msg.file_url || attachmentPatch.image_url || attachmentPatch.file_url || attachmentPatch.message_attachments?.length) {
                   const cleanedMsg = { ...msg, ...attachmentPatch, content: '' };
                   delete cleanedMsg.is_unreadable;
                   return cleanedMsg;
               }
               return { ...msg, content: '', is_unreadable: true };
            }
          }
        } catch (_err) {
          if (msg.image_url || msg.file_url || attachmentPatch.image_url || attachmentPatch.file_url || attachmentPatch.message_attachments?.length) {
             const cleanedMsg = { ...msg, ...attachmentPatch, content: '' };
             delete cleanedMsg.is_unreadable;
             return cleanedMsg;
          }
          return { ...msg, content: '', is_unreadable: true };
        }
      }
      return { ...msg, ...attachmentPatch, content: contentStr };
    }));
  }, [session.user.id]);

  const queuePendingAttachmentFromFile = useCallback((file) => {
    if (!file) return false
    const kind = getAttachmentKind(file)
    try {
      validateAttachmentFile(file, kind)
      setPendingFile({
        file,
        type: kind,
        name: file.name || (kind === 'image' ? 'keyboard-image.png' : 'attachment'),
        size: file.size
      })
      return true
    } catch (error) {
      toast.error(error.message)
      return false
    }
  }, [])

  const fileFromNativeKeyboardImage = useCallback(async ({ uri, path, filename, mimeType }) => {
    const sourceUri = uri || (path ? `file://${path}` : '')
    if (!sourceUri) throw new Error('Keyboard image URI missing')

    const response = await fetch(Capacitor.convertFileSrc(sourceUri))
    if (!response.ok) throw new Error('Keyboard image could not be loaded')

    const blob = await response.blob()
    const type = mimeType || blob.type || 'application/octet-stream'
    return new File([blob], filename || 'keyboard-image', { type })
  }, [])

  useEffect(() => {
    if (!isNativeAndroidKeyboardImageCandidate()) return undefined

    let isMounted = true
    let imageListener
    let errorListener

    const setupKeyboardImageBridge = async () => {
      if (!Capacitor.isPluginAvailable('KeyboardImage')) {
        if (isMounted) setKeyboardImageFallbackMessage('Keyboard GIF insert is not supported on this device. Use the attachment button instead.')
        return
      }

      try {
        const availability = await KeyboardImage.isAvailable()
        if (!availability?.available) {
          if (isMounted) setKeyboardImageFallbackMessage('Keyboard GIF insert is not supported on this device. Use the attachment button instead.')
          return
        }

        if (isMounted) setKeyboardImageFallbackMessage('')
        imageListener = await KeyboardImage.addListener('keyboardImageReceived', async (payload) => {
          try {
            const file = await fileFromNativeKeyboardImage(payload)
            queuePendingAttachmentFromFile(file)
          } catch (_err) {
            toast.error('Keyboard image could not be added.')
          }
        })
        errorListener = await KeyboardImage.addListener('keyboardImageError', () => {
          toast.error('Keyboard image could not be added.')
        })
      } catch (_err) {
        if (isMounted) setKeyboardImageFallbackMessage('Keyboard GIF insert is not supported on this device. Use the attachment button instead.')
      }
    }

    setupKeyboardImageBridge()

    return () => {
      isMounted = false
      imageListener?.remove()
      errorListener?.remove()
    }
  }, [fileFromNativeKeyboardImage, queuePendingAttachmentFromFile])

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || e.dataTransfer?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' || item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file && queuePendingAttachmentFromFile(file)) {
          e.preventDefault();
          return;
        }
      }
    }
  }, [queuePendingAttachmentFromFile]);

  const handleBeforeInput = useCallback((e) => {
    const items = e.dataTransfer?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' || item.type?.startsWith('image/')) {
        const file = item.getAsFile();
        if (file && queuePendingAttachmentFromFile(file)) {
          e.preventDefault();
          return;
        }
      }
    }
  }, [queuePendingAttachmentFromFile]);

  const fetchSurroundingMessages = async (targetMessage) => {
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    const { data: olderMessages } = await supabase.from('messages').select(MESSAGE_SELECT).eq(field, targetId).lt('created_at', targetMessage.created_at).order('created_at', { ascending: false }).limit(20)
    const { data: newerMessages } = await supabase.from('messages').select(MESSAGE_SELECT).eq(field, targetId).gte('created_at', targetMessage.created_at).order('created_at', { ascending: true }).limit(20)

    if (olderMessages || newerMessages) {
      const combinedMessages = [...(olderMessages || []).reverse(), ...(newerMessages || [])]
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', combinedMessages);
      const decryptedData = await decryptMessageList(combinedMessages, sharedKeys);

      setMessages(prev => {
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
      .select(MESSAGE_SELECT)
      .eq(field, targetId)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { setIsLoadingMore(false); return; }
    if (data.length < 50) setHasMoreMessages(false);

    if (data.length > 0) {
      const chronoData = data.reverse();
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', chronoData);
      const decryptedData = await decryptMessageList(chronoData, sharedKeys);
      
      let anchorOffsetTop = 0;
      let previousScrollTop = 0;
      if (scrollContainerRef.current) {
        const anchorElement = document.getElementById(`message-${oldestMessage.id}`);
        if (anchorElement) {
           anchorOffsetTop = anchorElement.offsetTop;
           previousScrollTop = scrollContainerRef.current.scrollTop;
        }
      }

      setMessages(prev => {
        const safePrev = prev.filter(m => m[field] === targetId);
        const merged = [...decryptedData, ...safePrev];
        const uniqueData = Array.from(new Map(merged.filter(m => m && m.id).map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, uniqueData);
        return uniqueData;
      });

      setIsLoadingMore(false);

      if (anchorOffsetTop > 0) {
        setTimeout(() => {
           requestAnimationFrame(() => {
             const newAnchorElement = document.getElementById(`message-${oldestMessage.id}`);
             if (newAnchorElement && scrollContainerRef.current) {
               scrollContainerRef.current.scrollTop = previousScrollTop + (newAnchorElement.offsetTop - anchorOffsetTop);
             }
           });
        }, 0);
      }
    } else {
      setIsLoadingMore(false);
    }
  }, [activeChannel?.id, activeDm?.dm_room_id, view, isLoadingMore, hasMoreMessages, messages, getSharedKeysForTarget, decryptMessageList]);

  const handleScroll = (e) => {
    const target = e.target
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    setShowLatestMessagesButton(distanceFromBottom > 180)
    if (target.scrollTop <= 5) fetchOlderMessages();
  };

  const scrollToLatestMessages = useCallback(() => {
    smoothScrollToBottom()
  }, [smoothScrollToBottom])

  const fetchCurrentMessages = useCallback(async () => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) return;

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    setMessagesLoading(true)

    const cachedData = safeCacheLoad(targetId)
    if (cachedData.length > 0) {
      const validCache = Array.from(new Map(cachedData.filter(m => m && m.id).map(item => [item.id, item])).values())
      setMessages(prev => mergeMessageLists(prev, validCache, field, targetId))
    }

    try {
    const { data } = await supabase.from('messages').select(MESSAGE_SELECT).eq(field, targetId).order('created_at', { ascending: false }).limit(INITIAL_MESSAGE_LIMIT)
      
    if (data) {
      if (data.length < INITIAL_MESSAGE_LIMIT) setHasMoreMessages(false);
      const chronoData = data.reverse() 
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', chronoData);
      const decryptedData = await decryptMessageList(chronoData, sharedKeys);

      setMessages(prev => {
        const updated = mergeMessageLists(prev, decryptedData, field, targetId)
        safeCacheSave(targetId, updated)
        return updated
      })

      requestAnimationFrame(() => {
        setTimeout(() => {
          instantScrollToBottom('initial_fetch_loaded')
        }, 80)
      })
      }
    } finally {
      setInitialMessagesLoaded(true)
      setMessagesLoading(false)
    }
  }, [activeChannel?.id, activeDm?.dm_room_id, view, getSharedKeysForTarget, decryptMessageList, instantScrollToBottom])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) { setMessages([]); setTypingUsers([]); setMessagesLoading(false); setInitialMessagesLoaded(false); return; }
    
    setHasMoreMessages(true);
    const cachedMessages = safeCacheLoad(targetId)
    setInitialMessagesLoaded(false)
    setMessagesLoading(true)
    setMessages(cachedMessages)
    requestAnimationFrame(() => instantScrollToBottom('chat_switch_cache'))

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    fetchCurrentMessages() 
    fetchPeerReadAt(targetId)

    const roomChannel = supabase.channel(`room:${targetId}`)
    
    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState()
      const rawTypers = Object.values(state).flatMap(p => p).filter(p => p.user_id !== session.user.id)
      const uniqueTypers = Array.from(new Map(rawTypers.map(p => [p.user_id, p])).values())
      setTypingUsers(uniqueTypers)
    })

    roomChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `${field}=eq.${targetId}` }, (payload) => {
      if (payload.eventType === 'INSERT') {
        (async () => {
          const [
            { data: fullMsg },
            { data: attachments }
          ] = await Promise.all([
            supabase.from('messages').select(MESSAGE_SELECT_BASE).eq('id', payload.new.id).single(),
            supabase.from('message_attachments').select('*').eq('message_id', payload.new.id)
          ])
          if (fullMsg) {
            const messageWithAttachments = { ...fullMsg, message_attachments: attachments || [] }
            const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [messageWithAttachments]);
            const [decryptedMsg] = await decryptMessageList([messageWithAttachments], sharedKeys);

            const isAtBottom = isNearBottom()

            let didAppendMessage = false
            let replacedLocalEcho = false
            setMessages(prev => {
              if (prev.some(msg => msg.id === decryptedMsg.id)) return prev; 
              const safePrev = prev.filter(m => m[field] === targetId);
              if (decryptedMsg[field] !== targetId) return safePrev;
              const matchingLocal = decryptedMsg.profile_id === session.user.id ? findMatchingLocalMessage(safePrev, decryptedMsg) : null
              const updated = matchingLocal
                ? safePrev.map(msg => msg.id === matchingLocal.id ? { ...decryptedMsg, __delivery_status: 'sent' } : msg)
                : [...safePrev, decryptedMsg]
              didAppendMessage = !matchingLocal
              replacedLocalEcho = Boolean(matchingLocal)
              updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
              safeCacheSave(targetId, updated);
              return updated;
            })
            
            if (decryptedMsg.profile_id !== session.user.id) {
              audioSys.playMessageReceived();
            }
            
            if (replacedLocalEcho) {
              ownSendScrollRef.current = { targetId: null, active: false }
              if (isDebugEnabled('messappDebugScroll')) {
                console.debug('[SCROLL_DEBUG]', { handler: 'realtime-insert', reason: 'replaced-local-echo', messageId: decryptedMsg.id, targetId })
              }
            } else if (didAppendMessage && (isAtBottom || decryptedMsg.profile_id === session.user.id)) {
              const reason = decryptedMsg.profile_id === session.user.id ? 'own-realtime-insert' : 'incoming-at-bottom'
              if (decryptedMsg.profile_id === session.user.id && ownSendScrollRef.current.active) {
                instantScrollToBottom(reason)
                ownSendScrollRef.current = { targetId: null, active: false }
              } else {
                smoothScrollToBottom(reason)
              }
            } else if (didAppendMessage) {
              setShowLatestMessagesButton(true);
            }
          }
        })();
      }
      
      if (payload.eventType === 'UPDATE') {
        (async () => {
          const { data: fullMsg } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', payload.new.id).single()
          const messageToDecrypt = fullMsg || payload.new
          const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [messageToDecrypt]);
          const [decryptedMsg] = await decryptMessageList([messageToDecrypt], sharedKeys);

          setMessages(current => {
            const updated = current.map(msg => {
              if (msg.id !== decryptedMsg.id) return msg
              return {
                ...msg,
                ...decryptedMsg,
                profiles: decryptedMsg.profiles || msg.profiles,
                message_reactions: decryptedMsg.message_reactions || msg.message_reactions,
                message_attachments: decryptedMsg.message_attachments?.length ? decryptedMsg.message_attachments : msg.message_attachments
              }
            })
            safeCacheSave(targetId, updated)
            return updated
          })
        })();
      }
      
      if (payload.eventType === 'DELETE') {
        setMessages(current => {
          const updated = current.filter(msg => msg.id !== payload.old.id)
          safeCacheSave(targetId, updated)
          return updated
        })
      }
    })

    roomChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_attachments' }, (payload) => {
      (async () => {
        const { data: fullMsg } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', payload.new.message_id).single()
        if (!fullMsg || fullMsg[field] !== targetId) return
        const attachments = fullMsg.message_attachments?.length ? fullMsg.message_attachments : [payload.new]
        const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [fullMsg])
        const [decryptedMsg] = await decryptMessageList([{ ...fullMsg, message_attachments: attachments }], sharedKeys)

        setMessages(current => {
          const safePrev = current.filter(m => m[field] === targetId)
          const updated = safePrev.some(msg => msg.id === decryptedMsg.id)
            ? safePrev.map(msg => msg.id === decryptedMsg.id ? { ...msg, ...decryptedMsg } : msg)
            : [...safePrev, decryptedMsg]
          updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          safeCacheSave(targetId, updated)
          return updated
        })
      })()
    })

    roomChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
      (async () => {
        const messageId = payload.new?.message_id || payload.old?.message_id
        if (!messageId) return
        const { data: fullMsg } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', messageId).single()
        if (!fullMsg || fullMsg[field] !== targetId) return
        const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [fullMsg])
        const [decryptedMsg] = await decryptMessageList([fullMsg], sharedKeys)

        setMessages(current => {
          if (!current.some(msg => msg.id === decryptedMsg.id)) return current
          const updated = current.map(msg => msg.id === decryptedMsg.id ? {
            ...msg,
            ...decryptedMsg,
            profiles: decryptedMsg.profiles || msg.profiles,
            message_attachments: decryptedMsg.message_attachments?.length ? decryptedMsg.message_attachments : msg.message_attachments
          } : msg)
          safeCacheSave(targetId, updated)
          return updated
        })
      })()
    })

    roomChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dm_reads', filter: `dm_room_id=eq.${targetId}` },
      (payload) => {
        const row = payload.new?.dm_room_id ? payload.new : payload.old
        const peerId = activeDm?.profiles?.id

        if (view !== 'home' || !peerId || row?.profile_id !== peerId) return

        setPeerReadAt(payload.eventType === 'DELETE' ? null : row.last_read_at || null)

        if (isDebugEnabled('messappDebugReceipts')) {
          console.debug('[RECEIPT_DEBUG]', {
            handler: 'dm_reads_realtime',
            eventType: payload.eventType,
            peerId,
            lastReadAt: row?.last_read_at
          })
        }
      }
    )

    roomChannel.subscribe()
    typingChannelRef.current = roomChannel

    return () => {
      supabase.removeChannel(roomChannel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [
    activeChannel?.id,
    activeDm?.dm_room_id,
    activeDm?.profiles?.id,
    view,
    session.user.id
  ])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId || messages.length === 0) return

    const targetMessages = messages.filter(message => message?.[view === 'server' ? 'channel_id' : 'dm_room_id'] === targetId)
    markIncomingSeen(targetId, targetMessages)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') markIncomingSeen(targetId, targetMessages)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [activeChannel?.id, activeDm?.dm_room_id, markIncomingSeen, messages, view])

  const toggleReaction = async (messageId, emoji, hasReacted) => {
    const reactionEmoji = normalizeReactionEmoji(emoji)
    if (!messageId || !reactionEmoji || !session?.user?.id) return
    try {
      if (hasReacted) {
        const { error } = await supabase.from('message_reactions').delete().match({ message_id: messageId, profile_id: session.user.id })
        if (error) throw error
      } else {
        const { error: deleteError } = await supabase.from('message_reactions').delete().match({ message_id: messageId, profile_id: session.user.id })
        if (deleteError) throw deleteError
        const { error: insertError } = await supabase.from('message_reactions').insert([{ message_id: messageId, profile_id: session.user.id, emoji: reactionEmoji }])
        if (insertError) throw insertError
      }
      
      setMessages(current => {
        const updated = current.map(msg => {
          if (msg.id === messageId) {
            const currentReactions = msg.message_reactions || []
            const newReactions = hasReacted 
              ? currentReactions.filter(r => r.profile_id !== session.user.id)
              : [
                  ...currentReactions.filter(r => r.profile_id !== session.user.id),
                  { profile_id: session.user.id, emoji: reactionEmoji }
                ]
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

  const prepareMessageAttachment = async ({ file, sharedKeys, targetId, gifUrl }) => {
    if (gifUrl) {
      const safeGifUrl = safeHttpUrl(gifUrl)
      if (!safeGifUrl) throw new Error('Invalid GIF URL')
      return {
        file_url: safeGifUrl,
        file_type: 'image/gif',
        file_name: 'animation.gif',
        file_size: 0
      }
    }

    validateAttachmentFile(file)
    const kind = getAttachmentKind(file)
    const shouldCompressImage = kind === 'image' && normalizeFileType(file.type) !== 'image/gif'
    const uploadFile = shouldCompressImage
      ? await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.82 })
      : file
    const fileExt = file.name?.split('.').pop() || (kind === 'image' ? 'png' : 'bin')
    const encrypted = view === 'home'
    const fileName = `${crypto.randomUUID()}.${encrypted ? 'json' : fileExt}`
    const filePath = `${session.user.id}/${targetId}/${fileName}`
    let payload = uploadFile
    let fileType = file.type || 'application/octet-stream'

    if (encrypted) {
      if (!sharedKeys?.main) throw new Error('Attachment encryption key unavailable')
      const encryptedPayload = await encryptBinaryAesGcm(sharedKeys.main, await uploadFile.arrayBuffer())
      payload = new Blob([JSON.stringify({ ...encryptedPayload, type: file.type || uploadFile.type, name: file.name, size: file.size })], { type: 'application/json' })
      fileType = `encrypted:${file.type || uploadFile.type || 'application/octet-stream'}`
    }

    const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, payload, { contentType: payload.type || 'application/octet-stream', upsert: false })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath)
    if (kind === 'image' && !encrypted) cacheThumbnail(targetId || 'global', publicUrl)
    return {
      file_url: publicUrl,
      file_type: fileType,
      file_name: (file.name || `attachment.${fileExt}`).slice(0, 160),
      file_size: file.size
    }
  }

  const insertMessageAttachment = async (messageId, attachment) => {
    if (!messageId) throw new Error('Message ID missing for attachment')
    const payload = {
      message_id: messageId,
      file_url: attachment.file_url,
      file_type: attachment.file_type,
      file_name: attachment.file_name,
      file_size: attachment.file_size
    }
    const { data: createdAttachment, error: attachmentError } = await supabase.from('message_attachments').insert(payload).select().single()
    if (attachmentError) throw attachmentError
    return createdAttachment
  }

  const replaceLocalMessage = useCallback((targetId, localId, nextMessage) => {
    setMessages(prev => {
      const withoutLocal = prev.filter(msg => msg.id !== localId)
      const updated = withoutLocal.some(msg => msg.id === nextMessage.id)
        ? withoutLocal.map(msg => msg.id === nextMessage.id ? { ...msg, ...nextMessage } : msg)
        : [...withoutLocal, nextMessage]
      updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      safeCacheSave(targetId, updated)
      return updated
    })
  }, [])

  const failLocalMessage = useCallback((targetId, localId, retryPayload) => {
    setMessages(prev => {
      const updated = prev.map(msg => msg.id === localId ? {
        ...msg,
        __delivery_status: 'failed',
        __retry_payload: retryPayload
      } : msg)
      safeCacheSave(targetId, updated)
      return updated
    })
  }, [])

  const uploadPendingFile = async (file, caption) => {
    setIsUploading(true);
    const toastId = toast.loading('Uploading attachment...');
    let targetId = null
    let localId = null
    let localAttachmentUrl = ''
    try {
      const field = view === 'server' ? 'channel_id' : 'dm_room_id';
      targetId = asMessageId(view === 'server' ? activeChannel?.id : activeDm?.dm_room_id);
      if (!targetId) {
        toast.error('Select a channel or DM before sending attachments.', { id: toastId })
        return false
      }
      const replyToMessageId = asMessageId(replyingTo)

      localId = createLocalMessageId()
      const attachmentKind = getAttachmentKind(file)
      localAttachmentUrl = attachmentKind === 'image' ? URL.createObjectURL(file) : ''
      const localAttachment = {
        id: `${localId}-attachment`,
        file_url: localAttachmentUrl,
        file_type: file.type || 'application/octet-stream',
        file_name: file.name || (attachmentKind === 'image' ? 'image' : 'attachment'),
        file_size: file.size
      }
      const localCreatedAt = new Date().toISOString()
      setMessages(prev => {
        const updated = [...prev, {
          id: localId,
          __local: true,
          __delivery_status: 'sending',
          __retry_payload: { type: 'attachment', file, caption },
          profile_id: session.user.id,
          profiles: getLocalProfile(session, myUsername),
          content: caption || '',
          created_at: localCreatedAt,
          updated_at: localCreatedAt,
          is_encrypted: view === 'home',
          [field]: targetId,
          reply_to_message_id: replyToMessageId,
          message_reactions: [],
          message_attachments: [localAttachment]
        }]
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        safeCacheSave(targetId, updated)
        return updated
      })
      ownSendScrollRef.current = { targetId, active: true }
      instantScrollToBottom('own-attachment-optimistic')

      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(caption || '', targetId, sharedKeys, messages);
      const attachment = await prepareMessageAttachment({ file, sharedKeys, targetId })

      const messagePayload = {
        profile_id: session.user.id,
        content: contentToSave,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyToMessageId
      }
      const { data: createdMsg, error: insertError } = await supabase.from('messages').insert(messagePayload).select(MESSAGE_SELECT).single();
      if (insertError) {
        logMessageSendError('attachment-message-insert', insertError, messagePayload)
        throw insertError
      }
      if (!createdMsg?.id) throw new Error('Message creation did not return an ID')

      const createdAttachment = await insertMessageAttachment(createdMsg.id, attachment)
      const newMsg = {
        ...createdMsg,
        message_attachments: createdMsg.message_attachments?.length ? createdMsg.message_attachments : [createdAttachment]
      }

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);
      replaceLocalMessage(targetId, localId, { ...decryptedMsg, __delivery_status: 'sent' })
      ownSendScrollRef.current = { targetId: null, active: false }
      audioSys.playMessageSent()

      setReplyingTo(null);
      toast.success('Sent!', { id: toastId });
      return true
    } catch (err) {
      logMessageSendError('attachment-send', err, { targetId, hasFile: Boolean(file), fileName: file?.name, captionLength: caption?.length || 0 })
      toast.error('Upload failed', { id: toastId });
      ownSendScrollRef.current = { targetId: null, active: false }
      if (targetId && localId) failLocalMessage(targetId, localId, { type: 'attachment', file, caption })
      return false
    } finally {
      setIsUploading(false);
      if (localAttachmentUrl) setTimeout(() => URL.revokeObjectURL(localAttachmentUrl), 30000)
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault()
    const text = messageInputRef.current?.value.trim()
    
    if (pendingFile) {
      const fileToSend = pendingFile.file
      setPendingFile(null)
      if (messageInputRef.current) messageInputRef.current.value = ''
      await uploadPendingFile(fileToSend, text);
      return;
    }

    if (!text) return
    if (messageInputRef.current) messageInputRef.current.value = ''
    
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = asMessageId(view === 'server' ? activeChannel?.id : activeDm?.dm_room_id)

    if (!targetId) return toast.error('Select a channel or DM before sending a message.')
    const replyToMessageId = asMessageId(replyingTo)

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
      typingChannelRef.current?.untrack().catch(()=>{})
    }

    const localId = createLocalMessageId()
    const localCreatedAt = new Date().toISOString()
    setMessages(prev => {
      const updated = [...prev, {
        id: localId,
        __local: true,
        __delivery_status: 'sending',
        __retry_payload: { type: 'text', text },
        profile_id: session.user.id,
        profiles: getLocalProfile(session, myUsername),
        content: text,
        created_at: localCreatedAt,
        updated_at: localCreatedAt,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyToMessageId,
        message_reactions: [],
        message_attachments: []
      }]
      updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      safeCacheSave(targetId, updated)
      return updated
    })
    ownSendScrollRef.current = { targetId, active: true }
    instantScrollToBottom('own-text-optimistic')

    try {
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(text, targetId, sharedKeys, messages);

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, is_encrypted: view === 'home', [field]: targetId, reply_to_message_id: replyToMessageId }])
        .select(MESSAGE_SELECT)
        .single()
        
      if (insertError) {
        logMessageSendError('text-message-insert', insertError, { profile_id: session.user.id, content: contentToSave, is_encrypted: view === 'home', [field]: targetId, reply_to_message_id: replyToMessageId })
        throw insertError
      }

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);
      replaceLocalMessage(targetId, localId, { ...decryptedMsg, __delivery_status: 'sent' })
      ownSendScrollRef.current = { targetId: null, active: false }
      audioSys.playMessageSent()

      setReplyingTo(null)
    } catch (err) {
      logMessageSendError('text-send', err, { targetId, textLength: text.length, reply_to_message_id: replyToMessageId })
      toast.error('Failed to send message.')
      ownSendScrollRef.current = { targetId: null, active: false }
      failLocalMessage(targetId, localId, { type: 'text', text })
      if (messageInputRef.current) messageInputRef.current.value = text
    }
  }

  const handleSendGif = async (gifUrl) => {
    setShowGifPicker(false)
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = asMessageId(view === 'server' ? activeChannel?.id : activeDm?.dm_room_id)

    if (!targetId) return toast.error('Select a channel or DM before sending a GIF.')
    const replyToMessageId = asMessageId(replyingTo)
    const localId = createLocalMessageId()
    const localCreatedAt = new Date().toISOString()

    setMessages(prev => {
      const updated = [...prev, {
        id: localId,
        __local: true,
        __delivery_status: 'sending',
        __retry_payload: { type: 'gif', gifUrl },
        profile_id: session.user.id,
        profiles: getLocalProfile(session, myUsername),
        content: '',
        created_at: localCreatedAt,
        updated_at: localCreatedAt,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyToMessageId,
        message_reactions: [],
        message_attachments: [{
          id: `${localId}-attachment`,
          file_url: gifUrl,
          file_type: 'image/gif',
          file_name: 'animation.gif',
          file_size: 0
        }]
      }]
      updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      safeCacheSave(targetId, updated)
      return updated
    })
    ownSendScrollRef.current = { targetId, active: true }
    instantScrollToBottom('own-gif-optimistic')

    try {
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload('', targetId, sharedKeys, messages);
      const attachment = await prepareMessageAttachment({ sharedKeys, targetId, gifUrl })

      const messagePayload = {
        profile_id: session.user.id,
        content: contentToSave,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyToMessageId
      }
      const { data: createdMsg, error: insertError } = await supabase.from('messages')
        .insert(messagePayload)
        .select(MESSAGE_SELECT)
        .single()
        
      if (insertError) {
        logMessageSendError('gif-message-insert', insertError, messagePayload)
        throw insertError
      }
      if (!createdMsg?.id) throw new Error('Message creation did not return an ID')
      const createdAttachment = await insertMessageAttachment(createdMsg.id, attachment)
      const newMsg = {
        ...createdMsg,
        message_attachments: createdMsg.message_attachments?.length ? createdMsg.message_attachments : [createdAttachment]
      }

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);

      replaceLocalMessage(targetId, localId, { ...decryptedMsg, __delivery_status: 'sent' })
      ownSendScrollRef.current = { targetId: null, active: false }
      audioSys.playMessageSent()
      setReplyingTo(null)
    } catch (err) {
      logMessageSendError('gif-send', err, { targetId, gifUrl })
      toast.error('Failed to send GIF.')
      ownSendScrollRef.current = { targetId: null, active: false }
      failLocalMessage(targetId, localId, { type: 'gif', gifUrl })
    }
  }

  const retryFailedMessage = async (message) => {
    const retryPayload = message?.__retry_payload
    if (!retryPayload) return

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = asMessageId(view === 'server' ? activeChannel?.id : activeDm?.dm_room_id)
    if (!targetId) return
    const replyToMessageId = asMessageId(message?.reply_to_message_id)

    setMessages(prev => {
      const updated = prev.filter(msg => msg.id !== message.id)
      safeCacheSave(targetId, updated)
      return updated
    })

    if (retryPayload.type === 'attachment' && retryPayload.file) {
      await uploadPendingFile(retryPayload.file, retryPayload.caption || '')
      return
    }

    if (retryPayload.type === 'gif' && retryPayload.gifUrl) {
      await handleSendGif(retryPayload.gifUrl)
      return
    }

    if (retryPayload.type !== 'text' || !retryPayload.text) return

    const text = retryPayload.text
    const localId = createLocalMessageId()
    const localCreatedAt = new Date().toISOString()
    setMessages(prev => {
      const updated = [...prev, {
        id: localId,
        __local: true,
        __delivery_status: 'sending',
        __retry_payload: { type: 'text', text },
        profile_id: session.user.id,
        profiles: getLocalProfile(session, myUsername),
        content: text,
        created_at: localCreatedAt,
        updated_at: localCreatedAt,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyToMessageId,
        message_reactions: [],
        message_attachments: []
      }]
      updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      safeCacheSave(targetId, updated)
      return updated
    })
    ownSendScrollRef.current = { targetId, active: true }
    instantScrollToBottom('own-retry-optimistic')

    try {
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages)
      const contentToSave = await buildEncryptedPayload(text, targetId, sharedKeys, messages)
      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, is_encrypted: view === 'home', [field]: targetId, reply_to_message_id: replyToMessageId }])
        .select(MESSAGE_SELECT)
        .single()

      if (insertError) {
        logMessageSendError('retry-message-insert', insertError, { profile_id: session.user.id, content: contentToSave, is_encrypted: view === 'home', [field]: targetId, reply_to_message_id: replyToMessageId })
        throw insertError
      }
      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys)
      replaceLocalMessage(targetId, localId, { ...decryptedMsg, __delivery_status: 'sent' })
      ownSendScrollRef.current = { targetId: null, active: false }
      audioSys.playMessageSent()
    } catch (err) {
      logMessageSendError('retry-send', err, { targetId, textLength: text.length, reply_to_message_id: replyToMessageId })
      toast.error('Failed to resend message.')
      ownSendScrollRef.current = { targetId: null, active: false }
      failLocalMessage(targetId, localId, { type: 'text', text })
    }
  }

  const handleGenericFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    queuePendingAttachmentFromFile(file)
    if (genericFileInputRef.current) genericFileInputRef.current.value = ''
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    queuePendingAttachmentFromFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpdateMessage = useCallback(async (e, id, options = {}) => {
    e?.preventDefault()
    const nextContent = editContent.trim()
    if (!options.allowEmpty && !nextContent) return
    try {
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(nextContent, targetId, sharedKeys, messages);
      
      const { error } = await supabase.from('messages').update({ content: contentToSave, is_encrypted: view === 'home', is_edited: true, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      const updatedAt = new Date().toISOString()
      setMessages(current => {
        const updated = current.map(msg => msg.id === id ? {
          ...msg,
          content: nextContent,
          is_encrypted: view === 'home',
          is_edited: true,
          updated_at: updatedAt
        } : msg)
        if (targetId) safeCacheSave(targetId, updated)
        return updated
      })
      setEditingMessageId(null)
      toast.success("Message updated")
      setEditingMessageId(null)
      setEditContent('')
      if (messageInputRef.current) {
        messageInputRef.current.value = ''
      }
    } catch (_err) { toast.error("Failed to update message") }
  }, [editContent, activeChannel, activeDm, view, getSharedKeysForTarget, messages, buildEncryptedPayload])

  const executeInlineDelete = useCallback(async (message, mode) => {
    try {
      if (mode === 'everyone') {
        const { error: deleteError } = await supabase.from('messages').delete().eq('id', message.id)
        if (deleteError) throw deleteError
        setMessages(current => current.filter(msg => msg.id !== message.id))
        toast.success("Message completely deleted")
      } else {
        setLocalDeletedMessages(prev => [...prev, message.id])
        toast.success("Message hidden for you")
      }
    } catch (_err) { toast.error("Failed to delete message") } 
    finally { setInlineDeleteMessageId(null); setInlineDeleteStep('options') }
  }, [])

  const validMessages = useMemo(() => Array.from(new Map(messages.filter(m => m && m.id != null).map(item => [item.id, item])).values()), [messages])
  const pinnedMessages = useMemo(() => validMessages.filter(m => m.is_pinned && !m.is_deleted), [validMessages])

  const togglePinnedMessage = useCallback(async (message) => {
    if (!message?.id) return
    const nextPinned = !message.is_pinned
    try {
      const { error } = await supabase.from('messages').update({ is_pinned: nextPinned }).eq('id', message.id)
      if (error) throw error
      setMessages(current => {
        const updated = current.map(msg => msg.id === message.id ? { ...msg, is_pinned: nextPinned } : msg)
        const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
        if (targetId) safeCacheSave(targetId, updated)
        return updated
      })
      toast.success(nextPinned ? 'Message pinned' : 'Message unpinned')
    } catch (_err) {
      toast.error('Failed to update pinned message')
    }
  }, [activeChannel?.id, activeDm?.dm_room_id, view])
  
  const visibleMessages = useMemo(() => validMessages.filter(m => {
    if (localDeletedMessages.includes(m.id)) return false;
    if (m.is_unreadable) return false;
    const contentString = typeof m.content === 'object' && m.content !== null ? JSON.stringify(m.content) : String(m.content);
    if (contentString.includes('Encrypted Message')) return false;
    if (contentString.includes('"ciphertext"')) return false;
    if (contentString.includes('{"iv":')) return false;
    return true;
  }), [localDeletedMessages, validMessages]);

  return {
    visibleMessages, validMessages, pinnedMessages,
    isLoadingMore, hasMoreMessages, messagesLoading, initialMessagesLoaded,
    replyingTo, setReplyingTo,
    inlineDeleteMessageId, setInlineDeleteMessageId,
    inlineDeleteStep, setInlineDeleteStep,
    editingMessageId, setEditingMessageId,
    editContent, setEditContent,
    highlightedMessageId, setHighlightedMessageId,
    typingUsers,
    isUploading, selectedImage, setSelectedImage,
    showGifPicker, setShowGifPicker,
    pendingFile, setPendingFile, handlePaste, handleBeforeInput,
    keyboardImageFallbackMessage,
    showLatestMessagesButton, scrollToLatestMessages,
    fileInputRef, genericFileInputRef, messageInputRef, messagesEndRef, scrollContainerRef,
    handleSendMessage, handleSendGif, handleFileUpload, handleGenericFileUpload, handleUpdateMessage,
    executeInlineDelete, toggleReaction, togglePinnedMessage, handleTyping, handleScroll, scrollToMessage, retryFailedMessage, peerReadAt
  }
}
