/**
 * Owns central chat presentation and composer-only UI state. Dashboard and the
 * chat hook supply data/actions. Mobile trays and viewport offsets stay aligned
 * with native keyboard and safe-area behavior.
 */
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Loader2, Menu, Users, UserPlus, Hash, Phone, Video, Search, Info, ImagePlus, Paperclip, Send, X, Bell, MessageSquare, MoreVertical, Trash2, Check, SmilePlus, Plus, FileText, ChevronDown, Mic, MicOff, MonitorUp, PhoneOff, Radio, Volume2, VolumeX, Eye, EyeOff, CircleDot, SlidersHorizontal, Camera, Square } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { MemoizedMessage } from '../chat/MessageElements'
import VoiceMessagePlayer from '../chat/VoiceMessagePlayer'
import AddFriendView from '../modals/AddFriendView'
import GifPickerPopout from '../modals/GifPickerPopout'
import ChatEmojiPicker from '../chat/ChatEmojiPicker'
import SfuScreenShare from '../screen-share/SfuScreenShare'
import MediaEditorModal from '../media/MediaEditorModal'
import { debug } from '../../lib/debug'
import { openDmEntry } from '../../lib/chatActions'
import { primeVideoPreview } from '../../lib/videoPreview'
import {
  formatVoiceMessageDuration,
  getVoiceMessageExtension,
  getVoiceMessageMimeType,
  normalizeVoiceMessageMimeType
} from '../../lib/voiceMessages'
import { getVoiceMediaStream } from '../../lib/voiceAudioProcessing'

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
  const [voiceControlsOpen, setVoiceControlsOpen] = useState(false);
  const [voiceRecorderState, setVoiceRecorderState] = useState({ status: 'idle', elapsed: 0 });
  const [voiceLevels, setVoiceLevels] = useState(() => Array.from({ length: 28 }, () => 0.08));
  const [mediaEditorTarget, setMediaEditorTarget] = useState(null);
  
  const emojiPickerRef = useRef(null);
  const gifPickerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const cameraPhotoInputRef = useRef(null);
  const cameraVideoInputRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceRecorderStreamRef = useRef(null);
  const voiceRecorderChunksRef = useRef([]);
  const voiceRecorderTimerRef = useRef(null);
  const voiceRecorderCancelledRef = useRef(false);
  const voiceAnalyserRef = useRef(null);
  const voiceAudioContextRef = useRef(null);
  const voiceLevelFrameRef = useRef(null);
  const edgeGestureRef = useRef(null);
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
  const editingMessage = props.editingMessageId ? validMessagesById.get(props.editingMessageId) : null
  const activeChatKey = `${props.view}:${props.activeChannel?.id || props.activeDm?.dm_room_id || 'none'}`
  const isInitialPositionReady = positionedChatKey === activeChatKey
  const isVoiceChannel = props.view === 'server' && props.activeChannel?.type === 'voice'
  const isActiveVoiceSession = isVoiceChannel && props.activeVoiceSession?.channelId === props.activeChannel?.id
  // Occupancy comes from server-wide presence so an unjoined channel still
  // shows who is already waiting inside it.
  const voiceChannelParticipants = isVoiceChannel
    ? (props.getVoiceParticipantsForChannel?.(props.activeChannel?.id) || [])
    : []
  const messageListStyle = props.isCallMinimized
    ? { paddingBottom: 'calc(9.5rem + env(safe-area-inset-bottom, 0px))' }
    : undefined

  const toggleVoiceDeafened = () => {
    const nextDeafened = !props.voiceDeafened
    props.setVoiceMuted?.(nextDeafened)
    props.setVoiceDeafened?.(nextDeafened)
  }

  const releaseVoiceRecorder = useCallback(() => {
    if (voiceRecorderTimerRef.current) {
      clearInterval(voiceRecorderTimerRef.current)
      voiceRecorderTimerRef.current = null
    }
    voiceRecorderStreamRef.current?.getTracks().forEach(track => track.stop())
    if (voiceLevelFrameRef.current) cancelAnimationFrame(voiceLevelFrameRef.current)
    voiceLevelFrameRef.current = null
    voiceAnalyserRef.current = null
    voiceAudioContextRef.current?.close?.().catch(() => {})
    voiceAudioContextRef.current = null
    voiceRecorderStreamRef.current = null
    voiceRecorderRef.current = null
    setVoiceLevels(Array.from({ length: 28 }, () => 0.08))
  }, [])

  const finishVoiceRecording = useCallback((cancelled = false) => {
    const recorder = voiceRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    voiceRecorderCancelledRef.current = cancelled
    setVoiceRecorderState(current => ({ ...current, status: 'stopping' }))
    recorder.stop()
  }, [])

  const startVoiceRecording = async () => {
    setShowAttachMenu(false)
    setShowInputEmojiPicker(false)
    props.setShowGifPicker(false)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== 'function') {
      toast.error('Voice recording is not available on this device.')
      return
    }

    try {
      const stream = await getVoiceMediaStream({
        mediaDevices: navigator.mediaDevices,
        video: false,
        noiseReduction: true
      })
      const preferredMimeType = getVoiceMessageMimeType(MediaRecorder)
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)
      const startedAt = Date.now()

      voiceRecorderStreamRef.current = stream
      voiceRecorderRef.current = recorder
      voiceRecorderChunksRef.current = []
      voiceRecorderCancelledRef.current = false

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (AudioContextClass) {
        const audioContext = new AudioContextClass()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.72
        audioContext.createMediaStreamSource(stream).connect(analyser)
        const samples = new Uint8Array(analyser.fftSize)
        let lastLevelUpdate = 0
        const sampleVoiceLevel = timestamp => {
          analyser.getByteTimeDomainData(samples)
          if (timestamp - lastLevelUpdate > 70) {
            let squareTotal = 0
            for (const sample of samples) {
              const normalized = (sample - 128) / 128
              squareTotal += normalized * normalized
            }
            const level = Math.min(1, Math.max(0.08, Math.sqrt(squareTotal / samples.length) * 4.5))
            setVoiceLevels(previous => [...previous.slice(1), level])
            lastLevelUpdate = timestamp
          }
          voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel)
        }
        voiceAudioContextRef.current = audioContext
        voiceAnalyserRef.current = analyser
        voiceLevelFrameRef.current = requestAnimationFrame(sampleVoiceLevel)
      }

      recorder.ondataavailable = event => {
        if (event.data?.size) voiceRecorderChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        voiceRecorderCancelledRef.current = true
        toast.error('Voice recording stopped unexpectedly.')
        if (recorder.state !== 'inactive') recorder.stop()
        else {
          releaseVoiceRecorder()
          setVoiceRecorderState({ status: 'idle', elapsed: 0 })
        }
      }
      recorder.onstop = () => {
        const cancelled = voiceRecorderCancelledRef.current
        const chunks = voiceRecorderChunksRef.current
        const recordedType = normalizeVoiceMessageMimeType(recorder.mimeType || preferredMimeType)
        voiceRecorderChunksRef.current = []
        releaseVoiceRecorder()
        setVoiceRecorderState({ status: 'idle', elapsed: 0 })
        if (cancelled || !chunks.length) return

        const blob = new Blob(chunks, { type: recordedType })
        if (!blob.size) {
          toast.error('No audio was captured.')
          return
        }
        const extension = getVoiceMessageExtension(recordedType)
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, {
          type: recordedType,
          lastModified: Date.now()
        })
        props.queuePendingAttachmentFromFile?.(file)
      }

      recorder.start(250)
      setVoiceRecorderState({ status: 'recording', elapsed: 0 })
      voiceRecorderTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        setVoiceRecorderState({ status: 'recording', elapsed })
        if (elapsed >= 300 && recorder.state === 'recording') recorder.stop()
      }, 250)
    } catch (error) {
      releaseVoiceRecorder()
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      toast.error(denied ? 'Microphone permission is needed to record a voice message.' : 'Could not start voice recording.')
    }
  }

  useEffect(() => () => {
    voiceRecorderCancelledRef.current = true
    const recorder = voiceRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    releaseVoiceRecorder()
  }, [activeChatKey, releaseVoiceRecorder])

  useEffect(() => {
    if (!isActiveVoiceSession) setVoiceControlsOpen(false)
  }, [isActiveVoiceSession])

  const hasActiveConversation = Boolean(props.activeDm || props.activeChannel)
  const startEdgeGesture = (event) => {
    if (!hasActiveConversation || event.pointerType !== 'touch' || window.innerWidth >= 768) return
    const edgeWidth = 28
    const side = event.clientX <= edgeWidth
      ? 'left'
      : event.clientX >= window.innerWidth - edgeWidth
        ? 'right'
        : null
    if (!side) return
    edgeGestureRef.current = {
      pointerId: event.pointerId,
      side,
      startX: event.clientX,
      startY: event.clientY
    }
  }

  const finishEdgeGesture = (event) => {
    const gesture = edgeGestureRef.current
    edgeGestureRef.current = null
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gesture.startX
    const deltaY = Math.abs(event.clientY - gesture.startY)
    if (deltaY > 72) return
    if (gesture.side === 'left' && deltaX >= 56) {
      props.setMobileMenuOpen(true)
    } else if (gesture.side === 'right' && deltaX <= -56) {
      if (!(props.showRightSidebar && props.rightTab === 'info')) props.toggleRightSidebar('info')
    }
  }

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
    const urls = (props.pendingFiles || []).map(item => {
      if (item.gifUrl) return item.gifUrl
      return item.file && /^(?:image|video|audio)\//.test(item.file.type || '') ? URL.createObjectURL(item.file) : ''
    })
    setPendingPreviewUrls(urls)
    return () => urls.filter(url => url.startsWith('blob:')).forEach(url => URL.revokeObjectURL(url))
  }, [props.pendingFiles]);

  const openPendingMediaEditor = (item, index) => {
    if (!item?.file || !['image', 'video'].includes(item.type) || item.gifUrl) return
    setMediaEditorTarget({ file: item.file, index, type: item.type })
  }

  const savePendingMediaEdit = async editedFile => {
    const target = mediaEditorTarget
    if (!target) return
    props.setPendingFiles(previous => previous.map((item, index) => index === target.index
      ? {
          ...item,
          file: editedFile,
          type: target.type,
          name: editedFile.name,
          size: editedFile.size,
          fingerprint: `${editedFile.name}:${editedFile.size}:${editedFile.lastModified}`
        }
      : item))
    setMediaEditorTarget(null)
    toast.success(target.type === 'video' ? 'Video crop ready to send' : 'Image edit ready to send')
  }

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
    <div className="home-tab-shell shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-6 md:pb-3 md:pt-3">
      <div className="ios-segmented-control mx-auto grid max-w-3xl grid-cols-5 gap-1 rounded-2xl p-1 md:grid-cols-4">
        <button type="button" onClick={() => props.setMobileMenuOpen(true)} className="home-browse-button flex min-h-11 items-center justify-center rounded-xl md:hidden" aria-label="Open navigation">
          <Menu size={21} aria-hidden="true" />
        </button>
        <button onClick={() => props.setHomeTab('online')} data-active={props.homeTab === 'online'} data-tab-tone="online" className="home-tab-button min-h-11 rounded-xl transition-all outline-none cursor-pointer border" aria-label="Online friends" title="Online">
          <CircleDot size={19} aria-hidden="true" />
        </button>
        <button onClick={() => props.setHomeTab('all')} data-active={props.homeTab === 'all'} data-tab-tone="all" className="home-tab-button min-h-11 rounded-xl transition-all outline-none cursor-pointer border" aria-label="All friends" title="All">
          <Users size={19} aria-hidden="true" />
        </button>
        <button onClick={() => props.setHomeTab('pending')} data-active={props.homeTab === 'pending'} data-tab-tone="pending" className="home-tab-button relative min-h-11 rounded-xl text-xs font-bold transition-all outline-none cursor-pointer border sm:text-sm">
          <Bell size={19} aria-hidden="true" />
          <span className="sr-only">Pending requests</span>
          {props.friendRequests.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{props.friendRequests.length}</span>}
        </button>
        <button
          onClick={() => { props.setHomeTab('add_friend'); props.selectDm(null); }}
          data-active={props.homeTab === 'add_friend'}
          data-tab-tone="add"
          className="home-tab-button min-h-11 rounded-xl transition-all flex items-center justify-center cursor-pointer border"
          aria-label="Add friend"
          title="Add friend"
        >
          <UserPlus size={19} aria-hidden="true" />
        </button>
      </div>
    </div>
  )

  return (
      <main
        id="messapp-main"
        tabIndex={-1}
        className="flex-1 flex flex-col min-h-0 min-w-0 max-w-full overflow-hidden relative bg-[var(--chat-bg-base)]"
        style={props.scopedChatStyle}
        onPaste={props.handlePaste}
        onPointerDownCapture={(e) => {
          startEdgeGesture(e)
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
        onPointerUpCapture={finishEdgeGesture}
        onPointerCancelCapture={() => { edgeGestureRef.current = null }}
      >
      <header
        className={`ios-app-bar h-16 flex items-center justify-between px-4 md:px-6 border-b shrink-0 z-30 ${props.isChatActive ? 'border-[var(--chat-border)]' : 'border-[var(--border-subtle)]'}`}
        style={props.isChatActive ? { backgroundColor: 'var(--chat-bg-surface)' } : undefined}
      >
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
          <button type="button" onClick={() => props.setMobileMenuOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 outline-none transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] md:hidden" aria-label="Open navigation">
            <Menu size={21} aria-hidden="true" />
          </button>
          {props.view === 'home' && !props.activeDm ? (
            <div className="flex items-center gap-3 md:gap-6 animate-fade-in w-full min-w-0">
              <div className="flex items-center gap-2 text-[var(--text-main)] font-bold shrink-0">
                {props.homeTab === 'add_friend'
                  ? <UserPlus size={22} className="hidden text-gray-400 sm:block" />
                  : <Users size={24} className="hidden text-gray-400 sm:block" />}
                <span className="text-lg">{props.homeTab === 'add_friend' ? 'Add' : 'Friends'}</span>
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
              {props.view === 'home' && props.activeDm && <button onClick={() => props.startCall(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Start voice call" title="Voice call"><Phone size={20} aria-hidden="true" /></button>}
              {props.view === 'home' && props.activeDm && <button onClick={() => props.startCall(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]" aria-label="Start video call" title="Video call"><Video size={20} aria-hidden="true" /></button>}
              {props.view === 'home' && props.activeDm && <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1"></div>}
              <button onClick={() => props.toggleRightSidebar('search')} className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${props.rightTab === 'search' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`} aria-label="Search conversation" aria-pressed={props.rightTab === 'search' && props.showRightSidebar} title="Search"><Search size={20} aria-hidden="true" /></button>
              <button onClick={() => props.toggleRightSidebar('info')} className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${props.rightTab === 'info' && props.showRightSidebar ? 'bg-[var(--theme-20)] text-[var(--theme-base)]' : 'text-gray-400 hover:bg-[var(--bg-surface)] hover:text-[var(--theme-base)]'}`} aria-label="Show conversation details" aria-pressed={props.rightTab === 'info' && props.showRightSidebar} title="Conversation details"><Info size={20} aria-hidden="true" /></button>
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
            displayName: props.myUsername || props.session.user.user_metadata?.username || props.session.user.email?.split('@')[0],
            avatarUrl: props.myAvatar || props.session.user.user_metadata?.avatar_url
          }}
          focusRequest={props.voiceFocusRequest}
          muted={props.voiceMuted}
          deafened={props.voiceDeafened}
          onToggleMute={() => props.setVoiceMuted?.(value => !value)}
          onToggleDeafen={toggleVoiceDeafened}
          onLeave={props.leaveActiveVoice}
          onOpen={props.openActiveVoiceChannel}
          onStateChange={props.setVoiceSessionState}
        />
      )}

      {voiceControlsOpen && isActiveVoiceSession && (
        <div className="fixed inset-0 z-[80] md:hidden" data-ui-overlay-owner="ChatArea:voice-controls">
          <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setVoiceControlsOpen(false)} aria-label="Close voice controls" />
          <section className="voice-controls-drawer absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] rounded-[1.75rem] p-3" role="dialog" aria-modal="true" aria-label="Voice controls">
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-bold text-[var(--text-main)]">Voice controls</p>
                <p className="text-[11px] text-[var(--text-muted)]">{props.activeChannel?.name}</p>
              </div>
              <button type="button" onClick={() => setVoiceControlsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-element)]" aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => props.setVoiceMuted?.(value => !value)} className={`voice-drawer-action ${props.voiceMuted ? 'is-danger' : 'is-live'}`} aria-label={props.voiceMuted ? 'Unmute' : 'Mute'}>
                {props.voiceMuted ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
                <span>{props.voiceMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button type="button" onClick={toggleVoiceDeafened} className={`voice-drawer-action ${props.voiceDeafened ? 'is-danger' : 'is-live'}`} aria-label={props.voiceDeafened ? 'Undeafen' : 'Deafen'}>
                {props.voiceDeafened ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
                <span>{props.voiceDeafened ? 'Listen' : 'Deafen'}</span>
              </button>
              <button type="button" onClick={() => { setVoiceControlsOpen(false); props.openActiveVoiceChannel?.() }} className="voice-drawer-action">
                <MonitorUp size={20} aria-hidden="true" />
                <span>Expand</span>
              </button>
              <button type="button" onClick={() => { setVoiceControlsOpen(false); props.leaveActiveVoice?.() }} className="voice-drawer-action is-danger">
                <PhoneOff size={20} aria-hidden="true" />
                <span>Leave</span>
              </button>
            </div>
          </section>
        </div>
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
                        <p className={`mt-1 text-sm font-bold ${isActiveVoiceSession ? 'text-green-300' : voiceChannelParticipants.length > 0 ? 'text-[var(--theme-base)]' : 'text-gray-400'}`}>
                          {isActiveVoiceSession
                            ? `Connected - ${props.voiceSessionState?.status || 'connecting'}`
                            : voiceChannelParticipants.length > 0
                              ? `${voiceChannelParticipants.length} waiting inside`
                              : 'Nobody here yet'}
                        </p>
                        {!isActiveVoiceSession && voiceChannelParticipants.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {voiceChannelParticipants.slice(0, 5).map(participant => (
                                <StatusAvatar
                                  key={participant.id}
                                  url={participant.avatarUrl}
                                  username={participant.displayName}
                                  showStatus={false}
                                  className="h-7 w-7 rounded-full ring-2 ring-[var(--bg-surface)]"
                                />
                              ))}
                            </div>
                            <span className="truncate text-xs font-bold text-gray-400">
                              {voiceChannelParticipants.slice(0, 2).map(participant => participant.displayName).join(', ')}
                              {voiceChannelParticipants.length > 2 ? ` +${voiceChannelParticipants.length - 2} more` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isActiveVoiceSession ? (
                        <button
                          type="button"
                          onClick={() => (props.joinVoiceChannel || props.selectChannel)?.(props.activeChannel)}
                          className="inline-flex items-center gap-2 rounded-xl border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] px-4 py-2.5 text-sm font-black text-[var(--chat-control-text)]"
                        >
                          <Phone size={18} aria-hidden="true" />
                          {voiceChannelParticipants.length > 0 ? 'Join them' : 'Join voice'}
                        </button>
                      ) : (
                        <>
                          <button type="button" onClick={() => setVoiceControlsOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--bg-element)] px-3 py-2.5 text-xs font-bold text-[var(--text-main)] md:hidden" aria-haspopup="dialog" aria-expanded={voiceControlsOpen}>
                            <SlidersHorizontal size={18} aria-hidden="true" />
                            Controls
                          </button>
                          <div className="hidden items-center gap-2 md:flex">
                          <button type="button" onClick={() => props.setVoiceMuted?.(value => !value)} className={`rounded-xl p-2.5 ${props.voiceMuted ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={props.voiceMuted ? 'Unmute' : 'Mute'}>
                            {props.voiceMuted ? <MicOff size={18} /> : <Mic size={18} />}
                          </button>
                          <button type="button" onClick={toggleVoiceDeafened} className={`rounded-xl p-2.5 ${props.voiceDeafened ? 'bg-red-500/15 text-red-300' : 'bg-[var(--bg-element)] text-gray-300'}`} aria-label={props.voiceDeafened ? 'Undeafen' : 'Deafen'}>
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
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Participants</p>
                      <p className="mt-2 text-2xl font-black text-[var(--text-main)]">{isActiveVoiceSession ? 1 + (props.voiceSessionState?.remoteCount || 0) : voiceChannelParticipants.length}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Screen share</p>
                      <p className={`mt-2 text-sm font-black ${props.voiceSessionState?.isSharing ? 'text-green-300' : 'text-gray-400'}`}>{props.voiceSessionState?.isSharing ? 'Live' : 'Idle'}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">You</p>
                      <div className="mt-3 flex items-center gap-3">
                        <StatusAvatar url={props.myAvatar || props.session.user.user_metadata?.avatar_url} username={props.myUsername || props.session.user.user_metadata?.username || props.session.user.email} status="online" className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--text-main)]">{props.myUsername || props.session.user.user_metadata?.username || props.session.user.email?.split('@')[0]}</p>
                          <p className="text-xs text-gray-500">{props.voiceMuted ? 'Muted' : 'Mic ready'} / {props.voiceDeafened ? 'Deafened' : 'Listening'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : props.view === 'home' && !props.activeDm ? (
            <div className="home-dashboard flex-1 flex overflow-hidden">
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
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="mx-auto flex w-full max-w-3xl flex-col p-4 md:p-6">
                      <div className="ios-search-field mb-5 flex items-center rounded-full px-4 py-3 transition-all">
                        <input id="dm-search-input" type="text" placeholder="Search" className="bg-transparent border-none outline-none text-[var(--text-main)] text-sm w-full placeholder-gray-500" aria-label="Search conversations" />
                        <Search size={18} className="text-gray-500 ml-2" aria-hidden="true" />
                      </div>
                      <div className="mb-3 px-1 text-xs font-bold text-[var(--text-muted)]">
                        {props.homeTab === 'online' && `Online ${props.onlineFriends.length}`}
                        {props.homeTab === 'all' && `All ${props.allFriends.length}`}
                        {props.homeTab === 'pending' && `Pending ${props.friendRequests.length}`}
                      </div>
                      <div className="space-y-2">
                      {props.homeTab === 'pending' && props.friendRequests.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 opacity-50"><Bell size={48} className="text-gray-500 mb-4" /><p className="text-gray-400 font-medium">No pending friend requests.</p></div>
                      )}
                      {props.homeTab === 'pending' && props.friendRequests.map((req, i) => (
                        <div key={req.id ? `req-${req.id}` : `fallback-req-${i}`} className="dashboard-list-row flex items-center justify-between p-3 rounded-2xl group transition-all">
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
                          <div key={dm.dm_room_id ? `dm-list-${dm.dm_room_id}` : `fallback-dm-list-${i}`} className="dashboard-list-row relative flex items-center justify-between p-3 rounded-2xl group transition-all">
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
                    </div>
                    {renderHomeTabBar()}
                  </>
                )}
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
                  const isMe = m.profile_id === props.session.user.id;
                  const alignRight = isMe;
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
                      handleToggleMessageSpoiler={props.handleToggleMessageSpoiler}
                      handleToggleAttachmentSpoiler={props.handleToggleAttachmentSpoiler}
                      setEditingMessageId={props.setEditingMessageId}
                      inlineDeleteMessageId={props.inlineDeleteMessageId}
                      inlineDeleteStep={props.inlineDeleteStep}
                      setInlineDeleteMessageId={props.setInlineDeleteMessageId}
                      setInlineDeleteStep={props.setInlineDeleteStep}
                      executeInlineDelete={props.executeInlineDelete}
                      canModerateMessage={props.view === 'server' && ['owner', 'admin', 'moderator'].includes(props.activeServerRole)}
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
	                      onReportMessage={props.onReportMessage}
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
                    className="premium-menu pointer-events-auto absolute bottom-3 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full text-[var(--theme-base)] shadow-xl transition-all hover:border-[var(--theme-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] cursor-pointer"
                    aria-label="Jump to latest messages"
                    title="Latest messages"
                  >
                    <ChevronDown size={20} aria-hidden="true" />
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
                        <span className="truncate text-gray-300 max-w-[150px] md:max-w-[300px]">{props.replyingTo.is_spoiler ? 'Spoiler' : props.replyingTo.content || 'Attachment'}</span>
                      </div>
                      <button onClick={() => props.setReplyingTo(null)} className="text-gray-400 hover:text-[var(--text-main)] ml-2 p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer shrink-0"><X size={14}/></button>
                    </div>
                  )}
                  {props.pendingFiles?.length > 0 && (
                    <div className="premium-section mx-2 mb-3 rounded-2xl p-3 animate-slide-up">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-bold uppercase tracking-tighter text-[var(--theme-base)]">{props.isUploading ? 'Uploading' : 'Ready to send'}</span>
                          <p className="truncate text-[11px] text-gray-500">{props.pendingFiles.length}/{props.maxPendingAttachments || 10} {props.pendingFiles.length === 1 ? 'attachment' : 'attachments'} • Add a caption below</p>
                        </div>
                        <button type="button" onClick={() => props.setPendingFiles([])} className="rounded-full bg-red-500/10 p-2 text-red-500 transition-colors hover:bg-red-500 hover:text-white" aria-label="Remove all attachments"><X size={18}/></button>
                      </div>
                      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {props.pendingFiles.map((item, index) => (
                          <div key={item.id || `${item.name}-${item.size}-${index}`} className={`group relative shrink-0 overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-base)] ${item.type === 'audio' ? 'h-14 w-64 rounded-full' : 'h-24 w-24 rounded-xl'}`}>
                            {item.type === 'audio' ? (
                              pendingPreviewUrls[index] && (
                                <VoiceMessagePlayer
                                  src={pendingPreviewUrls[index]}
                                  label="Voice message ready"
                                  className="h-full w-full bg-transparent pr-8"
                                />
                              )
                            ) : pendingPreviewUrls[index] && item.type === 'video' ? (
                              <video
                                src={pendingPreviewUrls[index]}
                                className="h-full w-full bg-black object-cover"
                                muted
                                playsInline
                                preload="metadata"
                                onLoadedMetadata={primeVideoPreview}
                                onLoadedData={primeVideoPreview}
                                onCanPlay={primeVideoPreview}
                              />
                            ) : pendingPreviewUrls[index] ? (
                              <img src={pendingPreviewUrls[index]} alt={item.name || 'Attachment preview'} className={`h-full w-full object-cover ${item.isSpoiler ? 'scale-110 blur-lg' : ''}`} />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2"><FileText size={28} className="text-[var(--theme-base)]" /><span className="w-full truncate text-center text-[9px] text-gray-400">{item.name}</span></div>
                            )}
                            <button type="button" onClick={() => props.removePendingFile(index)} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" aria-label={`Remove ${item.name}`}><X size={12}/></button>
                            {(item.type === 'image' || item.type === 'video') && item.file && !item.gifUrl && (
                              <button
                                type="button"
                                onClick={() => openPendingMediaEditor(item, index)}
                                className="absolute bottom-5 right-1 rounded-full bg-black/75 p-1.5 text-white shadow-lg hover:bg-[var(--theme-base)]"
                                aria-label={`Edit ${item.name}`}
                                title="Crop or edit"
                              >
                                <SlidersHorizontal size={12} />
                              </button>
                            )}
                            {(item.type === 'image' || item.gifUrl) && (
                              <button
                                type="button"
                                onClick={() => props.togglePendingFileSpoiler(index)}
                                className={`absolute left-1 top-1 rounded-full p-1.5 text-white shadow ${item.isSpoiler ? 'bg-amber-500' : 'bg-black/70'}`}
                                aria-pressed={Boolean(item.isSpoiler)}
                                aria-label={item.isSpoiler ? `Remove spoiler from ${item.name}` : `Mark ${item.name} as spoiler`}
                                title={item.isSpoiler ? 'Remove image spoiler' : 'Mark image as spoiler'}
                              >
                                <EyeOff size={12} />
                              </button>
                            )}
                            {item.isSpoiler && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-white drop-shadow">Spoiler</span>
                            )}
                            {props.isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Loader2 size={24} className="animate-spin text-white" /></div>}
                            {item.type !== 'audio' && <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 px-1 py-0.5 text-[9px] text-white">{item.type === 'video' ? 'VIDEO • ' : item.gifUrl ? 'GIF • ' : item.type === 'image' ? 'IMAGE • ' : ''}{formatPendingFileSize(item.size)}</span>}
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

                      {editingMessage && (editingMessage.content || props.editContent) && (
                        <button
                          type="button"
                          onClick={() => props.handleToggleMessageSpoiler(editingMessage)}
                          className={`mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold md:hidden ${editingMessage?.is_spoiler ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-gray-300'}`}
                          aria-pressed={Boolean(editingMessage?.is_spoiler)}
                        >
                          {editingMessage?.is_spoiler ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                          {editingMessage?.is_spoiler ? 'Remove spoiler' : 'Mark as spoiler'}
                        </button>
                      )}

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
                          className="rounded-full border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] px-3 py-1.5 text-xs font-bold text-[var(--chat-control-text)]"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                  {voiceRecorderState.status !== 'idle' && (
                    <div className="mx-2 mb-2 flex h-14 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 shadow-lg md:mx-4" role="status" aria-live="polite">
                      <button type="button" onClick={() => finishVoiceRecording(true)} disabled={voiceRecorderState.status === 'stopping'} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50" aria-label="Discard voice recording">
                        <Trash2 size={17} />
                      </button>
                      <span className="relative h-2 w-2 shrink-0 rounded-full bg-rose-500">
                        {voiceRecorderState.status === 'recording' && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500" aria-hidden="true" />}
                      </span>
                      <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-label="Live microphone level">
                        {voiceLevels.slice(-20).map((level, index) => (
                          <span
                            key={index}
                            className="min-w-[2px] flex-1 rounded-full bg-[var(--theme-base)] transition-[height] duration-75"
                            style={{ height: `${Math.max(18, level * 100)}%`, opacity: 0.35 + level * 0.65 }}
                          />
                        ))}
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-gray-400">{formatVoiceMessageDuration(voiceRecorderState.elapsed)}</span>
                      <button type="button" onClick={() => finishVoiceRecording(false)} disabled={voiceRecorderState.status === 'stopping'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--theme-base)] text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50" aria-label="Stop and preview voice recording">
                        {voiceRecorderState.status === 'stopping' ? <Loader2 size={17} className="animate-spin" /> : <Square size={12} fill="currentColor" />}
                      </button>
                      <span className="sr-only">{voiceRecorderState.status === 'stopping' ? 'Preparing voice message' : 'Recording voice message'}</span>
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
                            <ImagePlus size={18} className="text-indigo-400" /> Upload Media
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAttachMenu(false); setTimeout(() => cameraPhotoInputRef.current?.click(), 0); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-main)] font-medium hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer">
                            <Camera size={18} className="text-sky-400" /> Take a Photo
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAttachMenu(false); setTimeout(() => cameraVideoInputRef.current?.click(), 0); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-main)] font-medium hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer">
                            <Video size={18} className="text-violet-400" /> Record a Video
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); startVoiceRecording(); }} disabled={voiceRecorderState.status !== 'idle'} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-main)] font-medium hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                            <Mic size={18} className="text-rose-400" /> Record Voice
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
                    <input type="file" accept="image/*,video/*,.gif" multiple ref={props.fileInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="image/*" capture="environment" ref={cameraPhotoInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="video/*" capture="environment" ref={cameraVideoInputRef} onChange={props.handleFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
                    <input type="file" accept="*/*" multiple ref={props.genericFileInputRef} onChange={props.handleGenericFileUpload} onClick={(e) => { e.currentTarget.value = '' }} className="hidden" />
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
                    <button
                      type="button"
                      onClick={() => props.setComposerSpoiler(!props.composerSpoiler)}
                      disabled={props.isUploading || Boolean(props.editingMessageId)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${props.composerSpoiler ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500 hover:bg-[var(--bg-element)] hover:text-[var(--theme-base)]'}`}
                      aria-pressed={Boolean(props.composerSpoiler)}
                      aria-label={props.composerSpoiler ? 'Send text normally' : 'Send text as spoiler'}
                      title={props.composerSpoiler ? 'Text will be hidden as a spoiler' : 'Mark text as spoiler'}
                    >
                      <EyeOff size={18} aria-hidden="true" />
                    </button>
                    <button type="submit" disabled={props.isUploading} className="flex h-[44px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--chat-control-border)] bg-[var(--chat-control-bg)] text-[var(--chat-control-text)] transition-all hover:brightness-110 disabled:opacity-50">
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
      {mediaEditorTarget && (
        <MediaEditorModal
          file={mediaEditorTarget.file}
          title={mediaEditorTarget.type === 'video' ? 'Crop video' : 'Edit image'}
          onCancel={() => setMediaEditorTarget(null)}
          onSave={savePendingMediaEdit}
        />
      )}
    </main>
  )
}
