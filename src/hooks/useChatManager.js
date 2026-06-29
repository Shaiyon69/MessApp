import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import imageCompression from 'browser-image-compression'
import { cacheThumbnail } from '../lib/cacheManager'
import { importPrivateKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm, encryptBinaryAesGcm, decryptBinaryAesGcm } from '../lib/crypto'
import { audioSys } from '../lib/SoundEngine'
import { safeHttpUrl } from '../lib/security'

const MESSAGE_SELECT_BASE = '*, profiles(username, avatar_url, public_key), message_reactions(*)'
const MESSAGE_SELECT = `${MESSAGE_SELECT_BASE}, message_attachments(*)`

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

const safeCacheSave = (targetId, dataArray) => {
  try { localStorage.setItem(`local_chat_${targetId}`, JSON.stringify(dataArray)) } catch (_err) {}
}

const safeCacheLoad = (targetId) => {
  try { return JSON.parse(localStorage.getItem(`local_chat_${targetId}`)) || [] } catch (_err) { return [] }
}

const getAttachmentKind = (file) => file.type?.startsWith('image/') ? 'image' : 'file'
const isReadableDecryptedContent = (value) => value !== null && value !== undefined && !String(value).includes('[Encrypted Message - Unreadable]')
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
const BLOCKED_FILE_TYPES = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript', 'text/javascript'])
const BLOCKED_FILE_EXTENSIONS = /\.(?:svg|html?|xhtml|js|mjs)$/i

