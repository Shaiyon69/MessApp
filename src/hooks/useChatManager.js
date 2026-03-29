import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import imageCompression from 'browser-image-compression'
import { cacheThumbnail } from '../lib/cacheManager'
import { importPrivateKey, deriveSharedAesKey, encryptWithAesGcm, decryptWithAesGcm } from '../lib/crypto'
import { audioSys } from '../lib/SoundEngine'

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
  const [pendingFile, setPendingFile] = useState(null);

  const fileInputRef = useRef(null)
  const genericFileInputRef = useRef(null)
  const messageInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const typingChannelRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const myUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0]

  useEffect(() => { localStorage.setItem(`deleted_msgs_${session.user.id}`, JSON.stringify(localDeletedMessages)) }, [localDeletedMessages, session.user.id])

  const getSharedKeysForTarget = useCallback(async (targetId, isDm, rawMsgData = []) => {
    if (!isDm) return null;
    
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
           try { keys.main = await deriveSharedAesKey(mainImpPriv, { ...pubJwk, ext: true }); } catch(e){}
        }
        
        try {
            const selfPubJwk = { kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y, ext: true };
            keys.legacy.push(await deriveSharedAesKey(mainImpPriv, selfPubJwk));
        } catch(e){}
      }

      const legacyKeysStr = localStorage.getItem(`e2ee_legacy_keys_${session.user.id}`);
      if (legacyKeysStr) {
        const legacyJwks = JSON.parse(legacyKeysStr);
        for (const ljwk of legacyJwks) {
          try {
            const impL = await importPrivateKey({ ...ljwk, ext: true });
            if (targetPubStr) {
               const pubJwk = JSON.parse(targetPubStr);
               try { keys.legacy.push(await deriveSharedAesKey(impL, { ...pubJwk, ext: true })); } catch(e){}
            }
            
            try {
                const legacyPubJwk = { kty: ljwk.kty, crv: ljwk.crv, x: ljwk.x, y: ljwk.y, ext: true };
                keys.legacy.push(await deriveSharedAesKey(impL, legacyPubJwk));
                if (mainImpPriv) keys.legacy.push(await deriveSharedAesKey(mainImpPriv, legacyPubJwk));
            } catch(e){}
          } catch(e) {}
        }
      }
      return keys;
    } catch (e) {
      return null;
    }
  }, [activeDm, dms, session.user.id]);

  const buildEncryptedPayload = async (content, targetId, sharedKeys, rawMsgData = []) => {
    if (!sharedKeys?.main) return content;
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
      return content;
    }
  };

  const decryptMessageList = useCallback(async (msgList, sharedKeys) => {
    return await Promise.all(msgList.map(async (msg) => {
      const contentStr = typeof msg.content === 'object' && msg.content !== null ? JSON.stringify(msg.content) : msg.content;
      
      if (contentStr && typeof contentStr === 'string' && contentStr.startsWith('{') && contentStr.includes('ciphertext')) {
        try {
          const encObj = JSON.parse(contentStr);
          if (encObj.iv && encObj.ciphertext) {
            let decryptedContent = null;
            let unlocked = false;

            // 🚀 ENVELOPE DECRYPTION MATRIX
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
                    
                    // 🚀 CRITICAL FIX: Ensure it didn't return the swallowed failure string!
                    if (attempt && !attempt.includes('[Encrypted Message - Unreadable]')) {
                        decryptedContent = attempt;
                        unlocked = true;
                        break;
                    }
                 } catch(e) {}
              }
            }

            // DB Fallback
            if (!unlocked && sharedKeys?.main) {
              try { 
                const attempt = await decryptWithAesGcm(sharedKeys.main, encObj); 
                if (attempt && !attempt.includes('[Encrypted Message - Unreadable]')) {
                    decryptedContent = attempt; 
                    unlocked = true; 
                }
              } catch(e) {}
            }
            if (!unlocked && sharedKeys?.legacy) {
              for (const lKey of sharedKeys.legacy) {
                try { 
                  const attempt = await decryptWithAesGcm(lKey, encObj); 
                  if (attempt && !attempt.includes('[Encrypted Message - Unreadable]')) {
                      decryptedContent = attempt; 
                      unlocked = true; 
                      break; 
                  }
                } catch(e) {}
              }
            }

            if (unlocked) {
               const finalMsg = { ...msg, content: decryptedContent };
               delete finalMsg.is_unreadable;
               return finalMsg;
            } else {
               if (msg.image_url || msg.file_url) {
                   const cleanedMsg = { ...msg, content: '' };
                   delete cleanedMsg.is_unreadable;
                   return cleanedMsg;
               }
               return { ...msg, content: '', is_unreadable: true };
            }
          }
        } catch (e) {
          if (msg.image_url || msg.file_url) {
             const cleanedMsg = { ...msg, content: '' };
             delete cleanedMsg.is_unreadable;
             return cleanedMsg;
          }
          return { ...msg, content: '', is_unreadable: true };
        }
      }
      return { ...msg, content: contentStr };
    }));
  }, [session.user.id]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          const previewUrl = URL.createObjectURL(file);
          setPendingFile({ file, previewUrl, type: 'image' });
        }
      }
    }
  }, []);

  const fetchSurroundingMessages = async (targetMessage) => {
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    const { data: olderMessages } = await supabase.from('messages').select('*, profiles(username, avatar_url, public_key), message_reactions(*)').eq(field, targetId).lt('created_at', targetMessage.created_at).order('created_at', { ascending: false }).limit(20)
    const { data: newerMessages } = await supabase.from('messages').select('*, profiles(username, avatar_url, public_key), message_reactions(*)').eq(field, targetId).gte('created_at', targetMessage.created_at).order('created_at', { ascending: true }).limit(20)

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
      .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
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
      
      const container = scrollContainerRef.current;
      const anchorElement = document.getElementById(`message-${oldestMessage.id}`);
      const anchorOffsetTop = anchorElement ? anchorElement.offsetTop : 0;
      const previousScrollTop = container ? container.scrollTop : 0;
      const offsetFromAnchor = previousScrollTop - anchorOffsetTop; 

      setMessages(prev => {
        const safePrev = prev.filter(m => m[field] === targetId);
        const merged = [...decryptedData, ...safePrev];
        const uniqueData = Array.from(new Map(merged.filter(m => m && m.id).map(item => [item.id, item])).values());
        uniqueData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, uniqueData);
        return uniqueData;
      });

      setIsLoadingMore(false);

      setTimeout(() => {
        if (scrollContainerRef.current) {
          const newAnchorElement = document.getElementById(`message-${oldestMessage.id}`);
          if (newAnchorElement) {
            scrollContainerRef.current.scrollTop = newAnchorElement.offsetTop + offsetFromAnchor;
          }
        }
      }, 50); 
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
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 10)
    }

    const { data } = await supabase.from('messages').select('*, profiles(username, avatar_url, public_key), message_reactions(*)').eq(field, targetId).order('created_at', { ascending: false }).limit(100)
      
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
    setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; }, 100)
  }, [activeChannel?.id, activeDm?.dm_room_id, view, getSharedKeysForTarget, decryptMessageList])

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
      const rawTypers = Object.values(state).flatMap(p => p).filter(p => p.user_id !== session.user.id)
      const uniqueTypers = Array.from(new Map(rawTypers.map(p => [p.user_id, p])).values())
      setTypingUsers(uniqueTypers)
    })

    roomChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `${field}=eq.${targetId}` }, async (payload) => {
      if (payload.eventType === 'INSERT') {
        const { data: fullMsg } = await supabase.from('messages').select('*, profiles(username, avatar_url, public_key), message_reactions(*)').eq('id', payload.new.id).single()

        if (fullMsg) {
          const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [fullMsg]);
          const [decryptedMsg] = await decryptMessageList([fullMsg], sharedKeys);

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
          
          if (scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            if (scrollHeight - scrollTop - clientHeight < 150) {
              setTimeout(() => { scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50);
            }
          }
        }
      }
      
      if (payload.eventType === 'UPDATE') {
        const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', [payload.new]);
        const [decryptedMsg] = await decryptMessageList([payload.new], sharedKeys);

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
  }, [activeChannel?.id, activeDm?.dm_room_id, view, session.user.id, fetchCurrentMessages, getSharedKeysForTarget, decryptMessageList])

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

  const uploadPendingFile = async (file, caption) => {
    setIsUploading(true);
    const toastId = toast.loading('Uploading pasted image...');
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      const fileExt = file.name ? file.name.split('.').pop() : 'png';
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;
      
      await supabase.storage.from('chat-attachments').upload(filePath, compressedFile);
      const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath);
      
      const field = view === 'server' ? 'channel_id' : 'dm_room_id';
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;

      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(caption || '', targetId, sharedKeys, messages);

      const { data: newMsg } = await supabase.from('messages').insert([{
        profile_id: session.user.id,
        content: contentToSave,
        image_url: publicUrl,
        [field]: targetId,
        reply_to_message_id: replyingTo?.id || null
      }]).select('*, profiles(username, avatar_url, public_key), message_reactions(*)').single();

      const [decryptedMsg] = await decryptMessageList([newMsg], sharedKeys);

      setMessages(prev => {
        if (prev.some(msg => msg.id === decryptedMsg.id)) return prev;
        const updated = [...prev, decryptedMsg];
        updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        safeCacheSave(targetId, updated);
        return updated;
      })

      setReplyingTo(null);
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
      toast.success('Sent!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault()
    const text = messageInputRef.current?.value.trim()
    
    if (pendingFile) {
      await uploadPendingFile(pendingFile.file, text);
      setPendingFile(null);
      if (messageInputRef.current) messageInputRef.current.value = '';
      return;
    }

    if (!text) return
    if (messageInputRef.current) messageInputRef.current.value = ''
    
    const field = view === 'server' ? 'channel_id' : 'dm_room_id'
    const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
      typingChannelRef.current?.untrack().catch(()=>{})
    }

    try {
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(text, targetId, sharedKeys, messages);

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, [field]: targetId, reply_to_message_id: replyingTo?.id || null }])
        .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
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
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
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

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, image_url: gifUrl, [field]: targetId, reply_to_message_id: replyingTo?.id || null }])
        .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
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
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
    } catch (_err) { toast.error('Failed to send GIF.') }
  }

  const handleGenericFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsUploading(true)
    try {
      const fileSizeFormatted = formatBytes(file.size)
      toast('Uploading file...', { icon: '⬆️', id: 'upload-toast' })
      const fileExt = file.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const filePath = `${session.user.id}/${fileName}`
      
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, file)
      if (uploadError) throw uploadError
      
      const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath)
      
      const field = view === 'server' ? 'channel_id' : 'dm_room_id'
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
      if (!targetId) return toast.error('Select a channel or DM before sending files.')
      
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload('', targetId, sharedKeys, messages);

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, file_url: publicUrl, file_name: file.name, file_size: fileSizeFormatted, [field]: targetId, reply_to_message_id: replyingTo?.id || null }])
        .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
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

      toast.success('File uploaded!', { id: 'upload-toast' })
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
    } catch (_err) { toast.error('Failed to upload file', { id: 'upload-toast' }) } 
    finally { setIsUploading(false); if (genericFileInputRef.current) genericFileInputRef.current.value = '' }
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
      if (uploadError) throw uploadError
      
      const { data: { publicUrl } } = await supabase.storage.from('chat-attachments').getPublicUrl(filePath)
      
      const field = view === 'server' ? 'channel_id' : 'dm_room_id'
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id
      if (!targetId) return toast.error('Select a channel or DM before sending images.')
      
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload('', targetId, sharedKeys, messages);

      const { data: newMsg, error: insertError } = await supabase.from('messages')
        .insert([{ profile_id: session.user.id, content: contentToSave, image_url: publicUrl, [field]: targetId }])
        .select('*, profiles(username, avatar_url, public_key), message_reactions(*)')
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

      cacheThumbnail(targetId || 'global', publicUrl)
      toast.success('Image optimized and uploaded')
      setTimeout(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 50)
    } catch (_err) { toast.error('Failed to upload image') } 
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleUpdateMessage = useCallback(async (e, id) => {
    e.preventDefault()
    if (!editContent.trim()) return
    try {
      const targetId = view === 'server' ? activeChannel?.id : activeDm?.dm_room_id;
      const sharedKeys = await getSharedKeysForTarget(targetId, view === 'home', messages);
      const contentToSave = await buildEncryptedPayload(editContent.trim(), targetId, sharedKeys, messages);
      
      await supabase.from('messages').update({ content: contentToSave }).eq('id', id)
      setEditingMessageId(null)
      toast.success("Message updated")
    } catch (_err) { toast.error("Failed to update message") }
  }, [editContent, activeChannel, activeDm, view, getSharedKeysForTarget, messages])

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
    visibleMessages, validMessages, 
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
    executeInlineDelete, toggleReaction, handleTyping, handleScroll, scrollToMessage
  }
}