const normalizeFileType = (value) => (value || 'application/octet-stream').toLowerCase()

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

  const fileInputRef = useRef(null)
  const genericFileInputRef = useRef(null)
  const messageInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const typingChannelRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  
  const sharedKeysCacheRef = useRef({})

  const myUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0]

  useEffect(() => { localStorage.setItem(`deleted_msgs_${session.user.id}`, JSON.stringify(localDeletedMessages)) }, [localDeletedMessages, session.user.id])

  const instantScrollToBottom = useCallback(() => {
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });
    }, 10);
  }, []);

  const smoothScrollToBottom = useCallback(() => {
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
        }
      });
    }, 10);
  }, []);

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

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          try {
            validateAttachmentFile(file, 'image')
            setPendingFile({ file, type: 'image', name: file.name || 'pasted-image.png', size: file.size });
          } catch (error) {
            toast.error(error.message)
          }
        }
      }
    }
  }, []);

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
    if (e.target.scrollTop <= 5) fetchOlderMessages(); 
  };

  const fetchCurrentMessages = useCallback(async () => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) return;

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    setMessages(prev => prev.filter(m => m[field] === targetId))

    const cachedData = safeCacheLoad(targetId)
    if (cachedData.length > 0) {
      const validCache = Array.from(new Map(cachedData.filter(m => m && m.id).map(item => [item.id, item])).values());
      setMessages(validCache)
      instantScrollToBottom()
    }

    const { data } = await supabase.from('messages').select(MESSAGE_SELECT).eq(field, targetId).order('created_at', { ascending: false }).limit(100)
      
    if (data) {
      if (data.length < 100) setHasMoreMessages(false);
      const chronoData = data.reverse() 
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', chronoData);
      const decryptedData = await decryptMessageList(chronoData, sharedKeys);

      setMessages(prev => {
        const safePrev = prev.filter(m => m[field] === targetId);
        const merged = [...safePrev, ...decryptedData];
        const uniqueData = Array.from(new Map(merged.filter(m => m && m.id).map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, uniqueData) 
        return uniqueData;
      })
    }
    instantScrollToBottom()
  }, [activeChannel?.id, activeDm?.dm_room_id, view, getSharedKeysForTarget, decryptMessageList, instantScrollToBottom])

  useEffect(() => {
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
    if (!targetId) { setMessages([]); setTypingUsers([]); return; }
    
    setHasMoreMessages(true);
    setMessages(safeCacheLoad(targetId))
    instantScrollToBottom()

    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    fetchCurrentMessages() 

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

            let isAtBottom = false;
            if (scrollContainerRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
              isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
            }

            setMessages(prev => {
              if (prev.some(msg => msg.id === decryptedMsg.id)) return prev; 
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
            
            if (isAtBottom || decryptedMsg.profile_id === session.user.id) {
              smoothScrollToBottom();
            }
          }
        })();
      }
      
      if (payload.eventType === 'UPDATE') {
        (async () => {
          const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [payload.new]);
          const [decryptedMsg] = await decryptMessageList([payload.new], sharedKeys);

          setMessages(current => {
            const updated = current.map(msg => msg.id === decryptedMsg.id ? { ...msg, ...decryptedMsg } : msg)
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

    roomChannel.subscribe()
    typingChannelRef.current = roomChannel

    return () => {
      supabase.removeChannel(roomChannel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [activeChannel?.id, activeDm?.dm_room_id, view, session.user.id, fetchCurrentMessages, getSharedKeysForTarget, decryptMessageList, instantScrollToBottom, smoothScrollToBottom])

  const toggleReaction = async (messageId, emoji, hasReacted) => {
    try {
      if (hasReacted) await supabase.from('message_reactions').delete().match({ message_id: messageId, profile_id: session.user.id, emoji: emoji })
      else await supabase.from('message_reactions').insert([{ message_id: messageId, profile_id: session.user.id, emoji: emoji }])
      
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

  const uploadPendingFile = async (file, caption) => {
    setIsUploading(true);
    const toastId = toast.loading('Uploading attachment...');
    try {
      const field = view === 'server' ? 'channel_id' : 'dm_room_id';
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;
      if (!targetId) {
        toast.error('Select a channel or DM before sending attachments.', { id: toastId })
        return false
      }

      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(caption || '', targetId, sharedKeys, messages);
      const attachment = await prepareMessageAttachment({ file, sharedKeys, targetId })

      const messagePayload = {
        profile_id: session.user.id,
        content: contentToSave,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyingTo?.id || null
      }
      const { data: createdMsg, error: insertError } = await supabase.from('messages').insert(messagePayload).select(MESSAGE_SELECT).single();
      if (insertError) throw insertError
      if (!createdMsg?.id) throw new Error('Message creation did not return an ID')

      const createdAttachment = await insertMessageAttachment(createdMsg.id, attachment)
      const newMsg = {
        ...createdMsg,
        message_attachments: createdMsg.message_attachments?.length ? createdMsg.message_attachments : [createdAttachment]
      }

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);

      setMessages(prev => {
        const updated = prev.some(msg => msg.id === decryptedMsg.id)
          ? prev.map(msg => msg.id === decryptedMsg.id ? { ...msg, ...decryptedMsg } : msg)
          : [...prev, decryptedMsg];
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, updated);
        return updated;
      })

      setReplyingTo(null);
      smoothScrollToBottom();
      toast.success('Sent!', { id: toastId });
      return true
    } catch (_err) {
      toast.error('Upload failed', { id: toastId });
      return false
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault()
    const text = messageInputRef.current?.value.trim()
    
    if (pendingFile) {
      const sent = await uploadPendingFile(pendingFile.file, text);
      if (sent) {
        setPendingFile(null);
        if (messageInputRef.current) messageInputRef.current.value = '';
      }
      return;
    }

    if (!text) return
    if (messageInputRef.current) messageInputRef.current.value = ''
    
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    if (!targetId) return toast.error('Select a channel or DM before sending a message.')

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
      typingChannelRef.current?.untrack().catch(()=>{})
    }

    try {
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(text, targetId, sharedKeys, messages);

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, is_encrypted: view === 'home', [field]: targetId, reply_to_message_id: replyingTo?.id || null }])
        .select(MESSAGE_SELECT)
        .single()
        
      if (insertError) throw insertError

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);

      setMessages(prev => {
        if (prev.some(msg => msg.id === decryptedMsg.id)) return prev;
        const updated = [...prev, decryptedMsg];
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, updated);
        return updated;
      })

      setReplyingTo(null)
      smoothScrollToBottom()
    } catch (_err) {
      toast.error('Failed to send message.')
      if (messageInputRef.current) messageInputRef.current.value = text
    }
  }

  const handleSendGif = async (gifUrl) => {
    setShowGifPicker(false)
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    if (!targetId) return toast.error('Select a channel or DM before sending a GIF.')

    try {
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload('', targetId, sharedKeys, messages);
      const attachment = await prepareMessageAttachment({ sharedKeys, targetId, gifUrl })

      const messagePayload = {
        profile_id: session.user.id,
        content: contentToSave,
        is_encrypted: view === 'home',
        [field]: targetId,
        reply_to_message_id: replyingTo?.id || null
      }
      const { data: createdMsg, error: insertError } = await supabase.from('messages')
        .insert(messagePayload)
        .select(MESSAGE_SELECT)
        .single()
        
      if (insertError) throw insertError
      if (!createdMsg?.id) throw new Error('Message creation did not return an ID')
      const createdAttachment = await insertMessageAttachment(createdMsg.id, attachment)
      const newMsg = {
        ...createdMsg,
        message_attachments: createdMsg.message_attachments?.length ? createdMsg.message_attachments : [createdAttachment]
      }

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);

      setMessages(prev => {
        const updated = prev.some(msg => msg.id === decryptedMsg.id)
          ? prev.map(msg => msg.id === decryptedMsg.id ? { ...msg, ...decryptedMsg } : msg)
          : [...prev, decryptedMsg];
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, updated);
        return updated;
      })

      setReplyingTo(null)
      smoothScrollToBottom()
    } catch (_err) { toast.error('Failed to send GIF.') }
  }

  const handleGenericFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      validateAttachmentFile(file, 'file')
      setPendingFile({ file, type: 'file', name: file.name, size: file.size })
    } catch (error) {
      toast.error(error.message)
    }
    if (genericFileInputRef.current) genericFileInputRef.current.value = ''
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      validateAttachmentFile(file, 'image')
      setPendingFile({ file, type: 'image', name: file.name, size: file.size })
    } catch (error) {
      toast.error(error.message)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpdateMessage = useCallback(async (e, id) => {
    e.preventDefault()
    if (!editContent.trim()) return
    try {
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(editContent.trim(), targetId, sharedKeys, messages);
      
      const { error } = await supabase.from('messages').update({ content: contentToSave, is_encrypted: view === 'home', is_edited: true, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      setEditingMessageId(null)
      toast.success("Message updated")
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

  const validMessages = Array.from(new Map(messages.filter(m => m && m.id != null).map(item => [item.id, item])).values())
  const pinnedMessages = validMessages.filter(m => m.is_pinned && !m.is_deleted)

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
  
  const visibleMessages = validMessages.filter(m => {
    if (localDeletedMessages.includes(m.id)) return false;
    if (m.is_unreadable) return false;
    const contentString = typeof m.content === 'object' && m.content !== null ? JSON.stringify(m.content) : String(m.content);
    if (contentString.includes('Encrypted Message')) return false;
    if (contentString.includes('"ciphertext"')) return false;
    if (contentString.includes('{"iv":')) return false;
    return true;
  });

  return {
    visibleMessages, validMessages, pinnedMessages,
    isLoadingMore, hasMoreMessages,
    replyingTo, setReplyingTo,
    inlineDeleteMessageId, setInlineDeleteMessageId,
    inlineDeleteStep, setInlineDeleteStep,
    editingMessageId, setEditingMessageId,
    editContent, setEditContent,
    highlightedMessageId, setHighlightedMessageId,
    typingUsers,
    isUploading, selectedImage, setSelectedImage,
    showGifPicker, setShowGifPicker,
    pendingFile, setPendingFile, handlePaste,
    fileInputRef, genericFileInputRef, messageInputRef, messagesEndRef, scrollContainerRef,
    handleSendMessage, handleSendGif, handleFileUpload, handleGenericFileUpload, handleUpdateMessage,
    executeInlineDelete, toggleReaction, togglePinnedMessage, handleTyping, handleScroll, scrollToMessage
  }
}
